<?php

namespace App\Services;

use App\Models\Cable;
use App\Models\NetworkNode;
use Illuminate\Support\Collection;

/**
 * Ao excluir um objeto, o que estava fixado nele (CTO/CEO no poste/caixa ou no cabo,
 * câmera no poste, reserva no poste/caixa) NÃO é excluído: só perde a fixação e fica
 * sem objeto pai, no mesmo lugar.
 */
class OrphanFixed
{
    /**
     * Solta tudo que estava fixado no poste/caixa (ou outro objeto) que vai ser excluído.
     *
     * @return array{nodes: Collection<int, NetworkNode>, cables: Collection<int, Cable>}
     */
    public static function fromNode(NetworkNode $host, array $projectIds): array
    {
        $nodes = NetworkNode::whereIn('project_id', $projectIds)->where('id', '!=', $host->id)->get()
            ->filter(function (NetworkNode $n) use ($host) {
                $a = is_array($n->attributes) ? $n->attributes : [];
                $changed = false;
                if ((int) ($a['fixed_id'] ?? 0) === $host->id && ($a['fixed_kind'] ?? null) !== 'cable') {
                    $a['fixed_kind'] = null;
                    $a['fixed_id'] = null;
                    $changed = true;
                }
                if ((int) ($a['mount_id'] ?? 0) === $host->id) {
                    if (($a['mount_kind'] ?? null) !== 'wall') {
                        $a['mount_kind'] = null;
                    }
                    $a['mount_id'] = null;
                    $changed = true;
                }
                if ($changed) {
                    $n->attributes = $a;
                    $n->save();
                }

                return $changed;
            })->values();

        $cables = Cable::whereIn('project_id', $projectIds)->whereNotNull('slacks')->get()
            ->filter(function (Cable $c) use ($host) {
                $slacks = is_array($c->slacks) ? $c->slacks : [];
                $changed = false;
                foreach ($slacks as $k => $s) {
                    if ((int) ($s['fixed_id'] ?? 0) === $host->id && ($s['fixed_kind'] ?? null) !== 'cable') {
                        // A reserva continua no cabo, só não está mais presa ao poste/caixa.
                        $slacks[$k]['fixed_kind'] = 'cable';
                        $slacks[$k]['fixed_id'] = null;
                        $changed = true;
                    }
                }
                if ($changed) {
                    $c->slacks = $slacks;
                    $c->save();
                }

                return $changed;
            })->values();

        return ['nodes' => $nodes, 'cables' => $cables];
    }

    /**
     * Solta as CTO/CEO fixadas no cabo que vai ser excluído.
     *
     * @return Collection<int, NetworkNode>
     */
    public static function fromCable(Cable $cable): Collection
    {
        return $cable->project->visibleNodes()->get()
            ->filter(function (NetworkNode $n) use ($cable) {
                $a = is_array($n->attributes) ? $n->attributes : [];
                if (($a['fixed_kind'] ?? null) !== 'cable' || (int) ($a['fixed_id'] ?? 0) !== $cable->id) {
                    return false;
                }
                $a['fixed_kind'] = null;
                $a['fixed_id'] = null;
                $n->attributes = $a;
                $n->save();

                return true;
            })->values();
    }
}
