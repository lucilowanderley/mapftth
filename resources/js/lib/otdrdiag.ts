/**
 * Diagnóstico do OTDR: junta o disparo (eventos e distâncias) com a potência na ONU (estimada × medida) e aponta as
 * causas mais prováveis do problema, com o trecho e a distância de cada uma no traço do OTDR.
 */
import { clientBudget, traceUpstream, type BudgetResult, type BudgetStep } from './budget';
import { SPLITTER_MODELS } from './catalog';
import { locateDistance, type OtdrTrace } from './otdr';
import { DELTA_HIGH, DELTA_WARN, analyzeSignal, describeStep, measuredClients, type SignalAnalysis } from './signal';
import type { Network } from './types';

export type CauseLevel = 'alta' | 'media' | 'baixa';

export interface OtdrCause {
  level: CauseLevel;
  title: string;
  detail: string;
  /** Onde verificar (texto curto). */
  where?: string;
  /** Trecho no traço do OTDR (m desde o disparo). */
  from?: number;
  to?: number;
}

export interface OtdrDiagnosis {
  client: { key: string; name: string } | null;
  signal: SignalAnalysis | null;
  /** Trecho suspeito no traço do OTDR (onde estão os pontos a verificar). */
  zone: { from: number; to: number } | null;
  /** Pontos a verificar, com a distância de cada um no traço. */
  checks: { step: BudgetStep; at: number | null; to: number | null }[];
  causes: OtdrCause[];
}

export const CAUSE_LABEL: Record<CauseLevel, string> = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };
export const CAUSE_COLOR: Record<CauseLevel, string> = { alta: '#ef4444', media: '#f59e0b', baixa: '#64748b' };

