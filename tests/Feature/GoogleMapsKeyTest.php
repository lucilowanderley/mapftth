<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class GoogleMapsKeyTest extends TestCase
{
    use RefreshDatabase;

    public function test_owner_saves_key_encrypted_and_members_receive_it_with_the_project(): void
    {
        config(['services.google_maps.key' => null]);
        $owner = User::factory()->create();
        $viewer = User::factory()->create();
        $project = $owner->projects()->create(['name' => 'Rede', 'center_lat' => -8, 'center_lng' => -35]);
        $project->members()->create(['user_id' => $viewer->id, 'role' => 'viewer']);

        $this->actingAs($owner)->getJson("/api/projects/{$project->id}")
            ->assertJsonPath('google_maps_key', null)->assertJsonPath('google_key_source', null);

        $this->putJson('/api/me/google-maps-key', ['key' => 'AIzaSyTeste_123-abc'])
            ->assertOk()->assertJsonPath('google_key_source', 'account');

        $raw = DB::table('users')->where('id', $owner->id)->value('google_maps_key');
        $this->assertNotSame('AIzaSyTeste_123-abc', $raw);
        $this->assertStringNotContainsString('AIzaSyTeste', (string) $raw);
        $this->assertArrayNotHasKey('google_maps_key', $owner->fresh()->toArray());

        $this->actingAs($viewer)->getJson("/api/projects/{$project->id}")
            ->assertJsonPath('google_maps_key', 'AIzaSyTeste_123-abc')->assertJsonPath('google_key_source', 'account');

        // o membro não grava na conta do dono, só na própria
        $this->putJson('/api/me/google-maps-key', ['key' => null])->assertOk();
        $this->getJson("/api/projects/{$project->id}")->assertJsonPath('google_maps_key', 'AIzaSyTeste_123-abc');
    }

    public function test_env_key_is_fallback_and_invalid_key_is_rejected(): void
    {
        config(['services.google_maps.key' => 'AIzaEnvKey']);
        $owner = User::factory()->create();
        $project = $owner->projects()->create(['name' => 'Rede', 'center_lat' => -8, 'center_lng' => -35]);

        $this->actingAs($owner)->getJson("/api/projects/{$project->id}")
            ->assertJsonPath('google_maps_key', 'AIzaEnvKey')->assertJsonPath('google_key_source', 'env');
        $this->putJson('/api/me/google-maps-key', ['key' => 'chave com espaço'])->assertStatus(422);
    }
}
