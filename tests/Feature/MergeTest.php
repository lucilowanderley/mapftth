<?php

namespace Tests\Feature;

use App\Models\Cable;
use App\Models\Duct;
use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MergeTest extends TestCase
{
    use RefreshDatabase;

    private function project(User $user): Project
    {
        return $user->projects()->create(['name' => 'Rede', 'center_lat' => 0, 'center_lng' => 0]);
    }

    public function test_cables_meeting_at_a_loose_point_become_one_and_keep_what_was_fixed_on_them(): void
    {
        $user = User::factory()->create();
        $project = $this->project($user);
        $pop = $project->nodes()->create(['type' => 'pop', 'name' => 'POP', 'lat' => 0, 'lng' => 0]);
        $ceo = $project->nodes()->create(['type' => 'ceo', 'name' => 'CEO', 'lat' => 0, 'lng' => 0.002]);
        // B foi desenhado ao contrário (da CEO para o meio).
        $a = $project->cables()->create(['name' => 'Tronco · T1', 'fiber_count' => 12, 'path' => [[0, 0], [0, 0.001]], 'from_node_id' => $pop->id]);
        $b = $project->cables()->create([
            'name' => 'Tronco · T2', 'fiber_count' => 12, 'path' => [[0, 0.002], [0, 0.0010001]], 'to_node_id' => null, 'from_node_id' => $ceo->id,
            'slacks' => [['id' => 'r1', 'lat' => 0, 'lng' => 0.0015, 'length_m' => 30, 'kind' => 'aerial', 'fixed_kind' => 'cable', 'fixed_id' => null]],
        ]);
        $ceo->update(['diagram' => ['components' => [], 'cablePos' => ["c{$b->id}" => ['x' => 1, 'y' => 1]], 'connections' => [
            ['id' => 'x1', 'a' => ['c' => "c{$b->id}", 'p' => 'f1'], 'b' => ['c' => 'c999', 'p' => 'f1']],
        ], 'trays' => [['id' => 't1', 'name' => 'B1', 'capacity' => 12, 'tubes' => ["c{$b->id}:t1"], 'x' => 0, 'y' => 0]]]]);
        $cto = $project->nodes()->create(['type' => 'cto', 'name' => 'CTO', 'lat' => 0, 'lng' => 0.0016, 'attributes' => ['fixed_kind' => 'cable', 'fixed_id' => $b->id]]);
        $duct = $project->ducts()->create(['name' => 'D', 'path' => [[0, 0.001], [0, 0.002]], 'cable_ids' => [$b->id]]);

        $r = $this->actingAs($user)->postJson("/api/projects/{$project->id}/cables/merge", ['ids' => [$b->id, $a->id]])
            ->assertOk()->assertJsonCount(1, 'cables')->assertJsonPath('removed', [$a->id]);

        // Fica o cabo marcado primeiro (B), no sentido dele; tudo o que estava em A passa para ele.
        $c = Cable::find($b->id);
        $this->assertNull(Cable::find($a->id));
        $this->assertSame('Tronco', $c->name);
        $this->assertSame([$ceo->id, $pop->id], [$c->from_node_id, $c->to_node_id]);
        $this->assertCount(3, $c->path);
        $this->assertEquals([0, 0], $c->path[2]);
        $this->assertSame(30, $c->slack_m);
        $this->assertSame($b->id, $cto->fresh()->attributes['fixed_id']);
        $this->assertSame([$b->id], $duct->fresh()->cable_ids);
        $d = $ceo->fresh()->diagram;
        $this->assertSame("c{$b->id}", $d['connections'][0]['a']['c']);
        $this->assertArrayHasKey("c{$b->id}", $d['cablePos']);
        $this->assertSame(["c{$b->id}:t1"], $d['trays'][0]['tubes']);
        $this->assertSame([], $r->json('sangrias'));
    }

    public function test_box_with_splices_becomes_sangria_and_box_without_splices_is_passed_through(): void
    {
        $user = User::factory()->create();
        $project = $this->project($user);
        $pop = $project->nodes()->create(['type' => 'pop', 'name' => 'POP', 'lat' => 0, 'lng' => 0]);
        $cto = $project->nodes()->create(['type' => 'cto', 'name' => 'CTO-1', 'lat' => 0, 'lng' => 0.001]);
        $box = $project->nodes()->create(['type' => 'ceo', 'name' => 'CEO-1', 'lat' => 0, 'lng' => 0.002]);
        $end = $project->nodes()->create(['type' => 'cto', 'name' => 'CTO-2', 'lat' => 0, 'lng' => 0.003]);
        $mk = fn ($n, $f, $t, $from, $to) => $project->cables()->create([
            'name' => $n, 'fiber_count' => 4, 'path' => [[0, $f], [0, $t]], 'from_node_id' => $from, 'to_node_id' => $to,
        ]);
        $a = $mk('A', 0, 0.001, $pop->id, $cto->id);
        $b = $mk('B', 0.001, 0.002, $cto->id, $box->id);
        $c = $mk('C', 0.002, 0.003, $box->id, $end->id);
        // CTO-1: fibra 1 de A vai para o splitter; fibra 2 de B sai do splitter (emendas).
        $cto->update(['diagram' => ['components' => [['id' => 's1', 'kind' => 'splitter', 'model' => '1x8', 'x' => 0, 'y' => 0]], 'cablePos' => [], 'connections' => [
            ['id' => 'e1', 'a' => ['c' => "c{$a->id}", 'p' => 'f1'], 'b' => ['c' => 's1', 'p' => 'in']],
            ['id' => 'e2', 'a' => ['c' => 's1', 'p' => 'o1'], 'b' => ['c' => "c{$b->id}", 'p' => 'f2']],
        ]]]);
        // CEO-1: só passagem direta de B para C, sem emenda.
        $box->update(['diagram' => ['components' => [], 'cablePos' => ["c{$b->id}" => ['x' => 0, 'y' => 0]], 'connections' => [
            ['id' => 'p1', 'a' => ['c' => "c{$b->id}", 'p' => 'f1'], 'b' => ['c' => "c{$c->id}", 'p' => 'f1'], 'pass' => true],
        ]]]);
        $end->update(['diagram' => ['components' => [], 'cablePos' => [], 'connections' => [
            ['id' => 'z', 'a' => ['c' => "c{$c->id}", 'p' => 'f3'], 'b' => ['c' => 'c777', 'p' => 'f1']],
        ]]]);

        $r = $this->actingAs($user)->postJson("/api/projects/{$project->id}/cables/merge", ['ids' => [$a->id, $b->id, $c->id]])
            ->assertOk()->assertJsonCount(2, 'cables')->assertJsonPath('removed', [$c->id]);

        [$t1, $t2] = $r->json('cables');
        $this->assertSame(['A · T1', 'A · T2'], [$t1['name'], $t2['name']]);
        $this->assertSame([$pop->id, $cto->id], [$t1['from_node_id'], $t1['to_node_id']]);
        $this->assertSame([$cto->id, $end->id], [$t2['from_node_id'], $t2['to_node_id']]);
        $this->assertSame($b->id, $t2['id']);

        // Sangria na CTO-1: as 2 emendas ficam; fibras 3 e 4 (livres nos dois) passam direto.
        $conns = collect($cto->fresh()->diagram['connections']);
        $this->assertCount(4, $conns);
        $passes = $conns->where('pass', true)->values();
        $this->assertSame(['f3', 'f4'], $passes->pluck('a.p')->all());
        $this->assertSame(['sangrias.0.name' => 'CTO-1', 'sangrias.0.passes' => 2], ['sangrias.0.name' => $r->json('sangrias.0.name'), 'sangrias.0.passes' => $r->json('sangrias.0.passes')]);

        // CEO-1: o cabo só passa; some do diagrama.
        $d = $box->fresh()->diagram;
        $this->assertSame([], $d['connections']);
        $this->assertSame([], $d['cablePos']);

        // CTO-2 (fim) agora enxerga o trecho unido.
        $this->assertSame("c{$b->id}", $end->fresh()->diagram['connections'][0]['a']['c']);
    }

    public function test_merge_rejects_gaps_branches_and_different_fiber_counts(): void
    {
        $user = User::factory()->create();
        $project = $this->project($user);
        $a = $project->cables()->create(['name' => 'A', 'fiber_count' => 12, 'path' => [[0, 0], [0, 0.001]]]);
        $b = $project->cables()->create(['name' => 'B', 'fiber_count' => 6, 'path' => [[0, 0.001], [0, 0.002]]]);
        $far = $project->cables()->create(['name' => 'Longe', 'fiber_count' => 12, 'path' => [[0, 0.01], [0, 0.02]]]);
        $c = $project->cables()->create(['name' => 'C', 'fiber_count' => 12, 'path' => [[0, 0.001], [0.001, 0.001]]]);
        $url = "/api/projects/{$project->id}/cables/merge";

        $this->actingAs($user)->postJson($url, ['ids' => [$a->id, $far->id]])->assertUnprocessable()->assertJsonValidationErrors('ids');
        $this->actingAs($user)->postJson($url, ['ids' => [$a->id, $b->id]])->assertUnprocessable();
        $this->actingAs($user)->postJson($url, ['ids' => [$a->id, $b->id, $c->id]])->assertUnprocessable();
        $this->assertSame(4, $project->cables()->count());

        $other = $this->project(User::factory()->create());
        $this->actingAs($user)->postJson("/api/projects/{$other->id}/cables/merge", ['ids' => [$a->id, $c->id]])->assertNotFound();
    }

    public function test_ducts_are_merged_with_their_cables(): void
    {
        $user = User::factory()->create();
        $project = $this->project($user);
        $box1 = $project->nodes()->create(['type' => 'box', 'name' => 'Caixa 1', 'lat' => 0, 'lng' => 0]);
        $box2 = $project->nodes()->create(['type' => 'box', 'name' => 'Caixa 2', 'lat' => 0, 'lng' => 0.001]);
        $box3 = $project->nodes()->create(['type' => 'box', 'name' => 'Caixa 3', 'lat' => 0, 'lng' => 0.002]);
        $c1 = $project->cables()->create(['name' => 'C1', 'path' => [[0, 0], [0, 0.002]]]);
        $c2 = $project->cables()->create(['name' => 'C2', 'path' => [[0, 0], [0, 0.002]]]);
        $d1 = $project->ducts()->create(['name' => 'D1', 'path' => [[0, 0], [0, 0.001]], 'from_node_id' => $box1->id, 'to_node_id' => $box2->id, 'cable_ids' => [$c1->id]]);
        $d2 = $project->ducts()->create(['name' => 'D2', 'path' => [[0, 0.002], [0, 0.001]], 'from_node_id' => $box3->id, 'to_node_id' => $box2->id, 'cable_ids' => [$c1->id, $c2->id]]);

        $this->actingAs($user)->postJson("/api/projects/{$project->id}/ducts/merge", ['ids' => [$d1->id, $d2->id]])
            ->assertOk()->assertJsonPath('duct.id', $d1->id)->assertJsonPath('removed', [$d2->id]);

        $d = Duct::find($d1->id);
        $this->assertNull(Duct::find($d2->id));
        $this->assertSame([$box1->id, $box3->id], [$d->from_node_id, $d->to_node_id]);
        $this->assertSame([$c1->id, $c2->id], $d->cable_ids);
        $this->assertCount(3, $d->path);
    }
}
