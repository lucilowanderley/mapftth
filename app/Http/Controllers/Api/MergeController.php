<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\NetworkNode;
use App\Models\Project;
use App\Services\DiagramRefs;
use App\Services\Geo;
use App\Services\NodeSharing;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Unir: junta vários cabos (ou vários dutos) ligados ponta com ponta num objeto só.
 *
 * Cabos: nas junções sem emenda o cabo segue direto (passagem) e vira um cabo só. Onde os cabos se
 * encontram numa CTO, CEO, caixa ou POP com emendas, a caixa vira sangria: o cabo continua em trechos
 * (Base · T1, T2...) ligados ali, as emendas ficam como estão e as fibras livres passam direto.
 * Tudo o que estava preso nos cabos (CTO/CEO e reservas fixadas, dutos por onde passam, diagramas das
 * caixas das pontas) passa para o cabo unido.
 */
class MergeController extends Controller
{
    /** Distância máxima (m) entre pontas soltas para considerar que os cabos se encontram. */
    private const MEET_M = 3.0;

    /** Objetos com diagrama de fusão (onde pode haver emenda e sangria). */
    private const BOX_TYPES = ['dc', 'pop', 'tower', 'ceo', 'cto', 'box', 'condo'];

    public function cables(Request $request, Project $project): JsonResponse
    {
        $this->authorizeProject($request, $project, 'edit');
        $data = $request->validate([
            'ids' => ['required', 'array', 'min:2', 'max:100'],
            'ids.*' => ['integer', 'distinct', Rule::exists('cables', 'id')->where('project_id', $project->id)],
        ]);
        $byId = $project->cables()->whereIn('id', $data['ids'])->get()->keyBy('id');
        $items = collect($data['ids'])->map(fn ($id) => [
            'id' => $id, 'path' => $byId[$id]->path ?? [], 'from' => $byId[$id]->from_node_id, 'to' => $byId[$id]->to_node_id,
        ])->all();
        $chain = $this->chain($items, 'cabos');
        $order = array_flip($data['ids']);

        $nodeIds = $byId->flatMap(fn ($c) => [$c->from_node_id, $c->to_node_id])->filter()->unique()->values();
        $nodes = NetworkNode::whereIn('id', $nodeIds)->get()->keyBy('id');

        // Junções: entre o cabo k e o k+1 da sequência.
        $junctions = [];
        for ($k = 0; $k < count($chain) - 1; $k++) {
            $left = $chain[$k];
            $right = $chain[$k + 1];
            $nodeId = $left['to'] ?? $right['from'];
            $node = $nodeId ? $nodes[$nodeId] ?? null : null;
            $sangria = false;
            if ($node && in_array($node->type, self::BOX_TYPES, true)) {
                $sangria = $this->hasSplices($node->diagram, $left['id'], $right['id']);
            }
            $a = $byId[$left['id']];
            $b = $byId[$right['id']];
            if (! $sangria && $a->fiber_count !== $b->fiber_count) {
                throw ValidationException::withMessages(['ids' => "{$a->name} ({$a->fiber_count} FO) e {$b->name} ({$b->fiber_count} FO) têm quantidades de fibras diferentes: só dá para unir numa caixa com emendas (sangria)."]);
            }
            $junctions[] = ['node' => $node, 'sangria' => $sangria];
        }

        // Grupos: trechos contínuos entre as sangrias. Cada grupo vira um cabo (o 1º da sequência fica).
        $groups = [[]];
        foreach ($chain as $k => $item) {
            $groups[count($groups) - 1][] = $item;
            if ($k < count($junctions) && $junctions[$k]['sangria']) {
                $groups[] = [];
            }
        }

        $sharing = new NodeSharing($request->user());
        $canEdit = function (NetworkNode $node) use ($project, $sharing) {
            if ((int) $node->project_id !== $project->id) {
                abort_unless($sharing->canEditIn((int) $node->project_id), 403, "Você não pode editar o projeto de origem de {$node->name}.");
            }
        };

        $result = DB::transaction(function () use ($project, $byId, $chain, $junctions, $groups, $nodes, $canEdit, $order) {
            /** @var array<int, array> $diagrams diagramas alterados, por objeto */
            $diagrams = [];
            $diagramOf = function (int $nodeId) use (&$diagrams, $nodes) {
                return $diagrams[$nodeId] ?? ($nodes[$nodeId]->diagram ?: null);
            };

            // Junções sem emenda: o cabo só passa; some do diagrama da caixa (se houver).
            foreach ($junctions as $k => $j) {
                if ($j['sangria'] || ! $j['node'] || ! in_array($j['node']->type, self::BOX_TYPES, true)) {
                    continue;
                }
                $id = $j['node']->id;
                $d = $diagramOf($id);
                if ($d) {
                    $d = DiagramRefs::forget($d, $chain[$k]['id']);
                    $diagrams[$id] = DiagramRefs::forget($d, $chain[$k + 1]['id']);
                }
            }

            $base = preg_replace('/ · T\d+$/u', '', $byId[$this->firstPicked($chain, $order)]->name);
            $map = [];
            $survivors = [];
            $removed = [];
            $pos = 0;
            foreach ($groups as $g => $group) {
                // Fica o cabo marcado primeiro (de cada trecho), com as características dele.
                $first = $byId[$this->firstPicked($group, $order)];
                $path = [];
                $slacks = [];
                $hasSlacks = false;
                $slackM = 0;
                foreach ($group as $i => $item) {
                    $c = $byId[$item['id']];
                    $map[$c->id] = $first->id;
                    $pts = $item['path'];
                    $path = $i === 0 ? $pts : [...$path, ...array_slice($pts, 1)];
                    $hasSlacks = $hasSlacks || (bool) $c->slacks;
                    $slacks = [...$slacks, ...($c->slacks ?? [])];
                    $slackM += (int) $c->slack_m;
                }
                $from = $group[0]['from'];
                $to = $group[count($group) - 1]['to'];
                // Ponta da sangria: fica ligada (e exatamente sobre) a caixa, mesmo se o cabo estava solto ali.
                if ($g > 0 && ($n = $junctions[$pos - 1]['node'] ?? null)) {
                    $from = $n->id;
                    $path[0] = [(float) $n->lat, (float) $n->lng];
                }
                $pos += count($group);
                if ($g < count($groups) - 1 && ($n = $junctions[$pos - 1]['node'])) {
                    $to = $n->id;
                    $path[count($path) - 1] = [(float) $n->lat, (float) $n->lng];
                }
                if ($from && $from === $to) {
                    throw ValidationException::withMessages(['ids' => 'Os cabos formam um anel: o cabo unido começaria e terminaria no mesmo objeto.']);
                }
                $attrs = [
                    'name' => count($groups) > 1 ? $base.' · T'.($g + 1) : $base,
                    'path' => $path,
                    'from_node_id' => $from,
                    'to_node_id' => $to,
                ];
                if ($hasSlacks) {
                    $attrs['slacks'] = $slacks ?: null;
                } else {
                    $attrs['slack_m'] = $slackM;
                }
                $survivors[] = ['cable' => $first, 'attrs' => $attrs, 'group' => $group];
            }

            // Reservas presas no próprio cabo passam a apontar para o cabo unido.
            foreach ($survivors as $k => $s) {
                if (isset($s['attrs']['slacks'])) {
                    $survivors[$k]['attrs']['slacks'] = array_map(function ($r) use ($map) {
                        if (($r['fixed_kind'] ?? null) === 'cable' && isset($r['fixed_id'], $map[(int) $r['fixed_id']])) {
                            $r['fixed_id'] = $map[(int) $r['fixed_id']];
                        }

                        return $r;
                    }, $s['attrs']['slacks']);
                }
            }

            // Diagramas das caixas: cabos que somem viram o cabo unido.
            $junctionPlain = [];
            foreach ($junctions as $j) {
                if (! $j['sangria'] && $j['node']) {
                    $junctionPlain[$j['node']->id] = true;
                }
            }
            foreach ($byId as $c) {
                if ($map[$c->id] === $c->id) {
                    continue;
                }
                foreach (array_unique(array_filter([$c->from_node_id, $c->to_node_id])) as $nodeId) {
                    if (isset($junctionPlain[$nodeId]) || ! isset($nodes[$nodeId])) {
                        continue;
                    }
                    if ($d = $diagramOf($nodeId)) {
                        $diagrams[$nodeId] = DiagramRefs::rename($d, $c->id, $map[$c->id]);
                    }
                }
            }

            // Sangrias: emendas ficam; as fibras livres dos dois trechos passam direto.
            $sangrias = [];
            foreach ($junctions as $k => $j) {
                if (! $j['sangria']) {
                    continue;
                }
                $node = $j['node'];
                $in = $byId[$map[$chain[$k]['id']]];
                $out = $byId[$map[$chain[$k + 1]['id']]];
                $d = ($diagramOf($node->id) ?: []) + ['components' => [], 'cablePos' => [], 'connections' => []];
                $usedIn = DiagramRefs::usedFibers($d, $in->id);
                $usedOut = DiagramRefs::usedFibers($d, $out->id);
                $passes = 0;
                $fibers = min($byId[$chain[$k]['id']]->fiber_count, $byId[$chain[$k + 1]['id']]->fiber_count);
                for ($f = 1; $f <= $fibers; $f++) {
                    if (isset($usedIn[$f]) || isset($usedOut[$f])) {
                        continue;
                    }
                    $d['connections'][] = [
                        'id' => 'p'.$in->id.'x'.$out->id.'f'.$f,
                        'a' => ['c' => 'c'.$in->id, 'p' => 'f'.$f],
                        'b' => ['c' => 'c'.$out->id, 'p' => 'f'.$f],
                        'pass' => true,
                    ];
                    $passes++;
                }
                $diagrams[$node->id] = $d;
                $sangrias[] = ['node_id' => $node->id, 'name' => $node->name, 'passes' => $passes];
            }

            $touched = collect();
            foreach ($diagrams as $nodeId => $d) {
                $node = $nodes[$nodeId];
                if ($d == $node->diagram) {
                    continue;
                }
                $canEdit($node);
                $node->diagram = $d;
                $node->save();
                $touched->put($node->id, $node);
            }

            // CTO/CEO fixadas num cabo que sumiu passam para o cabo unido.
            foreach ($project->visibleNodes()->get() as $node) {
                $a = $node->attributes ?? [];
                if (($a['fixed_kind'] ?? null) !== 'cable' || ! isset($a['fixed_id'], $map[(int) $a['fixed_id']]) || $map[(int) $a['fixed_id']] === (int) $a['fixed_id']) {
                    continue;
                }
                $canEdit($node);
                $a['fixed_id'] = $map[(int) $a['fixed_id']];
                $node->attributes = $a;
                $node->save();
                $touched->put($node->id, $node);
            }

            // Dutos: os cabos que somem viram o cabo unido.
            $ducts = collect();
            foreach ($project->ducts()->get() as $duct) {
                $ids = array_map(fn ($id) => $map[(int) $id] ?? (int) $id, $duct->cable_ids ?? []);
                $ids = array_values(array_unique($ids));
                if ($ids !== array_values(array_unique(array_map('intval', $duct->cable_ids ?? [])))) {
                    $duct->cable_ids = $ids;
                    $duct->save();
                    $ducts->push($duct->fresh());
                }
            }

            foreach ($byId as $c) {
                if ($map[$c->id] !== $c->id) {
                    ActivityLog::record($project, 'cable', $c, 'deleted', ['união' => 'unido em '.$byId[$map[$c->id]]->name]);
                    $removed[] = $c->id;
                    $c->delete();
                }
            }
            $cables = [];
            foreach ($survivors as $s) {
                $s['cable']->update($s['attrs']);
                $cables[] = $s['cable']->fresh();
                $names = collect($s['group'])->map(fn ($i) => $i['id'])->all();
                ActivityLog::record($project, 'cable', $s['cable'], 'updated', [
                    'união' => count($names).' cabo(s) unidos'.($sangrias ? ' com sangria em '.collect($sangrias)->pluck('name')->implode(', ') : ''),
                ]);
            }
            $project->touch();

            return [
                'cables' => $cables,
                'removed' => $removed,
                'nodes' => $touched->map(fn ($n) => $n->fresh())->values(),
                'ducts' => $ducts->values(),
                'sangrias' => $sangrias,
            ];
        });

        return response()->json($result);
    }

