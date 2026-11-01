import { ArrowDown, CheckCircle2, AlertTriangle } from 'lucide-react';
import { POWER_COLORS, POWER_LABEL, powerLevel, type BudgetResult } from '../lib/budget';
import type { Settings } from '../lib/types';
import { Modal } from './ui';

const KIND_LABEL = { source: 'OLT', connector: 'Conector', cable: 'Cabo', fusion: 'Fusão', splitter: 'Splitter' };

export default function BudgetModal({ title, result, settings, onClose }: { title: string; result: BudgetResult; settings: Settings; onClose: () => void }) {
  const level = powerLevel(result.power, settings);
  const color = POWER_COLORS[level];
  return (
    <Modal title={<span>Orçamento óptico <span className="text-slate-400 font-normal">· {title}</span></span>} onClose={onClose}>
      <div className="rounded-lg border p-4 flex items-center justify-between" style={{ borderColor: color, background: `${color}14` }}>
        <div className="flex items-center gap-3">
          {result.ok ? <CheckCircle2 style={{ color }} /> : <AlertTriangle className="text-amber-400" />}
          <div>
            <div className="text-xs text-slate-400 uppercase">Potência final</div>
            <div className="text-2xl font-mono font-semibold">{result.power !== null ? `${result.power.toFixed(2)} dBm` : '—'}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-400 uppercase">Status</div>
          <div className="font-semibold" style={{ color }}>
            {POWER_LABEL[level]}
          </div>
        </div>
      </div>
      {result.error && <p className="mt-3 text-sm text-amber-300">{result.error}</p>}
      <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
        <div className="rounded-md bg-slate-950 p-3">
          <div className="text-xs text-slate-400 uppercase">Origem (OLT)</div>
          <div className="font-medium">{result.source ?? '—'}</div>
        </div>
        <div className="rounded-md bg-slate-950 p-3">
          <div className="text-xs text-slate-400 uppercase">Perda total</div>
          <div className="font-medium flex items-center gap-1">
            <ArrowDown size={14} className="text-red-400" /> {result.totalLoss.toFixed(2)} dB
          </div>
          <div className="text-xs text-slate-500">{result.steps.length} elementos no caminho</div>
        </div>
      </div>
      <div className="label mt-4">Detalhes do percurso</div>
      <ol className="space-y-1.5">
        {result.steps.map((s, i) => (
          <li key={i} className="flex items-center gap-3 rounded-md bg-slate-950 px-3 py-2">
            <span className="w-6 h-6 rounded-full border border-slate-600 text-xs flex items-center justify-center shrink-0">{i + 1}</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{s.label}</div>
              <div className="text-xs text-slate-500 truncate">
                {KIND_LABEL[s.kind]} · {s.detail}
              </div>
            </div>
            <span className="font-mono text-sm text-red-400">-{s.loss.toFixed(2)} dB</span>
          </li>
        ))}
      </ol>
      <p className="text-xs text-slate-500 mt-3">
        Faixa aceita na ONU: {settings.onu_min_dbm} a {settings.onu_max_dbm} dBm (atenção abaixo de {settings.onu_warn_dbm} dBm).
      </p>
    </Modal>
  );
}
