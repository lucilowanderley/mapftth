import { cableKey, cableLossDbKm } from './budget';
import { splitterModel } from './catalog';
import { distance } from './geo';
import { jointLoss, jointSpec } from './joints';
import { isCableKey, isPatchEnd } from './pop';
import type { Cable, Connection, End, LatLng, NetNode, Network } from './types';

/**
 * OTDR da rede: dispara a partir de uma fibra de um cabo, numa das pontas (objeto A → B ou B → A),
 * e segue a fibra pelas fusões, conectores, DIOs e splitters até onde ela termina.
 * Serve para ver a curva esperada, o relatório de eventos e localizar no mapa a distância de um rompimento.
 */

export type OtdrKind = 'launch' | 'fusion' | 'connector' | 'splitter' | 'end';

export interface OtdrEvent {
  /** Distância óptica desde o ponto de disparo (m). */
  at: number;
  label: string;
  detail: string;
  kind: OtdrKind;
  /** Perda do evento (dB). */
  loss: number;
  /** Perda acumulada logo após o evento (dB). */
  total: number;
  /** Evento reflexivo (conector, ponta de fibra): aparece como um pico na curva. */
  reflective: boolean;
  nodeId?: number;
}

/** Trecho de cabo percorrido, com a distância óptica em que começa e termina. */
export interface OtdrSpan {
  cableId: number;
  name: string;
  fiber: number;
  fromNode: string;
  toNode: string;
  start: number;
  end: number;
  dbKm: number;
  loss: number;
  /** Reserva técnica incluída na metragem do trecho (m). */
  slack: number;
}

/** Splitter atravessado da entrada para as saídas: o OTDR segue uma das derivações ligadas. */
export interface OtdrBranch {
  key: string;
  label: string;
  outputs: number[];
  chosen: number;
}

export type OtdrEndKind = 'open' | 'loose' | 'onu' | 'olt' | 'active' | 'splitter' | 'loop';

export interface OtdrTrace {
  events: OtdrEvent[];
  spans: OtdrSpan[];
  branches: OtdrBranch[];
  /** Traçado no mapa e distância óptica acumulada em cada vértice. */
  path: LatLng[];
  cumulative: number[];
  total: number;
  totalLoss: number;
  /** clientKey: cliente onde a fibra chega ("n12" = cliente do mapa, "d5:kc1" = cliente do diagrama da caixa 5). */
  end: { kind: OtdrEndKind; reason: string; clientKey?: string };
  start: { node: NetNode; cable: Cable; fiber: number; toward: NetNode | null };
}

export const OTDR_END_LABEL: Record<OtdrEndKind, string> = {
  open: 'Fim da fibra (sem emenda)',
  loose: 'Ponta solta do cabo',
  onu: 'Chega no cliente (ONU)',
  olt: 'Chega na OLT',
  active: 'Chega num equipamento ativo',
  splitter: 'Splitter sem saídas ligadas',
  loop: 'Laço no caminho',
};

const round = (n: number) => Math.round(n * 1000) / 1000;

function partner(node: NetNode, end: End): { conn: Connection; other: End } | undefined {
  for (const conn of node.diagram?.connections ?? []) {
    if (conn.a.c === end.c && conn.a.p === end.p) return { conn, other: conn.b };
    if (conn.b.c === end.c && conn.b.p === end.p) return { conn, other: conn.a };
  }
  return undefined;
}

/** Cabos que saem de um objeto do mapa (ou das CTOs/CEOs fixadas nele). */
export function cablesAt(net: Network, ids: number[]): Cable[] {
  const at = new Set(ids);
  return net.cables.filter((c) => (c.from_node_id != null && at.has(c.from_node_id)) || (c.to_node_id != null && at.has(c.to_node_id)));
}

/**
 * Dispara o OTDR na fibra `fiber` do cabo `cableId`, na ponta que está em `nodeId`, no sentido da outra ponta.
 * `choices` escolhe a saída seguida em cada splitter (chave `nó:componente`); sem escolha, segue a primeira ligada.
 */
