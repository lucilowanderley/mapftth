import { ArrowDownUp, Eraser, Loader2, MapPin, Route as RouteIcon, Search, Shuffle, UtilityPole, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api, errorMessage } from '../lib/api';
import { CABLE_CATEGORIES, CABLE_MODELS, STATUSES } from '../lib/catalog';
import { formatCoord, parsePair } from '../lib/coords';
import { searchPlaces, type Place } from '../lib/geocode';
import { distance } from '../lib/geo';
import { LAUNCH_DEFAULTS, orderByNearest, planFromPoles, planFromRoute, polesAlong, type LaunchPlan } from '../lib/launch';
import type { Cable, LatLng, NetNode, Status } from '../lib/types';
import { formatLength } from './ui';

type Mode = 'poles' | 'route';
type Category = keyof typeof LAUNCH_DEFAULTS;

/** Clique no mapa encaminhado ao painel (no mapa ou num objeto). */
export interface LaunchPick {
  at: LatLng;
  node?: NetNode;
  t: number;
}

/** O que o mapa desenha enquanto o painel está aberto. */
export interface LaunchPreview {
  color: string;
  /** Caminho da rua (modo início e fim). */
  route?: LatLng[];
  plan?: LaunchPlan;
  start?: LatLng | null;
  end?: LatLng | null;
  /** Postes escolhidos (modo pelos postes), na ordem. */
  order?: number[];
}

interface Endpoint {
  text: string;
  point: LatLng | null;
  /** Caixa/POP clicada no mapa: o cabo nasce conectado nela. */
  node?: NetNode;
}

interface Props {
  projectId: number;
  nodes: NetNode[];
  center: () => LatLng | null;
  pick: LaunchPick | null;
  onPreview: (p: LaunchPreview | null) => void;
  onFocus: (p: LatLng) => void;
  /** Enquadra o caminho no mapa. */
  onFit: (path: LatLng[]) => void;
  onDone: (cable: Cable, created: NetNode[]) => void;
  onError: (msg: string) => void;
  onClose: () => void;
}

const LIST_LIMIT = 200;

function loadDefaults(cat: Category) {
  try {
    return { ...LAUNCH_DEFAULTS[cat], ...JSON.parse(localStorage.getItem(`mapftth.launch.${cat}`) ?? '{}') };
  } catch {
    return { ...LAUNCH_DEFAULTS[cat] };
  }
}

