import { ArrowRightLeft, ChartLine, Crosshair, Flashlight, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { fiberColor } from '../lib/catalog';
import { laserTo, locateDistance, OTDR_END_LABEL, otdrTrace, type OtdrTrace } from '../lib/otdr';
import type { LatLng, Network } from '../lib/types';
import { formatLength } from './ui';

/** Ponto de disparo escolhido no mapa: o cabo, a ponta (objeto) de onde sai a luz e as opções clicadas. */
export interface OtdrPick {
  cableId: number;
  nodeId: number;
  /** Cabos que chegam no objeto clicado (para trocar sem sair do painel). */
  options: number[];
  fiber?: number;
  t: number;
}

/** O "laser" desenhado no mapa: traçado aceso até o rompimento (ou o fim da fibra). */
export interface OtdrLaser {
  path: LatLng[];
  point: LatLng;
  origin: LatLng;
  label: string;
  broken: boolean;
}

export type OtdrMode = 'laser' | 'graph';

interface Props {
  network: Network;
  pick: OtdrPick | null;
  onLaser: (l: OtdrLaser | null) => void;
  onReport: (trace: OtdrTrace, distance: number | null) => void;
  onFocus: (at: LatLng) => void;
  onClose: () => void;
}

const parseMeters = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));

export default function OtdrPanel({ network, pick, onLaser, onReport, onFocus, onClose }: Props) {
  const [cableId, setCableId] = useState(pick?.cableId ?? null);
  const [nodeId, setNodeId] = useState(pick?.nodeId ?? null);
  const [fiber, setFiber] = useState(pick?.fiber ?? 1);
  const [mode, setMode] = useState<OtdrMode>('laser');
  const [dist, setDist] = useState('');
  const [choices, setChoices] = useState<Record<string, number>>({});

  const cable = network.cables.find((c) => c.id === cableId) ?? null;
  const nodeName = (id: number | null) => network.nodes.find((n) => n.id === id)?.name ?? 'ponta solta';
  const options = (pick?.options ?? []).map((id) => network.cables.find((c) => c.id === id)).filter((c) => !!c);

  const trace = useMemo(() => {
    if (!cable || nodeId == null) return null;
    return otdrTrace(network, { nodeId, cableId: cable.id, fiber, choices });
  }, [network, cable, nodeId, fiber, choices]);
  const ok = trace && !('error' in trace) ? trace : null;
  const meters = parseMeters(dist);
  const badDistance = meters !== null && (!Number.isFinite(meters) || meters < 0);
  const beyond = ok && meters !== null && !badDistance && meters > ok.total;
  const broken = ok && meters !== null && !badDistance && !beyond;
  const where = broken ? locateDistance(ok, meters) : null;

  const laser = useMemo<OtdrLaser | null>(() => {
    if (!ok || mode !== 'laser') return null;
    const origin = ok.path[0];
    if (broken) {
      const l = laserTo(ok, meters!);
      return l && { path: l.path, point: l.point, origin, label: `Rompimento a ${formatLength(meters!)}`, broken: true };
    }
    return { path: ok.path, point: ok.path[ok.path.length - 1], origin, label: `${OTDR_END_LABEL[ok.end.kind]} · ${formatLength(ok.total)}`, broken: false };
  }, [ok, mode, broken, meters]);

  useEffect(() => {
    onLaser(laser);
  }, [laser]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onLaser(null), []); // eslint-disable-line react-hooks/exhaustive-deps

  function chooseCable(id: number) {
    const c = network.cables.find((x) => x.id === id);
    if (!c) return;
    setCableId(id);
    // Mantém a ponta no objeto clicado quando o novo cabo também chega nele.
    if (nodeId !== c.from_node_id && nodeId !== c.to_node_id) setNodeId(c.from_node_id ?? c.to_node_id);
    setFiber(1);
    setChoices({});
  }

  const aId = cable?.from_node_id ?? null;
  const bId = cable?.to_node_id ?? null;

  return (
    <div className="absolute top-3 left-3 z-[1000] panel w-80 max-h-[calc(100%-1.5rem)] overflow-y-auto">
      <div className="flex items-start justify-between px-4 py-3 border-b border-slate-800">
        <div>
          <div className="font-semibold">OTDR</div>
          <div className="text-xs text-slate-400">Clique num cabo ou numa caixa para escolher onde ligar o OTDR</div>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-white cursor-pointer" aria-label="Fechar">
          <X size={18} />
        </button>
      </div>

      {!cable ? (
        <p className="p-4 text-sm text-slate-400">Nenhum ponto escolhido. Clique no cabo (ou na CTO, CEO ou POP) onde o OTDR será conectado.</p>
      ) : (
        <div className="p-4 space-y-3">
          {options.length > 1 ? (
            <label className="block">
              <span className="label">Cabo</span>
              <select className="input" value={cable.id} onChange={(e) => chooseCable(Number(e.target.value))}>
                {options.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.fiber_count} FO
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="text-sm">
              <span className="text-slate-400">Cabo</span> <b>{cable.name}</b> · {cable.fiber_count} FO · {formatLength(cable.length_m)}
            </div>
          )}

          <div>
            <span className="label">Sentido do disparo</span>
            <div className="grid grid-cols-2 gap-1">
              {([
                ['A → B', aId, bId],
                ['B → A', bId, aId],
              ] as const).map(([label, from, to]) => (
                <button
                  key={label}
                  type="button"
                  disabled={from == null}
                  onClick={() => {
                    setNodeId(from);
                    setChoices({});
                  }}
                  className={`rounded-md border px-2 py-1.5 text-left text-xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                    nodeId === from ? 'border-emerald-500 bg-emerald-600/15 text-white' : 'border-slate-700 text-slate-300 hover:bg-slate-800'
                  }`}
                  title={from == null ? 'Esta ponta do cabo não está ligada a nenhum objeto' : undefined}
                >
                  <div className="font-semibold">{label}</div>
                  <div className="truncate">
                    {nodeName(from)} → {nodeName(to)}
                  </div>
                </button>
              ))}
            </div>
            <div className="mt-1 text-[11px] text-slate-500 flex items-center gap-1">
              <ArrowRightLeft size={12} /> A = início do cabo ({nodeName(aId)}), B = fim ({nodeName(bId)})
            </div>
          </div>

          <label className="block">
            <span className="label">Fibra</span>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full border border-slate-600 shrink-0" style={{ background: fiberColor(fiber, cable.fibers_per_tube).hex }} />
              <select
                className="input"
                value={fiber}
                onChange={(e) => {
                  setFiber(Number(e.target.value));
                  setChoices({});
                }}
              >
                {Array.from({ length: cable.fiber_count }, (_, i) => i + 1).map((f) => (
                  <option key={f} value={f}>
                    Fibra {f} · {fiberColor(f, cable.fibers_per_tube).name}
                  </option>
                ))}
              </select>
            </div>
          </label>

          <label className="block">
            <span className="label">Distância do evento medida no OTDR (m) · opcional</span>
            <input className="input" inputMode="decimal" value={dist} onChange={(e) => setDist(e.target.value)} placeholder="ex.: 845 (vazio = até o fim da fibra)" />
          </label>

          <div>
            <span className="label">Resultado</span>
            <div className="grid grid-cols-2 gap-1">
              <button
                type="button"
                onClick={() => setMode('laser')}
                className={`rounded-md border px-2 py-1.5 text-xs flex items-center gap-1.5 cursor-pointer ${mode === 'laser' ? 'border-red-500 bg-red-600/15 text-white' : 'border-slate-700 text-slate-300 hover:bg-slate-800'}`}
              >
                <Flashlight size={14} /> Laser no mapa
              </button>
              <button
                type="button"
                onClick={() => setMode('graph')}
                className={`rounded-md border px-2 py-1.5 text-xs flex items-center gap-1.5 cursor-pointer ${mode === 'graph' ? 'border-emerald-500 bg-emerald-600/15 text-white' : 'border-slate-700 text-slate-300 hover:bg-slate-800'}`}
              >
                <ChartLine size={14} /> Gráfico e relatório
              </button>
            </div>
          </div>

          {trace && 'error' in trace && <div className="rounded-lg border border-red-600 bg-red-600/10 p-3 text-sm">{trace.error}</div>}

          {ok && (
            <>
              {ok.branches.map((b) => (
                <label key={b.key} className="block">
                  <span className="label">{b.label}: seguir pela saída</span>
                  <select className="input" value={b.chosen} onChange={(e) => setChoices((c) => ({ ...c, [b.key]: Number(e.target.value) }))}>
                    {b.outputs.map((o) => (
                      <option key={o} value={o}>
                        Saída {o}
                      </option>
                    ))}
                  </select>
                </label>
              ))}

              <div className="rounded-lg bg-slate-950 p-3 text-xs space-y-1">
                <div>
                  <span className="text-slate-400">Fibra até: </span>
                  <b>{OTDR_END_LABEL[ok.end.kind]}</b> a <b>{formatLength(ok.total)}</b>
                </div>
                <div className="text-slate-400">{ok.end.reason}</div>
                <div>
                  <span className="text-slate-400">Perda prevista: </span>
                  {ok.totalLoss.toFixed(2)} dB · {ok.events.length - 2} evento(s)
                </div>
              </div>

              {badDistance && <div className="text-sm text-amber-400">Distância inválida.</div>}
              {beyond && <div className="text-sm text-amber-400">A distância passa do fim da fibra ({formatLength(ok.total)}). Confira a fibra, o sentido ou a saída do splitter.</div>}
              {where && (
                <div className="rounded-lg border border-red-600 bg-red-600/10 p-3 text-xs space-y-1">
                  <div className="font-semibold text-red-300">Evento a {formatLength(meters!)}</div>
                  {where.span ? (
                    <div>
                      No cabo <b>{where.span.name}</b> (fibra {where.span.fiber}), a <b>{formatLength(where.fromStart!)}</b> de {where.span.fromNode} e{' '}
                      <b>{formatLength(where.toEnd!)}</b> de {where.span.toNode}.
                    </div>
                  ) : (
                    <div>Dentro de {network.nodes.find((n) => n.id === where.before?.nodeId)?.name ?? 'uma caixa'}.</div>
                  )}
                  <div className="text-slate-400">
                    Entre {where.before ? `${where.before.label} (${formatLength(where.before.at)})` : 'o disparo'} e{' '}
                    {where.after ? `${where.after.label} (${formatLength(where.after.at)})` : 'o fim'}.
                  </div>
                  {where.span && where.span.slack > 0 && (
                    <div className="text-amber-300">O trecho tem {formatLength(where.span.slack)} de reserva técnica: a posição no mapa é aproximada.</div>
                  )}
                </div>
              )}

              {mode === 'laser' ? (
                laser && (
                  <button type="button" className="btn-primary w-full" onClick={() => onFocus(laser.point)}>
                    <Crosshair size={16} /> {broken ? 'Ir ao ponto do rompimento' : 'Ir ao fim da fibra'}
                  </button>
                )
              ) : (
                <button type="button" className="btn-primary w-full" onClick={() => onReport(ok, broken ? meters : null)}>
                  <ChartLine size={16} /> Abrir gráfico e relatório
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