export function otdrTrace(
  net: Network,
  opts: { nodeId: number; cableId: number; fiber: number; choices?: Record<string, number> },
): OtdrTrace | { error: string } {
  const s = net.settings;
  const nodes = new Map(net.nodes.map((n) => [n.id, n]));
  const cables = new Map(net.cables.map((c) => [c.id, c]));
  const first = cables.get(opts.cableId);
  const origin = nodes.get(opts.nodeId);
  if (!first || !origin) return { error: 'Cabo ou objeto não encontrado.' };
  if (first.from_node_id !== origin.id && first.to_node_id !== origin.id) return { error: `${first.name} não chega em ${origin.name}.` };
  if (opts.fiber < 1 || opts.fiber > first.fiber_count) return { error: `${first.name} tem ${first.fiber_count} fibras.` };
  const towardId = first.from_node_id === origin.id ? first.to_node_id : first.from_node_id;

  const events: OtdrEvent[] = [];
  const spans: OtdrSpan[] = [];
  const branches: OtdrBranch[] = [];
  const path: LatLng[] = [];
  const cumulative: number[] = [];
  const seen = new Set<string>();
  let at = 0;
  let total = 0;
  const push = (e: Omit<OtdrEvent, 'at' | 'total'>) => {
    total += e.loss;
    events.push({ ...e, at: round(at), total: round(total) });
  };

  push({ kind: 'launch', label: origin.name, detail: `${origin.name} · fibra ${opts.fiber} do ${first.name}`, loss: 0, reflective: true, nodeId: origin.id });

  let node: NetNode = origin;
  let end: End = { c: cableKey(first.id), p: `f${opts.fiber}` };
  let finish: OtdrTrace['end'] | null = null;
  const stop = (kind: OtdrEndKind, reason: string, reflective = true, clientKey?: string) => {
    finish = { kind, reason, clientKey };
    push({ kind: 'end', label: OTDR_END_LABEL[kind], detail: reason, loss: 0, reflective, nodeId: node.id });
  };

  for (let guard = 0; guard < 500 && !finish; guard++) {
    const key = `${node.id}:${end.c}:${end.p}`;
    if (seen.has(key)) {
      stop('loop', `A fibra volta para ${node.name}.`, false);
      break;
    }
    seen.add(key);

    // 1) Atravessa o elemento atual: o cabo até a outra ponta ou o componente da caixa.
    if (isCableKey(end.c)) {
      const cable = cables.get(Number(end.c.slice(1)));
      if (!cable) {
        stop('loose', 'Cabo não encontrado.');
        break;
      }
      const forward = cable.from_node_id === node.id;
      const otherId = forward ? cable.to_node_id : cable.from_node_id;
      const pts = forward ? cable.path : [...cable.path].reverse();
      const meters = cable.length_m + (cable.slack_m ?? 0);
      let geo = 0;
      for (let i = 1; i < pts.length; i++) geo += distance(pts[i - 1], pts[i]);
      // A reserva técnica é distribuída ao longo do traçado: a distância óptica cresce proporcionalmente.
      const scale = geo > 0 ? meters / geo : 0;
      const start = at;
      let walked = 0;
      pts.forEach((p, i) => {
        if (i > 0) walked += distance(pts[i - 1], p) * scale;
        if (i === 0 && path.length) return;
        path.push(p);
        cumulative.push(start + walked);
      });
      const rate = cableLossDbKm(cable, s);
      const loss = (meters / 1000) * rate;
      at = start + meters;
      total += loss;
      const other = otherId != null ? nodes.get(otherId) : undefined;
      spans.push({
        cableId: cable.id,
        name: cable.name,
        fiber: Number(end.p.slice(1)),
        fromNode: node.name,
        toNode: other?.name ?? 'ponta solta',
        start: round(start),
        end: round(at),
        dbKm: rate,
        loss: round(loss),
        slack: cable.slack_m ?? 0,
      });
      if (!other) {
        stop('loose', `${cable.name} termina sem chegar a uma caixa.`);
        break;
      }
      node = other;
      if (node.type === 'client') {
        stop('onu', `${node.name} (fibra ${end.p.slice(1)} do ${cable.name})`, true, `n${node.id}`);
        break;
      }
    } else {
      const comp = node.diagram?.components.find((c) => c.id === end.c);
      if (!comp) {
        stop('open', `Porta sem componente em ${node.name}.`);
        break;
      }
      if (comp.kind === 'olt') {
        stop('olt', `${comp.name} em ${node.name}`);
        break;
      }
      if (comp.kind === 'active') {
        stop('active', `${comp.name} em ${node.name}`);
        break;
      }
      if (comp.kind === 'client') {
        stop('onu', `${comp.name} em ${node.name}`, true, comp.node_id ? `n${comp.node_id}` : `d${node.id}:${comp.id}`);
        break;
      }
      if (comp.kind === 'splitter') {
        const model = splitterModel(comp.model);
        const name = comp.name || model.name;
        let out: number;
        if (end.p === 'in') {
          const linked = Array.from({ length: model.outputs }, (_, i) => i + 1).filter((o) => partner(node, { c: comp.id, p: `o${o}` }));
          if (!linked.length) {
            stop('splitter', `${name} em ${node.name}: nenhuma saída ligada.`, false);
            break;
          }
          const bkey = `${node.id}:${comp.id}`;
          const want = opts.choices?.[bkey];
          out = want && linked.includes(want) ? want : linked[0];
          branches.push({ key: bkey, label: `${name} · ${node.name}`, outputs: linked, chosen: out });
          end = { c: comp.id, p: `o${out}` };
        } else {
          out = Number(end.p.slice(1));
          end = { c: comp.id, p: 'in' };
        }
        const loss = (model.losses[out - 1] ?? model.losses[0]) + (model.connectorized ? s.connector_loss_db : 0);
        push({ kind: 'splitter', label: name, detail: `Splitter ${model.name} · saída ${out} · ${node.name}`, loss, reflective: !!model.connectorized, nodeId: node.id });
      } else if (comp.kind === 'dio') {
        const n = end.p.slice(1);
        push({ kind: 'connector', label: comp.name, detail: `DIO · porta ${n} · ${node.name}`, loss: s.connector_loss_db, reflective: true, nodeId: node.id });
        end = { c: comp.id, p: (end.p.startsWith('a') ? 'b' : 'a') + n };
      } else {
        stop('open', `A fibra chega em ${'name' in comp && comp.name ? comp.name : comp.kind} em ${node.name}.`);
        break;
      }
    }

    // 2) Segue pela emenda ligada à porta de saída.
    const link = partner(node, end);
    if (!link) {
      const what = isCableKey(end.c) ? `Fibra ${end.p.slice(1)} do ${cables.get(Number(end.c.slice(1)))?.name ?? 'cabo'}` : 'A porta';
      stop('open', `${what} sem emenda em ${node.name}.`);
      break;
    }
    const comps = node.diagram?.components ?? [];
    const patch = (e: End) => !isCableKey(e.c) && isPatchEnd(comps.find((c) => c.id === e.c), e.p);
    if (!link.conn.pass && !patch(end) && !patch(link.other)) {
      const spec = jointSpec(link.conn);
      const connector = link.conn.joint === 'connector';
      push({
        kind: connector ? 'connector' : 'fusion',
        label: connector ? 'Conector' : 'Fusão',
        detail: `${spec ? spec.label : connector ? 'Conector/acoplador' : 'Fusão'} · ${node.name}`,
        loss: jointLoss(link.conn, s),
        reflective: connector,
        nodeId: node.id,
      });
    }
    end = link.other;
  }
  if (!finish) stop('loop', 'Caminho óptico muito longo.', false);

  if (!path.length) {
    path.push([origin.lat, origin.lng]);
    cumulative.push(0);
  }
  return {
    events,
    spans,
    branches,
    path,
    cumulative,
    total: round(at),
    totalLoss: round(total),
    end: finish!,
    start: { node: origin, cable: first, fiber: opts.fiber, toward: towardId != null ? nodes.get(towardId) ?? null : null },
  };
}

