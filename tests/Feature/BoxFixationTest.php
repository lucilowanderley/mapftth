<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BoxFixationTest extends TestCase
{
    use RefreshDatabase;

    private function project(User $user): Project
    {
        return $user->projects()->create(['name' => 'Rede Centro', 'center_lat' => -2.44, 'center_lng' => -54.71]);
    }

    public function test_box_is_created_and_cto_is_fixed_inside_it(): void
    {
        $user = User::factory()->create();
        $project = $this->project($user);
        $this->actingAs($user);

        $box = $this->postJson("/api/projects/{$project->id}/nodes", [
            'type' => 'box', 'lat' => 0, 'lng' => 0,
            'attributes' => ['box_kind' => 'wall', 'box_place' => 'internal', 'address' => 'Rua A, 10'],
        ])->assertCreated()->assertJsonPath('name', 'CX-1')->assertJsonPath('attributes.box_kind', 'wall');

        $this->postJson("/api/projects/{$project->id}/nodes", [
            'type' => 'cto', 'lat' => 0.00005, 'lng' => 0.00005,
            'attributes' => ['fixed_kind' => 'box', 'fixed_id' => $box->json('id')],
        ])->assertCreated()->assertJsonPath('attributes.fixed_kind', 'box')->assertJsonPath('attributes.fixed_id', $box->json('id'));
    }

    public function test_invalid_fixation_and_box_kind_are_rejected(): void
    {
        $user = User::factory()->create();
        $project = $this->project($user);
        $this->actingAs($user);

        $this->postJson("/api/projects/{$project->id}/nodes", [
            'type' => 'cto', 'lat' => 0, 'lng' => 0, 'attributes' => ['fixed_kind' => 'teto'],
        ])->assertUnprocessable();
        $this->postJson("/api/projects/{$project->id}/nodes", [
            'type' => 'box', 'lat' => 0, 'lng' => 0, 'attributes' => ['box_kind' => 'aerea'],
        ])->assertUnprocessable();
    }

    public function test_anchored_object_moves_only_its_own_cable_ends(): void
    {
        $user = User::factory()->create();
        $project = $this->project($user);
        $this->actingAs($user);

        $pole = $this->postJson("/api/projects/{$project->id}/nodes", ['type' => 'pole', 'lat' => 0, 'lng' => 0])->json();
        $cto = $this->postJson("/api/projects/{$project->id}/nodes", [
            'type' => 'cto', 'lat' => 0, 'lng' => 0,
            'attributes' => ['fixed_kind' => 'pole', 'fixed_id' => $pole['id'], 'anchored' => true],
        ])->assertCreated()->assertJsonPath('attributes.anchored', true)->json();
        $through = $this->postJson("/api/projects/{$project->id}/cables", [
            'name' => 'Passa', 'fiber_count' => 12, 'category' => 'distribution', 'path' => [[0, -0.001], [0, 0], [0, 0.001]],
        ])->json();
        $drop = $this->postJson("/api/projects/{$project->id}/cables", [
            'name' => 'Sai', 'fiber_count' => 12, 'category' => 'distribution', 'path' => [[0, 0], [0.001, 0.001]], 'from_node_id' => $cto['id'],
        ])->json();

        // Desancorar: a CTO sai de cima do poste; o cabo que passa pelo poste fica nele.
        $this->putJson("/api/nodes/{$cto['id']}", [
            'lat' => 0.00005, 'lng' => 0.00005, 'ends_only' => true,
            'attributes' => ['fixed_kind' => 'pole', 'fixed_id' => $pole['id'], 'anchored' => false],
        ])->assertOk()->assertJsonPath('node.attributes.anchored', false)->assertJsonCount(1, 'cables');

        $this->assertEquals([0, 0], array_map('floatval', \App\Models\Cable::find($through['id'])->path[1]));
        $this->assertEquals([0.00005, 0.00005], array_map('floatval', \App\Models\Cable::find($drop['id'])->path[0]));

        $this->putJson("/api/nodes/{$cto['id']}", ['attributes' => ['anchored' => 'talvez']])->assertUnprocessable();
    }

    public function test_migration_snaps_loose_fixed_objects_to_their_pole(): void
    {
        $user = User::factory()->create();
        $project = $this->project($user);
        $pole = $project->nodes()->create(['type' => 'pole', 'name' => 'P-1', 'lat' => 0, 'lng' => 0, 'status' => 'planned']);
        $loose = $project->nodes()->create(['type' => 'cto', 'name' => 'CTO-1', 'lat' => 0.0001, 'lng' => 0.0001, 'status' => 'planned',
            'attributes' => ['fixed_kind' => 'pole', 'fixed_id' => $pole->id, 'anchored' => false]]);
        $wall = $project->nodes()->create(['type' => 'cto', 'name' => 'CTO-2', 'lat' => 0.0002, 'lng' => 0, 'status' => 'planned',
            'attributes' => ['fixed_kind' => 'wall', 'address' => 'Rua A']]);
        $cable = $project->cables()->create(['name' => 'C1', 'category' => 'distribution', 'fiber_count' => 12,
            'path' => [[0.001, 0.001], [0.0001, 0.0001]], 'to_node_id' => $loose->id]);
        $through = $project->cables()->create(['name' => 'C2', 'category' => 'distribution', 'fiber_count' => 12,
            'path' => [[0.001, 0], [0.0001, 0.0001], [-0.001, 0]]]);

        (require database_path('migrations/2026_11_04_000100_snap_fixed_objects_to_host.php'))->up();

        $loose->refresh();
        $this->assertSame([0.0, 0.0], [$loose->lat, $loose->lng]);
        $this->assertArrayNotHasKey('anchored', $loose->getAttribute('attributes'));
        $this->assertEquals([0, 0], $cable->refresh()->path[1]);
        $this->assertEquals([0.0001, 0.0001], $through->refresh()->path[1]);
        $this->assertSame(0.0002, $wall->refresh()->lat);
    }
}
