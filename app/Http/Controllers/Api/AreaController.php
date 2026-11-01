<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Area;
use App\Models\Project;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AreaController extends Controller
{
    public function store(Request $request, Project $project): JsonResponse
    {
        $this->authorizeProject($request, $project, 'edit');
        $data = $this->validated($request);
        $data['name'] ??= 'Área '.($project->areas()->count() + 1);
        $area = $project->areas()->create($data);
        ActivityLog::record($project, 'area', $area, 'created');

        return response()->json($area->fresh(), 201);
    }

    public function update(Request $request, Area $area): JsonResponse
    {
        $this->authorizeProject($request, $area->project, 'edit');
        $area->update($this->validated($request, partial: true));
        ActivityLog::record($area->project, 'area', $area, 'updated');

        return response()->json($area);
    }

    public function destroy(Request $request, Area $area): JsonResponse
    {
        $this->authorizeProject($request, $area->project, 'edit');
        ActivityLog::record($area->project, 'area', $area, 'deleted');
        $area->delete();

        return response()->json(null, 204);
    }

    private function validated(Request $request, bool $partial = false): array
    {
        return $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'color' => ['sometimes', 'string', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'polygon' => [$partial ? 'sometimes' : 'required', 'array', 'min:3'],
            'polygon.*' => ['array', 'size:2'],
            'polygon.*.*' => ['numeric'],
            'notes' => ['nullable', 'string'],
        ]);
    }
}
