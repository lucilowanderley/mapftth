<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Project;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProjectController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $projects = Project::accessibleBy($user)
            ->with('user:id,name')
            ->withCount([
                'nodes as cto_count' => fn ($q) => $q->whereIn('type', ['cto']),
                'nodes as ceo_count' => fn ($q) => $q->where('type', 'ceo'),
                'nodes as pop_count' => fn ($q) => $q->where('type', 'pop'),
                'nodes as client_count' => fn ($q) => $q->where('type', 'client'),
                'nodes as deployed_count' => fn ($q) => $q->whereIn('status', ['deployed', 'certified']),
                'nodes as total_nodes',
                'cables',
            ])
            ->withSum('cables as cable_length_m', 'length_m')
            ->latest('updated_at')
            ->get()
            ->each(fn (Project $p) => $p->setAttribute('role', $p->roleOf($user)));

        return response()->json($projects);
    }

    public function store(Request $request): JsonResponse
    {
        $project = $request->user()->projects()->create($this->validated($request));

        return response()->json($project->fresh(), 201);
    }

    public function show(Request $request, Project $project): JsonResponse
    {
        $role = $this->authorizeProject($request, $project);

        return response()->json([
            'project' => $project,
            'role' => $role,
            'settings' => $project->effectiveSettings(),
            // Chave do Google Maps do dono do projeto (o navegador precisa dela para pedir os tiles).
            'google_maps_key' => $project->user?->googleMapsKey(),
            'google_key_source' => $this->googleKeySource($project),
            'areas' => $project->areas()->orderBy('id')->get(),
            'nodes' => $project->nodes()->orderBy('id')->get(),
            'cables' => $project->cables()->orderBy('id')->get(),
        ]);
    }

    public function update(Request $request, Project $project): JsonResponse
    {
        $this->authorizeProject($request, $project, 'admin');
        $data = $this->validated($request, partial: true);
        $project->update($data);
        ActivityLog::record($project, 'project', $project, 'updated', array_keys($data));

        return response()->json(['project' => $project, 'settings' => $project->effectiveSettings()]);
    }

    public function destroy(Request $request, Project $project): JsonResponse
    {
        $this->authorizeProject($request, $project, 'owner');
        $project->delete();

        return response()->json(null, 204);
    }

    /** De onde vem a chave do Google: 'account' (cadastrada pelo dono), 'env' (.env do servidor) ou null. */
    private function googleKeySource(Project $project): ?string
    {
        $owner = $project->user;
        if (! $owner) {
            return null;
        }
        try {
            if ($owner->google_maps_key) {
                return 'account';
            }
        } catch (\Illuminate\Contracts\Encryption\DecryptException) {
            // chave ilegível: cai para o .env
        }

        return config('services.google_maps.key') ? 'env' : null;
    }

    private function validated(Request $request, bool $partial = false): array
    {
        $req = $partial ? 'sometimes' : 'required';

        return $request->validate([
            'name' => [$req, 'string', 'max:255'],
            'city' => ['nullable', 'string', 'max:255'],
            'center_lat' => [$req, 'numeric', 'between:-90,90'],
            'center_lng' => [$req, 'numeric', 'between:-180,180'],
            'zoom' => ['sometimes', 'integer', 'between:1,22'],
            'settings' => ['sometimes', 'array'],
            'settings.*' => ['numeric'],
        ]);
    }
}
