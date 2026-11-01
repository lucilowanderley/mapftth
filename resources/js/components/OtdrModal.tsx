import { Crosshair } from 'lucide-react';
import { useMemo, useState } from 'react';
import { otdrRoute, pointAtDistance } from '../lib/analysis';
import type { BudgetResult } from '../lib/budget';
import type { LatLng, Network } from '../lib/types';
import { Modal, formatLength } from './ui';

const W = 720;
const H = 260;
const PAD = { l: 48, r: 16, t: 16, b: 32 };

const KIND_COLOR: Record<string, string> = { source: '#10b981', connector: '#0ea5e9', fusion: '#eab308', splitter: '#a855f7' };
const KIND_LABEL: Record<string, string> = { source: 'OLT', connector: 'Conector', fusion: 'Fusão', splitter: 'Splitter' };

export default function OtdrModal({ title, network, budget, onClose, onLocate }: { title: string; network: Network; budget: BudgetResult; onClose: () => void; onLocate: (p: LatLng, label: string, route: LatLng[]) => void }) {
  const route = useMemo(() => otdrRoute(network, budget), [network, budget]);
  const [distanceM, setDistanceM] = useState('');
  const [hover, setHover] = useState<number | null>(null);

  // Curva esperada: potência ao longo do percurso (perda distribuída nos cabos e degraus nos eventos).
  const curve = useMemo(() => {
    if (!budget.ok || budget.power === null) return [];
    const pts: { at: number; p: number }[] = [];
    let at = 0;
    let p = budget.power + budget.totalLoss;
    pts.push({ at, p });
    budget.steps.forEach((s) => {
      if (s.kind === 'cable') at += s.meters ?? 0;
      p -= s.loss;
      pts.push({ at, p });
    });
    return pts;
  }, [budget]);

  if (!route || !curve.length) {
    return (
      <Modal title={`OTDR virtual · ${title}`} onClose={onClose}>
        <p className="text-sm text-slate-400">O percurso não chega a uma OLT ({budget.error ?? 'sem sinal'}). Complete as fusões até o POP para ver a curva.</p>
      </Modal>
    );
  }

  const maxAt = Math.max(1, route.total);
  const maxP = Math.ceil(curve[0].p);
  const minP = Math.floor(Math.min(...curve.map((c) => c.p)) - 1);
  const x = (at: number) => PAD.l + (at / maxAt) * (W - PAD.l - PAD.r);
  const y = (p: number) => PAD.t + ((maxP - p) / (maxP - minP)) * (H - PAD.t - PAD.b);
  const d = curve.map((c, i) => `${i ? 'L' : 'M'}${x(c.at).toFixed(1)},${y(c.p).toFixed(1)}`).join(' ');
  const typed = Number(distanceM.replace(',', '.'));
  const located = distanceM && Number.isFinite(typed) ? pointAtDistance(route, typed) : null;
  const yTicks = Array.from({ length: 5 }, (_, i) => maxP - ((maxP - minP) * i) / 4);
  const xTicks = Array.from({ length: 6 }, (_, i) => (maxAt * i) / 5);

  return (
    <Modal title={`OTDR virtual · ${title}`} onClose={onClose} width="max-w-4xl">
      <p className="text-xs text-slate-400 mb-3">
        Curva esperada do percurso OLT → {title}: {formatLength(route.total)} de fibra (com reserva técnica), {budget.totalLoss.toFixed(2)} dB de perda. Use para comparar
        com a medição real e localizar eventos no mapa.
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full bg-slate-950 rounded-lg" onMouseLeave={() => setHover(null)}>
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="#1e293b" />
            <text x={PAD.l - 6} y={y(t) + 3} fontSize={10} fill="#94a3b8" textAnchor="end">
              {t.toFixed(0)}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text key={t} x={x(t)} y={H - 10} fontSize={10} fill="#94a3b8" textAnchor="middle">
            {t >= 1000 ? `${(t / 1000).toFixed(2)} km` : `${Math.round(t)} m`}
          </text>
        ))}
        <text x={12} y={PAD.t + 4} fontSize={10} fill="#94a3b8">
          dBm
        </text>
        <path d={d} fill="none" stroke="#10b981" strokeWidth={2} />
        {route.events.map((e, i) => (
          <g key={i} onMouseEnter={() => setHover(i)}>
            <circle cx={x(e.at)} cy={y(e.power)} r={10} fill="transparent" />
            <circle cx={x(e.at)} cy={y(e.power)} r={4.5} fill={KIND_COLOR[e.kind] ?? '#64748b'} stroke="#0f172a" strokeWidth={2} />
          </g>
        ))}
        {located && Number.isFinite(typed) && <line x1={x(typed)} x2={x(typed)} y1={PAD.t} y2={H - PAD.b} stroke="#ef4444" strokeDasharray="4 3" />}
        {hover !== null && (
          <g>
            <rect x={Math.min(x(route.events[hover].at) + 8, W - 190)} y={PAD.t} width={180} height={44} rx={6} fill="#0f172a" stroke="#334155" />
            <text x={Math.min(x(route.events[hover].at) + 16, W - 182)} y={PAD.t + 18} fontSize={11} fill="#e2e8f0">
              {route.events[hover].label} · {KIND_LABEL[route.events[hover].kind]}
            </text>
            <text x={Math.min(x(route.events[hover].at) + 16, W - 182)} y={PAD.t + 34} fontSize={10} fill="#94a3b8">
              {Math.round(route.events[hover].at)} m · -{route.events[hover].loss.toFixed(2)} dB · {route.events[hover].power.toFixed(2)} dBm
            </text>
          </g>
        )}
      </svg>
      <div className="flex flex-wrap gap-3 text-xs text-slate-400 mt-2">
        {Object.entries(KIND_LABEL).map(([k, l]) => (
          <span key={k} className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: KIND_COLOR[k] }} /> {l}
          </span>
        ))}
      </div>

      <div className="mt-4 rounded-lg bg-slate-950 p-3 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="label">Distância do evento medida no OTDR (m)</span>
          <input className="input !w-48" inputMode="decimal" value={distanceM} onChange={(e) => setDistanceM(e.target.value)} placeholder="ex.: 845" />
        </label>
        {distanceM &&
          (located ? (
            <button className="btn-primary" onClick={() => onLocate(located, `Evento a ${Math.round(typed)} m`, route.path)}>
              <Crosshair size={16} /> Mostrar no mapa
            </button>
          ) : (
            <span className="text-sm text-amber-400">Distância fora do percurso (máx. {Math.round(route.total)} m).</span>
          ))}
        {located && (
          <span className="text-xs text-slate-400">
            {located[0].toFixed(6)}, {located[1].toFixed(6)} · após o evento mais próximo:{' '}
            {[...route.events].reverse().find((e) => e.at <= typed)?.label ?? 'início'}
          </span>
        )}
      </div>

      <table className="w-full text-sm mt-4">
        <thead className="text-xs text-slate-400 text-left">
          <tr>
            <th className="py-1">Evento</th>
            <th>Tipo</th>
            <th className="text-right">Distância</th>
            <th className="text-right">Perda</th>
            <th className="text-right">Potência</th>
          </tr>
        </thead>
        <tbody>
          {route.events.map((e, i) => (
            <tr key={i} className="border-t border-slate-800">
              <td className="py-1">{e.label}</td>
              <td>{KIND_LABEL[e.kind] ?? e.kind}</td>
              <td className="text-right font-mono">{Math.round(e.at)} m</td>
              <td className="text-right font-mono text-red-400">{e.loss > 0 ? `-${e.loss.toFixed(2)} dB` : '—'}</td>
              <td className="text-right font-mono">{e.power.toFixed(2)} dBm</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}
