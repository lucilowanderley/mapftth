import { ChevronDown, GitFork, Layers, Link2, Plus, Spline, Trash2, Wand2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DIO_TRAY, fiberColor, splitterModel, tubeColor } from '../../lib/catalog';
import { endKey, fusionSource, partner, sameEnd, uid } from '../../lib/pop';
import type { Cable, Diagram, DiagramComponent, End } from '../../lib/types';
import { SplitterDialog } from '../DiagramEditor';
import { textOn } from './geometry';

type Dio = Extract<DiagramComponent, { kind: 'dio' }>;

interface Props {
  dio: Dio;
  diagram: Diagram;
  /** Cabos vinculados a este DIO, na ordem. */
  cables: Cable[];
  readOnly?: boolean;
  onChange: (fn: (d: Diagram) => Diagram) => void;
  onLinkCables: () => void;
  onAutoFuse: () => void;
  onClose: () => void;
}

/**
 * Matriz de fusão do DIO: fibras dos cabos vinculados (e saídas de splitters) à esquerda,
 * bandejas com as portas do DIO à direita. Clique na origem e depois no destino para fundir.
 */
export default function FusionMatrix({ dio, diagram, cables, readOnly, onChange, onLinkCables, onAutoFuse, onClose }: Props) {
  const [source, setSource] = useState<End | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [addSplitter, setAddSplitter] = useState(false);
  const [msg, setMsg] = useState('');

  const splitters = diagram.components.filter(
    (c): c is Extract<DiagramComponent, { kind: 'splitter' }> => c.kind === 'splitter' && (c.dio === dio.id || !c.dio),
  );
  const used = useMemo(() => new Map(diagram.connections.flatMap((c) => [[endKey(c.a), c] as const, [endKey(c.b), c] as const])), [diagram.connections]);
  const cableByKey = new Map(cables.map((c) => [`c${c.id}`, c]));
  const fused = Array.from({ length: dio.ports }, (_, i) => fusionSource(diagram, dio.id, i + 1)).filter(Boolean).length;

  const toggle = (k: string) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  function describe(e: End): string {
    const cable = cableByKey.get(e.c);
    if (cable) return `${cable.name} · fibra ${e.p.slice(1)} (${fiberColor(Number(e.p.slice(1)), cable.fibers_per_tube).name})`;
    if (e.c === dio.id) return `${dio.name} · porta ${e.p.slice(1)}`;
    const s = splitters.find((x) => x.id === e.c);
    if (s) return `${s.name || splitterModel(s.model).name} · ${e.p === 'in' ? 'entrada' : `saída ${e.p.slice(1)}`}`;
    return `${e.c} ${e.p}`;
  }

  /** Clique num item já ligado desfaz a fusão; num item livre, seleciona ou funde. */
  function clickEnd(e: End, role: 'source' | 'target') {
    if (readOnly) return;
    setMsg('');
    const conn = used.get(endKey(e));
    if (conn) {
      const other = sameEnd(conn.a, e) ? conn.b : conn.a;
      if (confirm(`Desfazer a fusão ${describe(e)} ↔ ${describe(other)}?`)) {
        onChange((d) => ({ ...d, connections: d.connections.filter((c) => c.id !== conn.id) }));
      }
      setSource(null);
      return;
    }
    if (role === 'source') {
      setSource((s) => (s && sameEnd(s, e) ? null : e));
      return;
    }
    if (!source) {
      setMsg('Primeiro clique numa fibra ou numa saída de splitter.');
      return;
    }
    if (source.c === e.c) {
      setMsg('Não é possível fundir duas portas do mesmo splitter.');
      return;
    }
    if (e.p === 'in' && !/^c\d+$/.test(source.c)) {
      setMsg('A entrada do splitter recebe uma fibra de cabo.');
      return;
    }
    const a = source;
    onChange((d) => ({ ...d, connections: [...d.connections, { id: uid(), a, b: e }] }));
    setSource(null);
  }

  const isSel = (e: End) => !!source && sameEnd(source, e);

  function removeSplitter(id: string) {
    if (!confirm('Excluir este splitter e as fusões dele?')) return;
    onChange((d) => ({
      ...d,
      components: d.components.filter((c) => c.id !== id),
      connections: d.connections.filter((c) => c.a.c !== id && c.b.c !== id),
    }));
  }

  return (
    <div className="fixed inset-0 z-[1800] flex flex-col bg-slate-950">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-slate-800 bg-slate-900">
        <div className="flex items-center gap-2 mr-3">
          <div className="w-8 h-8 rounded-lg bg-sky-500/15 text-sky-400 flex items-center justify-center">
            <Layers size={17} />
          </div>
          <div>
            <div className="font-semibold leading-tight">{dio.name}</div>
            <div className="text-[11px] text-slate-400">Matriz de fusão</div>
          </div>
        </div>
        {!readOnly && (
          <button className="btn-ghost py-1.5 text-xs" onClick={onLinkCables}>
            <Link2 size={14} /> Vincular cabos <span className="rounded bg-slate-700 px-1.5">{cables.length}</span>
          </button>
        )}
        <span className="text-xs text-slate-400 ml-2">
          {fused}/{dio.ports} portas fundidas
        </span>
        <div className="ml-auto flex items-center gap-2">
          {!readOnly && (
            <button className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium cursor-pointer bg-amber-500 hover:bg-amber-400 text-slate-950" onClick={onAutoFuse}>
              <Wand2 size={14} /> Auto Fusão
            </button>
          )}
          <button className="btn-primary py-1.5 text-xs" onClick={onClose}>
            Concluir
          </button>
          <button onClick={onClose} className="text-slate-400 hover:text-white cursor-pointer ml-1" aria-label="Fechar">
            <X size={20} />
          </button>
        </div>
      </div>
      <div className="px-4 py-2 text-xs text-slate-400 border-b border-slate-800 flex items-center gap-3">
        <span>Clique numa fibra (ou saída de splitter) e depois numa porta do DIO para fundir. Clique num item já fundido para desfazer.</span>
        {source && (
          <span className="rounded bg-amber-400/15 text-amber-300 px-2 py-0.5">
            Selecionado: {describe(source)}
          </span>
        )}
        {msg && <span className="text-red-400">{msg}</span>}
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(280px,1.1fr)_minmax(220px,0.8fr)_minmax(320px,1.3fr)] divide-y lg:divide-y-0 lg:divide-x divide-slate-800 overflow-y-auto lg:overflow-hidden">
        {/* Cabos vinculados */}
        <section className="flex flex-col min-h-0">
          <ColumnTitle icon={<Spline size={14} />} title="Cabos vinculados" badge={cables.length} color="text-sky-400" />
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {cables.length === 0 && (
              <Empty icon={<Link2 size={18} />} title="Nenhum cabo vinculado" text="Use “Vincular cabos” para escolher os cabos que entram neste DIO." />
            )}
            {cables.map((c) => {
              const key = `c${c.id}`;
              const usedHere = Array.from({ length: c.fiber_count }, (_, i) => used.get(`${key}:f${i + 1}`)).filter(Boolean).length;
              const tubes = Math.ceil(c.fiber_count / Math.max(1, c.fibers_per_tube));
              return (
                <div key={key} className="rounded-lg border border-slate-800 bg-slate-900">
                  <button onClick={() => toggle(key)} className="w-full flex items-center gap-2 px-3 py-2 cursor-pointer">
                    <span className="w-7 h-7 rounded-md flex items-center justify-center" style={{ background: `${c.color}26`, color: c.color }}>
                      <Spline size={14} />
                    </span>
                    <span className="text-left min-w-0 flex-1">
                      <span className="block text-sm font-semibold truncate">{c.name}</span>
                      <span className="block text-[11px] text-slate-500">
                        {c.fiber_count} FO · {usedHere}/{c.fiber_count} em uso
                      </span>
                    </span>
                    <ChevronDown size={16} className={`text-slate-500 transition ${collapsed.has(key) ? '-rotate-90' : ''}`} />
                  </button>
                  {!collapsed.has(key) && (
                    <div className="px-3 pb-3 space-y-2">
                      {Array.from({ length: tubes }, (_, t) => {
                        const tc = tubeColor(t * c.fibers_per_tube + 1, c.fibers_per_tube);
                        const first = t * c.fibers_per_tube + 1;
                        const last = Math.min(c.fiber_count, first + c.fibers_per_tube - 1);
                        return (
                          <div key={t} className="rounded-md overflow-hidden border border-slate-800">
                            <div className="px-2 py-0.5 text-[10px] font-bold" style={{ background: tc.hex, color: textOn(tc.hex) }}>
                              T{t + 1} · {tc.name}
                            </div>
                            <div className="flex flex-wrap gap-1 p-1.5 bg-slate-950">
                              {Array.from({ length: last - first + 1 }, (_, j) => {
                                const f = first + j;
                                const end = { c: key, p: `f${f}` };
                                const fc = fiberColor(f, c.fibers_per_tube);
                                const conn = used.get(endKey(end));
                                const otherHere = conn && [conn.a, conn.b].some((x) => x.c === dio.id || splitters.some((s) => s.id === x.c));
                                return (
                                  <button
                                    key={f}
                                    title={`${describe(end)}${conn ? ' · fundida (clique para desfazer)' : ''}`}
                                    onClick={() => clickEnd(end, 'source')}
                                    disabled={!!conn && !otherHere}
                                    className={`relative w-8 h-8 rounded text-[11px] font-bold cursor-pointer transition disabled:cursor-not-allowed ${
                                      isSel(end) ? 'ring-2 ring-amber-300 scale-110' : ''
                                    } ${conn ? 'opacity-40' : 'hover:scale-105'}`}
                                    style={{ background: fc.hex, color: textOn(fc.hex), border: '1px solid #334155' }}
                                  >
                                    {f}
                                    {conn && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 border border-slate-950" />}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Splitters */}
        <section className="flex flex-col min-h-0">
          <div className="flex items-center shrink-0">
            <ColumnTitle grow icon={<GitFork size={14} />} title="Splitters" badge={splitters.length} color="text-violet-400" />
            {!readOnly && (
              <button
                onClick={() => setAddSplitter(true)}
                className="mr-3 inline-flex items-center gap-1 rounded-md bg-violet-600 hover:bg-violet-500 px-2 py-1 text-[11px] font-medium cursor-pointer"
              >
                <Plus size={13} /> Adicionar
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {splitters.length === 0 && <Empty icon={<GitFork size={18} />} title="Nenhum splitter" text="Adicione um splitter para dividir uma fibra em várias portas do DIO." />}
            {splitters.map((s) => {
              const m = splitterModel(s.model);
              const inEnd = { c: s.id, p: 'in' };
              const inLink = partner(diagram, inEnd);
              const inCable = inLink && cableByKey.get(inLink.other.c);
              const inColor = inCable ? fiberColor(Number(inLink!.other.p.slice(1)), inCable.fibers_per_tube).hex : undefined;
              return (
                <div key={s.id} className="rounded-lg border border-slate-800 bg-slate-900 p-2.5">
                  <div className="flex items-center gap-2 mb-2">
                    <GitFork size={14} className="text-violet-400" />
                    <span className="text-sm font-semibold flex-1 truncate">{s.name || m.name}</span>
                    {!readOnly && (
                      <button onClick={() => removeSplitter(s.id)} className="text-slate-500 hover:text-red-400 cursor-pointer" title="Excluir splitter">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  <button
                    onClick={() => clickEnd(inEnd, 'target')}
                    title={inLink ? `Entrada: ${describe(inLink.other)} (clique para desfazer)` : 'Entrada: clique depois de escolher uma fibra'}
                    className={`w-full flex items-center gap-2 rounded border px-2 py-1 text-xs mb-2 cursor-pointer ${
                      inLink ? 'border-slate-700' : source ? 'border-amber-400/70 border-dashed' : 'border-slate-700 border-dashed'
                    }`}
                  >
                    <span className="w-3 h-3 rounded-full border border-slate-600" style={{ background: inColor ?? 'transparent' }} />
                    {inLink ? describe(inLink.other) : 'Entrada livre'}
                  </button>
                  <div className="flex flex-wrap gap-1">
                    {Array.from({ length: m.outputs }, (_, i) => {
                      const end = { c: s.id, p: `o${i + 1}` };
                      const conn = used.get(endKey(end));
                      const other = conn ? (sameEnd(conn.a, end) ? conn.b : conn.a) : null;
                      return (
                        <button
                          key={i}
                          onClick={() => clickEnd(end, 'source')}
                          title={other ? `Saída ${i + 1} → ${describe(other)} (clique para desfazer)` : `Saída ${i + 1}`}
                          className={`w-8 h-7 rounded border text-[10px] font-semibold cursor-pointer ${
                            isSel(end) ? 'ring-2 ring-amber-300' : ''
                          } ${conn ? 'bg-violet-600 border-violet-400 text-white' : 'border-violet-500/50 text-violet-300 hover:bg-violet-500/10'}`}
                        >
                          {other && other.c === dio.id ? `P${other.p.slice(1)}` : i + 1}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Bandejas */}
        <section className="flex flex-col min-h-0">
          <ColumnTitle icon={<Layers size={14} />} title="Bandejas" badge={`${dio.ports}P`} color="text-amber-400" />
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {Array.from({ length: Math.ceil(dio.ports / DIO_TRAY) }, (_, t) => {
              const tk = `t${t}`;
              const first = t * DIO_TRAY + 1;
              const last = Math.min(dio.ports, first + DIO_TRAY - 1);
              return (
                <div key={tk} className="rounded-lg border border-slate-800 bg-slate-900">
                  <button onClick={() => toggle(tk)} className="w-full flex items-center gap-2 px-3 py-2 cursor-pointer text-xs font-semibold uppercase tracking-wide">
                    <Layers size={13} className="text-slate-400" /> Bandeja {t + 1}
                    <span className="ml-auto text-slate-500 normal-case font-normal">
                      portas {first}–{last}
                    </span>
                    <ChevronDown size={15} className={`text-slate-500 transition ${collapsed.has(tk) ? '-rotate-90' : ''}`} />
                  </button>
                  {!collapsed.has(tk) && (
                    <div className="flex flex-wrap gap-1.5 px-3 pb-3">
                      {Array.from({ length: last - first + 1 }, (_, j) => {
                        const n = first + j;
                        const end = { c: dio.id, p: `a${n}` };
                        const src = fusionSource(diagram, dio.id, n);
                        const link = partner(diagram, end);
                        const cable = src && cableByKey.get(src.cable);
                        const fc = cable ? fiberColor(src!.fiber, cable.fibers_per_tube).hex : link ? '#64748b' : undefined;
                        return (
                          <button
                            key={n}
                            onClick={() => clickEnd(end, 'target')}
                            title={link ? `Porta ${n} ← ${describe(link.other)} (clique para desfazer)` : `Porta ${n} livre`}
                            className={`relative w-10 h-10 rounded-md border text-xs font-semibold cursor-pointer transition ${
                              link ? '' : source ? 'border-amber-400/60 border-dashed hover:bg-amber-400/10' : 'border-slate-700 hover:border-slate-500'
                            }`}
                            style={fc ? { background: fc, color: textOn(fc), borderColor: '#334155' } : undefined}
                          >
                            {n}
                            {cable && (
                              <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-slate-900" style={{ background: cable.color }} title={cable.name} />
                            )}
                            {src?.splitter && <GitFork size={9} className="absolute bottom-0.5 right-0.5" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {addSplitter && (
        <SplitterDialog
          onClose={() => setAddSplitter(false)}
          onPick={(model) => {
            onChange((d) => ({ ...d, components: [...d.components, { id: uid(), kind: 'splitter', model, dio: dio.id, x: 0, y: 0 }] }));
            setAddSplitter(false);
          }}
        />
      )}
    </div>
  );
}

function ColumnTitle({ icon, title, badge, color, grow }: { icon: React.ReactNode; title: string; badge: number | string; color: string; grow?: boolean }) {
  return (
    <div className={`${grow ? 'flex-1' : ''} shrink-0 flex items-center gap-2 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-300`}>
      <span className={color}>{icon}</span>
      {title}
      <span className="ml-auto rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">{badge}</span>
    </div>
  );
}

function Empty({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="flex flex-col items-center text-center py-10 px-4 text-slate-500">
      <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center mb-2">{icon}</div>
      <div className="text-sm font-medium text-slate-300">{title}</div>
      <div className="text-xs mt-1">{text}</div>
    </div>
  );
}
