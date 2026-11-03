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

    public function test_condo_is_created_with_attributes_and_accepts_cable_split(): void
    {
        $user = User::factory()->create();
        $project = $this->project($user);
        $this->actingAs($user);

        $condo = $this->postJson("/api/projects/{$project->id}/nodes", [
            'type' => 'condo', 'lat' => 0, 'lng' => 0.001,
            'attributes' => ['condo_kind' => 'buildings', 'units' => 120, 'blocks' => 3, 'floors' => 10],
        ])->assertCreated()->assertJsonPath('name', 'Cond-1')->assertJsonPath('attributes.units', 120)->json();

        $pop = $project->nodes()->create(['type' => 'pop', 'name' => 'POP', 'lat' => 0, 'lng' => 0]);
        $cto = $project->nodes()->create(['type' => 'cto', 'name' => 'CTO', 'lat' => 0, 'lng' => 0.002]);
        $cable = $project->cables()->create([
            'name' => 'Lance', 'fiber_count' => 12,
            'path' => [[0, 0], [0, 0.002]], 'from_node_id' => $pop->id, 'to_node_id' => $cto->id,
        ]);
        $this->postJson("/api/cables/{$cable->id}/split", [
            'path' => [[0, 0], [0, 0.001], [0, 0.002]],
            'cuts' => [['index' => 1, 'node_id' => $condo['id']]],
        ])->assertOk()->assertJsonCount(2, 'cables');
    }

    public function test_datacenter_is_created_and_keeps_rack_diagram(): void
    {
        $user = User::factory()->create();
        $project = $this->project($user);
        $this->actingAs($user);

        $dc = $this->postJson("/api/projects/{$project->id}/nodes", ['type' => 'dc', 'lat' => 0, 'lng' => 0])
            ->assertCreated()->assertJsonPath('name', 'DC-1')->json();

        $diagram = ['components' => [[
            'id' => 'r1', 'kind' => 'rack', 'name' => 'DC1.1A-AJ05', 'mount' => 'floor', 'units' => 44, 'x' => 0, 'y' => 0,
            'loc' => ['site' => 'DC1', 'floor' => '1', 'room' => 'A', 'row' => 'AJ', 'pos' => 5],
        ]], 'connections' => []];
        $this->putJson("/api/nodes/{$dc['id']}", ['diagram' => $diagram])
            ->assertOk()
            ->assertJsonPath('node.diagram.components.0.loc.row', 'AJ');
    }

    public function test_tower_is_created_with_radios(): void
    {
        $user = User::factory()->create();
        $project = $this->project($user);
        $this->actingAs($user);

        $this->postJson("/api/projects/{$project->id}/nodes", [
            'type' => 'tower', 'lat' => 0, 'lng' => 0,
            'attributes' => ['tower_kind' => 'self', 'height_m' => 42, 'radios' => [['id' => 'r1', 'kind' => 'ptp', 'freq_ghz' => 5.8, 'azimuth' => 90]]],
        ])->assertCreated()
            ->assertJsonPath('name', 'TR-1')
            ->assertJsonPath('attributes.height_m', 42)
            ->assertJsonPath('attributes.radios.0.freq_ghz', 5.8);
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

    public function test_moving_a_pole_moves_cables_routed_through_it(): void
    {
        $user = User::factory()->create();
        $project = $this->project($user);
        $pole = $project->nodes()->create(['type' => 'pole', 'name' => 'P-1', 'lat' => -2.4405, 'lng' => -54.7105]);
        $cable = $project->cables()->create([
            'name' => 'C1', 'path' => [[-2.44, -54.71], [-2.4405, -54.7105], [-2.441, -54.71]],
        ]);
        $other = $project->cables()->create([
            'name' => 'C2', 'path' => [[-2.43, -54.70], [-2.431, -54.701]],
        ]);
        $before = $cable->length_m;

        $this->actingAs($user)
            ->putJson("/api/nodes/{$pole->id}", ['lat' => -2.4406, 'lng' => -54.7107])
            ->assertOk()
            ->assertJsonCount(1, 'cables')
            ->assertJsonPath('cables.0.path.1', [-2.4406, -54.7107]);

        $this->assertNotEquals($before, $cable->fresh()->length_m);
        $this->assertSame([-2.43, -54.70], $other->fresh()->path[0]);
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

    public function test_split_cable_at_boxes_creates_segments_with_pass_through(): void
    {
        $user = User::factory()->create();
        $project = $this->project($user);
        $pop = $project->nodes()->create(['type' => 'pop', 'name' => 'POP', 'lat' => 0, 'lng' => 0]);
        $cto1 = $project->nodes()->create(['type' => 'cto', 'name' => 'CTO-1', 'lat' => 0, 'lng' => 0.001]);
        $cto2 = $project->nodes()->create(['type' => 'cto', 'name' => 'CTO-2', 'lat' => 0, 'lng' => 0.002]);
        $end = $project->nodes()->create(['type' => 'ceo', 'name' => 'CEO', 'lat' => 0, 'lng' => 0.003]);
        $cable = $project->cables()->create([
            'name' => 'Lance', 'fiber_count' => 4, 'slack_m' => 20,
            'path' => [[0, 0], [0.0001, 0.003]], 'from_node_id' => $pop->id, 'to_node_id' => $end->id,
        ]);
        $end->update(['diagram' => ['components' => [], 'cablePos' => ["c{$cable->id}" => ['x' => 5, 'y' => 5]], 'connections' => [
            ['id' => 'x1', 'a' => ['c' => "c{$cable->id}", 'p' => 'f1'], 'b' => ['c' => 'c999', 'p' => 'f1']],
        ]]]);

        $r = $this->actingAs($user)->postJson("/api/cables/{$cable->id}/split", [
            'path' => [[0, 0], [0.00002, 0.00099], [0.00001, 0.00201], [0.0001, 0.003]],
            'cuts' => [['index' => 2, 'node_id' => $cto2->id], ['index' => 1, 'node_id' => $cto1->id]],
        ])->assertOk()->assertJsonCount(3, 'cables');

        [$a, $b, $c] = $r->json('cables');
        $this->assertSame($cable->id, $a['id']);
        $this->assertSame('Lance · T1', $a['name']);
        $this->assertSame(['Lance · T2', 'Lance · T3'], [$b['name'], $c['name']]);
        $this->assertSame([$pop->id, $cto1->id], [$a['from_node_id'], $a['to_node_id']]);
        $this->assertSame([$cto1->id, $cto2->id], [$b['from_node_id'], $b['to_node_id']]);
        $this->assertSame([$cto2->id, $end->id], [$c['from_node_id'], $c['to_node_id']]);
        $this->assertEquals([0, 0.001], $a['path'][1]);
        $this->assertEquals([0, 0.003], $c['path'][1]);
        $this->assertSame(20, $a['slack_m']);
        $this->assertSame(0, $b['slack_m']);

        $conns = $cto1->fresh()->diagram['connections'];
        $this->assertCount(4, $conns);
        $this->assertTrue($conns[0]['pass']);
        $this->assertSame(["c{$a['id']}", "c{$b['id']}"], [$conns[0]['a']['c'], $conns[0]['b']['c']]);

        // A caixa do fim agora enxerga o último trecho.
        $diagram = $end->fresh()->diagram;
        $this->assertSame("c{$c['id']}", $diagram['connections'][0]['a']['c']);
        $this->assertArrayHasKey("c{$c['id']}", $diagram['cablePos']);
    }

    public function test_cable_line_style_is_saved_and_validated(): void
    {
        $user = User::factory()->create();
        $project = $this->project($user);
        $cable = $project->cables()->create(['name' => 'C', 'path' => [[0, 0], [0, 0.001]]]);

        $this->actingAs($user)->putJson("/api/cables/{$cable->id}", ['line_style' => 'dotted'])
            ->assertOk()->assertJsonPath('cable.line_style', 'dotted');
        $this->actingAs($user)->putJson("/api/cables/{$cable->id}", ['line_style' => 'zigzag'])->assertUnprocessable();
        $this->actingAs($user)->putJson("/api/cables/{$cable->id}", ['line_style' => null])
            ->assertOk()->assertJsonPath('cable.line_style', null);
    }

    public function test_slacks_are_saved_summed_and_split_with_the_cable(): void
    {
        $user = User::factory()->create();
        $project = $this->project($user);
        $cto = $project->nodes()->create(['type' => 'cto', 'name' => 'CTO', 'lat' => 0, 'lng' => 0.001]);
        $cable = $project->cables()->create(['name' => 'C', 'path' => [[0, 0], [0, 0.002]]]);

        $this->actingAs($user)->putJson("/api/cables/{$cable->id}", ['slacks' => [
            ['id' => 'r1', 'lat' => 0, 'lng' => 0.0003, 'length_m' => 20, 'kind' => 'aerial'],
            ['id' => 'r2', 'lat' => 0, 'lng' => 0.0018, 'length_m' => 15, 'kind' => 'underground', 'notes' => 'câmara'],
        ]])->assertOk()->assertJsonPath('cable.slack_m', 35)->assertJsonPath('cable.slacks.1.kind', 'underground');

        $this->actingAs($user)->putJson("/api/cables/{$cable->id}", ['slacks' => [
            ['id' => 'r1', 'lat' => 0, 'lng' => 0.0003, 'length_m' => 20, 'kind' => 'buried'],
        ]])->assertUnprocessable();

        $r = $this->actingAs($user)->postJson("/api/cables/{$cable->id}/split", [
            'path' => [[0, 0], [0, 0.001], [0, 0.002]],
            'cuts' => [['index' => 1, 'node_id' => $cto->id]],
        ])->assertOk();
        [$a, $b] = $r->json('cables');
        $this->assertSame(['r1'], array_column($a['slacks'], 'id'));
        $this->assertSame(20, $a['slack_m']);
        $this->assertSame(['r2'], array_column($b['slacks'], 'id'));
        $this->assertSame(15, $b['slack_m']);

        $kml = app(\App\Services\KmlService::class)->export($project);
        $this->assertStringContainsString('Reservas técnicas', $kml);
        $this->assertStringContainsString('Reserva 15 m', $kml);

        $this->actingAs($user)->putJson("/api/cables/{$a['id']}", ['slacks' => []])
            ->assertOk()->assertJsonPath('cable.slack_m', 0)->assertJsonPath('cable.slacks', null);
    }

    public function test_split_rejects_box_already_on_the_cable(): void
    {
        $user = User::factory()->create();
        $project = $this->project($user);
        $cto = $project->nodes()->create(['type' => 'cto', 'name' => 'CTO', 'lat' => 0, 'lng' => 0]);
        $cable = $project->cables()->create(['name' => 'C', 'path' => [[0, 0], [0, 0.002]], 'from_node_id' => $cto->id]);

        $this->actingAs($user)->postJson("/api/cables/{$cable->id}/split", [
            'path' => [[0, 0], [0, 0.001], [0, 0.002]],
            'cuts' => [['index' => 1, 'node_id' => $cto->id]],
        ])->assertUnprocessable();
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

    public function test_client_in_box_diagram_syncs_integration_data_to_map_client(): void
    {
        $user = User::factory()->create();
        $project = $this->project($user);
        $cto = $project->nodes()->create(['type' => 'cto', 'name' => 'CTO-1', 'lat' => -2.44, 'lng' => -54.71]);
        $client = $project->nodes()->create(['type' => 'client', 'name' => 'Maria', 'lat' => -2.4401, 'lng' => -54.7101, 'attributes' => ['address' => 'Rua A, 10']]);
        $other = $this->project($user)->nodes()->create(['type' => 'client', 'name' => 'Outro projeto', 'lat' => 0, 'lng' => 0]);

        $diagram = ['components' => [
            ['id' => 'kc1', 'kind' => 'client', 'name' => 'Maria', 'node_id' => $client->id, 'x' => 0, 'y' => 0,
                'client_code' => 'CLI-0042', 'onu_serial' => 'hwtc 1a2b3c4d', 'segment' => 'business'],
            // Cliente de outro projeto: ignorado.
            ['id' => 'kc2', 'kind' => 'client', 'name' => 'X', 'node_id' => $other->id, 'x' => 0, 'y' => 0, 'client_code' => 'NAO'],
        ], 'cablePos' => [], 'connections' => []];

        $this->actingAs($user)->putJson("/api/nodes/{$cto->id}", ['diagram' => $diagram])
            ->assertOk()
            ->assertJsonCount(1, 'clients')
            ->assertJsonPath('clients.0.attributes.onu_serial', 'HWTC1A2B3C4D');

        $client->refresh();
        $this->assertSame('CLI-0042', $client->attributes['client_code']);
        $this->assertSame('business', $client->attributes['segment']);
        $this->assertSame('Rua A, 10', $client->attributes['address']);
        $this->assertArrayNotHasKey('client_code', $other->fresh()->attributes ?? []);

        // Tipo inválido direto no cliente do mapa é recusado.
        $this->actingAs($user)->putJson("/api/nodes/{$client->id}", ['attributes' => ['segment' => 'vip']])->assertUnprocessable();
    }
}
