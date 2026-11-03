import { Activity } from 'lucide-react';
import { POWER_COLORS, POWER_LABEL, type BudgetResult, type PowerLevel } from '../lib/budget';
import { HEALTH_COLORS, HEALTH_LABEL, describeStep, type SignalAnalysis } from '../lib/signal';

/** Trecho provável do problema: último ponto bom e os elementos a verificar. */
function FaultDetails({ fault }: { fault: NonNullable<SignalAnalysis['fault']> }) {
  return (
    <div className="pt-1">
      <div className="text-slate-300">{fault.text}</div>
      {fault.degradedPeers.length > 0 && <div className="text-slate-500">Também abaixo: {fault.degradedPeers.slice(0, 4).join(', ')}</div>}
      <div className="mt-1 text-slate-400">Pontos a verificar (da OLT para o cliente):</div>
      <ol className="list-decimal pl-4 text-slate-300">
        {fault.suspects.slice(0, 8).map((st, i) => (
          <li key={i}>
            {describeStep(st)} <span className="text-slate-500">· {st.loss.toFixed(2)} dB previstos</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function measuredWhen(a: SignalAnalysis) {
  const when = a.measuredAt ? new Date(a.measuredAt) : null;
  return when && !Number.isNaN(when.getTime()) ? when.toLocaleString('pt-BR') : null;
}

/** Saúde do sinal do cliente: medido × estimado e, se estiver abaixo do esperado, o trecho provável do problema. */
export default function SignalHealthBox({ analysis: a }: { analysis?: SignalAnalysis }) {
  if (!a) return null;
  if (a.measured === null) return <div className="text-xs text-slate-500 mt-1">Sem sinal medido na ONU/ONT: informe em Editar.</div>;
  const when = measuredWhen(a);
  return (
    <div className="mt-2 rounded-md border border-slate-700 px-2.5 py-2 text-xs space-y-1">
      <div className="flex items-center gap-2">
        <span className="rounded-full px-2 py-0.5 font-semibold text-white" style={{ background: HEALTH_COLORS[a.health] }}>
          {HEALTH_LABEL[a.health]}
        </span>
        <span>
          Medido <b>{a.measured.toFixed(2)} dBm</b>
          {a.estimated !== null && <> · estimado {a.estimated.toFixed(2)} dBm</>}
        </span>
      </div>
      <div className="text-slate-300">{a.summary}</div>
      {when && <div className="text-slate-500">Medido em {when}</div>}
      {a.fault && <FaultDetails fault={a.fault} />}
    </div>
  );
}

/**
 * Painel do cliente no mapa: um cartão só com a potência estimada (orçamento óptico) e a medida na ONU/ONT,
 * a saúde do sinal e o motivo quando não há estimativa (sem repetir a mesma frase em dois quadros).
 */
export function ClientSignalCard({ budget, level, signal, onOpen }: { budget?: BudgetResult; level: PowerLevel | null; signal?: SignalAnalysis; onOpen?: () => void }) {
  if (!budget && !signal) return null;
  const estimated = budget?.power ?? null;
  const measured = signal?.measured ?? null;
  const when = signal ? measuredWhen(signal) : null;
  // Com estimativa e medição, o resumo compara as duas; sem estimativa, basta o motivo (o resumo só o repetiria).
  const note = budget?.error ?? (signal && measured !== null && estimated !== null ? signal.summary : null);
  const color = level ? POWER_COLORS[level] : '#334155';
  return (
    <div className="rounded-md border px-2.5 py-2 text-xs space-y-1.5" style={{ borderColor: color }}>
      <button type="button" onClick={onOpen} disabled={!onOpen} className="block w-full text-left cursor-pointer disabled:cursor-default" title="Abrir orçamento óptico">
        <div className="flex items-center justify-between text-slate-400">
          <span className="flex items-center gap-1">
            <Activity size={12} /> Potência na ONU
          </span>
          {signal && measured !== null ? (
            <span className="rounded-full px-2 py-px text-[11px] font-semibold text-white" style={{ background: HEALTH_COLORS[signal.health] }}>
              {HEALTH_LABEL[signal.health]}
            </span>
          ) : (
            level && <span style={{ color }}>{POWER_LABEL[level]}</span>
          )}
        </div>
        <div className="mt-1 grid grid-cols-2 gap-2">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Estimada</div>
            <div className="font-mono text-sm font-semibold" style={level && estimated !== null ? { color } : undefined}>
              {estimated !== null ? `${estimated.toFixed(2)} dBm` : '—'}
            </div>
          </div>
          <div title={when ? `Medido em ${when}` : undefined}>
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Medida</div>
            <div className="font-mono text-sm font-semibold">{measured !== null ? `${measured.toFixed(2)} dBm` : '—'}</div>
          </div>
        </div>
      </button>
      {note && <div className="text-slate-400 leading-snug">{note}</div>}
      {measured !== null && when && <div className="text-[11px] text-slate-500">Medido em {when}</div>}
      {signal?.fault && <FaultDetails fault={signal.fault} />}
    </div>
  );
}
