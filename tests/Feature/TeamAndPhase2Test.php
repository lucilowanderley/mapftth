<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TeamAndPhase2Test extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private Project $project;

    protected function setUp(): void
    {
        parent::setUp();
        $this->owner = User::factory()->create();
        $this->project = $this->owner->projects()->create(['name' => 'Rede Norte', 'center_lat' => -2.44, 'center_lng' => -54.71]);
    }

    private function member(string $role): User
    {
        $user = User::factory()->create();
        $this->actingAs($this->owner)
            ->postJson("/api/projects/{$this->project->id}/members", ['email' => $user->email, 'role' => $role])
            ->assertCreated();

        return $user;
    }

    public function test_owner_invites_members_and_shared_project_is_listed_with_role(): void
    {
        $viewer = $this->member('viewer');

        $this->actingAs($viewer)->getJson('/api/projects')
            ->assertOk()->assertJsonCount(1)->assertJsonPath('0.role', 'viewer');
        $this->actingAs($viewer)->getJson("/api/projects/{$this->project->id}")
            ->assertOk()->assertJsonPath('role', 'viewer');
        $this->actingAs($this->owner)->getJson("/api/projects/{$this->project->id}/members")
            ->assertOk()->assertJsonPath('owner.id', $this->owner->id)->assertJsonCount(1, 'members');
    }

    public function test_inviting_unknown_or_duplicate_email_fails(): void
    {
        $this->actingAs($this->owner)
            ->postJson("/api/projects/{$this->project->id}/members", ['email' => 'ninguem@example.com', 'role' => 'editor'])
            ->assertUnprocessable()->assertJsonValidationErrors('email');
        $this->actingAs($this->owner)
            ->postJson("/api/projects/{$this->project->id}/members", ['email' => $this->owner->email, 'role' => 'editor'])
            ->assertUnprocessable();
    }

    public function test_viewer_can_read_but_not_edit(): void
    {
        $viewer = $this->member('viewer');
        $node = $this->project->nodes()->create(['type' => 'cto', 'name' => 'CTO-01', 'lat' => -2.44, 'lng' => -54.71]);

        $this->actingAs($viewer)->postJson("/api/projects/{$this->project->id}/nodes", ['type' => 'pole', 'lat' => -2.44, 'lng' => -54.71])->assertForbidden();
        $this->actingAs($viewer)->putJson("/api/nodes/{$node->id}", ['name' => 'X'])->assertForbidden();
        $this->actingAs($viewer)->deleteJson("/api/nodes/{$node->id}")->assertForbidden();
        $this->actingAs($viewer)->postJson("/api/projects/{$this->project->id}/areas", ['polygon' => [[0, 0], [0, 1], [1, 1]]])->assertForbidden();
        $this->actingAs($viewer)->getJson("/api/projects/{$this->project->id}/activity")->assertOk();
    }

    public function test_editor_edits_but_cannot_manage_team_or_delete_project(): void
    {
        $editor = $this->member('editor');
        $other = User::factory()->create();

        $this->actingAs($editor)->postJson("/api/projects/{$this->project->id}/nodes", ['type' => 'pole', 'lat' => -2.44, 'lng' => -54.71])->assertCreated();
        $this->actingAs($editor)->postJson("/api/projects/{$this->project->id}/members", ['email' => $other->email, 'role' => 'viewer'])->assertForbidden();
        $this->actingAs($editor)->putJson("/api/projects/{$this->project->id}", ['name' => 'Outro'])->assertForbidden();
        $this->actingAs($editor)->deleteJson("/api/projects/{$this->project->id}")->assertForbidden();
    }

    public function test_admin_manages_team_but_only_owner_deletes(): void
    {
        $admin = $this->member('admin');
        $other = User::factory()->create();

        $member = $this->actingAs($admin)->postJson("/api/projects/{$this->project->id}/members", ['email' => $other->email, 'role' => 'viewer'])
            ->assertCreated()->json();
        $this->actingAs($admin)->putJson("/api/projects/{$this->project->id}/members/{$member['id']}", ['role' => 'editor'])
            ->assertOk()->assertJsonPath('role', 'editor');
        $this->actingAs($admin)->deleteJson("/api/projects/{$this->project->id}")->assertForbidden();
        $this->actingAs($this->owner)->deleteJson("/api/projects/{$this->project->id}")->assertNoContent();
    }

    public function test_member_can_leave_and_non_members_get_404(): void
    {
        $viewer = $this->member('viewer');
        $stranger = User::factory()->create();
        $memberId = $this->project->members()->where('user_id', $viewer->id)->value('id');

        $this->actingAs($stranger)->getJson("/api/projects/{$this->project->id}")->assertNotFound();
        $this->actingAs($stranger)->getJson("/api/projects/{$this->project->id}/activity")->assertNotFound();
        $this->actingAs($viewer)->deleteJson("/api/projects/{$this->project->id}/members/{$memberId}")->assertNoContent();
        $this->actingAs($viewer)->getJson("/api/projects/{$this->project->id}")->assertNotFound();
    }

    public function test_changes_are_recorded_in_history(): void
    {
        $editor = $this->member('editor');
        $node = $this->actingAs($editor)->postJson("/api/projects/{$this->project->id}/nodes", ['type' => 'cto', 'lat' => -2.44, 'lng' => -54.71])->json();
        $this->actingAs($editor)->putJson("/api/nodes/{$node['id']}", ['status' => 'deployed'])->assertOk();
        $this->actingAs($editor)->putJson("/api/nodes/{$node['id']}", ['lat' => -2.441, 'lng' => -54.711])->assertOk();

        $log = $this->actingAs($this->owner)->getJson("/api/projects/{$this->project->id}/activity?type=node&subject_id={$node['id']}")
            ->assertOk()->json();
        $this->assertSame(['moved', 'updated', 'created'], array_column($log, 'action'));
        $this->assertSame($editor->name, $log[0]['user']['name']);
        $this->assertSame(1, ActivityLog::where('action', 'created')->where('subject_type', 'member')->count());
    }

    public function test_areas_crud(): void
    {
        $area = $this->actingAs($this->owner)->postJson("/api/projects/{$this->project->id}/areas", [
            'polygon' => [[-2.44, -54.71], [-2.44, -54.70], [-2.43, -54.70]],
        ])->assertCreated()->assertJsonPath('name', 'Área 1')->json();

        $this->actingAs($this->owner)->putJson("/api/areas/{$area['id']}", ['name' => 'Bairro Centro', 'color' => '#22C55E'])
            ->assertOk()->assertJsonPath('name', 'Bairro Centro');
        $this->actingAs($this->owner)->getJson("/api/projects/{$this->project->id}")->assertJsonCount(1, 'areas');
        $this->actingAs($this->owner)->postJson("/api/projects/{$this->project->id}/areas", ['polygon' => [[0, 0], [1, 1]]])->assertUnprocessable();
        $this->actingAs($this->owner)->deleteJson("/api/areas/{$area['id']}")->assertNoContent();
    }

    public function test_bulk_pole_import(): void
    {
        $poles = collect(range(1, 3))->map(fn ($i) => [
            'type' => 'pole', 'lat' => -2.44 + $i / 10000, 'lng' => -54.71,
            'attributes' => ['material' => 'Concreto', 'height_m' => 11, 'owner' => 'Equatorial'],
        ])->all();
        $poles[1]['name'] = 'P-ESPECIAL';

        $res = $this->actingAs($this->owner)->postJson("/api/projects/{$this->project->id}/nodes/bulk", ['nodes' => $poles])
            ->assertCreated()->json();
        $this->assertCount(3, $res['created']);
        $this->assertSame('P-ESPECIAL', $res['created'][1]['name']);
        $this->assertSame('Concreto', $res['created'][0]['attributes']['material']);
        $this->assertSame(3, $this->project->nodes()->where('type', 'pole')->count());

        $this->actingAs($this->owner)->postJson("/api/projects/{$this->project->id}/nodes/bulk", ['nodes' => [['type' => 'pole', 'lat' => 200, 'lng' => 0]]])
            ->assertUnprocessable();
    }
}
