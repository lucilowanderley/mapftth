<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PriceBudgetTest extends TestCase
{
    use RefreshDatabase;

    public function test_owner_prices_items_and_team_reads_them(): void
    {
        $owner = User::factory()->create();
        $editor = User::factory()->create();
        $project = $owner->projects()->create(['name' => 'Rede', 'center_lat' => 0, 'center_lng' => 0]);
        $project->members()->create(['user_id' => $editor->id, 'role' => 'editor']);

        $this->actingAs($owner)->postJson('/api/price-items', ['key' => 'cable:12', 'category' => 'cable', 'name' => 'Cabo óptico 12FO', 'unit' => 'm', 'price' => 2.35])
            ->assertCreated()->assertJsonPath('price', 2.35);
        // Mesmo item padrão de novo: atualiza o mesmo registro.
        $this->postJson('/api/price-items', ['key' => 'cable:12', 'category' => 'cable', 'name' => 'Cabo óptico 12FO', 'unit' => 'm', 'price' => 2.5])->assertCreated();
        $custom = $this->postJson('/api/price-items', ['category' => 'other', 'name' => 'Aluguel de veículo', 'unit' => 'dia', 'price' => 250])->assertCreated()->json();
        $this->postJson('/api/price-items', ['category' => 'xyz', 'name' => 'x', 'unit' => 'un', 'price' => 1])->assertUnprocessable();
        $this->getJson('/api/price-items')->assertOk()->assertJsonCount(2);

        $this->actingAs($editor)->getJson('/api/price-items')->assertOk()->assertJsonCount(0);
        $this->getJson("/api/price-items?project={$project->id}")->assertOk()->assertJsonCount(2)->assertJsonPath('0.own', false);
        $this->putJson("/api/price-items/{$custom['id']}", ['category' => 'other', 'name' => 'X', 'unit' => 'un', 'price' => 1])->assertForbidden();
        $this->deleteJson("/api/price-items/{$custom['id']}")->assertForbidden();
        $this->actingAs(User::factory()->create())->getJson("/api/price-items?project={$project->id}")->assertNotFound();

        $this->actingAs($owner)->putJson("/api/price-items/{$custom['id']}", ['category' => 'labor', 'name' => 'Veículo', 'unit' => 'dia', 'price' => 300])
            ->assertOk()->assertJsonPath('price', 300)->assertJsonPath('key', null);
        $this->deleteJson("/api/price-items/{$custom['id']}")->assertNoContent();
    }

    public function test_bulk_import_updates_by_key_and_name(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user)->postJson('/api/price-items/bulk', ['items' => [
            ['key' => 'node:cto', 'category' => 'box', 'name' => 'CTO', 'unit' => 'un', 'price' => 180],
            ['key' => null, 'category' => 'labor', 'name' => 'Hora extra', 'unit' => 'h', 'price' => 60],
        ]])->assertOk()->assertJsonPath('saved', 2);
        $this->postJson('/api/price-items/bulk', ['items' => [
            ['key' => 'node:cto', 'category' => 'box', 'name' => 'CTO', 'unit' => 'un', 'price' => 200],
            ['category' => 'labor', 'name' => 'Hora extra', 'unit' => 'h', 'price' => 70],
        ]])->assertOk();
        $items = $this->getJson('/api/price-items')->assertJsonCount(2)->json();
        $this->assertEqualsCanonicalizing([200, 70], array_column($items, 'price'));
        $this->postJson('/api/price-items/bulk', ['items' => [['category' => 'box', 'name' => 'Sem preço', 'unit' => 'un']]])->assertUnprocessable();
    }

    public function test_budget_is_saved_by_editors_only(): void
    {
        $owner = User::factory()->create();
        $viewer = User::factory()->create();
        $editor = User::factory()->create();
        $project = $owner->projects()->create(['name' => 'Rede', 'center_lat' => 0, 'center_lng' => 0]);
        $project->members()->create(['user_id' => $viewer->id, 'role' => 'viewer']);
        $project->members()->create(['user_id' => $editor->id, 'role' => 'editor']);
        $budget = [
            'bdi_pct' => 25, 'discount_pct' => 5, 'scope' => 'pending', 'notes' => 'Validade 30 dias',
            'overrides' => ['cable:12' => 1200], 'hidden' => ['node:pole'],
            'extras' => [['id' => 'a1', 'category' => 'labor', 'name' => 'Projeto executivo', 'unit' => 'vb', 'price' => 1500, 'qty' => 1]],
        ];

        $this->actingAs($viewer)->putJson("/api/projects/{$project->id}/budget", $budget)->assertForbidden();
        $this->actingAs($editor)->putJson("/api/projects/{$project->id}/budget", $budget)->assertOk()
            ->assertJsonPath('bdi_pct', 25)
            ->assertJsonPath('overrides.cable:12', 1200)
            ->assertJsonPath('extras.0.name', 'Projeto executivo');
        $this->putJson("/api/projects/{$project->id}/budget", [...$budget, 'scope' => 'x'])->assertUnprocessable();

        $this->actingAs($owner)->getJson("/api/projects/{$project->id}")->assertOk()
            ->assertJsonPath('project.budget.scope', 'pending')
            ->assertJsonPath('project.budget.hidden.0', 'node:pole');
    }
}