/** Ponto do traçado a uma distância óptica do disparo, e o traçado até ali (o "laser"). */
export function laserTo(trace: Pick<OtdrTrace, 'path' | 'cumulative'>, meters: number): { point: LatLng; path: LatLng[] } | null {
  const { path, cumulative } = trace;
  if (!path.length || !Number.isFinite(meters) || meters < 0) return null;
  if (meters === 0) return { point: path[0], path: [path[0]] };
  for (let i = 1; i < path.length; i++) {
    if (cumulative[i] >= meters) {
      const span = cumulative[i] - cumulative[i - 1];
      const t = span > 0 ? (meters - cumulative[i - 1]) / span : 0;
      const point: LatLng = [path[i - 1][0] + (path[i][0] - path[i - 1][0]) * t, path[i - 1][1] + (path[i][1] - path[i - 1][1]) * t];
      return { point, path: [...path.slice(0, i), point] };
    }
  }
  return null;
}

/** Onde fica uma distância medida: o trecho de cabo e quanto falta para cada ponta, e os eventos vizinhos. */
export function locateDistance(trace: OtdrTrace, meters: number) {
  const span = trace.spans.find((sp) => meters >= sp.start && meters <= sp.end) ?? null;
  const before = [...trace.events].reverse().find((e) => e.at <= meters) ?? null;
  const after = trace.events.find((e) => e.at > meters) ?? null;
  return {
    span,
    before,
    after,
    fromStart: span ? meters - span.start : null,
    toEnd: span ? span.end - meters : null,
  };
}

