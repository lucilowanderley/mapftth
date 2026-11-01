<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Cable;
use App\Models\NetworkNode;
use App\Models\Project;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
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
            if ($key !== 'path' && $value != $cable->{$key}) {
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
        $cable->delete();

        return response()->json(['nodes' => $nodes->values()]);
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
        $nodeRule = Rule::exists('network_nodes', 'id')->where('project_id', $project->id);
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'category' => ['sometimes', Rule::in(Cable::CATEGORIES)],
            'model' => ['nullable', 'string', 'max:64'],
            'fiber_count' => ['sometimes', 'integer', 'between:1,288'],
            'fibers_per_tube' => ['sometimes', 'integer', 'between:1,24'],
            'status' => ['sometimes', Rule::in(NetworkNode::STATUSES)],
            'color' => ['sometimes', 'string', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'width' => ['sometimes', 'integer', 'between:1,12'],
            'path' => [$req, 'array', 'min:2'],
            'path.*' => ['array', 'size:2'],
            'path.*.*' => ['numeric'],
            'from_node_id' => ['nullable', 'integer', $nodeRule],
            'to_node_id' => ['nullable', 'integer', $nodeRule],
            'slack_m' => ['sometimes', 'integer', 'min:0'],
            'notes' => ['nullable', 'string'],
        ]);
        if (isset($data['from_node_id'], $data['to_node_id']) && $data['from_node_id'] === $data['to_node_id']) {
            throw ValidationException::withMessages(['to_node_id' => 'O cabo precisa ligar duas caixas diferentes.']);
        }

        return $data;
    }
}