export default function LaunchPanel({ projectId, nodes, center, pick, onPreview, onFocus, onFit, onDone, onError, onClose }: Props) {
  const [mode, setMode] = useState<Mode>('route');
  const models = CABLE_MODELS.filter((m) => m.category !== 'drop');
  const [modelId, setModelId] = useState('as-48');
  const model = models.find((m) => m.id === modelId) ?? models[0];
  const [category, setCategory] = useState<Category>('backbone');
  const [name, setName] = useState('');
  const [status, setStatus] = useState<Status>('planned');
  const [numbers, setNumbers] = useState(() => loadDefaults('backbone'));
  const [slacksOn, setSlacksOn] = useState(true);
  const [saving, setSaving] = useState(false);

  // Modo pelos postes
  const [selected, setSelected] = useState<number[]>([]);
  const [filter, setFilter] = useState('');

  // Modo início e fim
  const [start, setStart] = useState<Endpoint>({ text: '', point: null });
  const [end, setEnd] = useState<Endpoint>({ text: '', point: null });
  const [picking, setPicking] = useState<'start' | 'end' | null>(null);
  const [follow, setFollow] = useState(true);
  const [route, setRoute] = useState<{ path: LatLng[]; source: string } | null>(null);
  const [routing, setRouting] = useState(false);
  const [useExisting, setUseExisting] = useState(true);
  const [addPoles, setAddPoles] = useState(true);

  const poles = useMemo(() => nodes.filter((n) => n.type === 'pole'), [nodes]);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const color = CABLE_CATEGORIES[category].color;

  const changeCategory = (c: Category) => {
    setCategory(c);
    setNumbers(loadDefaults(c));
  };
  const changeNumber = (key: 'spacing' | 'slackEvery' | 'slackLength', v: number) => {
    const next = { ...numbers, [key]: v };
    setNumbers(next);
    try {
      localStorage.setItem(`mapftth.launch.${category}`, JSON.stringify(next));
    } catch {
      // ignora
    }
  };

  // Cliques no mapa
  useEffect(() => {
    if (!pick) return;
    if (mode === 'poles') {
      const n = pick.node;
      if (!n) return;
      if (n.type !== 'pole') return onError('Escolha postes. Clique nos postes do mapa ou marque na lista.');
      setSelected((s) => (s.includes(n.id) ? s.filter((x) => x !== n.id) : [...s, n.id]));
      return;
    }
    if (!picking) return;
    const n = pick.node;
    const at: LatLng = n ? [n.lat, n.lng] : pick.at;
    const ep: Endpoint = { text: n ? n.name : `${formatCoord(at[0])}, ${formatCoord(at[1])}`, point: at, node: n && n.type !== 'pole' ? n : undefined };
    if (picking === 'start') setStart(ep);
    else setEnd(ep);
    setPicking(picking === 'start' && !end.point ? 'end' : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pick]);

  // Mudou uma ponta: o caminho antigo não vale mais.
  useEffect(() => setRoute(null), [start.point, end.point, follow]);

  const existingAlong = useMemo(() => (route ? polesAlong(route.path, poles) : []), [route, poles]);

  const plan = useMemo<LaunchPlan | null>(() => {
    const every = slacksOn ? numbers.slackEvery : 0;
    if (mode === 'poles') {
      const list = selected.map((id) => byId.get(id)).filter((n): n is NetNode => !!n);
      return list.length >= 2 ? planFromPoles(list, every) : null;
    }
    if (!route) return null;
    return planFromRoute(route.path, { poles, useExisting, addPoles, spacing: numbers.spacing, slackEvery: every });
  }, [mode, selected, byId, route, poles, useExisting, addPoles, numbers, slacksOn]);

  useEffect(() => {
    onPreview({
      color,
      route: mode === 'route' ? route?.path : undefined,
      plan: plan ?? undefined,
      start: mode === 'route' ? start.point : null,
      end: mode === 'route' ? end.point : null,
      order: mode === 'poles' ? selected : undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color, mode, route, plan, start.point, end.point, selected]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => onPreview(null), []);

  async function traceRoute() {
    if (!start.point || !end.point) return onError('Informe o início e o fim do lançamento.');
    if (!follow) {
      setRoute({ path: [start.point, end.point], source: 'line' });
      onFit([start.point, end.point]);
      return;
    }
    setRouting(true);
    try {
      const r = await api.launchRoute(projectId, start.point, end.point);
      setRoute({ path: r.path, source: r.source });
      onFit(r.path);
      setUseExisting(polesAlong(r.path, poles).length > 0 || useExisting);
      if (r.source === 'line') onError('O serviço de rotas não respondeu: o caminho ficou em linha reta. Você pode tentar de novo.');
    } catch (e) {
      onError(errorMessage(e));
    }
    setRouting(false);
  }

  async function launch() {
    if (!plan) return;
    setSaving(true);
    try {
      const res = await api.launchCable(projectId, {
        cable: {
          name: name.trim() || undefined,
          category,
          model: model.id,
          fiber_count: model.fibers,
          fibers_per_tube: model.perTube,
          status,
          color,
          width: 4,
        },
        points: plan.points.map((p) => (p.pole_id != null ? { pole_id: p.pole_id } : { lat: p.at[0], lng: p.at[1], new_pole: !!p.new_pole })),
        slacks: plan.slacks.map((i) => ({ point: i, length_m: numbers.slackLength, kind: 'aerial' })),
        from_node_id: mode === 'route' ? (start.node?.id ?? null) : null,
        to_node_id: mode === 'route' ? (end.node?.id ?? null) : null,
      });
      onDone(res.cable, res.nodes);
      setSelected([]);
      setRoute(null);
    } catch (e) {
      onError(errorMessage(e));
    }
    setSaving(false);
  }

  // Lista de postes: os escolhidos na ordem, depois os outros pelo mais perto do último escolhido (ou do centro do mapa).
  const list = useMemo(() => {
    if (mode !== 'poles') return { chosen: [], others: [], total: 0 };
    const chosen = selected.map((id) => byId.get(id)).filter((n): n is NetNode => !!n);
    const last = chosen[chosen.length - 1];
    const ref: LatLng | null = last ? [last.lat, last.lng] : center();
    const q = filter.trim().toLowerCase();
    const rest = poles.filter((p) => !selected.includes(p.id) && (!q || p.name.toLowerCase().includes(q)));
    const sorted = ref ? rest.map((p) => ({ p, d: distance(ref, [p.lat, p.lng]) })).sort((a, b) => a.d - b.d) : rest.map((p) => ({ p, d: 0 }));
    return { chosen, others: sorted.slice(0, LIST_LIMIT), total: sorted.length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, selected, byId, poles, filter]);

  const slackTotal = plan ? plan.slacks.length * numbers.slackLength : 0;

  return (
    <div className="absolute top-3 left-3 z-[1000] panel w-80 max-h-[calc(100%-1.5rem)] overflow-y-auto text-sm">
      <div className="flex items-start justify-between px-4 py-3 border-b border-slate-800">
        <div>
          <div className="font-semibold">Lançar cabo</div>
          <div className="text-xs text-slate-400">Cabo com postes e reservas técnicas fixadas</div>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-white cursor-pointer" aria-label="Fechar">
          <X size={18} />
        </button>
      </div>

      <div className="p-3 space-y-3">
        <div className="grid grid-cols-2 gap-1 rounded-md bg-slate-800/60 p-1">
          {(
            [
              ['route', 'Início e fim'],
              ['poles', 'Escolher postes'],
            ] as [Mode, string][]
          ).map(([m, label]) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                setPicking(null);
              }}
              className={`rounded px-2 py-1 text-xs cursor-pointer ${mode === m ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Cabo */}
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="label">Tipo</span>
            <select className="input" value={category} onChange={(e) => changeCategory(e.target.value as Category)}>
              {(Object.keys(LAUNCH_DEFAULTS) as Category[]).map((c) => (
                <option key={c} value={c}>
                  {CABLE_CATEGORIES[c].label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">Modelo</span>
            <select className="input" value={model.id} onChange={(e) => setModelId(e.target.value)}>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">Nome</span>
            <input className="input" placeholder={model.name} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="block">
            <span className="label">Situação</span>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
              {(Object.keys(STATUSES) as Status[]).map((s) => (
                <option key={s} value={s}>
                  {STATUSES[s].label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {mode === 'route' ? (
          <div className="space-y-2">
            <EndpointField label="Início" value={start} onChange={setStart} picking={picking === 'start'} onPick={() => setPicking(picking === 'start' ? null : 'start')} onFocus={onFocus} />
            <EndpointField label="Fim" value={end} onChange={setEnd} picking={picking === 'end'} onPick={() => setPicking(picking === 'end' ? null : 'end')} onFocus={onFocus} />
            {picking && <div className="text-xs text-amber-300">Clique no mapa (ou numa caixa/poste) para marcar o {picking === 'start' ? 'início' : 'fim'}.</div>}
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} className="accent-emerald-500" />
              Seguir o percurso da rua, estrada ou avenida
            </label>
            <button className="btn-primary w-full justify-center" disabled={!start.point || !end.point || routing} onClick={traceRoute}>
              {routing ? <Loader2 size={14} className="animate-spin" /> : <RouteIcon size={14} />}
              {route ? 'Traçar de novo' : 'Traçar caminho'}
            </button>
            {route && (
              <div className="rounded-md border border-slate-700 p-2 space-y-2 text-xs">
                <div className="text-slate-400">
                  {route.source === 'line'
                    ? 'Caminho em linha reta.'
                    : 'Caminho pela rua (OpenStreetMap, roteador OSRM). Confira no mapa antes de lançar.'}
                </div>
                <div>
                  {existingAlong.length
                    ? `Já existem ${existingAlong.length} poste${existingAlong.length > 1 ? 's' : ''} cadastrado${existingAlong.length > 1 ? 's' : ''} no caminho.`
                    : 'Nenhum poste cadastrado no caminho.'}
                </div>
                {existingAlong.length > 0 && (
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={useExisting} onChange={(e) => setUseExisting(e.target.checked)} className="accent-emerald-500" />
                    Usar os postes que já existem
                  </label>
                )}
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={addPoles} onChange={(e) => setAddPoles(e.target.checked)} className="accent-emerald-500" />
                  Adicionar os postes que faltam, a cada
                  <input
                    type="number"
                    min={10}
                    max={500}
                    className="input !w-16 !px-1 !py-0.5 text-xs"
                    value={numbers.spacing}
                    onChange={(e) => changeNumber('spacing', Math.max(5, Number(e.target.value) || 0))}
                  />
                  m
                </label>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-xs text-slate-400">Clique nos postes do mapa ou marque na lista, na ordem do lançamento.</div>
            <div className="flex gap-1">
              <button className="btn-ghost !px-2 !py-1 text-xs" disabled={selected.length < 3} onClick={() => setSelected(orderByNearest(list.chosen).map((n) => n.id))} title="Reordena pelo caminho mais curto a partir do primeiro">
                <Shuffle size={13} /> Ordenar
              </button>
              <button className="btn-ghost !px-2 !py-1 text-xs" disabled={selected.length < 2} onClick={() => setSelected((s) => [...s].reverse())}>
                <ArrowDownUp size={13} /> Inverter
              </button>
              <button className="btn-ghost !px-2 !py-1 text-xs" disabled={!selected.length} onClick={() => setSelected([])}>
                <Eraser size={13} /> Limpar
              </button>
            </div>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-2.5 text-slate-500" />
              <input className="input pl-8" placeholder={`Buscar entre ${poles.length} postes`} value={filter} onChange={(e) => setFilter(e.target.value)} />
            </div>
            <ul className="max-h-56 overflow-y-auto rounded-md border border-slate-800 divide-y divide-slate-800">
              {list.chosen.map((p, i) => (
                <PoleRow key={p.id} pole={p} index={i + 1} checked onToggle={() => setSelected((s) => s.filter((x) => x !== p.id))} onFocus={onFocus} />
              ))}
              {list.others.map(({ p, d }) => (
                <PoleRow key={p.id} pole={p} dist={d} checked={false} onToggle={() => setSelected((s) => [...s, p.id])} onFocus={onFocus} />
              ))}
              {!poles.length && <li className="px-3 py-2 text-xs text-slate-400">Não há postes no projeto. Use "Início e fim" para criar, ou importe a tabela de postes.</li>}
            </ul>
            {list.total > LIST_LIMIT && <div className="text-[11px] text-slate-500">Mostrando os {LIST_LIMIT} mais próximos de {list.total}. Use a busca para achar outros.</div>}
          </div>
        )}

        {/* Reservas */}
        <div className="rounded-md border border-slate-700 p-2 text-xs space-y-1">
          <label className="flex items-center gap-2 flex-wrap">
            <input type="checkbox" checked={slacksOn} onChange={(e) => setSlacksOn(e.target.checked)} className="accent-emerald-500" />
            Reserva técnica a cada
            <input type="number" min={50} max={5000} className="input !w-16 !px-1 !py-0.5 text-xs" value={numbers.slackEvery} onChange={(e) => changeNumber('slackEvery', Math.max(1, Number(e.target.value) || 0))} />
            m, com
            <input type="number" min={1} max={200} className="input !w-14 !px-1 !py-0.5 text-xs" value={numbers.slackLength} onChange={(e) => changeNumber('slackLength', Math.max(1, Number(e.target.value) || 0))} />
            m
          </label>
          <div className="text-slate-500">A reserva fica fixada no poste mais perto de cada marca.</div>
        </div>

        {plan && (
          <div className="rounded-md bg-slate-800/60 p-2 text-xs space-y-0.5">
            <div>
              Cabo: <b>{formatLength(plan.length)}</b>
              {slackTotal > 0 && (
                <>
                  {' '}
                  + {formatLength(slackTotal)} de reserva = <b>{formatLength(plan.length + slackTotal)}</b>
                </>
              )}
            </div>
            <div className="flex items-center gap-1">
              <UtilityPole size={12} /> {plan.existing} poste{plan.existing === 1 ? '' : 's'} existente{plan.existing === 1 ? '' : 's'}
              {plan.created > 0 && <>, {plan.created} novo{plan.created === 1 ? '' : 's'}</>}
            </div>
            <div>
              {plan.slacks.length} reserva{plan.slacks.length === 1 ? '' : 's'} técnica{plan.slacks.length === 1 ? '' : 's'}
            </div>
            {(start.node || end.node) && mode === 'route' && (
              <div>Conectado em {[start.node?.name, end.node?.name].filter(Boolean).join(' e ')}</div>
            )}
          </div>
        )}

        <button className="btn-primary w-full justify-center" disabled={!plan || saving} onClick={launch}>
          {saving && <Loader2 size={14} className="animate-spin" />}
          Lançar cabo
        </button>
      </div>
    </div>
  );
}

function PoleRow({ pole, index, dist, checked, onToggle, onFocus }: { pole: NetNode; index?: number; dist?: number; checked: boolean; onToggle: () => void; onFocus: (p: LatLng) => void }) {
  return (
    <li className="flex items-center gap-2 px-2 py-1 text-xs hover:bg-slate-800/60">
      <input type="checkbox" checked={checked} onChange={onToggle} className="accent-emerald-500" />
      <span className="w-5 text-right text-emerald-400 font-semibold">{index ?? ''}</span>
      <button className="flex-1 text-left truncate cursor-pointer" onClick={() => onFocus([pole.lat, pole.lng])} title="Ver no mapa">
        {pole.name}
      </button>
      {dist != null && dist > 0 && <span className="text-slate-500">{formatLength(dist)}</span>}
    </li>
  );
}

function EndpointField({
  label,
  value,
  onChange,
  picking,
  onPick,
  onFocus,
}: {
  label: string;
  value: Endpoint;
  onChange: (v: Endpoint) => void;
  picking: boolean;
  onPick: () => void;
  onFocus: (p: LatLng) => void;
}) {
  const [results, setResults] = useState<Place[]>([]);
  const [typed, setTyped] = useState(false);

  useEffect(() => {
    if (!typed) return;
    const pair = parsePair(value.text);
    if (pair) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => searchPlaces(value.text).then(setResults).catch(() => setResults([])), 450);
    return () => clearTimeout(t);
  }, [value.text, typed]);

  return (
    <div className="relative">
      <span className="label">{label}</span>
      <div className="flex gap-1">
        <input
          className="input"
          placeholder="Endereço ou -8.0476, -34.877"
          value={value.text}
          onChange={(e) => {
            setTyped(true);
            const pair = parsePair(e.target.value);
            onChange({ text: e.target.value, point: pair, node: undefined });
          }}
          onBlur={() => setTimeout(() => setResults([]), 200)}
        />
        <button
          className={`shrink-0 rounded-md px-2 cursor-pointer ${picking ? 'bg-amber-500 text-slate-900' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
          onClick={onPick}
          title="Marcar no mapa"
        >
          <MapPin size={14} />
        </button>
      </div>
      {value.point && <div className="text-[11px] text-slate-500 mt-0.5">{value.node ? `${value.node.name} (o cabo nasce conectado)` : `${formatCoord(value.point[0])}, ${formatCoord(value.point[1])}`}</div>}
      {results.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full rounded-md border border-slate-700 bg-slate-900 text-xs shadow-xl">
          {results.map((r) => (
            <li key={r.label}>
              <button
                className="w-full text-left px-3 py-1.5 hover:bg-slate-800 truncate cursor-pointer"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setTyped(false);
                  setResults([]);
                  onChange({ text: r.label.split(',').slice(0, 2).join(','), point: [r.lat, r.lng] });
                  onFocus([r.lat, r.lng]);
                }}
              >
                {r.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
