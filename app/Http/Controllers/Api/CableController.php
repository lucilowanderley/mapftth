<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Cable;
use App\Models\Duct;
use App\Models\NetworkNode;
use App\Models\Project;
use App\Services\DiagramRefs;
use App\Services\Geo;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class CableController extends Controller
{
    public function store(Request $request, Project $project): JsonResponse
    {
        $this->authorizeProject($request, $project, 'edit');
        $data = $this->validated($request, $project);
        $data['name'] ??= 'Cabo '.($data['fiber_count'] ?? 12).'FO';
        $cable = $project->cables()->create($data);
        ActivityLog::record($project, 'cable', $cable, 'created');
        $project->touch();

        return response()->json($cable->fresh(), 201);
    }

    public function update(Request $request, Cable $cable): JsonResponse
    {
        $this->authorizeProject($request, $cable->project, 'edit');
        $data = $this->validated($request, $cable->project, partial: true);
        $fields = [];
        foreach ($data as $key => $value) {
            if ($key === 'slacks') {
                if ($value != $cable->slacks) {
                    $fields['reservas'] = count($cable->slacks ?? []).' → '.count($value ?? []).' reservas';
                }
            } elseif ($key !== 'path' && $value != $cable->{$key}) {
                $fields[$key] = ['de' => $cable->{$key}, 'para' => $value];
            }
        }
        if (array_key_exists('path', $data) && $data['path'] != $cable->path) {
            $fields['path'] = 'traçado alterado';
        }
        $oldEnds = [$cable->from_node_id, $cable->to_node_id];
        $oldFibers = $cable->fiber_count;
        $cable->update($data);

        // Se as pontas mudaram ou o cabo encolheu, limpa fusões que ficaram órfãs.
        $nodes = collect();
        foreach (array_unique(array_filter($oldEnds)) as $nodeId) {
            $stillHere = in_array($nodeId, [$cable->from_node_id, $cable->to_node_id], true);
            if (! $stillHere || $cable->fiber_count < $oldFibers) {
                $node = NetworkNode::find($nodeId);
                if ($node && $this->pruneDiagram($node, $cable->id, $stillHere ? $cable->fiber_count : 0)) {
                    $nodes->push($node);
                }
            }
        }
        if ($fields) {
            ActivityLog::record($cable->project, 'cable', $cable, 'updated', $fields);
        }
        $cable->project->touch();

        return response()->json(['cable' => $cable->fresh(), 'nodes' => $nodes->values()]);
    }

    public function destroy(Request $request, Cable $cable): JsonResponse
    {
        $this->authorizeProject($request, $cable->project, 'edit');
        ActivityLog::record($cable->project, 'cable', $cable, 'deleted');
        $nodes = collect();
        foreach (array_unique(array_filter([$cable->from_node_id, $cable->to_node_id])) as $nodeId) {
            $node = NetworkNode::find($nodeId);
            if ($node && $this->pruneDiagram($node, $cable->id, 0)) {
                $nodes->push($node);
            }
        }
        Duct::forgetCable($cable);
        $cable->delete();

        return response()->json(['nodes' => $nodes->values()]);
    }

    /**
     * Sangria: divide o cabo em trechos nas caixas indicadas. Cada corte é um vértice
     * do traçado (`index`) que passa a ficar sobre a caixa (`node_id`). O 1º trecho
     * mantém o cabo original; os demais são cabos novos com as mesmas características.
     * Dentro de cada caixa as fibras dos dois trechos ficam ligadas em passagem direta
     * (sem fusão), prontas para o projetista derivar só as fibras que for usar.
     */
    public function split(Request $request, Cable $cable): JsonResponse
    {
        $project = $cable->project;
        $this->authorizeProject($request, $project, 'edit');
        $data = $request->validate([
            'path' => ['required', 'array', 'min:3'],
            'path.*' => ['array', 'size:2'],
            'path.*.*' => ['numeric'],
            'cuts' => ['required', 'array', 'min:1'],
            'cuts.*.index' => ['required', 'integer', 'min:1'],
            'cuts.*.node_id' => ['required', 'integer', $project->nodeRule()],
        ]);
        $path = array_map(fn ($p) => [(float) $p[0], (float) $p[1]], $data['path']);
        $last = count($path) - 1;
        $cuts = collect($data['cuts'])->sortBy('index')->values();

        $seen = [$cable->from_node_id, $cable->to_node_id];
        $prev = 0;
        foreach ($cuts as $cut) {
            if ($cut['index'] >= $last || $cut['index'] <= $prev) {
                throw ValidationException::withMessages(['cuts' => 'A sangria precisa ser num ponto do meio do cabo.']);
            }
            if (in_array($cut['node_id'], $seen, true)) {
                throw ValidationException::withMessages(['cuts' => 'O cabo já está ligado a esta caixa.']);
            }
            $seen[] = $cut['node_id'];
            $prev = $cut['index'];
        }
        $nodes = NetworkNode::whereIn('id', $cuts->pluck('node_id'))->get()->keyBy('id');
        foreach ($nodes as $node) {
            if ($node->type === 'client' || $node->type === 'pole') {
                throw ValidationException::withMessages(['cuts' => 'A sangria só pode ser feita em CTO, CEO, POP, datacenter, torre ou condomínio.']);
            }
        }

        // Pontas e cortes ficam exatamente sobre os objetos.
        foreach ([[0, $cable->from_node_id], [$last, $cable->to_node_id]] as [$i, $nodeId]) {
            if ($nodeId && ($n = NetworkNode::find($nodeId))) {
                $path[$i] = [$n->lat, $n->lng];
            }
        }
        foreach ($cuts as $cut) {
            $n = $nodes[$cut['node_id']];
            $path[$cut['index']] = [$n->lat, $n->lng];
        }

        // Nome dos trechos: "Base · T1", "Base · T2"...
        $base = preg_replace('/ · T\d+$/u', '', $cable->name);
        $numbers = $project->cables()->where('name', 'like', $base.' · T%')->pluck('name')
            ->map(fn ($name) => (int) preg_replace('/^.* · T(\d+)$/u', '$1', $name));
        $next = max(1, (int) $numbers->max()) + 1;
        $firstName = $base === $cable->name ? $base.' · T1' : $cable->name;

        $touched = collect();
        $segments = DB::transaction(function () use ($cable, $project, $path, $cuts, $nodes, $base, $firstName, &$next, &$touched) {
            $oldId = $cable->id;
            $oldTo = $cable->to_node_id;
            $bounds = [0, ...$cuts->pluck('index')->all(), count($path) - 1];
            $ends = [$cable->from_node_id, ...$cuts->pluck('node_id')->all(), $cable->to_node_id];

            // Cada reserva posicionada vai para o trecho mais próximo dela.
            $paths = [];
            for ($k = 0; $k < count($bounds) - 1; $k++) {
                $paths[] = array_slice($path, $bounds[$k], $bounds[$k + 1] - $bounds[$k] + 1);
            }
            $slacksBySeg = array_fill(0, count($paths), []);
            foreach ($cable->slacks ?? [] as $slack) {
                $dists = array_map(fn ($p) => Geo::distanceToPath([$slack['lat'], $slack['lng']], $p), $paths);
                $slacksBySeg[array_search(min($dists), $dists, true)][] = $slack;
            }
            $hasSlacks = (bool) $cable->slacks;

            $segments = [];
            for ($k = 0; $k < count($bounds) - 1; $k++) {
                $attrs = [
                    'path' => $paths[$k],
                    'from_node_id' => $ends[$k],
                    'to_node_id' => $ends[$k + 1],
                ];
                if ($hasSlacks) {
                    $attrs['slacks'] = $slacksBySeg[$k] ?: null;
                    $attrs['slack_m'] = (int) array_sum(array_column($slacksBySeg[$k], 'length_m'));
                }
                if ($k === 0) {
                    $cable->update($attrs + ['name' => $firstName]);
                    $segments[] = $cable;
                } else {
                    $segments[] = $project->cables()->create($attrs + [
                        'name' => $base.' · T'.($next++),
                        'category' => $cable->category,
                        'model' => $cable->model,
                        'fiber_count' => $cable->fiber_count,
                        'fibers_per_tube' => $cable->fibers_per_tube,
                        'loss_db_km' => $cable->loss_db_km,
                        'status' => $cable->status,
                        'color' => $cable->color,
                        'width' => $cable->width,
                        'line_style' => $cable->line_style,
                        'notes' => $cable->notes,
                    ] + ['slack_m' => 0]);
                }
            }
            $lastSeg = end($segments);

            // A caixa do fim do cabo original passa a enxergar o último trecho.
            if ($oldTo && $lastSeg->id !== $oldId && ($node = NetworkNode::find($oldTo))) {
                if ($this->renameCableInDiagram($node, $oldId, $lastSeg->id)) {
                    $touched->put($node->id, $node);
                }
            }

            // Passagem direta das fibras em cada caixa sangrada.
            foreach ($cuts as $k => $cut) {
                $node = $nodes[$cut['node_id']];
                $in = $segments[$k];
                $out = $segments[$k + 1];
                $diagram = $node->diagram ?: [];
                $diagram += ['components' => [], 'cablePos' => [], 'connections' => []];
                for ($f = 1; $f <= $cable->fiber_count; $f++) {
                    $diagram['connections'][] = [
                        'id' => 'p'.$in->id.'x'.$out->id.'f'.$f,
                        'a' => ['c' => 'c'.$in->id, 'p' => 'f'.$f],
                        'b' => ['c' => 'c'.$out->id, 'p' => 'f'.$f],
                        'pass' => true,
                    ];
                }
                $node->diagram = $diagram;
                $node->save();
                $touched->put($node->id, $node);
            }

            $names = $cuts->map(fn ($c) => $nodes[$c['node_id']]->name)->implode(', ');
            ActivityLog::record($project, 'cable', $cable, 'updated', [
                'sangria' => 'dividido em '.count($segments).' trechos em '.$names,
            ]);
            foreach (array_slice($segments, 1) as $seg) {
                ActivityLog::record($project, 'cable', $seg, 'created', ['sangria' => 'trecho de '.$base]);
            }
            $project->touch();

            return $segments;
        });

        // Trechos novos que correm dentro de um duto onde o cabo original passava também ficam nele.
        $ducts = collect();
        foreach ($project->ducts()->get() as $duct) {
            if (! in_array($cable->id, $duct->cable_ids ?? [], true)) {
                continue;
            }
            $ids = $duct->cable_ids;
            foreach (array_slice($segments, 1) as $seg) {
                $mid = Geo::pointAlong($seg->path, Geo::pathLength($seg->path) / 2);
                if (Geo::distanceToPath($mid, $duct->path) <= 15) {
                    $ids[] = $seg->id;
                }
            }
            if ($ids !== $duct->cable_ids) {
                $duct->cable_ids = $ids;
                $duct->save();
                $ducts->push($duct->fresh());
            }
        }

        return response()->json([
            'ducts' => $ducts->values(),
            'cables' => collect($segments)->map(fn ($c) => $c->fresh())->values(),
            'nodes' => $touched->map(fn ($n) => $n->fresh())->values(),
        ]);
    }

    /**
     * Sangria de dois trechos que se encontram num poste/caixa (editor do poste/caixa): as pontas
     * passam para a CTO/CEO fixada ali (ou ficam na própria caixa) e as fibras livres de um trecho
     * seguem no outro em passagem direta, como na sangria feita ao cortar um cabo.
     */
    public function sangriaJoin(Request $request, NetworkNode $node): JsonResponse
    {
        $project = $node->project;
        $this->authorizeProject($request, $project, 'edit');
        $data = $request->validate([
            'cable_ids' => ['required', 'array', 'size:2'],
            'cable_ids.*' => ['integer', 'distinct', Rule::exists('cables', 'id')->where('project_id', $project->id)],
        ]);
        if (! in_array($node->type, ['cto', 'ceo', 'box'], true)) {
            throw ValidationException::withMessages(['cable_ids' => 'A sangria no poste/caixa precisa ser numa CTO, CEO ou caixa.']);
        }
        $byId = Cable::whereIn('id', $data['cable_ids'])->get()->keyBy('id');
        [$a, $b] = [$byId[$data['cable_ids'][0]], $byId[$data['cable_ids'][1]]];

        // Ponto onde os dois trechos se encontram (o poste/caixa).
        $common = array_values(array_intersect(
            array_filter([$a->from_node_id, $a->to_node_id]),
            array_filter([$b->from_node_id, $b->to_node_id]),
        ));
        if (! $common) {
            throw ValidationException::withMessages(['cable_ids' => 'Os dois trechos precisam terminar no mesmo poste ou caixa.']);
        }
        $host = $common[0] === $node->id ? $node : NetworkNode::find($common[0]);
        $moving = $host->id !== $node->id;
        if ($moving && Geo::distance([$host->lat, $host->lng], [$node->lat, $node->lng]) > 3) {
            throw ValidationException::withMessages(['cable_ids' => "{$node->name} precisa estar fixada em {$host->name}, onde os trechos se encontram."]);
        }
        if ($moving && (DiagramRefs::connectionsOf($host->diagram, $a->id) || DiagramRefs::connectionsOf($host->diagram, $b->id))) {
            throw ValidationException::withMessages(['cable_ids' => "Os trechos já têm emendas no diagrama de {$host->name}. Desfaça-as antes da sangria."]);
        }

        $diagram = $node->diagram ?: [];
        $diagram += ['components' => [], 'cablePos' => [], 'connections' => []];
        $usedA = DiagramRefs::usedFibers($diagram, $a->id);
        $usedB = DiagramRefs::usedFibers($diagram, $b->id);
        $passes = 0;
        for ($f = 1; $f <= min($a->fiber_count, $b->fiber_count); $f++) {
            if (isset($usedA[$f]) || isset($usedB[$f])) {
                continue;
            }
            $diagram['connections'][] = [
                'id' => 'p'.$a->id.'x'.$b->id.'f'.$f,
                'a' => ['c' => 'c'.$a->id, 'p' => 'f'.$f],
                'b' => ['c' => 'c'.$b->id, 'p' => 'f'.$f],
                'pass' => true,
            ];
            $passes++;
        }
        if (! $passes && ! $moving) {
            throw ValidationException::withMessages(['cable_ids' => "Nenhuma fibra livre para a sangria em {$node->name}."]);
        }

        DB::transaction(function () use ($project, $node, $host, $moving, $a, $b, $diagram, $passes) {
            if ($moving) {
                foreach ([$a, $b] as $cable) {
                    $path = $cable->path;
                    if ($cable->from_node_id === $host->id) {
                        $cable->from_node_id = $node->id;
                        $path[0] = [$node->lat, $node->lng];
                    }
                    if ($cable->to_node_id === $host->id) {
                        $cable->to_node_id = $node->id;
                        $path[count($path) - 1] = [$node->lat, $node->lng];
                    }
                    $cable->path = $path;
                    $cable->save();
                }
                if ($host->diagram) {
                    $host->diagram = DiagramRefs::forget(DiagramRefs::forget($host->diagram, $a->id), $b->id);
                    $host->save();
                }
            }
            $node->diagram = $diagram;
            $node->save();
            ActivityLog::record($project, 'node', $node, 'updated', [
                'sangria' => "{$a->name} ↔ {$b->name}: {$passes} fibra(s) em passagem",
            ]);
            $project->touch();
        });

        return response()->json([
            'cables' => [$a->fresh(), $b->fresh()],
            'nodes' => collect([$node, $host])->unique('id')->map(fn ($n) => $n->fresh())->values(),
        ]);
    }

    /** Troca as referências do cabo $from por $to no diagrama da caixa. */
    private function renameCableInDiagram(NetworkNode $node, int $from, int $to): bool
    {
        $diagram = $node->diagram;
        if (! $diagram) {
            return false;
        }
        $old = 'c'.$from;
        $changed = false;
        foreach ($diagram['connections'] ?? [] as $i => $conn) {
            foreach (['a', 'b'] as $side) {
                if (($conn[$side]['c'] ?? null) === $old) {
                    $diagram['connections'][$i][$side]['c'] = 'c'.$to;
                    $changed = true;
                }
            }
        }
        if (isset($diagram['cablePos'][$old])) {
            $diagram['cablePos']['c'.$to] = $diagram['cablePos'][$old];
            unset($diagram['cablePos'][$old]);
            $changed = true;
        }
        if ($changed) {
            $node->diagram = $diagram;
            $node->save();
        }

        return $changed;
    }

    /**
     * Remove do diagrama da caixa as conexões que apontam para fibras do cabo
     * acima de $keepFibers (0 = remove todas). Retorna true se alterou.
     */
    private function pruneDiagram(NetworkNode $node, int $cableId, int $keepFibers): bool
    {
        $diagram = $node->diagram;
        if (! $diagram || empty($diagram['connections'])) {
            return false;
        }
        // Pontas de cabo no diagrama: c = "c{id}", p = "f{fibra}"
        $isGone = fn (array $end) => ($end['c'] ?? null) === 'c'.$cableId
            && (int) substr((string) ($end['p'] ?? 'f0'), 1) > $keepFibers;
        $before = count($diagram['connections']);
        $diagram['connections'] = array_values(array_filter(
            $diagram['connections'],
            fn ($c) => ! $isGone($c['a'] ?? []) && ! $isGone($c['b'] ?? []),
        ));
        if (count($diagram['connections']) === $before) {
            return false;
        }
        $node->diagram = $diagram;
        $node->save();

        return true;
    }

    private function validated(Request $request, Project $project, bool $partial = false): array
    {
        $req = $partial ? 'sometimes' : 'required';
        $nodeRule = $project->nodeRule();
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'category' => ['sometimes', Rule::in(Cable::CATEGORIES)],
            'model' => ['nullable', 'string', 'max:64'],
            'fiber_count' => ['sometimes', 'integer', 'between:1,288'],
            'fibers_per_tube' => ['sometimes', 'integer', 'between:1,24'],
            // Atenuação própria do cabo (dB/km); null = padrão do projeto.
            'loss_db_km' => ['nullable', 'numeric', 'between:0,10'],
            'status' => ['sometimes', Rule::in(NetworkNode::STATUSES)],
            'color' => ['sometimes', 'string', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'width' => ['sometimes', 'integer', 'between:1,12'],
            'line_style' => ['nullable', Rule::in(Cable::LINE_STYLES)],
            'path' => [$req, 'array', 'min:2'],
            'path.*' => ['array', 'size:2'],
            'path.*.*' => ['numeric'],
            'from_node_id' => ['nullable', 'integer', $nodeRule],
            'to_node_id' => ['nullable', 'integer', $nodeRule],
            'slack_m' => ['sometimes', 'integer', 'min:0'],
            'slacks' => ['nullable', 'array', 'max:200'],
            'slacks.*.id' => ['required', 'string', 'max:32'],
            'slacks.*.lat' => ['required', 'numeric', 'between:-90,90'],
            'slacks.*.lng' => ['required', 'numeric', 'between:-180,180'],
            'slacks.*.length_m' => ['required', 'integer', 'min:0', 'max:5000'],
            'slacks.*.kind' => ['required', Rule::in(Cable::SLACK_KINDS)],
            'slacks.*.notes' => ['nullable', 'string', 'max:255'],
            // Onde a reserva está fixada: poste, parede, caixa ou no próprio cabo (vão).
            'slacks.*.fixed_kind' => ['nullable', Rule::in(['pole', 'wall', 'box', 'cable'])],
            'slacks.*.fixed_id' => ['nullable', 'integer'],
            'slacks.*.address' => ['nullable', 'string', 'max:500'],
            'notes' => ['nullable', 'string'],
        ]);
        if (array_key_exists('slacks', $data)) {
            $data['slacks'] = array_values(array_map(fn ($s) => [
                'id' => (string) $s['id'],
                'lat' => round((float) $s['lat'], 7),
                'lng' => round((float) $s['lng'], 7),
                'length_m' => (int) $s['length_m'],
                'kind' => $s['kind'],
                'notes' => $s['notes'] ?? null,
                'fixed_kind' => $s['fixed_kind'] ?? null,
                'fixed_id' => isset($s['fixed_id']) ? (int) $s['fixed_id'] : null,
                'address' => $s['address'] ?? null,
            ], $data['slacks'] ?? []));
            if (! $data['slacks']) {
                $data['slacks'] = null;
                $data['slack_m'] = 0;
            }
        }
        if (isset($data['from_node_id'], $data['to_node_id']) && $data['from_node_id'] === $data['to_node_id']) {
            throw ValidationException::withMessages(['to_node_id' => 'O cabo precisa ligar duas caixas diferentes.']);
        }

        return $data;
    }
}