    public function ducts(Request $request, Project $project): JsonResponse
    {
        $this->authorizeProject($request, $project, 'edit');
        $data = $request->validate([
            'ids' => ['required', 'array', 'min:2', 'max:100'],
            'ids.*' => ['integer', 'distinct', Rule::exists('ducts', 'id')->where('project_id', $project->id)],
        ]);
        $byId = $project->ducts()->whereIn('id', $data['ids'])->get()->keyBy('id');
        $items = collect($data['ids'])->map(fn ($id) => [
            'id' => $id, 'path' => $byId[$id]->path ?? [], 'from' => $byId[$id]->from_node_id, 'to' => $byId[$id]->to_node_id,
        ])->all();
        $chain = $this->chain($items, 'dutos');
        $first = $byId[$this->firstPicked($chain, array_flip($data['ids']))];
        $path = [];
        $cableIds = [];
        foreach ($chain as $i => $item) {
            $path = $i === 0 ? $item['path'] : [...$path, ...array_slice($item['path'], 1)];
            $cableIds = [...$cableIds, ...($byId[$item['id']]->cable_ids ?? [])];
        }
        $from = $chain[0]['from'];
        $to = $chain[count($chain) - 1]['to'];
        if ($from && $from === $to) {
            throw ValidationException::withMessages(['ids' => 'Os dutos formam um anel: o duto unido começaria e terminaria no mesmo objeto.']);
        }

        $duct = DB::transaction(function () use ($project, $byId, $first, $path, $from, $to, $cableIds) {
            foreach ($byId as $d) {
                if ($d->id !== $first->id) {
                    ActivityLog::record($project, 'duct', $d, 'deleted', ['união' => 'unido em '.$first->name]);
                    $d->delete();
                }
            }
            $first->update(['path' => $path, 'from_node_id' => $from, 'to_node_id' => $to, 'cable_ids' => $cableIds]);
            ActivityLog::record($project, 'duct', $first, 'updated', ['união' => count($byId).' dutos unidos']);
            $project->touch();

            return $first->fresh();
        });

        return response()->json(['duct' => $duct, 'removed' => $byId->keys()->filter(fn ($id) => $id !== $first->id)->values()]);
    }

