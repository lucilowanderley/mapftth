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

    public function test_active_model_with_port_groups_sums_ports(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user)->postJson('/api/equipment-models', [
            'kind' => 'active', 'type' => 'Multiplex DWDM', 'model' => 'Mux 40', 'ports' => 1, 'height_u' => 1,
            'port_groups' => [['type' => 'Canal DWDM', 'count' => 40, 'speed' => 10], ['type' => 'Linha / COM', 'count' => 1]],
        ])->assertCreated()
            ->assertJsonPath('ports', 41)
            ->assertJsonPath('port_groups.0.speed', 10)
            ->assertJsonPath('port_groups.1.speed', null);

        $this->postJson('/api/equipment-models', [
            'kind' => 'dio', 'model' => 'DIO', 'ports' => 24, 'height_u' => 1, 'port_groups' => [['type' => 'SFP', 'count' => 2]],
        ])->assertCreated()->assertJsonPath('port_groups', null);

        $this->postJson('/api/equipment-models', [
            'kind' => 'active', 'model' => 'X', 'ports' => 1, 'height_u' => 1, 'port_groups' => [['type' => 'SFP', 'count' => 0]],
        ])->assertUnprocessable();
    }

    public function test_builtin_model_can_be_edited_hidden_and_restored(): void
    {
        $user = User::factory()->create();
        $base = ['kind' => 'active', 'model' => 'Switch 24', 'type' => 'Switch', 'ports' => 24, 'height_u' => 1];

        // Editar um padrão cria a versão do usuário; editar de novo atualiza a mesma linha.
        $a = $this->actingAs($user)->postJson('/api/equipment-models', [...$base, 'replaces' => 'sw-24'])->assertCreated()->json();
        $b = $this->postJson('/api/equipment-models', [...$base, 'model' => 'Switch 24 v2', 'replaces' => 'sw-24'])->assertCreated()->json();
        $this->assertSame($a['id'], $b['id']);
        $this->assertSame('sw-24', $b['replaces']);
        $this->assertFalse($b['hidden']);

        // Atualizar sem `replaces` mantém o vínculo; excluir um padrão editado vira oculto.
        $this->putJson("/api/equipment-models/{$a['id']}", [...$base, 'model' => 'Switch 24 v3'])->assertOk()->assertJsonPath('replaces', 'sw-24');
        $this->putJson("/api/equipment-models/{$a['id']}", [...$base, 'replaces' => 'sw-24', 'hidden' => true])->assertOk()->assertJsonPath('hidden', true);

        // Ocultar exige um padrão; restaurar = apagar a linha.
        $this->postJson('/api/equipment-models', [...$base, 'hidden' => true])->assertStatus(422);
        $this->deleteJson("/api/equipment-models/{$a['id']}")->assertNoContent();
        $this->getJson('/api/equipment-models')->assertOk()->assertJsonCount(0);
    }
}
