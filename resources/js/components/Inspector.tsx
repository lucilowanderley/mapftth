import { Activity, Link2, Network, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { api, errorMessage } from '../lib/api';
import { POWER_COLORS, POWER_LABEL, powerLevel, type BudgetResult } from '../lib/budget';
import { CABLE_CATEGORIES, CABLE_MODELS, NODE_TYPES, STATUSES } from '../lib/catalog';
import type { Cable, CableCategory, NetNode, Settings, Status } from '../lib/types';
import { Field, formatLength } from './ui';

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

function NodeForm({ node, budget, settings, onClose, onNodeSaved, onDeleted, onOpenDiagram, onShowBudget, onConnectClient, onError }: Props & { node: NetNode }) {
  const [name, setName] = useState(node.name);
  const [status, setStatus] = useState<Status>(node.status);
  const [notes, setNotes] = useState(node.notes ?? '');
  const [address, setAddress] = useState((node.attributes?.address as string) ?? '');
  const [saving, setSaving] = useState(false);
  const hasDiagram = ['cto', 'ceo', 'pop'].includes(node.type);
  const level = budget ? powerLevel(budget.power, settings) : null;

  async function save() {
    setSaving(true);
    try {
      const r = await api.updateNode(node.id, {
        name,
        status,
        notes: notes || null,
        attributes: { ...(node.attributes ?? {}), ...(node.type === 'client' ? { address } : {}) },
      });
      onNodeSaved(r.node, r.cables);
    } catch (e) {
      onError(errorMessage(e));
    }
    setSaving(false);
  }

  async function remove() {
    if (!confirm(`Excluir ${node.name}?`)) return;
    await api.deleteNode(node.id);
    onDeleted('node', node.id);
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
        {node.type === 'client' && !budget?.steps.length && (
          <button className="btn-ghost w-full" onClick={() => onConnectClient(node)}>
            <Link2 size={16} /> Ligar drop à CTO mais próxima
          </button>
        )}
        <Field label="Nome">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Status">
          <StatusSelect value={status} onChange={setStatus} />
        </Field>
        {node.type === 'client' && (
          <Field label="Endereço">
            <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} />
          </Field>
        )}
        <Field label="Observações">
          <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <div className="flex gap-2">
          <button className="btn-danger" onClick={remove} title="Excluir">
            <Trash2 size={16} />
          </button>
          <button className="btn-primary flex-1" onClick={save} disabled={saving}>
            Salvar alterações
          </button>
        </div>
      </div>
    </>
  );
}

function CableForm({ cable, nodes, onClose, onCableSaved, onDeleted, onError }: Props & { cable: Cable }) {
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
    set({ model: m.id, name: m.name, fiber_count: m.fibers, fibers_per_tube: m.perTube, category: m.category, color: CABLE_CATEGORIES[m.category].color });
  }

  async function save() {
    if (form.fiber_count < cable.fiber_count && !confirm('Reduzir o número de fibras remove as fusões das fibras excedentes. Continuar?')) return;
    setSaving(true);
    try {
      const r = await api.updateCable(cable.id, { ...form, model: form.model || null, notes: form.notes || null });
      onCableSaved(r.cable, r.nodes);
    } catch (e) {
      onError(errorMessage(e));
    }
    setSaving(false);
  }

  async function remove() {
    if (!confirm(`Excluir ${cable.name}? As fusões deste cabo nas caixas também serão removidas.`)) return;
    const r = await api.deleteCable(cable.id);
    onDeleted('cable', cable.id, r.nodes);
  }

  return (
    <>
      <Header title={cable.name} subtitle={`${from?.name ?? 'Ponta solta'} → ${to?.name ?? 'Ponta solta'}`} onClose={onClose} />
      <div className="p-4 space-y-3">
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
          <input className="input" value={form.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Fibras">
            <input type="number" min={1} max={288} className="input" value={form.fiber_count} onChange={(e) => set({ fiber_count: Number(e.target.value), model: '' })} />
          </Field>
          <Field label="Fibras/tubo">
            <input type="number" min={1} max={24} className="input" value={form.fibers_per_tube} onChange={(e) => set({ fibers_per_tube: Number(e.target.value) })} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Tipo">
            <select className="input" value={form.category} onChange={(e) => set({ category: e.target.value as CableCategory })}>
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
            <input type="number" min={0} className="input !w-20 !py-0.5 text-right" value={form.slack_m} onChange={(e) => set({ slack_m: Number(e.target.value) })} />
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
          <input type="range" min={1} max={12} value={form.width} onChange={(e) => set({ width: Number(e.target.value) })} className="w-full accent-emerald-500" />
        </Field>
        <Field label="Observações">
          <textarea className="input" rows={2} value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
        </Field>
        <div className="flex gap-2">
          <button className="btn-danger" onClick={remove} title="Excluir">
            <Trash2 size={16} />
          </button>
          <button className="btn-primary flex-1" onClick={save} disabled={saving}>
            Salvar alterações
          </button>
        </div>
      </div>
    </>
  );
}
