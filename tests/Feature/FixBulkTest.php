<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class FixBulkTest extends TestCase
{
    use RefreshDatabase;

    private function project(User $user): Project
    {
        return $user->projects()->create(['name' => 'Rede Centro', 'center_lat' => -2.44, 'center_lng' => -54.71]);
    }

    public function test_bulk_fix_moves_objects_with_their_cable_ends_and_can_be_undone(): void
    {
        $user = User::factory()->create();
        $project = $this->project($user);
        $this->actingAs($user);
        $url = "/api/projects/{$project->id}";

        $pole = $this->postJson("$url/nodes", ['type' => 'pole', 'lat' => 0, 'lng' => 0])->json();
        $other = $this->postJson("$url/nodes", ['type' => 'pole', 'lat' => 0.001, 'lng' => 0])->json();
        $cto = $this->postJson("$url/nodes", [
            'type' => 'cto', 'lat' => 0.00003, 'lng' => 0, 'attributes' => ['ports' => 8, 'anchored' => true],
        ])->json();
        // Cabo ligado à CTO (a ponta acompanha) e cabo que só passa perto (não muda).
        $drop = $this->postJson("$url/cables", [
            'name' => 'Drop', 'category' => 'distribution', 'fiber_count' => 12, 'fibers_per_tube' => 12,
            'path' => [[0.00003, 0], [0.0005, 0.0005]], 'from_node_id' => $cto['id'],
        ])->json();
        $pass = $this->postJson("$url/cables", [
            'name' => 'Passa', 'category' => 'distribution', 'fiber_count' => 12, 'fibers_per_tube' => 12,
            'path' => [[0.00003, 0], [0.001, 0]],
            'slacks' => [['id' => 'r1', 'lat' => 0.00095, 'lng' => 0, 'length_m' => 15, 'kind' => 'aerial', 'notes' => 'x']],
        ])->json();

        $r = $this->postJson("$url/fix-bulk", [
            'label' => '1 CTO no poste',
            'nodes' => [['id' => $cto['id'], 'lat' => 0, 'lng' => 0, 'fix' => ['fixed_kind' => 'pole', 'fixed_id' => $pole['id']]]],
            'cables' => [
                ['id' => $pass['id'], 'path' => [[0, 0], [0.001, 0]], 'slacks' => [['id' => 'r1', 'lat' => 0.001, 'lng' => 0, 'fixed_kind' => 'pole', 'fixed_id' => $other['id']]]],
            ],
        ])->assertOk();

        $r->assertJsonPath('nodes.0.attributes.fixed_kind', 'pole')
            ->assertJsonPath('nodes.0.attributes.fixed_id', $pole['id'])
            ->assertJsonPath('nodes.0.attributes.ports', 8)
            ->assertJsonMissingPath('nodes.0.attributes.anchored');
        $this->assertDatabaseHas('network_nodes', ['id' => $cto['id'], 'lat' => 0, 'lng' => 0]);
        $cables = collect($r->json('cables'))->keyBy('id');
        $this->assertEquals([0, 0], $cables[$drop['id']]['path'][0]);
        $this->assertEquals([[0, 0], [0.001, 0]], $cables[$pass['id']]['path']);
        $slack = $cables[$pass['id']]['slacks'][0];
        $this->assertSame('pole', $slack['fixed_kind']);
        $this->assertSame($other['id'], $slack['fixed_id']);
        $this->assertSame('x', $slack['notes']);
        $this->assertSame(15, $slack['length_m']);

        // Desfazer: volta a posição e a fixação.
        $this->postJson("$url/fix-bulk", [
            'nodes' => [['id' => $cto['id'], 'lat' => 0.00003, 'lng' => 0, 'fix' => ['fixed_kind' => null, 'fixed_id' => null]]],
        ])->assertOk()->assertJsonPath('nodes.0.attributes.fixed_kind', null)->assertJsonPath('cables.0.path.0', [0.00003, 0]);

        $this->assertDatabaseHas('activity_logs', ['project_id' => $project->id, 'action' => 'bulk_fixed']);
    }

    public function test_bulk_fix_rejects_other_projects_objects_and_viewers(): void
    {
        $user = User::factory()->create();
        $project = $this->project($user);
        $foreign = $this->project(User::factory()->create());
        $node = $foreign->nodes()->create(['type' => 'cto', 'name' => 'X', 'lat' => 0, 'lng' => 0, 'status' => 'planned']);
        $this->actingAs($user);

        $this->postJson("/api/projects/{$project->id}/fix-bulk", [
            'nodes' => [['id' => $node->id, 'lat' => 0, 'lng' => 0, 'fix' => ['fixed_kind' => 'pole', 'fixed_id' => 1]]],
        ])->assertUnprocessable();
        $this->postJson("/api/projects/{$project->id}/fix-bulk", [])->assertUnprocessable();
        $this->postJson("/api/projects/{$foreign->id}/fix-bulk", [
            'nodes' => [['id' => $node->id, 'lat' => 0, 'lng' => 0, 'fix' => ['fixed_kind' => 'pole']]],
        ])->assertNotFound();
    }
}
