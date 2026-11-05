<?php

namespace App\Services;

use App\Models\ActivityLog;
use App\Models\Cable;
use App\Models\NetworkNode;
use App\Models\Project;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Objetos compartilhados entre projetos: o mesmo poste/POP/caixa aparece em vários projetos.
 * O registro é um só (network_nodes), com um projeto de origem (project_id) e os demais em node_shares.
 */
class NodeSharing
{
    /** Tipos que podem ser procurados como duplicados entre projetos (clientes e câmeras ficam de fora). */
    public const DUPLICATE_TYPES = ['pole', 'pop', 'dc', 'tower', 'box', 'cto', 'ceo', 'condo'];

    private const EDIT_ROLES = ['owner', 'admin', 'editor'];

    /** @var array<int, ?string> */
    private array $roles = [];

    public function __construct(private ?User $user = null)
    {
    }

    public function roleIn(int $projectId): ?string
    {
        if (! array_key_exists($projectId, $this->roles)) {
            $project = Project::find($projectId);
            $this->roles[$projectId] = $project?->roleOf($this->user);
        }

        return $this->roles[$projectId];
    }

    public function canEditIn(int $projectId): bool
    {
        return in_array($this->roleIn($projectId), self::EDIT_ROLES, true);
    }

    /**
     * Acrescenta `share` aos objetos que aparecem em mais de um projeto:
     * { home_id, home_name, projects: [{id, name}], can_edit }. Objetos de um projeto só ficam sem `share`.
     *
     * @param  iterable<NetworkNode>  $nodes
     */
    public function decorate(iterable $nodes, int $contextProjectId): void
    {
        $list = collect($nodes)->filter();
        if ($list->isEmpty()) {
            return;
        }
        $shares = DB::table('node_shares')
            ->join('projects', 'projects.id', '=', 'node_shares.project_id')
            ->whereIn('network_node_id', $list->pluck('id'))
            ->orderBy('projects.name')
            ->get(['network_node_id', 'projects.id', 'projects.name'])
            ->groupBy('network_node_id');
        $homeIds = $list->filter(fn ($n) => isset($shares[$n->id]) || (int) $n->project_id !== $contextProjectId)->pluck('project_id')->unique();
        $homes = Project::whereIn('id', $homeIds)->pluck('name', 'id');
        foreach ($list as $node) {
            $others = $shares[$node->id] ?? collect();
            if ($others->isEmpty() && (int) $node->project_id === $contextProjectId) {
                $node->setAttribute('share', null);

                continue;
            }
            $node->setAttribute('share', [
                'home_id' => (int) $node->project_id,
                'home_name' => $homes[$node->project_id] ?? '—',
                'projects' => $others->map(fn ($p) => ['id' => (int) $p->id, 'name' => $p->name])->values()->all(),
                'can_edit' => $this->canEditIn($contextProjectId) && $this->canEditIn((int) $node->project_id),
            ]);
        }
    }

    /** Liga o objeto a mais um projeto. */
    public function share(NetworkNode $node, Project $target): bool
    {
        if ((int) $node->project_id === $target->id || $node->sharedProjects()->where('projects.id', $target->id)->exists()) {
            return false;
        }
        $node->sharedProjects()->attach($target->id);
        ActivityLog::record($target, 'node', $node, 'shared', ['origem' => $node->project?->name]);
        ActivityLog::record($node->project, 'node', $node, 'shared', ['com' => $target->name]);
        $target->touch();

        return true;
    }

    /**
     * Tira o objeto de um projeto que não é o de origem. As pontas dos cabos desse projeto que chegavam
     * nele ficam soltas (o traçado não muda). Devolve os cabos alterados.
     */
    public function unshare(NetworkNode $node, Project $target): Collection
    {
        $node->sharedProjects()->detach($target->id);
        $cables = $target->cables()->where(fn ($q) => $q->where('from_node_id', $node->id)->orWhere('to_node_id', $node->id))->get();
        foreach ($cables as $cable) {
            if ($cable->from_node_id === $node->id) {
                $cable->from_node_id = null;
            }
            if ($cable->to_node_id === $node->id) {
                $cable->to_node_id = null;
            }
            $cable->save();
        }
        ActivityLog::record($target, 'node', $node, 'unshared', ['origem' => $node->project?->name]);
        $target->touch();

        return $cables;
    }

