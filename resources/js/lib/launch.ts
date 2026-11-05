import { nearestOnPath } from './connect';
import { distance, pathLength } from './geo';
import type { CableCategory, Duct, LatLng, NetNode } from './types';

/**
 * Lançamento de cabo (sem React, usado também nos testes).
 *
 * Dois jeitos de lançar:
 * 1. Pelos postes: o projetista escolhe os postes do mapa, na ordem, e o cabo passa por eles.
 * 2. Início e fim: o sistema segue a rua entre os dois pontos, usa os postes que já existem no caminho,
 *    acrescenta os que faltam (na distância escolhida e nas esquinas) e fixa o cabo e as reservas neles.
 */

/** Padrões por tipo de cabo: distância entre postes, reserva técnica a cada X m e metragem da reserva. */
export const LAUNCH_DEFAULTS: Record<Exclude<CableCategory, 'drop'>, { spacing: number; slackEvery: number; slackLength: number }> = {
  backbone: { spacing: 100, slackEvery: 500, slackLength: 15 },
  distribution: { spacing: 40, slackEvery: 500, slackLength: 15 },
};

/** Postes a até essa distância (m) da rua contam como "no caminho". */
export const POLE_SNAP_M = 20;
/** Curva da rua (graus) a partir da qual o sistema põe um poste na esquina. */
export const CORNER_DEG = 30;

/** Ponto do lançamento: poste existente, poste novo ou só um vértice do cabo. */
export interface LaunchPoint {
  at: LatLng;
  /** Poste existente. */
  pole_id?: number;
  /** Poste novo (criado junto com o cabo). */
  new_pole?: boolean;
  /** Caixa existente (caixa de passagem / emenda subterrânea). */
  box_id?: number;
  /** Vértice do traçado de um duto (o cabo passa por dentro dele). */
  duct_id?: number;
  /** Distância (m) desde o início, pelo caminho. */
  along: number;
}

export interface LaunchPlan {
  /** Pontos do cabo, na ordem (postes e vértices). */
  points: LaunchPoint[];
  /** Índices (em `points`) dos postes que recebem reserva técnica. */
  slacks: number[];
  /** Metragem do cabo, sem as reservas. */
  length: number;
  existing: number;
  created: number;
  /** Caixas por onde o cabo passa. */
  boxes: number;
  /** Dutos ocupados pelo cabo, na ordem, com a metragem dentro de cada um. */
  ducts: { id: number; meters: number }[];
}

const isPole = (p: LaunchPoint) => p.pole_id != null || !!p.new_pole;
/** Ponto onde dá para fixar a reserva técnica: poste (novo ou existente) ou caixa. */
const isHost = (p: LaunchPoint) => isPole(p) || p.box_id != null;

/** Ponto a `meters` metros do início do caminho. */
export function pointAlong(path: LatLng[], meters: number): LatLng {
  let walked = 0;
  for (let i = 1; i < path.length; i++) {
    const d = distance(path[i - 1], path[i]);
    if (walked + d >= meters && d > 0) {
      const t = (meters - walked) / d;
      return [path[i - 1][0] + (path[i][0] - path[i - 1][0]) * t, path[i - 1][1] + (path[i][1] - path[i - 1][1]) * t];
    }
    walked += d;
  }
  return path[path.length - 1];
}

/** Rumo (graus) de a para b, em projeção local. */
function bearing(a: LatLng, b: LatLng): number {
  const k = Math.cos((a[0] * Math.PI) / 180);
  return (Math.atan2((b[1] - a[1]) * k, b[0] - a[0]) * 180) / Math.PI;
}

/** Vértices do caminho onde a rua vira mais que `minDeg` graus (esquinas), com a distância desde o início. */
export function corners(path: LatLng[], minDeg = CORNER_DEG): { at: LatLng; along: number }[] {
  const out: { at: LatLng; along: number }[] = [];
  let walked = 0;
  for (let i = 1; i < path.length - 1; i++) {
    walked += distance(path[i - 1], path[i]);
    let turn = Math.abs(bearing(path[i], path[i + 1]) - bearing(path[i - 1], path[i]));
    if (turn > 180) turn = 360 - turn;
    if (turn >= minDeg) out.push({ at: path[i], along: walked });
  }
  // Curvas suaves feitas de vários vértices próximos viram uma esquina só.
  return out.filter((c, i) => i === 0 || c.along - out[i - 1].along > 8);
}

/** Postes já cadastrados a até `snap` metros do caminho, na ordem do caminho. */
export function polesAlong(path: LatLng[], poles: NetNode[], snap = POLE_SNAP_M): { pole: NetNode; along: number; dist: number }[] {
  if (path.length < 2) return [];
  const found = poles
    .filter((p) => p.type === 'pole')
    .map((pole) => ({ pole, ...nearestOnPath(path, [pole.lat, pole.lng]) }))
    .filter((x) => x.dist <= snap)
    .sort((a, b) => a.along - b.along);
  // Dois postes quase no mesmo ponto do caminho (ex.: um de cada lado da rua): fica o mais perto da rua.
  const out: { pole: NetNode; along: number; dist: number }[] = [];
  for (const f of found) {
    const prev = out[out.length - 1];
    if (prev && f.along - prev.along < 5) {
      if (f.dist < prev.dist) out[out.length - 1] = { pole: f.pole, along: f.along, dist: f.dist };
      continue;
    }
    out.push({ pole: f.pole, along: f.along, dist: f.dist });
  }
  return out;
}

