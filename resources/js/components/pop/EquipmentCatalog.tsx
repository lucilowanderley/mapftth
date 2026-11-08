import { BookOpen, ImagePlus, Pencil, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, errorMessage } from '../../lib/api';
import { ACTIVE_TYPES, BUILTIN_EQUIPMENT, EQUIPMENT_KINDS, equipmentLabel } from '../../lib/catalog';
import type { EquipmentModel } from '../../lib/types';
import { Field } from '../ui';
import { PriceInput, usePriceItems } from '../PriceCatalog';
import { equipmentKey, formatBRL } from '../../lib/pricing';
import { PopDialog } from './dialogs';
import { PortGroupsEditor } from './ActiveFields';
import { groupsTotal, speedLabel } from '../../lib/pop';

type Kind = EquipmentModel['kind'];

/**
 * Modelos padrão + cadastrados (do usuário e do dono do projeto). Um padrão editado aparece
 * só na versão editada; um padrão excluído fica oculto (e pode ser restaurado).
 */
export function mergeModels(saved: EquipmentModel[]): { models: EquipmentModel[]; hidden: EquipmentModel[] } {
  const replaced = new Set(saved.filter((m) => m.replaces).map((m) => m.replaces));
  return {
    models: [...BUILTIN_EQUIPMENT.filter((b) => !replaced.has(String(b.id))), ...saved.filter((m) => !m.hidden)],
    hidden: saved.filter((m) => m.hidden),
  };
}

export function useEquipmentModels(projectId?: number) {
  const [saved, setSaved] = useState<EquipmentModel[]>([]);
  const reload = useCallback(() => {
    api
      .equipmentModels(projectId)
      .then(setSaved)
      .catch(() => setSaved([]));
  }, [projectId]);
  useEffect(reload, [reload]);
  return { ...mergeModels(saved), reload };
}

/** Campos enviados ao servidor (sem id, flags de exibição etc.). */
function payload(m: Partial<EquipmentModel>): Partial<EquipmentModel> {
  const { kind, vendor, model, type, ports, slots, uplinks, tx_dbm, height_u, port_groups, notes, replaces, hidden } = m;
  return { kind, vendor, model, type, ports, slots, uplinks, tx_dbm, height_u, port_groups, notes, replaces: replaces ?? null, hidden: !!hidden };
}

const EMPTY = (kind: Kind): Partial<EquipmentModel> => ({
  kind,
  vendor: '',
  model: '',
  ports: kind === 'olt' ? 16 : kind === 'dio' ? 24 : 24,
  slots: kind === 'olt' ? 1 : null,
  uplinks: kind === 'olt' ? 4 : null,
  tx_dbm: kind === 'olt' ? 5 : null,
  type: kind === 'active' ? ACTIVE_TYPES[0] : null,
  height_u: 1,
});

