<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class EquipmentModelTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_registers_models_and_team_sees_owner_models_read_only(): void
    {
        $owner = User::factory()->create();
        $editor = User::factory()->create();
        $project = $owner->projects()->create(['name' => 'Rede', 'center_lat' => 0, 'center_lng' => 0]);
        $project->members()->create(['user_id' => $editor->id, 'role' => 'editor']);

        $olt = $this->actingAs($owner)->postJson('/api/equipment-models', [
            'kind' => 'olt', 'vendor' => 'Huawei', 'model' => 'MA5800-X7', 'ports' => 16, 'slots' => 7, 'uplinks' => 4, 'tx_dbm' => 5, 'height_u' => 6,
        ])->assertCreated()->assertJsonPath('height_u', 6)->json();
        $this->postJson('/api/equipment-models', ['kind' => 'dio', 'model' => 'DIO 144', 'ports' => 144, 'height_u' => 4, 'slots' => 9])
            ->assertCreated()->assertJsonPath('slots', null);
        $this->postJson('/api/equipment-models', ['kind' => 'rack', 'model' => 'x', 'ports' => 1, 'height_u' => 1])->assertUnprocessable();

        $this->actingAs($editor)->getJson('/api/equipment-models')->assertOk()->assertJsonCount(0);
        $this->getJson("/api/equipment-models?project={$project->id}")->assertOk()->assertJsonCount(2)->assertJsonPath('0.own', false);
        $this->putJson("/api/equipment-models/{$olt['id']}", ['kind' => 'olt', 'model' => 'X', 'ports' => 8, 'height_u' => 1])->assertForbidden();
        $this->deleteJson("/api/equipment-models/{$olt['id']}")->assertForbidden();

        $this->actingAs(User::factory()->create())->getJson("/api/equipment-models?project={$project->id}")->assertNotFound();

        $this->actingAs($owner)->putJson("/api/equipment-models/{$olt['id']}", ['kind' => 'olt', 'model' => 'MA5800-X7', 'ports' => 16, 'slots' => 7, 'height_u' => 7])
            ->assertOk()->assertJsonPath('height_u', 7);
        $this->deleteJson("/api/equipment-models/{$olt['id']}")->assertNoContent();
    }
}