/** Reservas técnicas: a cada `every` metros, no poste mais perto dessa marca. */
export function planSlacks(points: LaunchPoint[], every: number): number[] {
  if (!(every > 0) || points.length < 2) return [];
  const total = points[points.length - 1].along;
  const poles = points.map((p, i) => ({ p, i })).filter((x) => isHost(x.p));
  if (!poles.length) return [];
  const used = new Set<number>();
  // Tolerância de 2% no fim: um cabo de 999 m com reserva a cada 500 m ganha a reserva da marca de 1000 m.
  for (let mark = every; mark <= total + every * 0.02; mark += every) {
    let best: { p: LaunchPoint; i: number } | undefined;
    for (const x of poles) {
      if (used.has(x.i)) continue;
      if (!best || Math.abs(x.p.along - mark) < Math.abs(best.p.along - mark)) best = x;
    }
    if (best) used.add(best.i);
  }
  return [...used].sort((a, b) => a - b);
}

function finish(points: LaunchPoint[], slackEvery: number, ducts: { id: number; meters: number }[] = []): LaunchPlan {
  return {
    points,
    slacks: planSlacks(points, slackEvery),
    length: pathLength(points.map((p) => p.at)),
    existing: points.filter((p) => p.pole_id != null).length,
    created: points.filter((p) => p.new_pole).length,
    boxes: points.filter((p) => p.box_id != null).length,
    ducts,
  };
}

/** Objetos que dá para escolher no modo "Escolher pontos": postes e caixas. */
export const STOP_TYPES = ['pole', 'box'] as const;
export const isStop = (n: NetNode) => (STOP_TYPES as readonly string[]).includes(n.type);

/** Distância (m) máxima de um poste/caixa ao traçado do duto para o cabo entrar ou sair dele ali. */
export const DUCT_STOP_M = 10;

/** Trecho do caminho entre as distâncias `from` e `to` (desde o início); invertido quando `from` > `to`. */
export function subPath(path: LatLng[], from: number, to: number): LatLng[] {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const out: LatLng[] = [pointAlong(path, lo)];
  let walked = 0;
  for (let i = 1; i < path.length; i++) {
    walked += distance(path[i - 1], path[i]);
    if (walked > lo + 0.5 && walked < hi - 0.5) out.push(path[i]);
  }
  out.push(pointAlong(path, hi));
  return from <= to ? out : out.reverse();
}

/**
 * Duto que liga dois pontos escolhidos: os dois são caixas a até `tol` metros do traçado do duto, ou são os
 * objetos das pontas dele (ex.: o poste da subida do duto). Poste comum perto do duto não conta: o cabo aéreo
 * da mesma rua não entra no duto. Devolve o trecho do duto entre eles, no sentido de `a` para `b`; com vários, o mais curto.
 */
export function ductBetween(a: NetNode, b: NetNode, ducts: Duct[], tol = DUCT_STOP_M): { duct: Duct; path: LatLng[]; meters: number } | null {
  let best: { duct: Duct; path: LatLng[]; meters: number } | null = null;
  for (const d of ducts) {
    if (!d.path || d.path.length < 2) continue;
    const at = (n: NetNode) => {
      const ends = [d.from_node_id, d.to_node_id];
      if (ends[0] === n.id) return { along: 0, dist: 0 };
      if (ends[1] === n.id) return { along: pathLength(d.path), dist: 0 };
      if (n.type !== 'box') return { along: 0, dist: Infinity };
      return nearestOnPath(d.path, [n.lat, n.lng]);
    };
    const pa = at(a);
    const pb = at(b);
    if (pa.dist > tol || pb.dist > tol || Math.abs(pa.along - pb.along) < 2) continue;
    const path = subPath(d.path, pa.along, pb.along);
    path[0] = [a.lat, a.lng];
    path[path.length - 1] = [b.lat, b.lng];
    const meters = Math.abs(pa.along - pb.along);
    if (!best || meters < best.meters) best = { duct: d, path, meters };
  }
  return best;
}

/**
 * Modo "Escolher pontos": cabo passando pelos postes e caixas escolhidos, na ordem. Entre dois pontos ligados
 * por um duto, o cabo segue o traçado do duto (por dentro dele) e o duto fica ocupado pelo cabo.
 */
