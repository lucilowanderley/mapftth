<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\PriceItem;
use App\Models\Project;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Cadastro de preços (valor de mercado) e orçamento do projeto. */
class PriceItemController extends Controller
{
    /**
     * Preços do usuário. Com ?project=, os do dono do projeto (a equipe orça com a tabela de quem
     * é dono da rede). `own` indica se quem pede pode editar.
     */
    public function index(Request $request): JsonResponse
    {
        $userId = $request->user()->id;
        if ($request->filled('project')) {
            $project = Project::findOrFail($request->integer('project'));
            $this->authorizeProject($request, $project);
            $userId = $project->user_id;
        }
        $items = PriceItem::where('user_id', $userId)->orderBy('category')->orderBy('name')->get()
            ->map(fn ($i) => [...$i->toArray(), 'own' => $i->user_id === $request->user()->id]);

        return response()->json($items);
    }

    /** Cria um item avulso ou, com `key`, grava o preço do item padrão (atualiza se já existir). */
    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);
        $item = $data['key']
            ? $request->user()->priceItems()->updateOrCreate(['key' => $data['key']], $data)
            : $request->user()->priceItems()->create($data);

        return response()->json([...$item->fresh()->toArray(), 'own' => true], 201);
    }

    /**
     * Grava vários preços de uma vez (importação de planilha). Itens com `key` atualizam o padrão;
     * avulsos com o mesmo nome e categoria de um já cadastrado são atualizados, os outros são criados.
     */
    public function bulk(Request $request): JsonResponse
    {
        $request->validate(['items' => ['required', 'array', 'min:1', 'max:2000']]);
        $user = $request->user();
        $rows = [];
        foreach ($request->input('items') as $i => $raw) {
            $rows[] = validator((array) $raw, $this->rules(), [], ['name' => "item ".($i + 1)])->validate();
        }
        $count = 0;
        foreach ($rows as $data) {
            $data['key'] = $data['key'] ?? null;
            $data['name'] = trim($data['name']);
            $match = $data['key'] ? ['key' => $data['key']] : ['key' => null, 'category' => $data['category'], 'name' => $data['name']];
            $user->priceItems()->updateOrCreate($match, $data);
            $count++;
        }

        return response()->json(['saved' => $count]);
    }

    public function update(Request $request, PriceItem $priceItem): JsonResponse
    {
        abort_unless($priceItem->user_id === $request->user()->id, 403, 'Só quem cadastrou pode alterar este preço.');
        $data = $this->validated($request);
        unset($data['key']); // a ligação com o item padrão não muda
        $priceItem->update($data);

        return response()->json([...$priceItem->fresh()->toArray(), 'own' => true]);
    }

    /** Exclui o item avulso ou volta o item padrão ao preço vazio. */
    public function destroy(Request $request, PriceItem $priceItem): JsonResponse
    {
        abort_unless($priceItem->user_id === $request->user()->id, 403, 'Só quem cadastrou pode excluir este preço.');
        $priceItem->delete();

        return response()->json(null, 204);
    }

    /** Grava a configuração do orçamento do projeto (BDI, desconto, escopo, ajustes e extras). */
    public function saveBudget(Request $request, Project $project): JsonResponse
    {
        $this->authorizeProject($request, $project, 'edit');
        $data = $request->validate([
            'bdi_pct' => ['nullable', 'numeric', 'between:0,300'],
            'discount_pct' => ['nullable', 'numeric', 'between:0,100'],
            'scope' => ['nullable', Rule::in(['all', 'pending'])],
            'notes' => ['nullable', 'string', 'max:5000'],
            'overrides' => ['nullable', 'array', 'max:1000'],
            'overrides.*' => ['numeric', 'min:0', 'max:100000000'],
            'hidden' => ['nullable', 'array', 'max:1000'],
            'hidden.*' => ['string', 'max:120'],
            'extras' => ['nullable', 'array', 'max:300'],
            'extras.*.id' => ['required', 'string', 'max:40'],
            'extras.*.item_id' => ['nullable', 'integer'],
            'extras.*.category' => ['required', Rule::in(PriceItem::CATEGORIES)],
            'extras.*.name' => ['required', 'string', 'max:160'],
            'extras.*.unit' => ['nullable', 'string', 'max:12'],
            'extras.*.price' => ['nullable', 'numeric', 'min:0', 'max:1000000000'],
            'extras.*.qty' => ['required', 'numeric', 'min:0', 'max:100000000'],
        ]);
        $budget = [
            'bdi_pct' => (float) ($data['bdi_pct'] ?? 0),
            'discount_pct' => (float) ($data['discount_pct'] ?? 0),
            'scope' => $data['scope'] ?? 'all',
            'notes' => $data['notes'] ?? null,
            'overrides' => (object) array_map('floatval', $data['overrides'] ?? []),
            'hidden' => array_values(array_unique($data['hidden'] ?? [])),
            'extras' => array_values(array_map(fn ($e) => [
                'id' => $e['id'],
                'item_id' => $e['item_id'] ?? null,
                'category' => $e['category'],
                'name' => trim($e['name']),
                'unit' => $e['unit'] ?? 'un',
                'price' => isset($e['price']) ? (float) $e['price'] : null,
                'qty' => (float) $e['qty'],
            ], $data['extras'] ?? [])),
        ];
        $project->budget = $budget;
        $project->save();
        ActivityLog::record($project, 'project', $project, 'updated', ['budget']);

        return response()->json($project->budget);
    }

    private function rules(): array
    {
        return [
            'key' => ['nullable', 'string', 'max:120'],
            'category' => ['required', Rule::in(PriceItem::CATEGORIES)],
            'name' => ['required', 'string', 'max:160'],
            'unit' => ['required', 'string', 'max:12'],
            'price' => ['required', 'numeric', 'min:0', 'max:1000000000'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ];
    }

    private function validated(Request $request): array
    {
        $data = $request->validate($this->rules());
        $data['key'] = $data['key'] ?? null;
        $data['name'] = trim($data['name']);

        return $data;
    }
}
