import { Cylinder, History, MapPin, Plus, ScanSearch, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { api, errorMessage } from '../lib/api';
import { STATUSES } from '../lib/catalog';
import { DUCT_COLORS, DUCT_DIAMETERS, DUCT_MATERIALS, DUCT_PLACEMENTS, OCCUPANCY_COLORS, cableDiameter, cablesAlong, innerDiameter, occupancy, sharedFraction } from '../lib/duct';
import type { Cable, Duct, DuctMaterial, DuctPlacement, NetNode, Status } from '../lib/types';
import { Field, formatLength } from './ui';

interface Props {
  duct: Duct;
  cables: Cable[];
  nodes: NetNode[];
  readOnly: boolean;
  onClose: () => void;
  onSaved: (d: Duct, message?: string) => void;
  onDeleted: () => void;
  onSelectCable: (c: Cable) => void;
  onSelectNode: (n: NetNode) => void;
  onHistory: () => void;
  onError: (message: string) => void;
}

/** Painel do duto: características, cabos que passam por ele e ocupação. */
export default function DuctPanel({ duct, cables, nodes, readOnly, onClose, onSaved, onDeleted, onSelectCable, onSelectNode, onHistory, onError }: Props) {
  const [form, setForm] = useState({
    name: duct.name,
    material: duct.material,
    diameter_mm: duct.diameter_mm,
    subducts: duct.subducts,
    placement: duct.placement,
    depth_m: duct.depth_m,
    status: duct.status,
    color: duct.color,
    notes: duct.notes ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState('');
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  // A ocupação acompanha o que está sendo editado (diâmetro/subdutos), antes de salvar.
  const occ = occupancy({ ...duct, diameter_mm: form.diameter_mm, subducts: form.subducts }, cables);
  const inside = new Set(occ.cables.map((c) => c.id));
  const along = useMemo(() => cablesAlong(duct, cables).filter((c) => !inside.has(c.id)), [duct, cables]);
  // Para adicionar: cabos do projeto, os que correm pelo traçado primeiro.
  const candidates = useMemo(
    () =>
      cables
        .filter((c) => !inside.has(c.id))
        .map((c) => ({ c, f: sharedFraction(duct.path, c.path) }))
        .sort((a, b) => b.f - a.f || a.c.name.localeCompare(b.c.name)),
    [duct, cables],
  );
  const from = nodes.find((n) => n.id === duct.from_node_id);
  const to = nodes.find((n) => n.id === duct.to_node_id);

  async function save() {
    setSaving(true);
    try {
      onSaved(
        await api.updateDuct(duct.id, {
          ...form,
          name: form.name.trim() || duct.name,
          notes: form.notes || null,
          depth_m: form.placement === 'surface' ? null : form.depth_m,
        }),
        'Duto salvo',
      );
    } catch (e) {
      onError(errorMessage(e));
    }
    setSaving(false);
  }

  async function setCables(ids: number[], message: string) {
    try {
      onSaved(await api.updateDuct(duct.id, { cable_ids: ids }), message);
    } catch (e) {
      onError(errorMessage(e));
    }
  }

  async function remove() {
    if (!confirm(`Excluir o duto ${duct.name}? Os cabos que passam por ele não são afetados.`)) return;
    try {
      await api.deleteDuct(duct.id);
      onDeleted();
    } catch (e) {
      onError(errorMessage(e));
    }
  }

  const fillWidth = Math.min(100, occ.fill);

  return (
    <div className="inspector absolute top-3 left-3 z-[1000] panel w-80 max-h-[calc(100%-1.5rem)] overflow-y-auto overscroll-contain">
      <div className="sticky top-0 z-10 flex items-start justify-between px-4 py-2.5 border-b border-slate-800 bg-slate-900 rounded-t-xl">
        <div className="min-w-0">
          <div className="font-semibold truncate flex items-center gap-1.5">
            <Cylinder size={15} className="rotate-90 shrink-0" style={{ color: duct.color }} /> {duct.name}
          </div>
          <div className="text-xs text-slate-400">
            Duto · {DUCT_MATERIALS[duct.material]?.label} {duct.diameter_mm} mm{duct.subducts ? ` · ${duct.subducts} subdutos` : ''} · {formatLength(duct.length_m)}
          </div>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-white cursor-pointer" aria-label="Fechar">
          <X size={18} />
        </button>
      </div>

      <div className="px-4 py-3 space-y-2.5">
        {(from || to) && (
          <div className="text-xs text-slate-400 flex flex-wrap items-center gap-1">
            <MapPin size={12} />
            {from ? (
              <button className="text-slate-200 hover:text-emerald-300 cursor-pointer" onClick={() => onSelectNode(from)}>
                {from.name}
              </button>
            ) : (
              <span>ponta solta</span>
            )}
            <span>→</span>
            {to ? (
              <button className="text-slate-200 hover:text-emerald-300 cursor-pointer" onClick={() => onSelectNode(to)}>
                {to.name}
              </button>
            ) : (
              <span>ponta solta</span>
            )}
          </div>
        )}

        {/* Ocupação */}
        <div className="rounded-md border border-slate-800 bg-slate-950/60 p-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="label !mb-0">Ocupação</span>
            <span style={{ color: OCCUPANCY_COLORS[occ.level] }} className="font-semibold">
              {occ.subducts.total ? `${occ.cables.length}/${occ.subducts.total} subdutos` : `${occ.fill}% da seção`}
            </span>
          </div>
          {occ.subducts.total ? (
            <div className="flex gap-1 mt-1.5">
              {Array.from({ length: occ.subducts.total }, (_, i) => (
                <div
                  key={i}
                  className="flex-1 h-3 rounded-full border"
                  style={{ borderColor: duct.color, background: i < occ.subducts.used ? OCCUPANCY_COLORS[occ.level] : 'transparent' }}
                  title={i < occ.subducts.used ? occ.cables[i]?.name : 'Livre'}
                />
              ))}
            </div>
          ) : (
            <div className="relative h-2 mt-1.5 rounded-full bg-slate-800 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${fillWidth}%`, background: OCCUPANCY_COLORS[occ.level] }} />
              <div className="absolute top-0 bottom-0 w-px bg-slate-300" style={{ left: `${occ.limit}%` }} title={`Limite recomendado: ${occ.limit}%`} />
            </div>
          )}
          <div className="text-[11px] text-slate-400 mt-1">{occ.message}</div>
          {!occ.subducts.total && occ.cables.length > 0 && (
            <div className="text-[10px] text-slate-500 mt-0.5">
              Estimativa: interno ≈ {Math.round(innerDiameter({ ...duct, diameter_mm: form.diameter_mm }))} mm, cabos pelo nº de fibras.
            </div>
          )}
        </div>

        {/* Cabos no duto */}
        <div>
          <div className="label">Cabos no duto ({occ.cables.length})</div>
          {occ.cables.length === 0 && <div className="text-xs text-slate-500">Nenhum cabo passa por este duto ainda.</div>}
          <ul className="space-y-1">
            {occ.cables.map((c) => (
              <li key={c.id} className="flex items-center gap-2 rounded bg-slate-800/60 px-2 py-1 text-xs">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.color }} />
                <button className="truncate text-left hover:text-emerald-300 cursor-pointer flex-1" onClick={() => onSelectCable(c)} title="Selecionar o cabo">
                  {c.name}
                </button>
                <span className="text-slate-500 shrink-0">
                  {c.fiber_count}FO · ⌀{cableDiameter(c)} mm
                </span>
                {!readOnly && (
                  <button
                    className="text-slate-500 hover:text-red-400 cursor-pointer"
                    title="Tirar do duto"
                    onClick={() => setCables((duct.cable_ids ?? []).filter((id) => id !== c.id), `${c.name} retirado de ${duct.name}`)}
                  >
                    <X size={13} />
                  </button>
                )}
              </li>
            ))}
          </ul>
          {!readOnly && (
            <div className="mt-1.5 space-y-1.5">
              {along.length > 0 && (
                <button
                  className="btn-ghost w-full !py-1 text-xs"
                  onClick={() => setCables([...(duct.cable_ids ?? []), ...along.map((c) => c.id)], `${along.length} cabo${along.length > 1 ? 's' : ''} colocado${along.length > 1 ? 's' : ''} em ${duct.name}`)}
                  title={along.map((c) => c.name).join(', ')}
                >
                  <ScanSearch size={14} /> Passar cabos do traçado ({along.length})
                </button>
              )}
              <div className="flex gap-1">
                <select className="input !py-1 text-xs flex-1" value={adding} onChange={(e) => setAdding(e.target.value)}>
                  <option value="">Adicionar cabo…</option>
                  {candidates.map(({ c, f }) => (
                    <option key={c.id} value={c.id}>
                      {c.name} · {c.fiber_count}FO{f >= 0.5 ? ' · no traçado' : ''}
                    </option>
                  ))}
                </select>
                <button
                  className="btn-primary !py-1 !px-2"
                  disabled={!adding}
                  title="Passar pelo duto"
                  onClick={() => {
                    const c = cables.find((x) => x.id === Number(adding));
                    setAdding('');
                    if (c) setCables([...(duct.cable_ids ?? []), c.id], `${c.name} passa por ${duct.name}`);
                  }}
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
          )}
        </div>

        <Field label="Nome">
          <input className="input" value={form.name} disabled={readOnly} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Material">
            <select className="input" value={form.material} disabled={readOnly} onChange={(e) => set('material', e.target.value as DuctMaterial)}>
              {(Object.keys(DUCT_MATERIALS) as DuctMaterial[]).map((k) => (
                <option key={k} value={k} title={DUCT_MATERIALS[k].hint}>
                  {DUCT_MATERIALS[k].label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Diâmetro (mm)">
            <input
              className="input"
              type="number"
              min={10}
              max={1000}
              list="duct-diameters"
              value={form.diameter_mm}
              disabled={readOnly}
              onChange={(e) => set('diameter_mm', Math.max(0, Math.round(Number(e.target.value) || 0)))}
            />
            <datalist id="duct-diameters">
              {DUCT_DIAMETERS.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          </Field>
          <Field label="Subdutos">
            <input
              className="input"
              type="number"
              min={0}
              max={24}
              value={form.subducts}
              disabled={readOnly}
              onChange={(e) => set('subducts', Math.max(0, Math.min(24, Math.round(Number(e.target.value) || 0))))}
              title="0 = duto simples; tritubo = 3"
            />
          </Field>
          <Field label="Status">
            <select className="input" value={form.status} disabled={readOnly} onChange={(e) => set('status', e.target.value as Status)}>
              {(Object.keys(STATUSES) as Status[]).map((s) => (
                <option key={s} value={s}>
                  {STATUSES[s].label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-[1fr_5.5rem] gap-2">
          <Field label="Instalação">
            <select className="input" value={form.placement} disabled={readOnly} onChange={(e) => set('placement', e.target.value as DuctPlacement)}>
              {(Object.keys(DUCT_PLACEMENTS) as DuctPlacement[]).map((k) => (
                <option key={k} value={k} title={DUCT_PLACEMENTS[k].hint}>
                  {DUCT_PLACEMENTS[k].label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Profund. (m)">
            <input
              className="input"
              type="number"
              min={0}
              step={0.1}
              value={form.placement === 'surface' ? '' : (form.depth_m ?? '')}
              disabled={readOnly || form.placement === 'surface'}
              placeholder={form.placement === 'surface' ? '—' : '0,6'}
              onChange={(e) => set('depth_m', e.target.value === '' ? null : Math.max(0, Number(e.target.value)))}
            />
          </Field>
        </div>
        <Field label="Cor">
          <div className="flex gap-1.5">
            {DUCT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                disabled={readOnly}
                onClick={() => set('color', c)}
                className={`w-5 h-5 rounded-full border-2 cursor-pointer ${form.color === c ? 'border-yellow-400' : 'border-slate-700'}`}
                style={{ background: c }}
                aria-label={c}
              />
            ))}
          </div>
        </Field>
        <Field label="Observações">
          <textarea className="input" rows={2} value={form.notes} disabled={readOnly} onChange={(e) => set('notes', e.target.value)} />
        </Field>

        <div className="sticky bottom-0 z-10 -mx-4 -mb-3 flex gap-2 border-t border-slate-800 bg-slate-900 px-4 py-2.5 rounded-b-xl">
          {!readOnly && (
            <button className="btn-danger" onClick={remove} title="Excluir">
              <Trash2 size={16} />
            </button>
          )}
          <button type="button" className="btn-ghost" onClick={onHistory} title="Histórico de alterações">
            <History size={16} />
          </button>
          {!readOnly && (
            <button className="btn-primary flex-1" onClick={save} disabled={saving}>
              Salvar duto
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
