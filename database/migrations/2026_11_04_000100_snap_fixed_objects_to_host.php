<?php

use App\Models\Cable;
use App\Models\NetworkNode;
use Illuminate\Database\Migrations\Migration;

/**
 * Fixar e ancorar viraram uma coisa só: CTO/CEO "Fixada em" um poste/caixa e câmera "Instalada em" um poste
 * ficam sempre na posição do poste/caixa (ícone fundido ao dele). Objetos que estavam presos mas "soltos"
 * (com ícone próprio ao lado do poste/caixa) vão para a posição do poste/caixa, levando as pontas dos
 * cabos ligados neles. O antigo attributes.anchored deixa de ser usado e é removido.
 * Só mexe em dados (sem mudança de tabela).
 */
return new class extends Migration
{
    public function up(): void
    {
        $nodes = NetworkNode::query()->whereIn('type', ['cto', 'ceo', 'camera'])->get();
        foreach ($nodes as $node) {
            $a = is_array($node->getAttribute('attributes')) ? $node->getAttribute('attributes') : [];
            $host = $this->host($node, $a);
            $dirty = array_key_exists('anchored', $a);
            unset($a['anchored']);
            $old = [(float) $node->lat, (float) $node->lng];
            $move = $host && (abs($old[0] - (float) $host->lat) > 1e-9 || abs($old[1] - (float) $host->lng) > 1e-9);
            if (! $dirty && ! $move) {
                continue;
            }
            $node->setAttribute('attributes', $a);
            if ($move) {
                $node->lat = (float) $host->lat;
                $node->lng = (float) $host->lng;
            }
            $node->save();
            if (! $move) {
                continue;
            }
            // Só as pontas dos cabos ligados ao objeto acompanham (os cabos que passam pelo poste continuam nele).
            $point = [(float) $node->lat, (float) $node->lng];
            $cables = Cable::query()->where('project_id', $node->project_id)
                ->where(fn ($q) => $q->where('from_node_id', $node->id)->orWhere('to_node_id', $node->id))->get();
            foreach ($cables as $cable) {
                $path = $cable->path ?? [];
                if (! count($path)) {
                    continue;
                }
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
    }

    public function down(): void
    {
        // Não há como saber a posição antiga dos objetos soltos; nada a desfazer.
    }

    private function host(NetworkNode $node, array $a): ?NetworkNode
    {
        if ($node->type === 'camera') {
            $id = $a['mount_id'] ?? null;
            $type = 'pole';
        } else {
            $kind = $a['fixed_kind'] ?? null;
            $id = $a['fixed_id'] ?? null;
            $type = in_array($kind, ['pole', 'box'], true) ? $kind : null;
        }
        if (! $id || ! $type) {
            return null;
        }

        return NetworkNode::query()->where('project_id', $node->project_id)->where('type', $type)->find((int) $id);
    }
};
