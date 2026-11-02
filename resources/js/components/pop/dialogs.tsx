import { Box, Check, Link2, Network as NetIcon, Search, Server, Spline, X, Zap } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { ACTIVE_TYPES, DIO_SIZES, DIO_TRAY, OLT_MODELS, oltModel } from '../../lib/catalog';
import { uid } from '../../lib/pop';
import type { Cable, DiagramComponent } from '../../lib/types';
import { Field } from '../ui';

type Olt = Extract<DiagramComponent, { kind: 'olt' }>;
type Dio = Extract<DiagramComponent, { kind: 'dio' }>;
type Active = Extract<DiagramComponent, { kind: 'active' }>;

/** Janela flutuante no estilo do editor de POP: ícone, título, subtítulo. */
export function PopDialog({
  icon,
  title,
  subtitle,
  onClose,
  children,
  width = 'max-w-sm',
}: {
  icon: ReactNode;
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  width?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-[2100] flex items-center justify-center bg-black/60 p-4"
      onMouseDown={onClose}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <div className={`panel w-full ${width} max-h-[90vh] flex flex-col`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800">
          <div className="w-9 h-9 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">{icon}</div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold truncate">{title}</div>
            {subtitle && <div className="text-xs text-slate-400 truncate">{subtitle}</div>}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white cursor-pointer" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        <div className="p-4 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function OltDialog({
  initial,
  defaultTx,
  count,
  onClose,
  onSubmit,
}: {
  initial?: Olt;
  defaultTx: number;
  count: number;
  onClose: () => void;
  onSubmit: (c: Olt) => void;
}) {
  const [model, setModel] = useState(initial?.model ?? 'custom');
  const [slots, setSlots] = useState(initial?.slots ?? 1);
  const [ports, setPorts] = useState(initial?.ports ?? 8);
  const [uplinks, setUplinks] = useState(initial?.uplinks ?? 2);
  const [tx, setTx] = useState(initial?.tx_dbm ?? defaultTx);
  const [name, setName] = useState(initial?.name ?? `OLT ${count + 1}`);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const current = oltModel(model) ?? OLT_MODELS[0];
  const list = OLT_MODELS.filter((m) => `${m.name} ${m.vendor}`.toLowerCase().includes(q.toLowerCase()));

  function pick(id: string) {
    const m = oltModel(id)!;
    setModel(m.id);
    setSlots(m.slots);
    setPorts(m.ports);
    setUplinks(m.uplinks);
    if (m.id !== 'custom') setName(`${m.name.replace(/^OLT /, '')} ${count + 1}`);
    setOpen(false);
    setQ('');
  }

  const clamp = (v: number, max: number) => Math.max(1, Math.min(max, Math.round(v) || 1));
  return (
    <PopDialog icon={<Server size={18} />} title={initial ? `Editar ${initial.name}` : 'Adicionar OLT'} subtitle={current.name} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <span className="label">Modelo</span>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className={`input text-left flex items-center justify-between cursor-pointer ${open ? 'border-emerald-500' : ''}`}
          >
            <span className="font-medium">{current.name}</span>
            <span className="text-xs text-slate-400">
              {current.slots}×{current.ports}
            </span>
          </button>
          {open && (
            <div className="mt-1 rounded-md border border-slate-700 bg-slate-950 p-2">
              <div className="relative mb-2">
                <Search size={14} className="absolute left-2.5 top-2.5 text-slate-500" />
                <input autoFocus className="input pl-8 py-1.5" placeholder="Buscar..." value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <ul className="max-h-56 overflow-y-auto">
                {list.map((m) => (
                  <li key={m.id}>
                    <button
                      onClick={() => pick(m.id)}
                      className={`w-full flex items-center justify-between rounded px-2 py-1.5 text-left cursor-pointer hover:bg-slate-800 ${
                        m.id === model ? 'text-emerald-400' : ''
                      }`}
                    >
                      <span>
                        <span className="block text-sm font-medium">{m.name}</span>
                        <span className="block text-[11px] text-slate-500">
                          {m.slots}×{m.ports} PON · {m.uplinks} uplinks
                        </span>
                      </span>
                      {m.id === model && <Check size={15} />}
                    </button>
                  </li>
                ))}
                {list.length === 0 && <li className="text-xs text-slate-500 px-2 py-1">Nenhum modelo encontrado.</li>}
              </ul>
            </div>
          )}
        </div>
        <Field label="Nome">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-4 gap-2">
          <Field label="Slots">
            <input type="number" min={1} max={16} className="input px-2" value={slots} onChange={(e) => setSlots(clamp(Number(e.target.value), 16))} />
          </Field>
          <Field label="PON/slot">
            <input type="number" min={1} max={16} className="input px-2" value={ports} onChange={(e) => setPorts(clamp(Number(e.target.value), 16))} />
          </Field>
          <Field label="Uplinks">
            <input type="number" min={0} max={16} className="input px-2" value={uplinks} onChange={(e) => setUplinks(Math.max(0, Math.min(16, Math.round(Number(e.target.value)) || 0)))} />
          </Field>
          <Field label="TX dBm">
            <input type="number" step={0.5} className="input px-2" value={tx} onChange={(e) => setTx(Number(e.target.value))} />
          </Field>
        </div>
        <FrontPreview rows={[...Array.from({ length: Math.min(slots, 6) }, (_, i) => ({ label: `S${i + 1}`, n: ports, color: '#8b5cf6' })), ...(uplinks ? [{ label: 'UP', n: uplinks, color: '#f59e0b' }] : [])]} />
        <p className="text-xs text-slate-400">
          Total: {slots * ports} portas PON{uplinks ? ` + ${uplinks} uplinks` : ''}
        </p>
        <button
          className="btn-primary w-full"
          disabled={!name.trim()}
          onClick={() =>
            onSubmit({
              ...(initial ?? { id: uid(), kind: 'olt' as const, x: 0, y: 0 }),
              kind: 'olt',
              name: name.trim(),
              model,
              slots,
              ports,
              uplinks,
              tx_dbm: tx,
            })
          }
        >
          <Zap size={15} /> {initial ? 'Salvar alterações' : 'Criar OLT'}
        </button>
      </div>
    </PopDialog>
  );
}

/** Miniatura da vista frontal (linhas de portas). */
function FrontPreview({ rows }: { rows: { label: string; n: number; color: string }[] }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-950 p-2 space-y-1 overflow-x-auto">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-1">
          <span className="w-7 text-[10px] text-slate-500 font-mono">{r.label}</span>
          {Array.from({ length: r.n }, (_, j) => (
            <span key={j} className="w-3 h-3 rounded-sm border shrink-0" style={{ borderColor: r.color, background: `${r.color}33` }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function DioDialog({ initial, count, onClose, onSubmit }: { initial?: Dio; count: number; onClose: () => void; onSubmit: (c: Dio) => void }) {
  const [ports, setPorts] = useState(initial?.ports ?? 12);
  const [name, setName] = useState(initial?.name ?? `DIO ${count + 1}`);
  const t = Math.ceil(ports / DIO_TRAY);
  return (
    <PopDialog
      icon={<Box size={18} />}
      title={initial ? `Editar ${initial.name}` : 'Adicionar equipamento passivo (DIO)'}
      subtitle={`${ports} portas · ${t} bandeja${t > 1 ? 's' : ''}`}
      onClose={onClose}
    >
      <Field label="Nome">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="label mt-3">Especificações</div>
      <div className="grid grid-cols-3 gap-2">
        {DIO_SIZES.map((n) => {
          const tr = Math.ceil(n / DIO_TRAY);
          return (
            <button
              key={n}
              onClick={() => setPorts(n)}
              className={`rounded-lg border py-2.5 cursor-pointer transition ${
                ports === n ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 hover:border-slate-500'
              }`}
            >
              <div className="text-lg font-semibold leading-tight">{n}</div>
              <div className="text-[10px] uppercase tracking-wide text-slate-400">
                {tr} bandeja{tr > 1 ? 's' : ''}
              </div>
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-2 mt-3">
        <div className="rounded-lg bg-slate-950 border border-slate-800 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Portas totais</div>
          <div className="text-lg font-semibold text-emerald-400">{ports}</div>
          <div className="text-[10px] text-slate-500">capacidade</div>
        </div>
        <div className="rounded-lg bg-slate-950 border border-slate-800 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Bandejas</div>
          <div className="text-lg font-semibold">{t}</div>
          <div className="text-[10px] text-slate-500">{DIO_TRAY} portas cada</div>
        </div>
      </div>
      <button
        className="btn-primary w-full mt-4"
        disabled={!name.trim()}
        onClick={() => onSubmit({ ...(initial ?? { id: uid(), kind: 'dio' as const, x: 0, y: 0 }), kind: 'dio', name: name.trim(), ports })}
      >
        <Zap size={15} /> {initial ? 'Salvar alterações' : 'Criar dispositivo'}
      </button>
    </PopDialog>
  );
}

export function ActiveDialog({ initial, count, onClose, onSubmit }: { initial?: Active; count: number; onClose: () => void; onSubmit: (c: Active) => void }) {
  const [type, setType] = useState(initial?.type ?? ACTIVE_TYPES[0]);
  const [name, setName] = useState(initial?.name ?? `Ativo ${count + 1}`);
  const [ports, setPorts] = useState(initial?.ports ?? 8);
  return (
    <PopDialog icon={<NetIcon size={18} />} title={initial ? `Editar ${initial.name}` : 'Adicionar equipamento ativo'} subtitle="Switch, roteador, BNG..." onClose={onClose}>
      <div className="space-y-3">
        <Field label="Tipo">
          <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
            {ACTIVE_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field label="Nome">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Portas">
          <input type="number" min={1} max={48} className="input" value={ports} onChange={(e) => setPorts(Math.max(1, Math.min(48, Math.round(Number(e.target.value)) || 1)))} />
        </Field>
        <p className="text-xs text-slate-400">Use as portas para ligar cordões aos uplinks da OLT ou à frente do DIO (ponto a ponto).</p>
        <button
          className="btn-primary w-full"
          disabled={!name.trim()}
          onClick={() => onSubmit({ ...(initial ?? { id: uid(), kind: 'active' as const, x: 0, y: 0 }), kind: 'active', type, name: name.trim(), ports })}
        >
          <Zap size={15} /> {initial ? 'Salvar alterações' : 'Criar equipamento'}
        </button>
      </div>
    </PopDialog>
  );
}

/** Lista de seleção múltipla usada para vincular cabos a um DIO (e DIOs a um cabo). */
export function LinkDialog({
  title,
  subtitle,
  items,
  initial,
  empty,
  onClose,
  onSubmit,
}: {
  title: string;
  subtitle: (n: number) => string;
  items: { key: string; label: string; detail: string; color?: string }[];
  initial: string[];
  empty: string;
  onClose: () => void;
  onSubmit: (keys: string[]) => void;
}) {
  const [sel, setSel] = useState<string[]>(initial);
  const toggle = (k: string) => setSel((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));
  return (
    <PopDialog icon={<Link2 size={18} />} title={title} subtitle={subtitle(sel.length)} onClose={onClose} width="max-w-md">
      <div className="space-y-2">
        {items.map((it) => {
          const on = sel.includes(it.key);
          return (
            <button
              key={it.key}
              onClick={() => toggle(it.key)}
              className={`w-full flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left cursor-pointer transition ${
                on ? 'border-emerald-500/70 bg-emerald-500/10' : 'border-slate-700 hover:border-slate-500'
              }`}
            >
              <span className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${on ? 'border-emerald-400 text-emerald-400' : 'border-slate-500'}`}>
                {on && <Check size={14} />}
              </span>
              <span className="w-8 h-8 rounded-md flex items-center justify-center shrink-0" style={{ background: `${it.color ?? '#10b981'}26`, color: it.color ?? '#10b981' }}>
                <Spline size={16} />
              </span>
              <span className="min-w-0">
                <span className="block font-medium truncate">{it.label}</span>
                <span className="block text-xs text-slate-400 truncate">{it.detail}</span>
              </span>
            </button>
          );
        })}
        {items.length === 0 && <p className="text-sm text-slate-400">{empty}</p>}
      </div>
      <div className="flex justify-end mt-4">
        <button className="btn-primary" onClick={() => onSubmit(sel)}>
          Concluir
        </button>
      </div>
    </PopDialog>
  );
}

export function useCableItems(cables: Cable[], nodeId: number, nodeName: (id: number | null) => string) {
  return useMemo(
    () =>
      cables.map((c) => ({
        key: `c${c.id}`,
        label: c.name,
        color: c.color,
        detail: `${c.fiber_count} fibras · ${c.to_node_id === nodeId ? `de ${nodeName(c.from_node_id)}` : `para ${nodeName(c.to_node_id)}`}`,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cables, nodeId],
  );
}
