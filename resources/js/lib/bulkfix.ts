import { offsetOnPath } from './anchor';
import { CAMERA_WALL_TYPES, cameraOf } from './camera';
import { nearestOnPath, pointOnPath } from './connect';
import { FIX_OFFSET_M, fixationOf } from './fixation';
import { distance } from './geo';
import { roundLatLng } from './move';
import type { Cable, LatLng, NetNode, NodeType, Slack } from './types';

/**
 * Fixar em massa (sem React, usado também nos testes): escolhe o que fixar (CTO, CEO, reserva, câmera ou cabo),
 * onde (poste, caixa, cabo ou parede) e a distância máxima; cada objeto vai para o alvo mais perto dentro dela.
 * Fixar no poste/caixa é o mesmo que ancorar: o objeto vai para a posição do poste/caixa.
 */

export type BulkWhat = 'cto' | 'ceo' | 'slack' | 'camera' | 'cable';
export type BulkTarget = 'pole' | 'box' | 'cable' | 'wall';

export const BULK_WHAT: Record<BulkWhat, { label: string; plural: string; targets: BulkTarget[] }> = {
  cto: { label: 'CTO', plural: 'CTOs', targets: ['pole', 'box', 'cable'] },
  ceo: { label: 'CEO', plural: 'CEOs', targets: ['pole', 'box', 'cable'] },
  slack: { label: 'Reserva técnica', plural: 'reservas', targets: ['pole', 'box'] },
  camera: { label: 'Câmera', plural: 'câmeras', targets: ['pole', 'wall'] },
  cable: { label: 'Cabo (traçado)', plural: 'cabos', targets: ['pole', 'box'] },
};

export const BULK_TARGET: Record<BulkTarget, { label: string; hint: string }> = {
  pole: { label: 'Poste', hint: 'O objeto vai para o poste mais perto e fica preso nele.' },
  box: { label: 'Caixa', hint: 'O objeto vai para a caixa mais perto e fica dentro dela.' },
  cable: { label: 'Cabo', hint: 'O objeto vai para cima do traçado do cabo mais perto (no vão).' },
  wall: { label: 'Parede', hint: 'A câmera fica presa na parede do imóvel mais perto (cliente, condomínio, POP ou datacenter).' },
};

/** Explicação do que acontece com o cabo em cada alvo. */
export const CABLE_TARGET_HINT = 'Os vértices do traçado perto de um poste/caixa vão para cima dele (as pontas ligadas a caixas não mudam).';

export const BULK_DEFAULT_M = 10;
export const BULK_MAX_M = 200;
/** Abaixo disso (m) o ponto já está no alvo. */
const SAME_M = 0.05;

export interface BulkOptions {
  what: BulkWhat;
  target: BulkTarget;
  maxM: number;
  /** Também refaz os que já têm fixação (por padrão, só os sem fixação). */
  includeFixed?: boolean;
  /** Cabo: também acrescenta um vértice em cada poste/caixa que fica perto do traçado. */
  addOnPath?: boolean;
  /** Só os objetos dentro do retângulo [[sul, oeste], [norte, leste]] (a área da tela). */
  bounds?: [LatLng, LatLng] | null;
}

/** Fixação nova de um objeto (só as chaves de fixação; o resto dos atributos fica como está). */
export type BulkFix = { fixed_kind?: string | null; fixed_id?: number | null; mount_kind?: string | null; mount_id?: number | null };

export interface BulkItem {
  key: string;
  kind: 'node' | 'slack' | 'cable';
  name: string;
  targetName: string;
  /** Distância (m) até o alvo (no cabo: a maior entre os vértices ajustados). */
  dist: number;
  /** Linhas de prévia: de onde o objeto está até onde vai. */
  lines: [LatLng, LatLng][];
  /** Já tinha fixação (vai trocar). */
  refix?: boolean;
  nodeId?: number;
  cableId?: number;
  slackId?: string;
  /** Objeto: posição nova e fixação. */
  to?: LatLng;
  fix?: BulkFix;
  /** Cabo: traçado novo e quantos vértices mudaram/entraram. */
  path?: LatLng[];
  moved?: number;
  added?: number;
}

