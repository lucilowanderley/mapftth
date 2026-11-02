import { Activity, Copy, Crosshair, History, Link2, Network, Radar, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../lib/api';
import { POWER_COLORS, POWER_LABEL, powerLevel, type BudgetResult } from '../lib/budget';
import { CABLE_CATEGORIES, CABLE_MODELS, NODE_TYPES, STATUSES } from '../lib/catalog';
import type { Cable, CableCategory, LatLng, NetNode, PoleAttributes, Settings, Status } from '../lib/types';
import { POLE_MATERIALS } from './PolesModal';
import { cablesNear } from '../lib/analysis';
import { Field, formatLength } from './ui';
import { formatCoord, parseLatLng, parsePair } from '../lib/coords';

const SWATCHES = ['#0ea5e9', '#2563eb', '#22c55e', '#ef4444', '#f97316', '#eab308', '#a855f7', '#ec4899', '#ffffff', '#0f172a'];

interface Props {
  node?: NetNode;
  cable?: Cable;
  nodes: NetNode[];
  budget?: BudgetResult;
  settings: Settings;
  onClose: () => void;
  onNodeSaved: (n: NetNode, cables: Cable[]) => void;
  onCableSaved: (c: Cable, nodes: NetNode[]) => void;
  onDeleted: (kind: 'node' | 'cable', id: number, touched?: NetNode[]) => void;
  onOpenDiagram: (n: NetNode) => void;
  onShowBudget: (n: NetNode) => void;
  onConnectClient: (n: NetNode) => void;
  onError: (message: string) => void;
  readOnly?: boolean;
  cables?: Cable[];
  onHistory?: (kind: 'node' | 'cable', id: number, name: string) => void;
  onOtdr?: (n: NetNode) => void;
  /** Muda a cada duplo clique no objeto: coloca o cursor no primeiro campo. */
  focusKey?: number;
  onLocate?: (at: LatLng) => void;
}

/** Foca e seleciona o campo quando focusKey muda (duplo clique no mapa). */
function useFocusOn(focusKey?: number) {
  const ref = useRef<HTMLInputElement>(null);
  const initial = useRef(focusKey);
  useEffect(() => {
    if (focusKey && focusKey !== initial.current) {
      ref.current?.focus();
      ref.current?.select();
    }
  }, [focusKey]);
  return ref;
}

export default function Inspector(props: Props) {
  return (
    <div className="absolute top-3 left-3 z-[1000] panel w-72 max-h-[calc(100%-1.5rem)] overflow-y-auto">
      {props.node ? <NodeForm {...props} node={props.node} /> : props.cable ? <CableForm {...props} cable={props.cable} /> : null}
    </div>
  );
}

function Header({ title, subtitle, onClose }: { title: string; subtitle: string; onClose: () => void }) {
  return (
    <div className="flex items-start justify-between px-4 py-3 border-b border-slate-800">
      <div>
        <div className="font-semibold">{title}</div>
        <div className="text-xs text-slate-400">{subtitle}</div>
      </div>
      <button onClick={onClose} className="text-slate-400 hover:text-white cursor-pointer" aria-label="Fechar">
        <X size={18} />
      </button>
    </div>
  );
}

function StatusSelect({ value, onChange }: { value: Status; onChange: (s: Status) => void }) {
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value as Status)}>
      {(Object.keys(STATUSES) as Status[]).map((s) => (
        <option key={s} value={s}>
          {STATUSES[s].label}
        </option>
      ))}
    </select>
  );
}

function Actions({
  readOnly,
  onRemove,
  onSave,
  saving,
  onHistory,
}: {
  readOnly?: boolean;
  onRemove: () => void;
  onSave: () => void;
  saving: boolean;
  onHistory?: () => void;
}) {
  return (
    <div className="flex gap-2">
      {!readOnly && (
        <button className="btn-danger" onClick={onRemove} title="Excluir">
          <Trash2 size={16} />
        </button>
      )}
      {onHistory && (
        <button type="button" className="btn-ghost" onClick={onHistory} title="Histórico de alterações">
          <History size={16} />
        </button>
      )}
      {!readOnly && (
        <button className="btn-primary flex-1" onClick={onSave} disabled={saving}>
          Salvar alterações
        </button>
      )}
    </div>
  );
}

