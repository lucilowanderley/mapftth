import { splitterModel } from './catalog';
import { isPatchEnd } from './pop';
import type { Cable, Connection, DiagramComponent, End, NetNode, Network, Settings } from './types';

export interface BudgetStep {
  label: string;
  detail: string;
  loss: number;
  kind: 'source' | 'connector' | 'cable' | 'fusion' | 'splitter';
  /** Nó onde o evento acontece (para cabos, a ponta do lado da OLT). */
  nodeId?: number;
  /** Só em cabos: id do cabo, ponta do lado do cliente e comprimento óptico (m). */
  cableId?: number;
  downNodeId?: number;
  meters?: number;
}

export interface BudgetResult {
  ok: boolean;
  /** Potência final em dBm (quando há OLT na origem). */
  power: number | null;
  totalLoss: number;
  steps: BudgetStep[];
  /** Motivo quando o caminho não chega a uma OLT. */
  error?: string;
  source?: string;
}

export type PowerLevel = 'ok' | 'warn' | 'critical' | 'high' | 'none';

export function powerLevel(power: number | null, s: Settings): PowerLevel {
  if (power === null) return 'none';
  if (power > s.onu_max_dbm) return 'high';
  if (power < s.onu_min_dbm) return 'critical';
  if (power < s.onu_warn_dbm) return 'warn';
  return 'ok';
}

export const POWER_LABEL: Record<PowerLevel, string> = {
  ok: 'OK (ideal)',
  warn: 'Atenção',
  critical: 'Crítico',
  high: 'Sinal alto',
  none: 'Sem sinal',
};

export const POWER_COLORS: Record<PowerLevel, string> = {
  ok: '#22c55e',
  warn: '#eab308',
  critical: '#ef4444',
  high: '#a855f7',
  none: '#64748b',
};

const round = (n: number) => Math.round(n * 100) / 100;

export const cableKey = (id: number) => `c${id}`;

/** Índice de componentes e conexões de cada nó, para consultas rápidas. */
class Index {
  nodes = new Map<number, NetNode>();
  cables = new Map<number, Cable>();

  constructor(net: Network) {
    net.nodes.forEach((n) => this.nodes.set(n.id, n));
    net.cables.forEach((c) => this.cables.set(c.id, c));
  }

  component(node: NetNode, id: string): DiagramComponent | undefined {
    return node.diagram?.components.find((c) => c.id === id);
  }

  partner(node: NetNode, end: End): { conn: Connection; other: End } | undefined {
    for (const conn of node.diagram?.connections ?? []) {
      if (conn.a.c === end.c && conn.a.p === end.p) return { conn, other: conn.b };
      if (conn.b.c === end.c && conn.b.p === end.p) return { conn, other: conn.a };
    }
    return undefined;
  }
}

/** Uma ponta é "de conector" quando é cordão/patch (porta de OLT ou frente do DIO). */
function isPatch(node: NetNode, idx: Index, end: End): boolean {
  if (end.c.startsWith('c')) return false;
  return isPatchEnd(idx.component(node, end.c), end.p);
}

/**
 * Calcula o orçamento óptico subindo do ponto informado até a OLT.
 * `start` é uma porta dentro de `nodeId` que será atravessada no sentido da OLT.
 */