export interface BulkPlan {
  items: BulkItem[];
  /** Objetos do tipo escolhido que entraram na busca. */
  total: number;
  /** Já fixados (ignorados porque includeFixed está desligado). */
  skippedFixed: number;
  /** Sem alvo dentro da distância. */
  unmatched: number;
}

/** Índice em grade para achar o que está perto de um ponto sem comparar com tudo. */
export class Grid<T> {
  private cells = new Map<string, { p: LatLng; v: T }[]>();
  private cLat: number;
  private cLng: number;
  constructor(items: { p: LatLng; v: T }[], cellM: number) {
    const lat0 = items.length ? items[0].p[0] : 0;
    this.cLat = cellM / 111320;
    this.cLng = cellM / (111320 * Math.max(0.05, Math.cos((lat0 * Math.PI) / 180)));
    for (const it of items) {
      const k = this.key(it.p[0], it.p[1]);
      const list = this.cells.get(k);
      if (list) list.push(it);
      else this.cells.set(k, [it]);
    }
  }
  private key(lat: number, lng: number) {
    return `${Math.floor(lat / this.cLat)}:${Math.floor(lng / this.cLng)}`;
  }
  /** Candidatos dentro do retângulo (graus) — quem chama confere a distância. */
  inBox(s: number, w: number, n: number, e: number): { p: LatLng; v: T }[] {
    const out: { p: LatLng; v: T }[] = [];
    const i0 = Math.floor(s / this.cLat);
    const i1 = Math.floor(n / this.cLat);
    const j0 = Math.floor(w / this.cLng);
    const j1 = Math.floor(e / this.cLng);
    if ((i1 - i0 + 1) * (j1 - j0 + 1) > 250000) {
      for (const list of this.cells.values()) for (const it of list) if (it.p[0] >= s && it.p[0] <= n && it.p[1] >= w && it.p[1] <= e) out.push(it);
      return out;
    }
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) out.push(...(this.cells.get(`${i}:${j}`) ?? []));
    return out;
  }
  /** Candidatos a até r metros de p. */
  near(p: LatLng, r: number) {
    const dLat = r / 111320;
    const dLng = r / (111320 * Math.max(0.05, Math.cos((p[0] * Math.PI) / 180)));
    return this.inBox(p[0] - dLat, p[1] - dLng, p[0] + dLat, p[1] + dLng);
  }
  /** O mais perto de p a até r metros. */
  nearest(p: LatLng, r: number, skip?: (v: T) => boolean): { v: T; d: number } | undefined {
    let best: { v: T; d: number } | undefined;
    for (const it of this.near(p, r)) {
      if (skip?.(it.v)) continue;
      const d = distance(p, it.p);
      if (d <= r && (!best || d < best.d)) best = { v: it.v, d };
    }
    return best;
  }
}

const inBounds = (p: LatLng, b?: [LatLng, LatLng] | null) => !b || (p[0] >= b[0][0] && p[0] <= b[1][0] && p[1] >= b[0][1] && p[1] <= b[1][1]);
const nodeGrid = (nodes: NetNode[], types: NodeType[], cellM: number) =>
  new Grid(
    nodes.filter((n) => types.includes(n.type)).map((n) => ({ p: [n.lat, n.lng] as LatLng, v: n })),
    cellM,
  );

