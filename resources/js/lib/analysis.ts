import { clientBudget, powerLevel, traceUpstream, type BudgetResult, type PowerLevel } from './budget';
import { splitterModel } from './catalog';
import { distance } from './geo';
import type { Cable, LatLng, NetNode, Network, NodeType, SlackKind, Status } from './types';

// ---------------- Geometria ----------------

/** Ponto dentro de polígono (ray casting), coordenadas [lat, lng]. */
export function pointInPolygon(p: LatLng, poly: LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i];
    const [yj, xj] = poly[j];
    if (yi > p[0] !== yj > p[0] && p[1] < ((xj - xi) * (p[0] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Área aproximada do polígono em m² (projeção equiretangular local). */
export function polygonArea(poly: LatLng[]): number {
  if (poly.length < 3) return 0;
  const lat0 = (poly.reduce((a, p) => a + p[0], 0) / poly.length) * (Math.PI / 180);
  const R = 6371008.8;
  const xy = poly.map(([lat, lng]) => [((lng * Math.PI) / 180) * R * Math.cos(lat0), ((lat * Math.PI) / 180) * R]);
  let sum = 0;
  for (let i = 0; i < xy.length; i++) {
    const [x1, y1] = xy[i];
    const [x2, y2] = xy[(i + 1) % xy.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

/** Metragem de um cabo que fica dentro do polígono (amostragem a cada ~5 m). */
export function lengthInside(path: LatLng[], poly: LatLng[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const d = distance(a, b);
    const n = Math.max(1, Math.ceil(d / 5));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      if (pointInPolygon([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], poly)) total += d / n;
    }
  }
  return total;
}

/** Distância (m) de um ponto até um segmento, em projeção local. */
export function distanceToSegment(p: LatLng, a: LatLng, b: LatLng): number {
  const kx = Math.cos((p[0] * Math.PI) / 180) * 111320;
  const ky = 110540;
  const [px, py] = [p[1] * kx, p[0] * ky];
  const [ax, ay] = [a[1] * kx, a[0] * ky];
  const [bx, by] = [b[1] * kx, b[0] * ky];
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Cabos que passam a até `tolerance` metros do ponto (ex.: cabos apoiados num poste). */
export function cablesNear(p: LatLng, cables: Cable[], tolerance = 3): Cable[] {
  return cables.filter((c) => c.path.some((_, i) => i > 0 && distanceToSegment(p, c.path[i - 1], c.path[i]) <= tolerance));
}

// ---------------- Portas ----------------

export interface FreePort {
  splitterId: string;
  splitterName: string;
  output: number;
  budget: BudgetResult;
}

/** Saídas de splitter sem conexão numa caixa, com a potência prevista em cada uma. */
export function freePorts(net: Network, box: NetNode): FreePort[] {
  const conns = box.diagram?.connections ?? [];
  const used = new Set(conns.flatMap((c) => [c.a, c.b]).map((e) => `${e.c}:${e.p}`));
  return (box.diagram?.components ?? [])
    .filter((c) => c.kind === 'splitter')
    .flatMap((s) => {
      const model = splitterModel((s as { model: string }).model);
      return Array.from({ length: model.outputs }, (_, i) => i + 1)
        .filter((o) => !used.has(`${s.id}:o${o}`))
        .map((o) => ({
          splitterId: s.id,
          splitterName: (s as { name?: string }).name || model.name,
          output: o,
          budget: traceUpstream(net, box.id, { c: s.id, p: `o${o}` }),
        }));
    });
}

export function portUsage(box: NetNode): { total: number; used: number } {
  const conns = box.diagram?.connections ?? [];
  let total = 0;
  let used = 0;
  (box.diagram?.components ?? []).forEach((c) => {
    if (c.kind !== 'splitter') return;
    const n = splitterModel(c.model).outputs;
    total += n;
    used += conns.filter((k) => [k.a, k.b].some((e) => e.c === c.id && e.p !== 'in')).length;
  });
  return { total, used };
}

// ---------------- Viabilidade ----------------

export interface ViabilityOption {
  box: NetNode;
  distance: number;
  free: FreePort[];
  best: FreePort | null;
  level: PowerLevel;
}

/** CTOs num raio do ponto, ordenadas por distância, com portas livres e sinal previsto. */
export function viability(net: Network, at: LatLng, radius: number): ViabilityOption[] {
  return net.nodes
    .filter((n) => n.type === 'cto')
    .map((box) => ({ box, distance: distance(at, [box.lat, box.lng]) }))
    .filter((o) => o.distance <= radius)
    .sort((a, b) => a.distance - b.distance)
    .map(({ box, distance: d }) => {
      const free = freePorts(net, box);
      const lit = free.filter((f) => f.budget.ok).sort((a, b) => (b.budget.power ?? -99) - (a.budget.power ?? -99));
      const best = lit[0] ?? free[0] ?? null;
      return { box, distance: d, free, best, level: powerLevel(best?.budget.power ?? null, net.settings) };
    });
}

// ---------------- Relatórios ----------------

export interface Report {
  nodes: Record<NodeType, number>;
  byStatus: Record<NodeType, Record<Status, number>>;
  cables: { name: string; category: string; fibers: number; meters: number; slack: number }[];
  cableTotal: number;
  /** Reservas técnicas posicionadas (dentro da área, quando houver). */
  slacks: Record<SlackKind, { count: number; meters: number }>;
  splitters: Record<string, number>;
  fusions: number;
  ports: { total: number; used: number };
  clients: { level: PowerLevel; count: number }[];
  boxes: NetNode[];
  areaM2: number | null;
}

const EMPTY_STATUS = (): Record<Status, number> => ({ planned: 0, not_deployed: 0, deployed: 0, certified: 0 });

/** Quantitativos da rede inteira ou só do que está dentro de um polígono. */
export function buildReport(net: Network, polygon?: LatLng[]): Report {
  const inside = (p: LatLng) => !polygon || pointInPolygon(p, polygon);
  const nodes = net.nodes.filter((n) => inside([n.lat, n.lng]));
  const types: NodeType[] = ['pop', 'ceo', 'cto', 'pole', 'client'];
  const report: Report = {
    nodes: Object.fromEntries(types.map((t) => [t, 0])) as Record<NodeType, number>,
    byStatus: Object.fromEntries(types.map((t) => [t, EMPTY_STATUS()])) as Record<NodeType, Record<Status, number>>,
    cables: [],
    cableTotal: 0,
    slacks: { aerial: { count: 0, meters: 0 }, underground: { count: 0, meters: 0 } },
    splitters: {},
    fusions: 0,
    ports: { total: 0, used: 0 },
    clients: [],
    boxes: nodes.filter((n) => ['pop', 'ceo', 'cto'].includes(n.type)),
    areaM2: polygon ? polygonArea(polygon) : null,
  };
  nodes.forEach((n) => {
    report.nodes[n.type]++;
    report.byStatus[n.type][n.status]++;
    (n.diagram?.components ?? []).forEach((c) => {
      if (c.kind === 'splitter') {
        const name = splitterModel(c.model).name;
        report.splitters[name] = (report.splitters[name] ?? 0) + 1;
      }
    });
    // Fusões: conexões que não são cordão (porta de OLT ou frente do DIO).
    const comps = new Map((n.diagram?.components ?? []).map((c) => [c.id, c]));
    const isPatch = (e: { c: string; p: string }) => {
      const comp = comps.get(e.c);
      return comp?.kind === 'olt' || (comp?.kind === 'dio' && e.p.startsWith('b'));
    };
    report.fusions += (n.diagram?.connections ?? []).filter((k) => !k.pass && !isPatch(k.a) && !isPatch(k.b)).length;
    if (n.type === 'cto') {
      const u = portUsage(n);
      report.ports.total += u.total;
      report.ports.used += u.used;
    }
  });

  // Cabos agrupados por modelo/nome, com metragem dentro da área e reserva proporcional.
  const groups = new Map<string, Report['cables'][number]>();
  net.cables.forEach((c) => {
    // Reservas posicionadas contam onde estão; a metragem antiga (sem local) é proporcional ao trecho.
    const placed = (c.slacks ?? []).filter((r) => inside([r.lat, r.lng]));
    placed.forEach((r) => {
      report.slacks[r.kind].count++;
      report.slacks[r.kind].meters += r.length_m;
    });
    const meters = polygon ? lengthInside(c.path, polygon) : c.length_m;
    if (meters < 0.5 && !placed.length) return;
    const slack = c.slacks?.length ? placed.reduce((a, r) => a + r.length_m, 0) : c.length_m > 0 ? (c.slack_m * meters) / c.length_m : 0;
    const key = `${c.fiber_count}|${c.category}`;
    const g = groups.get(key) ?? { name: `Cabo ${c.fiber_count}FO`, category: c.category, fibers: c.fiber_count, meters: 0, slack: 0 };
    g.meters += meters;
    g.slack += slack;
    groups.set(key, g);
  });
  report.cables = [...groups.values()].sort((a, b) => b.fibers - a.fibers);
  report.cableTotal = report.cables.reduce((a, c) => a + c.meters + c.slack, 0);

  const levels = new Map<PowerLevel, number>();
  nodes
    .filter((n) => n.type === 'client')
    .forEach((n) => {
      const lvl = powerLevel(clientBudget(net, n).power, net.settings);
      levels.set(lvl, (levels.get(lvl) ?? 0) + 1);
    });
  report.clients = [...levels.entries()].map(([level, count]) => ({ level, count }));
  return report;
}

/** Gera um CSV (separador ;, compatível com Excel em pt-BR). */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'number' ? String(v).replace('.', ',') : v;
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n');
}

export function downloadText(filename: string, text: string, type = 'text/csv;charset=utf-8') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Lê CSV com ; ou , como separador. Retorna linhas como objetos pelo cabeçalho (minúsculo). */
export function parseCsv(text: string): Record<string, string>[] {
  const clean = text.replace(/^﻿/, '');
  const firstLine = clean.split(/\r?\n/)[0] ?? '';
  const sep = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cur);
      cur = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++;
      row.push(cur);
      rows.push(row);
      row = [];
      cur = '';
    } else cur += ch;
  }
  if (cur !== '' || row.length) {
    row.push(cur);
    rows.push(row);
  }
  const [header, ...data] = rows.filter((r) => r.some((c) => c.trim() !== ''));
  if (!header) return [];
  const keys = header.map((h) => h.trim().toLowerCase());
  return data.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}

/** Converte "-2,4401" ou "-2.4401" em número. */
export const num = (v: string | undefined) => (v === undefined || v === '' ? NaN : Number(v.replace(',', '.')));

// ---------------- OTDR virtual ----------------

export interface OtdrEvent {
  /** Distância óptica desde a OLT (m). */
  at: number;
  label: string;
  kind: string;
  loss: number;
  /** Potência logo após o evento (dBm). */
  power: number;
  nodeId?: number;
}

export interface OtdrRoute {
  events: OtdrEvent[];
  /** Polilinha do percurso OLT → destino e distância óptica acumulada em cada vértice. */
  path: LatLng[];
  cumulative: number[];
  total: number;
}

/** Monta o percurso físico e a lista de eventos a partir do orçamento óptico. */
export function otdrRoute(net: Network, budget: BudgetResult): OtdrRoute | null {
  if (!budget.ok || budget.power === null) return null;
  const tx = budget.power + budget.totalLoss;
  const path: LatLng[] = [];
  const cumulative: number[] = [];
  const events: OtdrEvent[] = [];
  let at = 0;
  let power = tx;
  for (const s of budget.steps) {
    if (s.kind === 'cable' && s.cableId) {
      const cable = net.cables.find((c) => c.id === s.cableId);
      if (!cable) continue;
      // Orienta o traçado da ponta do lado da OLT para a do cliente.
      const pts = cable.from_node_id === s.nodeId ? cable.path : [...cable.path].reverse();
      // Reserva técnica distribuída ao longo do cabo (fator óptico/geométrico).
      const factor = cable.length_m > 0 ? (s.meters ?? cable.length_m) / cable.length_m : 1;
      pts.forEach((p, i) => {
        if (i > 0) at += distance(pts[i - 1], p) * factor;
        if (i === 0 && path.length) return;
        path.push(p);
        cumulative.push(at);
      });
      power -= s.loss;
      continue;
    }
    power -= s.loss;
    events.push({ at, label: s.label, kind: s.kind, loss: s.loss, power, nodeId: s.nodeId });
  }
  if (!path.length) {
    const n = net.nodes.find((x) => x.id === events[0]?.nodeId);
    if (n) {
      path.push([n.lat, n.lng]);
      cumulative.push(0);
    }
  }
  return { events, path, cumulative, total: at };
}

/** Ponto no mapa a uma distância óptica do início do percurso. */
export function pointAtDistance(route: OtdrRoute, meters: number): LatLng | null {
  const { path, cumulative } = route;
  if (!path.length) return null;
  if (meters <= 0) return path[0];
  for (let i = 1; i < path.length; i++) {
    if (cumulative[i] >= meters) {
      const span = cumulative[i] - cumulative[i - 1];
      const t = span > 0 ? (meters - cumulative[i - 1]) / span : 0;
      return [path[i - 1][0] + (path[i][0] - path[i - 1][0]) * t, path[i - 1][1] + (path[i][1] - path[i - 1][1]) * t];
    }
  }
  return null;
}
