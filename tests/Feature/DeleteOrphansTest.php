<?php

namespace Tests\Feature;

use App\Models\Cable;
use App\Models\NetworkNode;
use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Excluir um objeto não exclui o que estava fixado nele: os fixados ficam sem objeto pai. */
class DeleteOrphansTest extends TestCase
{
    use RefreshDatabase;

    private function project(User $user): Project
    {
        return $user->projects()->create(['name' => 'Rede Centro', 'center_lat' => -2.44, 'center_lng' => -54.71]);
    }

    public function test_deleting_pole_keeps_fixed_objects_without_parent(): void
    {
        $user = User::factory()->create();
        $project = $this->project($user);
        $this->actingAs($user);

        $pole = $project->nodes()->create(['type' => 'pole', 'name' => 'P-1', 'lat' => 0, 'lng' => 0]);
        $other = $project->nodes()->create(['type' => 'pole', 'name' => 'P-2', 'lat' => 0.001, 'lng' => 0]);
        $cto = $project->nodes()->create(['type' => 'cto', 'name' => 'CTO-1', 'lat' => 0, 'lng' => 0, 'attributes' => ['fixed_kind' => 'pole', 'fixed_id' => $pole->id, 'address' => 'Rua A']]);
        $cam = $project->nodes()->create(['type' => 'camera', 'name' => 'CAM-1', 'lat' => 0, 'lng' => 0, 'attributes' => ['mount_kind' => 'pole', 'mount_id' => $pole->id]]);
        $keep = $project->nodes()->create(['type' => 'cto', 'name' => 'CTO-2', 'lat' => 0.001, 'lng' => 0, 'attributes' => ['fixed_kind' => 'pole', 'fixed_id' => $other->id]]);
        $cable = $project->cables()->create([
            'name' => 'CB-1', 'fiber_count' => 12, 'path' => [[0, 0], [0.001, 0]],
            'slacks' => [
                ['id' => 'a', 'lat' => 0, 'lng' => 0, 'length_m' => 10, 'kind' => 'technical', 'fixed_kind' => 'pole', 'fixed_id' => $pole->id],
                ['id' => 'b', 'lat' => 0.001, 'lng' => 0, 'length_m' => 10, 'kind' => 'technical', 'fixed_kind' => 'pole', 'fixed_id' => $other->id],
            ],
        ]);

        $res = $this->deleteJson("/api/nodes/{$pole->id}")->assertOk();
        $this->assertEqualsCanonicalizing([$cto->id, $cam->id], array_column($res->json('nodes'), 'id'));
        $this->assertSame([$cable->id], array_column($res->json('cables'), 'id'));

        $this->assertNull(NetworkNode::find($pole->id));
        $cto->refresh();
        $cam->refresh();
        $this->assertNull($cto->attributes['fixed_kind']);
        $this->assertNull($cto->attributes['fixed_id']);
        $this->assertSame('Rua A', $cto->attributes['address']);
        $this->assertNull($cam->attributes['mount_id']);
        $this->assertNull($cam->attributes['mount_kind']);
        $this->assertSame($other->id, $keep->fresh()->attributes['fixed_id']);

        $slacks = Cable::find($cable->id)->slacks;
        $this->assertSame('cable', $slacks[0]['fixed_kind']);
        $this->assertNull($slacks[0]['fixed_id']);
        $this->assertSame($other->id, $slacks[1]['fixed_id']);
    }

    public function test_deleting_cable_keeps_cto_fixed_on_it(): void
    {
        $user = User::factory()->create();
        $project = $this->project($user);
        $this->actingAs($user);

        $cable = $project->cables()->create(['name' => 'CB-1', 'fiber_count' => 12, 'path' => [[0, 0], [0.001, 0]]]);
        $cto = $project->nodes()->create(['type' => 'cto', 'name' => 'CTO-1', 'lat' => 0.0005, 'lng' => 0, 'attributes' => ['fixed_kind' => 'cable', 'fixed_id' => $cable->id]]);

        $res = $this->deleteJson("/api/cables/{$cable->id}")->assertOk();
        $this->assertContains($cto->id, array_column($res->json('nodes'), 'id'));
        $this->assertNull(Cable::find($cable->id));
        $cto->refresh();
        $this->assertNull($cto->attributes['fixed_kind']);
        $this->assertNull($cto->attributes['fixed_id']);
    }
}
