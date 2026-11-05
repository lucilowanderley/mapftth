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
  Archive,
  BrickWall,
  Undo2,
  X,
  Check,
  Pencil,
  Link2,
  Waypoints,
  Trash2,
  Infinity as SlackToolIcon,
  Building2,
  Houses,
  Warehouse,
  RadioTower,
  ChevronDown,
  Cctv,
  Video,
  Route as LaunchIcon,
  Magnet,
  Cylinder,
  Merge,
} from 'lucide-react';
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Circle, CircleMarker, MapContainer, Marker, Pane, Polygon, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import { Link, useParams } from 'react-router-dom';
import L from 'leaflet';
import { api, errorMessage, setContextProject } from '../lib/api';
import { POWER_COLORS, clientBudget, powerLevel, type BudgetResult } from '../lib/budget';
import { analyzeSignal, measuredClients, type SignalAnalysis } from '../lib/signal';
import { BOX_TYPES, CABLE_CATEGORIES, CABLE_MODELS, CONDO_KINDS, NODE_TYPES, NODE_TYPE_LIST, RACK_HOST_TYPES, SLACK_KINDS, effectiveLineStyle, lineDash } from '../lib/catalog';
import { distance, pathLength } from '../lib/geo';
import { LINK_STYLE, RADIO_HOST_TYPES, RADIO_KINDS, linkColor, linkMidpoint, radioBeam, radioLinks, radiosOf, sectorPolygon } from '../lib/tower';
import type { Activity as ActivityItem, Area, BoxKind, Duct, BoxPlace, CameraKind, Cable, CableCategory, CondoKind, LatLng, NetNode, NodeType, Project, Role, Settings, Slack, SlackKind } from '../lib/types';
import { viability } from '../lib/analysis';
import { CAMERA_COLOR, CAMERA_KINDS, CAMERA_MOUNT_TYPES, HEALTH_COLORS, cameraHealth, cameraLinks, cameraOf, fovPolygon } from '../lib/camera';
import { destination } from '../lib/tower';
import { BOX_KINDS, BOX_PLACES, FIXABLE_TYPES, fixTo, fixationIssue, nearestHost } from '../lib/fixation';
import { ANCHOR_HOST_TYPES, UNANCHOR_OFFSET_M, slackOnHost, anchorHost, anchorIndex, attachedTo, cableTargets, withAnchor, baseCableName, type SangriaOption } from '../lib/anchor';
import HostEditor from '../components/HostEditor';
import { LAYERS, MAP_ENGINES, MAP_STYLES, googleTileUrl, googleViewportCopyright, loadEngine, loadStyle, saveEngine, saveStyle, usableEngine, type GoogleKeySource, type MapEngine, type MapStyle } from '../lib/basemaps';
import { AutoResize, RememberView, TILE_OPTIONS, loadView } from '../lib/mapview';
import { connectIcon, midpointIcon, nodeGlyph, nodeIcon, slackIcon, vertexIcon, wirelessLinkIcon } from '../components/markers';
import { ALONG_TOLERANCE_M, nearestOnPath, planBoxesAlong, pointOnPath, type AlongPlan } from '../lib/connect';
import { formatCoord, parseLatLng, parsePair } from '../lib/coords';
import { movePath, roundLatLng } from '../lib/move';
import { cableDeleteQuestion, nodeDeleteQuestion } from '../lib/remove';
import { Logo, Toast, formatLength } from '../components/ui';
import Inspector from '../components/Inspector';
import DiagramEditor from '../components/DiagramEditor';
import PopEditor from '../components/pop/PopEditor';
import BudgetModal from '../components/BudgetModal';
import SettingsModal from '../components/SettingsModal';
import NetworkAnalysis from '../components/NetworkAnalysis';
import TeamModal, { ROLE_LABELS } from '../components/TeamModal';
import HistoryModal from '../components/HistoryModal';
import DashboardModal from '../components/DashboardModal';
import ReportModal from '../components/ReportModal';
import PolesModal from '../components/PolesModal';
import OtdrModal from '../components/OtdrModal';
import OtdrPanel, { type OtdrLaser, type OtdrPick } from '../components/OtdrPanel';
import { cablesAt, type OtdrTrace } from '../lib/otdr';
import ViabilityPanel from '../components/ViabilityPanel';
import AreaPanel from '../components/AreaPanel';
import DuctPanel from '../components/DuctPanel';
import { DUCT_COLOR, ductTotals, ductsOfCable } from '../lib/duct';
import { groupView, loadGroups, saveGroups } from '../lib/mapgroup';
import { useFloatPanel } from '../lib/floatpanel';
import PanelLock from '../components/PanelLock';
import LaunchPanel, { type LaunchPick, type LaunchPreview } from '../components/LaunchPanel';
import BulkFixPanel, { type BulkPreview } from '../components/BulkFixPanel';
import ToolFan, { type FanGroup } from '../components/ToolFan';
import MergePanel, { type MergeKind, type MergeSelection } from '../components/MergePanel';

type Tool = 'select' | NodeType | 'cable' | 'duct' | 'launch' | 'bulkfix' | 'merge' | 'slack' | 'ruler' | 'area' | 'viability' | 'otdr';

/**
 * Barra de ferramentas agrupada por contexto; cada grupo abre em leque. Ferramentas com a mesma função ficam num
 * botão só (CTO/CEO: mesma forma de lançar; Cabo: desenhar à mão ou lançar pelos postes) e a escolha entre elas
 * fica na faixa abaixo da barra.
 */
const TOOL_GROUPS: FanGroup<Tool>[] = [
  { key: 'select', label: 'Selecionar', items: [{ key: 'select', label: 'Selecionar', icon: <MousePointer2 size={18} />, tools: ['select'] }] },
  {
    key: 'infra',
    label: 'Infraestrutura',
    items: [
      { key: 'pole', label: 'Poste', icon: <UtilityPole size={20} strokeWidth={2.2} />, tools: ['pole'] },
      { key: 'box', label: 'Caixa', icon: <Archive size={18} />, tools: ['box'] },
      { key: 'duct', label: 'Duto', icon: <Cylinder size={18} className="rotate-90" />, tools: ['duct'] },
    ],
  },
  {
    key: 'fiber',
    label: 'Rede óptica',
    items: [
      { key: 'closure', label: 'CTO / CEO', icon: <SquareStack size={18} />, tools: ['cto', 'ceo'] },
      { key: 'cable', label: 'Cabo', icon: <CableIcon size={18} />, tools: ['cable', 'launch'] },
      { key: 'slack', label: 'Reserva', icon: <SlackToolIcon size={18} />, tools: ['slack'] },
    ],
  },
  {
    key: 'sites',
    label: 'Centrais',
    items: [
      { key: 'pop', label: 'POP', icon: <Server size={18} />, tools: ['pop'] },
      { key: 'dc', label: 'Datacenter', icon: <Warehouse size={18} />, tools: ['dc'] },
      { key: 'tower', label: 'Torre', icon: <RadioTower size={18} />, tools: ['tower'] },
    ],
  },
  {
    key: 'clients',
    label: 'Clientes',
    items: [
      { key: 'client', label: 'Cliente', icon: <User size={18} />, tools: ['client'] },
      { key: 'condo', label: 'Condomínio', icon: <Building2 size={18} />, tools: ['condo'] },
      { key: 'camera', label: 'Câmera', icon: <Cctv size={18} />, tools: ['camera'] },
    ],
  },
  {
    key: 'edit',
    label: 'Ajustar',
    items: [
      { key: 'bulkfix', label: 'Fixar', icon: <Magnet size={18} />, tools: ['bulkfix'] },
      { key: 'merge', label: 'Unir', icon: <Merge size={18} />, tools: ['merge'] },
    ],
  },
  {
    key: 'measure',
    label: 'Medir',
    items: [
      { key: 'ruler', label: 'Régua', icon: <Ruler size={18} />, tools: ['ruler'] },
      { key: 'area', label: 'Área', icon: <Pentagon size={18} />, tools: ['area'] },
      { key: 'viability', label: 'Viabilidade', icon: <Radar size={18} />, tools: ['viability'] },
      { key: 'otdr', label: 'OTDR', icon: <Activity size={18} />, tools: ['otdr'] },
    ],
  },
];

/** Ferramentas que só leem a rede (liberadas para quem tem acesso de leitura). */
const READ_TOOLS: Tool[] = ['select', 'ruler', 'viability', 'otdr'];


/** Prévia do lançamento de cabo: caminho da rua, cabo planejado, postes (existentes numerados e novos) e reservas. */
/** OTDR no modo laser: a fibra acesa do disparo até o rompimento (ou o fim da fibra), como um VFL no mapa. */
function LaserLayer({ laser }: { laser: OtdrLaser }) {
  return (
    <>
      <Polyline positions={laser.path} pathOptions={{ color: '#ef4444', weight: 12, opacity: 0.25, lineCap: 'round', interactive: false }} />
      <Polyline positions={laser.path} pathOptions={{ color: '#fecaca', weight: 3, opacity: 1, dashArray: '10 8', className: 'otdr-laser', lineCap: 'round', interactive: false }} />
      <CircleMarker center={laser.origin} radius={7} pathOptions={{ color: '#ffffff', fillColor: '#10b981', fillOpacity: 1, weight: 2 }}>
        <Tooltip direction="top" offset={[0, -6]}>
          OTDR
        </Tooltip>
      </CircleMarker>
      <CircleMarker
        center={laser.point}
        radius={laser.broken ? 11 : 8}
        pathOptions={{ color: '#ffffff', fillColor: '#ef4444', fillOpacity: 1, weight: 3, className: laser.broken ? 'otdr-break' : undefined }}
      >
        <Tooltip permanent direction="top" offset={[0, -10]}>
          {laser.label}
        </Tooltip>
      </CircleMarker>
    </>
  );
}