    /**
     * Procura objetos do mesmo tipo a até $radius metros um do outro em projetos diferentes, entre os projetos
     * que o usuário pode editar. Devolve grupos: [{type, distance_m, keep_id, nodes: [{id, name, project_id, project_name, ...}]}].
     */
    public function findDuplicates(array $types, float $radius, ?int $onlyProjectId = null): array
    {
        $projects = Project::accessibleBy($this->user)->get(['id', 'name', 'user_id'])
            ->filter(fn (Project $p) => $this->canEditIn($p->id))
            ->keyBy('id');
        if ($projects->count() < 2) {
            return [];
        }
        $nodes = NetworkNode::whereIn('project_id', $projects->keys())->whereIn('type', $types)
            ->get(['id', 'project_id', 'type', 'name', 'lat', 'lng', 'diagram', 'attributes']);
        $visible = DB::table('node_shares')->whereIn('network_node_id', $nodes->pluck('id'))->get()
            ->groupBy('network_node_id')->map(fn ($r) => $r->pluck('project_id')->map(fn ($id) => (int) $id)->all());
        $refs = $this->cableRefs($nodes->pluck('id')->all());

        // Grade de ~radius metros para comparar só vizinhos.
        $cell = max($radius, 1) / 111320;
        $grid = [];
        foreach ($nodes as $n) {
            $grid[$n->type][(int) floor($n->lat / $cell)][(int) floor($n->lng / $cell)][] = $n;
        }
        $parent = [];
        $find = function ($x) use (&$parent, &$find) {
            return ($parent[$x] ?? $x) === $x ? $x : ($parent[$x] = $find($parent[$x]));
        };
        $projectsOf = fn (NetworkNode $n) => array_unique([(int) $n->project_id, ...($visible[$n->id] ?? [])]);
        foreach ($nodes as $a) {
            $gy = (int) floor($a->lat / $cell);
            $gx = (int) floor($a->lng / $cell);
            for ($dy = -1; $dy <= 1; $dy++) {
                for ($dx = -1; $dx <= 1; $dx++) {
                    foreach ($grid[$a->type][$gy + $dy][$gx + $dx] ?? [] as $b) {
                        if ($b->id <= $a->id || (int) $b->project_id === (int) $a->project_id) {
                            continue;
                        }
                        // Já está nos mesmos projetos? Então não é duplicado entre projetos.
                        if (array_intersect($projectsOf($a), $projectsOf($b))) {
                            continue;
                        }
                        if (Geo::distance([$a->lat, $a->lng], [$b->lat, $b->lng]) <= $radius) {
                            $parent[$find($b->id)] = $find($a->id);
                        }
                    }
                }
            }
        }
        $byId = $nodes->keyBy('id');
        $groups = [];
        foreach (array_keys($parent) as $id) {
            $groups[$find($id)][] = $id;
        }
        $out = [];
        foreach ($groups as $root => $ids) {
            $ids = array_values(array_unique([$root, ...$ids]));
            $members = collect($ids)->map(fn ($id) => $byId[$id]);
            if ($onlyProjectId && ! $members->contains(fn ($n) => in_array($onlyProjectId, $projectsOf($n), true))) {
                continue;
            }
            $keep = $this->pickKeeper($members, $refs);
            $maxDist = 0;
            foreach ($members as $m) {
                $maxDist = max($maxDist, Geo::distance([$keep->lat, $keep->lng], [$m->lat, $m->lng]));
            }
            $out[] = [
                'type' => $keep->type,
                'distance_m' => round($maxDist, 1),
                'keep_id' => $keep->id,
                'nodes' => $members->sortBy('id')->map(fn ($n) => [
                    'id' => $n->id,
                    'name' => $n->name,
                    'project_id' => (int) $n->project_id,
                    'project_name' => $projects[$n->project_id]->name ?? '—',
                    'lat' => $n->lat,
                    'lng' => $n->lng,
                    'cables' => $refs[$n->id] ?? 0,
                    'has_diagram' => $this->diagramSize($n) > 0,
                ])->values()->all(),
            ];
        }
        usort($out, fn ($a, $b) => [$a['type'], $a['nodes'][0]['name']] <=> [$b['type'], $b['nodes'][0]['name']]);

        return $out;
    }

