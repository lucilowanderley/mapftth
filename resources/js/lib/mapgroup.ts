import type { Cable, NetNode, NodeType } from './types';

/**
 * Agrupamento no mapa: um objeto "agrupado" esconde tudo o que está à frente dele (a jusante)
 * pelos cabos de saída e derivações. Os membros não ficam gravados, são calculados pelos cabos,
 * então o que for ligado depois entra sozinho no grupo. Só a lista de objetos agrupados é salva
 * (neste navegador, por projeto), porque agrupar muda apenas a visualização.
 */

/** Objetos de onde a rede parte (o sentido "a jusante" é para longe deles). */
const ROOT_TYPES: NodeType[] = ['pop', 'dc', 'tower'];

export interface Downstream {
  nodes: Set<number>;
  cables: Set<number>;
}

interface Edge {
  cable: Cable;
  other: number | null;
}

function adjacency(cables: Cable[]) {
  const adj = new Map<number, Edge[]>();
  const add = (id: number | null, e: Edge) => {
    if (id === null) return;
    const list = adj.get(id);
    if (list) list.push(e);
    else adj.set(id, [e]);
  };
  for (const c of cables) {
    if (c.from_node_id !== null && c.from_node_id === c.to_node_id) continue;
    add(c.from_node_id, { cable: c, other: c.to_node_id });
    add(c.to_node_id, { cable: c, other: c.from_node_id });
  }
  return adj;
}

/** Distância (m, pelos cabos) de cada objeto até o POP/Datacenter/Torre mais próximo. */
function distanceFromRoots(nodes: NetNode[], adj: Map<number, Edge[]>): Map<number, number> {
  const dist = new Map<number, number>();
  const queue: [number, number][] = [];
  for (const n of nodes) {
    if (ROOT_TYPES.includes(n.type)) {
      dist.set(n.id, 0);
      queue.push([n.id, 0]);
    }
  }
  // Dijkstra simples (redes de projeto têm poucos milhares de objetos).
  while (queue.length) {
    let bi = 0;
    for (let i = 1; i < queue.length; i++) if (queue[i][1] < queue[bi][1]) bi = i;
    const [u, d] = queue.splice(bi, 1)[0];
    if (d > (dist.get(u) ?? Infinity)) continue;
    for (const e of adj.get(u) ?? []) {
      if (e.other === null) continue;
      const nd = d + Math.max(0.1, e.cable.length_m || 0);
      if (nd < (dist.get(e.other) ?? Infinity)) {
        dist.set(e.other, nd);
        queue.push([e.other, nd]);
      }
    }
  }
  return dist;
}

/** Contexto calculado uma vez por rede, reaproveitado para vários grupos. */
export function groupContext(nodes: NetNode[], cables: Cable[]) {
  const adj = adjacency(cables);
  return { adj, dist: distanceFromRoots(nodes, adj) };
}

export type GroupContext = ReturnType<typeof groupContext>;

/**
 * Objetos e cabos a jusante de `rootId`.
 * - Rede ligada a um POP/Datacenter/Torre: segue só para objetos cada vez mais longe da origem
 *   (o cabo de chegada e os anéis de volta ficam fora).
 * - Rede sem origem: o cabo de chegada é o que termina no objeto (to_node_id); os demais são saídas.
 * - POP/Datacenter/Torre agrupado: esconde tudo o que sai dele.
 */
export function downstreamOf(rootId: number, ctx: GroupContext): Downstream {
  const { adj, dist } = ctx;
  const out: Downstream = { nodes: new Set(), cables: new Set() };
  const rootDist = dist.get(rootId);
  const rooted = rootDist !== undefined;
  const visited = new Set<number>([rootId]);
  const stack: number[] = [rootId];
  while (stack.length) {
    const u = stack.pop()!;
    const du = dist.get(u);
    for (const e of adj.get(u) ?? []) {
      if (out.cables.has(e.cable.id)) continue;
      if (rooted) {
        // Só desce: o outro lado precisa estar mais longe da origem que o objeto atual.
        if (e.other !== null) {
          const dv = dist.get(e.other);
          if (dv === undefined || du === undefined || dv <= du) continue;
        }
      } else if (u === rootId && e.cable.to_node_id === rootId && e.other !== null) {
        continue; // cabo de chegada
      }
      out.cables.add(e.cable.id);
      if (e.other === null || visited.has(e.other)) continue;
      visited.add(e.other);
      out.nodes.add(e.other);
      stack.push(e.other);
    }
  }
  return out;
}

export interface GroupView {
  hiddenNodes: Set<number>;
  hiddenCables: Set<number>;
  /** Quantos objetos cada grupo esconde. */
  counts: Map<number, number>;
}

/** Junta os grupos ativos: tudo o que algum deles esconde fica fora do mapa. */
export function groupView(groups: number[], nodes: NetNode[], cables: Cable[]): GroupView {
  const view: GroupView = { hiddenNodes: new Set(), hiddenCables: new Set(), counts: new Map() };
  if (!groups.length) return view;
  const ctx = groupContext(nodes, cables);
  const ids = new Set(nodes.map((n) => n.id));
  for (const g of groups) {
    if (!ids.has(g)) continue;
    const d = downstreamOf(g, ctx);
    d.nodes.forEach((n) => view.hiddenNodes.add(n));
    d.cables.forEach((c) => view.hiddenCables.add(c));
    view.counts.set(g, d.nodes.size);
  }
  return view;
}

const key = (projectId: number) => `mapftth.groups.${projectId}`;

export function loadGroups(projectId: number): number[] {
  try {
    const v = JSON.parse(localStorage.getItem(key(projectId)) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'number') : [];
  } catch {
    return [];
  }
}

export function saveGroups(projectId: number, groups: number[]) {
  try {
    if (groups.length) localStorage.setItem(key(projectId), JSON.stringify(groups));
    else localStorage.removeItem(key(projectId));
  } catch {
    /* sem armazenamento: o agrupamento vale só nesta sessão */
  }
}
