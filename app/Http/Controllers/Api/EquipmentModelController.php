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
        $data = $this->validated($request);
        if ($data['replaces']) {
            // Um padrão tem no máximo uma substituição por usuário: editar de novo atualiza a mesma.
            $model = $request->user()->equipmentModels()->updateOrCreate(['replaces' => $data['replaces']], $data);

            return response()->json([...$model->fresh()->toArray(), 'own' => true], 201);
        }
        $model = $request->user()->equipmentModels()->create($data);

        return response()->json([...$model->fresh()->toArray(), 'own' => true], 201);
    }

    public function update(Request $request, EquipmentModel $equipmentModel): JsonResponse
    {
        abort_unless($equipmentModel->user_id === $request->user()->id, 403, 'Só quem cadastrou pode alterar este modelo.');
        $data = $this->validated($request);
        // Sem `replaces` no pedido, mantém o vínculo com o padrão que este modelo substitui.
        if (! $request->has('replaces')) {
            unset($data['replaces']);
        }
        if (! $request->has('hidden')) {
            unset($data['hidden']);
        }
        $equipmentModel->update($data);

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
            'port_groups' => ['nullable', 'array', 'max:16'],
            'port_groups.*.type' => ['required', 'string', 'max:40'],
            'port_groups.*.count' => ['required', 'integer', 'min:1', 'max:576'],
            'port_groups.*.speed' => ['nullable', 'numeric', 'min:0', 'max:1600'],
            'replaces' => ['nullable', 'string', 'max:60'],
            'hidden' => ['nullable', 'boolean'],
        ]);
        $data['hidden'] = (bool) ($data['hidden'] ?? false);
        $data['replaces'] = $data['replaces'] ?? null;
        abort_if($data['hidden'] && ! $data['replaces'], 422, 'Só modelos padrão podem ser ocultados.');
        if ($data['kind'] !== 'olt') {
            $data['slots'] = $data['uplinks'] = $data['tx_dbm'] = null;
        }
        if ($data['kind'] !== 'active') {
            $data['type'] = null;
            $data['port_groups'] = null;
        } elseif (! empty($data['port_groups'])) {
            // Com grupos, o total de portas é a soma deles.
            $data['port_groups'] = array_values(array_map(fn ($g) => [
                'type' => trim($g['type']),
                'count' => (int) $g['count'],
                'speed' => isset($g['speed']) ? (float) $g['speed'] : null,
            ], $data['port_groups']));
            $data['ports'] = min(576, array_sum(array_column($data['port_groups'], 'count')));
        } else {
            $data['port_groups'] = null;
        }

        return $data;
    }
}