/** Prévia do Fixar em massa: linha tracejada de cada objeto até o alvo e um anel no alvo. */
function BulkFixLayer({ preview }: { preview: BulkPreview }) {
  const seen = new Set<string>();
  const targets = preview.targets.filter((t) => {
    const k = `${t[0].toFixed(7)}:${t[1].toFixed(7)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  // Pane acima dos ícones: as distâncias são curtas e a linha ficaria escondida embaixo deles.
  return (
    <Pane name="bulkfix-preview" style={{ zIndex: 650, pointerEvents: 'none' }}>
      {preview.lines.map((l, i) => (
        <Polyline key={`l${i}`} positions={l} interactive={false} pathOptions={{ color: '#facc15', weight: 3, dashArray: '6 5', opacity: 1 }} />
      ))}
      {targets.slice(0, 3000).map((t, i) => (
        <CircleMarker key={`t${i}`} center={t} radius={14} interactive={false} pathOptions={{ color: '#facc15', weight: 2.5, fill: false }} />
      ))}
      {preview.focus?.map((l, i) => (
        <Polyline key={`f${i}`} positions={l} interactive={false} pathOptions={{ color: '#facc15', weight: 6, opacity: 0.9 }} />
      ))}
    </Pane>
  );
}

/** Área visível do mapa (atualiza ao mover/dar zoom). */
function ViewBounds({ onChange }: { onChange: (b: [LatLng, LatLng]) => void }) {
  const map = useMapEvents({
    moveend: () => report(),
  });
  const report = () => {
    const b = map.getBounds();
    onChange([
      [b.getSouth(), b.getWest()],
      [b.getNorth(), b.getEast()],
    ]);
  };
  useEffect(() => {
    report();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function LaunchLayer({ preview, nodes }: { preview: LaunchPreview; nodes: NetNode[] }) {
  const { plan, route, color } = preview;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const slackAt = new Set(plan?.slacks ?? []);
  // Numeração só dos postes/caixas escolhidos (os vértices do duto não contam).
  const stopNo = new Map<number, number>();
  plan?.points.forEach((p, i) => (p.pole_id != null || p.box_id != null || p.new_pole) && stopNo.set(i, stopNo.size + 1));
  return (
    <>
      {route && route.length > 1 && <Polyline positions={route} pathOptions={{ color: '#94a3b8', weight: 7, opacity: 0.35 }} interactive={false} />}
      {plan && <Polyline positions={plan.points.map((p) => p.at)} pathOptions={{ color, weight: 4, dashArray: '8 6' }} interactive={false} />}
      {!plan &&
        preview.order &&
        preview.order.length === 1 &&
        byId.get(preview.order[0]) && <CircleMarker center={[byId.get(preview.order[0])!.lat, byId.get(preview.order[0])!.lng]} radius={11} pathOptions={{ color: '#fde047', weight: 3, fill: false }} interactive={false} />}
      {plan?.points.map((p, i) =>
        p.pole_id != null || p.box_id != null || p.new_pole ? (
          <CircleMarker
            key={`lp${i}`}
            center={p.at}
            radius={p.new_pole ? 6 : 10}
            interactive={false}
            pathOptions={p.new_pole ? { color, weight: 2, fillColor: '#ffffff', fillOpacity: 1 } : { color: '#fde047', weight: 3, fill: false }}
          >
            {preview.order && (
              <Tooltip permanent direction="top" offset={[0, -8]} className="!px-1 !py-0 !text-[10px]">
                {stopNo.get(i)}
              </Tooltip>
            )}
          </CircleMarker>
        ) : null,
      )}
      {plan?.points.map((p, i) =>
        slackAt.has(i) ? <CircleMarker key={`ls${i}`} center={p.at} radius={15} interactive={false} pathOptions={{ color: '#f59e0b', weight: 2, dashArray: '3 3', fill: false }} /> : null,
      )}
      {preview.refs?.map((p, i) => (
        <CircleMarker key={`lr${i}`} center={p} radius={8} interactive={false} pathOptions={{ color: '#ffffff', weight: 2, fillColor: i === 0 ? '#22c55e' : i === preview.refs!.length - 1 ? '#ef4444' : '#a855f7', fillOpacity: 1 }}>
          <Tooltip permanent direction="right" offset={[8, 0]} className="!px-1 !py-0 !text-[10px]">
            {i + 1}
          </Tooltip>
        </CircleMarker>
      ))}
      {preview.refs && preview.refs.length > 1 && !preview.route && (
        <Polyline positions={preview.refs} pathOptions={{ color: '#a855f7', weight: 2, dashArray: '2 6' }} interactive={false} />
      )}
      {preview.start && <CircleMarker center={preview.start} radius={7} interactive={false} pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#22c55e', fillOpacity: 1 }} />}
      {preview.end && <CircleMarker center={preview.end} radius={7} interactive={false} pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#ef4444', fillOpacity: 1 }} />}
    </>
  );
}

export type Selection = { kind: 'node'; id: number } | { kind: 'cable'; id: number } | { kind: 'area'; id: number } | { kind: 'duct'; id: number } | null;

export default function MapPage() {
  const { id } = useParams();
  const projectId = Number(id);
  const [project, setProject] = useState<Project | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [nodes, setNodes] = useState<NetNode[]>([]);
  const [cables, setCables] = useState<Cable[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [ducts, setDucts] = useState<Duct[]>([]);
  /** Duto em desenho (ferramenta Duto). */
  const [ductDraft, setDuctDraft] = useState<{ path: LatLng[]; from: number | null } | null>(null);
  /** Vértice de duto sendo arrastado. */
  const [ductVertexDrag, setDuctVertexDrag] = useState<{ ductId: number; index: number; at: LatLng; insert: boolean } | null>(null);
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
  /** OTDR: gráfico e relatório abertos; ponto de disparo escolhido no mapa e o laser aceso. */
  const [otdr, setOtdr] = useState<{
    trace: OtdrTrace;
    distance: number | null;
  } | null>(null);
  const [otdrPick, setOtdrPick] = useState<OtdrPick | null>(null);
  const [laser, setLaser] = useState<OtdrLaser | null>(null);
  const [recent, setRecent] = useState<ActivityItem[] | null>(null);
  const [tool, setTool] = useState<Tool>('select');
  /** Ferramenta Lançar cabo: cliques no mapa encaminhados ao painel e o que ele desenha. */
  const [launchPick, setLaunchPick] = useState<LaunchPick | null>(null);
  const [launchPreview, setLaunchPreview] = useState<LaunchPreview | null>(null);
  const [bulkPreview, setBulkPreview] = useState<BulkPreview | null>(null);
  /** Unir: cabos (ou dutos) marcados no mapa. */
  const [mergeSel, setMergeSel] = useState<MergeSelection>({ kind: 'cable', ids: [] });
  const [mapBounds, setMapBounds] = useState<[LatLng, LatLng] | null>(null);
  const [condoKind, setCondoKind] = useState<CondoKind>('buildings');
  const [cameraKind, setCameraKind] = useState<CameraKind>('ip');
  const [boxKindTool, setBoxKindTool] = useState<BoxKind>('underground');
  const [boxPlaceTool, setBoxPlaceTool] = useState<BoxPlace>('external');
  const [selection, setSelection] = useState<Selection>(null);
  /** Delete pressionado com algo selecionado: falta confirmar (Enter) ou cancelar (Esc). */
  const [pendingDelete, setPendingDelete] = useState<Selection>(null);
  const [draft, setDraft] = useState<{
    path: LatLng[];
    from: number | null;
  } | null>(null);
  const [ruler, setRuler] = useState<LatLng[]>([]);
  const [cursor, setCursor] = useState<LatLng | null>(null);
  // Estilo (no mapa) e motor (em Configurações) ficam salvos neste navegador.
  // O Google precisa da chave do dono do projeto (ou do .env); sem ela o mapa usa o OpenStreetMap.
  const [googleKey, setGoogleKey] = useState<{ key: string | null; source: GoogleKeySource }>({ key: null, source: null });
  const [preferredEngine, setEngineState] = useState<MapEngine>(loadEngine);
  const engine = usableEngine(preferredEngine, !!googleKey.key);
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
    box: true,
    pop: true,
    dc: true,
    tower: true,
    wireless: true,
    pole: true,
    client: true,
    condo: true,
    camera: true,
    backbone: true,
    distribution: true,
    drop: true,
    ducts: true,
    areas: true,
  });
  const [labels, setLabels] = useState(true);
  /** Objetos agrupados (escondem o que está à frente), salvos neste navegador por projeto. */
  const [groups, setGroupsState] = useState<number[]>(() => loadGroups(projectId));
  const setGroups = (g: number[]) => {
    setGroupsState(g);
    saveGroups(projectId, g);
  };
  useEffect(() => setGroupsState(loadGroups(projectId)), [projectId]);
  const grouped = useMemo(() => groupView(groups, nodes, cables), [groups, nodes, cables]);
  /** CTO/CEO com fixação faltando ou incompleta (ponto âmbar no ícone). */
  const unfixed = useMemo(() => new Set(nodes.filter((n) => fixationIssue(n, nodes, cables)).map((n) => n.id)), [nodes, cables]);
  const showNode = (n: NetNode) => visible[n.type] && !grouped.hiddenNodes.has(n.id);
  const showCable = (c: Cable) => visible[c.category] && !grouped.hiddenCables.has(c.id);
  /** Objetos fixados no poste/caixa: não têm ícone próprio, aparecem fundidos ao do poste/caixa. */
  const anchors = useMemo(() => anchorIndex(nodes), [nodes]);
  const showMarker = (n: NetNode) => showNode(n) && !anchors.anchored.has(n.id);
  /** Reservas técnicas guardadas num poste/caixa visível: também se fundem ao ícone dele. */
  const hostSlacks = useMemo(() => {
    const byHost = new Map<number, { cable: Cable; slack: Slack }[]>();
    const hidden = new Set<Slack>();
    const hosts = nodes.filter((n) => ANCHOR_HOST_TYPES.includes(n.type) && showMarker(n));
    if (!hosts.length) return { byHost, hidden };
    for (const c of cables) {
      if (!c.slacks?.length || !showCable(c)) continue;
      for (const r of c.slacks) {
        const h = hosts.find((n) => slackOnHost(r, n, nodes));
        if (!h) continue;
        hidden.add(r);
        byHost.set(h.id, [...(byHost.get(h.id) ?? []), { cable: c, slack: r }]);
      }
    }
    return { byHost, hidden };
  }, [nodes, cables, visible, grouped, anchors]);
  /** Poste/caixa com o editor (objetos fixados) aberto. */
  const [hostEditorId, setHostEditorId] = useState<number | null>(null);
  /** Clique com a ferramenta Cabo num poste/caixa com várias CTO/CEO fixadas: escolher em qual ligar. */
  const [anchorPick, setAnchorPick] = useState<{ host: NetNode; options: NetNode[]; x: number; y: number } | null>(null);
  // Caixas flutuantes com cadeado: barra de ferramentas e painel de camadas.
  const toolbarPanel = useFloatPanel('toolbar');
  const layersPanel = useFloatPanel('layers');
  const [elementsOpen, setElementsOpen] = useState(false);
  const [elementsUp, setElementsUp] = useState(false);
  const elementsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!elementsOpen) return;
    const onDown = (e: MouseEvent) => {
      if (elementsRef.current && !elementsRef.current.contains(e.target as Node)) setElementsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setElementsOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [elementsOpen]);
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
  /** Modelo usado pela ferramenta Cabo (lembrado neste navegador). */
  const [cableModelId, setCableModelIdState] = useState<string>(() => {
    try {
      return localStorage.getItem('mapftth.cableModel') ?? 'as-12';
    } catch {
      return 'as-12';
    }
  });
  const setCableModelId = (v: string) => {
    setCableModelIdState(v);
    try {
      localStorage.setItem('mapftth.cableModel', v);
    } catch {
      // ignora
    }
  };
  /** Ferramenta Reserva: metragem e tipo da próxima reserva (lembrados) e cabo escolhido pelo menu. */
  const [slackDefaults, setSlackDefaultsState] = useState<{ length: number; kind: SlackKind }>(() => {
    try {
      return { length: 20, kind: 'aerial', ...JSON.parse(localStorage.getItem('mapftth.slack') ?? '{}') };
    } catch {
      return { length: 20, kind: 'aerial' };
    }
  });
  const setSlackDefaults = (v: { length: number; kind: SlackKind }) => {
    setSlackDefaultsState(v);
    try {
      localStorage.setItem('mapftth.slack', JSON.stringify(v));
    } catch {
      // ignora
    }
  };
  const [slackCableId, setSlackCableId] = useState<number | null>(null);
  /** Cabo em "Conectar a caixa, poste ou POP": pontas e pontos do meio podem ser soltos sobre objetos. */
  const [connectId, setConnectId] = useState<number | null>(null);
  /** Menu do botão direito sobre um cabo. */
  const [cableMenu, setCableMenu] = useState<{ id: number; x: number; y: number; confirm?: boolean } | null>(null);
  /** Objeto onde o ponto arrastado vai encaixar (destaque durante o arrasto). */
  const [snapNode, setSnapNode] = useState<NetNode | null>(null);
  const [lastMove, setLastMove] = useState<{ id: number; from: LatLng; name: string } | null>(null);
  const [placeLat, setPlaceLat] = useState('');
  const [placeLng, setPlaceLng] = useState('');
  const [editorFocus, setEditorFocus] = useState(0);
  const lastClick = useRef<{ key: string; t: number }>({ key: '', t: 0 });
  /** Escolha feita no menu de CTO/CEO fixadas (não perguntar de novo). */
  const pickedAnchor = useRef(false);
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
  // Mesmo cuidado para as reservas: posição estável enquanto o ícone é arrastado.
  const slackPositions = useRef(new WeakMap<Slack, LatLng>());
  const slackPositionOf = (r: Slack): LatLng => {
    let p = slackPositions.current.get(r);
    if (!p) slackPositions.current.set(r, (p = [r.lat, r.lng]));
    return p;
  };
  const mapRef = useRef<L.Map | null>(null);
  /** Último enquadramento salvo deste projeto (lido uma vez, ao abrir). */
  const initialView = useMemo(() => loadView(projectId), [projectId]);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => {
    setContextProject(projectId);
    return api.project(projectId).then((d) => {
      setProject(d.project);
      setSettings(d.settings);
      setNodes(d.nodes);
      setCables(d.cables);
      setAreas(d.areas);
      setDucts(d.ducts ?? []);
      setRole(d.role);
      setGoogleKey({ key: d.google_maps_key ?? null, source: d.google_key_source ?? null });
    });
  };

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
      // Editor do poste/caixa aberto por cima do mapa: as teclas são dele.
      if (hostEditorId) return;
      if (pendingMove) {
        if (e.key === 'Enter') confirmPendingMove();
        if (e.key === 'Escape') cancelPendingMove();
        return;
      }
      if (pendingDelete) {
        if (e.key === 'Enter') {
          e.preventDefault();
          confirmPendingDelete();
        } else if (e.key === 'Escape') setPendingDelete(null);
        return;
      }
      // Delete com um objeto selecionado: pede confirmação (Enter exclui, Esc cancela).
      if (e.key === 'Delete' && selection && !readOnly && tool === 'select' && !diagramNodeId && !document.querySelector('.fixed.inset-0')) {
        e.preventDefault();
        setPendingDelete(selection);
        return;
      }
      if (e.key === 'Escape') {
        if (cableMenu) return setCableMenu(null);
        if (anchorPick) return setAnchorPick(null);
        if (connectId) return setConnectId(null);
        setSlackCableId(null);
        setDraft(null);
        setDuctDraft(null);
        setRuler([]);
        setAreaDraft([]);
        setTool('select');
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && lastMove && !readOnly) {
        e.preventDefault();
        undoMove();
      }
      if (e.key === 'Enter' && draft) finishCable();
      if (e.key === 'Enter' && ductDraft) finishDuct();
      if (e.key === 'Enter' && areaDraft.length >= 3) finishArea();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Selecionar outra coisa (ou nada) desiste da exclusão pedida com Delete.
  useEffect(() => {
    if (pendingDelete && !(selection && selection.kind === pendingDelete.kind && selection.id === pendingDelete.id)) setPendingDelete(null);
  }, [selection, pendingDelete]);

  // O modo conectar acompanha o cabo selecionado; selecionar outra coisa (ou nada) encerra o modo.
  useEffect(() => {
    if (connectId && !(selection?.kind === 'cable' && selection.id === connectId)) setConnectId(null);
  }, [selection, connectId]);

  const network = useMemo(() => (settings ? { nodes, cables, settings } : null), [nodes, cables, settings]);

  const clientPower = useMemo(() => {
    const map = new Map<number, BudgetResult>();
    if (!network) return map;
    nodes.filter((n) => n.type === 'client').forEach((n) => map.set(n.id, clientBudget(network, n)));
    return map;
  }, [network, nodes]);

  // Sinal medido × estimado dos clientes (saúde e trecho provável de problema).
  const clientSignal = useMemo(() => {
    const map = new Map<number, SignalAnalysis>();
    if (!network) return map;
    const peers = measuredClients(network);
    nodes
      .filter((n) => n.type === 'client')
      .forEach((n) => {
        const budget = clientPower.get(n.id);
        if (budget) map.set(n.id, analyzeSignal(network, { key: `n${n.id}`, measured: n.attributes?.rx_dbm as number | undefined, measuredAt: n.attributes?.rx_at as string | undefined, budget }, peers));
      });
    return map;
  }, [network, nodes, clientPower]);

  const notify = (message: string, kind: 'ok' | 'error' = 'ok') => setToast({ message, kind });
  const readOnly = role === 'viewer';
  /** Grupos da barra visíveis para o papel do usuário (leitura: só o que não altera a rede). */
  const toolGroups = useMemo(
    () =>
      readOnly
        ? TOOL_GROUPS.map((g) => ({ ...g, items: g.items.filter((it) => it.tools.some((t) => READ_TOOLS.includes(t))).map((it) => ({ ...it, tools: it.tools.filter((t) => READ_TOOLS.includes(t)) })) }))
        : TOOL_GROUPS,
    [readOnly],
  );
  /** Troca de ferramenta pela barra (leque ou as escolhas fundidas CTO/CEO e Desenhar/Lançar). */
  function pickTool(id: Tool) {
    setTool(id);
    setSlackCableId(null);
    setConnectId(null);
    setCableMenu(null);
    setDraft(null);
    setDuctDraft(null);
    setAreaDraft([]);
    if (id !== 'ruler') setRuler([]);
    if (id === 'viability' || id === 'launch' || id === 'bulkfix') setSelection(null);
    if (id === 'otdr') {
      // Entra no OTDR já com o cabo ou a caixa selecionada como ponto de disparo.
      setOtdrPick(null);
      if (selectedCable) pickOtdrCable(selectedCable);
      else if (selectedNode) pickOtdrAt(selectedNode);
      setSelection(null);
    }
    if (id === 'merge') {
      // Entra no Unir já com o cabo/duto selecionado.
      if (selection?.kind === 'cable' || selection?.kind === 'duct') setMergeSel({ kind: selection.kind, ids: [selection.id] });
      else setMergeSel((m) => ({ ...m, ids: [] }));
      setSelection(null);
    }
    // Lançar cabo escolhe postes no mapa: a camada de postes precisa estar visível.
    if (id === 'launch') setVisible((v) => ({ ...v, pole: true }));
  }
  /** Objeto compartilhado de outro projeto onde o usuário não pode editar: só consulta. */
  const nodeLocked = (n?: NetNode) => !!n && n.share?.can_edit === false;
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

  const mergeCables = (updated: Cable[]) => {
    if (!updated.length) return;
    const byId = new Map(updated.map((u) => [u.id, u]));
    setCables((list) => list.map((c) => byId.get(c.id) ?? c));
  };
  // A marca de compartilhado só vem em algumas respostas: mantém a que já estava quando não vier.
  const mergeNodes = (updated: NetNode[]) => {
    if (!updated.length) return;
    const byId = new Map(updated.map((u) => [u.id, u]));
    setNodes((list) =>
      list.map((n) => {
        const u = byId.get(n.id);
        return u ? { ...u, share: u.share !== undefined ? u.share : n.share } : n;
      }),
    );
  };
  const mergeDucts = (updated: Duct[]) => setDucts((list) => list.map((d) => updated.find((u) => u.id === d.id) ?? d));

  /** Unir: marca/desmarca o cabo ou duto. Ctrl+clique no modo Selecionar entra no Unir já com o selecionado. */
  function toggleMerge(kind: MergeKind, id: number, fromSelect = false) {
    if (fromSelect) {
      const start = selection?.kind === kind && selection.id !== id ? [selection.id, id] : [id];
      setMergeSel({ kind, ids: start });
      setSelection(null);
      setConnectId(null);
      setCableMenu(null);
      setTool('merge');
      return;
    }
    setMergeSel((m) => (m.kind !== kind ? { kind, ids: [id] } : { kind, ids: m.ids.includes(id) ? m.ids.filter((x) => x !== id) : [...m.ids, id] }));
  }

  async function addNode(type: NodeType, at: LatLng, mount?: NetNode): Promise<NetNode | null> {
    try {
      // CTO/CEO precisa estar fixada num poste, parede ou caixa: lançada sobre (ou bem perto de) um poste/caixa, fica presa nele.
      const fixable = FIXABLE_TYPES.includes(type);
      const host = fixable ? (mount ?? nearestHost(at, nodes)) : undefined;
      // Câmera lançada sobre um poste fica fixada nele; sobre cliente/DC/POP, "instalada" um pouco ao lado.
      const camOnPole = type === 'camera' && mount?.type === 'pole';
      // CTO/CEO no poste/caixa e câmera no poste ficam fixadas: mesma posição, ícone fundido ao do poste/caixa.
      const pos: LatLng = host ? [host.lat, host.lng] : camOnPole ? [mount.lat, mount.lng] : mount ? roundLatLng(destination([mount.lat, mount.lng], 45, 12)) : at;
      const dvrCount = nodes.filter((n) => n.type === 'camera' && cameraOf(n).cam_kind === 'dvr').length;
      const node = await api.createNode(projectId, {
        type,
        lat: pos[0],
        lng: pos[1],
        ...(type === 'condo' ? { attributes: { condo_kind: condoKind } } : {}),
        ...(type === 'box' ? { attributes: { box_kind: boxKindTool, box_place: boxPlaceTool } } : {}),
        ...(host ? { attributes: fixTo(host) } : {}),
        ...(type === 'camera'
          ? {
              ...(cameraKind === 'dvr' ? { name: `DVR-${dvrCount + 1}` } : {}),
              attributes: { cam_kind: cameraKind, ...(cameraKind === 'dvr' ? { channels: 8 } : {}), ...(mount ? { mount_id: mount.id, mount_kind: mount.type === 'pole' ? 'pole' : 'wall' } : {}) },
            }
          : {}),
      });
      setNodes((list) => [...list, node]);
      setSelection({ kind: 'node', id: node.id });
      notify(
        host
          ? `${NODE_TYPES[type].label} ${node.name} fixada ${host.type === 'box' ? 'na caixa' : 'no poste'} ${host.name}`
          : camOnPole
            ? `${NODE_TYPES[type].label} ${node.name} fixada no poste ${mount.name}`
            : fixable
              ? `${NODE_TYPES[type].label} adicionada. Informe no painel onde ela está fixada (poste, parede ou caixa).`
              : `${NODE_TYPES[type].label} adicionado`,
      );
      return node;
    } catch (e) {
      notify(errorMessage(e), 'error');
      return null;
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
  async function moveNode(node: NetNode, target: LatLng, record = true, endsOnly = false) {
    const from: LatLng = [node.lat, node.lng];
    const at = roundLatLng(target);
    if (from[0] === at[0] && from[1] === at[1]) return;
    setNodes((list) => list.map((n) => (n.id === node.id ? { ...n, lat: at[0], lng: at[1] } : n)));
    setCables((list) => list.map((c) => ({ ...c, path: movePath(c, node.id, from, at, endsOnly) })));
    setDucts((list) => list.map((d) => ({ ...d, path: movePath(d, node.id, from, at, endsOnly) })));
    try {
      const r = await api.updateNode(node.id, { lat: at[0], lng: at[1], ...(endsOnly ? { ends_only: true } : {}) });
      mergeNodes([r.node]);
      mergeCables(r.cables);
      mergeDucts(r.ducts ?? []);
      // O poste/caixa leva junto os objetos fixados nele (mesma posição; só as pontas dos cabos deles acompanham).
      if (ANCHOR_HOST_TYPES.includes(node.type)) {
        for (const child of attachedTo(node, nodes)) await moveNode(child, at, false, true);
        // As reservas técnicas fixadas nele também vão junto.
        for (const c of cables) {
          if (!c.slacks?.some((r) => slackOnHost(r, node, nodes))) continue;
          const slacks = c.slacks.map((s) => (slackOnHost(s, node, nodes) ? { ...s, lat: at[0], lng: at[1], fixed_kind: s.fixed_kind ?? (node.type === 'box' ? 'box' : 'pole'), fixed_id: node.id } : s));
          const fresh = r.cables.find((x) => x.id === c.id) ?? c;
          await saveSlacks(fresh, slacks);
        }
      }
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

  /**
   * Fixar no poste/caixa: o objeto vai para a posição dele e o ícone se funde ao dele. Soltar: sai um pouco
   * para o lado, ganha ícone próprio e pode ser arrastado (CTO/CEO fica sem fixação até escolher outra).
   */
  async function setAnchored(n: NetNode, on: boolean, attach?: NetNode) {
    const host = attach ?? anchorHost(n, nodes);
    if (!host) {
      notify(`${n.name} não está fixada em um poste ou caixa.`, 'error');
      return;
    }
    const idx = Math.max(0, attachedTo(host, nodes).findIndex((x) => x.id === n.id));
    const from: LatLng = [n.lat, n.lng];
    const at: LatLng = on ? [host.lat, host.lng] : roundLatLng(destination([host.lat, host.lng], (150 + 45 * idx) % 360, UNANCHOR_OFFSET_M));
    const attributes = withAnchor(n, on, host);
    setNodes((list) => list.map((x) => (x.id === n.id ? { ...x, lat: at[0], lng: at[1], attributes } : x)));
    setCables((list) => list.map((c) => ({ ...c, path: movePath(c, n.id, from, at, true) })));
    setDucts((list) => list.map((d) => ({ ...d, path: movePath(d, n.id, from, at, true) })));
    try {
      const r = await api.updateNode(n.id, { lat: at[0], lng: at[1], attributes, ends_only: true });
      mergeNodes([r.node]);
      mergeCables(r.cables);
      mergeDucts(r.ducts ?? []);
      notify(
        on
          ? `${n.name} fixada ${host.type === 'box' ? 'na caixa' : 'no poste'} ${host.name}`
          : `${n.name} solta ${host.type === 'box' ? 'da caixa' : 'do poste'} ${host.name}: agora pode ser arrastada${FIXABLE_TYPES.includes(n.type) ? '. Informe onde ela está fixada.' : ''}`,
      );
    } catch (e) {
      notify(errorMessage(e), 'error');
      load();
    }
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

  /** Salva a lista de reservas técnicas do cabo. */
  async function saveSlacks(cable: Cable, slacks: Slack[], message?: string) {
    setCables((list) => list.map((c) => (c.id === cable.id ? { ...c, slacks, slack_m: slacks.reduce((a, r) => a + r.length_m, 0) } : c)));
    try {
      const r = await api.updateCable(cable.id, { slacks });
      mergeCables([r.cable]);
      if (message) notify(message);
    } catch (e) {
      notify(errorMessage(e), 'error');
      load();
    }
  }

  /** Cabo mais próximo do clique (até ~20 px na tela). */
  function cableAt(at: LatLng): Cable | null {
    const map = mapRef.current;
    if (!map) return null;
    const mpp = (40075016.686 * Math.cos((at[0] * Math.PI) / 180)) / 2 ** (map.getZoom() + 8);
    let best: Cable | null = null;
    let bestD = 20 * mpp;
    for (const c of cables) {
      if (!showCable(c)) continue;
      const d = nearestOnPath(c.path, at).dist;
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }

  /** Ferramenta Reserva: posiciona uma reserva sobre o cabo no ponto clicado (ou sobre o poste/caixa clicado). */
  function placeSlack(at: LatLng, onNode?: NetNode, clicked?: Cable) {
    const chosen = slackCableId ? cables.find((c) => c.id === slackCableId) : null;
    const cable = chosen ?? clicked ?? cableAt(at);
    if (!cable) return notify('Clique sobre um cabo (ou num poste por onde ele passa) para posicionar a reserva.', 'error');
    const pos = roundLatLng(onNode ? [onNode.lat, onNode.lng] : pointOnPath(cable.path, at));
    if (nearestOnPath(cable.path, pos).dist > 50) return notify(`O ponto está longe do cabo ${cable.name}.`, 'error');
    const slack: Slack = {
      id: `r${Math.random().toString(36).slice(2, 9)}`,
      lat: pos[0],
      lng: pos[1],
      length_m: slackDefaults.length,
      kind: slackDefaults.kind,
      notes: onNode ? onNode.name : null,
      // Lançada sobre um poste/caixa, fica fixada nele; no meio do cabo, fixada no cabo.
      ...(onNode && ANCHOR_HOST_TYPES.includes(onNode.type) ? { fixed_kind: onNode.type === 'box' ? ('box' as const) : ('pole' as const), fixed_id: onNode.id } : onNode ? {} : { fixed_kind: 'cable' as const }),
    };
    saveSlacks(cable, [...(cable.slacks ?? []), slack], `Reserva ${SLACK_KINDS[slack.kind].label.toLowerCase()} de ${slack.length_m} m em ${cable.name}`);
    setSelection({ kind: 'cable', id: cable.id });
  }

  /** Aplica a resposta de uma sangria: o cabo original encolhe e os novos trechos entram na lista. */
  function applySplit(r: { cables: Cable[]; nodes: NetNode[]; ducts?: Duct[] }) {
    setCables((list) => [...list.map((c) => r.cables.find((u) => u.id === c.id) ?? c), ...r.cables.filter((u) => !list.some((c) => c.id === u.id))]);
    mergeNodes(r.nodes);
    mergeDucts(r.ducts ?? []);
  }

  /**
   * Sangria pelo editor do poste/caixa: corta o cabo que passa ali (ou liga os dois trechos que terminam ali)
   * na CTO/CEO fixada, na própria caixa ou numa CTO/CEO nova implantada no poste/caixa.
   */
  async function sangriaAtHost(host: NetNode, option: SangriaOption, target: NetNode | NodeType): Promise<NetNode | null> {
    const node = typeof target === 'string' ? await addNode(target, [host.lat, host.lng], host) : target;
    if (!node) return null;
    try {
      if (option.kind === 'cut') {
        const cable = option.cable;
        const path = cable.path.map((p, i) => (i === option.index ? ([node.lat, node.lng] as LatLng) : p)).map(roundLatLng);
        const r = await api.splitCable(cable.id, path, [{ index: option.index, node_id: node.id }]);
        applySplit(r);
        notify(`Sangria de ${baseCableName(cable.name)} em ${node.name}: fibras em passagem, derive no diagrama de fusão as que for usar`);
      } else {
        const r = await api.sangriaJoin(node.id, [option.cables[0].id, option.cables[1].id]);
        mergeCables(r.cables);
        mergeNodes(r.nodes);
        notify(`Sangria de ${baseCableName(option.cables[0].name)} em ${node.name}: fibras em passagem, derive no diagrama de fusão as que for usar`);
      }
      return node;
    } catch (e) {
      notify(errorMessage(e), 'error');
      load();
      return null;
    }
  }

  /** Desfaz o último ponto do cabo em desenho (botão direito ou botão ↶). */
  function undoDraftPoint() {
    setDraft((d) => (!d || d.path.length <= 1 ? null : { ...d, path: d.path.slice(0, -1) }));
  }

  /**
   * Objeto sob um ponto arrastado (até ~20 px na tela). Pontas encaixam em qualquer objeto;
   * pontos do meio só em caixas, POP (sangria) e postes (apoio).
   */
  function snapTarget(cable: Cable, index: number, insert: boolean, at: LatLng): NetNode | null {
    const map = mapRef.current;
    if (!map) return null;
    const last = cable.path.length - 1;
    const isEnd = !insert && (index === 0 || index === last);
    const other = isEnd ? (index === 0 ? cable.to_node_id : cable.from_node_id) : null;
    const p = map.latLngToContainerPoint(at);
    let best: NetNode | null = null;
    let bestD = 20;
    for (const raw of nodes) {
      if (!showMarker(raw)) continue;
      // Poste/caixa com CTO/CEO fixada: o cabo liga (ou faz sangria) na CTO/CEO.
      const n = cableTargets(raw, nodes)[0] ?? raw;
      if (isEnd ? n.id === other : n.type === 'client' || n.id === cable.from_node_id || n.id === cable.to_node_id) continue;
      const d = map.latLngToContainerPoint([n.lat, n.lng]).distanceTo(p);
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    return best;
  }

  /** Solta um ponto do cabo no modo conectar: ponta = conexão simples; meio sobre caixa = sangria. */
  async function connectDrop(cable: Cable, index: number, insert: boolean, at: LatLng) {
    const target = snapTarget(cable, index, insert, at);
    const last = cable.path.length - 1;
    const isEnd = !insert && (index === 0 || index === last);
    const pos: LatLng = target ? [target.lat, target.lng] : at;
    const path = (insert ? [...cable.path.slice(0, index), pos, ...cable.path.slice(index)] : cable.path.map((p, j) => (j === index ? pos : p))).map(roundLatLng);
    setCables((list) => list.map((c) => (c.id === cable.id ? { ...c, path } : c)));
    try {
      if (isEnd) {
        const key = index === 0 ? 'from_node_id' : 'to_node_id';
        const before = cable[key];
        const r = await api.updateCable(cable.id, { path, [key]: target?.id ?? null });
        mergeCables([r.cable]);
        mergeNodes(r.nodes);
        if (target) notify(`${cable.name} conectado em ${target.name}`);
        else if (before) notify(`Ponta de ${cable.name} desconectada`);
        return;
      }
      if (target && target.type !== 'pole') {
        const r = await api.splitCable(cable.id, path, [{ index, node_id: target.id }]);
        applySplit(r);
        notify(`Sangria em ${target.name}: ${cable.name} dividido em ${r.cables.length} trechos`);
        return;
      }
      const r = await api.updateCable(cable.id, { path });
      mergeCables([r.cable]);
      mergeNodes(r.nodes);
      if (target) notify(`${cable.name} apoiado em ${target.name}`);
    } catch (e) {
      notify(errorMessage(e), 'error');
      load();
    }
  }

  /** Forma 3: conecta de uma vez as caixas no traçado do cabo. */
  async function connectAlong(cable: Cable, plan: AlongPlan) {
    setCableMenu(null);
    const path = plan.path.map(roundLatLng);
    try {
      if (plan.from !== null || plan.to !== null) {
        const r = await api.updateCable(cable.id, {
          path,
          from_node_id: plan.from ?? cable.from_node_id,
          to_node_id: plan.to ?? cable.to_node_id,
        });
        mergeCables([r.cable]);
        mergeNodes(r.nodes);
      }
      if (plan.cuts.length) applySplit(await api.splitCable(cable.id, path, plan.cuts));
      const n = plan.nodes.length;
      notify(`${n} caixa${n > 1 ? 's' : ''} conectada${n > 1 ? 's' : ''} a ${cable.name}${plan.cuts.length ? ' com sangria' : ''}`);
    } catch (e) {
      notify(errorMessage(e), 'error');
      load();
    }
  }

  /** Tira do mapa o objeto excluído; os fixados nele voltam do servidor já sem fixação. */
  function applyDeleted(kind: 'node' | 'cable', deletedId: number, touched: NetNode[], touchedCables: Cable[]) {
    if (kind === 'node') {
      setNodes((list) => list.filter((n) => n.id !== deletedId));
      setCables((list) =>
        list.map((c) => ({
          ...c,
          from_node_id: c.from_node_id === deletedId ? null : c.from_node_id,
          to_node_id: c.to_node_id === deletedId ? null : c.to_node_id,
        })),
      );
      setDucts((list) =>
        list.map((d) => ({
          ...d,
          from_node_id: d.from_node_id === deletedId ? null : d.from_node_id,
          to_node_id: d.to_node_id === deletedId ? null : d.to_node_id,
        })),
      );
    } else {
      setCables((list) => list.filter((c) => c.id !== deletedId));
      forgetCableInDucts(deletedId);
    }
    mergeNodes(touched);
    mergeCables(touchedCables);
    setSelection(null);
  }

  /** O que a tecla Delete vai excluir: nome, onde mostrar a barra e a pergunta. */
  const deleteTarget = useMemo(() => {
    if (!pendingDelete) return null;
    const { kind, id: tid } = pendingDelete;
    if (kind === 'node') {
      const n = nodes.find((x) => x.id === tid);
      return n ? { at: [n.lat, n.lng] as LatLng, question: nodeDeleteQuestion(n, projectId, nodes, cables) } : null;
    }
    if (kind === 'cable') {
      const c = cables.find((x) => x.id === tid);
      return c ? { at: c.path[Math.floor(c.path.length / 2)], question: cableDeleteQuestion(c, nodes, cables) } : null;
    }
    if (kind === 'duct') {
      const d = ducts.find((x) => x.id === tid);
      return d ? { at: d.path[Math.floor(d.path.length / 2)], question: `Excluir ${d.name}? Os cabos que passam por ele não são excluídos.` } : null;
    }
    const a = areas.find((x) => x.id === tid);
    if (!a || !a.polygon.length) return null;
    const at: LatLng = [a.polygon.reduce((t, p) => t + p[0], 0) / a.polygon.length, a.polygon.reduce((t, p) => t + p[1], 0) / a.polygon.length];
    return { at, question: `Excluir a área ${a.name}?` };
  }, [pendingDelete, nodes, cables, ducts, areas, projectId]);

  /** Enter (ou Confirmar) depois do Delete: exclui o selecionado. Os fixados nele ficam sem fixação. */
  async function confirmPendingDelete() {
    const target = pendingDelete;
    setPendingDelete(null);
    if (!target || readOnly) return;
    try {
      if (target.kind === 'node') {
        const r = await api.deleteNode(target.id);
        applyDeleted('node', target.id, r.nodes, r.cables);
      } else if (target.kind === 'cable') {
        const r = await api.deleteCable(target.id);
        applyDeleted('cable', target.id, r.nodes, []);
      } else if (target.kind === 'duct') {
        await api.deleteDuct(target.id);
        setDucts((list) => list.filter((x) => x.id !== target.id));
        setSelection(null);
      } else {
        await api.deleteArea(target.id);
        setAreas((list) => list.filter((x) => x.id !== target.id));
        setSelection(null);
      }
      notify('Excluído');
    } catch (e) {
      notify(errorMessage(e), 'error');
    }
  }

  async function deleteCable(cable: Cable, confirmed = false): Promise<boolean> {
    setCableMenu(null);
    if (!confirmed && !window.confirm(`Excluir o cabo ${cable.name}? As fusões dele nas caixas também serão removidas.`)) return false;
    try {
      const r = await api.deleteCable(cable.id);
      setCables((list) => list.filter((c) => c.id !== cable.id));
      forgetCableInDucts(cable.id);
      mergeNodes(r.nodes);
      setSelection(null);
      notify('Cabo excluído');
      return true;
    } catch (e) {
      notify(errorMessage(e), 'error');
      return false;
    }
  }

  /** Traçado exibido de um cabo, considerando um arrasto em andamento. */
  function displayPath(c: Cable): LatLng[] {
    let path = drag ? movePath(c, drag.id, drag.from, drag.at) : c.path;
    // Os fixados acompanham o poste/caixa arrastado (pontas dos cabos deles).
    if (drag) for (const ch of anchors.byHost.get(drag.id) ?? []) path = movePath({ ...c, path }, ch.id, drag.from, drag.at, true);
    if (vertexDrag && vertexDrag.cableId === c.id) {
      const { index, at, insert } = vertexDrag;
      path = insert ? [...path.slice(0, index), at, ...path.slice(index)] : path.map((p, i) => (i === index ? at : p));
    }
    return path;
  }

  /** Traçado exibido de um duto (objeto ou vértice sendo arrastado). */
  function ductPath(d: Duct): LatLng[] {
    let path = drag ? movePath(d, drag.id, drag.from, drag.at) : d.path;
    if (drag) for (const ch of anchors.byHost.get(drag.id) ?? []) path = movePath({ ...d, path }, ch.id, drag.from, drag.at, true);
    if (ductVertexDrag && ductVertexDrag.ductId === d.id) {
      const { index, at, insert } = ductVertexDrag;
      path = insert ? [...path.slice(0, index), at, ...path.slice(index)] : path.map((p, i) => (i === index ? at : p));
    }
    return path;
  }

  /** Cabo excluído deixa de ocupar os dutos (o servidor faz o mesmo). */
  const forgetCableInDucts = (cableId: number) =>
    setDucts((list) => list.map((d) => (d.cable_ids?.includes(cableId) ? { ...d, cable_ids: d.cable_ids.filter((id) => id !== cableId) } : d)));

  async function finishDuct(path = ductDraft?.path ?? [], to: number | null = null) {
    if (!ductDraft || path.length < 2) {
      setDuctDraft(null);
      return;
    }
    try {
      const duct = await api.createDuct(projectId, { path: path.map(roundLatLng), from_node_id: ductDraft.from, to_node_id: to, color: DUCT_COLOR });
      setDucts((list) => [...list, duct]);
      setSelection({ kind: 'duct', id: duct.id });
      const a = nodes.find((n) => n.id === ductDraft.from);
      const b = nodes.find((n) => n.id === to);
      notify(`${duct.name} criado${a || b ? ` entre ${a?.name ?? 'ponta solta'} e ${b?.name ?? 'ponta solta'}` : ''}. Passe os cabos pelo painel.`);
    } catch (e) {
      notify(errorMessage(e), 'error');
    }
    setDuctDraft(null);
  }

  async function saveDuctPath(duct: Duct, raw: LatLng[]) {
    const path = raw.map(roundLatLng);
    setDucts((list) => list.map((d) => (d.id === duct.id ? { ...d, path } : d)));
    try {
      mergeDucts([await api.updateDuct(duct.id, { path })]);
    } catch (e) {
      notify(errorMessage(e), 'error');
      load();
    }
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
    // Objetos com editor próprio: fecha o painel de propriedades antes de abrir o editor.
    if (ANCHOR_HOST_TYPES.includes(n.type)) {
      setSelection(null);
      setHostEditorId(n.id);
    } else if (BOX_TYPES.includes(n.type)) {
      setSelection(null);
      setDiagramNodeId(n.id);
    } else {
      // Demais objetos: o editor é o próprio painel (cursor no campo Nome).
      setSelection({ kind: 'node', id: n.id });
      setEditorFocus(Date.now());
    }
  }

  /** OTDR: o objeto clicado (ou a CTO/CEO fixada no poste) vira a ponta de disparo; a lista traz os cabos que chegam nele. */
  function pickOtdrAt(node: NetNode, fiber?: number, cableId?: number) {
    if (!network) return;
    const ids = [node.id, ...cableTargets(node, nodes).map((n) => n.id)];
    const here = cablesAt(network, ids);
    if (!here.length) return notify(`Nenhum cabo chega em ${node.name}.`, 'error');
    const first = here.find((c) => c.id === cableId) ?? here[0];
    const at = ids.find((id) => id === first.from_node_id || id === first.to_node_id)!;
    setOtdrPick({ cableId: first.id, nodeId: at, options: here.map((c) => c.id), fiber, t: Date.now() });
  }

  function pickOtdrCable(c: Cable) {
    const at = c.from_node_id ?? c.to_node_id;
    if (at == null) return notify(`${c.name} não está ligado a nenhuma caixa.`, 'error');
    setOtdrPick({ cableId: c.id, nodeId: at, options: [c.id], t: Date.now() });
  }

  function nodeClicked(node: NetNode) {
    if (tool === 'bulkfix' || tool === 'merge') return;
    if (tool === 'launch') {
      setLaunchPick({ at: [node.lat, node.lng], node, t: Date.now() });
      return;
    }
    if (tool === 'viability') {
      setViaPoint([node.lat, node.lng]);
      return;
    }
    if (tool === 'otdr') {
      pickOtdrAt(node);
      return;
    }
    if (tool === 'area') {
      setAreaDraft((a) => [...a, [node.lat, node.lng]]);
      return;
    }
    if (tool === 'cable') {
      // Poste/caixa com CTO/CEO fixada: o cabo liga nela (com várias, pergunta qual).
      const targets = cableTargets(node, nodes);
      if (targets.length > 1 && !pickedAnchor.current) {
        const p = mapRef.current?.latLngToContainerPoint([node.lat, node.lng]);
        setAnchorPick({ host: node, options: targets, x: p?.x ?? 200, y: p?.y ?? 200 });
        return;
      }
      if (targets.length === 1) node = targets[0];
      pickedAnchor.current = false;
      const point: LatLng = [node.lat, node.lng];
      if (!draft) {
        setDraft({ path: [point], from: node.id });
      } else if (node.id !== draft.from || draft.path.length > 1) {
        finishCable([...draft.path, point], node.id);
      }
      return;
    }
    if (tool === 'duct') {
      // Duto liga caixas, postes, POP e datacenter (o próprio poste/caixa, não a CTO fixada nele).
      const point: LatLng = [node.lat, node.lng];
      if (!ductDraft) setDuctDraft({ path: [point], from: node.id });
      else if (node.id !== ductDraft.from || ductDraft.path.length > 1) finishDuct([...ductDraft.path, point], node.id);
      return;
    }
    if (tool === 'ruler') {
      setRuler((r) => [...r, [node.lat, node.lng]]);
      return;
    }
    if (tool === 'slack') {
      placeSlack([node.lat, node.lng], node);
      return;
    }
    if ((tool === 'cto' || tool === 'ceo') && !readOnly && (node.type === 'pole' || node.type === 'box')) {
      addNode(tool, [node.lat, node.lng], node);
      return;
    }
    if (tool === 'camera' && !readOnly && CAMERA_MOUNT_TYPES.includes(node.type)) {
      addNode('camera', [node.lat, node.lng], node);
      return;
    }
    // 1 clique abre o painel de propriedades; outro clique no mesmo objeto fecha.
    setSelection((s) => (s?.kind === 'node' && s.id === node.id ? null : { kind: 'node', id: node.id }));
  }

  async function finishCable(path = draft?.path ?? [], to: number | null = null) {
    if (!draft || path.length < 2) {
      setDraft(null);
      return;
    }
    const model = CABLE_MODELS.find((m) => m.id === cableModelId) ?? CABLE_MODELS.find((m) => m.id === 'as-12')!;
    const fromNode = nodes.find((n) => n.id === draft.from);
    const toNode = nodes.find((n) => n.id === to);
    const isDrop = fromNode?.type === 'client' || toNode?.type === 'client';
    const m = isDrop && model.category !== 'drop' ? CABLE_MODELS[0] : model;
    try {
      const cable = await api.createCable(projectId, {
        name: m.name,
        model: m.id,
        fiber_count: m.fibers,
        fibers_per_tube: m.perTube,
        category: m.category,
        color: CABLE_CATEGORIES[m.category].color,
        width: m.category === 'drop' ? 2 : 4,
        path,
        from_node_id: draft.from,
        to_node_id: to,
      });
      setCables((list) => [...list, cable]);
      setSelection({ kind: 'cable', id: cable.id });
      notify(toNode ? `Cabo criado e conectado em ${fromNode ? `${fromNode.name} e ` : ''}${toNode.name}` : 'Cabo criado');
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
      notify(`Importados ${r.nodes} pontos, ${r.cables} cabos${r.ducts ? `, ${r.ducts} dutos` : ''}${r.areas ? ` e ${r.areas} áreas` : ''}${r.skipped ? ` (${r.skipped} repetidos ignorados)` : ''}`);
    } catch (e) {
      notify(errorMessage(e), 'error');
    }
  }

  /**
   * Agrupar/Desagrupar: esconde (ou mostra de novo) tudo o que está à frente do objeto pelos cabos de saída.
   * Objeto fixado num poste/caixa agrupa pelo poste/caixa (os cabos da CTO fixada contam para o poste).
   */
  const groupKey = (n: NetNode) => anchors.hostOf.get(n.id)?.id ?? n.id;
  function toggleGroup(n: NetNode) {
    const id = groupKey(n);
    const mine = (g: number) => {
      const x = nodes.find((y) => y.id === g);
      return g === id || (!!x && groupKey(x) === id);
    };
    if (groups.some(mine)) {
      setGroups(groups.filter((g) => !mine(g)));
      notify(`${n.name} desagrupado: objetos à frente visíveis de novo`);
      return;
    }
    const count = groupView([id], nodes, cables).counts.get(id) ?? 0;
    if (!count) return notify(`Nada à frente de ${n.name} para agrupar (nenhum cabo de saída com objetos).`, 'error');
    setGroups([...groups, id]);
    notify(`${n.name} agrupado: ${count} ${count === 1 ? 'objeto oculto' : 'objetos ocultos'}`);
  }

  const selectedNode = selection?.kind === 'node' ? nodes.find((n) => n.id === selection.id) : undefined;
  const selectedCable = selection?.kind === 'cable' ? cables.find((c) => c.id === selection.id) : undefined;
  const selectedArea = selection?.kind === 'area' ? areas.find((a) => a.id === selection.id) : undefined;
  const selectedDuct = selection?.kind === 'duct' ? ducts.find((d) => d.id === selection.id) : undefined;
  const diagramNode = nodes.find((n) => n.id === diagramNodeId);
  const connectedCable = connectId ? cables.find((c) => c.id === connectId) : undefined;
  const menuCable = cableMenu ? cables.find((c) => c.id === cableMenu.id) : undefined;
  const hostEditorNode = hostEditorId ? nodes.find((n) => n.id === hostEditorId && ANCHOR_HOST_TYPES.includes(n.type)) : undefined;
  const menuPlan = useMemo(() => (menuCable ? planBoxesAlong(menuCable, nodes.filter((n) => showNode(n))) : null), [menuCable, nodes, visible, grouped]);
  // Pontos médios do cabo selecionado (memorizados pelo mesmo motivo de positionOf).
  const selectedPath = selectedCable?.path;
  const midpoints = useMemo<LatLng[]>(
    () => (selectedPath ? selectedPath.slice(1).map((p, i) => [(selectedPath[i][0] + p[0]) / 2, (selectedPath[i][1] + p[1]) / 2]) : []),
    [selectedPath],
  );

  const selectedDuctPath = selectedDuct?.path;
  const ductMidpoints = useMemo<LatLng[]>(
    () => (selectedDuctPath ? selectedDuctPath.slice(1).map((p, i) => [(selectedDuctPath[i][0] + p[0]) / 2, (selectedDuctPath[i][1] + p[1]) / 2]) : []),
    [selectedDuctPath],
  );
  /** Cabos que passam pelo duto selecionado (destacados no mapa). */
  const ductCableIds = useMemo(() => new Set(selectedDuct?.cable_ids ?? []), [selectedDuct]);

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
      ...ducts
        .filter((d) => d.name.toLowerCase().includes(q))
        .map((d) => ({
          kind: 'duct' as const,
          id: d.id,
          label: d.name,
          sub: 'Duto',
          at: d.path[0],
        })),
    ].slice(0, 8);
  }, [search, nodes, cables, ducts]);

  if (!project || !settings || !network) {
    return <div className="h-full flex items-center justify-center text-slate-400">Carregando projeto...</div>;
  }

  const overlayOpen = !!(diagramNode || modal || budget || history || report || otdr);
  /** Painel à esquerda aberto (propriedades, Lançar, Viabilidade, Área): a barra de ferramentas se afasta dele. */
  const leftPanelOpen =
    ((tool === 'launch' || tool === 'bulkfix' || tool === 'merge') && !readOnly) || tool === 'viability' || tool === 'otdr' || !!selectedArea || !!selectedDuct || !!selectedNode || !!selectedCable;
  const deployed = nodes.filter((n) => n.status === 'deployed' || n.status === 'certified').length;
  const pct = nodes.length ? Math.round((deployed / nodes.length) * 100) : 0;
  const hint =
    tool === 'area'
      ? `Clique para marcar os vértices da área (${areaDraft.length}). Enter ou "Finalizar área" conclui. Esc cancela.`
      : tool === 'duct'
        ? ductDraft
          ? `Duto ${formatLength(pathLength(ductDraft.path))}: clique para adicionar pontos (botão direito desfaz o último). Clique na caixa, POP ou poste de destino para concluir, ou Enter.`
          : 'Duto: clique na caixa, POP, datacenter ou poste de origem (ou no mapa para uma ponta solta).'
      : tool === 'launch'
        ? 'Lançar cabo: marque o início e o fim, adicione pontos de referência ou escolha os postes (clique no mapa). Esc volta para Selecionar.'
      : tool === 'merge'
        ? 'Unir: clique nos cabos (ou dutos) ligados ponta com ponta e depois em Unir. Esc volta para Selecionar.'
      : tool === 'bulkfix'
        ? 'Fixar em massa: escolha o que fixar, onde e a distância máxima. Confira as linhas amarelas e clique em Fixar. Esc volta para Selecionar.'
      : tool === 'slack'
        ? 'Clique sobre o cabo (ou no poste/caixa por onde ele passa) para posicionar a reserva técnica. Esc volta para Selecionar.'
        : tool === 'viability'
        ? 'Clique no local do cliente ou busque o endereço no painel.'
        : tool === 'otdr'
        ? 'OTDR: clique no cabo ou na caixa onde o OTDR será ligado, escolha o sentido e a fibra. Esc volta para Selecionar.'
        : readOnly && tool === 'select'
          ? 'Acesso somente leitura. Clique num elemento para ver detalhes.'
          : tool === 'cable'
            ? draft
              ? `${draft.from ? 'Cabo nascendo conectado. ' : ''}Clique para adicionar pontos (botão direito desfaz o último). Clique na caixa de destino para concluir já conectado, ou Enter.`
              : 'Clique na caixa de origem para o cabo já nascer conectado (ou no mapa para uma ponta solta).'
            : tool === 'ruler'
              ? `Régua: ${formatLength(pathLength(ruler))} · clique para medir, Esc limpa.`
              : tool !== 'select'
                ? `Clique no mapa para adicionar ${NODE_TYPES[tool].label} ou digite as coordenadas no painel acima.`
                : selectedDuct
                  ? 'Arraste os pontos do duto para mudar o traçado e as bolinhas menores para criar novos. Botão direito num ponto o remove.'
                  : selectedCable
                  ? 'Arraste os pontos para mover vértices e as bolinhas menores para criar novos. Botão direito num ponto o remove; no cabo, abre o menu de conexão.'
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
          {(['dc', 'pop', 'tower', 'ceo', 'cto', 'box', 'condo', 'client', 'camera'] as NodeType[]).map((t) => (
            <span key={t}>
              {NODE_TYPES[t].plural}: <b className="text-slate-300">{nodes.filter((n) => n.type === t).length}</b>
            </span>
          ))}
          <span className="col-span-2">
            Cabos: <b className="text-slate-300">{formatLength(cables.reduce((a, c) => a + c.length_m, 0))}</b>
          </span>
          {ducts.length > 0 && (
            <span className="col-span-2">
              Dutos: <b className="text-slate-300">{formatLength(ductTotals(ducts, (d) => d.length_m).total)}</b>
            </span>
          )}
        </div>
      </aside>

      {/* Mapa */}
      <div className="relative flex-1 min-w-0" data-float-area>
        <MapContainer
          center={initialView ? [initialView.lat, initialView.lng] : [project.center_lat, project.center_lng]}
          zoom={initialView?.zoom ?? project.zoom}
          maxZoom={21}
          className="h-full w-full"
          doubleClickZoom={false}
          ref={mapRef}
        >
          <AutoResize />
          <RememberView projectId={projectId} />
          {pendingMove && (
            <MoveConfirm at={pendingMove.at} onConfirm={confirmPendingMove} onCancel={cancelPendingMove}>
              Mover <b>{pendingMove.node.name}</b> {formatLength(distance([pendingMove.node.lat, pendingMove.node.lng], pendingMove.at))} para{' '}
              {formatCoord(roundLatLng(pendingMove.at)[0])}, {formatCoord(roundLatLng(pendingMove.at)[1])}?
            </MoveConfirm>
          )}
          {deleteTarget && (
            <MoveConfirm at={deleteTarget.at} onConfirm={confirmPendingDelete} onCancel={() => setPendingDelete(null)} confirmLabel="Excluir" danger>
              {deleteTarget.question}
            </MoveConfirm>
          )}
          <BaseTiles
            engine={engine}
            mapStyle={mapStyle}
            googleKey={googleKey.key}
            onError={(m) => {
              notify(`${m} Voltando ao OpenStreetMap.`, 'error');
              setEngine('osm');
            }}
          />
          <MapEvents
            onClick={(at) => {
              if (cableMenu) return setCableMenu(null);
              if (anchorPick) return setAnchorPick(null);
              if (connectId) return;
              if (tool === 'select') setSelection(null);
              else if (tool === 'viability') setViaPoint(at);
              else if (tool === 'launch') setLaunchPick({ at, t: Date.now() });
              else if (tool === 'area') setAreaDraft((a) => [...a, at]);
              else if (tool === 'cable') setDraft((d) => (d ? { ...d, path: [...d.path, at] } : { path: [at], from: null }));
              else if (tool === 'duct') setDuctDraft((d) => (d ? { ...d, path: [...d.path, at] } : { path: [at], from: null }));
              else if (tool === 'ruler') setRuler((r) => [...r, at]);
              else if (tool === 'slack') placeSlack(at);
              else if (tool === 'bulkfix' || tool === 'merge' || tool === 'otdr') return;
              else addNode(tool, at);
            }}
            onMove={setCursor}
            onZoom={setZoom}
            onContextMenu={() => {
              if (tool === 'cable' && draft) undoDraftPoint();
              if (tool === 'duct' && ductDraft) setDuctDraft((d) => (!d || d.path.length <= 1 ? null : { ...d, path: d.path.slice(0, -1) }));
              setCableMenu(null);
            }}
            onMoveStart={() => setCableMenu(null)}
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

          {/* Dutos: tubo largo (borda na cor do duto, miolo escuro) por baixo dos cabos. "Em projeto" fica tracejado. */}
          {visible.ducts &&
            ducts.map((d) => {
              const sel = (selection?.kind === 'duct' && selection.id === d.id) || (tool === 'merge' && mergeSel.kind === 'duct' && mergeSel.ids.includes(d.id));
              const path = ductPath(d);
              const planned = d.status === 'planned';
              const pick = (e: L.LeafletMouseEvent) => {
                if (tool === 'merge' && !readOnly) {
                  L.DomEvent.stopPropagation(e);
                  return toggleMerge('duct', d.id);
                }
                if (tool !== 'select') return;
                L.DomEvent.stopPropagation(e);
                if ((e.originalEvent.ctrlKey || e.originalEvent.metaKey || e.originalEvent.shiftKey) && !readOnly) return toggleMerge('duct', d.id, true);
                setCableMenu(null);
                setSelection({ kind: 'duct', id: d.id });
              };
              return (
                <Fragment key={`duct${d.id}`}>
                  {sel && <Polyline positions={path} interactive={false} pathOptions={{ color: '#facc15', weight: 26, opacity: 0.45, lineCap: 'round' }} />}
                  <Polyline
                    positions={path}
                    pathOptions={{ color: d.color, weight: 18, opacity: 0.95, lineCap: planned ? 'butt' : 'round', dashArray: planned ? '14 6' : undefined }}
                    eventHandlers={{ click: pick }}
                  >
                    {labels && zoom >= 16 && (
                      <Tooltip sticky>{`${d.name} · ${formatLength(d.length_m)} · ${d.cable_ids?.length ?? 0} cabo${(d.cable_ids?.length ?? 0) === 1 ? '' : 's'}`}</Tooltip>
                    )}
                  </Polyline>
                  <Polyline positions={path} interactive={false} pathOptions={{ color: '#1c1917', weight: 11, opacity: 0.85, lineCap: 'round' }} />
                </Fragment>
              );
            })}

          {/* Cabos que passam pelo duto selecionado: halo na cor do duto. */}
          {selectedDuct &&
            cables
              .filter((c) => ductCableIds.has(c.id) && showCable(c))
              .map((c) => <Polyline key={`dc${c.id}`} positions={displayPath(c)} interactive={false} pathOptions={{ color: '#fde68a', weight: c.width + 6, opacity: 0.55 }} />)}

          {/* Unir: halo nos cabos marcados. */}
          {tool === 'merge' &&
            mergeSel.kind === 'cable' &&
            cables
              .filter((c) => mergeSel.ids.includes(c.id) && showCable(c))
              .map((c) => <Polyline key={`mg${c.id}`} positions={displayPath(c)} interactive={false} pathOptions={{ color: '#facc15', weight: c.width + 8, opacity: 0.55 }} />)}

          {/* Destaque do cabo selecionado: halo amarelo por baixo, o cabo mantém a cor e o estilo. */}
          {selectedCable && showCable(selectedCable) && (
            <Polyline
              positions={displayPath(selectedCable)}
              interactive={false}
              pathOptions={{ color: '#facc15', weight: selectedCable.width + 8, opacity: 0.45 }}
            />
          )}
          {cables
            .filter((c) => showCable(c))
            .map((c) => (
              <Polyline
                key={c.id}
                positions={displayPath(c)}
                pathOptions={{
                  color: c.color,
                  weight: c.width,
                  dashArray: lineDash(effectiveLineStyle(c), c.width),
                  lineCap: 'round',
                  opacity: 0.95,
                }}
                eventHandlers={{
                  click: (e) => {
                    if (tool === 'slack') {
                      L.DomEvent.stopPropagation(e);
                      placeSlack([e.latlng.lat, e.latlng.lng], undefined, c);
                      return;
                    }
                    if (tool === 'merge' && !readOnly) {
                      L.DomEvent.stopPropagation(e);
                      return toggleMerge('cable', c.id);
                    }
                    if (tool === 'otdr') {
                      L.DomEvent.stopPropagation(e);
                      return pickOtdrCable(c);
                    }
                    if (tool !== 'select') return;
                    L.DomEvent.stopPropagation(e);
                    if ((e.originalEvent.ctrlKey || e.originalEvent.metaKey || e.originalEvent.shiftKey) && !readOnly && !connectId) return toggleMerge('cable', c.id, true);
                    setCableMenu(null);
                    const double = isDoubleClick(`c${c.id}`);
                    // 1 clique abre as propriedades; outro clique no mesmo cabo fecha (duplo clique abre a edição).
                    const toggleOff = !connectId && !double && selection?.kind === 'cable' && selection.id === c.id;
                    setSelection(toggleOff ? null : { kind: 'cable', id: c.id });
                    if (connectId) {
                      // No modo conectar: clicar em outro cabo passa a trabalhar nele; duplo clique cria um ponto.
                      if (connectId !== c.id) return setConnectId(c.id);
                      if (double) {
                        const at: LatLng = roundLatLng([e.latlng.lat, e.latlng.lng]);
                        const seg = nearestOnPath(c.path, at).seg;
                        saveCablePath(c, [...c.path.slice(0, seg + 1), at, ...c.path.slice(seg + 1)]);
                      }
                      return;
                    }
                    if (double) setEditorFocus(Date.now());
                  },
                  contextmenu: (e) => {
                    if (tool !== 'select' || readOnly) return;
                    L.DomEvent.stopPropagation(e);
                    e.originalEvent.preventDefault();
                    setSelection({ kind: 'cable', id: c.id });
                    setCableMenu({ id: c.id, x: e.containerPoint.x, y: e.containerPoint.y });
                  },
                }}
              >
                {labels && zoom >= 17 && <Tooltip sticky>{`${c.name} · ${formatLength(c.length_m)}`}</Tooltip>}
              </Polyline>
            ))}

          {/* Wireless: setores de cobertura (sem enlace) e linhas dos enlaces PtP entre torres/POPs. */}
          {visible.wireless &&
            zoom >= 13 &&
            nodes
              .filter((n) => showNode(n) && RADIO_HOST_TYPES.includes(n.type))
              .flatMap((n) =>
                radiosOf(n)
                  .filter((r) => !r.link && typeof r.azimuth === 'number')
                  .map((r) => {
                    const k = RADIO_KINDS[r.kind] ?? RADIO_KINDS.other;
                    return (
                      <Polygon
                        key={`rs${n.id}-${r.id}`}
                        positions={sectorPolygon([n.lat, n.lng], r.azimuth ?? 0, radioBeam(r), k.reach)}
                        interactive={false}
                        pathOptions={{ color: k.color, weight: 1, fillColor: k.color, fillOpacity: 0.15, opacity: 0.7 }}
                      />
                    );
                  }),
              )}
          {visible.wireless &&
            radioLinks(
              nodes.filter((n) => showNode(n)),
              distance,
            ).map((l) => {
              // Estilo próprio do enlace (não confunde com cabo/drop): halo largo + pontilhado arredondado + ícone de rádio no meio.
              const a: LatLng = [l.from.lat, l.from.lng];
              const b: LatLng = [l.to.lat, l.to.lng];
              const color = linkColor(l.mutual);
              const label = `Enlace wireless ${l.from.name} ↔ ${l.to.name} · ${formatLength(l.dist)}${l.radio.freq_ghz ? ` · ${String(l.radio.freq_ghz).replace('.', ',')} GHz` : ''}${l.mutual ? '' : ' (só uma ponta cadastrada)'}`;
              return (
                <Fragment key={`rl${l.key}`}>
                  <Polyline positions={[a, b]} interactive={false} pathOptions={{ color, weight: LINK_STYLE.halo, opacity: LINK_STYLE.haloOpacity, lineCap: 'round' }} />
                  <Polyline positions={[a, b]} pathOptions={{ color, weight: LINK_STYLE.weight, dashArray: LINK_STYLE.dash, lineCap: 'round', opacity: 1 }}>
                    <Tooltip sticky>{label}</Tooltip>
                  </Polyline>
                  <Marker position={linkMidpoint(a, b)} icon={wirelessLinkIcon(color)} zIndexOffset={-100}>
                    <Tooltip direction="top" offset={[0, -10]}>
                      {label}
                    </Tooltip>
                  </Marker>
                </Fragment>
              );
            })}

          {/* Câmeras: campo de visão e ligações tracejadas com o gravador (DVR/NVR) e com o objeto onde estão instaladas. */}
          {zoom >= 15 &&
            nodes
              .filter((n) => n.type === 'camera' && showNode(n))
              .map((n) => {
                const fov = fovPolygon(n);
                return fov ? (
                  <Polygon
                    key={`fov${n.id}`}
                    positions={fov}
                    interactive={false}
                    pathOptions={{ color: CAMERA_COLOR, weight: 1, fillColor: CAMERA_COLOR, fillOpacity: 0.18, opacity: 0.8 }}
                  />
                ) : null;
              })}
          {zoom >= 15 &&
            cameraLinks(nodes.filter((n) => showNode(n)))
              .filter((l) => l.kind === 'dvr' || !anchors.anchored.has(l.from.id))
              .map((l) => (
              <Polyline
                key={`cl${l.key}`}
                positions={[
                  [l.from.lat, l.from.lng],
                  [l.to.lat, l.to.lng],
                ]}
                pathOptions={l.kind === 'dvr' ? { color: CAMERA_COLOR, weight: 2, dashArray: '2 6', opacity: 0.9, lineCap: 'round' } : { color: '#e2e8f0', weight: 1.5, dashArray: '3 4', opacity: 0.7 }}
              >
                <Tooltip sticky>{l.kind === 'dvr' ? `${l.from.name} → ${l.to.name} (canal ${cameraOf(l.from).dvr_channel ?? '?'})` : `${l.from.name} instalada em ${l.to.name}`}</Tooltip>
              </Polyline>
            ))}

          {nodes
            .filter((n) => showMarker(n))
            .map((n) => {
              const level = n.type === 'client' ? powerLevel(clientPower.get(n.id)?.power ?? null, settings) : null;
              // Objetos fixados no poste/caixa: mini ícones fundidos ao dele (o poste fica selecionado junto).
              const stack = (anchors.byHost.get(n.id) ?? []).filter((c) => showNode(c));
              const coils = hostSlacks.byHost.get(n.id) ?? [];
              const label = stack.length ? stack.map((c) => c.name).join(' · ') : coils.length ? `Reserva ${coils.reduce((a, x) => a + x.slack.length_m, 0)} m` : n.name;
              return (
                <Marker
                  key={n.id}
                  position={positionOf(n)}
                  icon={nodeIcon(n, {
                    stack,
                    coils: hostSlacks.byHost.get(n.id)?.map((x) => x.cable.color),
                    selected: selection?.kind === 'node' && (selection.id === n.id || stack.some((c) => c.id === selection.id)),
                    fill: level ? POWER_COLORS[level] : undefined,
                    group: grouped.counts.get(n.id),
                    shared: !!n.share,
                    dot:
                      n.type === 'camera' && cameraOf(n).cam_status
                        ? HEALTH_COLORS[cameraHealth(cameraOf(n).cam_status)]
                        : FIXABLE_TYPES.includes(n.type) && unfixed.has(n.id)
                          ? '#f59e0b'
                          : undefined,
                  })}
                  draggable={tool === 'select' && !readOnly && !nodeLocked(n)}
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
                  {labels && (zoom >= 17 || n.type === 'pop' || n.type === 'dc' || n.type === 'tower' || n.type === 'condo') && (n.type !== 'pole' || stack.length > 0 || coils.length > 0) && (
                    <Tooltip
                      permanent
                      direction="bottom"
                      offset={[0, 10]}
                      className="!bg-slate-900/80 !text-white !border-0 !shadow-none !text-[11px] !px-1.5 !py-0"
                    >
                      {label}
                    </Tooltip>
                  )}
                </Marker>
              );
            })}

          {/* Reservas técnicas: arrastáveis ao longo do próprio cabo. */}
          {cables
            .filter((c) => showCable(c) && c.slacks?.length)
            .flatMap((c) =>
              c.slacks!.filter((r) => !hostSlacks.hidden.has(r)).map((r) => (
                <Marker
                  key={`s${c.id}-${r.id}-${r.lat}-${r.lng}-${labels && zoom >= 18 ? 1 : 0}`}
                  position={slackPositionOf(r)}
                  icon={slackIcon(r.kind, c.color, selection?.kind === 'cable' && selection.id === c.id)}
                  draggable={tool === 'select' && !readOnly}
                  zIndexOffset={500}
                  eventHandlers={{
                    click: (e) => {
                      L.DomEvent.stopPropagation(e);
                      if (tool === 'bulkfix') return;
                      if (tool === 'merge') return toggleMerge('cable', c.id);
                      setSelection({ kind: 'cable', id: c.id });
                    },
                    dragend: (e) => {
                      const ll = (e.target as L.Marker).getLatLng();
                      const pos = roundLatLng(pointOnPath(c.path, [ll.lat, ll.lng]));
                      (e.target as L.Marker).setLatLng(pos);
                      saveSlacks(
                        c,
                        c.slacks!.map((x) => (x.id === r.id ? { ...x, lat: pos[0], lng: pos[1] } : x)),
                        `Reserva de ${r.length_m} m movida em ${c.name}`,
                      );
                    },
                  }}
                >
                  <Tooltip direction="top" offset={[0, -10]} permanent={labels && zoom >= 18}>
                    {`${r.length_m} m · ${SLACK_KINDS[r.kind].label}`}
                  </Tooltip>
                </Marker>
              )),
            )}

          {/* Pontos (vértices) de todos os cabos: fundo branco e borda na cor do cabo. */}
          {zoom >= 16 &&
            cables
              .filter((c) => showCable(c) && !(c.id === selectedCable?.id && tool === 'select' && !readOnly))
              .flatMap((c) =>
                displayPath(c).map((p, i) => (
                  <CircleMarker
                    key={`d${c.id}-${i}`}
                    center={p}
                    radius={Math.max(3, Math.min(6, c.width / 2 + 2))}
                    interactive={false}
                    pathOptions={{ color: c.color, weight: 2, fillColor: '#ffffff', fillOpacity: 1 }}
                  />
                )),
              )}

          {selectedCable && tool === 'select' && !readOnly && showCable(selectedCable) && (
            <>
              {selectedCable.path.map((p, i) => {
                const last = selectedCable.path.length - 1;
                const connecting = connectId === selectedCable.id;
                // Pontas ligadas a um objeto se movem arrastando o próprio objeto (fora do modo conectar).
                if (!connecting && ((i === 0 && selectedCable.from_node_id) || (i === last && selectedCable.to_node_id))) return null;
                return (
                  <Marker
                    key={`v${selectedCable.id}-${i}-${selectedCable.path.length}-${connecting ? 'c' : ''}`}
                    position={p}
                    icon={connecting ? connectIcon(selectedCable.color) : vertexIcon(selectedCable.color)}
                    draggable
                    zIndexOffset={1000}
                    eventHandlers={{
                      click: (e) => L.DomEvent.stopPropagation(e),
                      drag: (e) => {
                        const ll = (e.target as L.Marker).getLatLng();
                        setVertexDrag({ cableId: selectedCable.id, index: i, at: [ll.lat, ll.lng], insert: false });
                        if (connecting) setSnapNode(snapTarget(selectedCable, i, false, [ll.lat, ll.lng]));
                      },
                      dragend: (e) => {
                        const ll = (e.target as L.Marker).getLatLng();
                        setVertexDrag(null);
                        setSnapNode(null);
                        if (connecting) return connectDrop(selectedCable, i, false, [ll.lat, ll.lng]);
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
                    icon={midpointIcon(selectedCable.color)}
                    draggable
                    zIndexOffset={900}
                    eventHandlers={{
                      click: (e) => L.DomEvent.stopPropagation(e),
                      drag: (e) => {
                        const ll = (e.target as L.Marker).getLatLng();
                        setVertexDrag({ cableId: selectedCable.id, index: i + 1, at: [ll.lat, ll.lng], insert: true });
                        if (connectId === selectedCable.id) setSnapNode(snapTarget(selectedCable, i + 1, true, [ll.lat, ll.lng]));
                      },
                      dragend: (e) => {
                        const ll = (e.target as L.Marker).getLatLng();
                        setVertexDrag(null);
                        setSnapNode(null);
                        if (connectId === selectedCable.id) return connectDrop(selectedCable, i + 1, true, [ll.lat, ll.lng]);
                        saveCablePath(selectedCable, [...selectedCable.path.slice(0, i + 1), [ll.lat, ll.lng], ...selectedCable.path.slice(i + 1)]);
                      },
                    }}
                  />
                );
              })}
            </>
          )}

          {selectedDuct && tool === 'select' && !readOnly && visible.ducts && (
            <>
              {selectedDuct.path.map((p, i) => {
                const last = selectedDuct.path.length - 1;
                // Pontas ligadas a um objeto se movem com ele.
                if ((i === 0 && selectedDuct.from_node_id) || (i === last && selectedDuct.to_node_id)) return null;
                return (
                  <Marker
                    key={`dv${selectedDuct.id}-${i}-${selectedDuct.path.length}`}
                    position={p}
                    icon={vertexIcon(selectedDuct.color)}
                    draggable
                    zIndexOffset={1000}
                    eventHandlers={{
                      click: (e) => L.DomEvent.stopPropagation(e),
                      drag: (e) => {
                        const ll = (e.target as L.Marker).getLatLng();
                        setDuctVertexDrag({ ductId: selectedDuct.id, index: i, at: [ll.lat, ll.lng], insert: false });
                      },
                      dragend: (e) => {
                        const ll = (e.target as L.Marker).getLatLng();
                        setDuctVertexDrag(null);
                        saveDuctPath(
                          selectedDuct,
                          selectedDuct.path.map((q, j) => (j === i ? [ll.lat, ll.lng] : q)),
                        );
                      },
                      contextmenu: (e) => {
                        L.DomEvent.stopPropagation(e);
                        if (selectedDuct.path.length > 2) saveDuctPath(selectedDuct, selectedDuct.path.filter((_, j) => j !== i));
                      },
                    }}
                  >
                    <Tooltip direction="top" offset={[0, -6]}>
                      Vértice {i + 1}: {formatCoord(p[0])}, {formatCoord(p[1])}
                    </Tooltip>
                  </Marker>
                );
              })}
              {ductMidpoints.map((mid, i) => (
                <Marker
                  key={`dm${selectedDuct.id}-${i}-${selectedDuct.path.length}`}
                  position={mid}
                  icon={midpointIcon(selectedDuct.color)}
                  draggable
                  zIndexOffset={900}
                  eventHandlers={{
                    click: (e) => L.DomEvent.stopPropagation(e),
                    drag: (e) => {
                      const ll = (e.target as L.Marker).getLatLng();
                      setDuctVertexDrag({ ductId: selectedDuct.id, index: i + 1, at: [ll.lat, ll.lng], insert: true });
                    },
                    dragend: (e) => {
                      const ll = (e.target as L.Marker).getLatLng();
                      setDuctVertexDrag(null);
                      saveDuctPath(selectedDuct, [...selectedDuct.path.slice(0, i + 1), [ll.lat, ll.lng], ...selectedDuct.path.slice(i + 1)]);
                    },
                  }}
                />
              ))}
            </>
          )}

          {snapNode && (
            <CircleMarker
              center={[snapNode.lat, snapNode.lng]}
              radius={18}
              interactive={false}
              pathOptions={{ color: '#10b981', weight: 3, fillColor: '#10b981', fillOpacity: 0.15 }}
            />
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
          {ductDraft && (
            <>
              <Polyline positions={cursor ? [...ductDraft.path, cursor] : ductDraft.path} pathOptions={{ color: DUCT_COLOR, weight: 10, opacity: 0.7, lineCap: 'round' }} />
              <Polyline positions={cursor ? [...ductDraft.path, cursor] : ductDraft.path} pathOptions={{ color: '#facc15', weight: 2, dashArray: '6 6' }} />
            </>
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
          {tool === 'otdr' && laser && <LaserLayer laser={laser} />}
          {tool === 'launch' && launchPreview && <LaunchLayer preview={launchPreview} nodes={nodes} />}
          {tool === 'bulkfix' && bulkPreview && <BulkFixLayer preview={bulkPreview} />}
          {tool === 'bulkfix' && <ViewBounds onChange={setMapBounds} />}
          {ruler.length > 0 && <Polyline positions={cursor && tool === 'ruler' ? [...ruler, cursor] : ruler} pathOptions={{ color: '#f472b6', weight: 3 }} />}
        </MapContainer>

        {/* Barra de ferramentas, com o aviso e o painel de coordenadas empilhados logo abaixo dela */}
        <div
          className={`absolute top-3 z-[1000] flex flex-col ${toolbarPanel.moved ? 'items-start' : 'items-center'} gap-1.5 pointer-events-none ${
            // Sem painel à esquerda: centralizada no mapa. Com painel: centralizada entre ele (w-80 + margens) e o painel de
            // camadas (w-48, se estiver no lugar padrão), quebrando em duas linhas se não couber, para nunca ficar por baixo.
            !toolbarPanel.moved && leftPanelOpen
              ? `left-[21.5rem] ${layersPanel.moved ? 'right-3' : 'right-[13.5rem]'}`
              : 'left-1/2 -translate-x-1/2 max-w-[calc(100%-1.5rem)]'
          }`}
          style={toolbarPanel.style}
        >
          <div
            ref={toolbarPanel.boxRef}
            onPointerDown={toolbarPanel.onPointerDown}
            className={`panel relative z-10 flex ${!toolbarPanel.moved && leftPanelOpen ? 'flex-wrap justify-center' : ''} p-1 gap-0.5 pointer-events-auto ${toolbarPanel.locked ? '' : 'cursor-move !border-amber-500/60'} ${toolbarPanel.dragging ? 'select-none shadow-2xl' : ''}`}
          >
            <ToolFan groups={toolGroups} tool={tool} onPick={pickTool} />
            <div className="self-start pl-0.5">
              <PanelLock panel={toolbarPanel} vertical />
            </div>
          </div>

          {toast && !overlayOpen && <Toast inline message={toast.message} kind={toast.kind} onClose={() => setToast(null)} />}

          {/* Metragem e tipo da reserva técnica */}
          {!readOnly && tool === 'slack' && (
            <div className="panel flex items-center gap-2 p-2 text-xs pointer-events-auto">
              <span className="text-slate-300 flex items-center gap-1">
                <SlackToolIcon size={14} /> Reserva técnica
              </span>
              <input
                type="number"
                min={0}
                className="input !py-1 !w-16 text-right"
                value={slackDefaults.length}
                onChange={(e) => setSlackDefaults({ ...slackDefaults, length: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
              />
              <span className="text-slate-400">m</span>
              {(Object.keys(SLACK_KINDS) as SlackKind[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setSlackDefaults({ ...slackDefaults, kind: k })}
                  title={SLACK_KINDS[k].hint}
                  className={`rounded px-2 py-1 cursor-pointer ${slackDefaults.kind === k ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                >
                  {SLACK_KINDS[k].label}
                </button>
              ))}
              {slackCableId && <span className="text-slate-400">no cabo {cables.find((c) => c.id === slackCableId)?.name}</span>}
            </div>
          )}

          {/* Tipo de câmera lançada pela ferramenta Câmera */}
          {!readOnly && tool === 'camera' && (
            <div className="panel flex items-center gap-2 p-2 text-xs pointer-events-auto">
              <span className="text-slate-300 flex items-center gap-1">
                <Cctv size={14} /> Câmera
              </span>
              {(Object.keys(CAMERA_KINDS) as CameraKind[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setCameraKind(k)}
                  title={CAMERA_KINDS[k].hint}
                  className={`flex items-center gap-1 rounded px-2 py-1 cursor-pointer ${cameraKind === k ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                >
                  {k === 'dvr' ? <Video size={13} /> : <Cctv size={13} />} {k === 'dvr' ? 'DVR / NVR' : CAMERA_KINDS[k].short}
                </button>
              ))}
              <span className="text-slate-500 hidden lg:inline">Clique no mapa ou num poste, cliente, datacenter ou POP.</span>
            </div>
          )}

          {/* CTO/CEO: como fixar */}
          {!readOnly && (tool === 'cto' || tool === 'ceo') && (
            <div className="panel flex items-center gap-2 p-2 text-xs pointer-events-auto">
              {(['cto', 'ceo'] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setTool(k)}
                  title={NODE_TYPES[k].label}
                  className={`flex items-center gap-1 rounded px-2 py-1 cursor-pointer ${tool === k ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                >
                  {k === 'cto' ? <SquareStack size={13} /> : <Hexagon size={13} />} {k.toUpperCase()}
                </button>
              ))}
              <span className="text-slate-400">Clique num poste ou numa caixa para fixar nele. Na parede: clique no mapa e informe o endereço.</span>
            </div>
          )}

          {/* Tipo da caixa lançada pela ferramenta Caixa */}
          {!readOnly && tool === 'box' && (
            <div className="panel flex flex-wrap items-center gap-2 p-2 text-xs pointer-events-auto">
              <span className="text-slate-300 flex items-center gap-1">
                <Archive size={14} /> Caixa
              </span>
              {(Object.keys(BOX_KINDS) as BoxKind[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setBoxKindTool(k)}
                  title={BOX_KINDS[k].hint}
                  className={`flex items-center gap-1 rounded px-2 py-1 cursor-pointer ${boxKindTool === k ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                >
                  {k === 'wall' ? <BrickWall size={13} /> : <Archive size={13} />} {BOX_KINDS[k].label}
                </button>
              ))}
              <span className="text-slate-600">|</span>
              {(Object.keys(BOX_PLACES) as BoxPlace[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setBoxPlaceTool(k)}
                  title={BOX_PLACES[k].hint}
                  className={`rounded px-2 py-1 cursor-pointer ${boxPlaceTool === k ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                >
                  {BOX_PLACES[k].label}
                </button>
              ))}
              <span className="text-slate-500 hidden lg:inline">Clique no mapa para posicionar.</span>
            </div>
          )}

          {/* Tipo do condomínio lançado pela ferramenta Condomínio */}
          {!readOnly && tool === 'condo' && (
            <div className="panel flex items-center gap-2 p-2 text-xs pointer-events-auto">
              <span className="text-slate-300 flex items-center gap-1">
                <Building2 size={14} /> Condomínio de
              </span>
              {(Object.keys(CONDO_KINDS) as CondoKind[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setCondoKind(k)}
                  className={`flex items-center gap-1 rounded px-2 py-1 cursor-pointer ${condoKind === k ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                >
                  {k === 'houses' ? <Houses size={13} /> : <Building2 size={13} />} {CONDO_KINDS[k].label}
                </button>
              ))}
              <span className="text-slate-500 hidden lg:inline">Clique no mapa para posicionar.</span>
            </div>
          )}

          {/* Tipo do cabo lançado pela ferramenta Cabo */}
          {!readOnly && (tool === 'cable' || tool === 'launch') && (
            <div className="panel flex items-center gap-2 p-2 text-xs pointer-events-auto">
              {(
                [
                  ['cable', 'Desenhar', <CableIcon key="c" size={13} />, 'Desenhar o cabo clicando nos pontos do trajeto'],
                  ['launch', 'Lançar', <LaunchIcon key="l" size={13} />, 'Lançar o cabo pelas ruas, postes, caixas e dutos, com reservas'],
                ] as const
              ).map(([k, label, icon, hint]) => (
                <button
                  key={k}
                  onClick={() => tool !== k && pickTool(k)}
                  title={hint}
                  className={`flex items-center gap-1 rounded px-2 py-1 cursor-pointer ${tool === k ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                >
                  {icon} {label}
                </button>
              ))}
              {tool === 'launch' && <span className="text-slate-500 hidden lg:inline">Siga o painel à esquerda.</span>}
              {tool === 'cable' && (
                <>
              <span className="text-slate-600">|</span>
              <span className="text-slate-300">Tipo de cabo</span>
              <select className="input !py-1 !w-40" value={cableModelId} onChange={(e) => setCableModelId(e.target.value)} disabled={!!draft}>
                {CABLE_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} · {CABLE_CATEGORIES[m.category].label}
                  </option>
                ))}
              </select>
              <span className="text-slate-500 hidden lg:inline">Ligado a um cliente vira Drop.</span>
                </>
              )}
            </div>
          )}

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
          {connectedCable ? (
            <div className="panel px-3 py-1.5 text-xs text-slate-200 flex items-center gap-3 !border-emerald-500">
              <Link2 size={16} className="text-emerald-400 shrink-0" />
              <span>
                <b>Conectando {connectedCable.name}</b>
                <br />
                <span className="text-slate-400">
                  Arraste a ponta até um objeto (conexão) ou um ponto do meio até uma CTO, CEO ou POP (sangria). Duplo clique no cabo cria um ponto. Clique em outro cabo para trabalhar nele.
                </span>
              </span>
              <button className="btn-primary !py-1 text-xs flex items-center gap-1 shrink-0" onClick={() => setConnectId(null)} title="Esc">
                <Check size={14} /> Concluir
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
          {draft && (
            <>
              <button className="btn-ghost !py-1.5 text-xs flex items-center gap-1 whitespace-nowrap" onClick={undoDraftPoint} title="Botão direito no mapa">
                <Undo2 size={14} /> Desfazer ponto
              </button>
              <button className="btn-ghost !py-1.5 text-xs flex items-center gap-1" onClick={() => setDraft(null)} title="Esc">
                <X size={14} /> Cancelar
              </button>
            </>
          )}
          {ductDraft && (
            <>
              <button
                className="btn-ghost !py-1.5 text-xs flex items-center gap-1 whitespace-nowrap"
                onClick={() => setDuctDraft((d) => (!d || d.path.length <= 1 ? null : { ...d, path: d.path.slice(0, -1) }))}
                title="Botão direito no mapa"
              >
                <Undo2 size={14} /> Desfazer ponto
              </button>
              <button className="btn-ghost !py-1.5 text-xs flex items-center gap-1" onClick={() => setDuctDraft(null)} title="Esc">
                <X size={14} /> Cancelar
              </button>
            </>
          )}
          {ductDraft && ductDraft.path.length > 1 && (
            <button className="btn-primary !py-1.5 text-xs whitespace-nowrap" onClick={() => finishDuct()}>
              Finalizar duto ({formatLength(pathLength(ductDraft.path))})
            </button>
          )}
          {draft && draft.path.length > 1 && (
            <button className="btn-primary !py-1.5 text-xs whitespace-nowrap" onClick={() => finishCable()}>
              Finalizar cabo ({formatLength(pathLength(draft.path))})
            </button>
          )}
        </div>

        {/* Ferramenta Cabo num poste/caixa com várias CTO/CEO fixadas: em qual ligar */}
        {anchorPick && (
          <div className="absolute z-[1100] panel w-60 py-1 text-sm shadow-xl" style={{ left: Math.max(8, anchorPick.x - 120), top: anchorPick.y + 16 }} onContextMenu={(e) => e.preventDefault()}>
            <div className="px-3 py-1.5 border-b border-slate-800 text-xs text-slate-400">Ligar o cabo em qual objeto de {anchorPick.host.name}?</div>
            {[...anchorPick.options, anchorPick.host].map((o) => (
              <MenuItem
                key={o.id}
                icon={<span className="inline-flex" dangerouslySetInnerHTML={{ __html: nodeGlyph(o, 14) }} />}
                label={o.id === anchorPick.host.id ? `${o.name} (o próprio ${NODE_TYPES[o.type].label.toLowerCase()})` : `${NODE_TYPES[o.type].label} ${o.name}`}
                onClick={() => {
                  setAnchorPick(null);
                  if (o.id === anchorPick.host.id) pickedAnchor.current = true;
                  nodeClicked(o);
                }}
              />
            ))}
          </div>
        )}

        {/* Menu do botão direito no cabo */}
        {menuCable && cableMenu && (
          <div
            className="absolute z-[1100] panel w-64 py-1 text-sm shadow-xl"
            style={{ left: Math.max(8, cableMenu.x - 128), top: cableMenu.y + 12 }}
            onContextMenu={(e) => e.preventDefault()}
          >
            <div className="px-3 py-1.5 border-b border-slate-800">
              <div className="font-semibold truncate">{menuCable.name}</div>
              <div className="text-[11px] text-slate-400">
                Cabo {menuCable.fiber_count}FO · {formatLength(menuCable.length_m)}
              </div>
            </div>
            <MenuItem
              icon={<Pencil size={14} />}
              label="Editar"
              onClick={() => {
                setCableMenu(null);
                setEditorFocus(Date.now());
              }}
            />
            <MenuItem
              icon={<SlackToolIcon size={14} />}
              label="Posicionar reserva"
              onClick={() => {
                setCableMenu(null);
                setTool('slack');
                setSlackCableId(menuCable.id);
              }}
            />
            <MenuItem
              icon={<Link2 size={14} />}
              label="Conectar a caixa, poste ou POP"
              onClick={() => {
                setCableMenu(null);
                setConnectId(menuCable.id);
              }}
            />
            {cableMenu.confirm && menuPlan ? (
              <div className="mx-1 my-1 rounded-md bg-emerald-950/60 border border-emerald-800 p-2">
                <div className="text-xs font-semibold text-emerald-200">
                  Conectar {menuPlan.nodes.length} caixa{menuPlan.nodes.length > 1 ? 's' : ''} a este cabo?
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {menuPlan.nodes.map((n) => n.name).join(', ')}.{' '}
                  {menuPlan.cuts.length ? 'O cabo será sangrado em cada caixa do meio.' : 'A ponta solta será ligada à caixa.'}
                </div>
                <div className="flex gap-1 mt-2">
                  <button className="btn-ghost flex-1 !py-1 text-xs flex items-center justify-center gap-1" onClick={() => setCableMenu({ ...cableMenu, confirm: false })}>
                    <X size={12} /> Não
                  </button>
                  <button className="btn-primary flex-1 !py-1 text-xs flex items-center justify-center gap-1" onClick={() => connectAlong(menuCable, menuPlan)}>
                    <Check size={12} /> Sim, conectar
                  </button>
                </div>
              </div>
            ) : (
              <MenuItem
                icon={<Waypoints size={14} />}
                label={`Conectar caixas no traçado (${menuPlan?.nodes.length ?? 0})`}
                title={menuPlan ? undefined : `Nenhuma CTO ou CEO a até ${ALONG_TOLERANCE_M} m do traçado`}
                disabled={!menuPlan}
                onClick={() => setCableMenu({ ...cableMenu, confirm: true })}
              />
            )}
            <div className="border-t border-slate-800 my-1" />
            <MenuItem icon={<Trash2 size={14} />} label="Excluir" danger onClick={() => deleteCable(menuCable)} />
          </div>
        )}

        {/* Camadas */}
        <div
          ref={layersPanel.boxRef}
          onPointerDown={layersPanel.onPointerDown}
          style={layersPanel.style}
          className={`absolute top-3 right-3 z-[1000] panel w-48 p-3 text-sm space-y-3 ${layersPanel.locked ? '' : 'cursor-move !border-amber-500/60'} ${layersPanel.dragging ? 'select-none shadow-2xl' : ''}`}
        >
          <div>
            <div className="label flex items-center gap-1">
              <Layers size={12} /> Mapa base
              <span className="ml-auto -mr-1 -mt-1 normal-case">
                <PanelLock panel={layersPanel} />
              </span>
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
          <div ref={elementsRef}>
            <button
              type="button"
              onClick={() => {
                // Se a caixa foi arrastada para a parte de baixo da tela, a lista abre para cima.
                const r = layersPanel.boxRef.current?.getBoundingClientRect();
                setElementsUp(!!r && r.top > window.innerHeight / 2);
                setElementsOpen((o) => !o);
              }}
              className="label !mb-0 w-full flex items-center justify-between cursor-pointer hover:text-slate-200"
              title={elementsOpen ? 'Recolher elementos' : 'Mostrar elementos'}
              aria-expanded={elementsOpen}
            >
              <span>Elementos</span>
              <ChevronDown size={14} className={`transition-transform ${elementsOpen ? 'rotate-180' : ''}`} />
            </button>
            {elementsOpen && (
              <div data-no-drag className={`panel absolute right-0 ${elementsUp ? 'bottom-full mb-1.5' : 'top-full mt-1.5'} w-48 p-3 max-h-[70vh] overflow-y-auto cursor-auto`}>
                {NODE_TYPE_LIST.map((t) => (
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
                <Toggle label="Dutos" color={DUCT_COLOR} on={visible.ducts ?? true} onChange={(v) => setVisible({ ...visible, ducts: v })} />
                <Toggle label="Áreas" color="#a855f7" on={visible.areas ?? true} onChange={(v) => setVisible({ ...visible, areas: v })} />
                <Toggle label="Enlaces wireless" color="#f43f5e" on={visible.wireless ?? true} onChange={(v) => setVisible({ ...visible, wireless: v })} />
                <Toggle label="Rótulos" on={labels} onChange={setLabels} />
                {!readOnly && <Toggle label="Confirmar ao mover" on={confirmMoves} onChange={setConfirmMoves} />}
              </div>
            )}
          </div>
        </div>

        {tool === 'launch' && !readOnly && (
          <LaunchPanel
            projectId={projectId}
            nodes={nodes}
            cables={cables}
            ducts={ducts}
            center={() => {
              const c = mapRef.current?.getCenter();
              return c ? [c.lat, c.lng] : null;
            }}
            pick={launchPick}
            onPreview={setLaunchPreview}
            onFocus={(p) => mapRef.current?.setView(p, Math.max(mapRef.current.getZoom(), 17))}
            onFit={(path) => mapRef.current?.fitBounds(L.latLngBounds(path), { paddingTopLeft: [340, 60], paddingBottomRight: [40, 60], maxZoom: 18 })}
            onError={(m) => notify(m, 'error')}
            onDone={(cable, created, usedDucts) => {
              setNodes((list) => [...list, ...created]);
              setCables((list) => [...list, cable]);
              mergeDucts(usedDucts);
              setTool('select');
              setSelection({ kind: 'cable', id: cable.id });
              const r = cable.slacks?.length ?? 0;
              notify(`Cabo lançado${created.length ? ` com ${created.length} poste${created.length > 1 ? 's' : ''} novo${created.length > 1 ? 's' : ''}` : ''}${r ? ` e ${r} reserva${r > 1 ? 's' : ''} técnica${r > 1 ? 's' : ''}` : ''}${usedDucts.length ? `, por dentro de ${usedDucts.map((d) => d.name).join(', ')}` : ''}.`);
            }}
            onClose={() => setTool('select')}
          />
        )}

        {tool === 'bulkfix' && !readOnly && (
          <BulkFixPanel
            projectId={projectId}
            nodes={nodes}
            cables={cables}
            view={mapBounds}
            onPreview={setBulkPreview}
            onFocus={(lines) => {
              const pts = lines.flat();
              if (pts.length) mapRef.current?.fitBounds(L.latLngBounds(pts), { paddingTopLeft: [340, 60], paddingBottomRight: [40, 60], maxZoom: 19 });
            }}
            onApplied={(changed, changedCables, message) => {
              mergeNodes(changed);
              mergeCables(changedCables);
              notify(message);
            }}
            onError={(m) => notify(m, 'error')}
            onClose={() => setTool('select')}
          />
        )}

        {tool === 'merge' && !readOnly && (
          <MergePanel
            projectId={projectId}
            selection={mergeSel}
            cables={cables}
            ducts={ducts}
            onKind={(kind) => setMergeSel((m) => (m.kind === kind ? m : { kind, ids: [] }))}
            onRemove={(id) => setMergeSel((m) => ({ ...m, ids: m.ids.filter((x) => x !== id) }))}
            onClear={() => setMergeSel((m) => ({ ...m, ids: [] }))}
            onMerged={(r) => {
              const gone = new Set(r.removed);
              if (r.kind === 'cable') {
                setCables((list) => list.filter((c) => !gone.has(c.id)));
                mergeCables(r.cables ?? []);
                mergeNodes(r.nodes ?? []);
                mergeDucts(r.ducts ?? []);
              } else {
                setDucts((list) => list.filter((d) => !gone.has(d.id)));
                mergeDucts(r.ducts ?? []);
              }
              setMergeSel((m) => ({ ...m, ids: [] }));
              setTool('select');
              const first = r.kind === 'cable' ? r.cables?.[0] : r.ducts?.[0];
              if (first) setSelection({ kind: r.kind, id: first.id });
              notify(r.message);
            }}
            onError={(m) => notify(m, 'error')}
            onClose={() => setTool('select')}
          />
        )}

        {tool === 'otdr' && network && (
          <OtdrPanel
            key={otdrPick?.t ?? 0}
            network={network}
            pick={otdrPick}
            onLaser={setLaser}
            onReport={(trace, distance) => setOtdr({ trace, distance })}
            onFocus={(at) => mapRef.current?.setView(at, Math.max(mapRef.current.getZoom(), 18))}
            onClose={() => {
              setTool('select');
              setOtdrPick(null);
            }}
          />
        )}

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

        {selectedDuct && tool !== 'viability' && (
          <DuctPanel
            key={`${selectedDuct.id}-${selectedDuct.name}`}
            duct={selectedDuct}
            cables={cables}
            nodes={nodes}
            readOnly={readOnly}
            onClose={() => setSelection(null)}
            onSaved={(d, message) => {
              mergeDucts([d]);
              if (message) notify(message);
            }}
            onDeleted={() => {
              setDucts((list) => list.filter((x) => x.id !== selectedDuct.id));
              setSelection(null);
              notify('Duto excluído');
            }}
            onSelectCable={(c) => setSelection({ kind: 'cable', id: c.id })}
            onSelectNode={(n) => focusNode(n)}
            onHistory={() => setHistory({ title: selectedDuct.name, filter: { type: 'duct', subject_id: selectedDuct.id } })}
            onError={(m) => notify(m, 'error')}
          />
        )}

        {(selectedNode || selectedCable) && tool !== 'viability' && (
          <Inspector
            readOnly={readOnly || nodeLocked(selectedNode)}
            projectId={projectId}
            canEditProject={!readOnly}
            onShared={(ns) => {
              mergeNodes(ns);
              notify(ns.length > 1 ? `Compartilhado (com ${ns.length - 1} objeto(s) fixado(s))` : 'Objeto compartilhado');
            }}
            onUnshared={(n, cs) => {
              mergeNodes([n]);
              mergeCables(cs);
              notify('Objeto tirado do projeto');
            }}
            cables={cables}
            onHistory={(kind, id, name) =>
              setHistory({
                title: name,
                filter: { type: kind, subject_id: id },
              })
            }
            onOtdr={(n) => {
              // Do cliente, o OTDR dispara pelo cabo drop no sentido da OLT.
              const drop = cables.find((c) => c.from_node_id === n.id || c.to_node_id === n.id);
              setTool('otdr');
              setSelection(null);
              if (drop) setOtdrPick({ cableId: drop.id, nodeId: n.id, options: [drop.id], fiber: (n.attributes?.fiber as number | undefined) ?? 1, t: Date.now() });
              else setOtdrPick(null);
            }}
            key={`${selection?.kind}${selection?.id}-${selectedCable?.name ?? ''}`}
            focusKey={editorFocus}
            onLocate={(at) => mapRef.current?.setView(at, Math.max(mapRef.current.getZoom(), 18))}
            node={selectedNode}
            cable={selectedCable}
            cableDucts={selectedCable ? ductsOfCable(selectedCable, ducts) : undefined}
            onSelectDuct={(id) => setSelection({ kind: 'duct', id })}
            nodes={nodes}
            onSelectNode={(n) => focusNode(n)}
            onAddInBox={(box, type) => addNode(type, [box.lat, box.lng], box)}
            onOpenHost={(h) => setHostEditorId(h.id)}
            budget={selectedNode?.type === 'client' ? clientPower.get(selectedNode.id) : undefined}
            signal={selectedNode?.type === 'client' ? clientSignal.get(selectedNode.id) : undefined}
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
            onDeleted={(kind, deletedId, touched, touchedCables) => {
              applyDeleted(kind, deletedId, touched ?? [], touchedCables ?? []);
              notify('Excluído');
            }}
            onOpenDiagram={(n) => setDiagramNodeId(n.id)}
            group={selectedNode ? { active: grouped.counts.has(groupKey(selectedNode)), count: grouped.counts.get(groupKey(selectedNode)) ?? 0 } : undefined}
            onToggleGroup={toggleGroup}
            onShowBudget={(n) =>
              setBudget({
                title: n.name,
                result: clientPower.get(n.id)!,
              })
            }
            onConnectClient={connectClient}
            onSlacksChange={(c, list) => saveSlacks(c, list, 'Reservas atualizadas')}
            onPlaceSlack={(c) => {
              setTool('slack');
              setSlackCableId(c.id);
            }}
            onError={(m) => notify(m, 'error')}
          />
        )}
      </div>

      {hostEditorNode && (
        <HostEditor
          host={hostEditorNode}
          nodes={nodes}
          cables={cables}
          readOnly={readOnly}
          covered={!!diagramNode}
          onClose={() => setHostEditorId(null)}
          onAdd={(t) => addNode(t, [hostEditorNode.lat, hostEditorNode.lng], hostEditorNode)}
          onAnchor={(n, on, attach) => setAnchored(n, on, attach)}
          onOpen={(n) => {
            if (n.type === 'camera') {
              // Câmera: painel de propriedades no mapa (o editor do poste fecha).
              setHostEditorId(null);
              setSelection({ kind: 'node', id: n.id });
              setEditorFocus(Date.now());
            } else setDiagramNodeId(n.id);
          }}
          onOpenDiagram={(h) => setDiagramNodeId(h.id)}
          onEditHost={(h) => {
            setHostEditorId(null);
            setSelection({ kind: 'node', id: h.id });
            setEditorFocus(Date.now());
          }}
          onSlacksChange={(c, list, message) => saveSlacks(c, list, message)}
          onSangria={readOnly ? undefined : (option, target) => sangriaAtHost(hostEditorNode, option, target)}
          onEditCable={(c) => {
            // Cabo/drop: painel de propriedades no mapa (o editor do poste fecha).
            setHostEditorId(null);
            setSelection({ kind: 'cable', id: c.id });
            setEditorFocus(Date.now());
          }}
        />
      )}
      {diagramNode && RACK_HOST_TYPES.includes(diagramNode.type) && (
        <PopEditor
          node={diagramNode}
          network={network}
          readOnly={readOnly}
          onClose={() => setDiagramNodeId(null)}
          onSaved={(n) => {
            mergeNodes([n]);
            notify(`${NODE_TYPES[n.type].label} salvo`);
          }}
          onShowBudget={(title, result) => setBudget({ title, result })}
        />
      )}
      {diagramNode && !RACK_HOST_TYPES.includes(diagramNode.type) && (
        <DiagramEditor
          node={diagramNode}
          network={network}
          readOnly={readOnly}
          onClose={() => setDiagramNodeId(null)}
          onSaved={(n, clients) => {
            mergeNodes([n, ...(clients ?? [])]);
            notify('Diagrama salvo');
          }}
          onShowBudget={(title, result) => setBudget({ title, result })}
          onDeleteCable={readOnly ? undefined : (c) => deleteCable(c, true)}
          onNodeSaved={(n) => {
            mergeNodes([n]);
            notify('Cliente salvo');
          }}
          onCableSaved={
            readOnly
              ? undefined
              : (c, ns) => {
                  mergeCables([c]);
                  mergeNodes(ns);
                  notify('Cabo salvo');
                }
          }
        />
      )}
      {budget && <BudgetModal title={budget.title} result={budget.result} settings={settings} onClose={() => setBudget(null)} />}
      {modal === 'settings' && (
        <SettingsModal
          project={project}
          settings={settings}
          canManage={canManage}
          engine={engine}
          preferredEngine={preferredEngine}
          googleKey={googleKey}
          isOwner={role === 'owner'}
          onGoogleKey={(k) => {
            setGoogleKey(k);
            if (k.key) setEngine('google');
          }}
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
      {report && <ReportModal network={network} ducts={ducts} projectName={project.name} title={report.title} polygon={report.polygon} onClose={() => setReport(null)} />}
      {otdr && (
        <OtdrModal
          trace={otdr.trace}
          distance={otdr.distance}
          projectName={project.name}
          onClose={() => setOtdr(null)}
          onLaser={() => setOtdr(null)}
        />
      )}
      {/* Com uma janela aberta por cima do mapa, o aviso fica fixo no topo para não ficar escondido. */}
      {toast && overlayOpen && <Toast message={toast.message} kind={toast.kind} onClose={() => setToast(null)} />}
    </div>
  );
}

/** Mapa base do motor e estilo escolhidos (com sessão do Google quando necessário). */
function BaseTiles({
  engine,
  mapStyle,
  googleKey,
  onError,
}: {
  engine: MapEngine;
  mapStyle: MapStyle;
  googleKey: string | null;
  onError: (message: string) => void;
}) {
  const layer = LAYERS[engine][mapStyle];
  const [url, setUrl] = useState(layer.google ? '' : layer.url);
  useEffect(() => {
    if (!layer.google) {
      setUrl(layer.url);
      return;
    }
    let alive = true;
    setUrl('');
    googleTileUrl(layer, googleKey ?? '')
      .then((u) => alive && setUrl(u))
      .catch((e: Error) => alive && onError(e.message));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, mapStyle, googleKey]);
  if (!url) return null;
  return (
    <>
      <TileLayer key={url} url={url} attribution={layer.attribution} maxZoom={21} maxNativeZoom={layer.maxNativeZoom} {...TILE_OPTIONS} />
      {layer.google && <GoogleAttribution tileUrl={url} fallback={layer.attribution} />}
    </>
  );
}

/** Mantém no canto do mapa a atribuição que o Google exige para a área visível (logo + copyright). */
function GoogleAttribution({ tileUrl, fallback }: { tileUrl: string; fallback: string }) {
  const map = useMap();
  useEffect(() => {
    const ctl = map.attributionControl;
    let current = fallback;
    let timer = 0;
    let alive = true;
    const update = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(async () => {
        const b = map.getBounds();
        const text = await googleViewportCopyright(tileUrl, map.getZoom(), {
          north: b.getNorth(),
          south: b.getSouth(),
          east: b.getEast(),
          west: b.getWest(),
        });
        if (!alive || !text) return;
        const next = `<b style="font-family:Arial,sans-serif">Google</b> · ${text.replace(/</g, '&lt;')}`;
        if (next === current) return;
        ctl?.removeAttribution(current);
        ctl?.addAttribution(next);
        current = next;
      }, 400);
    };
    // a camada já põe a atribuição estática; a da área visível entra no lugar dela
    update();
    map.on('moveend', update);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      map.off('moveend', update);
      if (current !== fallback) ctl?.removeAttribution(current);
    };
  }, [map, tileUrl, fallback]);
  return null;
}

/**
 * Barra "Mover ... ? Confirmar / Cancelar" logo abaixo do objeto arrastado, centralizada nele.
 * Acompanha o mapa ao arrastar/dar zoom e não sai da área visível.
 */
function MoveConfirm({ at, onConfirm, onCancel, children, confirmLabel = 'Confirmar', danger }: { at: LatLng; onConfirm: () => void; onCancel: () => void; children: React.ReactNode; confirmLabel?: string; danger?: boolean }) {
  const map = useMap();
  const ref = useRef<HTMLDivElement | null>(null);
  const [, setTick] = useState(0);
  // 1º desenho mede a largura da barra; o 2º já centraliza.
  useLayoutEffect(() => setTick((t) => t + 1), []);
  useEffect(() => {
    const redraw = () => setTick((t) => t + 1);
    map.on('move zoom resize', redraw);
    return () => {
      map.off('move zoom resize', redraw);
    };
  }, [map]);
  useEffect(() => {
    // Cliques e rolagem na barra não chegam ao mapa.
    if (!ref.current) return;
    L.DomEvent.disableClickPropagation(ref.current);
    L.DomEvent.disableScrollPropagation(ref.current);
  }, []);
  const p = map.latLngToContainerPoint(at);
  const size = map.getSize();
  const w = ref.current?.offsetWidth ?? 0;
  const h = ref.current?.offsetHeight ?? 36;
  const pad = 8;
  // 26 px abaixo do centro do ícone; se não couber embaixo, vai para cima.
  let top = p.y + 26;
  if (top + h > size.y - pad) top = p.y - 26 - h;
  top = Math.max(pad, Math.min(size.y - h - pad, top));
  let left = p.x - w / 2;
  left = Math.max(pad, Math.min(size.x - w - pad, left));
  return (
    <div
      ref={ref}
      className={`panel absolute z-[1000] px-3 py-1.5 text-xs text-slate-200 flex items-center gap-2 shadow-lg ${danger ? '!border-red-500 w-max max-w-[min(380px,calc(100%-16px))]' : '!border-yellow-500 whitespace-nowrap'}`}
      style={{ left, top, visibility: w ? 'visible' : 'hidden' }}
    >
      <span>{children}</span>
      <button className={`${danger ? 'btn-danger' : 'btn-primary'} !py-1 text-xs shrink-0`} onClick={onConfirm} title="Enter">
        {confirmLabel}
      </button>
      <button className="btn-ghost !py-1 text-xs shrink-0" onClick={onCancel} title="Esc">
        Cancelar
      </button>
    </div>
  );
}

function MapEvents({
  onClick,
  onMove,
  onZoom,
  onContextMenu,
  onMoveStart,
}: {
  onClick: (at: LatLng) => void;
  onMove: (at: LatLng) => void;
  onZoom: (z: number) => void;
  onContextMenu: () => void;
  onMoveStart: () => void;
}) {
  const map = useMapEvents({
    click: (e) => onClick([e.latlng.lat, e.latlng.lng]),
    contextmenu: () => onContextMenu(),
    movestart: () => onMoveStart(),
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

function MenuItem({
  icon,
  label,
  onClick,
  danger,
  disabled,
  title,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-[13px] cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 ${
        danger ? 'text-red-400 hover:bg-red-950/40' : 'text-slate-200 hover:bg-slate-800'
      }`}
    >
      {icon} {label}
    </button>
  );
}
