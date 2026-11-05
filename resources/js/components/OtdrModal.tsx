import { Download, Flashlight, Printer } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { downloadText, toCsv } from '../lib/analysis';
import { locateDistance, OTDR_END_LABEL, OTDR_KIND_COLOR, OTDR_KIND_LABEL, otdrCurve, type OtdrTrace } from '../lib/otdr';
import { Modal, formatLength } from './ui';

const W = 760;
const H = 280;
const PAD = { l: 48, r: 16, t: 16, b: 32 };

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const km = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(3)} km` : `${Math.round(m)} m`);

/** Gráfico (curva simulada do OTDR) e relatório de eventos de um disparo feito pela ferramenta OTDR. */
export default function OtdrModal({
  trace,
  distance: initial,
  projectName,
  onClose,
  onLaser,
}: {
  trace: OtdrTrace;
  distance: number | null;
  projectName: string;
  onClose: () => void;
  onLaser: () => void;
}) {
  const curve = useMemo(() => otdrCurve(trace), [trace]);
  const [hover, setHover] = useState<number | null>(null);
  const [dist, setDist] = useState(initial != null ? String(Math.round(initial)) : '');
  const svgRef = useRef<SVGSVGElement>(null);

  const { node, cable, fiber, toward } = trace.start;
  const title = `${node.name} → ${toward?.name ?? 'ponta solta'} · ${cable.name} · fibra ${fiber}`;
  const maxAt = Math.max(1, ...curve.map((c) => c.at));
  const maxDb = Math.ceil(Math.max(...curve.map((c) => c.db)) + 1);
  const minDb = Math.floor(Math.min(...curve.map((c) => c.db)) - 1);
  const x = (at: number) => PAD.l + (at / maxAt) * (W - PAD.l - PAD.r);
  const y = (db: number) => PAD.t + ((maxDb - db) / (maxDb - minDb)) * (H - PAD.t - PAD.b);
  const d = curve.map((c, i) => `${i ? 'L' : 'M'}${x(c.at).toFixed(1)},${y(c.db).toFixed(1)}`).join(' ');
  const yTicks = Array.from({ length: 5 }, (_, i) => maxDb - ((maxDb - minDb) * i) / 4);
  const xTicks = Array.from({ length: 6 }, (_, i) => (maxAt * i) / 5);
  const meters = dist.trim() === '' ? null : Number(dist.replace(',', '.'));
  const valid = meters !== null && Number.isFinite(meters) && meters >= 0 && meters <= trace.total;
  const where = valid ? locateDistance(trace, meters!) : null;
  const avg = trace.total > 0 ? (trace.spans.reduce((a, s) => a + s.loss, 0) / trace.total) * 1000 : 0;

  const eventRows = trace.events.map((e, i) => [
    String(i + 1),
    OTDR_KIND_LABEL[e.kind],
    e.label,
    e.detail,
    km(e.at),
    e.loss > 0 ? e.loss.toFixed(2) : '—',
    e.total.toFixed(2),
    e.reflective ? 'Sim' : 'Não',
  ]);
  const spanRows = trace.spans.map((s) => [s.name, String(s.fiber), s.fromNode, s.toNode, km(s.end - s.start), s.slack ? km(s.slack) : '—', String(s.dbKm).replace('.', ','), s.loss.toFixed(2)]);
  const EVENT_HEAD = ['Nº', 'Tipo', 'Evento', 'Local', 'Distância', 'Perda (dB)', 'Acumulada (dB)', 'Reflexivo'];
  const SPAN_HEAD = ['Cabo', 'Fibra', 'De', 'Para', 'Comprimento', 'Reserva', 'dB/km', 'Perda (dB)'];

  function csv() {
    downloadText(
      `otdr-${cable.name.toLowerCase().replace(/[^\w]+/g, '-')}-f${fiber}.csv`,
      toCsv([['Disparo', title], [], EVENT_HEAD, ...eventRows, [], SPAN_HEAD, ...spanRows]),
    );
  }

  function print() {
    const w = window.open('', '_blank');
    if (!w) return;
    const table = (head: string[], rows: string[][]) =>
      `<table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    const svg = (svgRef.current?.outerHTML ?? '').replace('class="w-full bg-slate-950 rounded-lg"', 'style="width:100%;background:#0f172a;border-radius:8px"');
    w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>OTDR · ${esc(title)}</title>
      <style>body{font-family:Arial,sans-serif;color:#0f172a;margin:32px}h1{font-size:20px;margin:0}h2{font-size:14px;margin:24px 0 6px;border-bottom:2px solid #10b981;padding-bottom:4px}
      .sub{color:#64748b;font-size:12px;margin-top:4px}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #cbd5e1;padding:4px 6px;text-align:left}th{background:#f1f5f9}
      .kpis{display:flex;gap:12px;margin:16px 0}.kpi{border:1px solid #cbd5e1;border-radius:6px;padding:8px 12px}.kpi b{display:block;font-size:18px}.alert{border:1px solid #ef4444;background:#fef2f2;border-radius:6px;padding:8px 12px;margin-top:12px;font-size:13px}</style></head><body>
      <h1>${esc(projectName)} · OTDR</h1><div class="sub">${esc(title)} · MapFTTH · ${new Date().toLocaleString('pt-BR')} · curva simulada a partir do projeto</div>
      <div class="kpis"><div class="kpi">Comprimento<b>${esc(km(trace.total))}</b></div><div class="kpi">Perda total<b>${trace.totalLoss.toFixed(2)} dB</b></div><div class="kpi">Atenuação média<b>${avg.toFixed(3)} dB/km</b></div><div class="kpi">Fim<b>${esc(OTDR_END_LABEL[trace.end.kind])}</b></div></div>
      ${where ? `<div class="alert"><b>Evento medido a ${esc(km(meters!))}</b>: ${where.span ? `cabo ${esc(where.span.name)}, a ${esc(km(where.fromStart!))} de ${esc(where.span.fromNode)} e ${esc(km(where.toEnd!))} de ${esc(where.span.toNode)}` : 'dentro de uma caixa'}.</div>` : ''}
      ${svg}
      <h2>Eventos</h2>${table(EVENT_HEAD, eventRows)}
      <h2>Trechos de cabo</h2>${table(SPAN_HEAD, spanRows)}
      <script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  }

  return (
    <Modal title={`OTDR · ${title}`} onClose={onClose} width="max-w-5xl">
      <div className="flex flex-wrap gap-2 mb-3 text-xs">
        <div className="rounded-lg bg-slate-950 px-3 py-2">
          <div className="text-slate-400">Comprimento</div>
          <b className="text-base">{formatLength(trace.total)}</b>
        </div>
        <div className="rounded-lg bg-slate-950 px-3 py-2">
          <div className="text-slate-400">Perda total</div>
          <b className="text-base">{trace.totalLoss.toFixed(2)} dB</b>
        </div>
        <div className="rounded-lg bg-slate-950 px-3 py-2">
          <div className="text-slate-400">Atenuação média</div>
          <b className="text-base">{avg.toFixed(3)} dB/km</b>
        </div>
        <div className="rounded-lg bg-slate-950 px-3 py-2 min-w-0 flex-1">
          <div className="text-slate-400">Fim da fibra</div>
          <b className="text-base">{OTDR_END_LABEL[trace.end.kind]}</b> <span className="text-slate-400">{trace.end.reason}</span>
        </div>
      </div>

      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full bg-slate-950 rounded-lg" onMouseLeave={() => setHover(null)}>
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
            {km(t)}
          </text>
        ))}
        <text x={8} y={PAD.t + 4} fontSize={10} fill="#94a3b8">
          dB
        </text>
        <path d={d} fill="none" stroke="#facc15" strokeWidth={1.6} />
        {valid && (
          <g>
            <line x1={x(meters!)} x2={x(meters!)} y1={PAD.t} y2={H - PAD.b} stroke="#ef4444" strokeDasharray="4 3" />
            <text x={Math.min(x(meters!) + 4, W - 80)} y={PAD.t + 10} fontSize={10} fill="#fca5a5">
              {km(meters!)}
            </text>
          </g>
        )}
        {trace.events.map((e, i) => {
          // Eventos na mesma caixa ficam no mesmo ponto: os números sobem um acima do outro.
          const stack = trace.events.slice(0, i).filter((o) => Math.abs(x(o.at) - x(e.at)) < 8).length;
          const ty = H - PAD.b - 12 - stack * 11;
          return (
            <g key={i} onMouseEnter={() => setHover(i)}>
              <line x1={x(e.at)} x2={x(e.at)} y1={H - PAD.b} y2={H - PAD.b - 6} stroke={OTDR_KIND_COLOR[e.kind]} strokeWidth={2} />
              <circle cx={x(e.at)} cy={ty - 3} r={6} fill="transparent" />
              <text x={x(e.at)} y={ty} fontSize={9} fill={OTDR_KIND_COLOR[e.kind]} textAnchor="middle">
                {i + 1}
              </text>
            </g>
          );
        })}
        {hover !== null && (
          <g>
            <rect x={Math.min(x(trace.events[hover].at) + 8, W - 250)} y={PAD.t} width={240} height={44} rx={6} fill="#0f172a" stroke="#334155" />
            <text x={Math.min(x(trace.events[hover].at) + 16, W - 242)} y={PAD.t + 18} fontSize={11} fill="#e2e8f0">
              {hover + 1}. {trace.events[hover].label} · {OTDR_KIND_LABEL[trace.events[hover].kind]}
            </text>
            <text x={Math.min(x(trace.events[hover].at) + 16, W - 242)} y={PAD.t + 34} fontSize={10} fill="#94a3b8">
              {km(trace.events[hover].at)} · {trace.events[hover].loss > 0 ? `-${trace.events[hover].loss.toFixed(2)} dB` : 'sem perda'} · acum. {trace.events[hover].total.toFixed(2)} dB
            </text>
          </g>
        )}
      </svg>
      <div className="flex flex-wrap gap-3 text-xs text-slate-400 mt-2">
        {Object.entries(OTDR_KIND_LABEL).map(([k, l]) => (
          <span key={k} className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: OTDR_KIND_COLOR[k as keyof typeof OTDR_KIND_COLOR] }} /> {l}
          </span>
        ))}
        <span className="ml-auto">Curva simulada a partir do projeto, para comparar com a medição real.</span>
      </div>

      <div className="mt-4 rounded-lg bg-slate-950 p-3 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="label">Distância do evento medida no OTDR (m)</span>
          <input className="input !w-48" inputMode="decimal" value={dist} onChange={(e) => setDist(e.target.value)} placeholder="ex.: 845" />
        </label>
        {meters !== null && !valid && <span className="text-sm text-amber-400">Fora da fibra (máx. {Math.round(trace.total)} m).</span>}
        {where && (
          <span className="text-xs text-slate-300 flex-1 min-w-56">
            {where.span ? (
              <>
                No cabo <b>{where.span.name}</b>, a <b>{formatLength(where.fromStart!)}</b> de {where.span.fromNode} e <b>{formatLength(where.toEnd!)}</b> de {where.span.toNode}.
              </>
            ) : (
              'Dentro de uma caixa.'
            )}{' '}
            <span className="text-slate-500">Depois de: {where.before?.label ?? 'disparo'}.</span>
          </span>
        )}
        <div className="flex gap-2 ml-auto">
          <button className="btn-ghost" onClick={onLaser} title="Volta para o mapa com o laser aceso">
            <Flashlight size={16} /> Laser no mapa
          </button>
          <button className="btn-ghost" onClick={csv}>
            <Download size={16} /> CSV
          </button>
          <button className="btn-primary" onClick={print}>
            <Printer size={16} /> Imprimir
          </button>
        </div>
      </div>

      <h3 className="text-sm font-semibold mt-4 mb-1">Eventos</h3>
      <table className="w-full text-sm">
        <thead className="text-xs text-slate-400 text-left">
          <tr>
            <th className="py-1">Nº</th>
            <th>Evento</th>
            <th>Local</th>
            <th className="text-right">Distância</th>
            <th className="text-right">Perda</th>
            <th className="text-right">Acumulada</th>
          </tr>
        </thead>
        <tbody>
          {trace.events.map((e, i) => (
            <tr key={i} className={`border-t border-slate-800 ${hover === i ? 'bg-slate-800/60' : ''}`} onMouseEnter={() => setHover(i)}>
              <td className="py-1">
                <span className="inline-block w-2.5 h-2.5 rounded-full mr-1.5" style={{ background: OTDR_KIND_COLOR[e.kind] }} />
                {i + 1}
              </td>
              <td>{e.label}</td>
              <td className="text-slate-400">{e.detail}</td>
              <td className="text-right font-mono">{km(e.at)}</td>
              <td className="text-right font-mono text-red-400">{e.loss > 0 ? `-${e.loss.toFixed(2)} dB` : '—'}</td>
              <td className="text-right font-mono">{e.total.toFixed(2)} dB</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className="text-sm font-semibold mt-4 mb-1">Trechos de cabo</h3>
      <table className="w-full text-sm">
        <thead className="text-xs text-slate-400 text-left">
          <tr>
            {SPAN_HEAD.map((h, i) => (
              <th key={h} className={i >= 4 ? 'text-right py-1' : 'py-1'}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {spanRows.map((r, i) => (
            <tr key={i} className="border-t border-slate-800">
              {r.map((c, j) => (
                <td key={j} className={j >= 4 ? 'text-right font-mono py-1' : 'py-1'}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}