    /**
     * Junta os duplicados num objeto só ($keep), que passa a aparecer em todos os projetos deles.
     * Cabos, fixações (CTO no poste, reserva no poste, câmera), clientes do diagrama e DVR passam para ele.
     */
    public function merge(NetworkNode $keep, Collection $dupes): void
    {
        DB::transaction(function () use ($keep, $dupes) {
            $keepAt = [(float) $keep->lat, (float) $keep->lng];
            $attrs = is_array($keep->attributes) ? $keep->attributes : [];
            $diagram = $keep->diagram;
            $notes = $keep->notes;
            foreach ($dupes as $d) {
                if ($d->id === $keep->id || $d->type !== $keep->type) {
                    continue;
                }
                $old = [(float) $d->lat, (float) $d->lng];
                foreach ($d->projectIds() as $pid) {
                    if ($pid !== (int) $keep->project_id) {
                        $keep->sharedProjects()->syncWithoutDetaching([$pid]);
                    }
                }
                // Cabos que chegam no duplicado (ou passam por ele) vão para o objeto mantido.
                $cables = Cable::where('from_node_id', $d->id)->orWhere('to_node_id', $d->id)
                    ->orWhereIn('project_id', $d->projectIds())->get();
                foreach ($cables as $cable) {
                    $dirty = false;
                    if ($cable->from_node_id === $d->id) {
                        $cable->from_node_id = $keep->id;
                        $dirty = true;
                    }
                    if ($cable->to_node_id === $d->id) {
                        $cable->to_node_id = $keep->id;
                        $dirty = true;
                    }
                    if ($cable->from_node_id && $cable->from_node_id === $cable->to_node_id) {
                        $cable->to_node_id = null;
                    }
                    $path = $cable->path ?? [];
                    $last = count($path) - 1;
                    foreach ($path as $i => $p) {
                        $end = ($i === 0 && $cable->from_node_id === $keep->id) || ($i === $last && $cable->to_node_id === $keep->id);
                        if ($end || (is_array($p) && abs((float) $p[0] - $old[0]) < 1e-8 && abs((float) $p[1] - $old[1]) < 1e-8)) {
                            if ($path[$i] != $keepAt) {
                                $path[$i] = $keepAt;
                                $dirty = true;
                            }
                        }
                    }
                    $slacks = $cable->slacks ?? [];
                    foreach ($slacks as $k => $s) {
                        if ((int) ($s['fixed_id'] ?? 0) === $d->id && in_array($s['fixed_kind'] ?? null, ['pole', 'box'], true)) {
                            $slacks[$k]['fixed_id'] = $keep->id;
                            $slacks[$k]['lat'] = $keepAt[0];
                            $slacks[$k]['lng'] = $keepAt[1];
                            $dirty = true;
                        }
                    }
                    if ($dirty) {
                        $cable->path = $path;
                        $cable->slacks = $slacks ?: $cable->slacks;
                        $cable->save();
                    }
                }
                // Objetos fixados no duplicado (CTO/CEO no poste/caixa, câmera no poste, câmera ligada ao DVR).
                $fixed = NetworkNode::whereIn('project_id', $d->projectIds())->get();
                foreach ($fixed as $n) {
                    $a = is_array($n->attributes) ? $n->attributes : [];
                    $changed = false;
                    if ((int) ($a['fixed_id'] ?? 0) === $d->id && in_array($a['fixed_kind'] ?? null, ['pole', 'box'], true)) {
                        $a['fixed_id'] = $keep->id;
                        $n->lat = $keepAt[0];
                        $n->lng = $keepAt[1];
                        $changed = true;
                    }
                    if ((int) ($a['mount_id'] ?? 0) === $d->id) {
                        $a['mount_id'] = $keep->id;
                        if (($a['mount_kind'] ?? null) !== 'wall') {
                            $n->lat = $keepAt[0];
                            $n->lng = $keepAt[1];
                        }
                        $changed = true;
                    }
                    if ((int) ($a['dvr_id'] ?? 0) === $d->id) {
                        $a['dvr_id'] = $keep->id;
                        $changed = true;
                    }
                    $dg = $n->diagram;
                    if (is_array($dg) && ! empty($dg['components'])) {
                        foreach ($dg['components'] as $k => $c) {
                            if ((int) ($c['node_id'] ?? 0) === $d->id) {
                                $dg['components'][$k]['node_id'] = $keep->id;
                                $changed = true;
                            }
                        }
                    }
                    if ($changed) {
                        $n->attributes = $a ?: null;
                        $n->diagram = $dg;
                        $n->save();
                    }
                }
                // Dados que só o duplicado tinha completam o mantido.
                $attrs = array_merge(is_array($d->attributes) ? $d->attributes : [], $attrs);
                if ($this->diagramSize($d) > $this->diagramSize($keep) && ! $diagram) {
                    $diagram = $d->diagram;
                }
                if ($d->notes && $d->notes !== $notes) {
                    $notes = trim(($notes ? $notes."\n" : '').$d->notes);
                }
                foreach ($d->projectIds() as $pid) {
                    if ($p = Project::find($pid)) {
                        ActivityLog::record($p, 'node', $keep, 'merged', ['duplicado' => "{$d->name} (#{$d->id})"]);
                        $p->touch();
                    }
                }
                $d->delete();
            }
            $keep->attributes = $attrs ?: null;
            $keep->diagram = $diagram;
            $keep->notes = $notes;
            $keep->save();
        });
    }

    /** Qual manter: o que tem diagrama, depois o com mais cabos ligados, depois o mais antigo. */
    public function pickKeeper(Collection $members, ?array $refs = null): NetworkNode
    {
        $refs ??= $this->cableRefs($members->pluck('id')->all());

        return $members->sort(fn ($a, $b) => [$this->diagramSize($b), $refs[$b->id] ?? 0, $a->id] <=> [$this->diagramSize($a), $refs[$a->id] ?? 0, $b->id])->first();
    }

    private function diagramSize(NetworkNode $n): int
    {
        $d = $n->diagram;

        return is_array($d) ? count($d['components'] ?? []) + count($d['connections'] ?? []) + count($d['splitters'] ?? []) : 0;
    }

    /** @return array<int, int> cabos com ponta em cada objeto */
    private function cableRefs(array $ids): array
    {
        $refs = [];
        foreach (array_chunk($ids, 1000) as $chunk) {
            foreach (Cable::whereIn('from_node_id', $chunk)->orWhereIn('to_node_id', $chunk)->get(['from_node_id', 'to_node_id']) as $c) {
                foreach (array_unique(array_filter([$c->from_node_id, $c->to_node_id])) as $id) {
                    $refs[$id] = ($refs[$id] ?? 0) + 1;
                }
            }
        }

        return $refs;
    }
}
