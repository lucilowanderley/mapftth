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
}
