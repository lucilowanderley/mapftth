import { Box, Check, LogOut, Link2, Network as NetIcon, PackagePlus, Rows4, Search, Server, Spline, X, Zap } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { ACTIVE_TYPES, PORT_SPEEDS, DIO_SIZES, DIO_TRAY, RACK_MOUNTS, RACK_SIZES, equipmentLabel } from '../../lib/catalog';
import { MAX_RACK_BATCH, OLT_UPLINK_SPEED, groupsTotal, pruneLags, speedLabel, validMgmtHost, canMount, compareRacks, defaultRackHeight, firstFreeU, nextRackPos, normalizeRow, rackCode, rackGroup, rackHeight, rackLabel, rackUsed, uid, type Rack, type Rackable } from '../../lib/pop';
import type { Cable, DcSpace, DcSpaceKind, Diagram, DiagramComponent, EquipmentModel, MgmtAccess, PortGroup, PortLag, PortVlan, RackLocation, RackMountType, Vlan } from '../../lib/types';
import { LagEditor, MgmtFields, PortGroupsEditor, VlanEditor } from './ActiveFields';
import { cleanMgmt, prunePortVlans, validVlan, type NetHost } from '../../lib/netcfg';
import { Field } from '../ui';
import { FLOOR_TYPES, SPACE_KINDS, canContain, floorFromCode, floorInfo, rackTargets, spaceLoc, spacePath, spaceTitle, suggestCode, tidyCode, type FloorType } from '../../lib/dcspace';

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

/**
 * Chave do modelo guardada no equipamento: id do padrão ("zte-c320") ou "db:12" para cadastrados.
 * Um padrão editado pelo usuário mantém a chave do padrão, então os equipamentos continuam vinculados.
 */
export const modelKey = (m: EquipmentModel) => (m.builtin ? String(m.id) : m.replaces ? m.replaces : `db:${m.id}`);

