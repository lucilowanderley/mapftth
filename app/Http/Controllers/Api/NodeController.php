<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Cable;
use App\Models\NetworkNode;
use App\Models\Project;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class NodeController extends Controller
{
    public function store(Request $request, Project $project): JsonResponse
    {
        $this->authorizeProject($request, $project);
        $data = $this->validated($request);
        $data['name'] ??= $this->nextName($project, $data['type']);
        $node = $project->nodes()->create($data);
        $project->touch();

        return response()->json($node->fresh(), 201);
    }

    public function update(Request $request, NetworkNode $node): JsonResponse
    {
        $this->authorizeProject($request, $node->project);
        $data = $this->validated($request, partial: true);
        $moved = (isset($data['lat']) && (float) $data['lat'] !== $node->lat)
            || (isset($data['lng']) && (float) $data['lng'] !== $node->lng);
        $node->update($data);

        // Ao mover a caixa, as pontas dos cabos ligados a ela acompanham.
        $cables = collect();
        if ($moved) {
            $point = [$node->lat, $node->lng];
            $cables = Cable::where('from_node_id', $node->id)->orWhere('to_node_id', $node->id)->get();
            foreach ($cables as $cable) {
                $path = $cable->path;
                if ($cable->from_node_id === $node->id) {
                    $path[0] = $point;
                }
                if ($cable->to_node_id === $node->id) {
                    $path[count($path) - 1] = $point;
                }
                $cable->path = $path;
                $cable->save();
            }
        }
        $node->project->touch();

        return response()->json(['node' => $node, 'cables' => $cables->values()]);
    }

    public function destroy(Request $request, NetworkNode $node): JsonResponse
    {
        $this->authorizeProject($request, $node->project);
        $node->delete();

        return response()->json(null, 204);
    }

    private function validated(Request $request, bool $partial = false): array
    {
        $req = $partial ? 'sometimes' : 'required';

        return $request->validate([
            'type' => [$partial ? 'prohibited' : 'required', Rule::in(NetworkNode::TYPES)],
            'name' => ['sometimes', 'string', 'max:255'],
            'lat' => [$req, 'numeric', 'between:-90,90'],
            'lng' => [$req, 'numeric', 'between:-180,180'],
            'status' => ['sometimes', Rule::in(NetworkNode::STATUSES)],
            'notes' => ['nullable', 'string'],
            'attributes' => ['nullable', 'array'],
            'diagram' => ['nullable', 'array'],
        ]);
    }

    private function nextName(Project $project, string $type): string
    {
        $prefix = ['cto' => 'CTO', 'ceo' => 'CEO', 'pop' => 'POP', 'pole' => 'P', 'client' => 'Cliente'][$type];
        $count = $project->nodes()->where('type', $type)->count();

        return $prefix.'-'.($count + 1);
    }
}