function NodeForm({
  node,
  budget,
  settings,
  readOnly,
  cables,
  onClose,
  onNodeSaved,
  onDeleted,
  onOpenDiagram,
  onShowBudget,
  onConnectClient,
  onError,
  onHistory,
  onOtdr,
  focusKey,
  onLocate,
}: Props & { node: NetNode }) {
  const nameRef = useFocusOn(focusKey);
  const [lat, setLat] = useState(formatCoord(node.lat));
  const [lng, setLng] = useState(formatCoord(node.lng));
  // Se o objeto for arrastado no mapa com o painel aberto, os campos acompanham.
  useEffect(() => {
    setLat(formatCoord(node.lat));
    setLng(formatCoord(node.lng));
  }, [node.lat, node.lng]);
  const [name, setName] = useState(node.name);
  const [status, setStatus] = useState<Status>(node.status);
  const [notes, setNotes] = useState(node.notes ?? '');
  const [address, setAddress] = useState((node.attributes?.address as string) ?? '');
  const [pole, setPole] = useState<PoleAttributes>((node.attributes as PoleAttributes) ?? {});
  const setP = (patch: PoleAttributes) => setPole((p) => ({ ...p, ...patch }));
  const cablesHere = cablesNear([node.lat, node.lng], cables ?? []);
  const [saving, setSaving] = useState(false);
  const hasDiagram = ['cto', 'ceo', 'pop'].includes(node.type);
  const level = budget ? powerLevel(budget.power, settings) : null;

  async function save() {
    const pos = parseLatLng(lat, lng);
    if (typeof pos === 'string') return onError(pos);
    const moved = Math.abs(pos[0] - node.lat) > 1e-9 || Math.abs(pos[1] - node.lng) > 1e-9;
    setSaving(true);
    try {
      const r = await api.updateNode(node.id, {
        ...(moved ? { lat: pos[0], lng: pos[1] } : {}),
        name,
        status,
        notes: notes || null,
        attributes: {
          ...(node.attributes ?? {}),
          ...(node.type === 'client' ? { address } : {}),
          ...(node.type === 'pole' ? pole : {}),
        },
      });
      onNodeSaved(r.node, r.cables);
      if (moved) onLocate?.([r.node.lat, r.node.lng]);
    } catch (e) {
      onError(errorMessage(e));
    }
    setSaving(false);
  }

  async function remove() {
    if (!confirm(`Excluir ${node.name}?`)) return;
    try {
      await api.deleteNode(node.id);
      onDeleted('node', node.id);
    } catch (e) {
      onError(errorMessage(e));
    }
  }

  return (
    <>
      <Header title={node.name} subtitle={`${NODE_TYPES[node.type].label} · ${node.lat.toFixed(6)}, ${node.lng.toFixed(6)}`} onClose={onClose} />
      <div className="p-4 space-y-3">
        {hasDiagram && (
          <button className="btn-primary w-full" onClick={() => onOpenDiagram(node)}>
            <Network size={16} /> {node.type === 'pop' ? 'Editor do POP' : 'Diagrama de fusão'}
          </button>
        )}
        {node.type === 'client' && budget && level && (
          <button
            onClick={() => onShowBudget(node)}
            className="w-full rounded-md border px-3 py-2 text-left cursor-pointer"
            style={{ borderColor: POWER_COLORS[level] }}
          >
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-1">
                <Activity size={12} /> Potência na ONU
              </span>
              <span style={{ color: POWER_COLORS[level] }}>{POWER_LABEL[level]}</span>
            </div>
            <div className="text-lg font-mono font-semibold">{budget.power !== null ? `${budget.power.toFixed(2)} dBm` : '—'}</div>
            {budget.error && <div className="text-xs text-slate-400">{budget.error}</div>}
          </button>
        )}
        {node.type === 'client' && budget && budget.power !== null && onOtdr && (
          <button type="button" className="btn-ghost w-full" onClick={() => onOtdr(node)}>
            <Radar size={16} /> Simular OTDR / localizar evento
          </button>
        )}
        {node.type === 'client' && !budget?.steps.length && !readOnly && (
          <button className="btn-ghost w-full" onClick={() => onConnectClient(node)}>
            <Link2 size={16} /> Ligar drop à CTO mais próxima
          </button>
        )}
        {/* fieldset desabilitado: quem tem acesso de leitura só visualiza os campos */}
        <fieldset disabled={readOnly} className="space-y-3">
          <Field label="Nome">
            <input ref={nameRef} className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Status">
            <StatusSelect value={status} onChange={setStatus} />
          </Field>
          <div>
            <div className="label flex items-center justify-between">
              <span>Posição (graus decimais ou GMS)</span>
              <span className="flex gap-2 normal-case">
                {onLocate && (
                  <button type="button" className="text-slate-400 hover:text-white cursor-pointer" title="Centralizar no mapa" onClick={() => onLocate([node.lat, node.lng])}>
                    <Crosshair size={13} />
                  </button>
                )}
                <button
                  type="button"
                  className="text-slate-400 hover:text-white cursor-pointer"
                  title="Copiar coordenadas"
                  onClick={() => navigator.clipboard?.writeText(`${formatCoord(node.lat)}, ${formatCoord(node.lng)}`)}
                >
                  <Copy size={13} />
                </button>
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                className="input font-mono text-xs"
                aria-label="Latitude"
                placeholder="Latitude"
                value={lat}
                onChange={(e) => {
                  // Colar "lat, lng" no campo de latitude preenche os dois.
                  const pair = parsePair(e.target.value);
                  if (pair) {
                    setLat(formatCoord(pair[0]));
                    setLng(formatCoord(pair[1]));
                  } else setLat(e.target.value);
                }}
              />
              <input className="input font-mono text-xs" aria-label="Longitude" placeholder="Longitude" value={lng} onChange={(e) => setLng(e.target.value)} />
            </div>
          </div>
          {node.type === 'client' && (
            <Field label="Endereço">
              <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} />
            </Field>
          )}
          {node.type === 'pole' && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Código / plaqueta">
                  <input className="input" value={pole.code ?? ''} onChange={(e) => setP({ code: e.target.value })} />
                </Field>
                <Field label="Material">
                  <select className="input" value={pole.material ?? ''} onChange={(e) => setP({ material: e.target.value })}>
                    <option value="">—</option>
                    {POLE_MATERIALS.map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Altura (m)">
                  <input
                    type="number"
                    className="input"
                    value={pole.height_m ?? ''}
                    onChange={(e) =>
                      setP({
                        height_m: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                  />
                </Field>
                <Field label="Esforço (daN)">
                  <input
                    type="number"
                    className="input"
                    value={pole.load_dan ?? ''}
                    onChange={(e) =>
                      setP({
                        load_dan: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                  />
                </Field>
              </div>
              <Field label="Distribuidora / proprietário">
                <input className="input" value={pole.owner ?? ''} onChange={(e) => setP({ owner: e.target.value })} />
              </Field>
              <div className="text-xs text-slate-400">Cabos neste poste: {cablesHere.length ? cablesHere.map((c) => c.name).join(', ') : 'nenhum'}</div>
            </>
          )}
          <Field label="Observações">
            <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </fieldset>
        <Actions readOnly={readOnly} onRemove={remove} onSave={save} saving={saving} onHistory={onHistory && (() => onHistory('node', node.id, node.name))} />
      </div>
    </>
  );
}

function CableForm({ cable, nodes, readOnly, onClose, onCableSaved, onDeleted, onError, onHistory, focusKey }: Props & { cable: Cable }) {
  const nameRef = useFocusOn(focusKey);
  const [form, setForm] = useState({
    name: cable.name,
    model: cable.model ?? '',
    fiber_count: cable.fiber_count,
    fibers_per_tube: cable.fibers_per_tube,
    category: cable.category,
    status: cable.status,
    color: cable.color,
    width: cable.width,
    slack_m: cable.slack_m,
    notes: cable.notes ?? '',
  });
  const [saving, setSaving] = useState(false);
  const from = nodes.find((n) => n.id === cable.from_node_id);
  const to = nodes.find((n) => n.id === cable.to_node_id);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  function pickModel(id: string) {
    const m = CABLE_MODELS.find((x) => x.id === id);
    if (!m) return set({ model: '' });
    set({
      model: m.id,
      name: m.name,
      fiber_count: m.fibers,
      fibers_per_tube: m.perTube,
      category: m.category,
      color: CABLE_CATEGORIES[m.category].color,
    });
  }

  async function save() {
    if (form.fiber_count < cable.fiber_count && !confirm('Reduzir o número de fibras remove as fusões das fibras excedentes. Continuar?')) return;
    setSaving(true);
    try {
      const r = await api.updateCable(cable.id, {
        ...form,
        model: form.model || null,
        notes: form.notes || null,
      });
      onCableSaved(r.cable, r.nodes);
    } catch (e) {
      onError(errorMessage(e));
    }
    setSaving(false);
  }

  async function remove() {
    if (!confirm(`Excluir ${cable.name}? As fusões deste cabo nas caixas também serão removidas.`)) return;
    try {
      const r = await api.deleteCable(cable.id);
      onDeleted('cable', cable.id, r.nodes);
    } catch (e) {
      onError(errorMessage(e));
    }
  }

  return (
    <>
      <Header title={cable.name} subtitle={`${from?.name ?? 'Ponta solta'} → ${to?.name ?? 'Ponta solta'}`} onClose={onClose} />
      <div className="p-4 space-y-3">
        <fieldset disabled={readOnly} className="space-y-3">
          <Field label="Modelo do catálogo">
            <select className="input" value={form.model} onChange={(e) => pickModel(e.target.value)}>
              <option value="">Personalizado</option>
              {CABLE_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Nome do cabo">
            <input ref={nameRef} className="input" value={form.name} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Fibras">
              <input
                type="number"
                min={1}
                max={288}
                className="input"
                value={form.fiber_count}
                onChange={(e) =>
                  set({
                    fiber_count: Number(e.target.value),
                    model: '',
                  })
                }
              />
            </Field>
            <Field label="Fibras/tubo">
              <input
                type="number"
                min={1}
                max={24}
                className="input"
                value={form.fibers_per_tube}
                onChange={(e) =>
                  set({
                    fibers_per_tube: Number(e.target.value),
                  })
                }
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Tipo">
              <select
                className="input"
                value={form.category}
                onChange={(e) =>
                  set({
                    category: e.target.value as CableCategory,
                  })
                }
              >
                {(Object.keys(CABLE_CATEGORIES) as CableCategory[]).map((c) => (
                  <option key={c} value={c}>
                    {CABLE_CATEGORIES[c].label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              <StatusSelect value={form.status} onChange={(status) => set({ status })} />
            </Field>
          </div>
          <div className="rounded-md bg-slate-950 p-3 text-xs space-y-1">
            <div className="flex justify-between text-slate-400">
              <span>Padrão de cores</span>
              <span>ABNT</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Comprimento geométrico</span>
              <span>{formatLength(cable.length_m)}</span>
            </div>
            <div className="flex justify-between items-center text-slate-400">
              <span>Reserva técnica (m)</span>
              <input
                type="number"
                min={0}
                className="input !w-20 !py-0.5 text-right"
                value={form.slack_m}
                onChange={(e) => set({ slack_m: Number(e.target.value) })}
              />
            </div>
            <div className="flex justify-between font-semibold text-emerald-400 pt-1 border-t border-slate-800">
              <span>Total</span>
              <span>{formatLength(cable.length_m + form.slack_m)}</span>
            </div>
          </div>
          <Field label="Cor no mapa">
            <div className="flex flex-wrap gap-1.5 items-center">
              {SWATCHES.map((c) => (
                <button
                  key={c}
                  onClick={() => set({ color: c })}
                  className={`w-5 h-5 rounded-full border-2 cursor-pointer ${form.color === c ? 'border-yellow-400' : 'border-slate-700'}`}
                  style={{ background: c }}
                  aria-label={c}
                />
              ))}
              <input type="color" value={form.color} onChange={(e) => set({ color: e.target.value })} className="w-6 h-6 bg-transparent cursor-pointer" />
            </div>
          </Field>
          <Field label={`Espessura: ${form.width}px`}>
            <input
              type="range"
              min={1}
              max={12}
              value={form.width}
              onChange={(e) => set({ width: Number(e.target.value) })}
              className="w-full accent-emerald-500"
            />
          </Field>
          <Field label="Observações">
            <textarea className="input" rows={2} value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
          </Field>
        </fieldset>
        <Actions
          readOnly={readOnly}
          onRemove={remove}
          onSave={save}
          saving={saving}
          onHistory={onHistory && (() => onHistory('cable', cable.id, cable.name))}
        />
      </div>
    </>
  );
}
