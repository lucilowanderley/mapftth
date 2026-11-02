import { Box, Server } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { BudgetResult } from '../../lib/budget';
import { fiberColor } from '../../lib/catalog';
import { endKey, fusionSource, oltPortLabel, partner } from '../../lib/pop';
import type { Cable, Diagram, DiagramComponent, End } from '../../lib/types';

interface Props {
  diagram: Diagram;
  cables: Map<string, Cable>;
  focus: string | null;
  readOnly?: boolean;
  powerAt: (dioId: string, n: number) => BudgetResult;
  onPatch: (from: End, to: End | null) => void;
}

/** Vista de manobra: tabela porta a porta com a fusão de cada porta do DIO e o cordão até a OLT. */
export default function ManobraView({ diagram, cables, focus, readOnly, powerAt, onPatch }: Props) {
  const refs = useRef(new Map<string, HTMLElement>());
  useEffect(() => {
    if (focus) refs.current.get(focus)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [focus]);

  const dios = diagram.components.filter((c): c is Extract<DiagramComponent, { kind: 'dio' }> => c.kind === 'dio');
  const olts = diagram.components.filter((c): c is Extract<DiagramComponent, { kind: 'olt' }> => c.kind === 'olt');
  const actives = diagram.components.filter((c): c is Extract<DiagramComponent, { kind: 'active' }> => c.kind === 'active');
  const usedBy = new Map(diagram.connections.flatMap((c) => [[endKey(c.a), endKey(c.b)] as const, [endKey(c.b), endKey(c.a)] as const]));

  const ponOptions = olts.flatMap((o) =>
    Array.from({ length: o.slots * o.ports }, (_, i) => ({ end: { c: o.id, p: `p${i + 1}` }, label: `${o.name} · ${oltPortLabel(o, `p${i + 1}`)}` })),
  );
  const activeOptions = actives.flatMap((a) => Array.from({ length: a.ports }, (_, i) => ({ end: { c: a.id, p: `e${i + 1}` }, label: `${a.name} · porta ${i + 1}` })));

  function PatchSelect({ from, options }: { from: End; options: { end: End; label: string }[] }) {
    const current = usedBy.get(endKey(from)) ?? '';
    return (
      <select
        className="input py-1 text-xs"
        value={current}
        disabled={readOnly}
        onChange={(e) => {
          const v = e.target.value;
          const opt = options.find((o) => endKey(o.end) === v);
          onPatch(from, opt ? opt.end : null);
        }}
      >
        <option value="">— livre —</option>
        {current && !options.some((o) => endKey(o.end) === current) && <option value={current}>{current}</option>}
        {options.map((o) => {
          const k = endKey(o.end);
          const taken = usedBy.has(k) && k !== current;
          return (
            <option key={k} value={k} disabled={taken}>
              {o.label}
              {taken ? ' (ocupada)' : ''}
            </option>
          );
        })}
      </select>
    );
  }

  if (dios.length === 0 && olts.length === 0) {
    return <div className="h-full flex items-center justify-center text-sm text-slate-400">Adicione um DIO e uma OLT para montar a manobra.</div>;
  }

  return (
    <div className="h-full overflow-y-auto p-4 space-y-5">
      {dios.map((dio) => (
        <section key={dio.id} ref={(el) => void (el ? refs.current.set(dio.id, el) : refs.current.delete(dio.id))} className="rounded-xl border border-slate-800 bg-slate-900">
          <h3 className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-800 font-semibold">
            <Box size={16} className="text-sky-400" /> {dio.name}
            <span className="text-xs text-slate-400 font-normal">{dio.ports} portas</span>
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-slate-500">
                <tr className="text-left">
                  <th className="px-4 py-2 w-16">Porta</th>
                  <th className="px-2 py-2 w-20">Bandeja</th>
                  <th className="px-2 py-2">Fusão (fundo)</th>
                  <th className="px-2 py-2 w-64">Cordão (frente)</th>
                  <th className="px-4 py-2 w-28 text-right" title="Potência que sai do DIO para a fibra (antes do cabo)">Potência</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {Array.from({ length: dio.ports }, (_, i) => {
                  const n = i + 1;
                  const src = fusionSource(diagram, dio.id, n);
                  const cable = src ? cables.get(src.cable) : undefined;
                  const raw = partner(diagram, { c: dio.id, p: `a${n}` });
                  const patched = usedBy.has(`${dio.id}:b${n}`);
                  const power = src && patched ? powerAt(dio.id, n) : null;
                  return (
                    <tr key={n} className="hover:bg-slate-800/40">
                      <td className="px-4 py-1.5 font-mono font-semibold">{n}</td>
                      <td className="px-2 py-1.5 text-slate-400">T{Math.ceil(n / 12)}</td>
                      <td className="px-2 py-1.5">
                        {cable && src ? (
                          <span className="inline-flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ background: cable.color }} />
                            <span className="w-3 h-3 rounded-sm border border-slate-600" style={{ background: fiberColor(src.fiber, cable.fibers_per_tube).hex }} />
                            {cable.name} · fibra {src.fiber}
                            {src.splitter && <span className="text-xs text-violet-300">via splitter (saída {src.splitter.out})</span>}
                          </span>
                        ) : raw ? (
                          <span className="text-slate-400">{endKey(raw.other)}</span>
                        ) : (
                          <span className="text-slate-600">sem fusão</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        <PatchSelect from={{ c: dio.id, p: `b${n}` }} options={[...ponOptions, ...activeOptions]} />
                      </td>
                      <td className="px-4 py-1.5 text-right font-mono text-xs">
                        {power?.ok ? (
                          <span className="text-slate-200">{power.power!.toFixed(2)} dBm</span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {olts.map((olt) => {
        const total = olt.slots * olt.ports;
        const used = Array.from({ length: total }, (_, i) => usedBy.has(`${olt.id}:p${i + 1}`)).filter(Boolean).length;
        return (
          <section key={olt.id} ref={(el) => void (el ? refs.current.set(olt.id, el) : refs.current.delete(olt.id))} className="rounded-xl border border-slate-800 bg-slate-900">
            <h3 className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-800 font-semibold">
              <Server size={16} className="text-violet-400" /> {olt.name}
              <span className="text-xs text-slate-400 font-normal">
                PON em uso: {used}/{total} · TX {olt.tx_dbm} dBm
              </span>
            </h3>
            <div className="p-4 space-y-3">
              <div className="flex flex-wrap gap-1">
                {Array.from({ length: total }, (_, i) => {
                  const k = `${olt.id}:p${i + 1}`;
                  const to = usedBy.get(k);
                  return (
                    <span
                      key={k}
                      title={to ? `${oltPortLabel(olt, `p${i + 1}`)} → ${to}` : `${oltPortLabel(olt, `p${i + 1}`)} livre`}
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${to ? 'bg-violet-600 border-violet-400 text-white' : 'border-slate-700 text-slate-500'}`}
                    >
                      {oltPortLabel(olt, `p${i + 1}`)}
                    </span>
                  );
                })}
              </div>
              {(olt.uplinks ?? 0) > 0 && (
                <table className="text-sm">
                  <tbody>
                    {Array.from({ length: olt.uplinks ?? 0 }, (_, i) => (
                      <tr key={i}>
                        <td className="pr-3 py-1 font-mono text-amber-400">UP{i + 1}</td>
                        <td className="py-1 w-64">
                          <PatchSelect from={{ c: olt.id, p: `u${i + 1}` }} options={activeOptions} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
