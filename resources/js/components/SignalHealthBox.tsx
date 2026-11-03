import { HEALTH_COLORS, HEALTH_LABEL, describeStep, type SignalAnalysis } from '../lib/signal';

/** Saúde do sinal do cliente: medido × estimado e, se estiver abaixo do esperado, o trecho provável do problema. */
export default function SignalHealthBox({ analysis: a }: { analysis?: SignalAnalysis }) {
  if (!a) return null;
  if (a.measured === null) return <div className="text-xs text-slate-500 mt-1">Sem sinal medido na ONU/ONT: informe em Editar.</div>;
  const when = a.measuredAt ? new Date(a.measuredAt) : null;
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
      {when && !Number.isNaN(when.getTime()) && <div className="text-slate-500">Medido em {when.toLocaleString('pt-BR')}</div>}
      {a.fault && (
        <div className="pt-1">
          <div className="text-slate-300">{a.fault.text}</div>
          {a.fault.degradedPeers.length > 0 && <div className="text-slate-500">Também abaixo: {a.fault.degradedPeers.slice(0, 4).join(', ')}</div>}
          <div className="mt-1 text-slate-400">Pontos a verificar (da OLT para o cliente):</div>
          <ol className="list-decimal pl-4 text-slate-300">
            {a.fault.suspects.slice(0, 8).map((st, i) => (
              <li key={i}>
                {describeStep(st)} <span className="text-slate-500">· {st.loss.toFixed(2)} dB previstos</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
