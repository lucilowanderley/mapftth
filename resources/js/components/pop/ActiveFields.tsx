import { Layers, Plus, Tags, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { MGMT_PROTOS, PORT_SPEEDS, PORT_TYPES, PORT_TYPE_SPEED } from '../../lib/catalog';
import { formatVlanList, interfacesOf, lagPortSets, parseVlanList, validVlan, vlanIssues, vlanMembers, VLAN_MODES, type NetHost } from '../../lib/netcfg';
import { groupsTotal, lagIssues, portsCapacity, speedLabel, uid, validMgmtHost } from '../../lib/pop';
import type { MgmtAccess, MgmtProto, PortGroup, PortLag, PortVlan, Vlan, VlanMode } from '../../lib/types';

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
export function MgmtFields({ value, onChange, host }: { value: MgmtAccess; onChange: (m: MgmtAccess) => void; host?: NetHost }) {
  const bad = !!value.ip && !validMgmtHost(value.ip);
  const ifaces = host ? interfacesOf(host) : [];
  const sets = [...new Set(ifaces.map((i) => i.set))];
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
      {host && (
        <div className="grid grid-cols-[minmax(0,1fr)_92px] gap-1.5">
          <label className="block">
            <span className="block text-[10px] text-slate-400 mb-0.5">Porta física / interface</span>
            <select className="input !px-1 !py-1 text-xs" value={value.iface ?? ''} onChange={(e) => onChange({ ...value, iface: e.target.value || undefined })}>
              <option value="">—</option>
              <option value="mgmt">Porta MGMT dedicada (fora de banda)</option>
              {sets.map((set) => (
                <optgroup key={set} label={set}>
                  {ifaces
                    .filter((i) => i.set === set)
                    .map((i) => (
                      <option key={i.key} value={i.key}>
                        {i.label}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-[10px] text-slate-400 mb-0.5">VLAN</span>
            <input
              type="number"
              min={1}
              max={4094}
              list="mgmt-vlans"
              className={`input !px-2 !py-1 text-xs ${value.vlan != null && !validVlan(value.vlan) ? '!border-red-500' : ''}`}
              placeholder="99"
              value={value.vlan ?? ''}
              onChange={(e) => onChange({ ...value, vlan: e.target.value === '' ? undefined : Math.round(Number(e.target.value)) })}
            />
            <datalist id="mgmt-vlans">
              {(host.vlans ?? []).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </datalist>
          </label>
        </div>
      )}
      {bad && <div className="text-[11px] text-red-400">IP ou nome de host inválido.</div>}
    </div>
  );
}

/** Agregações de portas (LAG): nome, modo e seleção das portas (do ativo ou uplinks da OLT). */
export function LagEditor({ host, lags, onChange }: { host: NetHost; lags: PortLag[]; onChange: (l: PortLag[]) => void }) {
  const comp = { ...host, lags };
  const sets = lagPortSets(comp);
  const total = sets.reduce((a, x) => a + x.ports.length, 0);
  const set = (id: string, patch: Partial<PortLag>) => onChange(lags.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const order = (p: string) => Number(p.slice(1)) + (p.startsWith('u') ? 10000 : 0);
  return (
    <div className="rounded-lg border border-slate-700">
      <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-slate-800 text-xs">
        <Layers size={13} className="text-pink-400" />
        <span className="font-semibold text-slate-200">Agregação de portas (LAG)</span>
        <button
          type="button"
          disabled={total < 2}
          className="ml-auto flex items-center gap-1 text-emerald-400 hover:text-emerald-300 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          onClick={() => onChange([...lags, { id: uid(), name: `LAG${lags.length + 1}`, mode: 'lacp', ports: [] }])}
        >
          <Plus size={13} /> Agregação
        </button>
      </div>
      {lags.length === 0 && (
        <div className="px-2.5 py-2 text-[11px] text-slate-500">
          {total < 2
            ? host.kind === 'olt'
              ? 'Informe 2 ou mais uplinks para agregar.'
              : 'O equipamento precisa de 2 ou mais portas.'
            : `Junte duas ou mais ${host.kind === 'olt' ? 'portas de uplink' : 'portas'} num port-channel / bond (LACP ou estático).`}
        </div>
      )}
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
              {sets.map((g) => (
                <div key={g.label} className="flex items-start gap-1.5">
                  {(sets.length > 1 || host.kind === 'olt' || host.groups?.length) && (
                    <span className="w-16 shrink-0 pt-1 text-[10px] font-semibold text-slate-400 truncate" title={g.label}>
                      {g.label}
                    </span>
                  )}
                  <div className="flex flex-wrap gap-1 min-w-0">
                    {g.ports.map(({ id: p, label, index }) => {
                      const on = l.ports.includes(p);
                      const other = !on && lags.some((o) => o.id !== l.id && o.ports.includes(p));
                      return (
                        <button
                          type="button"
                          key={p}
                          disabled={other}
                          title={`${label}${other ? ' (em outra agregação)' : ''}`}
                          onClick={() => set(l.id, { ports: on ? l.ports.filter((x) => x !== p) : [...l.ports, p].sort((a, b) => order(a) - order(b)) })}
                          className={`min-w-6 h-6 px-1 rounded text-[10px] font-semibold border cursor-pointer disabled:cursor-not-allowed disabled:opacity-30 ${on ? 'text-slate-950' : 'text-slate-300 border-slate-700 hover:border-slate-500'}`}
                          style={on ? { background: color, borderColor: color } : undefined}
                        >
                          {index}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
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

/** Campo de lista de VLANs com tag ("10, 20, 100-110"): edita como texto e confirma ao sair. */
function VlanListInput({ value, onCommit, disabled }: { value: number[]; onCommit: (v: number[]) => void; disabled?: boolean }) {
  const shown = formatVlanList(value);
  const [text, setText] = useState(shown);
  useEffect(() => setText(shown), [shown]);
  return (
    <input
      className="input !px-2 !py-1 text-xs font-mono min-w-0"
      placeholder="10, 20, 100-110"
      disabled={disabled}
      value={disabled ? '' : text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => onCommit(parseVlanList(text))}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

/** Seletor de VLAN (das cadastradas no equipamento). */
function VlanSelect({ vlans, value, onChange, empty = '—' }: { vlans: Vlan[]; value?: number; onChange: (v?: number) => void; empty?: string }) {
  const list = value && !vlans.some((v) => v.id === value) ? [...vlans, { id: value, name: 'não cadastrada' }] : vlans;
  return (
    <select className="input !px-1 !py-1 text-xs min-w-0" value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}>
      <option value="">{empty}</option>
      {list.map((v) => (
        <option key={v.id} value={v.id}>
          {v.id}
          {v.name ? ` · ${v.name}` : ''}
        </option>
      ))}
    </select>
  );
}

/** VLANs do equipamento e o modo de cada interface (access, trunk, híbrida). */
export function VlanEditor({
  host,
  vlans,
  portVlans,
  onVlans,
  onPortVlans,
}: {
  host: NetHost;
  vlans: Vlan[];
  portVlans: Record<string, PortVlan>;
  onVlans: (v: Vlan[]) => void;
  onPortVlans: (p: Record<string, PortVlan>) => void;
}) {
  const comp: NetHost = { ...host, vlans, portVlans };
  const ifaces = interfacesOf(comp);
  const [bulkText, setBulkText] = useState('');
  const [sel, setSel] = useState<string[]>([]);
  const [bulk, setBulk] = useState<PortVlan>({ mode: 'access' });
  const issues = vlanIssues(comp);
  const sorted = [...vlans].sort((a, b) => a.id - b.id);

  const setPort = (key: string, v: PortVlan | null) => {
    const next = { ...portVlans };
    if (v) next[key] = v;
    else delete next[key];
    onPortVlans(next);
  };
  const setMode = (key: string, mode: VlanMode | '') => {
    const cur = portVlans[key];
    if (!mode) return setPort(key, null);
    setPort(key, { mode, pvid: cur?.pvid ?? (mode === 'access' ? sorted[0]?.id : undefined), tagged: mode === 'access' ? undefined : cur?.tagged });
  };
  const addVlans = () => {
    const ids = parseVlanList(bulkText);
    if (!ids.length) {
      const next = Math.max(0, ...vlans.map((v) => v.id)) + 10 - (Math.max(0, ...vlans.map((v) => v.id)) % 10);
      onVlans([...vlans, { id: Math.min(4094, next || 10) }]);
    } else onVlans([...vlans, ...ids.filter((id) => !vlans.some((v) => v.id === id)).map((id) => ({ id }))]);
    setBulkText('');
  };
  const applyBulk = () => {
    const next = { ...portVlans };
    for (const k of sel) next[k] = { ...bulk, tagged: bulk.mode === 'access' ? undefined : bulk.tagged };
    onPortVlans(next);
    setSel([]);
  };

  return (
    <div className="rounded-lg border border-slate-700 min-w-0">
      <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-slate-800 text-xs">
        <Tags size={13} className="text-sky-400" />
        <span className="font-semibold text-slate-200">VLANs</span>
        <span className="text-slate-500">{vlans.length} cadastrada(s)</span>
      </div>

      <div className="px-2.5 py-2 space-y-1.5 border-b border-slate-800">
        <div className="flex gap-1.5">
          <input
            className="input !px-2 !py-1 text-xs font-mono flex-1 min-w-0"
            placeholder="VLANs: 10, 20, 100-110"
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addVlans()}
          />
          <button type="button" className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 cursor-pointer shrink-0" onClick={addVlans}>
            <Plus size={13} /> VLAN
          </button>
        </div>
        {sorted.length > 0 && (
          <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
            {sorted.map((v) => {
              const members = vlanMembers(comp, v.id);
              return (
                <div key={v.id} className="grid grid-cols-[64px_minmax(0,1fr)_auto_16px] gap-1.5 items-center">
                  <input
                    type="number"
                    min={1}
                    max={4094}
                    className="input !px-2 !py-1 text-xs font-mono"
                    value={v.id}
                    onChange={(e) => {
                      const id = Math.round(Number(e.target.value));
                      if (validVlan(id)) onVlans(vlans.map((x) => (x === v ? { ...x, id } : x)));
                    }}
                  />
                  <input className="input !px-2 !py-1 text-xs" placeholder="Nome (ex.: GERENCIA, CLIENTES)" value={v.name ?? ''} onChange={(e) => onVlans(vlans.map((x) => (x === v ? { ...x, name: e.target.value || undefined } : x)))} />
                  <span className="text-[10px] text-slate-500 whitespace-nowrap" title={members.map((m) => `${m.key}${m.tagged ? ' (tag)' : ''}`).join(', ')}>
                    {members.length} interface(s)
                  </span>
                  <button type="button" title="Remover VLAN" className="text-slate-500 hover:text-red-400 cursor-pointer" onClick={() => onVlans(vlans.filter((x) => x !== v))}>
                    <Trash2 size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {ifaces.length === 0 ? (
        <div className="px-2.5 py-2 text-[11px] text-slate-500">Sem portas para configurar.</div>
      ) : (
        <div className="px-2.5 py-2 space-y-1.5">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-slate-500">
            <span>Portas e agregações</span>
            {sel.length > 0 && <span className="normal-case tracking-normal text-sky-400">{sel.length} selecionada(s)</span>}
          </div>
          {sel.length > 0 && (
            <div className="grid grid-cols-[84px_minmax(0,1fr)_minmax(0,1fr)_auto] gap-1.5 items-center rounded-md bg-sky-500/10 border border-sky-500/30 p-1.5">
              <select className="input !px-1 !py-1 text-xs" value={bulk.mode} onChange={(e) => setBulk({ ...bulk, mode: e.target.value as VlanMode })}>
                {(Object.keys(VLAN_MODES) as VlanMode[]).map((m) => (
                  <option key={m} value={m}>
                    {VLAN_MODES[m].label}
                  </option>
                ))}
              </select>
              <VlanSelect vlans={sorted} value={bulk.pvid} onChange={(pvid) => setBulk({ ...bulk, pvid })} empty={bulk.mode === 'access' ? 'VLAN' : 'nativa'} />
              <VlanListInput value={bulk.tagged ?? []} disabled={bulk.mode === 'access'} onCommit={(tagged) => setBulk({ ...bulk, tagged })} />
              <button type="button" className="btn-primary !px-2 !py-1 text-xs" onClick={applyBulk}>
                Aplicar
              </button>
            </div>
          )}
          <div className="grid grid-cols-[16px_minmax(0,1fr)_84px_minmax(0,0.9fr)_minmax(0,1.6fr)] gap-x-1.5 text-[10px] uppercase tracking-wide text-slate-500">
            <input
              type="checkbox"
              title="Selecionar todas"
              checked={sel.length === ifaces.length}
              onChange={(e) => setSel(e.target.checked ? ifaces.map((i) => i.key) : [])}
            />
            <span>Interface</span>
            <span>Modo</span>
            <span>VLAN / nativa</span>
            <span>Com tag</span>
          </div>
          <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
            {ifaces.map((i) => {
              const v = portVlans[i.key];
              const lagIdx = i.lag ? (host.lags ?? []).findIndex((l) => l.id === i.lag!.id) : -1;
              return (
                <div key={i.key} className="grid grid-cols-[16px_minmax(0,1fr)_84px_minmax(0,0.9fr)_minmax(0,1.6fr)] gap-x-1.5 items-center">
                  <input type="checkbox" checked={sel.includes(i.key)} onChange={(e) => setSel(e.target.checked ? [...sel, i.key] : sel.filter((k) => k !== i.key))} />
                  <span className="text-xs truncate flex items-center gap-1" title={i.lag ? `${i.label}: ${i.lag.ports.length} portas` : i.label}>
                    {i.lag && <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: LAG_COLORS[lagIdx % LAG_COLORS.length] }} />}
                    {i.label}
                  </span>
                  <select className="input !px-1 !py-1 text-xs" value={v?.mode ?? ''} title={v ? VLAN_MODES[v.mode].hint : 'Sem VLAN configurada'} onChange={(e) => setMode(i.key, e.target.value as VlanMode | '')}>
                    <option value="">—</option>
                    {(Object.keys(VLAN_MODES) as VlanMode[]).map((m) => (
                      <option key={m} value={m}>
                        {VLAN_MODES[m].label}
                      </option>
                    ))}
                  </select>
                  {v ? (
                    <VlanSelect vlans={sorted} value={v.pvid} onChange={(pvid) => setPort(i.key, { ...v, pvid })} empty={v.mode === 'access' ? 'escolha' : 'sem nativa'} />
                  ) : (
                    <span />
                  )}
                  {v && v.mode !== 'access' ? (
                    <div className="flex items-center gap-1 min-w-0">
                      <VlanListInput value={v.tagged ?? []} disabled={!!v.all} onCommit={(tagged) => setPort(i.key, { ...v, tagged })} />
                      {v.mode === 'trunk' && (
                        <label className="flex items-center gap-0.5 text-[10px] text-slate-400 shrink-0" title="Libera todas as VLANs (1-4094)">
                          <input type="checkbox" checked={!!v.all} onChange={(e) => setPort(i.key, { ...v, all: e.target.checked || undefined })} />
                          todas
                        </label>
                      )}
                    </div>
                  ) : (
                    <span />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {issues.length > 0 && (
        <div className="px-2.5 pb-2 text-[11px] text-amber-400 space-y-0.5">
          {issues.map((m) => (
            <div key={m}>{m}</div>
          ))}
        </div>
      )}
    </div>
  );
}