const m = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(3)} km` : `${Math.round(v)} m`);

/** Cliente do disparo: a ponta de partida (cliente do mapa) ou o cliente onde a fibra chega. */
function subject(net: Network, trace: OtdrTrace): { key: string; name: string; measured: number | null; measuredAt?: string | null; budget: BudgetResult } | null {
  const start = trace.start.node;
  const key = start.type === 'client' ? `n${start.id}` : trace.end.clientKey;
  if (!key) return null;
  if (key.startsWith('n')) {
    const n = net.nodes.find((x) => x.id === Number(key.slice(1)));
    if (!n) return null;
    const rx = n.attributes?.rx_dbm;
    return { key, name: n.name, measured: typeof rx === 'number' ? rx : null, measuredAt: n.attributes?.rx_at as string | undefined, budget: clientBudget(net, n) };
  }
  const [nodeId, compId] = key.slice(1).split(':');
  const box = net.nodes.find((x) => x.id === Number(nodeId));
  const comp = box?.diagram?.components.find((c) => c.id === compId);
  if (!box || !comp || comp.kind !== 'client') return null;
  return {
    key,
    name: `${comp.name} (${box.name})`,
    measured: typeof comp.rx_dbm === 'number' ? comp.rx_dbm : null,
    measuredAt: comp.rx_at,
    budget: traceUpstream(net, box.id, { c: comp.id, p: 'in' }),
  };
}

/** Distância (início e fim) de um passo do orçamento no traço do OTDR. */
function stepRange(trace: OtdrTrace, st: BudgetStep): { at: number; to: number } | null {
  if (st.kind === 'cable') {
    const sp = trace.spans.find((x) => x.cableId === st.cableId);
    return sp ? { at: sp.start, to: sp.end } : null;
  }
  const kind = st.kind === 'source' ? 'end' : st.kind;
  const e = trace.events.find((x) => x.nodeId === st.nodeId && (x.kind === kind || (st.kind === 'source' && x.kind === 'launch')));
  return e ? { at: e.at, to: e.at } : null;
}

function splitterCauses(steps: BudgetStep[], excess: number): OtdrCause[] {
  const out: OtdrCause[] = [];
  for (const st of steps.filter((x) => x.kind === 'splitter')) {
    const model = SPLITTER_MODELS.find((x) => st.detail.startsWith(`Splitter ${x.name} `));
    if (!model) continue;
    if (model.balanced) {
      const cur = model.losses[0];
      const wrong = SPLITTER_MODELS.filter((x) => x.balanced && x.connectorized === model.connectorized && x.losses[0] > cur).find(
        (x) => Math.abs(x.losses[0] - cur - excess) <= 1,
      );
      if (wrong)
        out.push({
          level: 'alta',
          title: `Splitter ${wrong.name.split(' ')[0]} no lugar do ${model.name.split(' ')[0]}`,
          detail: `A perda a mais (${excess.toFixed(1)} dB) bate com a diferença entre os dois splitters (${(wrong.losses[0] - cur).toFixed(1)} dB). Confira o splitter instalado em campo.`,
          where: describeStep(st),
        });
    } else {
      const diff = Math.abs(model.losses[0] - model.losses[1]);
      if (Math.abs(diff - excess) <= 1.2)
        out.push({
          level: 'alta',
          title: `Ramos do splitter ${model.name} trocados`,
          detail: `A perda a mais (${excess.toFixed(1)} dB) bate com a diferença entre o ramo menor e o maior (${diff.toFixed(1)} dB): a fibra pode estar na saída errada.`,
          where: describeStep(st),
        });
    }
  }
  return out;
}

/**
 * Diagnóstico do disparo. `fieldDistance` é a distância de um evento lida no OTDR de campo (opcional).
 */
export function otdrDiagnosis(net: Network, trace: OtdrTrace, fieldDistance: number | null = null): OtdrDiagnosis {
  const s = net.settings;
  const subj = subject(net, trace);
  const signal = subj ? analyzeSignal(net, subj, measuredClients(net)) : null;
  const causes: OtdrCause[] = [];

  // Pontos a verificar: o trecho suspeito da análise de sinal ou, sem ela, todo o percurso do orçamento.
  const steps = signal?.fault?.suspects ?? subj?.budget.steps.filter((x) => x.kind !== 'source') ?? [];
  const checks = steps.map((step) => {
    const r = stepRange(trace, step);
    return { step, at: r?.at ?? null, to: r?.to ?? null };
  });
  const placed = checks.filter((c) => c.at !== null);
  // Sem cliente de sinal bom para comparar, o trecho seria o percurso inteiro: não destaca nada.
  const zone = signal?.fault && signal.fault.healthyPeers > 0 && placed.length ? { from: Math.min(...placed.map((c) => c.at!)), to: Math.max(...placed.map((c) => c.to!)) } : null;
  const zoneText = zone ? `entre ${m(zone.from)} e ${m(zone.to)} do disparo` : undefined;

  if (fieldDistance !== null && fieldDistance >= 0) {
    if (fieldDistance <= trace.total) {
      const w = locateDistance(trace, fieldDistance);
      const inZone = zone && fieldDistance >= zone.from - 5 && fieldDistance <= zone.to + 5;
      causes.push({
        level: 'alta',
        title: `Evento medido no OTDR de campo a ${m(fieldDistance)}`,
        detail: w.span
          ? `Fica no cabo ${w.span.name} (fibra ${w.span.fiber}), a ${m(w.fromStart!)} de ${w.span.fromNode} e ${m(w.toEnd!)} de ${w.span.toNode}.${inZone ? ' Está dentro do trecho suspeito pela potência.' : ''} Se o traço termina aí, é rompimento; se só cai alguns dB, é curvatura, esmagamento ou emenda ruim.`
          : `Fica dentro de ${w.before?.detail ?? 'uma caixa'}: verifique as emendas e o acomodamento da fibra na bandeja.`,
        where: w.span ? `${w.span.name}` : w.before?.detail,
        from: fieldDistance,
        to: fieldDistance,
      });
    } else {
      causes.push({
        level: 'media',
        title: 'Distância medida maior que a fibra do projeto',
        detail: `O OTDR de campo marcou ${m(fieldDistance)}, mas o projeto tem ${m(trace.total)} até o fim. A rota real pode ser outra (fibra, saída de splitter ou cabo diferente) ou os comprimentos/reservas do projeto estão menores que os reais.`,
      });
    }
  }

  if (signal && signal.measured !== null && signal.delta !== null) {
    const delta = signal.delta;
    const excess = -delta;
    if (signal.level === 'high') {
      causes.push({ level: 'alta', title: 'Sinal alto demais para a ONU', detail: `Medido ${signal.measured.toFixed(2)} dBm, acima do máximo (${s.onu_max_dbm} dBm). Use um atenuador ou um splitter de razão maior.` });
    }
    if (delta > DELTA_HIGH) {
      causes.push({
        level: 'alta',
        title: 'Projeto diferente do que está em campo',
        detail: `O sinal está ${delta.toFixed(1)} dB acima do estimado: provavelmente há um splitter de razão menor no campo, menos emendas ou cabos mais curtos que no projeto. Atualize o diagrama.`,
      });
    }
    if (excess >= -DELTA_WARN) {
      const peers = signal.fault?.degradedPeers ?? [];
      if (peers.length) {
        const first = checks[0];
        causes.push({
          level: 'alta',
          title: `Ponto comum a ${peers.length + 1} clientes abaixo do esperado`,
          detail: `${peers.slice(0, 4).join(', ')} também estão com perda alta depois do mesmo ponto. O defeito está no primeiro elemento compartilhado, antes da derivação para este cliente.`,
          where: first ? describeStep(first.step) : undefined,
          from: first?.at ?? undefined,
          to: first?.to ?? undefined,
        });
      }
      if (excess >= 15 || (signal.level === 'critical' && excess >= 8)) {
        causes.push({
          level: 'alta',
          title: 'Rompimento parcial, fibra trincada ou esmagada',
          detail: `${excess.toFixed(1)} dB a mais é muito para emenda ou conector. Dispare o OTDR de campo neste sentido e digite a distância do evento para ver o ponto exato no mapa.`,
          where: zoneText,
          from: zone?.from,
          to: zone?.to,
        });
      }
      causes.push(...splitterCauses(steps, excess).map((c) => ({ ...c, from: zone?.from, to: zone?.to })));
      const connectors = checks.filter((c) => c.step.kind === 'connector');
      if (connectors.length) {
        const list = connectors.slice(0, 4).map((c) => `${describeStep(c.step)}${c.at !== null ? ` (${m(c.at)})` : ''}`).join('; ');
        if (excess <= 3)
          causes.push({
            level: excess <= 1.5 ? 'alta' : 'media',
            title: 'Conector sujo, riscado ou mal encaixado',
            detail: `Cada conector sujo soma de 0,5 a 1,5 dB. Limpe e inspecione: ${list}.`,
            where: list,
            from: connectors[0].at ?? undefined,
            to: connectors[connectors.length - 1].to ?? undefined,
          });
        if (excess >= 2.5 && excess <= 8)
          causes.push({
            level: 'media',
            title: 'Conector APC ligado em UPC (verde no azul)',
            detail: `A mistura APC/UPC causa perda de vários dB e reflexão alta (pico grande no traço). Confira os cordões em: ${list}.`,
            where: list,
          });
      }
      const fusions = checks.filter((c) => c.step.kind === 'fusion');
      if (fusions.length && excess <= Math.max(2, fusions.length * 1)) {
        const list = fusions.slice(0, 4).map((c) => `${c.step.detail}${c.at !== null ? ` (${m(c.at)})` : ''}`).join('; ');
        causes.push({
          level: excess <= 1 ? 'alta' : 'media',
          title: `Fusão com perda alta (${fusions.length} no trecho)`,
          detail: `Uma fusão ruim ou mal acomodada na bandeja soma de 0,3 a 1 dB. Refaça ou reacomode: ${list}.`,
          where: list,
          from: fusions[0].at ?? undefined,
          to: fusions[fusions.length - 1].to ?? undefined,
        });
      }
      const cables = checks.filter((c) => c.step.kind === 'cable');
      if (cables.length && excess < 15) {
        const drops = cables.filter((c) => /drop/i.test(c.step.label));
        const target = drops[0] ?? cables[0];
        causes.push({
          level: drops.length ? 'media' : 'baixa',
          title: 'Curvatura acentuada ou cabo apertado',
          detail: `Raio de curvatura pequeno na entrada da caixa, na reserva técnica, em abraçadeira apertada ou no ponto de ancoragem${drops.length ? ' (cabo drop é o mais sensível)' : ''}. Perde mais em 1550 nm do que em 1310 nm: compare as duas medições.`,
          where: describeStep(target.step),
          from: target.at ?? undefined,
          to: target.to ?? undefined,
        });
      }
    }
  } else if (subj && signal?.measured === null) {
    causes.push({
      level: 'baixa',
      title: 'Sem potência medida no cliente',
      detail: `Informe o Sinal medido (dBm) de ${subj.name} para comparar com o estimado e apontar o trecho com problema.`,
    });
  }

  // Verificações do próprio projeto (valem mesmo sem medição).
  if (subj && subj.budget.ok && subj.budget.power !== null && subj.budget.power < s.onu_min_dbm) {
    causes.push({
      level: 'alta',
      title: 'Projeto fora do orçamento óptico',
      detail: `Mesmo sem defeito, o estimado (${subj.budget.power.toFixed(2)} dBm) fica abaixo da sensibilidade da ONU (${s.onu_min_dbm} dBm). Reduza splitters ou emendas no percurso.`,
    });
  }
  if (subj && !subj.budget.ok) {
    causes.push({ level: 'media', title: 'Percurso incompleto no projeto', detail: `${subj.budget.error ?? 'O caminho não chega a uma OLT.'} Sem o percurso completo não há estimativa para comparar.` });
  }
  if (trace.end.kind === 'open' || trace.end.kind === 'loose') {
    const end = trace.events[trace.events.length - 1];
    causes.push({
      level: subj ? 'media' : 'baixa',
      title: 'Fibra sem continuidade no projeto',
      detail: `${trace.end.reason} Se em campo a fibra deveria seguir, falta a fusão no diagrama (ou ela está em outra fibra).`,
      where: end?.detail,
      from: end?.at,
      to: end?.at,
    });
  }
  trace.events
    .filter((e) => e.kind === 'fusion' && e.loss > 0.3)
    .forEach((e) => causes.push({ level: 'media', title: `Fusão registrada com ${e.loss.toFixed(2)} dB`, detail: `Acima do aceitável (até 0,3 dB). Refaça a emenda em ${e.detail}.`, where: e.detail, from: e.at, to: e.at }));
  trace.spans
    .filter((sp) => sp.dbKm > 0.5)
    .forEach((sp) =>
      causes.push({ level: 'baixa', title: `Atenuação alta no ${sp.name}`, detail: `${String(sp.dbKm).replace('.', ',')} dB/km cadastrado (típico 0,35 em 1310 nm). Confira o cabo ou o valor informado.`, where: sp.name, from: sp.start, to: sp.end }),
    );

  const order: Record<CauseLevel, number> = { alta: 0, media: 1, baixa: 2 };
  causes.sort((a, b) => order[a.level] - order[b.level]);
  return { client: subj ? { key: subj.key, name: subj.name } : null, signal, zone, checks, causes };
}
