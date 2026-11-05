<?php

namespace Tests\Feature;

use App\Models\Cable;
use App\Models\NetworkNode;
use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class NodeSharingTest extends TestCase
{
    use RefreshDatabase;

    private function project(User $user, string $name): Project
    {
        return $user->projects()->create(['name' => $name, 'center_lat' => -6.4, 'center_lng' => -35.4]);
    }

    public function test_shared_node_appears_in_both_projects_and_edits_reflect(): void
    {
        $user = User::factory()->create();
        $a = $this->project($user, 'Backbone');
        $b = $this->project($user, 'Nova Cruz');
        $this->actingAs($user);

        $pop = $this->postJson("/api/projects/{$a->id}/nodes", ['type' => 'pop', 'lat' => -6.4, 'lng' => -35.4])->json();
        $this->postJson("/api/nodes/{$pop['id']}/shares", ['project_id' => $b->id])->assertOk()
            ->assertJsonPath('nodes.0.share.home_id', $a->id)
            ->assertJsonPath('nodes.0.share.projects.0.id', $b->id);

        $nodesB = $this->getJson("/api/projects/{$b->id}")->assertOk()->json('nodes');
        $this->assertCount(1, $nodesB);
        $this->assertSame($pop['id'], $nodesB[0]['id']);
        $this->assertSame('Backbone', $nodesB[0]['share']['home_name']);
        $this->assertTrue($nodesB[0]['share']['can_edit']);

        // Cabo do projeto B chega no POP do projeto A; editar pelo B move o cabo do B e o do A.
        $cableB = $this->postJson("/api/projects/{$b->id}/cables", [
            'path' => [[-6.4, -35.4], [-6.41, -35.41]], 'from_node_id' => $pop['id'],
        ])->assertCreated()->json();
        $cableA = $this->postJson("/api/projects/{$a->id}/cables", [
            'path' => [[-6.4, -35.4], [-6.39, -35.39]], 'from_node_id' => $pop['id'],
        ])->assertCreated()->json();

        $r = $this->putJson("/api/nodes/{$pop['id']}?project={$b->id}", ['lat' => -6.401, 'lng' => -35.401, 'name' => 'POP Central'])->assertOk();
        $this->assertSame([$cableB['id']], array_column($r->json('cables'), 'id'));
        $this->assertEquals([-6.401, -35.401], Cable::find($cableA['id'])->path[0]);
        $this->assertSame('POP Central', $this->getJson("/api/projects/{$a->id}")->json('nodes.0.name'));
    }

    public function test_delete_from_other_project_only_unshares_and_delete_at_home_removes_everywhere(): void
    {
        $user = User::factory()->create();
        $a = $this->project($user, 'A');
        $b = $this->project($user, 'B');
        $this->actingAs($user);
        $pole = $this->postJson("/api/projects/{$a->id}/nodes", ['type' => 'pole', 'lat' => 0, 'lng' => 0])->json();
        $this->postJson("/api/nodes/{$pole['id']}/shares", ['project_id' => $b->id])->assertOk();
        $cable = $this->postJson("/api/projects/{$b->id}/cables", ['path' => [[0, 0], [0.001, 0]], 'from_node_id' => $pole['id']])->assertCreated()->json();

        $this->deleteJson("/api/nodes/{$pole['id']}?project={$b->id}")->assertNoContent();
        $this->assertNotNull(NetworkNode::find($pole['id']));
        $this->assertCount(0, $this->getJson("/api/projects/{$b->id}")->json('nodes'));
        $this->assertNull(Cable::find($cable['id'])->from_node_id);

        $this->postJson("/api/nodes/{$pole['id']}/shares", ['project_id' => $b->id])->assertOk();
        $this->deleteJson("/api/nodes/{$pole['id']}?project={$a->id}")->assertNoContent();
        $this->assertNull(NetworkNode::find($pole['id']));
    }

    public function test_member_of_only_one_project_sees_shared_node_read_only(): void
    {
        $owner = User::factory()->create();
        $editor = User::factory()->create();
        $a = $this->project($owner, 'A');
        $b = $this->project($owner, 'B');
        $b->members()->create(['user_id' => $editor->id, 'role' => 'editor']);
        $this->actingAs($owner);
        $pole = $this->postJson("/api/projects/{$a->id}/nodes", ['type' => 'pole', 'lat' => 0, 'lng' => 0])->json();
        $this->postJson("/api/nodes/{$pole['id']}/shares", ['project_id' => $b->id])->assertOk();

        $this->actingAs($editor);
        $this->assertFalse($this->getJson("/api/projects/{$b->id}")->json('nodes.0.share.can_edit'));
        $this->putJson("/api/nodes/{$pole['id']}?project={$b->id}", ['name' => 'X'])->assertNotFound();
        // Não pode compartilhar com um projeto onde não é editor, nem abrir pela origem.
        $this->postJson("/api/nodes/{$pole['id']}/shares", ['project_id' => $b->id])->assertNotFound();
        // Mas pode tirar do projeto onde é editor.
        $this->deleteJson("/api/nodes/{$pole['id']}?project={$b->id}")->assertNoContent();
    }

    public function test_sharing_a_pole_takes_the_fixed_cto_along(): void
    {
        $user = User::factory()->create();
        $a = $this->project($user, 'A');
        $b = $this->project($user, 'B');
        $this->actingAs($user);
        $pole = $this->postJson("/api/projects/{$a->id}/nodes", ['type' => 'pole', 'lat' => 0, 'lng' => 0])->json();
        $cto = $this->postJson("/api/projects/{$a->id}/nodes", ['type' => 'cto', 'lat' => 0, 'lng' => 0, 'attributes' => ['fixed_kind' => 'pole', 'fixed_id' => $pole['id']]])->json();
        $this->postJson("/api/nodes/{$pole['id']}/shares", ['project_id' => $b->id])->assertOk()->assertJsonCount(2, 'nodes');
        $ids = array_column($this->getJson("/api/projects/{$b->id}")->json('nodes'), 'id');
        $this->assertEqualsCanonicalizing([$pole['id'], $cto['id']], $ids);
    }

    public function test_duplicates_across_projects_are_found_and_merged(): void
    {
        $user = User::factory()->create();
        $a = $this->project($user, 'Backbone');
        $b = $this->project($user, 'Nova Cruz');
        $this->actingAs($user);
        $p1 = $a->nodes()->create(['type' => 'pole', 'name' => 'P-1', 'lat' => -6.4, 'lng' => -35.4]);
        $p2 = $b->nodes()->create(['type' => 'pole', 'name' => 'Poste 77', 'lat' => -6.400005, 'lng' => -35.400005, 'attributes' => ['owner' => 'COSERN']]);
        $far = $b->nodes()->create(['type' => 'pole', 'name' => 'P-9', 'lat' => -6.41, 'lng' => -35.41]);
        $cto = $b->nodes()->create(['type' => 'cto', 'name' => 'CTO-1', 'lat' => -6.400005, 'lng' => -35.400005, 'attributes' => ['fixed_kind' => 'pole', 'fixed_id' => $p2->id]]);
        $cable = $b->cables()->create(['name' => 'C', 'path' => [[-6.41, -35.41], [-6.400005, -35.400005], [-6.42, -35.42]]]);
        $drop = $b->cables()->create(['name' => 'D', 'path' => [[-6.400005, -35.400005], [-6.43, -35.43]], 'from_node_id' => $p2->id]);

        $groups = $this->getJson('/api/duplicates?types[]=pole&radius=3')->assertOk()->json('groups');
        $this->assertCount(1, $groups);
        $this->assertEqualsCanonicalizing([$p1->id, $p2->id], array_column($groups[0]['nodes'], 'id'));
        $keep = $groups[0]['keep_id'];
        $this->assertSame($p2->id, $keep); // tem cabo ligado

        $this->postJson('/api/duplicates/merge', ['groups' => [['keep_id' => $keep, 'ids' => [$p1->id, $p2->id]]]])
            ->assertOk()->assertJsonPath('merged', 1);
        $this->assertNull(NetworkNode::find($p1->id));
        $kept = NetworkNode::find($p2->id);
        $this->assertSame([$a->id], $kept->sharedProjects()->pluck('projects.id')->all());
        $this->assertSame($p2->id, $cto->fresh()->attributes['fixed_id']);
        $this->assertSame($p2->id, $drop->fresh()->from_node_id);
        $this->assertNotNull($far->fresh());
        $this->assertCount(0, $this->getJson('/api/duplicates?types[]=pole&radius=3')->json('groups'));
        $this->assertContains($p2->id, array_column($this->getJson("/api/projects/{$a->id}")->json('nodes'), 'id'));
        $this->assertNotNull($cable->fresh());
    }
}
