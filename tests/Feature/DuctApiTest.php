<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\User;
use App\Services\KmlService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DuctApiTest extends TestCase
{
    use RefreshDatabase;

    private function project(User $user): Project
    {
        return $user->projects()->create(['name' => 'Rede Dutos', 'center_lat' => -6.48, 'center_lng' => -35.43]);
    }

    public function test_duct_crud_with_cables_inside(): void
    {
        $user = User::factory()->create();
        $project = $this->project($user);
        $a = $project->nodes()->create(['type' => 'box', 'name' => 'CX-1', 'lat' => -6.48, 'lng' => -35.43]);
        $b = $project->nodes()->create(['type' => 'pop', 'name' => 'POP', 'lat' => -6.481, 'lng' => -35.43]);
        $cable = $project->cables()->create(['name' => 'Cabo 12FO', 'path' => [[-6.48, -35.43], [-6.481, -35.43]]]);

        $duct = $this->actingAs($user)->postJson("/api/projects/{$project->id}/ducts", [
            'path' => [[-6.48, -35.43], [-6.481, -35.43]],
            'from_node_id' => $a->id,
            'to_node_id' => $b->id,
            'material' => 'pead',
            'diameter_mm' => 40,
            'subducts' => 3,
        ])->assertCreated()
            ->assertJsonPath('name', 'Duto 1')
            ->assertJsonPath('subducts', 3)
            ->json();
        $this->assertEqualsWithDelta(110.6, $duct['length_m'], 1);

        $this->putJson("/api/ducts/{$duct['id']}", ['cable_ids' => [$cable->id, $cable->id]])
            ->assertOk()
            ->assertJsonPath('cable_ids', [$cable->id]);

        $this->getJson("/api/projects/{$project->id}")->assertOk()->assertJsonPath('ducts.0.id', $duct['id']);

        // Mover a caixa leva a ponta do duto junto.
        $moved = $this->putJson("/api/nodes/{$a->id}", ['lat' => -6.4795, 'lng' => -35.4301])->assertOk()->json('ducts');
        $this->assertSame([-6.4795, -35.4301], $moved[0]['path'][0]);

        // Excluir o cabo tira ele do duto.
        $this->deleteJson("/api/cables/{$cable->id}")->assertOk();
        $this->assertSame([], $project->ducts()->first()->cable_ids);

        $this->deleteJson("/api/ducts/{$duct['id']}")->assertNoContent();
        $this->assertSame(0, $project->ducts()->count());
    }

    public function test_cable_of_another_project_cannot_go_into_duct(): void
    {
        $user = User::factory()->create();
        $project = $this->project($user);
        $other = $this->project($user);
        $cable = $other->cables()->create(['name' => 'X', 'path' => [[0, 0], [0, 0.001]]]);

        $this->actingAs($user)->postJson("/api/projects/{$project->id}/ducts", [
            'path' => [[0, 0], [0, 0.001]],
            'cable_ids' => [$cable->id],
        ])->assertUnprocessable();
    }

    public function test_viewer_cannot_create_duct(): void
    {
        $owner = User::factory()->create();
        $viewer = User::factory()->create();
        $project = $this->project($owner);
        $project->members()->create(['user_id' => $viewer->id, 'role' => 'viewer']);

        $this->actingAs($viewer)->postJson("/api/projects/{$project->id}/ducts", ['path' => [[0, 0], [0, 0.001]]])->assertForbidden();
    }

    public function test_kmz_round_trip_keeps_ducts(): void
    {
        $user = User::factory()->create();
        $project = $this->project($user);
        $project->ducts()->create(['name' => 'Duto Av. Brasil', 'material' => 'pvc', 'diameter_mm' => 100, 'path' => [[-6.48, -35.43], [-6.481, -35.43]]]);

        $kml = app(KmlService::class)->export($project);
        $this->assertStringContainsString('<Folder><name>Dutos</name>', $kml);

        $copy = $this->project($user);
        $result = app(KmlService::class)->import($copy, $kml);
        $this->assertSame(1, $result['ducts']);
        $this->assertSame(0, $result['cables']);
        $d = $copy->ducts()->first();
        $this->assertSame('Duto Av. Brasil', $d->name);
        $this->assertSame('pvc', $d->material);
        $this->assertSame(100, $d->diameter_mm);
    }
}
