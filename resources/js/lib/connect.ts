import type { Cable, LatLng, NetNode } from './types';

/** Tipos de caixa que a opção "Conectar caixas no traçado" procura. */
export const ALONG_TYPES: NetNode['type'][] = ['cto', 'ceo', 'condo'];
/** Distância máxima (m) entre a caixa e o traçado do cabo para ela ser considerada "no traçado". */
export const ALONG_TOLERANCE_M = 30;

/** Projeção local em metros (boa o bastante para distâncias de algumas centenas de metros). */
function toXY(p: LatLng, lat0: number): [number, number] {
  const k = Math.cos((lat0 * Math.PI) / 180);
  return [p[1] * 111320 * k, p[0] * 110574];
}

/** Ponto do traçado mais próximo de `at`: segmento (i → i+1), posição t (0..1) e distância em metros. */
export function nearestOnPath(path: LatLng[], at: LatLng): { seg: number; t: number; dist: number; along: number } {
  const lat0 = at[0];
  const [px, py] = toXY(at, lat0);
  let best = { seg: 0, t: 0, dist: Infinity, along: 0 };
  let walked = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, ay] = toXY(path[i], lat0);
    const [bx, by] = toXY(path[i + 1], lat0);
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
    const dist = Math.hypot(ax + t * dx - px, ay + t * dy - py);
    const len = Math.sqrt(len2);
    if (dist < best.dist) best = { seg: i, t, dist, along: walked + t * len };
    walked += len;
  }
  return best;
}

export interface AlongPlan {
  /** Traçado novo, com um vértice sobre cada caixa. */
  path: LatLng[];
  /** Vértices do meio que viram sangria. */
  cuts: { index: number; node_id: number }[];
  /** Caixa que passa a ser a ponta inicial/final (só quando a ponta estava solta). */
  from: number | null;
  to: number | null;
  /** Caixas que serão conectadas, na ordem do traçado. */
  nodes: NetNode[];
}

/**
 * Planeja "Conectar caixas no traçado": acha as CTOs/CEOs a até `tol` metros do cabo.
 * Caixas no meio do traçado viram sangria; caixas além de uma ponta solta viram a ponta.
 */
export function planBoxesAlong(cable: Cable, nodes: NetNode[], tol = ALONG_TOLERANCE_M): AlongPlan | null {
  const path = cable.path;
  const last = path.length - 1;
  if (last < 1) return null;
  const segLen = (i: number) => {
    const lat0 = path[i][0];
    const [ax, ay] = toXY(path[i], lat0);
    const [bx, by] = toXY(path[i + 1], lat0);
    return Math.hypot(bx - ax, by - ay);
  };

  let start: { node: NetNode; dist: number } | null = null;
  let end: { node: NetNode; dist: number } | null = null;
  const snaps = new Map<number, { node: NetNode; dist: number }>(); // vértice existente → caixa
  const inserts: { seg: number; t: number; node: NetNode; along: number }[] = [];

  for (const n of nodes) {
    if (!ALONG_TYPES.includes(n.type) || n.id === cable.from_node_id || n.id === cable.to_node_id) continue;
    const near = nearestOnPath(path, [n.lat, n.lng]);
    if (near.dist > tol) continue;
    const len = segLen(near.seg);
    // A menos de 1 m de um vértice existente: usa o próprio vértice.
    const vertex = near.t * len < 1 ? near.seg : (1 - near.t) * len < 1 ? near.seg + 1 : -1;
    if (vertex === 0 || vertex === last) {
      // Na ponta: só conecta se ela estiver solta.
      if ((vertex === 0 ? cable.from_node_id : cable.to_node_id) !== null) continue;
      const slot = vertex === 0 ? start : end;
      if (!slot || near.dist < slot.dist) {
        if (vertex === 0) start = { node: n, dist: near.dist };
        else end = { node: n, dist: near.dist };
      }
    } else if (vertex > 0) {
      const cur = snaps.get(vertex);
      if (!cur || near.dist < cur.dist) snaps.set(vertex, { node: n, dist: near.dist });
    } else {
      inserts.push({ seg: near.seg, t: near.t, node: n, along: near.along });
    }
  }

  // Monta o traçado novo, em ordem, guardando o índice de cada sangria.
  const out: LatLng[] = [];
  const cuts: { index: number; node_id: number }[] = [];
  const ordered: NetNode[] = [];
  if (start) ordered.push(start.node);
  for (let i = 0; i <= last; i++) {
    const snap = snaps.get(i);
    if (i === 0 && start) out.push([start.node.lat, start.node.lng]);
    else if (i === last && end) out.push([end.node.lat, end.node.lng]);
    else if (snap) {
      cuts.push({ index: out.length, node_id: snap.node.id });
      ordered.push(snap.node);
      out.push([snap.node.lat, snap.node.lng]);
    } else out.push(path[i]);
    if (i < last) {
      for (const ins of inserts.filter((x) => x.seg === i).sort((a, b) => a.t - b.t)) {
        cuts.push({ index: out.length, node_id: ins.node.id });
        ordered.push(ins.node);
        out.push([ins.node.lat, ins.node.lng]);
      }
    }
  }
  if (end) ordered.push(end.node);
  if (!ordered.length) return null;
  return { path: out, cuts, from: start?.node.id ?? null, to: end?.node.id ?? null, nodes: ordered };
}

/** Ponto do traçado mais próximo de `at` (para encaixar a reserva técnica no cabo). */
export function pointOnPath(path: LatLng[], at: LatLng): LatLng {
  const { seg, t } = nearestOnPath(path, at);
  const a = path[seg];
  const b = path[Math.min(seg + 1, path.length - 1)];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}
