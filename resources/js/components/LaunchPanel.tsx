import { ArrowDown, ArrowDownUp, ArrowUp, Eraser, Loader2, MapPin, Plus, Route as RouteIcon, Search, Shuffle, UtilityPole, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api, errorMessage, type LaunchRoute } from '../lib/api';
import { CABLE_CATEGORIES, CABLE_MODELS, STATUSES } from '../lib/catalog';
import { formatCoord, parsePair } from '../lib/coords';
import { searchPlaces, type Place } from '../lib/geocode';
import { distance } from '../lib/geo';
import { LAUNCH_DEFAULTS, orderByNearest, planFromPoles, planFromRoute, polesAlong, type LaunchPlan } from '../lib/launch';
import type { Cable, LatLng, NetNode, Status } from '../lib/types';
import { formatLength } from './ui';

type Mode = 'poles' | 'route' | 'refs';
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
  /** Pontos de referência (modo pontos de referência), na ordem. */
  refs?: LatLng[];
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
  const [route, setRoute] = useState<LaunchRoute | null>(null);
  /** Caminhos possíveis, do melhor (vias preferidas: BR, rodovias, estradas, avenidas, ruas) para o pior. */
  const [routeOptions, setRouteOptions] = useState<LaunchRoute[]>([]);
  const [routing, setRouting] = useState(false);
  const [useExisting, setUseExisting] = useState(true);
  const [addPoles, setAddPoles] = useState(true);

  // Modo pontos de referência: o percurso passa por todos, na ordem (o 1º é o início, o último o fim).
  const [refs, setRefs] = useState<Endpoint[]>([]);
  const [refDraft, setRefDraft] = useState<Endpoint>({ text: '', point: null });
  const [refPicking, setRefPicking] = useState(true);
  const addRef = (ep: Endpoint) => ep.point && setRefs((r) => [...r, ep]);
  const moveRef = (i: number, d: -1 | 1) =>
    setRefs((r) => {
      const j = i + d;
      if (j < 0 || j >= r.length) return r;
      const next = [...r];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  /** Pontas e pontos do meio do percurso (modos início e fim / pontos de referência). */
  const ends = useMemo(() => {
    if (mode === 'refs') return refs.length >= 2 ? { a: refs[0], b: refs[refs.length - 1], via: refs.slice(1, -1) } : null;
    if (mode === 'route') return start.point && end.point ? { a: start, b: end, via: [] as Endpoint[] } : null;
    return null;
  }, [mode, refs, start, end]);

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
    if (mode === 'refs') {
      if (!refPicking) return;
      const n = pick.node;
      const at: LatLng = n ? [n.lat, n.lng] : pick.at;
      addRef({ text: n ? n.name : `${formatCoord(at[0])}, ${formatCoord(at[1])}`, point: at, node: n && n.type !== 'pole' ? n : undefined });
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
  useEffect(() => {
    setRoute(null);
    setRouteOptions([]);
  }, [start.point, end.point, follow, refs, mode]);

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
      route: mode !== 'poles' ? route?.path : undefined,
      plan: plan ?? undefined,
      start: mode === 'route' ? start.point : null,
      end: mode === 'route' ? end.point : null,
      order: mode === 'poles' ? selected : undefined,
      refs: mode === 'refs' ? refs.map((r) => r.point!) : undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color, mode, route, plan, start.point, end.point, selected, refs]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => onPreview(null), []);

  async function traceRoute() {
    if (!ends) return onError(mode === 'refs' ? 'Adicione pelo menos dois pontos de referência.' : 'Informe o início e o fim do lançamento.');
    const pts = [ends.a, ...ends.via, ends.b].map((e) => e.point!);
    if (!follow) {
      let d = 0;
      for (let i = 1; i < pts.length; i++) d += distance(pts[i - 1], pts[i]);
      setRoute({ path: pts, source: 'line', distance_m: d, roads: [] });
      setRouteOptions([]);
      onFit(pts);
      return;
    }
    setRouting(true);
    try {
      const r = await api.launchRoute(projectId, pts[0], pts[pts.length - 1], pts.slice(1, -1));
      setRoute(r.options?.[0] ?? r);
      setRouteOptions(r.options ?? []);
      onFit(r.path);
      setUseExisting(polesAlong(r.path, poles).length > 0 || useExisting);
      if (r.source === 'line') onError('O serviço de rotas não respondeu: o caminho ficou em linha reta. Você pode tentar de novo.');
      else if (r.straight_legs?.length) onError(`O serviço de rotas não respondeu no trecho ${r.straight_legs.join(', ')}: ficou em linha reta.`);
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
        from_node_id: ends?.a.node?.id ?? null,
        to_node_id: ends?.b.node?.id ?? null,
      });
      onDone(res.cable, res.nodes);
      setSelected([]);
      setRefs([]);
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

  // Seguir a via, traçar e o resultado do caminho (modos início e fim e pontos de referência).
  const routeControls = (
    <>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} className="accent-emerald-500" />
              Seguir o percurso da rua, estrada ou avenida
            </label>
            <button className="btn-primary w-full justify-center" disabled={!ends || routing} onClick={traceRoute}>
              {routing ? <Loader2 size={14} className="animate-spin" /> : <RouteIcon size={14} />}
              {route ? 'Traçar de novo' : 'Traçar caminho'}
            </button>
            {route && (
              <div className="rounded-md border border-slate-700 p-2 space-y-2 text-xs">
                <div className="text-slate-400">
                  {route.source === 'line'
                    ? 'Caminho em linha reta.'
                    : 'Caminho pelas vias do OpenStreetMap (roteador OSRM), preferindo BR, rodovias, estradas, avenidas e ruas, nessa ordem. Confira no mapa antes de lançar.'}
                </div>
                {routeOptions.length > 1 && (
                  <div className="space-y-1">
                    {routeOptions.map((o, i) => (
                      <label key={i} className={`flex items-start gap-2 rounded px-1.5 py-1 cursor-pointer ${route.path === o.path ? 'bg-slate-800' : 'hover:bg-slate-800/60'}`}>
                        <input
                          type="radio"
                          name="launch-route"
                          checked={route.path === o.path}
                          onChange={() => {
                            setRoute(o);
                            onFit(o.path);
                          }}
                          className="accent-emerald-500 mt-0.5"
                        />
                        <span className="min-w-0 flex-1">
                          <b>Caminho {i + 1}</b>
                          {i === 0 && ' (recomendado)'} · {formatLength(o.distance_m)}
                          <RoadSummary route={o} />
                        </span>
                      </label>
                    ))}
                  </div>
                )}
                {routeOptions.length <= 1 && route.roads.length > 0 && <RoadSummary route={route} />}
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
    </>
  );

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
        <div className="grid grid-cols-3 gap-1 rounded-md bg-slate-800/60 p-1">
          {(
            [
              ['route', 'Início e fim'],
              ['refs', 'Pontos de referência'],
              ['poles', 'Escolher postes'],
            ] as [Mode, string][]
          ).map(([m, label]) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                setPicking(null);
              }}
              className={`rounded px-1.5 py-1 text-xs leading-tight cursor-pointer ${mode === m ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}
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
            {routeControls}
          </div>
        ) : mode === 'refs' ? (
          <div className="space-y-2">
            <div className="text-xs text-slate-400">
              Adicione os pontos por onde o cabo deve passar, na ordem do percurso: clique no mapa ou digite o endereço/coordenada. O 1º ponto é o início e o
              último, o fim. O sistema liga um ponto ao outro pelas vias.
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={refPicking} onChange={(e) => setRefPicking(e.target.checked)} className="accent-emerald-500" />
              Clique no mapa adiciona ponto
            </label>
            <div className="flex items-end gap-1">
              <div className="flex-1 min-w-0">
                <EndpointField label="Adicionar ponto" value={refDraft} onChange={setRefDraft} picking={refPicking} onPick={() => setRefPicking(!refPicking)} onFocus={onFocus} />
              </div>
              <button
                className="btn-ghost !px-2 !py-2 mb-[1px]"
                disabled={!refDraft.point}
                title="Adicionar à lista"
                onClick={() => {
                  addRef(refDraft);
                  setRefDraft({ text: '', point: null });
                }}
              >
                <Plus size={14} />
              </button>
            </div>
            {refs.length > 0 && (
              <ul className="rounded-md border border-slate-800 divide-y divide-slate-800 max-h-48 overflow-y-auto">
                {refs.map((r, i) => (
                  <li key={i} className="flex items-center gap-1.5 px-2 py-1 text-xs">
                    <span className="w-5 text-right font-semibold text-emerald-400">{i + 1}</span>
                    <button className="flex-1 min-w-0 text-left truncate cursor-pointer" onClick={() => onFocus(r.point!)} title="Ver no mapa">
                      {r.text}
                      {i === 0 && <span className="text-slate-500"> · início</span>}
                      {i === refs.length - 1 && refs.length > 1 && <span className="text-slate-500"> · fim</span>}
                    </button>
                    <button className="text-slate-400 hover:text-white disabled:opacity-30 cursor-pointer" disabled={i === 0} onClick={() => moveRef(i, -1)} title="Subir">
                      <ArrowUp size={13} />
                    </button>
                    <button className="text-slate-400 hover:text-white disabled:opacity-30 cursor-pointer" disabled={i === refs.length - 1} onClick={() => moveRef(i, 1)} title="Descer">
                      <ArrowDown size={13} />
                    </button>
                    <button className="text-slate-400 hover:text-red-400 cursor-pointer" onClick={() => setRefs((l) => l.filter((_, k) => k !== i))} title="Remover">
                      <X size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {refs.length > 0 && (
              <div className="flex gap-1">
                <button className="btn-ghost !px-2 !py-1 text-xs" disabled={refs.length < 2} onClick={() => setRefs((r) => [...r].reverse())}>
                  <ArrowDownUp size={13} /> Inverter
                </button>
                <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setRefs([])}>
                  <Eraser size={13} /> Limpar
                </button>
              </div>
            )}
            {routeControls}
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
            {(ends?.a.node || ends?.b.node) && <div>Conectado em {[ends.a.node?.name, ends.b.node?.name].filter(Boolean).join(' e ')}</div>}
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

/** Vias usadas no caminho: metros por classe e os nomes das principais (ex.: BR-101, Av. Brasil). */
function RoadSummary({ route }: { route: LaunchRoute }) {
  return (
    <span className="block text-slate-400">
      {route.roads.map((r) => `${r.label} ${formatLength(r.meters)}`).join(' · ')}
      {route.names && route.names.length > 0 && <span className="block text-slate-500 truncate">{route.names.join(', ')}</span>}
    </span>
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
