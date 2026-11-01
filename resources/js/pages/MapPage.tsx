import {
  Activity,
  Cable as CableIcon,
  ChevronLeft,
  Download,
  Hexagon,
  Home,
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
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import { Link, useParams } from 'react-router-dom';
import L from 'leaflet';
import { api, errorMessage } from '../lib/api';
import { POWER_COLORS, clientBudget, powerLevel, type BudgetResult } from '../lib/budget';
import { CABLE_CATEGORIES, CABLE_MODELS, NODE_TYPES } from '../lib/catalog';
import { distance, pathLength } from '../lib/geo';
import type { Cable, CableCategory, LatLng, NetNode, NodeType, Project, Settings } from '../lib/types';
import { nodeIcon } from '../components/markers';
import { Logo, Toast, formatLength } from '../components/ui';
import Inspector from '../components/Inspector';
import DiagramEditor from '../components/DiagramEditor';
import BudgetModal from '../components/BudgetModal';
import SettingsModal from '../components/SettingsModal';
import NetworkAnalysis from '../components/NetworkAnalysis';

type Tool = 'select' | NodeType | 'cable' | 'ruler';

const TOOLS: { id: Tool; label: string; icon: React.ReactNode }[] = [
  { id: 'select', label: 'Selecionar', icon: <MousePointer2 size={18} /> },
  { id: 'cto', label: 'CTO', icon: <SquareStack size={18} /> },
  { id: 'ceo', label: 'CEO', icon: <Hexagon size={18} /> },
  { id: 'pop', label: 'POP', icon: <Server size={18} /> },
  { id: 'pole', label: 'Poste', icon: <Zap size={18} /> },
  { id: 'client', label: 'Cliente', icon: <User size={18} /> },
  { id: 'cable', label: 'Cabo', icon: <CableIcon size={18} /> },
  { id: 'ruler', label: 'Régua', icon: <Ruler size={18} /> },
];

const BASE_LAYERS = {
  satellite: {
    label: 'Satélite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Imagens &copy; Esri',
  },
  streets: {
    label: 'Ruas',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap',
  },
  dark: {
    label: 'Escuro',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap &copy; CARTO',
  },
};

export type Selection = { kind: 'node'; id: number } | { kind: 'cable'; id: number } | null;

export default function MapPage() {
  const { id } = useParams();
  const projectId = Number(id);
  const [project, setProject] = useState<Project | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [nodes, setNodes] = useState<NetNode[]>([]);
  const [cables, setCables] = useState<Cable[]>([]);
  const [tool, setTool] = useState<Tool>('select');
  const [selection, setSelection] = useState<Selection>(null);
  const [draft, setDraft] = useState<{ path: LatLng[]; from: number | null } | null>(null);
  const [ruler, setRuler] = useState<LatLng[]>([]);
  const [cursor, setCursor] = useState<LatLng | null>(null);
  const [base, setBase] = useState<keyof typeof BASE_LAYERS>('satellite');
  const [visible, setVisible] = useState<Record<string, boolean>>({ cto: true, ceo: true, pop: true, pole: true, client: true, backbone: true, distribution: true, drop: true });
  const [labels, setLabels] = useState(true);
  const [zoom, setZoom] = useState(16);
  const [diagramNodeId, setDiagramNodeId] = useState<number | null>(null);
  const [budget, setBudget] = useState<{ title: string; result: BudgetResult } | null>(null);
  const [modal, setModal] = useState<'settings' | 'analysis' | null>(null);
  const [toast, setToast] = useState<{ message: string; kind?: 'ok' | 'error' } | null>(null);
  const [search, setSearch] = useState('');
  const mapRef = useRef<L.Map | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () =>
    api.project(projectId).then((d) => {
      setProject(d.project);
      setSettings(d.settings);
      setNodes(d.nodes);
      setCables(d.cables);
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
      if (e.key === 'Escape') {
        setDraft(null);
        setRuler([]);
        setTool('select');
      }
      if (e.key === 'Enter' && draft) finishCable();
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

  const mergeCables = (updated: Cable[]) =>
    setCables((list) => list.map((c) => updated.find((u) => u.id === c.id) ?? c));
  const mergeNodes = (updated: NetNode[]) =>
    setNodes((list) => list.map((n) => updated.find((u) => u.id === n.id) ?? n));

  async function addNode(type: NodeType, at: LatLng) {
    try {
      const node = await api.createNode(projectId, { type, lat: at[0], lng: at[1] });
      setNodes((list) => [...list, node]);
      setSelection({ kind: 'node', id: node.id });
      notify(`${NODE_TYPES[type].label} adicionado`);
    } catch (e) {
      notify(errorMessage(e), 'error');
    }
  }

  async function moveNode(node: NetNode, at: LatLng) {
    setNodes((list) => list.map((n) => (n.id === node.id ? { ...n, lat: at[0], lng: at[1] } : n)));
    const r = await api.updateNode(node.id, { lat: at[0], lng: at[1] });
    mergeCables(r.cables);
  }

  function nodeClicked(node: NetNode) {
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
  const diagramNode = nodes.find((n) => n.id === diagramNodeId);

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return [
      ...nodes.filter((n) => n.name.toLowerCase().includes(q)).map((n) => ({ kind: 'node' as const, id: n.id, label: n.name, sub: NODE_TYPES[n.type].label, at: [n.lat, n.lng] as LatLng })),
      ...cables.filter((c) => c.name.toLowerCase().includes(q)).map((c) => ({ kind: 'cable' as const, id: c.id, label: c.name, sub: 'Cabo', at: c.path[0] })),
    ].slice(0, 8);
  }, [search, nodes, cables]);

  if (!project || !settings || !network) {
    return <div className="h-full flex items-center justify-center text-slate-400">Carregando projeto...</div>;
  }

  const deployed = nodes.filter((n) => n.status === 'deployed' || n.status === 'certified').length;
  const pct = nodes.length ? Math.round((deployed / nodes.length) * 100) : 0;
  const hint =
    tool === 'cable'
      ? draft
        ? 'Clique para adicionar pontos. Clique numa caixa ou pressione Enter para finalizar. Esc cancela.'
        : 'Clique numa caixa (ou no mapa) para iniciar o cabo.'
      : tool === 'ruler'
        ? `Régua: ${formatLength(pathLength(ruler))} · clique para medir, Esc limpa.`
        : tool !== 'select'
          ? `Clique no mapa para adicionar ${NODE_TYPES[tool].label}.`
          : 'Clique num elemento para editar. Arraste caixas para mover.';

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
          <div className="text-xs text-slate-400 mt-1">{pct}% implantado</div>
        </div>
        <div className="p-3 relative">
          <Search size={14} className="absolute left-5 top-5.5 text-slate-500" />
          <input className="input pl-8 py-1.5" placeholder="Buscar CTO, POP ou cabo" value={search} onChange={(e) => setSearch(e.target.value)} />
          {searchResults.length > 0 && (
            <ul className="absolute left-3 right-3 z-[1100] mt-1 rounded-md border border-slate-700 bg-slate-900 text-sm shadow-xl">
              {searchResults.map((r) => (
                <li key={`${r.kind}${r.id}`}>
                  <button
                    className="w-full text-left px-3 py-1.5 hover:bg-slate-800 cursor-pointer"
                    onClick={() => {
                      mapRef.current?.setView(r.at, 18);
                      setSelection({ kind: r.kind, id: r.id });
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
          <SideButton icon={<Activity size={16} />} label="Análise de rede" onClick={() => setModal('analysis')} />
          <SideButton icon={<Upload size={16} />} label="Importar KMZ/KML" onClick={() => fileRef.current?.click()} />
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
          <TileLayer key={base} url={BASE_LAYERS[base].url} attribution={BASE_LAYERS[base].attribution} maxZoom={21} maxNativeZoom={19} />
          <MapEvents
            onClick={(at) => {
              if (tool === 'select') setSelection(null);
              else if (tool === 'cable') setDraft((d) => (d ? { ...d, path: [...d.path, at] } : { path: [at], from: null }));
              else if (tool === 'ruler') setRuler((r) => [...r, at]);
              else addNode(tool, at);
            }}
            onMove={setCursor}
            onZoom={setZoom}
          />

          {cables
            .filter((c) => visible[c.category])
            .map((c) => (
              <Polyline
                key={`${c.id}-${c.path.length}-${c.path[0].join()}-${c.path[c.path.length - 1].join()}`}
                positions={c.path}
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
                    setSelection({ kind: 'cable', id: c.id });
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
                  position={[n.lat, n.lng]}
                  icon={nodeIcon(n, {
                    selected: selection?.kind === 'node' && selection.id === n.id,
                    fill: level ? POWER_COLORS[level] : undefined,
                  })}
                  draggable={tool === 'select'}
                  eventHandlers={{
                    click: (e) => {
                      L.DomEvent.stopPropagation(e);
                      nodeClicked(n);
                    },
                    dblclick: () => {
                      if (['cto', 'ceo', 'pop'].includes(n.type)) setDiagramNodeId(n.id);
                    },
                    dragend: (e) => {
                      const ll = (e.target as L.Marker).getLatLng();
                      moveNode(n, [ll.lat, ll.lng]);
                    },
                  }}
                >
                  {labels && (zoom >= 17 || n.type === 'pop') && n.type !== 'pole' && (
                    <Tooltip permanent direction="bottom" offset={[0, 10]} className="!bg-slate-900/80 !text-white !border-0 !shadow-none !text-[11px] !px-1.5 !py-0">
                      {n.name}
                    </Tooltip>
                  )}
                </Marker>
              );
            })}

          {draft && (
            <Polyline positions={cursor ? [...draft.path, cursor] : draft.path} pathOptions={{ color: '#facc15', weight: 3, dashArray: '6 6' }} />
          )}
          {ruler.length > 0 && (
            <Polyline positions={cursor && tool === 'ruler' ? [...ruler, cursor] : ruler} pathOptions={{ color: '#f472b6', weight: 3 }} />
          )}
        </MapContainer>

        {/* Barra de ferramentas */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] panel flex p-1 gap-0.5">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setTool(t.id);
                setDraft(null);
                if (t.id !== 'ruler') setRuler([]);
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

        {/* Dica e ações do desenho */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2">
          <div className="panel px-3 py-1.5 text-xs text-slate-300">{hint}</div>
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
              {(Object.keys(BASE_LAYERS) as (keyof typeof BASE_LAYERS)[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setBase(k)}
                  className={`flex-1 rounded px-1 py-1 text-xs cursor-pointer ${base === k ? 'bg-emerald-600' : 'bg-slate-800 hover:bg-slate-700'}`}
                >
                  {BASE_LAYERS[k].label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="label">Elementos</div>
            {(['pop', 'ceo', 'cto', 'pole', 'client'] as NodeType[]).map((t) => (
              <Toggle key={t} label={NODE_TYPES[t].plural} color={NODE_TYPES[t].color} on={visible[t]} onChange={(v) => setVisible({ ...visible, [t]: v })} />
            ))}
            {(Object.keys(CABLE_CATEGORIES) as CableCategory[]).map((c) => (
              <Toggle key={c} label={`Cabos ${CABLE_CATEGORIES[c].label.toLowerCase()}`} color={CABLE_CATEGORIES[c].color} on={visible[c]} onChange={(v) => setVisible({ ...visible, [c]: v })} />
            ))}
            <Toggle label="Rótulos" on={labels} onChange={setLabels} />
          </div>
        </div>

        {(selectedNode || selectedCable) && (
          <Inspector
            key={`${selection?.kind}${selection?.id}`}
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
            onShowBudget={(n) => setBudget({ title: n.name, result: clientPower.get(n.id)! })}
            onConnectClient={connectClient}
            onError={(m) => notify(m, 'error')}
          />
        )}
      </div>

      {diagramNode && (
        <DiagramEditor
          node={diagramNode}
          network={network}
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
      {toast && <Toast message={toast.message} kind={toast.kind} onClose={() => setToast(null)} />}
    </div>
  );
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