/** Prévia do que será fixado. */
export function planBulkFix(o: BulkOptions, nodes: NetNode[], cables: Cable[]): BulkPlan {
  const maxM = Math.max(0, Math.min(BULK_MAX_M, o.maxM || 0));
  const cellM = Math.max(maxM, 25);
  const plan: BulkPlan = { items: [], total: 0, skippedFixed: 0, unmatched: 0 };
  if (!BULK_WHAT[o.what].targets.includes(o.target)) return plan;
  const hostTypes: NodeType[] = o.target === 'pole' ? ['pole'] : o.target === 'box' ? ['box'] : o.target === 'wall' ? CAMERA_WALL_TYPES : [];
  const hosts = nodeGrid(nodes, hostTypes, cellM);

  if (o.what === 'cto' || o.what === 'ceo') {
    const lines = o.target === 'cable' ? cables.filter((c) => c.category !== 'drop' && c.path.length > 1) : [];
    const byId = new Map(nodes.map((n) => [n.id, n]));
    for (const n of nodes) {
      if (n.type !== o.what || !inBounds([n.lat, n.lng], o.bounds)) continue;
      plan.total++;
      const a = fixationOf(n);
      if (a.fixed_kind && !o.includeFixed) {
        plan.skippedFixed++;
        continue;
      }
      const at: LatLng = [n.lat, n.lng];
      if (o.target === 'cable') {
        // O cabo mais perto; empate (ex.: sangria na própria CTO) prefere o que passa por ela ao que termina nela.
        let best: { c: Cable; d: number; end: boolean } | undefined;
        for (const c of lines) {
          const d = nearestOnPath(c.path, at).dist;
          if (d > maxM) continue;
          const end = c.from_node_id === n.id || c.to_node_id === n.id;
          if (!best || d < best.d - 0.01 || (Math.abs(d - best.d) <= 0.01 && best.end && !end)) best = { c, d, end };
        }
        if (!best) {
          plan.unmatched++;
          continue;
        }
        if (a.fixed_kind === 'cable' && a.fixed_id === best.c.id) continue;
        // Saindo de cima de um poste/caixa: anda um pouco pelo cabo para não ficar sobre ele.
        const host = a.fixed_id ? byId.get(a.fixed_id) : undefined;
        const onHost = host && (a.fixed_kind === 'pole' || a.fixed_kind === 'box') && distance(at, [host.lat, host.lng]) < SAME_M;
        const to = roundLatLng(onHost ? offsetOnPath(best.c.path, at, FIX_OFFSET_M) : pointOnPath(best.c.path, at));
        plan.items.push({
          key: `n${n.id}`,
          kind: 'node',
          name: n.name,
          targetName: best.c.name,
          dist: best.d,
          lines: [[at, to]],
          refix: !!a.fixed_kind,
          nodeId: n.id,
          to,
          fix: { fixed_kind: 'cable', fixed_id: best.c.id },
        });
        continue;
      }
      const hit = hosts.nearest(at, maxM);
      if (!hit) {
        plan.unmatched++;
        continue;
      }
      if (a.fixed_kind === o.target && a.fixed_id === hit.v.id) continue;
      plan.items.push({
        key: `n${n.id}`,
        kind: 'node',
        name: n.name,
        targetName: hit.v.name,
        dist: hit.d,
        lines: [[at, [hit.v.lat, hit.v.lng]]],
        refix: !!a.fixed_kind,
        nodeId: n.id,
        to: [hit.v.lat, hit.v.lng],
        fix: { fixed_kind: o.target, fixed_id: hit.v.id },
      });
    }
  } else if (o.what === 'camera') {
    for (const n of nodes) {
      if (n.type !== 'camera' || !inBounds([n.lat, n.lng], o.bounds)) continue;
      plan.total++;
      const a = cameraOf(n);
      if ((a.mount_id || a.mount_kind) && !o.includeFixed) {
        plan.skippedFixed++;
        continue;
      }
      const at: LatLng = [n.lat, n.lng];
      const hit = hosts.nearest(at, maxM);
      if (!hit) {
        plan.unmatched++;
        continue;
      }
      if (a.mount_id === hit.v.id && (a.mount_kind ?? (o.target === 'pole' ? 'pole' : 'wall')) === o.target) continue;
      // No poste: vai para o poste. Na parede: fica onde está (o imóvel é grande), só registra em qual.
      const to: LatLng = o.target === 'pole' ? [hit.v.lat, hit.v.lng] : at;
      plan.items.push({
        key: `n${n.id}`,
        kind: 'node',
        name: n.name,
        targetName: hit.v.name,
        dist: hit.d,
        lines: [[at, [hit.v.lat, hit.v.lng]]],
        refix: !!(a.mount_id || a.mount_kind),
        nodeId: n.id,
        to,
        fix: { mount_kind: o.target, mount_id: hit.v.id },
      });
    }
  } else if (o.what === 'slack') {
    for (const c of cables) {
      for (const r of c.slacks ?? []) {
        const at: LatLng = [r.lat, r.lng];
        if (!inBounds(at, o.bounds)) continue;
        plan.total++;
        if (r.fixed_kind && !o.includeFixed) {
          plan.skippedFixed++;
          continue;
        }
        const hit = hosts.nearest(at, maxM);
        if (!hit) {
          plan.unmatched++;
          continue;
        }
        if (r.fixed_kind === o.target && r.fixed_id === hit.v.id && distance(at, [hit.v.lat, hit.v.lng]) < SAME_M) continue;
        plan.items.push({
          key: `s${c.id}:${r.id}`,
          kind: 'slack',
          name: `${r.length_m} m · ${c.name}`,
          targetName: hit.v.name,
          dist: hit.d,
          lines: [[at, [hit.v.lat, hit.v.lng]]],
          refix: !!r.fixed_kind,
          cableId: c.id,
          slackId: r.id,
          to: [hit.v.lat, hit.v.lng],
          fix: { fixed_kind: o.target, fixed_id: hit.v.id },
        });
      }
    }
  } else {
    for (const c of cables) {
      if (c.path.length < 2 || !c.path.some((p) => inBounds(p, o.bounds))) continue;
      plan.total++;
      const it = snapCable(c, hosts, maxM, !!o.addOnPath);
      if (it) plan.items.push(it);
      else plan.unmatched++;
    }
  }
  plan.items.sort((x, y) => x.dist - y.dist || x.name.localeCompare(y.name));
  return plan;
}