/** Cadastro de equipamentos: fabricante, modelo, portas e altura em U de OLTs, DIOs e ativos. */
export default function EquipmentCatalog({
  models,
  hidden = [],
  initialKind = 'olt',
  readOnly,
  projectId,
  onChanged,
  onClose,
}: {
  models: EquipmentModel[];
  hidden?: EquipmentModel[];
  initialKind?: Kind;
  readOnly?: boolean;
  /** Projeto aberto: mostra o valor de mercado da tabela de preços do dono do projeto. */
  projectId?: number;
  onChanged: () => void;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<Kind>(initialKind);
  const [form, setForm] = useState<Partial<EquipmentModel> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Valor de mercado (cadastro de preços), pela chave do modelo. `price` = valor digitado no formulário.
  const priceTable = usePriceItems(projectId);
  const priceOf = (m: EquipmentModel) => priceTable.prices.find((p) => p.key === equipmentKey(m))?.price ?? 0;
  const [price, setPrice] = useState(0);
  // Foto escolhida (enviada ao salvar) ou foto atual marcada para remover.
  const [photo, setPhoto] = useState<File | null>(null);
  const [dropPhoto, setDropPhoto] = useState(false);
  const photoUrl = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  useEffect(() => () => void (photoUrl && URL.revokeObjectURL(photoUrl)), [photoUrl]);
  useEffect(() => {
    setPhoto(null);
    setDropPhoto(false);
    setPrice(form ? priceOf(form as EquipmentModel) : 0);
  }, [form?.id, form?.replaces, !!form]);
  const list = models.filter((m) => m.kind === kind);
  const set = (patch: Partial<EquipmentModel>) => setForm((f) => (f ? { ...f, ...patch } : f));
  const int = (v: string, min = 0) => Math.max(min, Math.round(Number(v)) || min);

  async function save() {
    if (!form) return;
    setBusy(true);
    setError(null);
    try {
      const saved = typeof form.id === 'number' ? await api.updateEquipmentModel(form.id, payload(form)) : await api.createEquipmentModel(payload(form));
      if (typeof saved.id === 'number') {
        if (photo) await api.uploadEquipmentImage(saved.id, photo);
        else if (dropPhoto && saved.image_url) await api.deleteEquipmentImage(saved.id);
        const key = equipmentKey(saved);
        const current = priceTable.prices.find((p) => p.key === key)?.price ?? 0;
        if (price !== current)
          await api.savePriceItem({ key, category: saved.kind === 'dio' ? 'passive' : 'active', name: `${saved.kind === 'olt' ? 'OLT ' : ''}${equipmentLabel(saved)}`, unit: 'un', price, notes: null });
        priceTable.reload();
      }
      setForm(null);
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    }
    setBusy(false);
  }

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  /** Excluir: cadastrado = apaga; padrão (ou padrão editado) = oculta para você e a equipe. */
  function remove(m: EquipmentModel) {
    if (!confirm(`Excluir o modelo ${equipmentLabel(m)} do cadastro? Equipamentos já criados não mudam.`)) return;
    if (m.builtin) return run(() => api.createEquipmentModel(payload({ ...m, replaces: String(m.id), hidden: true })));
    if (typeof m.id !== 'number') return;
    if (m.replaces) return run(() => api.updateEquipmentModel(m.id as number, payload({ ...m, hidden: true })));
    return run(() => api.deleteEquipmentModel(m.id as number));
  }

  /** Volta o padrão original (desfaz edição ou exclusão). */
  function restore(m: EquipmentModel) {
    if (typeof m.id === 'number') run(() => api.deleteEquipmentModel(m.id as number));
  }

  /** Editar um padrão cria a sua versão dele (mesma chave: os equipamentos continuam vinculados). */
  const edit = (m: EquipmentModel) => setForm(m.builtin ? { ...m, id: undefined, builtin: undefined, replaces: String(m.id) } : { ...m });
  const hiddenHere = hidden.filter((m) => m.kind === kind);

  const detail = (m: EquipmentModel) =>
    m.kind === 'olt'
      ? `${m.slots ?? 1}×${m.ports} PON · ${m.uplinks ?? 0} uplinks`
      : m.kind === 'dio'
        ? `${m.ports} portas`
        : `${m.type ?? 'Ativo'} · ${m.port_groups?.length ? m.port_groups.map((g) => `${g.count}×${g.type}${g.speed ? ` ${speedLabel(g.speed)}` : ''}`).join(' + ') : `${m.ports} portas`}`;

  return (
    <PopDialog icon={<BookOpen size={18} />} title="Cadastro de equipamentos" subtitle="Fabricante, modelo, portas e quantas U de rack ocupa" onClose={onClose} width="max-w-2xl">
      <div className="flex gap-1 mb-3 rounded-lg bg-slate-950 border border-slate-800 p-0.5 w-fit">
        {(Object.keys(EQUIPMENT_KINDS) as Kind[]).map((k) => (
          <button
            key={k}
            onClick={() => {
              setKind(k);
              setForm(null);
            }}
            className={`rounded-md px-3 py-1.5 text-xs font-medium cursor-pointer ${kind === k ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            {EQUIPMENT_KINDS[k]} ({models.filter((m) => m.kind === k).length})
          </button>
        ))}
      </div>

      <div className="max-h-72 overflow-y-auto rounded-md border border-slate-800">
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase tracking-wide text-slate-500 text-left bg-slate-950 sticky top-0">
            <tr>
              <th className="px-3 py-2">Fabricante / modelo</th>
              <th>Características</th>
              <th className="text-center">Altura</th>
              <th className="text-right">Valor de mercado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map((m) => (
              <tr key={String(m.id)} className="border-t border-slate-800">
                <td className="px-3 py-1.5">
                  <div className="flex items-center gap-2.5">
                    <ModelPhoto model={m} size={40} />
                    <div className="min-w-0">
                      <div className="font-medium">{m.model}</div>
                      <div className="text-[11px] text-slate-500">{m.vendor || '—'}</div>
                    </div>
                  </div>
                </td>
                <td className="text-xs text-slate-400">{detail(m)}</td>
                <td className="text-center font-mono">{m.height_u}U</td>
                <td className="text-right font-mono text-xs">{priceOf(m) ? formatBRL(priceOf(m)) : <span className="text-slate-600">—</span>}</td>
                <td className="pr-2 text-right whitespace-nowrap">
                  {(m.builtin || m.replaces) && <span className="text-[10px] uppercase text-slate-500 mr-1">{m.builtin ? 'padrão' : 'padrão editado'}</span>}
                  {(m.builtin || m.own) && !readOnly ? (
                    <>
                      <button title={m.builtin ? 'Editar (cria a sua versão do padrão)' : 'Editar'} className="p-1.5 text-slate-400 hover:text-white cursor-pointer" onClick={() => edit(m)}>
                        <Pencil size={13} />
                      </button>
                      {m.replaces && (
                        <button title="Restaurar o padrão original" className="p-1.5 text-slate-400 hover:text-white cursor-pointer" onClick={() => restore(m)}>
                          <RotateCcw size={13} />
                        </button>
                      )}
                      <button title="Excluir" className="p-1.5 text-slate-400 hover:text-red-400 cursor-pointer" onClick={() => remove(m)}>
                        <Trash2 size={13} />
                      </button>
                    </>
                  ) : (
                    !m.builtin && <span className="text-[10px] uppercase text-slate-500">do dono</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!form && !readOnly && (
        <button className="btn-ghost mt-3" onClick={() => setForm(EMPTY(kind))}>
          <Plus size={15} /> Cadastrar {kind === 'active' ? 'ativo' : EQUIPMENT_KINDS[kind]}
        </button>
      )}

      {form && (
        <div className="mt-3 rounded-lg border border-slate-700 p-3 space-y-3">
          <div className="text-xs font-semibold text-slate-300">
            {typeof form.id === 'number' || form.replaces ? 'Editar modelo' : `Novo modelo de ${kind === 'active' ? 'ativo' : EQUIPMENT_KINDS[kind]}`}
            {form.replaces && <span className="ml-2 font-normal text-slate-500">versão sua do modelo padrão; os equipamentos já criados continuam vinculados</span>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Fabricante">
              <input className="input" placeholder="Huawei, ZTE, Furukawa..." value={form.vendor ?? ''} onChange={(e) => set({ vendor: e.target.value })} />
            </Field>
            <Field label="Modelo">
              <input autoFocus className="input" placeholder="MA5800-X7" value={form.model ?? ''} onChange={(e) => set({ model: e.target.value })} />
            </Field>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {kind === 'active' && (
              <Field label="Tipo">
                <select className="input px-2" value={form.type ?? ''} onChange={(e) => set({ type: e.target.value })}>
                  {ACTIVE_TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </Field>
            )}
            {kind === 'olt' && (
              <Field label="Slots">
                <input type="number" min={1} className="input px-2" value={form.slots ?? 1} onChange={(e) => set({ slots: int(e.target.value, 1) })} />
              </Field>
            )}
            <Field label={kind === 'olt' ? 'PON/slot' : 'Portas'}>
              <input
                type="number"
                min={1}
                className="input px-2"
                disabled={kind === 'active' && !!form.port_groups?.length}
                value={kind === 'active' && form.port_groups?.length ? groupsTotal(form.port_groups) : (form.ports ?? 1)}
                onChange={(e) => set({ ports: int(e.target.value, 1) })}
              />
            </Field>
            {kind === 'olt' && (
              <Field label="Uplinks">
                <input type="number" min={0} className="input px-2" value={form.uplinks ?? 0} onChange={(e) => set({ uplinks: int(e.target.value) })} />
              </Field>
            )}
            <Field label="Altura (U)">
              <input type="number" min={1} max={60} className="input px-2" value={form.height_u ?? 1} onChange={(e) => set({ height_u: int(e.target.value, 1) })} />
            </Field>
            {kind === 'olt' && (
              <Field label="TX dBm">
                <input type="number" step={0.5} className="input px-2" value={form.tx_dbm ?? ''} onChange={(e) => set({ tx_dbm: e.target.value === '' ? null : Number(e.target.value) })} />
              </Field>
            )}
          </div>
          <Field label="Valor de mercado (R$, por unidade)">
            <PriceInput value={price} onSave={setPrice} />
          </Field>
          <div className="flex items-center gap-3">
            {photoUrl || (form.image_url && !dropPhoto) ? (
              <a href={photoUrl ?? form.image_url ?? undefined} target="_blank" rel="noreferrer" title="Abrir a foto">
                <img src={photoUrl ?? form.image_url ?? undefined} alt="Foto do equipamento" className="h-20 w-32 rounded-md border border-slate-700 bg-white object-contain" />
              </a>
            ) : (
              <div className="h-20 w-32 rounded-md border border-dashed border-slate-700 flex items-center justify-center text-[11px] text-slate-500 text-center px-2">Sem foto</div>
            )}
            <div className="space-y-1.5">
              <label className="btn-ghost cursor-pointer !py-1.5 text-xs w-fit">
                <ImagePlus size={14} /> {photoUrl || (form.image_url && !dropPhoto) ? 'Trocar foto' : 'Adicionar foto'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (!f) return;
                    if (f.size > 5 * 1024 * 1024) return setError('A imagem pode ter até 5 MB.');
                    setError(null);
                    setPhoto(f);
                    setDropPhoto(false);
                  }}
                />
              </label>
              {(photoUrl || (form.image_url && !dropPhoto)) && (
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-red-400 cursor-pointer"
                  onClick={() => {
                    setPhoto(null);
                    setDropPhoto(true);
                  }}
                >
                  <X size={13} /> Remover foto
                </button>
              )}
              <div className="text-[11px] text-slate-500">Foto real do equipamento, para referência. JPG, PNG ou WebP até 5 MB.</div>
            </div>
          </div>
          {kind === 'active' && (
            <PortGroupsEditor
              groups={form.port_groups ?? []}
              onChange={(g) => set({ port_groups: g.length ? g : null, ...(g.length ? { ports: Math.max(1, groupsTotal(g)) } : {}) })}
            />
          )}
          {error && <div className="text-xs text-red-400">{error}</div>}
          <div className="flex gap-2 justify-end">
            <button className="btn-ghost" onClick={() => setForm(null)}>
              Cancelar
            </button>
            <button className="btn-primary" disabled={busy || !form.model?.trim()} onClick={save}>
              Salvar modelo
            </button>
          </div>
        </div>
      )}
      {!form && error && <div className="text-xs text-red-400 mt-2">{error}</div>}
      {hiddenHere.length > 0 && (
        <div className="mt-2 text-[11px] text-slate-500">
          Padrões excluídos:{' '}
          {hiddenHere.map((m, i) => (
            <span key={String(m.id)}>
              {i > 0 && ', '}
              {m.model}
              {m.own && !readOnly && (
                <button className="ml-1 text-emerald-400 hover:text-emerald-300 cursor-pointer" onClick={() => restore(m)}>
                  restaurar
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      <p className="text-[11px] text-slate-500 mt-3">
        Os modelos cadastrados aparecem para escolher ao criar OLT, DIO ou Ativo no editor do POP, e valem para todos os seus projetos (a equipe vê os modelos do dono do projeto).
      </p>
    </PopDialog>
  );
}

/** Miniatura da foto de referência do modelo (abre a foto ao clicar). */
export function ModelPhoto({ model, size = 40 }: { model?: EquipmentModel; size?: number }) {
  if (!model?.image_url)
    return <div className="rounded border border-dashed border-slate-800 shrink-0" style={{ width: size, height: size }} title="Sem foto" />;
  return (
    <a href={model.image_url} target="_blank" rel="noreferrer" title="Abrir a foto" className="shrink-0" onClick={(e) => e.stopPropagation()}>
      <img src={model.image_url} alt={model.model} loading="lazy" className="rounded border border-slate-700 bg-white object-contain" style={{ width: size, height: size }} />
    </a>
  );
}
