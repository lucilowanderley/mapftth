import { ChevronDown, ChevronRight, Compass, Plus, RadioTower, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { distance } from '../lib/geo';
import { uid } from '../lib/pop';
import { RADIO_FREQS, RADIO_HOST_TYPES, RADIO_KINDS, bearing, fresnelClearance, radioBeam, radioSummary } from '../lib/tower';
import type { NetNode, RadioKind, TowerRadio } from '../lib/types';
import { formatLength } from './ui';

interface Props {
  node: NetNode;
  nodes: NetNode[];
  radios: TowerRadio[];
  onChange: (list: TowerRadio[]) => void;
  readOnly?: boolean;
}

const num = (v: string) => (v.trim() === '' ? undefined : Number(v.replace(',', '.')));

/** Lista de equipamentos wireless (rádios e antenas) da torre ou do POP, editada no painel do objeto. */
export default function RadiosEditor({ node, nodes, radios, onChange, readOnly }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const here: [number, number] = [node.lat, node.lng];
  // Outros objetos que podem ser a outra ponta de um enlace, do mais perto para o mais longe.
  const targets = nodes
    .filter((n) => n.id !== node.id && RADIO_HOST_TYPES.includes(n.type))
    .map((n) => ({ n, d: distance(here, [n.lat, n.lng]) }))
    .sort((a, b) => a.d - b.d);

  const set = (id: string, patch: Partial<TowerRadio>) => onChange(radios.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  function add() {
    const r: TowerRadio = { id: uid(), kind: 'ptp', azimuth: 0 };
    onChange([...radios, r]);
    setOpen(r.id);
  }

  function pointTo(r: TowerRadio, linkId?: number) {
    const t = targets.find((x) => x.n.id === linkId);
    set(r.id, { link: linkId, ...(t ? { azimuth: Math.round(bearing(here, [t.n.lat, t.n.lng]) * 10) / 10 } : {}) });
  }

  return (
    <div className="rounded-lg border border-slate-700">
      <div className="flex items-center gap-2 px-2.5 py-2 border-b border-slate-800">
        <RadioTower size={15} className="text-rose-400" />
        <span className="text-sm font-semibold">Equipamentos wireless</span>
        <span className="text-[11px] text-slate-500">{radios.length}</span>
        {!readOnly && (
          <button type="button" className="ml-auto flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 cursor-pointer" onClick={add}>
            <Plus size={13} /> Adicionar
          </button>
        )}
      </div>
      {radios.length === 0 && <div className="px-2.5 py-2 text-xs text-slate-500">Nenhum rádio ou antena. Use Adicionar para cadastrar enlaces PtP, bases PtMP e setoriais.</div>}
      {radios.map((r) => {
        const kind = RADIO_KINDS[r.kind] ?? RADIO_KINDS.other;
        const target = targets.find((x) => x.n.id === r.link);
        const expanded = open === r.id;
        return (
          <div key={r.id} className="border-b border-slate-800 last:border-0">
            <button type="button" className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-slate-800/60 cursor-pointer" onClick={() => setOpen(expanded ? null : r.id)}>
              {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: kind.color }} />
              <span className="truncate flex-1 min-w-0">{radioSummary(r)}</span>
              {target && <span className="text-[10px] text-sky-400 shrink-0">→ {target.n.name}</span>}
            </button>
            {expanded && (
              <fieldset disabled={readOnly} className="min-w-0 px-2.5 pb-2.5 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <label className="col-span-2 block">
                    <span className="label">Tipo</span>
                    <select className="input" value={r.kind} onChange={(e) => set(r.id, { kind: e.target.value as RadioKind, beam: undefined })}>
                      {(Object.keys(RADIO_KINDS) as RadioKind[]).map((k) => (
                        <option key={k} value={k}>
                          {RADIO_KINDS[k].label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="col-span-2 block">
                    <span className="label">Nome</span>
                    <input className="input" placeholder={kind.label} value={r.name ?? ''} onChange={(e) => set(r.id, { name: e.target.value || undefined })} />
                  </label>
                  <label className="block">
                    <span className="label">Fabricante</span>
                    <input className="input" placeholder="Ubiquiti" value={r.vendor ?? ''} onChange={(e) => set(r.id, { vendor: e.target.value || undefined })} />
                  </label>
                  <label className="block">
                    <span className="label">Modelo</span>
                    <input className="input" placeholder="airFiber 5XHD" value={r.model ?? ''} onChange={(e) => set(r.id, { model: e.target.value || undefined })} />
                  </label>
                  <label className="block">
                    <span className="label">Frequência (GHz)</span>
                    <input className="input" list="radio-freqs" inputMode="decimal" value={r.freq_ghz ?? ''} onChange={(e) => set(r.id, { freq_ghz: num(e.target.value) })} />
                  </label>
                  <label className="block">
                    <span className="label">Altura na torre (m)</span>
                    <input className="input" inputMode="decimal" value={r.height_m ?? ''} onChange={(e) => set(r.id, { height_m: num(e.target.value) })} />
                  </label>
                  <label className="block">
                    <span className="label">Azimute (°)</span>
                    <input
                      className="input"
                      inputMode="decimal"
                      value={r.azimuth ?? ''}
                      onChange={(e) => {
                        const v = num(e.target.value);
                        set(r.id, { azimuth: v === undefined ? undefined : ((v % 360) + 360) % 360 });
                      }}
                    />
                  </label>
                  <label className="block">
                    <span className="label">Abertura (°)</span>
                    <input className="input" inputMode="decimal" placeholder={String(kind.beam)} value={r.beam ?? ''} onChange={(e) => set(r.id, { beam: num(e.target.value) })} />
                  </label>
                  <label className="block">
                    <span className="label">Tilt (°)</span>
                    <input className="input" inputMode="decimal" placeholder="0" value={r.tilt ?? ''} onChange={(e) => set(r.id, { tilt: num(e.target.value) })} />
                  </label>
                  {(r.kind === 'ptp' || r.kind === 'dish' || r.kind === 'cpe' || r.link) && (
                    <label className="col-span-2 block">
                      <span className="label">Enlace com (outra ponta)</span>
                      <select className="input" value={r.link ?? ''} onChange={(e) => pointTo(r, e.target.value ? Number(e.target.value) : undefined)}>
                        <option value="">Sem enlace</option>
                        {targets.map(({ n, d }) => (
                          <option key={n.id} value={n.id}>
                            {n.name} · {formatLength(d)}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
                {target && (
                  <div className="rounded-md bg-slate-950/60 border border-slate-800 px-2 py-1.5 text-[11px] text-slate-400 space-y-0.5">
                    <div>
                      Distância: <b className="text-slate-200">{formatLength(target.d)}</b> · Azimute até {target.n.name}:{' '}
                      <b className="text-slate-200">{bearing(here, [target.n.lat, target.n.lng]).toFixed(1)}°</b>
                    </div>
                    {r.freq_ghz ? (
                      <div title="60% do raio da 1ª zona de Fresnel no meio do enlace">
                        Folga de Fresnel (60%) no meio: <b className="text-slate-200">{fresnelClearance(target.d, r.freq_ghz).toFixed(1)} m</b>
                      </div>
                    ) : null}
                    {typeof r.azimuth === 'number' && Math.abs(((r.azimuth - bearing(here, [target.n.lat, target.n.lng]) + 540) % 360) - 180) > radioBeam(r) / 2 && (
                      <div className="text-amber-400">O azimute não aponta para {target.n.name}.</div>
                    )}
                  </div>
                )}
                {!readOnly && (
                  <div className="flex items-center gap-3 text-xs">
                    {target && (
                      <button type="button" className="flex items-center gap-1 text-sky-400 hover:underline cursor-pointer" onClick={() => pointTo(r, r.link)}>
                        <Compass size={13} /> Apontar para {target.n.name}
                      </button>
                    )}
                    <button type="button" className="ml-auto flex items-center gap-1 text-red-400 hover:text-red-300 cursor-pointer" onClick={() => onChange(radios.filter((x) => x.id !== r.id))}>
                      <Trash2 size={13} /> Remover
                    </button>
                  </div>
                )}
              </fieldset>
            )}
          </div>
        );
      })}
      <datalist id="radio-freqs">
        {RADIO_FREQS.map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>
    </div>
  );
}
