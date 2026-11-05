<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Project;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Fixar em massa: aplica de uma vez a fixação calculada no mapa (CTO/CEO no poste/caixa/cabo, câmera no
 * poste/parede, reserva técnica no poste/caixa, vértices do cabo nos postes). Também serve para desfazer.
 * Só as chaves de fixação dos atributos mudam; ao mover um objeto, as pontas dos cabos ligados a ele acompanham
 * (os cabos que só passam pelo poste continuam onde estão).
 */
class FixBulkController extends Controller
{
    private const FIX_KEYS = ['fixed_kind', 'fixed_id', 'mount_kind', 'mount_id'];

    public function store(Request $request, Project $project): JsonResponse
    {
        $this->authorizeProject($request, $project, 'edit');
        $data = $request->validate([
            'label' => ['nullable', 'string', 'max:255'],
            'nodes' => ['sometimes', 'array', 'max:5000'],
            'nodes.*.id' => ['required', 'integer'],
            'nodes.*.lat' => ['required', 'numeric', 'between:-90,90'],
            'nodes.*.lng' => ['required', 'numeric', 'between:-180,180'],
            'nodes.*.fix' => ['required', 'array'],
            'nodes.*.fix.fixed_kind' => ['nullable', Rule::in(['pole', 'wall', 'box', 'cable'])],
            'nodes.*.fix.fixed_id' => ['nullable', 'integer'],
            'nodes.*.fix.mount_kind' => ['nullable', Rule::in(['pole', 'wall'])],
            'nodes.*.fix.mount_id' => ['nullable', 'integer'],
            'cables' => ['sometimes', 'array', 'max:5000'],
            'cables.*.id' => ['required', 'integer'],
            'cables.*.path' => ['sometimes', 'array', 'min:2', 'max:20000'],
            'cables.*.path.*' => ['array', 'size:2'],
            'cables.*.path.*.*' => ['numeric'],
            'cables.*.slacks' => ['sometimes', 'array', 'max:200'],
            'cables.*.slacks.*.id' => ['required', 'string', 'max:32'],
            'cables.*.slacks.*.lat' => ['required', 'numeric', 'between:-90,90'],
            'cables.*.slacks.*.lng' => ['required', 'numeric', 'between:-180,180'],
            'cables.*.slacks.*.fixed_kind' => ['nullable', Rule::in(['pole', 'wall', 'box', 'cable'])],
            'cables.*.slacks.*.fixed_id' => ['nullable', 'integer'],
        ]);
        $nodeRows = array_values($data['nodes'] ?? []);
        $cableRows = array_values($data['cables'] ?? []);
        if (! $nodeRows && ! $cableRows) {
            throw ValidationException::withMessages(['nodes' => 'Nada para fixar.']);
        }

        $nodes = $project->nodes()->whereIn('id', array_column($nodeRows, 'id'))->get()->keyBy('id');
        if ($nodes->count() !== count(array_unique(array_column($nodeRows, 'id')))) {
            throw ValidationException::withMessages(['nodes' => 'Algum objeto não existe mais neste projeto. Recarregue o mapa.']);
        }
        // Todos os cabos: as pontas ligadas aos objetos movidos acompanham.
        $cables = $project->cables()->get()->keyBy('id');
        foreach ($cableRows as $row) {
            if (! $cables->has($row['id'])) {
                throw ValidationException::withMessages(['cables' => 'Algum cabo não existe mais neste projeto. Recarregue o mapa.']);
            }
        }
        $pt = fn ($p) => [round((float) $p[0], 7), round((float) $p[1], 7)];

        [$changedNodes, $dirty] = DB::transaction(function () use ($project, $data, $nodeRows, $cableRows, $nodes, $cables, $pt) {
            $dirty = [];
            foreach ($cableRows as $row) {
                $cable = $cables[$row['id']];
                if (isset($row['path'])) {
                    $path = $row['path'];
                    ksort($path);
                    $cable->path = array_map($pt, array_values($path));
                    $dirty[$cable->id] = true;
                }
                if (isset($row['slacks'])) {
                    $patch = collect($row['slacks'])->keyBy('id');
                    $cable->slacks = array_map(function ($s) use ($patch) {
                        $p = $patch->get($s['id']);

                        return $p ? array_merge($s, [
                            'lat' => round((float) $p['lat'], 7),
                            'lng' => round((float) $p['lng'], 7),
                            'fixed_kind' => $p['fixed_kind'] ?? null,
                            'fixed_id' => isset($p['fixed_id']) ? (int) $p['fixed_id'] : null,
                        ]) : $s;
                    }, $cable->slacks ?? []);
                    $dirty[$cable->id] = true;
                }
            }

            $changedNodes = [];
            foreach ($nodeRows as $row) {
                $node = $nodes[$row['id']];
                $at = $pt([$row['lat'], $row['lng']]);
                $moved = abs($at[0] - (float) $node->lat) > 1e-8 || abs($at[1] - (float) $node->lng) > 1e-8;
                $attrs = $node->attributes ?? [];
                unset($attrs['anchored']);
                foreach (self::FIX_KEYS as $k) {
                    if (array_key_exists($k, $row['fix'])) {
                        $v = $row['fix'][$k];
                        $attrs[$k] = $v === null ? null : (str_ends_with($k, '_id') ? (int) $v : $v);
                    }
                }
                $node->attributes = $attrs;
                $node->lat = $at[0];
                $node->lng = $at[1];
                $node->save();
                $changedNodes[] = $node;
                if (! $moved) {
                    continue;
                }
                foreach ($cables as $cable) {
                    $path = $cable->path ?? [];
                    $last = count($path) - 1;
                    if ($last < 1) {
                        continue;
                    }
                    if ($cable->from_node_id === $node->id) {
                        $path[0] = $at;
                    }
                    if ($cable->to_node_id === $node->id) {
                        $path[$last] = $at;
                    }
                    if ($path !== $cable->path) {
                        $cable->path = $path;
                        $dirty[$cable->id] = true;
                    }
                }
            }

            foreach (array_keys($dirty) as $id) {
                $cables[$id]->save();
            }
            $count = count($nodeRows) + count(array_merge([], ...array_map(fn ($r) => $r['slacks'] ?? [], $cableRows)))
                + count(array_filter($cableRows, fn ($r) => isset($r['path'])));
            ActivityLog::record($project, 'project', null, 'bulk_fixed', ['objetos' => $count], $data['label'] ?? 'Fixar em massa');
            $project->touch();

            return [$changedNodes, $dirty];
        });

        return response()->json([
            'nodes' => collect($changedNodes)->map->fresh()->values(),
            'cables' => collect(array_keys($dirty))->map(fn ($id) => $cables[$id]->fresh())->values(),
        ]);
    }
}
