<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Tests\TestCase;
use ZipArchive;

class NetworkApiTest extends TestCase
{
    use RefreshDatabase;

    private function project(User $user): Project
    {
        return $user->projects()->create(['name' => 'Rede Centro', 'center_lat' => -2.44, 'center_lng' => -54.71]);
    }

    public function test_guests_are_redirected_to_login(): void
    {
        $this->get('/app')->assertRedirect('/login');
        $this->getJson('/api/projects')->assertUnauthorized();
    }

    public function test_user_can_register_and_open_the_app(): void
    {
        $this->post('/register', [
            'name' => 'Ana',
            'email' => 'ana@example.com',
            'password' => 'segredo123',
            'password_confirmation' => 'segredo123',
        ])->assertRedirect('/app');

        $this->get('/app')->assertOk()->assertSee('id="root"', false);
    }

    public function test_projects_are_private_to_their_owner(): void
    {
        $owner = User::factory()->create();
        $project = $this->project($owner);

        $this->actingAs(User::factory()->create())
            ->getJson("/api/projects/{$project->id}")
            ->assertNotFound();

        $this->actingAs($owner)
            ->getJson('/api/projects')
            ->assertOk()
            ->assertJsonPath('0.name', 'Rede Centro');
    }

    public function test_project_returns_default_settings(): void
    {
        $user = User::factory()->create();
        $project = $this->project($user);

        $this->actingAs($user)->getJson("/api/projects/{$project->id}")
            ->assertOk()
            ->assertJsonPath('settings.fiber_loss_db_km', 0.35)
            ->assertJsonPath('settings.olt_tx_dbm', 5);
    }

    public function test_nodes_get_sequential_names_and_cables_compute_length(): void
    {
        $user = User::factory()->create();
        $project = $this->project($user);
        $this->actingAs($user);

        $a = $this->postJson("/api/projects/{$project->id}/nodes", ['type' => 'cto', 'lat' => -2.44, 'lng' => -54.71])
            ->assertCreated()->assertJsonPath('name', 'CTO-1')->json();
        $b = $this->postJson("/api/projects/{$project->id}/nodes", ['type' => 'cto', 'lat' => -2.441, 'lng' => -54.71])
            ->assertCreated()->assertJsonPath('name', 'CTO-2')->json();

        $cable = $this->postJson("/api/projects/{$project->id}/cables", [
            'fiber_count' => 12,
            'path' => [[-2.44, -54.71], [-2.441, -54.71]],
            'from_node_id' => $a['id'],
            'to_node_id' => $b['id'],
        ])->assertCreated()->json();

        // 0,001° de latitude ≈ 111 m
        $this->assertEqualsWithDelta(111.2, $cable['length_m'], 0.5);
        $this->assertSame('Cabo 12FO', $cable['name']);
    }

    public function test_moving_a_box_moves_the_cable_ends(): void
    {
        $user = User::factory()->create();
        $project = $this->project($user);
        $a = $project->nodes()->create(['type' => 'pop', 'name' => 'POP', 'lat' => -2.44, 'lng' => -54.71]);
        $b = $project->nodes()->create(['type' => 'cto', 'name' => 'CTO', 'lat' => -2.441, 'lng' => -54.71]);
        $cable = $project->cables()->create([
            'name' => 'C1', 'path' => [[-2.44, -54.71], [-2.4405, -54.7105], [-2.441, -54.71]],
            'from_node_id' => $a->id, 'to_node_id' => $b->id,
        ]);

        $this->actingAs($user)
            ->putJson("/api/nodes/{$b->id}", ['lat' => -2.442, 'lng' => -54.712])
            ->assertOk()
            ->assertJsonPath('cables.0.path.2', [-2.442, -54.712]);

        $this->assertSame([-2.442, -54.712], $cable->fresh()->path[2]);
        $this->assertSame([-2.44, -54.71], $cable->fresh()->path[0]);
    }