export function planFromStops(stops: NetNode[], slackEvery: number, ducts: Duct[] = []): LaunchPlan {
  const points: LaunchPoint[] = [];
  const used: { id: number; meters: number }[] = [];
  let along = 0;
  const push = (p: Omit<LaunchPoint, 'along'>) => {
    const prev = points[points.length - 1];
    if (prev) along += distance(prev.at, p.at);
    points.push({ ...p, along });
  };
  const stopPoint = (n: NetNode): Omit<LaunchPoint, 'along'> => (n.type === 'pole' ? { at: [n.lat, n.lng], pole_id: n.id } : { at: [n.lat, n.lng], box_id: n.id });
  stops.forEach((n, i) => {
    if (i > 0) {
      const via = ducts.length ? ductBetween(stops[i - 1], n, ducts) : null;
      if (via) {
        for (const at of via.path.slice(1, -1)) push({ at, duct_id: via.duct.id });
        const u = used.find((x) => x.id === via.duct.id);
        if (u) u.meters += via.meters;
        else used.push({ id: via.duct.id, meters: via.meters });
      }
    }
    push(stopPoint(n));
  });
  return finish(points, slackEvery, used);
}

/** Modo 1: cabo passando pelos postes escolhidos, na ordem. */
export function planFromPoles(poles: NetNode[], slackEvery: number): LaunchPlan {
  return planFromStops(poles, slackEvery);
}

/** Ordena os postes pelo caminho mais curto, começando no primeiro (vizinho mais próximo). */
export function orderByNearest(poles: NetNode[]): NetNode[] {
  if (poles.length < 3) return poles;
  const rest = poles.slice(1);
  const out = [poles[0]];
  while (rest.length) {
    const last = out[out.length - 1];
    let k = 0;
    for (let i = 1; i < rest.length; i++) {
      if (distance([last.lat, last.lng], [rest[i].lat, rest[i].lng]) < distance([last.lat, last.lng], [rest[k].lat, rest[k].lng])) k = i;
    }
    out.push(rest.splice(k, 1)[0]);
  }
  return out;
}

export interface RoutePlanOptions {
  /** Postes do projeto (os que estão no caminho são usados quando `useExisting`). */
  poles: NetNode[];
  useExisting: boolean;
  /** Acrescentar os postes que faltam. */
  addPoles: boolean;
  /** Distância máxima entre postes (m). */
  spacing: number;
  slackEvery: number;
  snap?: number;
}

/**
 * Modo 2: lançamento sobre o caminho da rua (`route`, do início ao fim).
 * Os postes ficam nas pontas, nas esquinas e a cada `spacing` metros no máximo; com postes, o cabo vai de
 * poste em poste. Sem acrescentar postes, o cabo segue a rua e passa pelos postes existentes do caminho.
 */
export function planFromRoute(route: LatLng[], opt: RoutePlanOptions): LaunchPlan {
  const total = pathLength(route);
  const spacing = Math.max(5, opt.spacing || 0);
  const existing = opt.useExisting ? polesAlong(route, opt.poles, opt.snap) : [];
  const anchors: LaunchPoint[] = existing.map((e) => ({ at: [e.pole.lat, e.pole.lng], pole_id: e.pole.id, along: e.along }));

  if (opt.addPoles) {
    const near = (along: number, tol: number) => anchors.some((a) => Math.abs(a.along - along) <= tol);
    if (!near(0, 10)) anchors.push({ at: route[0], new_pole: true, along: 0 });
    if (!near(total, 10)) anchors.push({ at: route[route.length - 1], new_pole: true, along: total });
    for (const c of corners(route)) if (!near(c.along, Math.min(15, spacing / 3))) anchors.push({ at: c.at, new_pole: true, along: c.along });
    anchors.sort((a, b) => a.along - b.along);
    // Completa os vãos maiores que a distância entre postes.
    const filled: LaunchPoint[] = [];
    anchors.forEach((a, i) => {
      if (i > 0) {
        const prev = anchors[i - 1];
        const gap = a.along - prev.along;
        const n = Math.ceil(gap / spacing - 0.02) - 1;
        for (let k = 1; k <= n; k++) {
          const along = prev.along + (gap * k) / (n + 1);
          filled.push({ at: pointAlong(route, along), new_pole: true, along });
        }
      }
      filled.push(a);
    });
    // Distância real, de poste em poste (o cabo vai reto entre eles).
    let walked = 0;
    const points = filled.map((p, i) => {
      if (i > 0) walked += distance(filled[i - 1].at, p.at);
      return { ...p, along: walked };
    });
    return finish(points, opt.slackEvery);
  }

  // Sem postes novos: segue a rua e passa por cima dos postes existentes.
  const merged: LaunchPoint[] = [];
  let walked = 0;
  route.forEach((at, i) => {
    if (i > 0) walked += distance(route[i - 1], at);
    merged.push({ at, along: walked });
  });
  for (const a of anchors) merged.push(a);
  merged.sort((a, b) => a.along - b.along);
  // Vértice da rua colado num poste some (o cabo passa pelo poste).
  const points = merged.filter((p, i) => isPole(p) || !merged.some((q, j) => j !== i && isPole(q) && distance(q.at, p.at) < 3));
  let w = 0;
  return finish(
    points.map((p, i) => {
      if (i > 0) w += distance(points[i - 1].at, p.at);
      return { ...p, along: w };
    }),
    opt.slackEvery,
  );
}
