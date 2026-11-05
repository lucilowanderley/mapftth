<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\NetworkNode;
use App\Services\NodeSharing;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Objetos repetidos em projetos diferentes (ex.: o mesmo poste em vários KMZ do ISM).
 * Lista os grupos e junta cada um num objeto compartilhado.
 */
class DuplicateController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'types' => ['sometimes', 'array'],
            'types.*' => [Rule::in(NodeSharing::DUPLICATE_TYPES)],
            'radius' => ['sometimes', 'numeric', 'between:0.5,50'],
            'project' => ['sometimes', 'integer'],
        ]);
        $sharing = new NodeSharing($request->user());
        $groups = $sharing->findDuplicates(
            $data['types'] ?? ['pole', 'pop', 'dc', 'tower', 'box'],
            (float) ($data['radius'] ?? 3),
            isset($data['project']) ? (int) $data['project'] : null,
        );

        return response()->json(['groups' => $groups]);
    }

    public function merge(Request $request): JsonResponse
    {
        $data = $request->validate([
            'groups' => ['required', 'array', 'min:1', 'max:5000'],
            'groups.*.keep_id' => ['required', 'integer'],
            'groups.*.ids' => ['required', 'array', 'min:2', 'max:50'],
            'groups.*.ids.*' => ['integer'],
        ]);
        $sharing = new NodeSharing($request->user());
        $merged = 0;
        foreach ($data['groups'] as $g) {
            $ids = array_values(array_unique(array_map('intval', $g['ids'])));
            if (! in_array((int) $g['keep_id'], $ids, true)) {
                throw ValidationException::withMessages(['groups' => 'O objeto mantido precisa estar no grupo.']);
            }
            $nodes = NetworkNode::whereIn('id', $ids)->get();
            if ($nodes->count() < 2) {
                continue; // já unificado antes
            }
            if ($nodes->pluck('type')->unique()->count() !== 1) {
                throw ValidationException::withMessages(['groups' => 'Só objetos do mesmo tipo podem ser unificados.']);
            }
            foreach ($nodes as $n) {
                abort_unless($sharing->canEditIn((int) $n->project_id), 403, 'Você não pode editar um dos projetos deste grupo.');
            }
            $keep = $nodes->firstWhere('id', (int) $g['keep_id']) ?? $sharing->pickKeeper($nodes);
            $sharing->merge($keep, $nodes->where('id', '!=', $keep->id)->values());
            $merged += $nodes->count() - 1;
        }

        return response()->json(['merged' => $merged]);
    }
}
