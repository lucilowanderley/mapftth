<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Sangria pelo editor do poste/caixa: dois trechos que terminam no poste passam para a CTO/CEO fixada nele. */
class HostSangriaTest extends TestCase
{
    use RefreshDatabase;

    private function project(User $user): Project
    {
        return $user->projects()->create(['name' => 'Rede', 'center_lat' => 0, 'center_lng' => 0]);
    }

    public function test_two_segments_ending_on_a_pole_join_in_the_fixed_ceo(): void
    {
        $user = User::factory()->create();
        $project = $this->project($user);
        $pole = $project->nodes()->create(['type' => 'pole', 'name' => 'P-2', 'lat' => 0, 'lng' => 0.001]);
        $ceo = $project->nodes()->create(['type' => 'ceo', 'name' => 'CEO-1', 'lat' => 0, 'lng' => 0.001,
            'attributes' => ['fixed_kind' => 'pole', 'fixed_id' => $pole->id]]);
        $a = $project->cables()->create(['name' => 'Cabo 12FO', 'fiber_count' => 12, 'path' => [[0, 0], [0, 0.001]], 'to_node_id' => $pole->id]);
        $b = $project->cables()->create(['name' => 'Cabo 12FO', 'fiber_count' => 12, 'path' => [[0, 0.001], [0, 0.002]], 'from_node_id' => $pole->id]);

        $this->actingAs($user)
            ->postJson("/api/nodes/{$ceo->id}/sangria", ['cable_ids' => [$a->id, $b->id]])
            ->assertOk()
            ->assertJsonCount(2, 'cables');

        $this->assertSame($ceo->id, $a->fresh()->to_node_id);
        $this->assertSame($ceo->id, $b->fresh()->from_node_id);
        $conns = $ceo->fresh()->diagram['connections'];
        $this->assertCount(12, $conns);
        $this->assertTrue($conns[0]['pass']);
    }

    public function test_join_on_the_box_itself_skips_used_fibers(): void
    {
        $user = User::factory()->create();
        $project = $this->project($user);
        $box = $project->nodes()->create(['type' => 'box', 'name' => 'CX-1', 'lat' => 0, 'lng' => 0.001]);
        $a = $project->cables()->create(['name' => 'C', 'fiber_count' => 4, 'path' => [[0, 0], [0, 0.001]], 'to_node_id' => $box->id]);
        $b = $project->cables()->create(['name' => 'C', 'fiber_count' => 4, 'path' => [[0, 0.001], [0, 0.002]], 'from_node_id' => $box->id]);
        $box->update(['diagram' => ['components' => [], 'cablePos' => [], 'connections' => [
            ['id' => 'x', 'a' => ['c' => 'c'.$a->id, 'p' => 'f1'], 'b' => ['c' => 'c'.$b->id, 'p' => 'f2']],
        ]]]);

        $this->actingAs($user)->postJson("/api/nodes/{$box->id}/sangria", ['cable_ids' => [$a->id, $b->id]])->assertOk();

        $this->assertCount(3, $box->fresh()->diagram['connections']); // 1 emenda + fibras 3 e 4
    }

    public function test_ceo_must_be_on_the_pole_where_segments_meet(): void
    {
        $user = User::factory()->create();
        $project = $this->project($user);
        $pole = $project->nodes()->create(['type' => 'pole', 'name' => 'P-2', 'lat' => 0, 'lng' => 0.001]);
        $far = $project->nodes()->create(['type' => 'ceo', 'name' => 'CEO-X', 'lat' => 0.01, 'lng' => 0.01]);
        $a = $project->cables()->create(['name' => 'C', 'path' => [[0, 0], [0, 0.001]], 'to_node_id' => $pole->id]);
        $b = $project->cables()->create(['name' => 'C', 'path' => [[0, 0.001], [0, 0.002]], 'from_node_id' => $pole->id]);

        $this->actingAs($user)->postJson("/api/nodes/{$far->id}/sangria", ['cable_ids' => [$a->id, $b->id]])->assertStatus(422);
    }
}
