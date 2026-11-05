<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Cable;
use App\Models\NetworkNode;
use App\Models\Project;
use App\Services\RoutingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Lançamento de cabo: caminho pela rua entre dois pontos e criação do cabo com
 * os postes novos e as reservas técnicas fixadas nos postes, tudo de uma vez.
 */
class LaunchController extends Controller
{
    /** Caminho pela rua entre início e fim (ou linha reta quando o roteador não responde). */
    public function route(Request $request, Project $project, RoutingService $routing): JsonResponse
    {
        $this->authorizeProject($request, $project, 'edit');
        $data = $request->validate([
            'from' => ['required', 'array', 'size:2'],
            'from.*' => ['numeric'],
            'to' => ['required', 'array', 'size:2'],
            'to.*' => ['numeric'],
            // Pontos de referência entre o início e o fim, na ordem: o caminho passa por todos.
            'via' => ['nullable', 'array', 'max:25'],
            'via.*' => ['array', 'size:2'],
            'via.*.*' => ['numeric'],
        ]);
        $pt = fn ($p) => [(float) $p[0], (float) $p[1]];
        $from = $pt($data['from']);
        $to = $pt($data['to']);
        // O validador remonta os itens campo a campo: as chaves podem vir fora de ordem.
        $via = $data['via'] ?? [];
        ksort($via);
        $via = array_map($pt, array_values($via));
        foreach ([$from, $to, ...$via] as $p) {
            if (abs($p[0]) > 90 || abs($p[1]) > 180) {
                throw ValidationException::withMessages(['from' => 'Coordenada inválida.']);
            }
        }

        return response()->json($via ? $routing->routeVia([$from, ...$via, $to]) : $routing->route($from, $to));
    }

