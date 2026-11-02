import {
  Activity,
  BarChart3,
  Cable as CableIcon,
  FileText,
  History,
  Pentagon,
  Radar,
  Users,
  UtilityPole,
  ChevronLeft,
  Download,
  Hexagon,
  Home,
  Crosshair,
  Layers,
  MousePointer2,
  Ruler,
  Search,
  Server,
  Settings as SettingsIcon,
  SquareStack,
  Upload,
  User,
  Zap,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Circle, CircleMarker, MapContainer, Marker, Polygon, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import { Link, useParams } from 'react-router-dom';
import L from 'leaflet';
import { api, errorMessage } from '../lib/api';
import { POWER_COLORS, clientBudget, powerLevel, type BudgetResult } from '../lib/budget';
import { CABLE_CATEGORIES, CABLE_MODELS, NODE_TYPES } from '../lib/catalog';
import { distance, pathLength } from '../lib/geo';
import type { Activity as ActivityItem, Area, Cable, CableCategory, LatLng, NetNode, NodeType, Project, Role, Settings } from '../lib/types';
import { viability } from '../lib/analysis';
import { LAYERS, MAP_ENGINES, MAP_STYLES, availableEngines, googleTileUrl, loadEngine, loadStyle, saveEngine, saveStyle, type MapEngine, type MapStyle } from '../lib/basemaps';
import { appConfig } from '../lib/user';
import { midpointIcon, nodeIcon, vertexIcon } from '../components/markers';
import { formatCoord, parseLatLng, parsePair } from '../lib/coords';
import { movePath, roundLatLng } from '../lib/move';
import { Logo, Toast, formatLength } from '../components/ui';
import Inspector from '../components/Inspector';
import DiagramEditor from '../components/DiagramEditor';
import BudgetModal from '../components/BudgetModal';
import SettingsModal from '../components/SettingsModal';
import NetworkAnalysis from '../components/NetworkAnalysis';
import TeamModal, { ROLE_LABELS } from '../components/TeamModal';
import HistoryModal from '../components/HistoryModal';
import DashboardModal from '../components/DashboardModal';
import ReportModal from '../components/ReportModal';
import PolesModal from '../components/PolesModal';
import OtdrModal from '../components/OtdrModal';
import ViabilityPanel from '../components/ViabilityPanel';
import AreaPanel from '../components/AreaPanel';

type Tool = 'select' | NodeType | 'cable' | 'ruler' | 'area' | 'viability';

const TOOLS: { id: Tool; label: string; icon: React.ReactNode }[] = [
  { id: 'select', label: 'Selecionar', icon: <MousePointer2 size={18} /> },
  { id: 'cto', label: 'CTO', icon: <SquareStack size={18} /> },
  { id: 'ceo', label: 'CEO', icon: <Hexagon size={18} /> },
  { id: 'pop', label: 'POP', icon: <Server size={18} /> },
  { id: 'pole', label: 'Poste', icon: <Zap size={18} /> },
  { id: 'client', label: 'Cliente', icon: <User size={18} /> },
  { id: 'cable', label: 'Cabo', icon: <CableIcon size={18} /> },
  { id: 'area', label: 'Área', icon: <Pentagon size={18} /> },
  { id: 'ruler', label: 'Régua', icon: <Ruler size={18} /> },
  { id: 'viability', label: 'Viabilidade', icon: <Radar size={18} /> },
];

/** Ferramentas que só leem a rede (liberadas para quem tem acesso de leitura). */
const READ_TOOLS: Tool[] = ['select', 'ruler', 'viability'];


export type Selection = { kind: 'node'; id: number } | { kind: 'cable'; id: number } | { kind: 'area'; id: number } | null;

export default function MapPage() {
  const { id } = useParams();
  const projectId = Number(id);
  const [project, setProject] = useState<Project | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [nodes, setNodes] = useState<NetNode[]>([]);
  const [cables, setCables] = useState<Cable[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [role, setRole] = useState<Role>('viewer');
  const [areaDraft, setAreaDraft] = useState<LatLng[]>([]);
  const [viaPoint, setViaPoint] = useState<LatLng | null>(null);
  const [viaRadius, setViaRadius] = useState(250);
  const [marker, setMarker] = useState<{
    at: LatLng;
    label: string;
    route: LatLng[];
  } | null>(null);
  const [history, setHistory] = useState<{
    title: string;
    filter?: { type: string; subject_id: number };
  } | null>(null);
  const [report, setReport] = useState<{
    title: string;
    polygon?: LatLng[];
  } | null>(null);
  const [otdr, setOtdr] = useState<{
    title: string;
    result: BudgetResult;
  } | null>(null);
  const [recent, setRecent] = useState<ActivityItem[] | null>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [selection, setSelection] = useState<Selection>(null);
  const [draft, setDraft] = useState<{
    path: LatLng[];
    from: number | null;
  } | null>(null);
  const [ruler, setRuler] = useState<LatLng[]>([]);
  const [cursor, setCursor] = useState<LatLng | null>(null);
  // Estilo (no mapa) e motor (em Configurações) ficam salvos neste navegador.
  const engines = useMemo(() => availableEngines(!!appConfig.googleMapsKey), []);
  const [engine, setEngineState] = useState<MapEngine>(() => loadEngine(engines));
  const [mapStyle, setMapStyleState] = useState<MapStyle>(loadStyle);
  const setEngine = (e: MapEngine) => {
    setEngineState(e);
    saveEngine(e);
  };
  const setMapStyle = (st: MapStyle) => {
    setMapStyleState(st);
    saveStyle(st);
  };
  const [visible, setVisible] = useState<Record<string, boolean>>({
    cto: true,
    ceo: true,
    pop: true,
    pole: true,
    client: true,
    backbone: true,
    distribution: true,
    drop: true,
    areas: true,
  });
  const [labels, setLabels] = useState(true);
  const [zoom, setZoom] = useState(16);
  const [diagramNodeId, setDiagramNodeId] = useState<number | null>(null);
  const [budget, setBudget] = useState<{
    title: string;
    result: BudgetResult;
  } | null>(null);
  const [modal, setModal] = useState<'settings' | 'analysis' | 'team' | 'dashboard' | 'poles' | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    kind?: 'ok' | 'error';
  } | null>(null);
  const [search, setSearch] = useState('');
  /** Objeto sendo arrastado (para o traçado dos cabos acompanhar em tempo real). */
  const [drag, setDrag] = useState<{ id: number; from: LatLng; at: LatLng } | null>(null);
  /** Vértice de cabo sendo arrastado; insert = novo vértice criado a partir do ponto médio. */
  const [vertexDrag, setVertexDrag] = useState<{ cableId: number; index: number; at: LatLng; insert: boolean } | null>(null);
  /** Objeto solto numa nova posição, aguardando confirmação. */
  const [pendingMove, setPendingMove] = useState<{ node: NetNode; at: LatLng; marker: L.Marker } | null>(null);
  const [confirmMoves, setConfirmMovesState] = useState<boolean>(() => {
    try {
      return localStorage.getItem('mapftth.confirmMove') !== '0';
    } catch {
      return true;
    }
  });
  const setConfirmMoves = (v: boolean) => {
    setConfirmMovesState(v);
    try {
      localStorage.setItem('mapftth.confirmMove', v ? '1' : '0');
    } catch {
      // ignora
    }
  };
  const [lastMove, setLastMove] = useState<{ id: number; from: LatLng; name: string } | null>(null);
  const [placeLat, setPlaceLat] = useState('');
  const [placeLng, setPlaceLng] = useState('');
  const [editorFocus, setEditorFocus] = useState(0);
  const lastClick = useRef<{ key: string; t: number }>({ key: '', t: 0 });
  /**
   * O react-leaflet reposiciona o marcador sempre que recebe um array de posição novo.
   * Reaproveitar o mesmo array enquanto o objeto não muda evita que uma renderização
   * no meio do arrasto (ex.: movimento do mouse) devolva o marcador ao lugar original.
   */
  const positions = useRef(new WeakMap<NetNode, LatLng>());
  const positionOf = (n: NetNode): LatLng => {
    let p = positions.current.get(n);
    if (!p) positions.current.set(n, (p = [n.lat, n.lng]));
    return p;
  };
  const mapRef = useRef<L.Map | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () =>
    api.project(projectId).then((d) => {
      setProject(d.project);
      setSettings(d.settings);
      setNodes(d.nodes);
      setCables(d.cables);
      setAreas(d.areas);
      setRole(d.role);
    });

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea,select')) return;
      if (pendingMove) {
        if (e.key === 'Enter') confirmPendingMove();
        if (e.key === 'Escape') cancelPendingMove();
        return;
      }
      if (e.key === 'Escape') {
        setDraft(null);
        setRuler([]);
        setAreaDraft([]);
        setTool('select');
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && lastMove && !readOnly) {
        e.preventDefault();
        undoMove();
      }
      if (e.key === 'Enter' && draft) finishCable();
      if (e.key === 'Enter' && areaDraft.length >= 3) finishArea();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const network = useMemo(() => (settings ? { nodes, cables, settings } : null), [nodes, cables, settings]);

  const clientPower = useMemo(() => {
    const map = new Map<number, BudgetResult>();
    if (!network) return map;
    nodes.filter((n) => n.type === 'client').forEach((n) => map.set(n.id, clientBudget(network, n)));
    return map;
  }, [network, nodes]);

  const notify = (message: string, kind: 'ok' | 'error' = 'ok') => setToast({ message, kind });
  const readOnly = role === 'viewer';
  const canManage = role === 'owner' || role === 'admin';

  const viaOptions = useMemo(() => (network && viaPoint ? viability(network, viaPoint, viaRadius) : []), [network, viaPoint, viaRadius]);

  useEffect(() => {
    if (modal === 'dashboard') api.activity(projectId).then(setRecent);
  }, [modal, projectId]);

  async function finishArea(points = areaDraft) {
    if (points.length < 3) return;
    try {
      const area = await api.createArea(projectId, { polygon: points });
      setAreas((list) => [...list, area]);
      setSelection({ kind: 'area', id: area.id });
      notify('Área criada');
    } catch (e) {
      notify(errorMessage(e), 'error');
    }
    setAreaDraft([]);
    setTool('select');
  }

  function focusNode(n: NetNode) {
    mapRef.current?.setView([n.lat, n.lng], Math.max(mapRef.current.getZoom(), 18));
    setSelection({ kind: 'node', id: n.id });
  }

  const mergeCables = (updated: Cable[]) => setCables((list) => list.map((c) => updated.find((u) => u.id === c.id) ?? c));
  const mergeNodes = (updated: NetNode[]) => setNodes((list) => list.map((n) => updated.find((u) => u.id === n.id) ?? n));

  async function addNode(type: NodeType, at: LatLng) {
    try {
      const node = await api.createNode(projectId, {
        type,
        lat: at[0],
        lng: at[1],
      });
      setNodes((list) => [...list, node]);
      setSelection({ kind: 'node', id: node.id });
      notify(`${NODE_TYPES[type].label} adicionado`);
    } catch (e) {
      notify(errorMessage(e), 'error');
    }
  }

  async function addNodeAtCoords() {
    if (tool === 'select' || !(tool in NODE_TYPES)) return;
    const r = parseLatLng(placeLat, placeLng);
    if (typeof r === 'string') return notify(r, 'error');
    await addNode(tool as NodeType, r);
    mapRef.current?.setView(r, Math.max(mapRef.current.getZoom(), 18));
    setPlaceLat('');
    setPlaceLng('');
  }

  /** Move um objeto; as pontas dos cabos ligados e os cabos que passam por ele acompanham. */
  async function moveNode(node: NetNode, target: LatLng, record = true) {
    const from: LatLng = [node.lat, node.lng];
    const at = roundLatLng(target);
    if (from[0] === at[0] && from[1] === at[1]) return;
    setNodes((list) => list.map((n) => (n.id === node.id ? { ...n, lat: at[0], lng: at[1] } : n)));
    setCables((list) => list.map((c) => ({ ...c, path: movePath(c, node.id, from, at) })));
    try {
      const r = await api.updateNode(node.id, { lat: at[0], lng: at[1] });
      mergeNodes([r.node]);
      mergeCables(r.cables);
      if (record) {
        setLastMove({ id: node.id, from, name: node.name });
        notify(`${node.name} movido para ${formatCoord(at[0])}, ${formatCoord(at[1])}. Ctrl+Z desfaz.`);
      }
    } catch (e) {
      notify(errorMessage(e), 'error');
      load();
    }
  }

  function confirmPendingMove() {
    if (!pendingMove) return;
    moveNode(pendingMove.node, pendingMove.at);
    setPendingMove(null);
    setDrag(null);
  }

  /** Cancelar devolve o marcador (e os cabos) à posição original. */
  function cancelPendingMove() {
    if (!pendingMove) return;
    pendingMove.marker.setLatLng([pendingMove.node.lat, pendingMove.node.lng]);
    setPendingMove(null);
    setDrag(null);
  }

  function undoMove() {
    if (!lastMove) return;
    const node = nodes.find((n) => n.id === lastMove.id);
    setLastMove(null);
    if (!node) return;
    moveNode(node, lastMove.from, false).then(() => notify(`Movimento de ${lastMove.name} desfeito`));
  }

  async function saveCablePath(cable: Cable, raw: LatLng[]) {
    const path = raw.map(roundLatLng);
    setCables((list) => list.map((c) => (c.id === cable.id ? { ...c, path } : c)));
    try {
      const r = await api.updateCable(cable.id, { path });
      mergeCables([r.cable]);
      mergeNodes(r.nodes);
    } catch (e) {
      notify(errorMessage(e), 'error');
      load();
    }
  }

  /** Traçado exibido de um cabo, considerando um arrasto em andamento. */
  function displayPath(c: Cable): LatLng[] {
    let path = drag ? movePath(c, drag.id, drag.from, drag.at) : c.path;
    if (vertexDrag && vertexDrag.cableId === c.id) {
      const { index, at, insert } = vertexDrag;
      path = insert ? [...path.slice(0, index), at, ...path.slice(index)] : path.map((p, i) => (i === index ? at : p));
    }
    return path;
  }

  /** Detecta duplo clique "na mão": o 1º clique troca o ícone (seleção), o que impede o dblclick nativo. */
  function isDoubleClick(key: string) {
    const now = Date.now();
    const double = lastClick.current.key === key && now - lastClick.current.t < 450;
    lastClick.current = double ? { key: '', t: 0 } : { key, t: now };
    return double;
  }

  /** Duplo clique: caixas e POP abrem o diagrama/editor; demais objetos abrem o painel de edição. */
  function openEditor(n: NetNode) {
    setSelection({ kind: 'node', id: n.id });
    if (['cto', 'ceo', 'pop'].includes(n.type)) setDiagramNodeId(n.id);
    else setEditorFocus(Date.now());
  }

  function nodeClicked(node: NetNode) {
    if (tool === 'viability') {
      setViaPoint([node.lat, node.lng]);
      return;
    }
    if (tool === 'area') {
      setAreaDraft((a) => [...a, [node.lat, node.lng]]);
      return;
    }
    if (tool === 'cable') {
      const point: LatLng = [node.lat, node.lng];
      if (!draft) {
        setDraft({ path: [point], from: node.id });
      } else if (node.id !== draft.from || draft.path.length > 1) {
        finishCable([...draft.path, point], node.id);
      }
      return;
    }
    if (tool === 'ruler') {
      setRuler((r) => [...r, [node.lat, node.lng]]);
      return;
    }
    setSelection({ kind: 'node', id: node.id });
  }

  async function finishCable(path = draft?.path ?? [], to: number | null = null) {
    if (!draft || path.length < 2) {
      setDraft(null);
      return;
    }
    const model = CABLE_MODELS.find((m) => m.id === 'as-12')!;
    const fromNode = nodes.find((n) => n.id === draft.from);
    const toNode = nodes.find((n) => n.id === to);
    const isDrop = fromNode?.type === 'client' || toNode?.type === 'client';
    const m = isDrop ? CABLE_MODELS[0] : model;
    try {
      const cable = await api.createCable(projectId, {
        name: m.name,
        model: m.id,
        fiber_count: m.fibers,
        fibers_per_tube: m.perTube,
        category: m.category,
        color: CABLE_CATEGORIES[m.category].color,
        width: isDrop ? 2 : 4,
        path,
        from_node_id: draft.from,
        to_node_id: to,
      });
      setCables((list) => [...list, cable]);
      setSelection({ kind: 'cable', id: cable.id });
      notify('Cabo criado');
    } catch (e) {
      notify(errorMessage(e), 'error');
    }
    setDraft(null);
  }

  async function connectClient(client: NetNode) {
    const ctos = nodes.filter((n) => n.type === 'cto');
    if (!ctos.length) return notify('Não há CTOs no projeto.', 'error');
    const nearest = ctos.reduce((best, n) =>
      distance([n.lat, n.lng], [client.lat, client.lng]) < distance([best.lat, best.lng], [client.lat, client.lng]) ? n : best,
    );
    const m = CABLE_MODELS[0];
    const cable = await api.createCable(projectId, {
      name: `Drop ${client.name}`,
      model: m.id,
      fiber_count: 1,
      fibers_per_tube: 1,
      category: 'drop',
      color: CABLE_CATEGORIES.drop.color,
      width: 2,
      path: [
        [nearest.lat, nearest.lng],
        [client.lat, client.lng],
      ],
      from_node_id: nearest.id,
      to_node_id: client.id,
    });
    setCables((list) => [...list, cable]);
    notify(`Drop ligado à ${nearest.name}. Abra o diagrama da caixa para fundir a fibra no splitter.`);
  }

  async function importFile(file: File) {
    try {
      const r = await api.importKmz(projectId, file);
      await load();
      notify(`Importados ${r.nodes} pontos e ${r.cables} cabos`);
    } catch (e) {
      notify(errorMessage(e), 'error');
    }
  }

  const selectedNode = selection?.kind === 'node' ? nodes.find((n) => n.id === selection.id) : undefined;
  const selectedCable = selection?.kind === 'cable' ? cables.find((c) => c.id === selection.id) : undefined;
  const selectedArea = selection?.kind === 'area' ? areas.find((a) => a.id === selection.id) : undefined;
  const diagramNode = nodes.find((n) => n.id === diagramNodeId);
  // Pontos médios do cabo selecionado (memorizados pelo mesmo motivo de positionOf).
  const selectedPath = selectedCable?.path;
  const midpoints = useMemo<LatLng[]>(
    () => (selectedPath ? selectedPath.slice(1).map((p, i) => [(selectedPath[i][0] + p[0]) / 2, (selectedPath[i][1] + p[1]) / 2]) : []),
    [selectedPath],
  );

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    const pair = parsePair(search);
    return [
      ...(pair
        ? [
            {
              kind: 'coord' as const,
              id: 0,
              label: `${formatCoord(pair[0])}, ${formatCoord(pair[1])}`,
              sub: 'Ir para coordenada',
              at: pair,
            },
          ]
        : []),
      ...nodes
        .filter((n) => n.name.toLowerCase().includes(q))
        .map((n) => ({
          kind: 'node' as const,
          id: n.id,
          label: n.name,
          sub: NODE_TYPES[n.type].label,
          at: [n.lat, n.lng] as LatLng,
        })),
      ...cables
        .filter((c) => c.name.toLowerCase().includes(q))
        .map((c) => ({
          kind: 'cable' as const,
          id: c.id,
          label: c.name,
          sub: 'Cabo',
          at: c.path[0],
        })),
    ].slice(0, 8);
  }, [search, nodes, cables]);

  if (!project || !settings || !network) {
    return <div className="h-full flex items-center justify-center text-slate-400">Carregando projeto...</div>;
  }

  const overlayOpen = !!(diagramNode || modal || budget || history || report || otdr);
  const deployed = nodes.filter((n) => n.status === 'deployed' || n.status === 'certified').length;
  const pct = nodes.length ? Math.round((deployed / nodes.length) * 100) : 0;
  const hint =
    tool === 'area'
      ? `Clique para marcar os vértices da área (${areaDraft.length}). Enter ou "Finalizar área" conclui. Esc cancela.`
      : tool === 'viability'
        ? 'Clique no local do cliente ou busque o endereço no painel.'
        : readOnly && tool === 'select'
          ? 'Acesso somente leitura. Clique num elemento para ver detalhes.'
          : tool === 'cable'
            ? draft
              ? 'Clique para adicionar pontos. Clique numa caixa ou pressione Enter para finalizar. Esc cancela.'
              : 'Clique numa caixa (ou no mapa) para iniciar o cabo.'
            : tool === 'ruler'
              ? `Régua: ${formatLength(pathLength(ruler))} · clique para medir, Esc limpa.`
              : tool !== 'select'
                ? `Clique no mapa para adicionar ${NODE_TYPES[tool].label} ou digite as coordenadas no painel acima.`
                : selectedCable
                  ? 'Arraste os quadrados para mover vértices e os círculos para criar novos. Botão direito num vértice o remove.'
                  : 'Clique para selecionar, duplo clique abre o editor. Arraste um objeto para reposicioná-lo.';

  return (
    <div className="h-full flex">
      {/* Barra lateral */}
      <aside className="w-60 shrink-0 border-r border-slate-800 bg-slate-900 flex flex-col">
        <div className="p-4 border-b border-slate-800">
          <Logo />
        </div>
        <div className="p-3 border-b border-slate-800">
          <div className="text-sm font-semibold truncate" title={project.name}>
            {project.name}
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-slate-800">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
          </div>
          <div className="text-xs text-slate-400 mt-1">
            {pct}% implantado · {ROLE_LABELS[role].label}
          </div>
        </div>
        <div className="p-3 relative">
          <Search size={14} className="absolute left-5 top-5.5 text-slate-500" />
          <input className="input pl-8 py-1.5" placeholder="Buscar CTO, cabo ou lat, lng" value={search} onChange={(e) => setSearch(e.target.value)} />
          {searchResults.length > 0 && (
            <ul className="absolute left-3 right-3 z-[1100] mt-1 rounded-md border border-slate-700 bg-slate-900 text-sm shadow-xl">
              {searchResults.map((r) => (
                <li key={`${r.kind}${r.id}`}>
                  <button
                    className="w-full text-left px-3 py-1.5 hover:bg-slate-800 cursor-pointer"
                    onClick={() => {
                      mapRef.current?.setView(r.at, 18);
                      if (r.kind === 'coord') setMarker({ at: r.at, label: r.label, route: [] });
                      else
                        setSelection({
                          kind: r.kind,
                          id: r.id,
                        });
                      setSearch('');
                    }}
                  >
                    {r.label} <span className="text-xs text-slate-500">· {r.sub}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <nav className="px-2 space-y-0.5 text-sm">
          <SideLink to="/" icon={<Home size={16} />} label="Meus projetos" />
          <SideButton icon={<BarChart3 size={16} />} label="Dashboard" onClick={() => setModal('dashboard')} />
          <SideButton icon={<Activity size={16} />} label="Análise de rede" onClick={() => setModal('analysis')} />
          <SideButton icon={<FileText size={16} />} label="Relatório da rede" onClick={() => setReport({ title: 'Rede completa' })} />
          <SideButton icon={<UtilityPole size={16} />} label="Tabela de postes" onClick={() => setModal('poles')} />
          <SideButton icon={<Users size={16} />} label="Equipe" onClick={() => setModal('team')} />
          <SideButton icon={<History size={16} />} label="Histórico" onClick={() => setHistory({ title: project.name })} />
          {!readOnly && <SideButton icon={<Upload size={16} />} label="Importar KMZ/KML" onClick={() => fileRef.current?.click()} />}
          <a href={api.exportUrl(projectId)} className="flex items-center gap-2 rounded-md px-3 py-2 text-slate-300 hover:bg-slate-800">
            <Download size={16} /> Exportar KMZ
          </a>
          <SideButton icon={<SettingsIcon size={16} />} label="Configurações" onClick={() => setModal('settings')} />
        </nav>
        <input
          ref={fileRef}
          type="file"
          accept=".kmz,.kml"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importFile(f);
            e.target.value = '';
          }}
        />
        <div className="mt-auto p-3 text-xs text-slate-500 grid grid-cols-2 gap-1">
          {(['pop', 'ceo', 'cto', 'client'] as NodeType[]).map((t) => (
            <span key={t}>
              {NODE_TYPES[t].plural}: <b className="text-slate-300">{nodes.filter((n) => n.type === t).length}</b>
            </span>
          ))}
          <span className="col-span-2">
            Cabos: <b className="text-slate-300">{formatLength(cables.reduce((a, c) => a + c.length_m, 0))}</b>
          </span>
        </div>
      </aside>

      {/* Mapa */}
      <div className="relative flex-1 min-w-0">
        <MapContainer
          center={[project.center_lat, project.center_lng]}
          zoom={project.zoom}
          maxZoom={21}
          className="h-full w-full"
          doubleClickZoom={false}
          ref={mapRef}
        >
          <BaseTiles
            engine={engine}
            mapStyle={mapStyle}
            onError={(m) => {
              notify(`${m} Voltando ao OpenStreetMap.`, 'error');
              setEngine('osm');
            }}
          />
          <MapEvents
            onClick={(at) => {
              if (tool === 'select') setSelection(null);
              else if (tool === 'viability') setViaPoint(at);
              else if (tool === 'area') setAreaDraft((a) => [...a, at]);
              else if (tool === 'cable') setDraft((d) => (d ? { ...d, path: [...d.path, at] } : { path: [at], from: null }));
              else if (tool === 'ruler') setRuler((r) => [...r, at]);
              else addNode(tool, at);
            }}
            onMove={setCursor}
            onZoom={setZoom}
          />

          {visible.areas &&
            areas.map((a) => (
              <Polygon
                key={`${a.id}-${a.color}-${a.polygon.length}`}
                positions={a.polygon}
                pathOptions={{
                  color: selection?.kind === 'area' && selection.id === a.id ? '#facc15' : a.color,
                  weight: 2,
                  fillOpacity: 0.12,
                }}
                eventHandlers={{
                  click: (e) => {
                    if (tool !== 'select') return;
                    L.DomEvent.stopPropagation(e);
                    setSelection({
                      kind: 'area',
                      id: a.id,
                    });
                  },
                }}
              >
                {labels && <Tooltip sticky>{a.name}</Tooltip>}
              </Polygon>
            ))}

          {cables
            .filter((c) => visible[c.category])
            .map((c) => (
              <Polyline
                key={c.id}
                positions={displayPath(c)}
                pathOptions={{
                  color: selection?.kind === 'cable' && selection.id === c.id ? '#facc15' : c.color,
                  weight: c.width + (selection?.kind === 'cable' && selection.id === c.id ? 2 : 0),
                  dashArray: c.status === 'planned' ? '8 6' : undefined,
                  opacity: 0.95,
                }}
                eventHandlers={{
                  click: (e) => {
                    if (tool !== 'select') return;
                    L.DomEvent.stopPropagation(e);
                    setSelection({
                      kind: 'cable',
                      id: c.id,
                    });
                    if (isDoubleClick(`c${c.id}`)) setEditorFocus(Date.now());
                  },
                }}
              >
                {labels && zoom >= 17 && <Tooltip sticky>{`${c.name} · ${formatLength(c.length_m)}`}</Tooltip>}
              </Polyline>
            ))}

          {nodes
            .filter((n) => visible[n.type])
            .map((n) => {
              const level = n.type === 'client' ? powerLevel(clientPower.get(n.id)?.power ?? null, settings) : null;
              return (
                <Marker
                  key={n.id}
                  position={positionOf(n)}
                  icon={nodeIcon(n, {
                    selected: selection?.kind === 'node' && selection.id === n.id,
                    fill: level ? POWER_COLORS[level] : undefined,
                  })}
                  draggable={tool === 'select' && !readOnly}
                  eventHandlers={{
                    click: (e) => {
                      L.DomEvent.stopPropagation(e);
                      nodeClicked(n);
                      if (tool === 'select' && isDoubleClick(`n${n.id}`)) openEditor(n);
                    },
                    dragstart: () => {
                      cancelPendingMove();
                      setDrag({ id: n.id, from: [n.lat, n.lng], at: [n.lat, n.lng] });
                    },
                    drag: (e) => {
                      const ll = (e.target as L.Marker).getLatLng();
                      setDrag({ id: n.id, from: [n.lat, n.lng], at: [ll.lat, ll.lng] });
                    },
                    dragend: (e) => {
                      const marker = e.target as L.Marker;
                      const ll = marker.getLatLng();
                      if (confirmMoves) {
                        // Mantém a prévia (marcador e cabos na nova posição) até o usuário confirmar.
                        setDrag({ id: n.id, from: [n.lat, n.lng], at: [ll.lat, ll.lng] });
                        setPendingMove({ node: n, at: [ll.lat, ll.lng], marker });
                      } else {
                        setDrag(null);
                        moveNode(n, [ll.lat, ll.lng]);
                      }
                    },
                  }}
                >
                  {labels && (zoom >= 17 || n.type === 'pop') && n.type !== 'pole' && (
                    <Tooltip
                      permanent
                      direction="bottom"
                      offset={[0, 10]}
                      className="!bg-slate-900/80 !text-white !border-0 !shadow-none !text-[11px] !px-1.5 !py-0"
                    >
                      {n.name}
                    </Tooltip>
                  )}
                </Marker>
              );
            })}

          {selectedCable && tool === 'select' && !readOnly && visible[selectedCable.category] && (
            <>
              {selectedCable.path.map((p, i) => {
                const last = selectedCable.path.length - 1;
                // Pontas ligadas a um objeto se movem arrastando o próprio objeto.
                if ((i === 0 && selectedCable.from_node_id) || (i === last && selectedCable.to_node_id)) return null;
                return (
                  <Marker
                    key={`v${selectedCable.id}-${i}-${selectedCable.path.length}`}
                    position={p}
                    icon={vertexIcon}
                    draggable
                    zIndexOffset={1000}
                    eventHandlers={{
                      click: (e) => L.DomEvent.stopPropagation(e),
                      drag: (e) => {
                        const ll = (e.target as L.Marker).getLatLng();
                        setVertexDrag({ cableId: selectedCable.id, index: i, at: [ll.lat, ll.lng], insert: false });
                      },
                      dragend: (e) => {
                        const ll = (e.target as L.Marker).getLatLng();
                        setVertexDrag(null);
                        saveCablePath(
                          selectedCable,
                          selectedCable.path.map((q, j) => (j === i ? [ll.lat, ll.lng] : q)),
                        );
                      },
                      contextmenu: (e) => {
                        L.DomEvent.stopPropagation(e);
                        if (selectedCable.path.length > 2) saveCablePath(selectedCable, selectedCable.path.filter((_, j) => j !== i));
                      },
                    }}
                  >
                    <Tooltip direction="top" offset={[0, -6]}>
                      Vértice {i + 1}: {formatCoord(p[0])}, {formatCoord(p[1])}
                    </Tooltip>
                  </Marker>
                );
              })}
              {midpoints.map((mid, i) => {
                return (
                  <Marker
                    key={`m${selectedCable.id}-${i}-${selectedCable.path.length}`}
                    position={mid}
                    icon={midpointIcon}
                    draggable
                    zIndexOffset={900}
                    eventHandlers={{
                      click: (e) => L.DomEvent.stopPropagation(e),
                      drag: (e) => {
                        const ll = (e.target as L.Marker).getLatLng();
                        setVertexDrag({ cableId: selectedCable.id, index: i + 1, at: [ll.lat, ll.lng], insert: true });
                      },
                      dragend: (e) => {
                        const ll = (e.target as L.Marker).getLatLng();
                        setVertexDrag(null);
                        saveCablePath(selectedCable, [...selectedCable.path.slice(0, i + 1), [ll.lat, ll.lng], ...selectedCable.path.slice(i + 1)]);
                      },
                    }}
                  />
                );
              })}
            </>
          )}

          {draft && (
            <Polyline
              positions={cursor ? [...draft.path, cursor] : draft.path}
              pathOptions={{
                color: '#facc15',
                weight: 3,
                dashArray: '6 6',
              }}
            />
          )}
          {areaDraft.length > 0 && (
            <Polygon
              positions={cursor ? [...areaDraft, cursor] : areaDraft}
              pathOptions={{
                color: '#facc15',
                weight: 2,
                dashArray: '6 6',
                fillOpacity: 0.1,
              }}
            />
          )}
          {tool === 'viability' && viaPoint && (
            <>
              <Circle
                center={viaPoint}
                radius={viaRadius}
                pathOptions={{
                  color: '#10b981',
                  weight: 1.5,
                  fillOpacity: 0.08,
                }}
              />
              <CircleMarker
                center={viaPoint}
                radius={7}
                pathOptions={{
                  color: '#ffffff',
                  fillColor: '#10b981',
                  fillOpacity: 1,
                  weight: 2,
                }}
              />
              {viaOptions.map((o) => (
                <Polyline
                  key={o.box.id}
                  positions={[viaPoint, [o.box.lat, o.box.lng]]}
                  pathOptions={{
                    color: o.free.length ? POWER_COLORS[o.level] : '#ef4444',
                    weight: 2,
                    dashArray: '4 6',
                  }}
                />
              ))}
            </>
          )}
          {marker && (
            <>
              <Polyline
                positions={marker.route}
                pathOptions={{
                  color: '#f97316',
                  weight: 6,
                  opacity: 0.5,
                }}
              />
              <CircleMarker
                center={marker.at}
                radius={9}
                pathOptions={{
                  color: '#ffffff',
                  fillColor: '#ef4444',
                  fillOpacity: 1,
                  weight: 3,
                }}
              >
                <Tooltip permanent direction="top" offset={[0, -8]}>
                  {marker.label}
                </Tooltip>
              </CircleMarker>
            </>
          )}
          {ruler.length > 0 && <Polyline positions={cursor && tool === 'ruler' ? [...ruler, cursor] : ruler} pathOptions={{ color: '#f472b6', weight: 3 }} />}
        </MapContainer>

        {/* Barra de ferramentas, com o aviso e o painel de coordenadas empilhados logo abaixo dela */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] flex flex-col items-center gap-1.5 pointer-events-none max-w-[calc(100%-1.5rem)]">
          <div className="panel flex p-1 gap-0.5 pointer-events-auto">
            {TOOLS.filter((t) => !readOnly || READ_TOOLS.includes(t.id)).map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setTool(t.id);
                  setDraft(null);
                  setAreaDraft([]);
                  if (t.id !== 'ruler') setRuler([]);
                  if (t.id === 'viability') setSelection(null);
                }}
                className={`flex flex-col items-center gap-0.5 rounded-md px-2.5 py-1.5 text-[10px] uppercase tracking-wide cursor-pointer ${
                  tool === t.id ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                }`}
                title={t.label}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>

          {toast && !overlayOpen && <Toast inline message={toast.message} kind={toast.kind} onClose={() => setToast(null)} />}

          {/* Inserir objeto por coordenadas */}
          {!readOnly && tool in NODE_TYPES && (
            <form
              className="panel flex items-end gap-2 p-2 text-xs pointer-events-auto"
              onSubmit={(e) => {
                e.preventDefault();
                addNodeAtCoords();
              }}
            >
              <div className="text-slate-300 self-center flex items-center gap-1 pr-1">
                <Crosshair size={14} /> {NODE_TYPES[tool as NodeType].label} por coordenadas
              </div>
              <label className="flex flex-col gap-0.5 text-slate-400">
                Latitude
                <input
                  className="input !py-1 !w-32"
                  placeholder="-8.047600"
                  value={placeLat}
                  onChange={(e) => {
                    // Colar "lat, lng" (Google Maps) no 1º campo preenche os dois.
                    const pair = parsePair(e.target.value);
                    if (pair) {
                      setPlaceLat(formatCoord(pair[0]));
                      setPlaceLng(formatCoord(pair[1]));
                    } else setPlaceLat(e.target.value);
                  }}
                />
              </label>
              <label className="flex flex-col gap-0.5 text-slate-400">
                Longitude
                <input className="input !py-1 !w-32" placeholder="-34.877000" value={placeLng} onChange={(e) => setPlaceLng(e.target.value)} />
              </label>
              <button type="submit" className="btn-primary !py-1.5 text-xs">
                Adicionar
              </button>
            </form>
          )}
        </div>

        {/* Dica e ações do desenho */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2">
          {pendingMove ? (
            <div className="panel px-3 py-1.5 text-xs text-slate-200 flex items-center gap-2 !border-yellow-500">
              <span>
                Mover <b>{pendingMove.node.name}</b> {formatLength(distance([pendingMove.node.lat, pendingMove.node.lng], pendingMove.at))} para{' '}
                {formatCoord(roundLatLng(pendingMove.at)[0])}, {formatCoord(roundLatLng(pendingMove.at)[1])}?
              </span>
              <button className="btn-primary !py-1 text-xs" onClick={confirmPendingMove} title="Enter">
                Confirmar
              </button>
              <button className="btn-ghost !py-1 text-xs" onClick={cancelPendingMove} title="Esc">
                Cancelar
              </button>
            </div>
          ) : (
            <div className="panel px-3 py-1.5 text-xs text-slate-300">{hint}</div>
          )}
          {areaDraft.length >= 3 && (
            <button className="btn-primary !py-1.5 text-xs" onClick={() => finishArea()}>
              Finalizar área
            </button>
          )}
          {lastMove && !readOnly && !pendingMove && (
            <button className="btn-ghost !py-1.5 text-xs" onClick={undoMove} title="Ctrl+Z">
              Desfazer movimento
            </button>
          )}
          {marker && (
            <button className="btn-ghost !py-1.5 text-xs" onClick={() => setMarker(null)}>
              Limpar marcação
            </button>
          )}
          {draft && draft.path.length > 1 && (
            <button className="btn-primary !py-1.5 text-xs" onClick={() => finishCable()}>
              Finalizar cabo ({formatLength(pathLength(draft.path))})
            </button>
          )}
        </div>

        {/* Camadas */}
        <div className="absolute top-3 right-3 z-[1000] panel w-48 p-3 text-sm space-y-3">
          <div>
            <div className="label flex items-center gap-1">
              <Layers size={12} /> Mapa base
            </div>
            <div className="flex gap-1">
              {(Object.keys(MAP_STYLES) as MapStyle[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setMapStyle(k)}
                  className={`flex-1 rounded px-1 py-1 text-xs cursor-pointer ${mapStyle === k ? 'bg-emerald-600' : 'bg-slate-800 hover:bg-slate-700'}`}
                >
                  {MAP_STYLES[k]}
                </button>
              ))}
            </div>
            <div className="text-[10px] text-slate-500 mt-1" title="Troque o motor em Configurações">
              Motor: {MAP_ENGINES[engine].label}
            </div>
          </div>
          <div>
            <div className="label">Elementos</div>
            {(['pop', 'ceo', 'cto', 'pole', 'client'] as NodeType[]).map((t) => (
              <Toggle key={t} label={NODE_TYPES[t].plural} color={NODE_TYPES[t].color} on={visible[t]} onChange={(v) => setVisible({ ...visible, [t]: v })} />
            ))}
            {(Object.keys(CABLE_CATEGORIES) as CableCategory[]).map((c) => (
              <Toggle
                key={c}
                label={`Cabos ${CABLE_CATEGORIES[c].label.toLowerCase()}`}
                color={CABLE_CATEGORIES[c].color}
                on={visible[c]}
                onChange={(v) => setVisible({ ...visible, [c]: v })}
              />
            ))}
            <Toggle label="Áreas" color="#a855f7" on={visible.areas ?? true} onChange={(v) => setVisible({ ...visible, areas: v })} />
            <Toggle label="Rótulos" on={labels} onChange={setLabels} />
            {!readOnly && <Toggle label="Confirmar ao mover" on={confirmMoves} onChange={setConfirmMoves} />}
          </div>
        </div>

        {tool === 'viability' && (
          <ViabilityPanel
            point={viaPoint}
            radius={viaRadius}
            options={viaOptions}
            onRadius={setViaRadius}
            onPoint={(p) => {
              setViaPoint(p);
              mapRef.current?.setView(p, 17);
            }}
            onFocus={(n) => mapRef.current?.setView([n.lat, n.lng], 18)}
            onClose={() => {
              setTool('select');
              setViaPoint(null);
            }}
          />
        )}

        {selectedArea && tool !== 'viability' && (
          <AreaPanel
            key={selectedArea.id}
            area={selectedArea}
            readOnly={readOnly}
            onClose={() => setSelection(null)}
            onSaved={(a) => {
              setAreas((list) => list.map((x) => (x.id === a.id ? a : x)));
              notify('Área salva');
            }}
            onDeleted={() => {
              setAreas((list) => list.filter((x) => x.id !== selectedArea.id));
              setSelection(null);
              notify('Área excluída');
            }}
            onReport={() =>
              setReport({
                title: selectedArea.name,
                polygon: selectedArea.polygon,
              })
            }
            onError={(m) => notify(m, 'error')}
          />
        )}

        {(selectedNode || selectedCable) && tool !== 'viability' && (
          <Inspector
            readOnly={readOnly}
            cables={cables}
            onHistory={(kind, id, name) =>
              setHistory({
                title: name,
                filter: { type: kind, subject_id: id },
              })
            }
            onOtdr={(n) =>
              setOtdr({
                title: n.name,
                result: clientPower.get(n.id)!,
              })
            }
            key={`${selection?.kind}${selection?.id}`}
            focusKey={editorFocus}
            onLocate={(at) => mapRef.current?.setView(at, Math.max(mapRef.current.getZoom(), 18))}
            node={selectedNode}
            cable={selectedCable}
            nodes={nodes}
            budget={selectedNode?.type === 'client' ? clientPower.get(selectedNode.id) : undefined}
            settings={settings}
            onClose={() => setSelection(null)}
            onNodeSaved={(n, cs) => {
              mergeNodes([n]);
              mergeCables(cs);
              notify('Alterações salvas');
            }}
            onCableSaved={(c, ns) => {
              mergeCables([c]);
              mergeNodes(ns);
              notify('Alterações salvas');
            }}
            onDeleted={(kind, deletedId, touched) => {
              if (kind === 'node') {
                setNodes((list) => list.filter((n) => n.id !== deletedId));
                setCables((list) =>
                  list.map((c) => ({
                    ...c,
                    from_node_id: c.from_node_id === deletedId ? null : c.from_node_id,
                    to_node_id: c.to_node_id === deletedId ? null : c.to_node_id,
                  })),
                );
              } else {
                setCables((list) => list.filter((c) => c.id !== deletedId));
                mergeNodes(touched ?? []);
              }
              setSelection(null);
              notify('Excluído');
            }}
            onOpenDiagram={(n) => setDiagramNodeId(n.id)}
            onShowBudget={(n) =>
              setBudget({
                title: n.name,
                result: clientPower.get(n.id)!,
              })
            }
            onConnectClient={connectClient}
            onError={(m) => notify(m, 'error')}
          />
        )}
      </div>

      {diagramNode && (
        <DiagramEditor
          node={diagramNode}
          network={network}
          readOnly={readOnly}
          onClose={() => setDiagramNodeId(null)}
          onSaved={(n) => {
            mergeNodes([n]);
            notify('Diagrama salvo');
          }}
          onShowBudget={(title, result) => setBudget({ title, result })}
        />
      )}
      {budget && <BudgetModal title={budget.title} result={budget.result} settings={settings} onClose={() => setBudget(null)} />}
      {modal === 'settings' && (
        <SettingsModal
          project={project}
          settings={settings}
          canManage={canManage}
          engine={engine}
          engines={engines}
          onEngine={setEngine}
          onClose={() => setModal(null)}
          onSaved={(p, s) => {
            setProject(p);
            setSettings(s);
            setModal(null);
            notify('Configurações salvas');
          }}
        />
      )}
      {modal === 'analysis' && (
        <NetworkAnalysis
          nodes={nodes}
          cables={cables}
          power={clientPower}
          settings={settings}
          onClose={() => setModal(null)}
          onFocus={(n) => {
            setModal(null);
            mapRef.current?.setView([n.lat, n.lng], 19);
            setSelection({ kind: 'node', id: n.id });
          }}
        />
      )}
      {modal === 'team' && <TeamModal projectId={projectId} role={role} onClose={() => setModal(null)} />}
      {modal === 'dashboard' && <DashboardModal network={network} projectName={project.name} recent={recent} onClose={() => setModal(null)} />}
      {modal === 'poles' && (
        <PolesModal
          projectId={projectId}
          poles={nodes.filter((n) => n.type === 'pole')}
          cables={cables}
          readOnly={readOnly}
          onClose={() => setModal(null)}
          onSaved={(n) => mergeNodes([n])}
          onImported={(created) => setNodes((list) => [...list, ...created])}
          onFocus={(n) => {
            setModal(null);
            focusNode(n);
          }}
        />
      )}
      {history && <HistoryModal projectId={projectId} title={history.title} filter={history.filter} onClose={() => setHistory(null)} />}
      {report && <ReportModal network={network} projectName={project.name} title={report.title} polygon={report.polygon} onClose={() => setReport(null)} />}
      {otdr && (
        <OtdrModal
          title={otdr.title}
          network={network}
          budget={otdr.result}
          onClose={() => setOtdr(null)}
          onLocate={(at, label, route) => {
            setOtdr(null);
            setMarker({ at, label, route });
            mapRef.current?.setView(at, 18);
          }}
        />
      )}
      {/* Com uma janela aberta por cima do mapa, o aviso fica fixo no topo para não ficar escondido. */}
      {toast && overlayOpen && <Toast message={toast.message} kind={toast.kind} onClose={() => setToast(null)} />}
    </div>
  );
}

/** Mapa base do motor e estilo escolhidos (com sessão do Google quando necessário). */
function BaseTiles({ engine, mapStyle, onError }: { engine: MapEngine; mapStyle: MapStyle; onError: (message: string) => void }) {
  const layer = LAYERS[engine][mapStyle];
  const [url, setUrl] = useState(layer.google ? '' : layer.url);
  useEffect(() => {
    if (!layer.google) {
      setUrl(layer.url);
      return;
    }
    let alive = true;
    setUrl('');
    googleTileUrl(layer, appConfig.googleMapsKey ?? '')
      .then((u) => alive && setUrl(u))
      .catch((e: Error) => alive && onError(e.message));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, mapStyle]);
  if (!url) return null;
  return <TileLayer key={url} url={url} attribution={layer.attribution} maxZoom={21} maxNativeZoom={layer.maxNativeZoom} />;
}

function MapEvents({ onClick, onMove, onZoom }: { onClick: (at: LatLng) => void; onMove: (at: LatLng) => void; onZoom: (z: number) => void }) {
  const map = useMapEvents({
    click: (e) => onClick([e.latlng.lat, e.latlng.lng]),
    mousemove: (e) => onMove([e.latlng.lat, e.latlng.lng]),
    zoomend: () => onZoom(map.getZoom()),
  });
  return <ZoomInit onZoom={onZoom} />;
}

function ZoomInit({ onZoom }: { onZoom: (z: number) => void }) {
  const map = useMap();
  useEffect(() => onZoom(map.getZoom()), [map, onZoom]);
  return null;
}

function SideLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link to={to} className="flex items-center gap-2 rounded-md px-3 py-2 text-slate-300 hover:bg-slate-800">
      <ChevronLeft size={14} className="-ml-1" />
      {icon} {label}
    </Link>
  );
}

function SideButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-2 rounded-md px-3 py-2 text-slate-300 hover:bg-slate-800 cursor-pointer">
      {icon} {label}
    </button>
  );
}

function Toggle({ label, on, onChange, color }: { label: string; on: boolean; onChange: (v: boolean) => void; color?: string }) {
  return (
    <label className="flex items-center gap-2 py-0.5 cursor-pointer text-slate-300 text-xs">
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} className="accent-emerald-500" />
      {color && <span className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />}
      {label}
    </label>
  );
}