export interface OtdrCurvePoint {
  at: number;
  db: number;
}

/**
 * Curva simulada (retroespalhamento): começa em 0 dB, cai com a atenuação nos cabos, degraus nas emendas e
 * splitters, picos nos eventos reflexivos e, depois do fim da fibra, só ruído.
 */
export function otdrCurve(trace: OtdrTrace): OtdrCurvePoint[] {
  const pts: OtdrCurvePoint[] = [];
  const w = Math.max(2, trace.total * 0.004);
  let x = 0;
  let db = 0;
  const add = (at: number, v: number) => {
    x = Math.max(x, at);
    pts.push({ at: x, db: v });
  };
  const timeline = [
    ...trace.events.map((e) => ({ at: e.at, e, sp: null as OtdrSpan | null })),
    ...trace.spans.map((sp) => ({ at: sp.end, e: null as OtdrEvent | null, sp })),
  ].sort((a, b) => a.at - b.at || (a.sp ? -1 : 1));
  for (const { e, sp } of timeline) {
    if (sp) {
      db -= sp.loss;
      add(sp.end, db);
      continue;
    }
    if (!e) continue;
    add(e.at, db);
    if (e.reflective) add(e.at, db + (e.kind === 'launch' ? 6 : e.kind === 'end' ? 5 : 3));
    if (e.kind === 'end') {
      add(e.at + w, db - 12);
      const tail = Math.max(50, trace.total * 0.08);
      for (let i = 1; i <= 12; i++) add(e.at + w + (tail * i) / 12, db - 12 + Math.sin(i * 2.7) * 0.8);
      continue;
    }
    db -= e.loss;
    add(e.at + (e.reflective ? w : 0), db);
  }
  return pts;
}

export const OTDR_KIND_LABEL: Record<OtdrKind, string> = {
  launch: 'Disparo',
  fusion: 'Fusão',
  connector: 'Conector',
  splitter: 'Splitter',
  end: 'Fim',
};

export const OTDR_KIND_COLOR: Record<OtdrKind, string> = {
  launch: '#10b981',
  fusion: '#eab308',
  connector: '#0ea5e9',
  splitter: '#a855f7',
  end: '#ef4444',
};
