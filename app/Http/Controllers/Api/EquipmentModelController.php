<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\EquipmentModel;
use App\Models\Project;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class EquipmentModelController extends Controller
{
    /**
     * Modelos do usuário e, quando ?project= é informado, também os do dono do projeto
     * (assim a equipe usa o cadastro de quem é dono da rede). `own` indica se pode editar.
     */
    public function index(Request $request): JsonResponse
    {
        $ids = [$request->user()->id];
        if ($request->filled('project')) {
            $project = Project::findOrFail($request->integer('project'));
            $this->authorizeProject($request, $project);
            $ids[] = $project->user_id;
        }
        $models = EquipmentModel::whereIn('user_id', array_unique($ids))
            ->orderBy('kind')->orderBy('vendor')->orderBy('model')->get()
            ->map(fn ($m) => [...$m->toArray(), 'own' => $m->user_id === $request->user()->id]);

        return response()->json($models);
    }

    public function store(Request $request): JsonResponse
    {
        $model = $request->user()->equipmentModels()->create($this->validated($request));

        return response()->json([...$model->fresh()->toArray(), 'own' => true], 201);
    }

    public function update(Request $request, EquipmentModel $equipmentModel): JsonResponse
    {
        abort_unless($equipmentModel->user_id === $request->user()->id, 403, 'Só quem cadastrou pode alterar este modelo.');
        $equipmentModel->update($this->validated($request));

        return response()->json([...$equipmentModel->toArray(), 'own' => true]);
    }

    public function destroy(Request $request, EquipmentModel $equipmentModel): JsonResponse
    {
        abort_unless($equipmentModel->user_id === $request->user()->id, 403, 'Só quem cadastrou pode excluir este modelo.');
        $equipmentModel->delete();

        return response()->json(null, 204);
    }

    private function validated(Request $request): array
    {
        $data = $request->validate([
            'kind' => ['required', Rule::in(EquipmentModel::KINDS)],
            'vendor' => ['nullable', 'string', 'max:120'],
            'model' => ['required', 'string', 'max:160'],
            'type' => ['nullable', 'string', 'max:60'],
            'ports' => ['required', 'integer', 'min:1', 'max:576'],
            'slots' => ['nullable', 'integer', 'min:1', 'max:32'],
            'uplinks' => ['nullable', 'integer', 'min:0', 'max:32'],
            'tx_dbm' => ['nullable', 'numeric', 'between:-10,15'],
            'height_u' => ['required', 'integer', 'min:1', 'max:60'],
            'notes' => ['nullable', 'string'],
        ]);
        if ($data['kind'] !== 'olt') {
            $data['slots'] = $data['uplinks'] = $data['tx_dbm'] = null;
        }
        if ($data['kind'] !== 'active') {
            $data['type'] = null;
        }

        return $data;
    }
}
