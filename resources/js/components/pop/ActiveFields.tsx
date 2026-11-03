import { Layers, Plus, Trash2 } from 'lucide-react';
import { MGMT_PROTOS, PORT_SPEEDS, PORT_TYPES, PORT_TYPE_SPEED } from '../../lib/catalog';
import { activeGroups, activePortLabel, groupsTotal, lagIssues, portsCapacity, speedLabel, uid, validMgmtHost } from '../../lib/pop';
import type { MgmtAccess, MgmtProto, PortGroup, PortLag } from '../../lib/types';

/** Cores das agregações (iguais às do card). */
export const LAG_COLORS = ['#f472b6', '#22d3ee', '#a78bfa', '#facc15', '#fb923c', '#4ade80'];

const int = (v: string, min = 0) => Math.max(min, Math.round(Number(v)) || min);

/** Lista de grupos de portas (tipo, quantidade, capacidade por porta). */
export function PortGroupsEditor({ groups, onChange, max = 576 }: { groups: PortGroup[]; onChange: (g: PortGroup[]) => void; max?: number }) {
  const total = groupsTotal(groups);
  const cap = groups.reduce((a, g) => a + g.count * (g.speed ?? 0), 0);
  const set = (i: number, patch: Partial<PortGroup>) => onChange(groups.map((g, k) => (k === i ? { ...g, ...patch } : g)));
  return (
    <div className="rounded-lg border border-slate-700">
      <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-slate-800 text-xs">
        <span className="font-semibold text-slate-200">Grupos de portas</span>
        <span className="text-slate-500">
          {total} porta(s){cap ? ` · ${speedLabel(cap)} no total` : ''}
        </span>
        <button
          type="button"
          className="ml-auto flex items-center gap-1 text-emerald-400 hover:text-emerald-300 cursor-pointer"
          onClick={() => onChange([...groups, { type: 'SFP+', count: 4, speed: 10 }])}
        >
          <Plus size={13} /> Grupo
        </button>
      </div>
      {groups.length === 0 && <div className="px-2.5 py-2 text-[11px] text-slate-500">Sem grupos: o ativo usa o total de portas acima, todas Ethernet.</div>}
      {groups.length > 0 && (
        <div className="px-2.5 py-2 space-y-1.5">
          <div className="grid grid-cols-[minmax(0,1fr)_64px_84px_20px] gap-1.5 text-[10px] uppercase tracking-wide text-slate-500">
            <span>Tipo</span>
            <span>Qtd.</span>
            <span>Capacidade</span>
            <span />
          </div>
          {groups.map((g, i) => (
            <div key={i} className="grid grid-cols-[minmax(0,1fr)_64px_84px_20px] gap-1.5 items-center">
              <input
                className="input !px-2 !py-1 text-xs"
                list="port-types"
                value={g.type}
                onChange={(e) => {
                  const type = e.target.value;
                  set(i, { type, ...(PORT_TYPE_SPEED[type] !== undefined ? { speed: PORT_TYPE_SPEED[type] } : {}) });
                }}
              />
              <input type="number" min={1} max={max} className="input !px-2 !py-1 text-xs" value={g.count} onChange={(e) => set(i, { count: Math.min(max, int(e.target.value, 1)) })} />
              <select className="input !px-1 !py-1 text-xs" value={g.speed ?? ''} onChange={(e) => set(i, { speed: e.target.value === '' ? null : Number(e.target.value) })}>
                <option value="">—</option>
                {[...new Set([...PORT_SPEEDS, ...(g.speed ? [g.speed] : [])])]
                  .sort((a, b) => a - b)
                  .map((sp) => (
                    <option key={sp} value={sp}>
                      {speedLabel(sp)}bps
                    </option>
                  ))}
              </select>
              <button type="button" title="Remover grupo" className="text-slate-500 hover:text-red-400 cursor-pointer" onClick={() => onChange(groups.filter((_, k) => k !== i))}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
      <datalist id="port-types">
        {PORT_TYPES.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
    </div>
  );
}

/** IP, porta e protocolo de gerência. */
export function MgmtFields({ value, onChange }: { value: MgmtAccess; onChange: (m: MgmtAccess) => void }) {
  const bad = !!value.ip && !validMgmtHost(value.ip);
  return (
    <div className="rounded-lg border border-slate-700 px-2.5 py-2 space-y-1.5">
      <div className="text-xs font-semibold text-slate-200">Gerência</div>
      <div className="grid grid-cols-[minmax(0,1fr)_72px_92px] gap-1.5">
        <label className="block">
          <span className="block text-[10px] text-slate-400 mb-0.5">IP / host</span>
          <input className={`input !px-2 !py-1 text-xs font-mono ${bad ? '!border-red-500' : ''}`} placeholder="10.0.0.1" value={value.ip ?? ''} onChange={(e) => onChange({ ...value, ip: e.target.value.trim() || undefined })} />
        </label>
        <label className="block">
          <span className="block text-[10px] text-slate-400 mb-0.5">Porta</span>
          <input
            type="number"
            min={1}
            max={65535}
            className="input !px-2 !py-1 text-xs"
            placeholder={value.proto ? String(MGMT_PROTOS[value.proto]) : '22'}
            value={value.port ?? ''}
            onChange={(e) => onChange({ ...value, port: e.target.value === '' ? undefined : Math.min(65535, int(e.target.value, 1)) })}
          />
        </label>
        <label className="block">
          <span className="block text-[10px] text-slate-400 mb-0.5">Protocolo</span>
          <select
            className="input !px-1 !py-1 text-xs"
            value={value.proto ?? ''}
            onChange={(e) => {
              const proto = (e.target.value || undefined) as MgmtProto | undefined;
              // Ao trocar o protocolo, a porta acompanha o padrão dele (se a atual era o padrão anterior ou vazia).
              const wasDefault = !value.port || (value.proto && value.port === MGMT_PROTOS[value.proto]);
              onChange({ ...value, proto, ...(proto && wasDefault ? { port: MGMT_PROTOS[proto] } : {}) });
            }}
          >
            <option value="">—</option>
            {(Object.keys(MGMT_PROTOS) as MgmtProto[]).map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
      </div>
      {bad && <div className="text-[11px] text-red-400">IP ou nome de host inválido.</div>}
    </div>
  );
}

/** Agregações de portas (LAG): nome, modo e seleção das portas. */
export function LagEditor({ ports, groups, lags, onChange }: { ports: number; groups: PortGroup[]; lags: PortLag[]; onChange: (l: PortLag[]) => void }) {
  const comp = { ports, groups, lags };
  const set = (id: string, patch: Partial<PortLag>) => onChange(lags.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  return (
    <div className="rounded-lg border border-slate-700">
      <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-slate-800 text-xs">
        <Layers size={13} className="text-pink-400" />
        <span className="font-semibold text-slate-200">Agregação de portas (LAG)</span>
        <button
          type="button"
          className="ml-auto flex items-center gap-1 text-emerald-400 hover:text-emerald-300 cursor-pointer"
          onClick={() => onChange([...lags, { id: uid(), name: `LAG${lags.length + 1}`, mode: 'lacp', ports: [] }])}
        >
          <Plus size={13} /> Agregação
        </button>
      </div>
      {lags.length === 0 && <div className="px-2.5 py-2 text-[11px] text-slate-500">Junte duas ou mais portas num port-channel / bond (LACP ou estático).</div>}
      {lags.map((l, li) => {
        const color = LAG_COLORS[li % LAG_COLORS.length];
        const issues = lagIssues(comp, l);
        const cap = portsCapacity(comp, l.ports);
        return (
          <div key={l.id} className="px-2.5 py-2 border-b border-slate-800 last:border-0 space-y-1.5">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: color }} />
              <input className="input !px-2 !py-1 text-xs flex-1 min-w-0" value={l.name} onChange={(e) => set(l.id, { name: e.target.value })} />
              <select className="input !w-28 !px-1 !py-1 text-xs" value={l.mode} onChange={(e) => set(l.id, { mode: e.target.value as PortLag['mode'] })}>
                <option value="lacp">LACP (802.3ad)</option>
                <option value="static">Estático</option>
              </select>
              <button type="button" title="Remover agregação" className="text-slate-500 hover:text-red-400 cursor-pointer" onClick={() => onChange(lags.filter((x) => x.id !== l.id))}>
                <Trash2 size={13} />
              </button>
            </div>
            <div className="space-y-1">
              {activeGroups(comp).map((g, gi) => {
                const start = activeGroups(comp).slice(0, gi).reduce((a, x) => a + x.count, 0);
                return (
                  <div key={gi} className="flex items-start gap-1.5">
                    {groups.length > 0 && (
                      <span className="w-16 shrink-0 pt-1 text-[10px] font-semibold text-slate-400 truncate" title={g.type}>
                        {g.type}
                      </span>
                    )}
                    <div className="flex flex-wrap gap-1 min-w-0">
                      {Array.from({ length: g.count }, (_, i) => {
                        const p = `e${start + i + 1}`;
                        const on = l.ports.includes(p);
                        const other = !on && lags.some((o) => o.id !== l.id && o.ports.includes(p));
                        return (
                          <button
                            type="button"
                            key={p}
                            disabled={other}
                            title={`${activePortLabel(comp, p)}${other ? ' (em outra agregação)' : ''}`}
                            onClick={() => set(l.id, { ports: on ? l.ports.filter((x) => x !== p) : [...l.ports, p].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))) })}
                            className={`min-w-6 h-6 px-1 rounded text-[10px] font-semibold border cursor-pointer disabled:cursor-not-allowed disabled:opacity-30 ${on ? 'text-slate-950' : 'text-slate-300 border-slate-700 hover:border-slate-500'}`}
                            style={on ? { background: color, borderColor: color } : undefined}
                          >
                            {i + 1}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="text-[11px] text-slate-400">
              {l.ports.length} porta(s){cap ? ` · ${speedLabel(cap)}bps agregados` : ''}
              {issues.map((m) => (
                <div key={m} className="text-amber-400">
                  {m}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
