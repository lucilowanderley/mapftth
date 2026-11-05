<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Duct;
use App\Models\Project;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class DuctController extends Controller
{
    public function store(Request $request, Project $project): JsonResponse
    {
        $this->authorizeProject($request, $project, 'edit');
        $data = $this->validated($request, $project);
        $data['name'] ??= 'Duto '.($project->ducts()->count() + 1);
        $duct = $project->ducts()->create($data);
        ActivityLog::record($project, 'duct', $duct, 'created');
        $project->touch();

        return response()->json($duct->fresh(), 201);
    }

    public function update(Request $request, Duct $duct): JsonResponse
    {
        $this->authorizeProject($request, $duct->project, 'edit');
        $data = $this->validated($request, $duct->project, partial: true);
        $duct->fill($data);
        $fields = array_values(array_diff(array_keys($duct->getDirty()), ['length_m']));
        $duct->save();
        if ($fields) {
            ActivityLog::record($duct->project, 'duct', $duct, 'updated', $fields);
        }
        $duct->project->touch();

        return response()->json($duct->fresh());
    }

    public function destroy(Request $request, Duct $duct): JsonResponse
    {
        $this->authorizeProject($request, $duct->project, 'edit');
        ActivityLog::record($duct->project, 'duct', $duct, 'deleted');
        $duct->delete();

        return response()->json(null, 204);
    }

    private function validated(Request $request, Project $project, bool $partial = false): array
    {
        $req = $partial ? 'sometimes' : 'required';
        $nodeRule = $project->nodeRule();
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'material' => ['sometimes', Rule::in(Duct::MATERIALS)],
            'diameter_mm' => ['sometimes', 'integer', 'between:10,1000'],
            'subducts' => ['sometimes', 'integer', 'between:0,24'],
            'placement' => ['sometimes', Rule::in(Duct::PLACEMENTS)],
            'depth_m' => ['nullable', 'numeric', 'between:0,50'],
            'status' => ['sometimes', Rule::in(Duct::STATUSES)],
            'color' => ['sometimes', 'string', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'path' => [$req, 'array', 'min:2'],
            'path.*' => ['array', 'size:2'],
            'path.*.*' => ['numeric'],
            'from_node_id' => ['nullable', 'integer', $nodeRule],
            'to_node_id' => ['nullable', 'integer', $nodeRule],
            'cable_ids' => ['nullable', 'array', 'max:200'],
            'cable_ids.*' => ['integer', Rule::exists('cables', 'id')->where('project_id', $project->id)],
            'notes' => ['nullable', 'string'],
        ]);
        if (isset($data['from_node_id'], $data['to_node_id']) && $data['from_node_id'] === $data['to_node_id']) {
            throw ValidationException::withMessages(['to_node_id' => 'O duto precisa ligar dois objetos diferentes.']);
        }
        if (isset($data['path'])) {
            $data['path'] = array_map(fn ($p) => [round((float) $p[0], 7), round((float) $p[1], 7)], $data['path']);
        }

        return $data;
    }
}
