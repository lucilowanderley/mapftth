<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class CableLaunchTest extends TestCase
{
    use RefreshDatabase;

    private function project(User $user): Project
    {
        return $user->projects()->create(['name' => 'Rede Centro', 'center_lat' => -2.44, 'center_lng' => -54.71]);
    }

    public function test_launch_creates_new_poles_cable_and_slacks_fixed_on_poles(): void
    {
        $user = User::factory()->create();
        $project = $this->project($user);
        $this->actingAs($user);
        $existing = $this->postJson("/api/projects/{$project->id}/nodes", ['type' => 'pole', 'lat' => -2.4410, 'lng' => -54.71])->assertCreated();

        $res = $this->postJson("/api/projects/{$project->id}/launch", [
            'cable' => ['category' => 'backbone', 'model' => 'as-48', 'fiber_count' => 48, 'fibers_per_tube' => 12, 'color' => '#ef4444'],
            'points' => [
                ['lat' => -2.44, 'lng' => -54.71, 'new_pole' => true],
                ['pole_id' => $existing->json('id')],
                ['lat' => -2.4420, 'lng' => -54.71, 'new_pole' => true],
                ['lat' => -2.4425, 'lng' => -54.7105],
            ],
            'slacks' => [['point' => 2, 'length_m' => 15]],
        ])->assertCreated();

        $res->assertJsonCount(2, 'nodes')->assertJsonPath('nodes.0.name', 'P-2')->assertJsonPath('nodes.1.name', 'P-3');
        $cable = $res->json('cable');
        $this->assertCount(4, $cable['path']);
        $this->assertSame([-2.441, -54.71], $cable['path'][1]);
        $this->assertSame(15, $cable['slack_m']);
        $this->assertSame('pole', $cable['slacks'][0]['fixed_kind']);
        $this->assertSame($res->json('nodes.1.id'), $cable['slacks'][0]['fixed_id']);
        $this->assertSame(3, $project->nodes()->where('type', 'pole')->count());
    }

    public function test_launch_rejects_pole_from_other_project(): void
    {
        $user = User::factory()->create();
        $project = $this->project($user);
        $other = $this->project($user);
        $this->actingAs($user);
        $pole = $this->postJson("/api/projects/{$other->id}/nodes", ['type' => 'pole', 'lat' => 0, 'lng' => 0])->assertCreated();

        $this->postJson("/api/projects/{$project->id}/launch", [
            'cable' => ['category' => 'distribution', 'fiber_count' => 12, 'fibers_per_tube' => 12],
            'points' => [['pole_id' => $pole->json('id')], ['lat' => 0.001, 'lng' => 0]],
        ])->assertUnprocessable();
        $this->assertSame(0, $project->cables()->count());
    }

    public function test_route_follows_street_or_falls_back_to_straight_line(): void
    {
        $user = User::factory()->create();
        $project = $this->project($user);
        $this->actingAs($user);

        $down = false;
        Http::fake(function () use (&$down) { return $down ? Http::response('erro', 500) : Http::response(['code' => 'Ok', 'routes' => [[
            'geometry' => ['coordinates' => [[-54.71, -2.44], [-54.71, -2.441], [-54.711, -2.441]]],
        ]]]); });
        $this->postJson("/api/projects/{$project->id}/launch/route", ['from' => [-2.44, -54.71], 'to' => [-2.441, -54.711]])
            ->assertOk()->assertJsonPath('source', 'osrm-foot')->assertJsonCount(3, 'path');

        $down = true;
        $this->postJson("/api/projects/{$project->id}/launch/route", ['from' => [-2.5, -54.7], 'to' => [-2.51, -54.7]])
            ->assertOk()->assertJsonPath('source', 'line')->assertJsonCount(2, 'path');
    }
}