    /**
     * Cria o cabo passando pelos pontos (postes existentes, postes novos ou vértices),
     * com as reservas técnicas fixadas nos postes indicados.
     */
    public function store(Request $request, Project $project): JsonResponse
    {
        $this->authorizeProject($request, $project, 'edit');
        $data = $request->validate([
            'cable' => ['required', 'array'],
            'cable.name' => ['nullable', 'string', 'max:255'],
            'cable.category' => ['required', Rule::in(Cable::CATEGORIES)],
            'cable.model' => ['nullable', 'string', 'max:64'],
            'cable.fiber_count' => ['required', 'integer', 'between:1,288'],
            'cable.fibers_per_tube' => ['required', 'integer', 'between:1,24'],
            'cable.status' => ['sometimes', Rule::in(NetworkNode::STATUSES)],
            'cable.color' => ['sometimes', 'string', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'cable.width' => ['sometimes', 'integer', 'between:1,12'],
            'points' => ['required', 'array', 'min:2', 'max:5000'],
            'points.*.pole_id' => ['nullable', 'integer'],
            'points.*.new_pole' => ['sometimes', 'boolean'],
            'points.*.lat' => ['required_without:points.*.pole_id', 'numeric', 'between:-90,90'],
            'points.*.lng' => ['required_without:points.*.pole_id', 'numeric', 'between:-180,180'],
            'slacks' => ['nullable', 'array', 'max:200'],
            'slacks.*.point' => ['required', 'integer', 'min:0'],
            'slacks.*.length_m' => ['required', 'integer', 'between:1,5000'],
            'slacks.*.kind' => ['sometimes', Rule::in(Cable::SLACK_KINDS)],
            'from_node_id' => ['nullable', 'integer', $project->nodeRule()],
            'to_node_id' => ['nullable', 'integer', $project->nodeRule()],
        ]);

        // O validador remonta os itens campo a campo: as chaves podem vir fora de ordem.
        $points = $data['points'];
        ksort($points);
        $points = array_values($points);
        $poleIds = array_values(array_unique(array_filter(array_column($points, 'pole_id'))));
        $poles = $project->visibleNodes()->whereIn('id', $poleIds)->where('type', 'pole')->get()->keyBy('id');
        if ($poles->count() !== count($poleIds)) {
            throw ValidationException::withMessages(['points' => 'Algum poste escolhido não existe mais neste projeto.']);
        }
        foreach ($data['slacks'] ?? [] as $s) {
            if ($s['point'] >= count($points)) {
                throw ValidationException::withMessages(['slacks' => 'Reserva fora do cabo.']);
            }
        }
        if (isset($data['from_node_id'], $data['to_node_id']) && $data['from_node_id'] === $data['to_node_id']) {
            throw ValidationException::withMessages(['to_node_id' => 'O cabo precisa ligar duas caixas diferentes.']);
        }

        $c = $data['cable'];
        $status = $c['status'] ?? 'planned';
        [$cable, $created] = DB::transaction(function () use ($project, $points, $poles, $data, $c, $status) {
            $count = $project->nodes()->where('type', 'pole')->count();
            $created = [];
            $ids = [];
            $path = [];
            foreach ($points as $i => $p) {
                if (! empty($p['pole_id'])) {
                    $pole = $poles[$p['pole_id']];
                } elseif (! empty($p['new_pole'])) {
                    $pole = $project->nodes()->create([
                        'type' => 'pole',
                        'name' => 'P-'.(++$count),
                        'lat' => round((float) $p['lat'], 7),
                        'lng' => round((float) $p['lng'], 7),
                        'status' => $status,
                    ]);
                    $created[] = $pole;
                } else {
                    $pole = null;
                }
                $ids[$i] = $pole?->id;
                $path[] = $pole ? [(float) $pole->lat, (float) $pole->lng] : [round((float) $p['lat'], 7), round((float) $p['lng'], 7)];
            }
            // As pontas ligadas a uma caixa ficam exatamente sobre ela.
            foreach ([['from_node_id', 0], ['to_node_id', count($path) - 1]] as [$key, $i]) {
                if (! empty($data[$key]) && ($n = NetworkNode::find($data[$key]))) {
                    $path[$i] = [(float) $n->lat, (float) $n->lng];
                }
            }

            $slacks = [];
            foreach ($data['slacks'] ?? [] as $s) {
                [$lat, $lng] = $path[$s['point']];
                $poleId = $ids[$s['point']] ?? null;
                $slacks[] = [
                    'id' => 'r'.Str::lower(Str::random(10)),
                    'lat' => $lat,
                    'lng' => $lng,
                    'length_m' => (int) $s['length_m'],
                    'kind' => $s['kind'] ?? 'aerial',
                    'notes' => null,
                    'fixed_kind' => $poleId ? 'pole' : 'cable',
                    'fixed_id' => $poleId,
                    'address' => null,
                ];
            }

            $cable = $project->cables()->create([
                'name' => ($c['name'] ?? '') !== '' ? $c['name'] : 'Cabo '.$c['fiber_count'].'FO',
                'category' => $c['category'],
                'model' => $c['model'] ?? null,
                'fiber_count' => $c['fiber_count'],
                'fibers_per_tube' => $c['fibers_per_tube'],
                'status' => $status,
                'color' => $c['color'] ?? '#0ea5e9',
                'width' => $c['width'] ?? 4,
                'path' => $path,
                'from_node_id' => $data['from_node_id'] ?? null,
                'to_node_id' => $data['to_node_id'] ?? null,
                'slacks' => $slacks ?: null,
                'slack_m' => (int) array_sum(array_column($slacks, 'length_m')),
            ]);

            $existing = count(array_filter($points, fn ($p) => ! empty($p['pole_id'])));
            ActivityLog::record($project, 'cable', $cable, 'created', [
                'lançamento' => count($created).' postes novos, '.$existing.' existentes, '.count($slacks).' reservas',
            ]);
            $project->touch();

            return [$cable, $created];
        });

        return response()->json([
            'cable' => $cable->fresh(),
            'nodes' => collect($created)->map->fresh()->values(),
        ], 201);
    }
}
