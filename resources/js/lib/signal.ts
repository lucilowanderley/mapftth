/**
 * Sinal medido na ONU/ONT (digitado ou, no futuro, coletado do FiberControl pelo serial) comparado com o sinal estimado pelo
 * orçamento óptico: saúde atual do cliente e o trecho provável do problema no percurso OLT → cliente.
 *
 * Localização: os percursos formam uma árvore a partir da OLT. Se outros clientes com sinal bom passam pelos
 * mesmos pontos, esses pontos estão funcionando; o problema fica depois do último ponto compartilhado com um
 * cliente saudável. Clientes vizinhos também abaixo do esperado depois desse ponto reforçam a suspeita.
 */
import { clientBudget, powerLevel, traceUpstream, type BudgetResult, type BudgetStep, type PowerLevel } from './budget';
import type { Network } from './types';

/** Diferença medido − estimado (dB) a partir da qual o cliente está abaixo do esperado. */
export const DELTA_WARN = -2;
export const DELTA_BAD = -4;
/** Medido bem acima do estimado: o projeto (comprimentos, splitters) provavelmente não bate com o campo. */
export const DELTA_HIGH = 3;

export type SignalHealth = 'ok' | 'warn' | 'bad' | 'none';

export const HEALTH_LABEL: Record<SignalHealth, string> = {
  ok: 'Saudável',
  warn: 'Atenção',
  bad: 'Problema',
  none: 'Sem medição',
};

export const HEALTH_COLORS: Record<SignalHealth, string> = {
  ok: '#22c55e',
  warn: '#eab308',
  bad: '#ef4444',
  none: '#64748b',
};

export interface MeasuredClient {
  /** "n12" = cliente 12 do mapa; "d5:kc1" = cliente kc1 desenhado no diagrama da caixa 5 (sem vínculo). */
  key: string;
  name: string;
  measured: number;
  measuredAt?: string | null;
  budget: BudgetResult;
}

export interface SignalAnalysis {
  health: SignalHealth;
  estimated: number | null;
  measured: number | null;
  measuredAt?: string | null;
  /** medido − estimado (dB). Negativo = perda acima do previsto. */
  delta: number | null;
  level: PowerLevel;
  /** Frase curta para o cartão/painel. */
  summary: string;
  /** Trecho provável do problema (quando o sinal está abaixo do esperado). */
  fault?: {
    /** Último ponto compartilhado com um cliente de sinal bom (ou null: desde a OLT). */
    after: BudgetStep | null;
    /** Elementos do trecho suspeito, da OLT para o cliente. */
    suspects: BudgetStep[];
    /** Outros clientes depois desse ponto também abaixo do esperado. */
    degradedPeers: string[];
    healthyPeers: number;
    text: string;
  };
}

/** Identidade de um passo do percurso (o mesmo cabo/fibra, splitter ou emenda no mesmo lugar). */
export function stepKey(s: BudgetStep): string {
  if (s.ref) return `${s.kind}|${s.ref}`;
  return [s.kind, s.nodeId ?? '', s.cableId ?? '', s.kind === 'fusion' ? '' : s.label, s.detail].join('|');
}

export const describeStep = (s: BudgetStep) => (s.kind === 'cable' ? `${s.label} (${s.detail})` : `${s.label} · ${s.detail}`);

/** Clientes com sinal medido: os do mapa e os desenhados só no diagrama de alguma caixa. */
export function measuredClients(net: Network): MeasuredClient[] {
  const out: MeasuredClient[] = [];
  for (const n of net.nodes) {
    if (n.type === 'client') {
      const rx = n.attributes?.rx_dbm;
      if (typeof rx === 'number') {
        out.push({ key: `n${n.id}`, name: n.name, measured: rx, measuredAt: n.attributes?.rx_at as string | undefined, budget: clientBudget(net, n) });
      }
    }
    for (const c of n.diagram?.components ?? []) {
      if (c.kind !== 'client' || c.node_id || typeof c.rx_dbm !== 'number') continue;
      out.push({ key: `d${n.id}:${c.id}`, name: `${c.name} (${n.name})`, measured: c.rx_dbm, measuredAt: c.rx_at, budget: traceUpstream(net, n.id, { c: c.id, p: 'in' }) });
    }
  }
  return out;
}