/** Cabo: vértices perto de um poste/caixa vão para cima dele; com addOnPath, os postes/caixas perto do traçado viram vértices. */
export function snapCable(c: Cable, hosts: Grid<NetNode>, maxM: number, addOnPath: boolean): BulkItem | null {
  const last = c.path.length - 1;
  const path: LatLng[] = c.path.map((p) => [p[0], p[1]]);
  const lines: [LatLng, LatLng][] = [];
  const names: string[] = [];
  const used = new Set<number>();
  let moved = 0;
  let added = 0;
  let worst = 0;
  path.forEach((p, i) => {
    const fixedEnd = (i === 0 && c.from_node_id) || (i === last && c.to_node_id);
    const hit = hosts.nearest(p, fixedEnd ? SAME_M : maxM);
    if (!hit) return;
    used.add(hit.v.id);
    if (hit.d < SAME_M || fixedEnd) return;
    lines.push([p, [hit.v.lat, hit.v.lng]]);
    names.push(hit.v.name);
    path[i] = [hit.v.lat, hit.v.lng];
    moved++;
    worst = Math.max(worst, hit.d);
  });
  let out = path;
  if (addOnPath) {
    out = [path[0]];
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i];
      const b = path[i + 1];
      const r = maxM;
      const dLng = r / (111320 * Math.max(0.05, Math.cos((a[0] * Math.PI) / 180)));
      const dLat = r / 111320;
      const found: { t: number; n: NetNode; at: LatLng; d: number }[] = [];
      for (const it of hosts.inBox(Math.min(a[0], b[0]) - dLat, Math.min(a[1], b[1]) - dLng, Math.max(a[0], b[0]) + dLat, Math.max(a[1], b[1]) + dLng)) {
        if (used.has(it.v.id)) continue;
        const near = nearestOnPath([a, b], it.p);
        if (near.dist > maxM || near.t <= 0 || near.t >= 1) continue;
        if (distance(a, it.p) < 1 || distance(b, it.p) < 1) continue;
        found.push({ t: near.t, n: it.v, at: [a[0] + (b[0] - a[0]) * near.t, a[1] + (b[1] - a[1]) * near.t], d: near.dist });
      }
      found.sort((x, y) => x.t - y.t);
      for (const f of found) {
        if (used.has(f.n.id)) continue;
        used.add(f.n.id);
        out.push([f.n.lat, f.n.lng]);
        if (f.d >= SAME_M) lines.push([f.at, [f.n.lat, f.n.lng]]);
        names.push(f.n.name);
        added++;
        worst = Math.max(worst, f.d);
      }
      out.push(b);
    }
  }
  // Dois vértices seguidos no mesmo poste viram um só (as pontas ficam).
  const clean: LatLng[] = [];
  out.forEach((p, i) => {
    const prev = clean[clean.length - 1];
    if (prev && i < out.length - 1 && distance(prev, p) < SAME_M) return;
    if (prev && i === out.length - 1 && clean.length > 1 && distance(prev, p) < SAME_M) clean.pop();
    clean.push(p);
  });
  if (!moved && !added) return null;
  const uniq = [...new Set(names)];
  return {
    key: `c${c.id}`,
    kind: 'cable',
    name: c.name,
    targetName: uniq.length > 2 ? `${uniq.slice(0, 2).join(', ')} +${uniq.length - 2}` : uniq.join(', '),
    dist: worst,
    lines,
    cableId: c.id,
    path: clean.length >= 2 ? clean : c.path,
    moved,
    added,
  };
}