export function traceUpstream(net: Network, nodeId: number, start: End): BudgetResult {
  const s = net.settings;
  const idx = new Index(net);
  const steps: BudgetStep[] = [];
  const seen = new Set<string>();
  let node = idx.nodes.get(nodeId);
  let end: End = start;

  // Os passos são coletados do cliente para a OLT; exibimos da OLT para o cliente.
  const ordered = () => {
    let n = 0;
    return [...steps].reverse().map((st) => (st.kind === 'fusion' ? { ...st, label: `F-${++n}` } : st));
  };

  const fail = (error: string): BudgetResult => ({
    ok: false,
    power: null,
    totalLoss: round(steps.reduce((a, b) => a + b.loss, 0)),
    steps: ordered(),
    error,
  });

  for (let guard = 0; guard < 500 && node; guard++) {
    const key = `${node.id}:${end.c}:${end.p}`;
    if (seen.has(key)) return fail('Laço detectado no caminho óptico.');
    seen.add(key);

    // 1) Atravessa o componente atual no sentido da OLT.
    let nextNode: NetNode | undefined = node;
    let nextEnd: End;
    if (end.c.startsWith('c')) {
      const cable = idx.cables.get(Number(end.c.slice(1)));
      if (!cable) return fail('Cabo não encontrado.');
      const otherId = cable.from_node_id === node.id ? cable.to_node_id : cable.from_node_id;
      if (!otherId || !idx.nodes.has(otherId)) return fail(`${cable.name} não está ligado a outra caixa.`);
      const km = (cable.length_m + (cable.slack_m ?? 0)) / 1000;
      steps.push({
        kind: 'cable',
        label: cable.name,
        detail: `Fibra ${end.p.slice(1)} · ${Math.round(cable.length_m + (cable.slack_m ?? 0))} m`,
        loss: round(km * s.fiber_loss_db_km),
        cableId: cable.id,
        nodeId: otherId,
        downNodeId: node.id,
        meters: km * 1000,
      });
      nextNode = idx.nodes.get(otherId)!;
      nextEnd = end;
    } else {
      const comp = idx.component(node, end.c);
      if (!comp) return fail('Componente não encontrado no diagrama.');
      if (comp.kind === 'active') return fail(`O caminho chega em ${comp.name} (equipamento ativo), não numa porta PON.`);
      if (comp.kind === 'olt' && end.p.startsWith('u')) return fail(`O caminho chega no uplink de ${comp.name}, não numa porta PON.`);
      if (comp.kind === 'olt') {
        const n = Number(end.p.slice(1));
        const slot = Math.floor((n - 1) / comp.ports) + 1;
        const pon = ((n - 1) % comp.ports) + 1;
        steps.push({ kind: 'source', label: comp.name, detail: `${node.name} · Slot ${slot} / PON ${pon}`, loss: 0, nodeId: node.id });
        const totalLoss = round(steps.reduce((a, b) => a + b.loss, 0));
        const tx = comp.tx_dbm ?? s.olt_tx_dbm;
        return {
          ok: true,
          power: round(tx - totalLoss),
          totalLoss,
          steps: ordered(),
          source: `${comp.name} · Slot ${slot} / PON ${pon}`,
        };
      }
      if (comp.kind === 'splitter') {
        if (end.p === 'in') return fail('A fibra chega na entrada do splitter pelo lado do cliente.');
        const model = splitterModel(comp.model);
        const out = Number(end.p.slice(1));
        const loss = (model.losses[out - 1] ?? model.losses[0]) + (model.connectorized ? s.connector_loss_db : 0);
        steps.push({ kind: 'splitter', label: comp.name || model.name, detail: `Splitter ${model.name} · saída ${out}`, loss: round(loss), nodeId: node.id });
        nextEnd = { c: comp.id, p: 'in' };
      } else {
        // DIO: atravessa do lado de fusão (a) para o de conector (b) e vice-versa.
        const n = end.p.slice(1);
        steps.push({ kind: 'connector', label: comp.name, detail: `${node.name} · porta ${n}`, loss: round(s.connector_loss_db), nodeId: node.id });
        nextEnd = { c: comp.id, p: (end.p.startsWith('a') ? 'b' : 'a') + n };
      }
    }

    // 2) Segue pela fusão/cordão ligado à porta de saída.
    const link = idx.partner(nextNode, nextEnd);
    if (!link) {
      return fail(`Porta sem conexão em ${nextNode.name}.`);
    }
    if (!link.conn.pass && !isPatch(nextNode, idx, nextEnd) && !isPatch(nextNode, idx, link.other)) {
      if (link.conn.joint === 'connector') {
        steps.push({ kind: 'connector', label: 'Conector', detail: `Conector/acoplador em ${nextNode.name}`, loss: round(s.connector_loss_db), nodeId: nextNode.id });
      } else {
        steps.push({ kind: 'fusion', label: 'F', detail: `Fusão em ${nextNode.name}`, loss: round(s.fusion_loss_db), nodeId: nextNode.id });
      }
    }
    node = nextNode;
    end = link.other;
  }
  return fail('Caminho óptico muito longo.');
}

/** Orçamento até o cliente: sobe pelo cabo drop que chega no cliente. */
export function clientBudget(net: Network, client: NetNode): BudgetResult {
  const drop = net.cables.find((c) => c.from_node_id === client.id || c.to_node_id === client.id);
  if (!drop) return { ok: false, power: null, totalLoss: 0, steps: [], error: 'Cliente sem cabo drop.' };
  const fiber = (client.attributes?.fiber as number | undefined) ?? 1;
  return traceUpstream(net, client.id, { c: cableKey(drop.id), p: `f${fiber}` });
}
