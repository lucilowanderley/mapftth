<?php

namespace App\Services;

use Illuminate\Http\Client\Pool;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Throwable;

/**
 * Caminho pelas vias entre dois pontos, usando servidores OSRM públicos (dados do OpenStreetMap, sem chave).
 *
 * Pede caminhos alternativos ao perfil de carro e ao perfil a pé e escolhe pela classe da via, na ordem de
 * preferência: BR (rodovia federal), rodovia estadual, estrada, avenida, rua. Cada trecho tem um peso pela
 * classe e vence o caminho de menor "metragem com peso": um desvio só compensa se for por uma via melhor.
 * Sem resposta de nenhum servidor, devolve a linha reta. ROUTING_URL no .env troca por um OSRM próprio.
 */
class RoutingService
{
    /** Classes de via, da preferida para a menos preferida, com o peso de cada metro. */
    public const CLASSES = [
        'br' => ['label' => 'BR', 'weight' => 1.0],
        'rodovia' => ['label' => 'Rodovias', 'weight' => 1.15],
        'estrada' => ['label' => 'Estradas', 'weight' => 1.3],
        'avenida' => ['label' => 'Avenidas', 'weight' => 1.45],
        'rua' => ['label' => 'Ruas', 'weight' => 1.6],
    ];

    /** Quantos caminhos devolver para o projetista escolher. */
    private const MAX_OPTIONS = 3;

    public function route(array $from, array $to): array
    {
        $key = 'route2:'.md5(json_encode([$from, $to, config('services.routing.url')]));
        $cached = Cache::get($key);
        if ($cached) {
            return $cached;
        }

        $options = [];
        foreach ($this->ask($from, $to) as $source => $routes) {
            foreach ($routes as $route) {
                $option = $this->option($source, $route, $from, $to);
                if ($option) {
                    $options[] = $option;
                }
            }
        }

        if (! $options) {
            $d = round(Geo::distance($from, $to), 1);

            return [
                'source' => 'line',
                'path' => [$from, $to],
                'distance_m' => $d,
                'roads' => [],
                'options' => [],
            ];
        }

        usort($options, fn ($a, $b) => $a['score'] <=> $b['score']);
        // Caminhos praticamente iguais (carro e a pé pela mesma via) aparecem uma vez só.
        $unique = [];
        foreach ($options as $o) {
            $dup = false;
            foreach ($unique as $u) {
                if (abs($u['distance_m'] - $o['distance_m']) < max(10, $u['distance_m'] * 0.01) && $u['roads'] == $o['roads']) {
                    $dup = true;
                    break;
                }
            }
            if (! $dup) {
                $unique[] = $o;
            }
        }
        $unique = array_slice($unique, 0, self::MAX_OPTIONS);
        $best = $unique[0];
        $result = [
            'source' => $best['source'],
            'path' => $best['path'],
            'distance_m' => $best['distance_m'],
            'roads' => $best['roads'],
            'options' => $unique,
        ];
        Cache::put($key, $result, now()->addDay());

        return $result;
    }

    /**
     * Caminho passando pelos pontos de referência, na ordem. Cada trecho entre dois pontos segue a mesma
     * preferência de vias de route(); os trechos são emendados. Um trecho sem resposta fica em linha reta.
     */
    public function routeVia(array $points): array
    {
        $path = [];
        $meters = [];
        $names = [];
        $sources = [];
        for ($i = 0; $i < count($points) - 1; $i++) {
            $leg = $this->route($points[$i], $points[$i + 1]);
            $sources[] = $leg['source'];
            $legPath = $leg['path'];
            if ($path) {
                array_shift($legPath);
            }
            array_push($path, ...$legPath);
            $roads = $leg['roads'] ?: [['class' => 'rua', 'meters' => round(Geo::pathLength($leg['path']))]];
            foreach ($roads as $r) {
                $meters[$r['class']] = ($meters[$r['class']] ?? 0) + $r['meters'];
            }
            foreach ($leg['options'][0]['names'] ?? [] as $n) {
                $names[$n] = true;
            }
        }
        $lines = count(array_filter($sources, fn ($s) => $s === 'line'));
        $roads = [];
        foreach (self::CLASSES as $class => $c) {
            if (($meters[$class] ?? 0) >= 1) {
                $roads[] = ['class' => $class, 'label' => $c['label'], 'meters' => round($meters[$class])];
            }
        }

        return [
            'source' => $lines === count($sources) ? 'line' : ($lines ? 'mixed' : 'osrm'),
            'path' => $path,
            'distance_m' => round(Geo::pathLength($path), 1),
            'roads' => $lines === count($sources) ? [] : $roads,
            'names' => array_slice(array_keys($names), 0, 4),
            'options' => [],
            // Trechos (entre pontos seguidos) que ficaram em linha reta, contados a partir de 1.
            'straight_legs' => array_map(fn ($k) => $k + 1, array_keys(array_filter($sources, fn ($s) => $s === 'line'))),
        ];
    }