const deltaOf = (m: MeasuredClient) => (m.budget.ok && m.budget.power !== null ? m.measured - m.budget.power : null);
const fmt = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(1)} dB`;

export function analyzeSignal(
  net: Network,
  target: { key: string; measured: number | null | undefined; measuredAt?: string | null; budget: BudgetResult },
  peers: MeasuredClient[] = measuredClients(net),
): SignalAnalysis {
  const s = net.settings;
  const estimated = target.budget.ok ? target.budget.power : null;
  const measured = typeof target.measured === 'number' ? target.measured : null;
  const base = { estimated, measured, measuredAt: target.measuredAt ?? null };
  if (measured === null) {
    return { ...base, health: 'none', delta: null, level: 'none', summary: estimated !== null ? `Estimado ${estimated.toFixed(2)} dBm · sem sinal medido` : 'Sem sinal medido' };
  }
  const level = powerLevel(measured, s);
  if (estimated === null) {
    const health: SignalHealth = level === 'critical' ? 'bad' : level === 'ok' ? 'ok' : 'warn';
    return { ...base, health, delta: null, level, summary: `Medido ${measured.toFixed(2)} dBm · sem estimativa (${target.budget.error ?? 'percurso incompleto'})` };
  }
  const delta = Math.round((measured - estimated) * 100) / 100;
  let health: SignalHealth = 'ok';
  if (level === 'critical' || delta < DELTA_BAD) health = 'bad';
  else if (level === 'warn' || level === 'high' || delta < DELTA_WARN || delta > DELTA_HIGH) health = 'warn';

  let summary: string;
  if (delta < DELTA_WARN) summary = `${(-delta).toFixed(1)} dB de perda acima do estimado`;
  else if (delta > DELTA_HIGH) summary = `Sinal ${fmt(delta)} acima do estimado: confira o projeto (comprimentos, splitters)`;
  else summary = `Dentro do estimado (${fmt(delta)})`;
  if (level === 'critical') summary = `Abaixo da sensibilidade da ONU · ${summary}`;
  else if (level === 'high') summary = `Sinal alto demais para a ONU (use atenuador) · ${summary}`;

  const result: SignalAnalysis = { ...base, health, delta, level, summary };
  if (delta >= DELTA_WARN) return result;

  // Localização do trecho com problema.
  const steps = target.budget.steps;
  const others = peers.filter((p) => p.key !== target.key && p.budget.ok);
  const keysOf = new Map(others.map((p) => [p.key, new Set(p.budget.steps.map(stepKey))]));
  const healthy = others.filter((p) => (deltaOf(p) ?? -99) >= DELTA_WARN);
  let k = -1;
  steps.forEach((st, i) => {
    const key = stepKey(st);
    if (healthy.some((p) => keysOf.get(p.key)!.has(key))) k = i;
  });
  const suspects = steps.slice(k + 1).filter((st) => st.kind !== 'source');
  const after = k >= 0 ? steps[k] : null;
  const firstSuspect = suspects[0];
  const degradedPeers = firstSuspect
    ? others.filter((p) => (deltaOf(p) ?? 0) < DELTA_WARN && keysOf.get(p.key)!.has(stepKey(firstSuspect))).map((p) => p.name)
    : [];
  let text: string;
  if (!healthy.length) {
    text = 'Sem outros clientes com sinal bom para comparar: o problema pode estar em qualquer ponto do percurso.';
  } else if (after) {
    text = `Clientes com sinal bom passam até ${describeStep(after)}. O problema provavelmente está depois desse ponto`;
    text += degradedPeers.length ? ` (outros ${degradedPeers.length} cliente(s) depois dele também estão abaixo do esperado, o que indica um ponto comum).` : ', no trecho que só este cliente usa.';
  } else {
    text = 'Nenhum cliente com sinal bom compartilha este percurso: o problema pode estar logo na saída da OLT.';
  }
  result.fault = { after, suspects, degradedPeers, healthyPeers: healthy.length, text };
  return result;
}