/** Lista pesquisável de modelos do cadastro (com a opção "personalizado"). */
function ModelPicker({
  models,
  value,
  customLabel,
  detail,
  onPick,
  onCatalog,
}: {
  models: EquipmentModel[];
  value: string;
  customLabel: string;
  detail: (m: EquipmentModel) => string;
  onPick: (m: EquipmentModel | null) => void;
  onCatalog?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const current = models.find((m) => modelKey(m) === value);
  const list = models.filter((m) => equipmentLabel(m).toLowerCase().includes(q.toLowerCase()));
  const pick = (m: EquipmentModel | null) => {
    onPick(m);
    setOpen(false);
    setQ('');
  };
  return (
    <div>
      <span className="label flex items-center justify-between">
        <span>Modelo (fabricante)</span>
        {onCatalog && (
          <button type="button" className="normal-case text-emerald-400 hover:underline cursor-pointer" onClick={onCatalog}>
            Cadastro de equipamentos
          </button>
        )}
      </span>
      <button type="button" onClick={() => setOpen((v) => !v)} className={`input text-left flex items-center justify-between cursor-pointer ${open ? 'border-emerald-500' : ''}`}>
        <span className="font-medium truncate">{current ? equipmentLabel(current) : customLabel}</span>
        <span className="text-xs text-slate-400 shrink-0 ml-2">{current ? `${detail(current)} · ${current.height_u}U` : ''}</span>
      </button>
      {current?.image_url && !open && (
        <a href={current.image_url} target="_blank" rel="noreferrer" title="Abrir a foto" className="block mt-2">
          <img src={current.image_url} alt={current.model} className="h-24 w-full rounded-md border border-slate-700 bg-white object-contain" />
        </a>
      )}
      {open && (
        <div className="mt-1 rounded-md border border-slate-700 bg-slate-950 p-2">
          <div className="relative mb-2">
            <Search size={14} className="absolute left-2.5 top-2.5 text-slate-500" />
            <input autoFocus className="input pl-8 py-1.5" placeholder="Buscar fabricante ou modelo..." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <ul className="max-h-56 overflow-y-auto">
            <li>
              <button onClick={() => pick(null)} className={`w-full rounded px-2 py-1.5 text-left text-sm cursor-pointer hover:bg-slate-800 ${!current ? 'text-emerald-400' : ''}`}>
                {customLabel}
              </button>
            </li>
            {list.map((m) => (
              <li key={modelKey(m)}>
                <button
                  onClick={() => pick(m)}
                  className={`w-full flex items-center justify-between rounded px-2 py-1.5 text-left cursor-pointer hover:bg-slate-800 ${modelKey(m) === value ? 'text-emerald-400' : ''}`}
                >
                  {m.image_url && <img src={m.image_url} alt="" loading="lazy" className="w-9 h-9 mr-2 shrink-0 rounded border border-slate-700 bg-white object-contain" />}
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium">{equipmentLabel(m)}</span>
                    <span className="block text-[11px] text-slate-500">
                      {detail(m)} · {m.height_u}U{m.builtin ? ' · padrão' : ''}
                    </span>
                  </span>
                  {modelKey(m) === value && <Check size={15} />}
                </button>
              </li>
            ))}
            {list.length === 0 && <li className="text-xs text-slate-500 px-2 py-1">Nenhum modelo encontrado.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

const oltDetail = (m: EquipmentModel) => `${m.slots ?? 1}×${m.ports} PON · ${m.uplinks ?? 0} uplinks`;
const dioDetail = (m: EquipmentModel) => `${m.ports} portas`;
const activeDetail = (m: EquipmentModel) =>
  `${m.type ?? 'Ativo'} · ${m.port_groups?.length ? m.port_groups.map((g) => `${g.count}×${g.type}${g.speed ? ` ${speedLabel(g.speed)}` : ''}`).join(' + ') : `${m.ports} portas`}`;

/** Campo "Altura (U)": quantas unidades de rack o equipamento ocupa. */
function HeightField({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <Field label="Altura (U)">
      <input type="number" min={1} max={60} className="input px-2" value={value} onChange={(e) => onChange(Math.max(1, Math.min(60, Math.round(Number(e.target.value)) || 1)))} />
    </Field>
  );
}

/** Fabricante/modelo do cadastro gravados no equipamento (ou nada, se personalizado). */
function modelFields(m: EquipmentModel | undefined, keep?: { model?: string; vendor?: string; modelName?: string }, picked?: string): { model?: string; vendor?: string; modelName?: string } {
  if (m) return { model: modelKey(m), vendor: m.vendor ?? undefined, modelName: m.model };
  // Modelo que saiu do cadastro (excluído): o equipamento mantém o que já tinha.
  if (keep?.model && picked === keep.model && keep.model !== 'custom') return { model: keep.model, vendor: keep.vendor, modelName: keep.modelName };
  return { model: undefined, vendor: undefined, modelName: undefined };
}

export function OltDialog({
  initial,
  defaultTx,
  count,
  racks,
  models,
  onCatalog,
  onClose,
  onSubmit,
}: {
  initial?: Olt;
  defaultTx: number;
  count: number;
  racks: Rack[];
  models: EquipmentModel[];
  onCatalog: () => void;
  onClose: () => void;
  onSubmit: (c: Olt) => void;
}) {
  const options = models.filter((m) => m.kind === 'olt');
  const [rack, setRack] = useState(initial?.rack ?? '');
  const [model, setModel] = useState(initial?.model ?? 'custom');
  const [slots, setSlots] = useState(initial?.slots ?? 1);
  const [ports, setPorts] = useState(initial?.ports ?? 8);
  const [uplinks, setUplinks] = useState(initial?.uplinks ?? 2);
  const [upSpeed, setUpSpeed] = useState(initial?.uplink_speed ?? OLT_UPLINK_SPEED);
  const [tx, setTx] = useState(initial?.tx_dbm ?? defaultTx);
  const [h, setH] = useState(initial ? rackHeight(initial) : 1);
  const [name, setName] = useState(initial?.name ?? `OLT ${count + 1}`);
  const [mgmt, setMgmt] = useState<MgmtAccess>(initial?.mgmt ?? {});
  const [lags, setLags] = useState<PortLag[]>(initial?.lags ?? []);
  const [vlans, setVlans] = useState<Vlan[]>(initial?.vlans ?? []);
  const [portVlans, setPortVlans] = useState<Record<string, PortVlan>>(initial?.portVlans ?? {});
  const mgmtBad = (!!mgmt.ip && !validMgmtHost(mgmt.ip)) || (mgmt.vlan != null && !validVlan(mgmt.vlan));
  const current = options.find((m) => modelKey(m) === model);
  const host: NetHost = { kind: 'olt', ports, uplinks, uplink_speed: upSpeed, lags, vlans, portVlans, mgmt };

  function pick(m: EquipmentModel | null) {
    if (!m) return setModel('custom');
    setModel(modelKey(m));
    setSlots(m.slots ?? 1);
    setPorts(m.ports);
    setUplinks(m.uplinks ?? 0);
    if (m.tx_dbm != null) setTx(m.tx_dbm);
    setH(m.height_u);
    if (!initial) setName(`${m.model} ${count + 1}`);
  }

  const clamp = (v: number, max: number) => Math.max(1, Math.min(max, Math.round(v) || 1));
  return (
    <PopDialog
      icon={<Server size={18} />}
      title={initial ? `Editar ${initial.name}` : 'Adicionar OLT'}
      subtitle={current ? equipmentLabel(current) : 'Configuração personalizada'}
      onClose={onClose}
      width="max-w-7xl"
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)_minmax(0,1.4fr)] items-start">
        <div className="space-y-3 min-w-0">
          <ModelPicker models={options} value={model} customLabel="Configuração personalizada" detail={oltDetail} onPick={pick} onCatalog={onCatalog} />
          <Field label="Nome">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Slots">
              <input type="number" min={1} max={32} className="input px-2" value={slots} onChange={(e) => setSlots(clamp(Number(e.target.value), 32))} />
            </Field>
            <Field label="PON/slot">
              <input type="number" min={1} max={16} className="input px-2" value={ports} onChange={(e) => setPorts(clamp(Number(e.target.value), 16))} />
            </Field>
            <Field label="TX dBm">
              <input type="number" step={0.5} className="input px-2" value={tx} onChange={(e) => setTx(Number(e.target.value))} />
            </Field>
            <Field label="Uplinks">
              <input type="number" min={0} max={16} className="input px-2" value={uplinks} onChange={(e) => setUplinks(Math.max(0, Math.min(16, Math.round(Number(e.target.value)) || 0)))} />
            </Field>
            <Field label="Capacidade">
              <select className="input px-1" value={upSpeed} onChange={(e) => setUpSpeed(Number(e.target.value))}>
                {[...new Set([...PORT_SPEEDS, upSpeed])]
                  .sort((a, b) => a - b)
                  .map((sp) => (
                    <option key={sp} value={sp}>
                      {speedLabel(sp)}bps
                    </option>
                  ))}
              </select>
            </Field>
            <HeightField value={h} onChange={setH} />
          </div>
          <FrontPreview rows={[...Array.from({ length: Math.min(slots, 6) }, (_, i) => ({ label: `S${i + 1}`, n: ports, color: '#8b5cf6' })), ...(uplinks ? [{ label: 'UP', n: uplinks, color: '#f59e0b' }] : [])]} />
          <p className="text-xs text-slate-400">
            Total: {slots * ports} portas PON{uplinks ? ` + ${uplinks} uplinks de ${speedLabel(upSpeed)}` : ''} · ocupa {h}U no rack
          </p>
          <RackSelect racks={racks} value={rack} onChange={setRack} />
        </div>
        <div className="space-y-3 min-w-0">
          <LagEditor host={host} lags={lags} onChange={setLags} />
          <MgmtFields value={mgmt} onChange={setMgmt} host={host} />
        </div>
        <div className="min-w-0">
          <VlanEditor host={host} vlans={vlans} portVlans={portVlans} onVlans={setVlans} onPortVlans={setPortVlans} />
        </div>
      </div>
      <div className="flex justify-end mt-3">
        <button
          className="btn-primary min-w-48"
          disabled={!name.trim() || mgmtBad}
          onClick={() => {
            const cleanLags = pruneLags(lags.filter((l) => l.ports.length > 0).map((l) => ({ ...l, name: l.name.trim() || 'LAG' })), uplinks);
            const final: NetHost = { ...host, lags: cleanLags };
            const cleanVlans = vlans.filter((v) => validVlan(v.id)).map((v) => ({ id: v.id, ...(v.name?.trim() ? { name: v.name.trim() } : {}) }));
            const base: Olt = { ...(initial ?? { id: uid(), kind: 'olt' as const, name: '', model: 'custom', slots, ports, tx_dbm: tx, x: 0, y: 0 }) };
            delete base.lags;
            delete base.vlans;
            delete base.portVlans;
            delete base.mgmt;
            const m = cleanMgmt(final, mgmt);
            const pv = prunePortVlans(final);
            onSubmit({
              ...base,
              kind: 'olt',
              name: name.trim(),
              ...modelFields(current, initial, model),
              model: modelFields(current, initial, model).model ?? 'custom',
              slots,
              ports,
              uplinks,
              uplink_speed: upSpeed,
              tx_dbm: tx,
              h,
              ...(cleanLags ? { lags: cleanLags } : {}),
              ...(cleanVlans.length ? { vlans: cleanVlans } : {}),
              ...(pv ? { portVlans: pv } : {}),
              ...(m ? { mgmt: m } : {}),
              ...rackFields(initial, rack),
            });
          }}
        >
          <Zap size={15} /> {initial ? 'Salvar alterações' : 'Criar OLT'}
        </button>
      </div>
    </PopDialog>
  );
}
/**
 * Campos de rack do equipamento: mantém a posição se o rack não mudou; trocando de rack,
 * a posição (u) fica vazia e o editor procura a primeira U livre.
 */
function rackFields(initial: Rackable | undefined, rack: string): { rack?: string; u?: number } {
  if (!rack) return { rack: undefined, u: undefined };
  if (initial?.rack === rack) return { rack, u: initial.u };
  return { rack, u: undefined };
}

/** Escolha do rack onde o equipamento fica instalado (opcional). */
function RackSelect({ racks, value, onChange }: { racks: Rack[]; value: string; onChange: (v: string) => void }) {
  const [q, setQ] = useState('');
  const groups = useMemo(() => {
    const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const k = norm(q);
    const list = [...racks].sort(compareRacks).filter((r) => !k || r.id === value || norm(rackLabel(r)).includes(k));
    const m = new Map<string, Rack[]>();
    list.forEach((r) => m.set(rackGroup(r), [...(m.get(rackGroup(r)) ?? []), r]));
    return [...m];
  }, [racks, q, value]);
  if (!racks.length) return null;
  return (
    <Field label="Instalar no rack">
      {racks.length > 8 && (
        <div className="relative mb-1.5">
          <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
          <input className="input !py-1 !pl-7 text-xs" placeholder="Filtrar por código ou nome (ex.: AJ05)" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      )}
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Fora do rack</option>
        {groups.map(([g, list]) =>
          groups.length > 1 || g !== 'Sem endereço' ? (
            <optgroup key={g} label={g}>
              {list.map((r) => (
                <option key={r.id} value={r.id}>
                  {rackLabel(r)} · {r.units}U {RACK_MOUNTS[r.mount].label.toLowerCase()}
                </option>
              ))}
            </optgroup>
          ) : (
            list.map((r) => (
              <option key={r.id} value={r.id}>
                {rackLabel(r)} · {r.units}U {RACK_MOUNTS[r.mount].label.toLowerCase()}
              </option>
            ))
          ),
        )}
      </select>
    </Field>
  );
}

export function RackDialog({
  initial,
  racks,
  spaces = [],
  preset,
  onClose,
  onSubmit,
}: {
  initial?: Rack;
  racks: Rack[];
  /** Estrutura do datacenter: o rack pode entrar numa fileira (o endereço vem dela). */
  spaces?: DcSpace[];
  /** Fileira já escolhida (botão + Rack da fileira). */
  preset?: string;
  onClose: () => void;
  onSubmit: (r: Rack[]) => void;
}) {
  const targets = useMemo(() => rackTargets(spaces), [spaces]);
  const [space, setSpace] = useState<string>(() => {
    const s = preset ?? initial?.space ?? '';
    return targets.some((t) => t.id === s) ? s : '';
  });
  const inSpace = (id: string) => racks.filter((r) => r.id !== initial?.id && r.space === id);
  // Novo rack: na fileira escolhida, ou parte do endereço do último rack cadastrado, na próxima posição livre.
  const base = useMemo<RackLocation>(() => {
    if (space && !(initial && initial.space === space)) {
      const l = spaceLoc(spaces, space);
      return { ...l, pos: nextRackPos(inSpace(space), l) };
    }
    if (initial) return initial.loc ?? {};
    const last = [...racks].filter((r) => rackCode(r.loc)).sort(compareRacks).pop();
    if (!last?.loc) return {};
    const { pos: _p, ...rest } = last.loc;
    return { ...rest, pos: nextRackPos(racks, rest) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial, racks]);
  const [rawLoc, setLoc] = useState<RackLocation>(base);
  /** Na fileira, prédio/andar/sala/fileira vêm da estrutura; só a posição é digitada. */
  const loc: RackLocation = space ? { ...spaceLoc(spaces, space), pos: rawLoc.pos } : rawLoc;
  const code = rackCode(loc);
  function pickSpace(id: string) {
    setSpace(id);
    if (id) {
      const l = spaceLoc(spaces, id);
      setLoc({ ...l, pos: initial?.space === id ? initial.loc?.pos : nextRackPos(inSpace(id), l) });
    }
  }
  const [useCode, setUseCode] = useState(initial ? !!code && initial.name === code : true);
  const [name, setName] = useState(initial?.name ?? `Rack ${racks.length + 1}`);
  const [mount, setMount] = useState<RackMountType>(initial?.mount ?? 'floor');
  const [units, setUnits] = useState(initial?.units ?? 44);
  const [qty, setQty] = useState(1);
  const setL = (k: keyof RackLocation, v: string | number | undefined) => setLoc((l) => ({ ...l, [k]: v }));
  const finalName = useCode && code ? code : name.trim();
  const others = racks.filter((r) => r.id !== initial?.id);
  const taken = new Set(others.map((r) => rackCode(r.loc)).filter(Boolean));
  const batch = !initial && qty > 1 && !!normalizeRow(loc.row);
  const startPos = loc.pos && loc.pos > 0 ? loc.pos : 1;
  const plan: RackLocation[] = batch ? Array.from({ length: qty }, (_, i) => ({ ...loc, pos: startPos + i })) : [loc];
  const clash = plan.map(rackCode).filter((c) => c && taken.has(c));

  function submit() {
    const made = plan.map((l, i) => {
      const c = rackCode(l);
      const nm = useCode && c ? c : batch ? `${name.trim()} ${i + 1}` : name.trim();
      const tidy: RackLocation = {
        site: l.site?.trim().toUpperCase() || undefined,
        floor: l.floor?.trim().toUpperCase() || undefined,
        room: l.room?.trim().toUpperCase() || undefined,
        row: normalizeRow(l.row) || undefined,
        pos: l.pos && l.pos > 0 ? Math.round(l.pos) : undefined,
      };
      const hasLoc = Object.values(tidy).some((v) => v !== undefined);
      const r: Rack = { ...(initial ?? { id: uid(), kind: 'rack' as const, x: 0, y: 0 }), kind: 'rack', name: nm, mount, units, loc: hasLoc ? tidy : undefined, space: space || undefined };
      if (!hasLoc) delete r.loc;
      if (!space) delete r.space;
      return r;
    });
    onSubmit(made);
  }

  return (
    <PopDialog icon={<Rows4 size={18} />} title={initial ? `Editar ${initial.name}` : 'Adicionar rack'} subtitle={`${code || 'sem endereço'} · ${units}U · ${RACK_MOUNTS[mount].label}`} onClose={onClose} width="max-w-md">
      <div className="space-y-3">
        <div className="rounded-lg border border-slate-700 p-2.5 space-y-2">
          <div className="flex items-center justify-between">
            <div className="label !mb-0">Endereçamento no datacenter</div>
            <span className="text-[10px] text-slate-500" title="Padrão de identificação ANSI/TIA-606: prédio.andar+sala - fileira+posição">TIA-606</span>
          </div>
          {targets.length > 0 && (
            <label className="block">
              <span className="block text-[10px] text-slate-400 mb-0.5">Fileira (estrutura do datacenter)</span>
              <select className="input !py-1 text-xs" value={space} onChange={(e) => pickSpace(e.target.value)}>
                <option value="">Solto no canvas (endereço digitado)</option>
                {targets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.code ? `${t.code} · ` : ''}
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="grid grid-cols-5 gap-1.5">
            {(
              [
                ['site', 'Prédio/site', 'DC1'],
                ['floor', 'Andar', '1'],
                ['room', 'Sala', 'A'],
                ['row', 'Fileira', 'AJ'],
              ] as const
            ).map(([k, label, ph]) => (
              <label key={k} className="block">
                <span className="block text-[10px] text-slate-400 mb-0.5">{label}</span>
                <input
                  className="input !px-2 !py-1 uppercase disabled:opacity-60"
                  placeholder={space ? '' : ph}
                  disabled={!!space}
                  title={space ? 'Vem da estrutura (prédio, andar, sala e fileira). Troque a fileira acima.' : undefined}
                  value={loc[k] ?? ''}
                  onChange={(e) => setL(k, k === 'row' ? normalizeRow(e.target.value) : e.target.value.toUpperCase())}
                />
              </label>
            ))}
            <label className="block">
              <span className="block text-[10px] text-slate-400 mb-0.5">Posição</span>
              <input
                type="number"
                min={1}
                className="input !px-2 !py-1"
                placeholder="5"
                value={loc.pos ?? ''}
                onChange={(e) => setL('pos', e.target.value === '' ? undefined : Math.max(1, Math.round(Number(e.target.value)) || 1))}
              />
            </label>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400">Código:</span>
            <span className={`font-mono font-semibold ${code ? 'text-emerald-300' : 'text-slate-500'}`}>{code || 'preencha os campos'}</span>
            {loc.row && (
              <button className="ml-auto text-[11px] text-sky-400 hover:underline cursor-pointer" onClick={() => setLoc((l) => ({ ...l, pos: space ? nextRackPos(inSpace(space), loc) : nextRackPos(others, l) }))}>
                próxima posição livre
              </button>
            )}
          </div>
          {clash.length > 0 && (
            <div className="text-[11px] text-amber-400">
              Já existe rack em {clash.slice(0, 4).join(', ')}
              {clash.length > 4 ? ` e mais ${clash.length - 4}` : ''}.
            </div>
          )}
        </div>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input type="checkbox" checked={useCode} onChange={(e) => setUseCode(e.target.checked)} />
          Usar o código como nome do rack
        </label>
        {!(useCode && code) && (
          <Field label={batch ? 'Nome (numerado em sequência)' : 'Nome'}>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        )}
        <div>
          <div className="label">Instalação</div>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(RACK_MOUNTS) as RackMountType[]).map((m) => (
              <button
                key={m}
                onClick={() => setMount(m)}
                className={`rounded-lg border px-3 py-2 text-left cursor-pointer transition ${mount === m ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 hover:border-slate-500'}`}
              >
                <div className="font-semibold text-sm">{RACK_MOUNTS[m].label}</div>
                <div className="text-[10px] text-slate-400">{RACK_MOUNTS[m].hint}</div>
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="label">Altura (unidades de rack)</div>
          <div className="grid grid-cols-6 gap-1.5">
            {RACK_SIZES.map((n) => (
              <button
                key={n}
                onClick={() => setUnits(n)}
                className={`rounded-md border py-1.5 text-xs font-semibold cursor-pointer ${units === n ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 hover:border-slate-500'}`}
              >
                {n}U
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 mt-2 text-xs text-slate-400">
            Outro tamanho:
            <input type="number" min={1} max={60} className="input !w-20 !py-1" value={units} onChange={(e) => setUnits(Math.max(1, Math.min(60, Math.round(Number(e.target.value)) || 1)))} />
            U <span className="text-slate-500">(1U = 44,45 mm · {((units * 44.45) / 10).toFixed(1)} cm úteis)</span>
          </div>
        </div>
        {!initial && (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            Criar
            <input type="number" min={1} max={MAX_RACK_BATCH} className="input !w-16 !py-1" value={qty} onChange={(e) => setQty(Math.max(1, Math.min(MAX_RACK_BATCH, Math.round(Number(e.target.value)) || 1)))} />
            rack(s)
            {qty > 1 &&
              (normalizeRow(loc.row) ? (
                <span className="text-slate-500">
                  na fileira {normalizeRow(loc.row)}, posições {String(startPos).padStart(2, '0')} a {String(startPos + qty - 1).padStart(2, '0')}
                </span>
              ) : (
                <span className="text-amber-400">informe a fileira para criar vários</span>
              ))}
          </div>
        )}
        <button className="btn-primary w-full" disabled={!finalName || (!initial && qty > 1 && !batch)} onClick={submit}>
          <Zap size={15} /> {initial ? 'Salvar alterações' : batch ? `Criar ${qty} racks` : 'Criar rack'}
        </button>
      </div>
    </PopDialog>
  );
}

const KIND_LABEL: Record<Rackable['kind'], string> = { olt: 'OLT', dio: 'DIO', active: 'Ativo' };

/**
 * Instala um equipamento no rack (ou muda a posição/altura). `item` fixo = editar a posição de quem já está no rack;
 * `startU` = U clicada numa posição vazia.
 */
export function MountDialog({
  rack,
  diagram,
  item,
  startU,
  onClose,
  onSubmit,
  onUnmount,
}: {
  rack: Rack;
  diagram: Diagram;
  item?: Rackable;
  startU?: number;
  onClose: () => void;
  onSubmit: (id: string, u: number, h: number) => void;
  onUnmount: (id: string) => void;
}) {
  const racks = new Map(diagram.components.filter((c): c is Rack => c.kind === 'rack').map((r) => [r.id, r]));
  const options = diagram.components.filter((c): c is Rackable => (c.kind === 'olt' || c.kind === 'dio' || c.kind === 'active') && c.rack !== rack.id);
  const [id, setId] = useState(item?.id ?? options[0]?.id ?? '');
  const comp = item ?? options.find((c) => c.id === id);
  const [h, setH] = useState(comp ? rackHeight(comp) : 1);
  const [u, setU] = useState<number>(() => item?.u ?? (startU && comp && canMount(diagram, rack.id, startU, rackHeight(comp)) ? startU : comp ? (firstFreeU(diagram, rack.id, rackHeight(comp)) ?? 1) : 1));
  const ok = !!comp && canMount(diagram, rack.id, u, h, comp.id);
  const free = rack.units - rackUsed(diagram, rack.id) + (item ? rackHeight(item) : 0);

  function pick(next: string) {
    setId(next);
    const c = options.find((x) => x.id === next);
    if (!c) return;
    const hh = rackHeight(c);
    setH(hh);
    setU(firstFreeU(diagram, rack.id, hh) ?? 1);
  }

  return (
    <PopDialog
      icon={<PackagePlus size={18} />}
      title={item ? `${item.name} no ${rack.name}` : `Instalar no ${rack.name}`}
      subtitle={`${rack.units}U · ${free}U livres`}
      onClose={onClose}
    >
      <div className="space-y-3">
        {!item &&
          (options.length ? (
            <Field label="Equipamento">
              <select className="input" value={id} onChange={(e) => pick(e.target.value)}>
                {options.map((c) => (
                  <option key={c.id} value={c.id}>
                    {KIND_LABEL[c.kind]} · {c.name}
                    {c.rack && racks.get(c.rack) ? ` (hoje no ${racks.get(c.rack)!.name})` : ''}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <p className="text-sm text-slate-400">Todos os equipamentos do POP já estão neste rack. Crie uma OLT, DIO ou Ativo pela barra do editor e escolha este rack.</p>
          ))}
        {comp && (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Posição (U de baixo)">
              <input type="number" min={1} max={rack.units} className="input" value={u} onChange={(e) => setU(Math.round(Number(e.target.value)) || 1)} />
            </Field>
            <Field label="Altura (U)">
              <input type="number" min={1} max={rack.units} className="input" value={h} onChange={(e) => setH(Math.max(1, Math.round(Number(e.target.value)) || 1))} />
            </Field>
          </div>
        )}
        {comp && (
          <p className={`text-xs ${ok ? 'text-slate-400' : 'text-red-400'}`}>
            {ok
              ? `Ocupa U${u}${h > 1 ? ` a U${u + h - 1}` : ''}. Altura típica de ${comp.name}: ${defaultRackHeight(comp)}U.`
              : u + h - 1 > rack.units || u < 1
                ? `Não cabe: o rack vai de U1 a U${rack.units}.`
                : 'Essa posição já está ocupada por outro equipamento.'}
          </p>
        )}
        <div className="flex gap-2">
          {item && (
            <button className="btn-ghost flex-1" onClick={() => onUnmount(item.id)}>
              <LogOut size={15} /> Retirar do rack
            </button>
          )}
          <button className="btn-primary flex-1" disabled={!ok} onClick={() => comp && onSubmit(comp.id, u, h)}>
            <Zap size={15} /> {item ? 'Salvar posição' : 'Instalar'}
          </button>
        </div>
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

export function DioDialog({
  initial,
  count,
  racks,
  models,
  onCatalog,
  onClose,
  onSubmit,
}: {
  initial?: Dio;
  count: number;
  racks: Rack[];
  models: EquipmentModel[];
  onCatalog: () => void;
  onClose: () => void;
  onSubmit: (c: Dio) => void;
}) {
  const options = models.filter((m) => m.kind === 'dio');
  const [model, setModel] = useState(initial?.model ?? '');
  const [ports, setPorts] = useState(initial?.ports ?? 12);
  const [h, setH] = useState(initial ? rackHeight(initial) : 1);
  const [rack, setRack] = useState(initial?.rack ?? '');
  const [name, setName] = useState(initial?.name ?? `DIO ${count + 1}`);
  const current = options.find((m) => modelKey(m) === model);
  const t = Math.ceil(ports / DIO_TRAY);
  const setSize = (n: number) => {
    setPorts(n);
    setH(n <= 24 ? 1 : n <= 48 ? 2 : n <= 72 ? 3 : 4);
    setModel('');
  };
  return (
    <PopDialog
      icon={<Box size={18} />}
      title={initial ? `Editar ${initial.name}` : 'Adicionar equipamento passivo (DIO)'}
      subtitle={`${current ? `${equipmentLabel(current)} · ` : ''}${ports} portas · ${t} bandeja${t > 1 ? 's' : ''} · ${h}U`}
      onClose={onClose}
    >
      <div className="space-y-3">
        <ModelPicker
          models={options}
          value={model}
          customLabel="DIO genérico"
          detail={dioDetail}
          onCatalog={onCatalog}
          onPick={(m) => {
            if (!m) return setModel('');
            setModel(modelKey(m));
            setPorts(m.ports);
            setH(m.height_u);
          }}
        />
        <Field label="Nome">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div>
          <div className="label">Especificações</div>
          <div className="grid grid-cols-3 gap-2">
            {DIO_SIZES.map((n) => {
              const tr = Math.ceil(n / DIO_TRAY);
              return (
                <button
                  key={n}
                  onClick={() => setSize(n)}
                  className={`rounded-lg border py-2.5 cursor-pointer transition ${ports === n ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 hover:border-slate-500'}`}
                >
                  <div className="text-lg font-semibold leading-tight">{n}</div>
                  <div className="text-[10px] uppercase tracking-wide text-slate-400">
                    {tr} bandeja{tr > 1 ? 's' : ''}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Portas">
            <input type="number" min={1} max={576} className="input" value={ports} onChange={(e) => setPorts(Math.max(1, Math.min(576, Math.round(Number(e.target.value)) || 1)))} />
          </Field>
          <HeightField value={h} onChange={setH} />
        </div>
        <RackSelect racks={racks} value={rack} onChange={setRack} />
        <button
          className="btn-primary w-full"
          disabled={!name.trim()}
          onClick={() => onSubmit({ ...(initial ?? { id: uid(), kind: 'dio' as const, x: 0, y: 0 }), kind: 'dio', name: name.trim(), ports, h, ...modelFields(current, initial, model), ...rackFields(initial, rack) })}
        >
          <Zap size={15} /> {initial ? 'Salvar alterações' : 'Criar dispositivo'}
        </button>
      </div>
    </PopDialog>
  );
}

export function ActiveDialog({
  initial,
  count,
  racks,
  models,
  onCatalog,
  onClose,
  onSubmit,
}: {
  initial?: Active;
  count: number;
  racks: Rack[];
  models: EquipmentModel[];
  onCatalog: () => void;
  onClose: () => void;
  onSubmit: (c: Active) => void;
}) {
  const options = models.filter((m) => m.kind === 'active');
  const [model, setModel] = useState(initial?.model ?? '');
  const [type, setType] = useState(initial?.type ?? ACTIVE_TYPES[0]);
  const [rack, setRack] = useState(initial?.rack ?? '');
  const [name, setName] = useState(initial?.name ?? `Ativo ${count + 1}`);
  const [simplePorts, setPorts] = useState(initial?.ports ?? 8);
  const [groups, setGroups] = useState<PortGroup[]>(initial?.groups ?? []);
  const [lags, setLags] = useState<PortLag[]>(initial?.lags ?? []);
  const [vlans, setVlans] = useState<Vlan[]>(initial?.vlans ?? []);
  const [portVlans, setPortVlans] = useState<Record<string, PortVlan>>(initial?.portVlans ?? {});
  const [mgmt, setMgmt] = useState<MgmtAccess>(initial?.mgmt ?? {});
  const [h, setH] = useState(initial ? rackHeight(initial) : 1);
  const current = options.find((m) => modelKey(m) === model);
  // Com grupos de portas, o total de portas é a soma dos grupos.
  const ports = groups.length ? Math.max(1, groupsTotal(groups)) : simplePorts;
  const mgmtBad = (!!mgmt.ip && !validMgmtHost(mgmt.ip)) || (mgmt.vlan != null && !validVlan(mgmt.vlan));
  const host: NetHost = { kind: 'active', ports, groups, lags, vlans, portVlans, mgmt };
  return (
    <PopDialog
      icon={<NetIcon size={18} />}
      title={initial ? `Editar ${initial.name}` : 'Adicionar equipamento ativo'}
      subtitle={current ? equipmentLabel(current) : 'Switch, roteador, servidor, DWDM...'}
      onClose={onClose}
      width="max-w-7xl"
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)_minmax(0,1.4fr)] items-start">
        <div className="space-y-3 min-w-0">
          <ModelPicker
            models={options}
            value={model}
            customLabel="Equipamento personalizado"
            detail={activeDetail}
            onCatalog={onCatalog}
            onPick={(m) => {
              if (!m) return setModel('');
              setModel(modelKey(m));
              if (m.type) setType(m.type);
              setPorts(m.ports);
              setGroups(m.port_groups ?? []);
              setH(m.height_u);
              if (!initial) setName(`${m.model} ${count + 1}`);
            }}
          />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Tipo">
              <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
                {[...new Set([...ACTIVE_TYPES, type])].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
            <Field label="Nome">
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label={groups.length ? 'Portas (soma dos grupos)' : 'Portas'}>
              <input
                type="number"
                min={1}
                max={576}
                className="input"
                disabled={groups.length > 0}
                value={ports}
                onChange={(e) => setPorts(Math.max(1, Math.min(576, Math.round(Number(e.target.value)) || 1)))}
              />
            </Field>
            <HeightField value={h} onChange={setH} />
          </div>
          <PortGroupsEditor groups={groups} onChange={setGroups} />
          <RackSelect racks={racks} value={rack} onChange={setRack} />
          <p className="text-xs text-slate-400">Use as portas para ligar cordões aos uplinks da OLT ou à frente do DIO (ponto a ponto).</p>
        </div>
        <div className="space-y-3 min-w-0">
          <LagEditor host={host} lags={lags} onChange={setLags} />
          <MgmtFields value={mgmt} onChange={setMgmt} host={host} />
        </div>
        <div className="min-w-0">
          <VlanEditor host={host} vlans={vlans} portVlans={portVlans} onVlans={setVlans} onPortVlans={setPortVlans} />
        </div>
      </div>
      <div className="flex justify-end mt-3">
        <button
          className="btn-primary min-w-48"
          disabled={!name.trim() || mgmtBad}
          onClick={() => {
            const cleanGroups = groups.filter((g) => g.count > 0 && g.type.trim()).map((g) => ({ ...g, type: g.type.trim() }));
            const cleanLags = pruneLags(lags.filter((l) => l.ports.length > 0).map((l) => ({ ...l, name: l.name.trim() || 'LAG' })), ports);
            const final: NetHost = { ...host, groups: cleanGroups, lags: cleanLags };
            const cleanVlans = vlans.filter((v) => validVlan(v.id)).map((v) => ({ id: v.id, ...(v.name?.trim() ? { name: v.name.trim() } : {}) }));
            const m = cleanMgmt(final, mgmt);
            const pv = prunePortVlans(final);
            const base: Active = { ...(initial ?? { id: uid(), kind: 'active' as const, name: '', type, ports, x: 0, y: 0 }) };
            delete base.groups;
            delete base.lags;
            delete base.vlans;
            delete base.portVlans;
            delete base.mgmt;
            onSubmit({
              ...base,
              kind: 'active',
              type,
              name: name.trim(),
              ports,
              h,
              ...(cleanGroups.length ? { groups: cleanGroups } : {}),
              ...(cleanLags ? { lags: cleanLags } : {}),
              ...(cleanVlans.length ? { vlans: cleanVlans } : {}),
              ...(pv ? { portVlans: pv } : {}),
              ...(m ? { mgmt: m } : {}),
              ...modelFields(current, initial, model),
              ...rackFields(initial, rack),
            });
          }}
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

/** Máximo de fileiras criadas de uma vez. */
const MAX_ROW_BATCH = 30;

/**
 * Cria ou edita um espaço do datacenter: prédio (com empresa), andar (térreo, subsolo, piso...), sala ou fileira.
 * parent = espaço onde ele fica (pode mudar ao editar). Fileiras novas podem ser criadas em sequência (A, B, C...).
 */
export function SpaceDialog({
  initial,
  kind: fixedKind,
  parent: presetParent,
  spaces,
  onClose,
  onSubmit,
}: {
  initial?: DcSpace;
  kind?: DcSpaceKind;
  parent?: string | null;
  spaces: DcSpace[];
  onClose: () => void;
  onSubmit: (list: DcSpace[]) => void;
}) {
  const [kind, setKind] = useState<DcSpaceKind>(initial?.kind ?? fixedKind ?? 'site');
  const [parent, setParent] = useState<string>(initial?.parent ?? presetParent ?? '');
  const parentOk = (k: DcSpaceKind, p: string) => !p || spaces.some((s) => s.id === p && canContain(s.kind, k));
  // Andar novo: térreo se ainda não existe, senão o piso acima do mais alto.
  const f0 = useMemo(() => {
    if (initial?.kind === 'floor') return floorFromCode(initial.code);
    const sib = spaces.filter((s) => s.kind === 'floor' && (s.parent ?? null) === (presetParent ?? null));
    if (!sib.some((s) => (s.level ?? 0) === 0)) return { type: 'ground' as FloorType, n: 1 };
    return { type: 'floor' as FloorType, n: Math.max(0, ...sib.map((s) => Math.floor(s.level ?? 0)).filter((n) => n < 999)) + 1 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const firstFloor = floorInfo(f0.type, f0.n || 1);
  const [code, setCode] = useState(initial?.code ?? (kind === 'floor' ? firstFloor.code : suggestCode(spaces, kind, (initial?.parent ?? presetParent) || null)));
  const [name, setName] = useState(initial?.name ?? (kind === 'floor' ? firstFloor.name : ''));
  const [company, setCompany] = useState(initial?.company ?? '');
  const [ftype, setFtype] = useState<FloorType>(f0.type);
  const [fnum, setFnum] = useState(f0.n || 1);
  const [qty, setQty] = useState(1);
  const meta = SPACE_KINDS[kind];
  // Não deixa colocar o espaço dentro dele mesmo ou de algo que está dentro dele.
  const blocked = useMemo(() => {
    if (!initial) return new Set<string>();
    const out = new Set<string>([initial.id]);
    let grew = true;
    while (grew) {
      grew = false;
      spaces.forEach((s) => {
        if (s.parent && out.has(s.parent) && !out.has(s.id)) {
          out.add(s.id);
          grew = true;
        }
      });
    }
    return out;
  }, [initial, spaces]);
  const parents = spaces.filter((s) => canContain(s.kind, kind) && !blocked.has(s.id));
  const pathLabel = (id: string) =>
    spacePath(spaces, id)
      .map((p) => (p.kind === 'site' ? p.code || spaceTitle(p) : spaceTitle(p)))
      .join(' › ');

  function pickFloor(t: FloorType, n: number) {
    setFtype(t);
    setFnum(n);
    const info = floorInfo(t, n);
    setCode(info.code);
    setName(info.name);
  }
  function pickKind(k: DcSpaceKind) {
    setKind(k);
    const p = parentOk(k, parent) ? parent : '';
    setParent(p);
    if (k === 'floor') pickFloor(ftype, fnum);
    else {
      setCode(suggestCode(spaces, k, p || null));
      setName('');
    }
  }

  const clean = tidyCode(kind, code);
  const batch = !initial && kind === 'row' && qty > 1;
  const codes: string[] = useMemo(() => {
    if (!batch) return [clean];
    const out = [clean];
    for (let i = 1; i < qty; i++) {
      let n = 0;
      for (const ch of out[i - 1]) n = n * 26 + (ch.charCodeAt(0) - 64);
      n += 1;
      let s = '';
      while (n > 0) {
        const m = (n - 1) % 26;
        s = String.fromCharCode(65 + m) + s;
        n = Math.floor((n - 1) / 26);
      }
      out.push(s);
    }
    return out;
  }, [batch, clean, qty]);
  const sibs = spaces.filter((s) => s.kind === kind && (s.parent ?? '') === parent && s.id !== initial?.id);
  const clash = codes.filter((c) => c && sibs.some((s) => s.code === c));
  const preview = rackCode({ ...(parent ? spaceLoc(spaces, parent) : {}), [kind]: clean });
  const need = kind === 'row' || kind === 'room' ? !!clean : kind === 'floor' ? !!clean : !!(clean || name.trim());

  function submit() {
    const level = kind === 'floor' ? floorInfo(ftype, fnum).level : undefined;
    const list = codes.map((c, i) => {
      const s: DcSpace = {
        ...(initial ?? { id: uid(), open: true, x: 0, y: 0 }),
        kind,
        parent: parent || null,
        code: c,
        name: batch ? undefined : name.trim() || undefined,
        company: kind === 'site' ? company.trim() || undefined : undefined,
        level: kind === 'floor' ? (initial && initial.kind === 'floor' && initial.code === c ? (initial.level ?? level) : level) : undefined,
      };
      if (batch && i > 0) s.id = uid();
      (Object.keys(s) as (keyof DcSpace)[]).forEach((k) => s[k] === undefined && delete s[k]);
      return s;
    });
    onSubmit(list);
  }

  return (
    <PopDialog
      icon={<Rows4 size={18} />}
      title={initial ? `Editar ${spaceTitle(initial)}` : `Adicionar ${meta.label.toLowerCase()}`}
      subtitle={<span className="font-mono">{preview || 'sem código'} · TIA-606</span>}
      onClose={onClose}
      width="max-w-md"
    >
      <div className="space-y-3">
        {!initial && !fixedKind && (
          <div className="grid grid-cols-4 gap-1.5">
            {(Object.keys(SPACE_KINDS) as DcSpaceKind[]).map((k) => (
              <button
                key={k}
                onClick={() => pickKind(k)}
                className={`rounded-md border py-1.5 text-xs font-semibold cursor-pointer ${kind === k ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 hover:border-slate-500'}`}
              >
                {SPACE_KINDS[k].label}
              </button>
            ))}
          </div>
        )}
        {kind !== 'site' && (
          <Field label="Fica dentro de">
            <select className="input" value={parent} onChange={(e) => setParent(e.target.value)}>
              <option value="">Nada (solto no canvas)</option>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>
                  {SPACE_KINDS[p.kind].label}: {pathLabel(p.id)}
                </option>
              ))}
            </select>
          </Field>
        )}
        {kind === 'site' && (
          <>
            <Field label="Empresa">
              <input className="input" placeholder="Ex.: Equinix, Ascenty, própria" value={company} onChange={(e) => setCompany(e.target.value)} autoFocus />
            </Field>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Código">
                <input className="input uppercase" placeholder="DC1" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
              </Field>
              <div className="col-span-2">
                <Field label="Nome do prédio">
                  <input className="input" placeholder="Ex.: SP2 · Tamboré" value={name} onChange={(e) => setName(e.target.value)} />
                </Field>
              </div>
            </div>
          </>
        )}
        {kind === 'floor' && (
          <>
            <div className="grid grid-cols-5 gap-1.5">
              {(Object.keys(FLOOR_TYPES) as FloorType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => pickFloor(t, fnum)}
                  className={`rounded-md border py-1.5 text-[11px] font-semibold cursor-pointer ${ftype === t ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 hover:border-slate-500'}`}
                >
                  {FLOOR_TYPES[t].label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {FLOOR_TYPES[ftype].numbered && (
                <Field label="Número">
                  <input type="number" min={1} max={200} className="input" value={fnum} onChange={(e) => pickFloor(ftype, Math.max(1, Math.min(200, Math.round(Number(e.target.value)) || 1)))} />
                </Field>
              )}
              <Field label="Código">
                <input className="input uppercase" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
              </Field>
              <Field label="Nome">
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
            </div>
          </>
        )}
        {(kind === 'room' || kind === 'row') && (
          <div className="grid grid-cols-3 gap-2">
            <Field label={kind === 'row' ? (batch ? 'Primeira fileira' : 'Fileira (letras)') : 'Código da sala'}>
              <input
                className="input uppercase"
                placeholder={kind === 'row' ? 'AJ' : 'A'}
                value={code}
                onChange={(e) => setCode(kind === 'row' ? normalizeRow(e.target.value) : e.target.value.toUpperCase())}
                autoFocus
              />
            </Field>
            {!batch && (
              <div className="col-span-2">
                <Field label="Descrição (opcional)">
                  <input className="input" placeholder={kind === 'room' ? 'Ex.: Data hall 2' : 'Ex.: Corredor frio 1'} value={name} onChange={(e) => setName(e.target.value)} />
                </Field>
              </div>
            )}
          </div>
        )}
        {!initial && kind === 'row' && (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            Criar
            <input type="number" min={1} max={MAX_ROW_BATCH} className="input !w-16 !py-1" value={qty} onChange={(e) => setQty(Math.max(1, Math.min(MAX_ROW_BATCH, Math.round(Number(e.target.value)) || 1)))} />
            fileira(s)
            {batch && clean && (
              <span className="text-slate-500">
                {codes[0]} a {codes[codes.length - 1]}
              </span>
            )}
          </div>
        )}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-400">Código TIA-606:</span>
          <span className={`font-mono font-semibold ${preview ? 'text-emerald-300' : 'text-slate-500'}`}>{preview || 'preencha o código'}</span>
        </div>
        {clash.length > 0 && <div className="text-[11px] text-amber-400">Já existe {meta.label.toLowerCase()} {clash.slice(0, 5).join(', ')} aqui.</div>}
        {initial && initial.code !== clean && <div className="text-[11px] text-slate-400">Os racks dentro passam a usar o novo código.</div>}
        <button className="btn-primary w-full" disabled={!need || clash.length > 0} onClick={submit}>
          <Zap size={15} /> {initial ? 'Salvar alterações' : batch ? `Criar ${qty} fileiras` : `Criar ${meta.label.toLowerCase()}`}
        </button>
      </div>
    </PopDialog>
  );
}