/** Corpo do POST /fix-bulk para os itens escolhidos. */
export interface BulkPayload {
  nodes: { id: number; lat: number; lng: number; fix: BulkFix }[];
  cables: { id: number; path?: LatLng[]; slacks?: { id: string; lat: number; lng: number; fixed_kind: string | null; fixed_id: number | null }[] }[];
}

export function bulkPayload(items: BulkItem[]): BulkPayload {
  const nodes: BulkPayload['nodes'] = [];
  const byCable = new Map<number, BulkPayload['cables'][number]>();
  const cable = (id: number) => byCable.get(id) ?? byCable.set(id, { id }).get(id)!;
  for (const it of items) {
    if (it.kind === 'node' && it.nodeId && it.to && it.fix) nodes.push({ id: it.nodeId, lat: it.to[0], lng: it.to[1], fix: it.fix });
    else if (it.kind === 'slack' && it.cableId && it.slackId && it.to && it.fix) {
      const c = cable(it.cableId);
      (c.slacks ??= []).push({ id: it.slackId, lat: it.to[0], lng: it.to[1], fixed_kind: it.fix.fixed_kind ?? null, fixed_id: it.fix.fixed_id ?? null });
    } else if (it.kind === 'cable' && it.cableId && it.path) cable(it.cableId).path = it.path;
  }
  return { nodes, cables: [...byCable.values()] };
}

/** Corpo que desfaz `items` (posição e fixação de antes). */
export function undoPayload(items: BulkItem[], nodes: NetNode[], cables: Cable[]): BulkPayload {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const cableById = new Map(cables.map((c) => [c.id, c]));
  const out: BulkPayload = { nodes: [], cables: [] };
  const byCable = new Map<number, BulkPayload['cables'][number]>();
  const cable = (id: number) => byCable.get(id) ?? byCable.set(id, { id }).get(id)!;
  for (const it of items) {
    if (it.kind === 'node' && it.nodeId) {
      const n = nodeById.get(it.nodeId);
      if (!n) continue;
      const a = (n.attributes ?? {}) as Record<string, unknown>;
      const fix: BulkFix = {};
      for (const k of Object.keys(it.fix ?? {}) as (keyof BulkFix)[]) (fix as Record<string, unknown>)[k] = a[k] ?? null;
      out.nodes.push({ id: n.id, lat: n.lat, lng: n.lng, fix });
    } else if (it.kind === 'slack' && it.cableId && it.slackId) {
      const r: Slack | undefined = cableById.get(it.cableId)?.slacks?.find((s) => s.id === it.slackId);
      if (r) (cable(it.cableId).slacks ??= []).push({ id: r.id, lat: r.lat, lng: r.lng, fixed_kind: r.fixed_kind ?? null, fixed_id: r.fixed_id ?? null });
    } else if (it.kind === 'cable' && it.cableId) {
      const c = cableById.get(it.cableId);
      if (c) cable(c.id).path = c.path;
    }
  }
  out.cables = [...byCable.values()];
  return out;
}

/** Resumo para a mensagem e o histórico ("12 CTOs no poste (até 10 m)"). */
export function bulkSummary(what: BulkWhat, target: BulkTarget, count: number, maxM: number): string {
  const w = BULK_WHAT[what];
  const noun = count === 1 ? (what === 'slack' ? 'reserva' : what === 'cable' ? 'cabo' : w.label.toLowerCase() === 'câmera' ? 'câmera' : w.label) : w.plural;
  const where = { pole: 'no poste', box: 'na caixa', cable: 'no cabo', wall: 'na parede' }[target];
  return `${count} ${noun} ${where} mais perto (até ${maxM} m)`;
}