    public function test_deleting_a_cable_removes_its_fusions(): void
    {
        $user = User::factory()->create();
        $project = $this->project($user);
        $cto = $project->nodes()->create(['type' => 'cto', 'name' => 'CTO', 'lat' => 0, 'lng' => 0]);
        $cable = $project->cables()->create(['name' => 'C1', 'path' => [[0, 0], [0, 0.001]], 'from_node_id' => $cto->id]);
        $other = $project->cables()->create(['name' => 'C2', 'path' => [[0, 0], [0.001, 0]], 'from_node_id' => $cto->id]);
        $cto->update(['diagram' => [
            'components' => [['id' => 'ks1', 'kind' => 'splitter', 'model' => '1x8-rf', 'x' => 0, 'y' => 0]],
            'cablePos' => [],
            'connections' => [
                ['id' => 'x1', 'a' => ['c' => "c{$cable->id}", 'p' => 'f1'], 'b' => ['c' => 'ks1', 'p' => 'in']],
                ['id' => 'x2', 'a' => ['c' => 'ks1', 'p' => 'o1'], 'b' => ['c' => "c{$other->id}", 'p' => 'f1']],
            ],
        ]]);

        $this->actingAs($user)->deleteJson("/api/cables/{$cable->id}")->assertOk();

        $connections = $cto->fresh()->diagram['connections'];
        $this->assertCount(1, $connections);
        $this->assertSame('x2', $connections[0]['id']);
    }

    public function test_reducing_fiber_count_prunes_extra_fibers(): void
    {
        $user = User::factory()->create();
        $project = $this->project($user);
        $cto = $project->nodes()->create(['type' => 'cto', 'name' => 'CTO', 'lat' => 0, 'lng' => 0]);
        $cable = $project->cables()->create(['name' => 'C1', 'fiber_count' => 12, 'path' => [[0, 0], [0, 0.001]], 'from_node_id' => $cto->id]);
        $cto->update(['diagram' => ['components' => [], 'cablePos' => [], 'connections' => [
            ['id' => 'x1', 'a' => ['c' => "c{$cable->id}", 'p' => 'f2'], 'b' => ['c' => 'c999', 'p' => 'f2']],
            ['id' => 'x2', 'a' => ['c' => "c{$cable->id}", 'p' => 'f10'], 'b' => ['c' => 'c999', 'p' => 'f10']],
        ]]]);

        $this->actingAs($user)->putJson("/api/cables/{$cable->id}", ['fiber_count' => 6])->assertOk();

        $this->assertSame(['x1'], array_column($cto->fresh()->diagram['connections'], 'id'));
    }

    public function test_kmz_import_and_export(): void
    {
        $user = User::factory()->create();
        $project = $this->project($user);
        $kml = <<<'KML'
<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
  <Folder><name>CTOs</name>
    <Placemark><name>CX-01</name><Point><coordinates>-54.7100,-2.4400,0</coordinates></Point></Placemark>
  </Folder>
  <Folder><name>CEO</name>
    <Placemark><name>Emenda 1</name><Point><coordinates>-54.7110,-2.4410,0</coordinates></Point></Placemark>
  </Folder>
  <Placemark><name>Cabo 24FO tronco</name><LineString><coordinates>-54.71101,-2.44101,0 -54.7105,-2.4405,0 -54.71,-2.44,0</coordinates></LineString></Placemark>
</Document></kml>
KML;
        $tmp = tempnam(sys_get_temp_dir(), 'kmz');
        $zip = new ZipArchive;
        $zip->open($tmp, ZipArchive::OVERWRITE);
        $zip->addFromString('doc.kml', $kml);
        $zip->close();

        $this->actingAs($user)
            ->post("/api/projects/{$project->id}/import", ['file' => new UploadedFile($tmp, 'rede.kmz', null, null, true)], ['Accept' => 'application/json'])
            ->assertOk()
            ->assertJson(['nodes' => 2, 'cables' => 1]);

        $this->assertSame(['cto', 'ceo'], $project->nodes()->orderBy('id')->pluck('type')->all());
        $cable = $project->cables()->first();
        $this->assertSame(24, $cable->fiber_count);
        $this->assertSame('backbone', $cable->category);
        $this->assertNotNull($cable->from_node_id);
        $this->assertNotNull($cable->to_node_id);

        $response = $this->get("/api/projects/{$project->id}/export")->assertOk();
        $file = $response->baseResponse->getFile()->getPathname();
        $zip = new ZipArchive;
        $zip->open($file);
        $exported = $zip->getFromName('doc.kml');
        $zip->close();
        $this->assertStringContainsString('<name>CX-01</name>', $exported);
        $this->assertStringContainsString('Cabos backbone', $exported);
    }
}
