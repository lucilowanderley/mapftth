<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Throwable;

/**
 * Caminho pelas ruas entre dois pontos, usando servidores OSRM públicos (dados do OpenStreetMap, sem chave).
 * Primeiro o perfil a pé (não respeita contramão, melhor para o traçado de poste), depois o de carro.
 * Sem resposta de nenhum, devolve a linha reta. ROUTING_URL no .env troca por um OSRM próprio.
 */
class RoutingService
{
    public function route(array $from, array $to): array
    {
        $key = 'route:'.md5(json_encode([$from, $to]));
        $cached = Cache::get($key);
        if ($cached) {
            return $cached;
        }
        foreach ($this->servers() as $name => $base) {
            $result = $this->ask($name, $base, $from, $to);
            if ($result) {
                Cache::put($key, $result, now()->addDay());

                return $result;
            }
        }

        return [
            'source' => 'line',
            'path' => [$from, $to],
            'distance_m' => round(Geo::distance($from, $to), 1),
        ];
    }

    /** @return array<string, string> nome => URL base (sem /route/v1). */
    private function servers(): array
    {
        $custom = config('services.routing.url');
        if ($custom) {
            return ['custom' => rtrim($custom, '/')];
        }

        return [
            'osrm-foot' => 'https://routing.openstreetmap.de/routed-foot',
            'osrm-car' => 'https://router.project-osrm.org',
        ];
    }

    private function ask(string $name, string $base, array $from, array $to): ?array
    {
        $coords = sprintf('%.7F,%.7F;%.7F,%.7F', $from[1], $from[0], $to[1], $to[0]);
        try {
            $res = Http::withHeaders(['User-Agent' => 'MapFTTH/1.0 (planejamento de redes de fibra)'])
                ->timeout(8)
                ->get($base.'/route/v1/driving/'.$coords, ['overview' => 'full', 'geometries' => 'geojson']);
        } catch (Throwable) {
            return null;
        }
        $route = $res->ok() ? ($res->json('routes.0') ?? null) : null;
        $line = $route['geometry']['coordinates'] ?? null;
        if (! is_array($line) || count($line) < 2) {
            return null;
        }
        $path = array_map(fn ($c) => [round((float) $c[1], 7), round((float) $c[0], 7)], $line);
        // O roteador começa e termina na rua: liga os pontos pedidos às pontas do caminho.
        if (Geo::distance($from, $path[0]) > 1) {
            array_unshift($path, $from);
        }
        if (Geo::distance($to, $path[count($path) - 1]) > 1) {
            $path[] = $to;
        }

        return [
            'source' => $name === 'custom' ? 'osrm' : $name,
            'path' => $path,
            'distance_m' => round(Geo::pathLength($path), 1),
        ];
    }
}