    /**
     * Ordena os itens numa sequência ponta com ponta, virando os que estiverem ao contrário.
     * Pontas se encontram no mesmo objeto ou, com uma delas solta, a até MEET_M metros.
     *
     * @param  array<int, array{id:int, path:array, from:?int, to:?int}>  $items
     * @return array<int, array{id:int, path:array, from:?int, to:?int}>
     */
    private function chain(array $items, string $what): array
    {
        $end = function (array $item, string $side) {
            $path = $item['path'];

            return $side === 'head'
                ? ['node' => $item['from'], 'pt' => $path[0] ?? null]
                : ['node' => $item['to'], 'pt' => $path[count($path) - 1] ?? null];
        };
        $meets = function (array $a, array $b) {
            if ($a['node'] && $b['node']) {
                return $a['node'] === $b['node'];
            }

            return $a['pt'] && $b['pt'] && Geo::distance($a['pt'], $b['pt']) <= self::MEET_M;
        };
        $flip = fn (array $item) => ['id' => $item['id'], 'path' => array_reverse($item['path']), 'from' => $item['to'], 'to' => $item['from']];
        $count = function (array $e, int $self) use ($items, $end, $meets) {
            $n = 0;
            foreach ($items as $j => $other) {
                if ($j !== $self && ($meets($e, $end($other, 'head')) || $meets($e, $end($other, 'tail')))) {
                    $n++;
                }
            }

            return $n;
        };

        $start = null;
        foreach ($items as $i => $item) {
            foreach (['head', 'tail'] as $side) {
                $n = $count($end($item, $side), $i);
                if ($n > 1) {
                    throw ValidationException::withMessages(['ids' => "Mais de dois {$what} se encontram no mesmo ponto: selecione só os de um caminho, sem ramificação."]);
                }
                if ($n === 0 && $start === null) {
                    $start = [$i, $side];
                }
            }
        }
        if ($start === null) {
            throw ValidationException::withMessages(['ids' => "Os {$what} formam um anel: deixe um deles de fora."]);
        }

        [$i, $side] = $start;
        $chain = [$side === 'head' ? $items[$i] : $flip($items[$i])];
        $used = [$i => true];
        while (count($used) < count($items)) {
            $tail = $end($chain[count($chain) - 1], 'tail');
            $next = null;
            foreach ($items as $j => $item) {
                if (isset($used[$j])) {
                    continue;
                }
                if ($meets($tail, $end($item, 'head'))) {
                    $next = [$j, $item];
                } elseif ($meets($tail, $end($item, 'tail'))) {
                    $next = [$j, $flip($item)];
                }
                if ($next) {
                    break;
                }
            }
            if (! $next) {
                throw ValidationException::withMessages(['ids' => "Os {$what} precisam estar ligados ponta com ponta, em sequência (no mesmo objeto ou a até ".(int) self::MEET_M.' m).']);
            }
            $used[$next[0]] = true;
            $chain[] = $next[1];
        }

        // O caminho segue o sentido do primeiro marcado.
        $pick = collect($chain)->search(fn ($c) => $c['id'] === $items[0]['id']);
        if ($chain[$pick]['path'] !== $items[0]['path']) {
            $chain = array_reverse(array_map($flip, $chain));
        }

        return $chain;
    }

    /** Id do item da sequência que foi marcado primeiro. */
    private function firstPicked(array $chain, array $order): int
    {
        return collect($chain)->sortBy(fn ($c) => $order[$c['id']])->first()['id'];
    }

    /**
     * A caixa tem emenda nas fibras dos dois cabos? Passagem direta da mesma fibra de um para o
     * outro não conta (o cabo pode seguir inteiro); qualquer fusão, conector ou ligação com outro
     * cabo/splitter conta.
     */
    private function hasSplices(?array $diagram, int $a, int $b): bool
    {
        $ka = 'c'.$a;
        $kb = 'c'.$b;
        foreach ([...DiagramRefs::connectionsOf($diagram, $a), ...DiagramRefs::connectionsOf($diagram, $b)] as $c) {
            $ca = $c['a']['c'] ?? null;
            $cb = $c['b']['c'] ?? null;
            $straight = ! empty($c['pass'])
                && (($ca === $ka && $cb === $kb) || ($ca === $kb && $cb === $ka))
                && ($c['a']['p'] ?? null) === ($c['b']['p'] ?? null);
            if (! $straight) {
                return true;
            }
        }

        return false;
    }
}
