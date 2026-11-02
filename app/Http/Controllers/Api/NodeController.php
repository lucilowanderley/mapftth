<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Cable;
use App\Models\NetworkNode;
use App\Models\Project;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class NodeController extends Controller
{
    public function store(Request $request, Project $project): JsonResponse
    {
        $this->authorizeProject($request, $project, 'edit');
        $data = $this->validated($request);
        $data['name'] ??= $this->nextName($project, $data['type']);
        $node = $project->nodes()->create($data);
        ActivityLog::record($project, 'node', $node, 'created');
        $project->touch();

        return response()->json($node->fresh(), 201);
    }

    /** Criação em lote (ex.: importação de planilha de postes). */
    public function bulk(Request $request, Project $project): JsonResponse
    {
        $this->authorizeProject($request, $project, 'edit');
        $data = $request->validate([
            'nodes' => ['required', 'array', 'min:1', 'max:5000'],
            'nodes.*.type' => ['required', Rule::in(NetworkNode::TYPES)],
            'nodes.*.name' => ['nullable', 'string', 'max:255'],
            'nodes.*.lat' => ['required', 'numeric', 'between:-90,90'],
            'nodes.*.lng' => ['required', 'numeric', 'between:-180,180'],
            'nodes.*.status' => ['sometimes', Rule::in(NetworkNode::STATUSES)],
            'nodes.*.attributes' => ['nullable', 'array'],
        ]);
        $counts = [];
        $created = DB::transaction(fn () => collect($data['nodes'])->map(function ($n) use ($project, &$counts) {
            $counts[$n['type']] ??= $project->nodes()->where('type', $n['type'])->count();
            $counts[$n['type']]++;
            $n['name'] = ($n['name'] ?? '') !== '' ? $n['name'] : $this->prefix($n['type']).'-'.$counts[$n['type']];

            return $project->nodes()->create($n);
        }));
        ActivityLog::record($project, 'project', null, 'imported', ['pontos' => $created->count()], 'Planilha');
        $project->touch();

        return response()->json(['created' => $created->map->fresh()->values()], 201);
    }

    public function update(Request $request, NetworkNode $node): JsonResponse
    {
        $this->authorizeProject($request, $node->project, 'edit');
        $data = $this->validated($request, partial: true);
        $changed = $this->describeChanges($node, $data);
        $old = [(float) $node->lat, (float) $node->lng];
        $moved = (isset($data['lat']) && (float) $data['lat'] !== $node->lat)
            || (isset($data['lng']) && (float) $data['lng'] !== $node->lng);
        $node->update($data);

        // Ao mover o objeto, as pontas dos cabos ligados a ele acompanham, assim como
        // os vértices de cabos que passam exatamente por ele (ex.: cabo apoiado num poste).
        $cables = collect();
        if ($moved) {
            $point = [(float) $node->lat, (float) $node->lng];
            $same = fn ($p) => is_array($p) && count($p) === 2
                && abs((float) $p[0] - $old[0]) < 1e-8 && abs((float) $p[1] - $old[1]) < 1e-8;
            foreach ($node->project->cables()->get() as $cable) {
                $path = $cable->path ?? [];
                $last = count($path) - 1;
                $changedPath = false;
                foreach ($path as $i => $p) {
                    $attached = ($i === 0 && $cable->from_node_id === $node->id)
                        || ($i === $last && $cable->to_node_id === $node->id);
                    // Pontas ligadas a outro objeto não são arrastadas junto.
                    $otherEnd = ($i === 0 && $cable->from_node_id && $cable->from_node_id !== $node->id)
                        || ($i === $last && $cable->to_node_id && $cable->to_node_id !== $node->id);
                    if ($attached || (! $otherEnd && $same($p))) {
                        $path[$i] = $point;
                        $changedPath = true;
                    }
                }
                if ($changedPath) {
                    $cable->path = $path;
                    $cable->save();
                    $cables->push($cable);
                }
            }
        }
        if ($changed) {
            ActivityLog::record($node->project, 'node', $node, $changed['action'], $changed['fields']);
        }
        $node->project->touch();

        return response()->json(['node' => $node, 'cables' => $cables->values()]);
    }

    public function destroy(Request $request, NetworkNode $node): JsonResponse
    {
        $this->authorizeProject($request, $node->project, 'edit');
        ActivityLog::record($node->project, 'node', $node, 'deleted');
        $node->delete();

        return response()->json(null, 204);
    }

    private function validated(Request $request, bool $partial = false): array
    {
        $req = $partial ? 'sometimes' : 'required';

        $data = $request->validate([
            'type' => [$partial ? 'prohibited' : 'required', Rule::in(NetworkNode::TYPES)],
            'name' => ['sometimes', 'string', 'max:255'],
            'lat' => [$req, 'numeric', 'between:-90,90'],
            'lng' => [$req, 'numeric', 'between:-180,180'],
            'status' => ['sometimes', Rule::in(NetworkNode::STATUSES)],
            'notes' => ['nullable', 'string'],
            'attributes' => ['nullable', 'array'],
            'diagram' => ['nullable', 'array'],
        ]);
        // Mesma precisão da coluna (7 casas ≈ 1 cm) para pontas de cabo e objeto coincidirem.
        foreach (['lat', 'lng'] as $k) {
            if (isset($data[$k])) {
                $data[$k] = round((float) $data[$k], 7);
            }
        }

        return $data;
    }

    /** Resume o que mudou para o histórico: diagrama, posição ou campos. */
    private function describeChanges(NetworkNode $node, array $data): ?array
    {
        $fields = [];
        foreach ($data as $key => $value) {
            if ($key === 'diagram') {
                if ($value != $node->diagram) {
                    $before = count($node->diagram['connections'] ?? []);
                    $after = count($value['connections'] ?? []);
                    $fields['diagram'] = "{$before} → {$after} conexões";
                }
            } elseif (in_array($key, ['lat', 'lng'], true)) {
                if ((float) $value !== $node->{$key}) {
                    $fields['position'] = 'movida';
                }
            } elseif ($value != $node->{$key}) {
                $fields[$key] = ['de' => $node->{$key}, 'para' => $value];
            }
        }
        if (! $fields) {
            return null;
        }
        $action = array_keys($fields) === ['position'] ? 'moved' : (isset($fields['diagram']) && count($fields) === 1 ? 'diagram' : 'updated');

        return ['action' => $action, 'fields' => $fields];
    }

    private function prefix(string $type): string
    {
        return ['cto' => 'CTO', 'ceo' => 'CEO', 'pop' => 'POP', 'dc' => 'DC', 'tower' => 'TR', 'pole' => 'P', 'client' => 'Cliente', 'condo' => 'Cond'][$type];
    }

    private function nextName(Project $project, string $type): string
    {
        return $this->prefix($type).'-'.($project->nodes()->where('type', $type)->count() + 1);
    }
}
