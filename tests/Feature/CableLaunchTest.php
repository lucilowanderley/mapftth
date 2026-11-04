<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\User;
use App\Services\RoutingService;
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

    public function test_route_prefers_br_then_rodovias_and_falls_back_to_straight_line(): void
    {
        $user = User::factory()->create();
        $project = $this->project($user);
        $this->actingAs($user);

        config(['services.routing.url' => null]);
        $route = fn (array $coords, array $steps) => [
            'geometry' => ['coordinates' => $coords],
            'legs' => [['steps' => array_map(fn ($s) => ['distance' => $s[0], 'name' => $s[1], 'ref' => $s[2] ?? null], $steps)]],
        ];
        // Pelas ruas é mais curto, mas pela BR compensa: 1100 m de BR vale mais que 1000 m de rua.
        $streets = $route([[-54.71, -2.44], [-54.71, -2.449]], [[1000, 'Rua das Flores']]);
        $br = $route([[-54.71, -2.44], [-54.7125, -2.4445], [-54.71, -2.449]], [[944, 'Rodovia Santarém-Cuiabá', 'BR-163'], [200, 'Avenida Brasil']]);
        $down = false;
        Http::fake(function ($request) use (&$down, $streets, $br) {
            if ($down || str_contains($request->url(), 'routed-foot')) {
                return Http::response('erro', 500);
            }

            return Http::response(['code' => 'Ok', 'routes' => [$streets, $br]]);
        });
        $res = $this->postJson("/api/projects/{$project->id}/launch/route", ['from' => [-2.44, -54.71], 'to' => [-2.449, -54.71]])->assertOk();
        $res->assertJsonPath('source', 'osrm-car')->assertJsonCount(3, 'path')->assertJsonCount(2, 'options')
            ->assertJsonPath('roads.0.class', 'br')->assertJsonPath('roads.0.meters', 944)
            ->assertJsonPath('roads.1.class', 'avenida')->assertJsonPath('options.1.roads.0.class', 'rua')
            ->assertJsonPath('options.0.names.0', 'BR-163');

        $down = true;
        $this->postJson("/api/projects/{$project->id}/launch/route", ['from' => [-2.5, -54.7], 'to' => [-2.51, -54.7]])
            ->assertOk()->assertJsonPath('source', 'line')->assertJsonCount(2, 'path');
    }

    public function test_route_through_reference_points_in_order(): void
    {
        $user = User::factory()->create();
        $project = $this->project($user);
        $this->actingAs($user);
        config(['services.routing.url' => 'http://osrm.test']);

        // Roteador falso: devolve a reta entre os dois pontos pedidos, com um vértice no meio; o 2º trecho falha.
        Http::fake(function ($request) {
            preg_match('#driving/([-\d.]+),([-\d.]+);([-\d.]+),([-\d.]+)#', $request->url(), $m);
            if ((float) $m[2] === -2.441) {
                return Http::response('erro', 500);
            }
            $a = [(float) $m[1], (float) $m[2]];
            $b = [(float) $m[3], (float) $m[4]];

            return Http::response(['code' => 'Ok', 'routes' => [[
                'geometry' => ['coordinates' => [$a, [($a[0] + $b[0]) / 2, ($a[1] + $b[1]) / 2], $b]],
                'legs' => [['steps' => [['distance' => 50, 'name' => 'Avenida Brasil']]]],
            ]]]);
        });

        $res = $this->postJson("/api/projects/{$project->id}/launch/route", [
            'from' => [-2.44, -54.71],
            'via' => [[-2.441, -54.71]],
            'to' => [-2.441, -54.712],
        ])->assertOk();
        // 1º trecho pela via (3 pontos), 2º em linha reta (o ponto de referência não repete): 4 pontos.
        $res->assertJsonPath('source', 'mixed')->assertJsonCount(4, 'path')->assertJsonPath('straight_legs', [2])
            ->assertJsonPath('path.0', [-2.44, -54.71])->assertJsonPath('path.2', [-2.441, -54.71])->assertJsonPath('path.3', [-2.441, -54.712]);
    }

    public function test_road_class_order(): void
    {
        $this->assertSame('br', RoutingService::roadClass('Rodovia Governador Mário Covas', 'BR-101'));
        $this->assertSame('br', RoutingService::roadClass('BR-304', null));
        $this->assertSame('rodovia', RoutingService::roadClass('', 'RN-063'));
        $this->assertSame('rodovia', RoutingService::roadClass('Rodovia dos Bandeirantes', null));
        $this->assertSame('estrada', RoutingService::roadClass('Estrada da Redinha', null));
        $this->assertSame('avenida', RoutingService::roadClass('Avenida Prudente de Morais', null));
        $this->assertSame('rua', RoutingService::roadClass('Rua Apodi', null));
    }
}