    /**
     * Classe da via pelo número (ref) e pelo nome do trecho.
     * BR-101 → br; RN-063, SP 280 → rodovia; "Rodovia ..." → rodovia; "Estrada ..." → estrada; "Avenida ..." → avenida.
     */
    public static function roadClass(?string $name, ?string $ref): string
    {
        $ref = strtoupper(trim((string) $ref));
        $name = trim((string) $name);
        if (preg_match('/(^|[;\s])BR[-\s]?\d/', $ref) || preg_match('/\bBR[-\s]?\d{3}\b/i', $name)) {
            return 'br';
        }
        if (preg_match('/(^|[;\s])[A-Z]{2,3}[-\s]?\d{2,3}\b/', $ref) || preg_match('/^(rodovia|rod\.|autoestrada|via expressa)\b/iu', $name)
            || preg_match('/\b[A-Z]{2}[-\s]\d{3}\b/', $name)) {
            return 'rodovia';
        }
        if (preg_match('/^(estrada|est\.|caminho|ramal|linha)\b/iu', $name)) {
            return 'estrada';
        }
        if (preg_match('/^(avenida|av\.?|marginal|via)\b/iu', $name)) {
            return 'avenida';
        }

        return 'rua';
    }

    /** @return array<string, array> fonte => rotas OSRM */
    private function ask(array $from, array $to): array
    {
        $coords = sprintf('%.7F,%.7F;%.7F,%.7F', $from[1], $from[0], $to[1], $to[0]);
        $custom = config('services.routing.url');
        $servers = $custom
            ? ['osrm' => rtrim($custom, '/')]
            : ['osrm-car' => 'https://router.project-osrm.org', 'osrm-foot' => 'https://routing.openstreetmap.de/routed-foot'];
        $query = ['overview' => 'full', 'geometries' => 'geojson', 'steps' => 'true', 'alternatives' => '3'];

        try {
            $responses = Http::pool(function (Pool $pool) use ($servers, $coords, $query) {
                $out = [];
                foreach ($servers as $name => $base) {
                    $out[] = $pool->as($name)
                        ->withHeaders(['User-Agent' => 'MapFTTH/1.0 (planejamento de redes de fibra)'])
                        ->timeout(10)
                        ->get($base.'/route/v1/driving/'.$coords, $query);
                }

                return $out;
            });
        } catch (Throwable) {
            return [];
        }

        $out = [];
        foreach (array_keys($servers) as $name) {
            $res = $responses[$name] ?? null;
            if (! $res instanceof \Illuminate\Http\Client\Response || ! $res->ok()) {
                continue;
            }
            $routes = $res->json('routes');
            if (is_array($routes) && $routes) {
                $out[$name] = $routes;
            }
        }

        return $out;
    }

    /** Converte uma rota OSRM em opção: caminho, metros por classe de via e a nota (menor = melhor). */
    private function option(string $source, array $route, array $from, array $to): ?array
    {
        $line = $route['geometry']['coordinates'] ?? null;
        if (! is_array($line) || count($line) < 2) {
            return null;
        }
        $path = array_map(fn ($c) => [round((float) $c[1], 7), round((float) $c[0], 7)], $line);
        // O roteador começa e termina na via: liga os pontos pedidos às pontas do caminho.
        $lead = Geo::distance($from, $path[0]);
        $tail = Geo::distance($to, $path[count($path) - 1]);
        if ($lead > 1) {
            array_unshift($path, $from);
        }
        if ($tail > 1) {
            $path[] = $to;
        }

        $meters = array_fill_keys(array_keys(self::CLASSES), 0.0);
        $names = [];
        foreach ($route['legs'] ?? [] as $leg) {
            foreach ($leg['steps'] ?? [] as $step) {
                $d = (float) ($step['distance'] ?? 0);
                if ($d <= 0) {
                    continue;
                }
                $class = self::roadClass($step['name'] ?? null, $step['ref'] ?? null);
                $meters[$class] += $d;
                $label = trim((string) ($step['ref'] ?? '')) ?: trim((string) ($step['name'] ?? ''));
                if ($label !== '' && $class !== 'rua') {
                    $names[$label] = ($names[$label] ?? 0) + $d;
                }
            }
        }
        // Os metros dos passos acompanham o desenho do caminho; o que sobra (ligação até os pontos pedidos ou
        // servidor sem passos) conta como rua.
        $total = Geo::pathLength($path);
        $known = array_sum($meters);
        if ($known > $total * 1.02 && $known > 0) {
            foreach ($meters as $c => $m) {
                $meters[$c] = $m * $total / $known;
            }
            $known = $total;
        }
        $meters['rua'] += max(0, $total - $known);

        $score = 0.0;
        foreach ($meters as $class => $m) {
            $score += $m * self::CLASSES[$class]['weight'];
        }
        arsort($names);

        $roads = [];
        foreach ($meters as $class => $m) {
            if ($m >= 1) {
                $roads[] = ['class' => $class, 'label' => self::CLASSES[$class]['label'], 'meters' => round($m)];
            }
        }

        return [
            'source' => $source,
            'path' => $path,
            'distance_m' => round($total, 1),
            'score' => round($score, 1),
            'roads' => $roads,
            'names' => array_slice(array_keys($names), 0, 4),
        ];
    }
}
