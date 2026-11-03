import {
  Box,
  Cable as CableIcon,
  Flashlight,
  Grid3x3,
  GripHorizontal,
  Link2,
  Maximize,
  Network as NetIcon,
  Pencil,
  Plug,
  Save,
  Search,
  Server,
  Spline,
  Trash2,
  Undo2,
  Workflow,
  X,
  ZoomIn,
  ZoomOut,
  Zap,
  LayoutGrid,
  ImageDown,
  PackagePlus,
  Rows4,
  BookOpen,
  ChevronsUpDown,
  Minimize2,
  MoveVertical,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, errorMessage } from '../../lib/api';
import { traceUpstream, type BudgetResult } from '../../lib/budget';
import { CABLE_CATEGORIES, NODE_TYPES, RACK_MOUNTS, STATUSES, fiberColor } from '../../lib/catalog';
import {
  autoFuseDio,
  autoPatch,
  endKey,
  fusionSource,
  isPatchEnd,
  linkedCables,
  oltPortLabel,
  partner,
  pruneConnections,
  rackCode,
  activeCapacity,
  activePortLabel,
  lagOf,
  mgmtLabel,
  portGroupOf,
  speedLabel,
  rackConflicts,
  duplicateRackCodes,
  searchRacks,
  rackHeight,
  rackItems,
  rackUsed,
  firstFreeU,
  defaultRackHeight,
  sameEnd,
  trays,
  uid,
  unmount,
  vflTrace,
  type Rack,
  type Rackable,
} from '../../lib/pop';
import type { Cable, Diagram, DiagramComponent, End, NetNode, Network, Status } from '../../lib/types';
import { ActiveDialog, DioDialog, LinkDialog, MountDialog, OltDialog, RackDialog, useCableItems } from './dialogs';
import FusionMatrix from './FusionMatrix';
import { G, RACK, anySize, cardPorts, cardSize, labelW, portBox, rackSize, rackStrip, rackUTop, rowLabels, textOn, type PopComp } from './geometry';
import EquipmentCatalog, { useEquipmentModels } from './EquipmentCatalog';
import { LAG_COLORS } from './ActiveFields';
import { lagKey, mgmtPath, vlanSummary } from '../../lib/netcfg';
import ManobraView from './ManobraView';

type Olt = Extract<DiagramComponent, { kind: 'olt' }>;
type Dio = Extract<DiagramComponent, { kind: 'dio' }>;
type Active = Extract<DiagramComponent, { kind: 'active' }>;

type Dialog =
  | { t: 'olt'; edit?: Olt }
  | { t: 'dio'; edit?: Dio }
  | { t: 'active'; edit?: Active }
  | { t: 'rack'; edit?: Rack }
  | { t: 'mount'; rack: string; item?: string; u?: number }
  | { t: 'catalog'; kind?: 'olt' | 'dio' | 'active'; back?: Dialog }
  | { t: 'linkDio'; dio: string }
  | { t: 'linkCable'; cable: string }
  | null;

interface Props {
  node: NetNode;
  network: Network;
  onClose: () => void;
  onSaved: (n: NetNode) => void;
  onShowBudget: (title: string, result: BudgetResult) => void;
  readOnly?: boolean;
}

const isPopComp = (c: DiagramComponent): c is PopComp => c.kind === 'olt' || c.kind === 'dio' || c.kind === 'active';
const isRack = (c: DiagramComponent): c is Rack => c.kind === 'rack';
/** Quantos equipamentos do rack podem ficar expandidos ao mesmo tempo. */
const MAX_EXPANDED = 10;

/** Cor de cada tipo de equipamento (portas com cordão e blocos dentro do rack). */
const KIND_COLOR: Record<Rackable['kind'], string> = { dio: '#0ea5e9', olt: '#8b5cf6', active: '#10b981' };

const PORT_FILL: Record<string, string> = { dio: '#3b82f6', olt: '#8b5cf6', up: '#f59e0b', active: '#10b981' };
const VFL = '#ef4444';

/** Organiza os cards na primeira abertura: cabos à esquerda, DIOs no meio, OLTs e ativos à direita. */
function autoLayout(d: Diagram, cables: Cable[]): Diagram {
  const next: Diagram = { ...d, cablePos: { ...d.cablePos }, popLayout: true };
  cables.forEach((c, i) => {
    next.cablePos[`c${c.id}`] = { x: 0, y: i * (G.CABLE_H + 28) };
  });
  const comps = d.components.filter(isPopComp);
  const dios = comps.filter((c) => c.kind === 'dio');
  const dioW = Math.max(0, ...dios.map((c) => cardSize(c).w));
  let y = 0;
  const pos = new Map<string, { x: number; y: number }>();
  dios.forEach((c) => {
    pos.set(c.id, { x: G.CABLE_W + 90, y });
    y += cardSize(c).h + 30;
  });
  y = 0;
  comps
    .filter((c) => c.kind !== 'dio')
    .forEach((c) => {
      pos.set(c.id, { x: G.CABLE_W + 90 + (dios.length ? dioW + 90 : 0), y });
      y += cardSize(c).h + 30;
    });
  const right = Math.max(G.CABLE_W, ...comps.map((c) => (pos.get(c.id)?.x ?? c.x) + cardSize(c).w));
  let rx = right + 90;
  d.components.filter(isRack).forEach((r) => {
    pos.set(r.id, { x: rx, y: 0 });
    rx += rackSize(r).w + 40;
  });
  next.components = d.components.map((c) => (pos.has(c.id) ? { ...c, ...pos.get(c.id)! } : c));
  return next;
}

export default function PopEditor({ node, network, onClose, onSaved, onShowBudget, readOnly }: Props) {
  const cables = useMemo(() => network.cables.filter((c) => c.from_node_id === node.id || c.to_node_id === node.id), [network.cables, node.id]);
  const cableMap = useMemo(() => new Map(cables.map((c) => [`c${c.id}`, c])), [cables]);
  const nodeName = (id: number | null) => network.nodes.find((n) => n.id === id)?.name ?? 'ponta solta';
  const cableItems = useCableItems(cables, node.id, nodeName);

  const [diagram, setDiagram] = useState<Diagram>(() => {
    const d = structuredClone(node.diagram ?? { components: [], cablePos: {}, connections: [] });
    return d.popLayout ? d : autoLayout(d, cables);
  });
  const [status, setStatus] = useState<Status>(node.status);
  const [dirty, setDirty] = useState(false);
  const [view, setView] = useState({ x: 40, y: 40, k: 1 });
  /** O mesmo editor serve ao POP e ao Datacenter; só muda o nome mostrado. */
  const place = NODE_TYPES[node.type].label;
  const editorTitle = node.type === 'dc' ? 'Editor do Datacenter' : node.type === 'tower' ? 'Editor da Torre (shelter)' : 'Editor de POP';
  const [mode, setMode] = useState<'canvas' | 'manobra'>('canvas');
  const [manobraFocus, setManobraFocus] = useState<string | null>(null);
  const [vfl, setVfl] = useState(false);
  const [vflStart, setVflStart] = useState<End | null>(null);
  const [showCords, setShowCords] = useState(false);
  const [pending, setPending] = useState<End | null>(null);
  const [selectedConn, setSelectedConn] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [matrixDio, setMatrixDio] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  /** Equipamentos instalados em rack que estão expandidos (até MAX_EXPANDED; os demais ficam recolhidos na faixa). */
  const [expanded, setExpanded] = useState<string[]>([]);
  const toggleExpanded = (id: string) =>
    setExpanded((list) => {
      if (list.includes(id)) return list.filter((x) => x !== id);
      if (list.length >= MAX_EXPANDED) {
        notify(`Dá para expandir até ${MAX_EXPANDED} equipamentos ao mesmo tempo. Recolha um antes.`, true);
        return list;
      }
      return [...list, id];
    });
  const catalog = useEquipmentModels(node.project_id);
  const history = useRef<Diagram[]>([]);
  const canvasRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ key?: string; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);
  const [panning, setPanning] = useState(false);

  const notify = (text: string, error = false) => setToast({ text, error });
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.error ? 5000 : 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const update = (fn: (d: Diagram) => Diagram) => {
    if (readOnly) return;
    history.current = [...history.current.slice(-49), diagram];
    setDiagram((d) => fn(structuredClone(d)));
    setDirty(true);
  };

  function undo() {
    const prev = history.current.pop();
    if (!prev) return;
    setDiagram(prev);
    setDirty(true);
    setPending(null);
    setSelectedConn(null);
  }

  // ---------- Dados derivados ----------
  const comps = diagram.components.filter(isPopComp);
  const compById = useMemo(() => new Map(diagram.components.map((c) => [c.id, c])), [diagram.components]);
  const dios = comps.filter((c): c is Dio => c.kind === 'dio');
  const olts = comps.filter((c): c is Olt => c.kind === 'olt');
  const racks = diagram.components.filter(isRack);
  const rackById = new Map(racks.map((r) => [r.id, r]));
  const conflicts = useMemo(() => rackConflicts(diagram), [diagram]);
  const dupCodes = useMemo(() => duplicateRackCodes(racks), [racks]);
  /** Busca de rack por código/nome: centraliza o rack achado e destaca por alguns segundos. */
  const [rackQuery, setRackQuery] = useState('');
  const [found, setFound] = useState<string | null>(null);
  useEffect(() => {
    if (!found) return;
    const t = setTimeout(() => setFound(null), 4000);
    return () => clearTimeout(t);
  }, [found]);
  function locateRack(q: string) {
    const hit = searchRacks(racks, q)[0];
    if (!hit) {
      notify(`Nenhum rack com "${q}".`, true);
      return;
    }
    const el = canvasRef.current;
    if (mode !== 'canvas') setMode('canvas');
    const { w, h } = rackSize(hit);
    const k = 0.8;
    const rw = el?.clientWidth ?? 1200;
    const rh = el?.clientHeight ?? 800;
    setView({ k, x: rw / 2 - (hit.x + w / 2) * k, y: h * k > rh - 40 ? 40 - hit.y * k : rh / 2 - (hit.y + h / 2) * k });
    setFound(hit.id);
  }
  /** Rack onde o equipamento está instalado (só quando a posição é válida o bastante para desenhar). */
  const mountedIn = (c: PopComp) => (c.rack && typeof c.u === 'number' ? rackById.get(c.rack) : undefined);
  /** Faixa do equipamento no rack, no sistema do canvas. */
  const stripOf = (c: PopComp) => {
    const r = mountedIn(c);
    return r ? rackStrip(r, c.u!, rackHeight(c)) : null;
  };
  /**
   * Onde o card do equipamento aparece: fora do rack, na posição dele; no rack, só quando expandido:
   * onde o usuário arrastou (ex/ey) ou, sem isso, ao lado direito do rack na altura da faixa. Recolhido = null.
   */
  const shownPos = (c: PopComp): { x: number; y: number } | null => {
    const r = mountedIn(c);
    if (!r) return { x: c.x, y: c.y };
    if (!expanded.includes(c.id)) return null;
    if (typeof c.ex === 'number' && typeof c.ey === 'number') return { x: c.ex, y: c.ey };
    const st = stripOf(c)!;
    const i = expanded.indexOf(c.id);
    return { x: r.x + rackSize(r).w + 60 + i * 30, y: Math.max(r.y, st.y - G.HEADER / 2) };
  };
  const shownComps = comps.flatMap((c) => {
    const p = shownPos(c);
    return p ? [{ ...c, ...p }] : [];
  });
  /** Cards do canvas (equipamentos visíveis e racks), para enquadrar e exportar. */
  const cards = [...shownComps, ...racks];
  const usedEnds = useMemo(() => new Map(diagram.connections.flatMap((c) => [[endKey(c.a), c] as const, [endKey(c.b), c] as const])), [diagram.connections]);

  const dioPorts = dios.reduce((a, d) => a + d.ports, 0);
  const dioPatched = dios.reduce((a, d) => a + Array.from({ length: d.ports }, (_, i) => usedEnds.has(`${d.id}:b${i + 1}`)).filter(Boolean).length, 0);
  const ponTotal = olts.reduce((a, o) => a + o.slots * o.ports, 0);
  const ponUsed = olts.reduce((a, o) => a + Array.from({ length: o.slots * o.ports }, (_, i) => usedEnds.has(`${o.id}:p${i + 1}`)).filter(Boolean).length, 0);

  const liveNetwork: Network = useMemo(
    () => ({ ...network, nodes: network.nodes.map((n) => (n.id === node.id ? { ...n, diagram } : n)) }),
    [network, node.id, diagram],
  );
  const dioPower = (dioId: string, n: number) => traceUpstream(liveNetwork, node.id, { c: dioId, p: `a${n}` });

  const cablePos = (key: string) => diagram.cablePos[key] ?? { x: 0, y: 0 };
  const portCenter = (e: End) => {
    const c = compById.get(e.c);
    if (!c || !isPopComp(c)) return null;
    const pos = shownPos(c);
    if (!pos) {
      // Recolhido no rack: o cordão chega na borda direita da faixa.
      const st = stripOf(c)!;
      return { x: st.x + st.w, y: st.y + st.h / 2 };
    }
    const p = c.kind === 'dio' ? `b${e.p.slice(1)}` : e.p;
    const b = portBox(c, p);
    return { x: pos.x + b.x + G.PORT / 2, y: pos.y + b.y + G.PORT / 2 };
  };

  const vflResult = useMemo(() => (vfl && vflStart ? vflTrace(diagram, vflStart) : null), [vfl, vflStart, diagram]);
  const lit = (e: End) => !!vflResult?.ends.has(endKey(e));

  function endLabel(e: End): string {
    const cable = cableMap.get(e.c);
    if (cable) return `${cable.name} · fibra ${e.p.slice(1)}`;
    const c = compById.get(e.c);
    if (!c) return endKey(e);
    switch (c.kind) {
      case 'dio':
        return `${c.name} · porta ${e.p.slice(1)}`;
      case 'olt':
        return `${c.name} · ${oltPortLabel(c, e.p)}`;
      case 'active':
        return `${c.name} · ${activePortLabel(c, e.p)}`;
      case 'splitter':
        return `Splitter · ${e.p === 'in' ? 'entrada' : `saída ${e.p.slice(1)}`}`;
      case 'rack':
      case 'client':
      case 'route':
        return c.name;
    }
  }

  // ---------- Pan, zoom e arraste ----------
  function startDrag(e: React.PointerEvent, key?: string) {
    if (e.button !== 0) return;
    e.stopPropagation();
    let ox = view.x;
    let oy = view.y;
    if (key) {
      if (readOnly) return;
      const c = compById.get(key);
      // Card expandido de equipamento no rack: arrasta a posição de expansão (ex/ey), não a do card solto.
      const p = c ? ((isPopComp(c) && mountedIn(c) && shownPos(c)) || { x: c.x, y: c.y }) : cablePos(key);
      ox = p.x;
      oy = p.y;
    }
    drag.current = { key, sx: e.clientX, sy: e.clientY, ox, oy, moved: false };
    if (!key) setPanning(true);
    canvasRef.current?.setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) > 3) {
      d.moved = true;
      if (d.key) history.current = [...history.current.slice(-49), diagram];
    }
    if (!d.moved) return;
    if (!d.key) {
      setView((v) => ({ ...v, x: d.ox + dx, y: d.oy + dy }));
      return;
    }
    const nx = Math.round((d.ox + dx / view.k) / 4) * 4;
    const ny = Math.round((d.oy + dy / view.k) / 4) * 4;
    const key = d.key;
    setDiagram((dg) =>
      compById.has(key)
        ? {
            ...dg,
            components: dg.components.map((c) => (c.id !== key ? c : isPopComp(c) && mountedIn(c) ? { ...c, ex: nx, ey: ny } : { ...c, x: nx, y: ny })),
          }
        : { ...dg, cablePos: { ...dg.cablePos, [key]: { x: nx, y: ny } } },
    );
    setDirty(true);
  }

  function onPointerUp() {
    const d = drag.current;
    drag.current = null;
    setPanning(false);
    if (d && !d.moved && !d.key) {
      setPending(null);
      setSelectedConn(null);
    }
  }

  function onWheel(e: React.WheelEvent) {
    const r = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    const k = Math.min(2.5, Math.max(0.2, view.k * (e.deltaY < 0 ? 1.1 : 0.9)));
    setView((v) => ({ k, x: mx - ((mx - v.x) / v.k) * k, y: my - ((my - v.y) / v.k) * k }));
  }

  function fit() {
    const el = canvasRef.current;
    if (!el) return;
    const boxes = [
      ...cables.map((c) => ({ ...cablePos(`c${c.id}`), w: G.CABLE_W, h: G.CABLE_H })),
      ...cards.map((c) => ({ x: c.x, y: c.y, ...anySize(c) })),
    ];
    if (!boxes.length) return;
    const x0 = Math.min(...boxes.map((b) => b.x));
    const y0 = Math.min(...boxes.map((b) => b.y));
    const x1 = Math.max(...boxes.map((b) => b.x + b.w));
    const y1 = Math.max(...boxes.map((b) => b.y + b.h));
    const r = el.getBoundingClientRect();
    const k = Math.min(1, Math.max(0.2, Math.min((r.width - 80) / (x1 - x0), (r.height - 80) / (y1 - y0))));
    setView({ k, x: (r.width - (x1 - x0) * k) / 2 - x0 * k, y: (r.height - (y1 - y0) * k) / 2 - y0 * k });
  }

  // Enquadra ao abrir, ao voltar para o canvas e depois de adicionar um card (já com o card renderizado).
  const [fitReq, setFitReq] = useState(0);
  useEffect(() => {
    const t = setTimeout(fit, 30);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitReq, mode]);

  // ---------- Cordões (patch) ----------
  function clickPort(e: End) {
    if (vfl) {
      setVflStart(e);
      return;
    }
    const existing = partner(diagram, e);
    if (!pending) {
      if (existing) {
        setSelectedConn(existing.conn.id);
      } else if (!readOnly) {
        setPending(e);
        setSelectedConn(null);
      }
      return;
    }
    if (sameEnd(pending, e)) {
      setPending(null);
      return;
    }
    if (pending.c === e.c) {
      notify('Escolha uma porta de outro equipamento.', true);
      return;
    }
    if (existing) {
      notify('Essa porta já tem um cordão. Remova o atual antes.', true);
      return;
    }
    const a = pending;
    update((d) => ({ ...d, connections: [...d.connections, { id: uid(), a, b: e }] }));
    setPending(null);
  }

  function setPatch(from: End, to: End | null) {
    update((d) => {
      const connections = d.connections.filter((c) => !sameEnd(c.a, from) && !sameEnd(c.b, from));
      if (to) connections.push({ id: uid(), a: to, b: from });
      return { ...d, connections };
    });
  }

  function removeConn(id: string) {
    update((d) => ({ ...d, connections: d.connections.filter((c) => c.id !== id) }));
    setSelectedConn(null);
  }

  function runAutoPatch() {
    if (!olts.length) return notify('Adicione uma OLT antes de usar o Auto-Patch.', true);
    if (!dios.length) return notify('Adicione um DIO antes de usar o Auto-Patch.', true);
    const created = autoPatch(diagram);
    if (!created.length) return notify('Nada para ligar: não há portas do DIO com fusão e frente livre, ou as PON estão ocupadas.', true);
    update((d) => ({ ...d, connections: [...d.connections, ...created] }));
    notify(`Auto-Patch: ${created.length} cordão(ões) criados entre DIO e OLT.`);
  }

  // ---------- Componentes ----------
  /** Novo card entra na coluna do seu tipo (DIOs ao lado dos cabos, OLT/ativos à direita), abaixo dos existentes. */
  /** Novos racks entram à direita de tudo, lado a lado (como numa fileira do datacenter). */
  function addRacks(list: Rack[]) {
    const right = Math.max(0, ...cables.map((k) => cablePos(`c${k.id}`).x + G.CABLE_W), ...cards.map((k) => k.x + anySize(k).w));
    const top = Math.min(0, ...cards.map((k) => k.y));
    let x = right + 90;
    const placed = list.map((raw) => {
      const r = { ...raw, x, y: top };
      x += rackSize(r).w + 40;
      return r;
    });
    update((d) => ({ ...d, components: [...d.components, ...placed] }));
    setDialog(null);
    if (placed.length > 1) notify(`${placed.length} racks criados (${rackCode(placed[0].loc)} a ${rackCode(placed[placed.length - 1].loc)}).`);
    setFitReq((n) => n + 1);
  }

  function addComponent(raw: PopComp) {
    const placed = placeInRack(diagram, raw);
    if (!placed) return;
    const c = placed;
    const colX = cables.length ? Math.max(...cables.map((k) => cablePos(`c${k.id}`).x)) + G.CABLE_W + 90 : 0;
    const dioX = dios.length ? Math.min(...dios.map((d) => d.x)) : colX;
    const dioRight = dios.length ? Math.max(...dios.map((d) => d.x + cardSize(d).w)) : colX - 90;
    const peers = comps.filter((x) => (c.kind === 'dio' ? x.kind === 'dio' : x.kind !== 'dio'));
    const x = c.kind === 'dio' ? dioX : peers.length ? Math.min(...peers.map((p) => p.x)) : dioRight + 90;
    const y = peers.length ? Math.max(...peers.map((p) => p.y + cardSize(p).h)) + 30 : 0;
    update((d) => ({ ...d, components: [...d.components, { ...c, x, y }] }));
    setDialog(null);
    setFitReq((n) => n + 1);
  }

  /**
   * Resolve a posição no rack escolhido no diálogo: sem U definida (novo ou trocou de rack), procura a primeira livre.
   * Devolve null (com aviso) se o rack estiver cheio.
   */
  function placeInRack(d: Diagram, c: PopComp): PopComp | null {
    if (!c.rack) return unmount(c);
    if (typeof c.u === 'number') return c;
    const rack = rackById.get(c.rack);
    const others: Diagram = { ...d, components: d.components.filter((x) => x.id !== c.id) };
    const u = rack ? firstFreeU(others, rack.id, rackHeight(c)) : null;
    if (!rack || u === null) {
      notify(`Não há ${rackHeight(c)}U livres em sequência no ${rack?.name ?? 'rack'}.`, true);
      return null;
    }
    return { ...c, u };
  }

  function editComponent(raw: PopComp | Rack) {
    if (isRack(raw)) {
      update((d) => ({ ...d, components: d.components.map((x) => (x.id === raw.id ? raw : x)) }));
      const bad = rackConflicts({ ...diagram, components: diagram.components.map((x) => (x.id === raw.id ? raw : x)) });
      if (bad.size) notify(`${bad.size} equipamento(s) ficaram fora do ${raw.name}. Clique neles no rack para reposicionar.`, true);
      setDialog(null);
      return;
    }
    const c = placeInRack(diagram, raw);
    if (!c) return;
    const next: Diagram = { ...diagram, components: diagram.components.map((x) => (x.id === c.id ? c : x)) };
    const kept = pruneConnections(next, new Set(cableMap.keys()));
    const lost = next.connections.length - kept.length;
    if (lost > 0 && !confirm(`${lost} conexão(ões) usam portas que deixam de existir e serão removidas. Continuar?`)) return;
    update(() => ({ ...next, connections: kept }));
    setDialog(null);
  }

  function deleteComponent(c: PopComp | Rack) {
    if (isRack(c)) {
      const n = rackItems(diagram, c.id).length;
      if (!confirm(`Excluir ${c.name}?${n ? ` Os ${n} equipamento(s) instalados continuam em ${node.name}, fora do rack.` : ''}`)) return;
      update((d) => ({ ...d, components: d.components.filter((x) => x.id !== c.id).map((x) => (isPopComp(x) && x.rack === c.id ? unmount(x) : x)) }));
      return;
    }
    if (!confirm(`Excluir ${c.name} e todas as conexões dele?`)) return;
    update((d) => {
      const gone = new Set([c.id, ...d.components.filter((x) => x.kind === 'splitter' && x.dio === c.id).map((x) => x.id)]);
      return {
        ...d,
        components: d.components.filter((x) => !gone.has(x.id)),
        connections: d.connections.filter((k) => !gone.has(k.a.c) && !gone.has(k.b.c)),
      };
    });
    setPending(null);
    setSelectedConn(null);
  }

  /** Instala (ou reposiciona) um equipamento no rack. A altura só é guardada quando difere da típica. */
  function mount(rackId: string, id: string, u: number, h: number) {
    update((d) => ({
      ...d,
      components: d.components.map((x) => (x.id === id && isPopComp(x) ? { ...x, rack: rackId, u, h: h === defaultRackHeight(x) ? undefined : h } : x)),
    }));
    setDialog(null);
  }

  function unmountId(id: string) {
    update((d) => ({ ...d, components: d.components.map((x) => (x.id === id ? unmount(x) : x)) }));
    setDialog(null);
  }

  /** Conexões entre um cabo e um DIO (fusões diretas ou na entrada dos splitters do DIO). */
  function cableDioConnections(d: Diagram, cableKey: string, dioId: string) {
    const own = new Set([dioId, ...d.components.filter((x) => x.kind === 'splitter' && x.dio === dioId).map((x) => x.id)]);
    return d.connections.filter((k) => (k.a.c === cableKey && own.has(k.b.c)) || (k.b.c === cableKey && own.has(k.a.c)));
  }

  function setLinks(pairs: { cable: string; dio: string; on: boolean }[]) {
    const removed = pairs.filter((p) => !p.on).flatMap((p) => cableDioConnections(diagram, p.cable, p.dio));
    if (removed.length && !confirm(`Desvincular remove ${removed.length} fusão(ões) desses cabos no DIO. Continuar?`)) return false;
    const gone = new Set(removed.map((k) => k.id));
    update((d) => ({
      ...d,
      connections: d.connections.filter((k) => !gone.has(k.id)),
      components: d.components.map((c) => {
        if (c.kind !== 'dio') return c;
        let list = linkedCables(d, c);
        pairs
          .filter((p) => p.dio === c.id)
          .forEach((p) => {
            list = p.on ? (list.includes(p.cable) ? list : [...list, p.cable]) : list.filter((k) => k !== p.cable);
          });
        return { ...c, cables: list };
      }),
    }));
    return true;
  }

  function runAutoFuse(dio: Dio) {
    const keys = linkedCables(diagram, dio);
    if (!keys.length) return notify('Vincule um cabo a este DIO antes da Auto Fusão.', true);
    const created = autoFuseDio(
      diagram,
      dio.id,
      keys.map((k) => ({ key: k, fibers: cableMap.get(k)?.fiber_count ?? 0 })),
    );
    if (!created.length) return notify('Nenhuma fusão criada: fibras ou portas já estão ocupadas.', true);
    update((d) => ({ ...d, connections: [...d.connections, ...created] }));
    notify(`Auto Fusão: ${created.length} fibra(s) fundidas em ${dio.name}.`);
  }

  // ---------- PNG ----------
  /** Exporta o canvas (cabos, equipamentos em vista frontal, vínculos e cordões) como PNG. */
  function exportPng() {
    const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const boxes = [
      ...cables.map((c) => ({ ...cablePos(`c${c.id}`), w: G.CABLE_W, h: G.CABLE_H })),
      ...cards.map((c) => ({ x: c.x, y: c.y, ...anySize(c) })),
    ];
    if (!boxes.length) return notify('Nada para exportar.', true);
    const pad = 40;
    const titleH = 60;
    const x0 = Math.min(...boxes.map((b) => b.x)) - pad;
    const y0 = Math.min(...boxes.map((b) => b.y)) - pad;
    const w = Math.max(...boxes.map((b) => b.x + b.w)) - x0 + pad;
    const h = Math.max(...boxes.map((b) => b.y + b.h)) - y0 + pad + 40;
    const parts: string[] = [];
    dios.forEach((dio) =>
      linkedCables(diagram, dio).forEach((key) => {
        const cable = cableMap.get(key);
        if (!cable) return;
        const p = cablePos(key);
        const sx = p.x + G.CABLE_W;
        const sy = p.y + G.HEADER / 2;
        // No rack: o cabo chega na borda do rack e segue até a faixa do DIO.
        const rack = mountedIn(dio);
        const st = stripOf(dio);
        const tx = rack && st ? rack.x : dio.x;
        const by = rack && st ? st.y + st.h / 2 : dio.y + G.HEADER + G.CHIPS / 2;
        const dx = Math.max(40, Math.abs(tx - sx) / 2);
        parts.push(`<path d="M${sx},${sy} C${sx + dx},${sy} ${tx - dx},${by} ${tx},${by}${st ? ` L${st.x},${by}` : ''}" fill="none" stroke="${cable.color}" stroke-width="2.5"/>`);
      }),
    );
    cables.forEach((c) => {
      const p = cablePos(`c${c.id}`);
      const incoming = c.to_node_id === node.id;
      parts.push(
        `<rect x="${p.x}" y="${p.y}" width="${G.CABLE_W}" height="${G.CABLE_H}" rx="8" fill="#ffffff" stroke="#94a3b8"/>`,
        `<circle cx="${p.x + 14}" cy="${p.y + 20}" r="5" fill="${c.color}"/>`,
        `<text x="${p.x + 26}" y="${p.y + 24}" font-size="12" font-weight="bold" fill="#0f172a">${esc(c.name.slice(0, 22))}</text>`,
        `<text x="${p.x + 12}" y="${p.y + 58}" font-size="10" fill="#475569">${esc(`${CABLE_CATEGORIES[c.category].label} · ${c.fiber_count} FO`)}</text>`,
        `<text x="${p.x + 12}" y="${p.y + 74}" font-size="10" fill="#475569">${esc((incoming ? `de ${nodeName(c.from_node_id)}` : `para ${nodeName(c.to_node_id)}`).slice(0, 30))}</text>`,
      );
    });
    comps.filter((c) => !mountedIn(c)).forEach((c) => {
      const { w: cw, h: ch } = cardSize(c);
      const tag = c.kind === 'olt' ? `${c.slots}×${c.ports}` : c.kind === 'dio' ? `${c.ports}P` : c.type;
      parts.push(
        `<rect x="${c.x}" y="${c.y}" width="${cw}" height="${ch}" rx="8" fill="#ffffff" stroke="#94a3b8"/>`,
        `<text x="${c.x + 12}" y="${c.y + 25}" font-size="13" font-weight="bold" fill="#0f172a">${esc(c.name)} <tspan font-size="10" fill="#64748b">${esc(tag)}</tspan></text>`,
      );
      rowLabels(c).forEach((r) => parts.push(`<text x="${c.x + G.PAD + (labelW(c) - 6) / 2}" y="${c.y + r.y + 18}" font-size="${r.label.length > 5 ? 8 : 10}" font-weight="bold" fill="#475569" text-anchor="middle">${esc(r.label)}</text>`));
      cardPorts(c).forEach((p) => {
        const b = portBox(c, p);
        const n = Number(p.slice(1));
        const patched = usedEnds.has(`${c.id}:${p}`);
        const src = c.kind === 'dio' ? fusionSource(diagram, c.id, n) : null;
        const cable = src && cableMap.get(src.cable);
        const fiberHex = src && cable ? fiberColor(src.fiber, cable.fibers_per_tube).hex : undefined;
        const fill = fiberHex ?? (patched ? (c.kind === 'dio' ? PORT_FILL.dio : c.kind === 'active' ? PORT_FILL.active : p.startsWith('u') ? PORT_FILL.up : PORT_FILL.olt) : '#f8fafc');
        const label = c.kind === 'olt' && !p.startsWith('u') ? ((n - 1) % c.ports) + 1 : c.kind === 'active' ? (portGroupOf(c, p)?.index ?? n) : n;
        parts.push(
          `<rect x="${c.x + b.x}" y="${c.y + b.y}" width="${G.PORT}" height="${G.PORT}" rx="4" fill="${fill}" stroke="#94a3b8"/>`,
          `<text x="${c.x + b.x + G.PORT / 2}" y="${c.y + b.y + 18}" font-size="10" text-anchor="middle" fill="${patched || fiberHex ? textOn(fill) : '#64748b'}">${label}</text>`,
        );
        if (fiberHex && patched) parts.push(`<rect x="${c.x + b.x + 2}" y="${c.y + b.y + G.PORT - 4}" width="${G.PORT - 4}" height="2.5" fill="#334155"/>`);
        if (cable) parts.push(`<circle cx="${c.x + b.x + G.PORT - 1}" cy="${c.y + b.y + 1}" r="4" fill="${cable.color}" stroke="#0f172a" stroke-width="0.8"/>`);
      });
    });
    racks.forEach((r) => {
      const { w: rw, h: rh } = rackSize(r);
      const ix = r.x + RACK.PAD + RACK.NUM + RACK.POST;
      parts.push(
        `<rect x="${r.x}" y="${r.y}" width="${rw}" height="${rh}" rx="8" fill="#ffffff" stroke="#94a3b8"/>`,
        `<text x="${r.x + 12}" y="${r.y + 25}" font-size="13" font-weight="bold" fill="#0f172a">${esc(r.name)} <tspan font-size="10" fill="#64748b">${rackCode(r.loc) && rackCode(r.loc) !== r.name ? `${esc(rackCode(r.loc))} · ` : ''}${r.units}U · ${RACK_MOUNTS[r.mount].label}</tspan></text>`,
        `<rect x="${ix - RACK.POST}" y="${r.y + rackUTop(r, r.units)}" width="${RACK.INNER + RACK.POST * 2}" height="${r.units * RACK.RU}" fill="#1e293b"/>`,
        `<rect x="${ix}" y="${r.y + rackUTop(r, r.units)}" width="${RACK.INNER}" height="${r.units * RACK.RU}" fill="#f8fafc"/>`,
      );
      for (let u = 1; u <= r.units; u++) {
        const y = r.y + rackUTop(r, u);
        parts.push(
          `<text x="${r.x + RACK.PAD + RACK.NUM - 4}" y="${y + RACK.RU - 4}" font-size="9" text-anchor="end" fill="#64748b">${u}</text>`,
          `<line x1="${ix}" y1="${y + RACK.RU}" x2="${ix + RACK.INNER}" y2="${y + RACK.RU}" stroke="#e2e8f0"/>`,
        );
      }
      rackItems(diagram, r.id).forEach((it) => {
        const hh = rackHeight(it);
        const y = r.y + rackUTop(r, it.u! + hh - 1);
        const col = KIND_COLOR[it.kind];
        parts.push(
          `<rect x="${ix + 1}" y="${y + 1}" width="${RACK.INNER - 2}" height="${hh * RACK.RU - 2}" rx="2" fill="${col}"/>`,
          `<text x="${ix + 8}" y="${y + Math.min(hh * RACK.RU, 16) / 2 + 4}" font-size="10" font-weight="bold" fill="${textOn(col)}">${esc(it.name)}</text>`,
        );
      });
    });
    cords.forEach((k) => {
      const a = portCenter(k.a);
      const b = portCenter(k.b);
      if (!a || !b) return;
      const sag = Math.max(30, Math.abs(b.x - a.x) * 0.15 + Math.abs(b.y - a.y) * 0.1);
      parts.push(`<path d="M${a.x},${a.y} C${a.x},${a.y + sag} ${b.x},${b.y + sag} ${b.x},${b.y}" fill="none" stroke="#0284c7" stroke-width="1.4" stroke-opacity="0.8"/>`);
    });
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h + titleH}" font-family="Arial, sans-serif">
      <rect width="100%" height="100%" fill="#f1f5f9"/>
      <rect width="100%" height="${titleH - 10}" fill="#0f172a"/>
      <text x="${pad}" y="32" font-size="18" font-weight="bold" fill="#ffffff">${esc(node.name)} · ${place}</text>
      <text x="${w - pad}" y="32" font-size="11" fill="#94a3b8" text-anchor="end">${new Date().toLocaleString('pt-BR')} · ${node.lat.toFixed(6)}, ${node.lng.toFixed(6)} · ${STATUSES[status].label}</text>
      <g transform="translate(${-x0},${titleH - y0})">${parts.join('')}</g>
      <text x="${pad}" y="${h + titleH - 16}" font-size="10" fill="#475569">Racks: ${racks.length} · OLT: ${olts.length} · DIO: ${dios.length} · Portas do DIO com cordão: ${dioPatched}/${dioPorts} · PON em uso: ${ponUsed}/${ponTotal}</text>
    </svg>`;
    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = w * 2;
      canvas.height = (h + titleH) * 2;
      const ctx = canvas.getContext('2d')!;
      ctx.scale(2, 2);
      ctx.drawImage(img, 0, 0);
      const a = document.createElement('a');
      a.download = `${node.name.replace(/[^\w-]+/g, '_')}_pop.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
    };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  // ---------- Salvar ----------
  async function save(close: boolean) {
    try {
      const clean = { ...diagram, popLayout: true, connections: pruneConnections(diagram, new Set(cableMap.keys())) };
      const r = await api.updateNode(node.id, { diagram: clean, status });
      onSaved(r.node);
      setDirty(false);
      if (close) onClose();
      else notify(`${node.name} salvo.`);
    } catch (e) {
      notify(errorMessage(e), true);
    }
  }

  function requestClose() {
    if (dirty && !readOnly && !confirm('Há alterações não salvas. Deseja sair sem salvar?')) return;
    onClose();
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (dialog || matrixDio) return;
      if ((e.target as HTMLElement).closest('input,textarea,select')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedConn && !readOnly) removeConn(selectedConn);
      if (e.key === 'Escape') {
        setPending(null);
        setSelectedConn(null);
        setVflStart(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ---------- Renderização ----------
  const selConn = selectedConn ? diagram.connections.find((c) => c.id === selectedConn) : undefined;
  const infoEnd = pending ?? (selConn ? [selConn.a, selConn.b].find((x) => compById.get(x.c)?.kind === 'dio') : undefined);
  const infoPower = (() => {
    if (!infoEnd || compById.get(infoEnd.c)?.kind !== 'dio') return null;
    const n = Number(infoEnd.p.slice(1));
    return fusionSource(diagram, infoEnd.c, n) ? dioPower(infoEnd.c, n) : null;
  })();

  // Cordões desenhados no canvas: entre portas de equipamentos.
  const cords = diagram.connections.filter((k) => {
    const ca = compById.get(k.a.c);
    const cb = compById.get(k.b.c);
    return isPatchEnd(ca, k.a.p) && isPatchEnd(cb, k.b.p);
  });

  const matrix = matrixDio ? dios.find((d) => d.id === matrixDio) : undefined;

  return (
    <div className="fixed inset-0 z-[1500] flex flex-col bg-slate-950 text-slate-100">
      {/* Título */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-800 bg-slate-900">
        <div className="w-8 h-8 rounded-lg bg-violet-500/15 text-violet-400 flex items-center justify-center">
          <Server size={17} />
        </div>
        <div className="font-semibold">
          {editorTitle}: {node.name}
        </div>
        <select
          className="ml-3 rounded-md bg-slate-950 border border-slate-700 px-2 py-1 text-xs"
          value={status}
          disabled={readOnly}
          onChange={(e) => {
            setStatus(e.target.value as Status);
            setDirty(true);
          }}
          style={{ color: STATUSES[status].color }}
        >
          {(Object.keys(STATUSES) as Status[]).map((s) => (
            <option key={s} value={s}>
              {STATUSES[s].label}
            </option>
          ))}
        </select>
        {dirty && !readOnly && <span className="text-[11px] text-amber-400">alterações não salvas</span>}
        {readOnly && <span className="text-[11px] text-amber-400">acesso de leitura</span>}
        <button onClick={requestClose} className="ml-auto text-slate-400 hover:text-white cursor-pointer" aria-label="Fechar">
          <X size={20} />
        </button>
      </div>

      {/* Barra de ferramentas */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-slate-800 bg-slate-900/70">
        <div className="flex items-center gap-1.5">
          <Tool icon={<Server size={14} />} label="OLT" onClick={() => setDialog({ t: 'olt' })} disabled={readOnly} />
          <Tool icon={<Box size={14} />} label="DIO" onClick={() => setDialog({ t: 'dio' })} disabled={readOnly} />
          <Tool icon={<NetIcon size={14} />} label="Ativo" onClick={() => setDialog({ t: 'active' })} disabled={readOnly} />
          <Tool icon={<Rows4 size={14} />} label="Rack" title="Rack de piso ou suspenso (ex.: 44U, 48U)" onClick={() => setDialog({ t: 'rack' })} disabled={readOnly} />
          <Tool icon={<BookOpen size={14} />} label="Cadastro" title="Cadastro de equipamentos: fabricante, modelo, portas e altura em U" onClick={() => setDialog({ t: 'catalog' })} />
        </div>
        <div className="hidden md:flex items-center gap-3 pl-3 ml-1 border-l border-slate-700 text-[11px] font-medium uppercase tracking-wide text-slate-400">
          {racks.length > 0 && <span>Rack: {racks.length}</span>}
          <span>OLT: {olts.length}</span>
          <span>DIO: {dios.length}</span>
          <span title="Portas do DIO com cordão / total">Portas: {dioPatched}/{dioPorts}</span>
          <span title="Portas PON em uso / total">PON: {ponUsed}/{ponTotal}</span>
        </div>
        {racks.length > 1 && (
          <form
            className="relative flex items-center"
            onSubmit={(e) => {
              e.preventDefault();
              if (rackQuery.trim()) locateRack(rackQuery);
            }}
          >
            <Search size={13} className="absolute left-2 text-slate-500 pointer-events-none" />
            <input
              list="pop-rack-codes"
              className="w-28 rounded-md bg-slate-950 border border-slate-700 pl-7 pr-2 py-1 text-xs placeholder:text-slate-500"
              placeholder="Rack (AJ05)"
              title="Digite o código do rack (ex.: DC1.1A-AJ05, AJ05) ou o nome e tecle Enter"
              value={rackQuery}
              onChange={(e) => {
                setRackQuery(e.target.value);
                // Escolher uma opção da lista já localiza.
                const exact = racks.find((r) => rackCode(r.loc) === e.target.value || r.name === e.target.value);
                if (exact) locateRack(e.target.value);
              }}
            />
            <datalist id="pop-rack-codes">
              {searchRacks(racks, '').map((r) => (
                <option key={r.id} value={rackCode(r.loc) || r.name}>
                  {rackCode(r.loc) && rackCode(r.loc) !== r.name ? r.name : ''}
                </option>
              ))}
            </datalist>
          </form>
        )}

        <div className="mx-auto flex rounded-lg bg-slate-950 border border-slate-800 p-0.5">
          {(
            [
              ['canvas', 'Canvas 2D', <LayoutGrid key="c" size={14} />],
              ['manobra', 'Manobra', <Workflow key="m" size={14} />],
            ] as const
          ).map(([m, label, icon]) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                setManobraFocus(null);
              }}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium cursor-pointer ${mode === m ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              {icon} {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          {mode === 'canvas' && <Tool icon={<Spline size={14} />} label="Cordões" active={showCords} onClick={() => setShowCords((v) => !v)} />}
          {mode === 'canvas' && (
            <Tool
              icon={<Flashlight size={14} />}
              label="Traço VFL"
              danger={vfl}
              onClick={() => {
                setVfl((v) => !v);
                setVflStart(null);
                setPending(null);
                setSelectedConn(null);
              }}
            />
          )}
          <Tool icon={<ImageDown size={14} />} label="PNG" title="Exportar PNG" onClick={exportPng} />
          {!readOnly && <Tool icon={<Undo2 size={14} />} label="" title="Desfazer (Ctrl+Z)" onClick={undo} disabled={!history.current.length} />}
          {!readOnly && (
            <>
              <button className="btn-ghost py-1.5 text-xs" onClick={() => save(false)} disabled={!dirty}>
                <Save size={14} /> Salvar
              </button>
              <button className="btn-primary py-1.5 text-xs" onClick={() => save(true)}>
                <Save size={14} /> Salvar e sair
              </button>
              <Tool icon={<Zap size={14} />} label="Auto-Patch" onClick={runAutoPatch} />
            </>
          )}
        </div>
      </div>

      {/* Área principal */}
      <div className="relative flex-1 min-h-0">
        {mode === 'manobra' ? (
          <ManobraView
            diagram={diagram}
            cables={cableMap}
            focus={manobraFocus}
            readOnly={readOnly}
            powerAt={dioPower}
            onPatch={setPatch}
          />
        ) : (
          <div
            ref={canvasRef}
            className="absolute inset-0 overflow-hidden select-none touch-none"
            style={{
              cursor: panning ? 'grabbing' : 'default',
              backgroundColor: '#0b1220',
              backgroundImage: 'radial-gradient(circle, #1e293b 1.2px, transparent 1.2px)',
              backgroundSize: `${22 * view.k}px ${22 * view.k}px`,
              backgroundPosition: `${view.x}px ${view.y}px`,
            }}
            onPointerDown={(e) => startDrag(e)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onWheel={onWheel}
          >
            <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
              {/* Ligações cabo → DIO (passando pelo rack quando o DIO está instalado nele) */}
              <svg className="absolute left-0 top-0 overflow-visible pointer-events-none" width={1} height={1}>
                {dios.flatMap((dio) =>
                  linkedCables(diagram, dio).map((key) => {
                    const cable = cableMap.get(key);
                    if (!cable) return null;
                    const p = cablePos(key);
                    const ay = p.y + G.HEADER / 2;
                    const hot = vflResult?.exits.some((x) => x.cable === key);
                    const color = hot ? VFL : cable.color;
                    const curve = (sx: number, sy: number, bx: number, by: number, right: boolean) => {
                      const dx = Math.max(40, Math.abs(bx - sx) / 2);
                      return `M${sx},${sy} C${sx + (right ? dx : -dx)},${sy} ${bx + (right ? -dx : dx)},${by} ${bx},${by}`;
                    };
                    const rack = mountedIn(dio);
                    const st = stripOf(dio);
                    const segs: string[] = [];
                    const dots: { x: number; y: number }[] = [];
                    if (rack && st) {
                      // Cabo → borda do rack → faixa do DIO; expandido, segue da faixa até o card.
                      const right = rack.x >= p.x + G.CABLE_W / 2;
                      const sx = right ? p.x + G.CABLE_W : p.x;
                      const ex = right ? rack.x : rack.x + rackSize(rack).w;
                      const sy = st.y + st.h / 2;
                      segs.push(curve(sx, ay, ex, sy, right), `M${ex},${sy} L${right ? st.x : st.x + st.w},${sy}`);
                      dots.push({ x: sx, y: ay }, { x: ex, y: sy });
                      const pos = shownPos(dio);
                      if (pos) {
                        // Da faixa até o card expandido, para o lado onde o card estiver.
                        const by = pos.y + G.HEADER + G.CHIPS / 2;
                        const toRight = pos.x >= st.x + st.w;
                        const fx = toRight ? st.x + st.w : st.x;
                        const tx = toRight ? pos.x : pos.x + cardSize(dio).w;
                        segs.push(curve(fx, sy, tx, by, toRight));
                        dots.push({ x: tx, y: by });
                      }
                    } else {
                      const toLeft = dio.x >= p.x + G.CABLE_W / 2;
                      const bx = toLeft ? dio.x : dio.x + cardSize(dio).w;
                      const by = dio.y + G.HEADER + G.CHIPS / 2;
                      const sx = toLeft ? p.x + G.CABLE_W : p.x;
                      segs.push(curve(sx, ay, bx, by, toLeft));
                      dots.push({ x: sx, y: ay }, { x: bx, y: by });
                    }
                    const d = segs.join(' ');
                    return (
                      <g key={`${dio.id}-${key}`}>
                        <path d={d} fill="none" stroke="#020617" strokeWidth={5} strokeOpacity={0.6} />
                        <path d={d} fill="none" stroke={color} strokeWidth={2.5} />
                        {dots.map((o, i) => (
                          <circle key={i} cx={o.x} cy={o.y} r={3.5} fill={cable.color} stroke="#020617" />
                        ))}
                      </g>
                    );
                  }),
                )}
              </svg>

              {/* Cabos */}
              {cables.map((c) => {
                const key = `c${c.id}`;
                const p = cablePos(key);
                const incoming = c.to_node_id === node.id;
                const fused = Array.from({ length: c.fiber_count }, (_, i) => usedEnds.has(`${key}:f${i + 1}`)).filter(Boolean).length;
                const hot = vflResult?.exits.some((x) => x.cable === key);
                return (
                  <div
                    key={key}
                    className="absolute rounded-lg border bg-slate-900 shadow-lg"
                    style={{ left: p.x, top: p.y, width: G.CABLE_W, height: G.CABLE_H, borderColor: hot ? VFL : '#1e293b', boxShadow: hot ? `0 0 14px ${VFL}88` : undefined }}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <div
                      className="flex items-center gap-1.5 px-2.5 border-b border-slate-800 cursor-move"
                      style={{ height: G.HEADER }}
                      onPointerDown={(e) => startDrag(e, key)}
                    >
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.color }} />
                      <span className="text-xs font-semibold truncate flex-1" title={c.name}>
                        {c.name}
                      </span>
                      {!readOnly && (
                        <CardBtn title="Vincular a DIO" onClick={() => setDialog({ t: 'linkCable', cable: key })}>
                          <Pencil size={13} />
                        </CardBtn>
                      )}
                      <GripHorizontal size={14} className="text-slate-600" />
                    </div>
                    <div className="px-2.5 py-2 text-[11px] text-slate-400 leading-relaxed">
                      <div className="flex items-center gap-1.5">
                        <CableIcon size={12} style={{ color: CABLE_CATEGORIES[c.category].color }} />
                        {CABLE_CATEGORIES[c.category].label} · {c.fiber_count} FO
                      </div>
                      <div className="truncate">{incoming ? `de ${nodeName(c.from_node_id)}` : `para ${nodeName(c.to_node_id)}`}</div>
                      <div>
                        Fibras em uso: <span className="text-slate-200">{fused}</span>/{c.fiber_count}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Racks (atrás dos equipamentos) */}
              {racks.map((r) => (
                <RackCard
                  key={r.id}
                  rack={r}
                  diagram={diagram}
                  conflicts={conflicts}
                  duplicate={dupCodes.has(rackCode(r.loc))}
                  highlight={found === r.id}
                  readOnly={readOnly}
                  onDrag={(e) => startDrag(e, r.id)}
                  onAdd={(u) => setDialog({ t: 'mount', rack: r.id, u })}
                  onEdit={() => setDialog({ t: 'rack', edit: r })}
                  onDelete={() => deleteComponent(r)}
                  expanded={expanded}
                  hot={(id) => !!vflResult && [...vflResult.ends].some((k) => k.startsWith(`${id}:`))}
                  inUse={(id) => [...usedEnds.keys()].some((k) => k.startsWith(`${id}:`))}
                  item={{
                    toggle: toggleExpanded,
                    move: (id) => setDialog({ t: 'mount', rack: r.id, item: id }),
                    matrix: (id) => setMatrixDio(id),
                    link: (id) => setDialog({ t: 'linkDio', dio: id }),
                    patch: (id) => {
                      setManobraFocus(id);
                      setMode('manobra');
                    },
                    edit: (id) => {
                      const c = comps.find((x) => x.id === id);
                      if (c) setDialog({ t: c.kind, edit: c } as Dialog);
                    },
                    remove: (id) => {
                      const c = comps.find((x) => x.id === id);
                      if (c) deleteComponent(c);
                    },
                  }}
                />
              ))}

              {/* Equipamentos */}
              {shownComps.map((c) => (
                <EquipmentCard
                  key={c.id}
                  comp={c}
                  onCollapse={mountedIn(c) ? () => setExpanded((list) => list.filter((x) => x !== c.id)) : undefined}
                  rack={c.rack ? rackById.get(c.rack) : undefined}
                  rackConflict={conflicts.has(c.id)}
                  diagram={diagram}
                  cableMap={cableMap}
                  usedEnds={usedEnds}
                  readOnly={readOnly}
                  pending={pending}
                  selConn={selConn}
                  lit={lit}
                  endLabel={endLabel}
                  onDrag={(e) => startDrag(e, c.id)}
                  onPort={clickPort}
                  onMatrix={() => setMatrixDio(c.id)}
                  onLink={() => setDialog({ t: 'linkDio', dio: c.id })}
                  onPatch={() => {
                    setManobraFocus(c.id);
                    setMode('manobra');
                  }}
                  onEdit={() => setDialog({ t: c.kind, edit: c } as Dialog)}
                  onDelete={() => deleteComponent(c)}
                />
              ))}

              {/* Cordões */}
              <svg className="absolute left-0 top-0 overflow-visible pointer-events-none" width={1} height={1}>
                {cords.map((k) => {
                  const hot = vflResult?.connections.has(k.id);
                  const sel = k.id === selectedConn;
                  if (!showCords && !hot && !sel) return null;
                  const a = portCenter(k.a);
                  const b = portCenter(k.b);
                  if (!a || !b) return null;
                  const sag = Math.max(30, Math.abs(b.x - a.x) * 0.15 + Math.abs(b.y - a.y) * 0.1);
                  const d = `M${a.x},${a.y} C${a.x},${a.y + sag} ${b.x},${b.y + sag} ${b.x},${b.y}`;
                  return (
                    <g key={k.id}>
                      <path
                        d={d}
                        fill="none"
                        stroke="transparent"
                        strokeWidth={10}
                        style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => setSelectedConn(k.id)}
                      />
                      <path d={d} fill="none" stroke={hot ? VFL : sel ? '#facc15' : '#38bdf8'} strokeWidth={hot || sel ? 2.6 : 1.6} strokeOpacity={hot || sel ? 1 : 0.7} />
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Zoom */}
            <div className="absolute right-3 bottom-3 flex flex-col gap-1" onPointerDown={(e) => e.stopPropagation()}>
              {[
                { icon: <ZoomIn size={16} />, fn: () => setView((v) => ({ ...v, k: Math.min(2.5, v.k * 1.2) })), t: 'Aproximar' },
                { icon: <ZoomOut size={16} />, fn: () => setView((v) => ({ ...v, k: Math.max(0.2, v.k / 1.2) })), t: 'Afastar' },
                { icon: <Maximize size={16} />, fn: fit, t: 'Enquadrar tudo' },
              ].map((z) => (
                <button key={z.t} title={z.t} onClick={z.fn} className="w-8 h-8 rounded-md bg-slate-800 text-slate-200 border border-slate-700 flex items-center justify-center cursor-pointer hover:bg-slate-700">
                  {z.icon}
                </button>
              ))}
            </div>

            {cables.length === 0 && cards.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="panel px-5 py-4 text-sm text-center max-w-sm">
                  {node.name} ainda está vazio. Adicione um Rack, uma OLT e um DIO pela barra acima, e desenhe no mapa o cabo que chega aqui.
                </div>
              </div>
            )}

            {/* Painéis de informação */}
            <div className="absolute left-3 bottom-3 max-w-md space-y-2" onPointerDown={(e) => e.stopPropagation()}>
              {vfl && (
                <div className="panel px-4 py-3 text-sm border-red-500/40">
                  <div className="flex items-center gap-2 text-red-400 font-semibold text-xs uppercase tracking-wide">
                    <Flashlight size={14} /> Traço VFL
                  </div>
                  {!vflStart ? (
                    <div className="text-xs text-slate-400 mt-1">Clique numa porta do DIO, da OLT ou de um ativo para injetar a luz vermelha e ver o caminho.</div>
                  ) : (
                    <div className="mt-1 space-y-1 text-xs">
                      <div>
                        Luz em <b>{endLabel(vflStart)}</b> · {vflResult?.connections.size ?? 0} conexão(ões) no caminho
                      </div>
                      {vflResult?.exits.map((x) => {
                        const cable = cableMap.get(x.cable);
                        if (!cable) return null;
                        const fc = fiberColor(x.fiber, cable.fibers_per_tube);
                        const other = cable.from_node_id === node.id ? cable.to_node_id : cable.from_node_id;
                        return (
                          <div key={`${x.cable}${x.fiber}`} className="flex items-center gap-1.5">
                            <span className="w-3 h-3 rounded-sm border border-slate-600" style={{ background: fc.hex }} />
                            Sai por {cable.name} · fibra {x.fiber} ({fc.name}) → {nodeName(other)}
                          </div>
                        );
                      })}
                      {vflResult && vflResult.exits.length === 0 && <div className="text-slate-500">A luz não sai de {node.name} por nenhum cabo.</div>}
                    </div>
                  )}
                </div>
              )}
              {!vfl && pending && (
                <div className="panel px-4 py-3 text-sm">
                  <div className="text-xs text-slate-400">Porta selecionada · clique na porta de destino para criar o cordão</div>
                  <div className="font-medium mt-0.5">{endLabel(pending)}</div>
                  <PowerLine power={infoPower} onBudget={(r) => onShowBudget(node.name, r)} />
                </div>
              )}
              {!vfl && selConn && (
                <div className="panel px-4 py-3 text-sm">
                  <div className="text-xs text-slate-400">{isPatchEnd(compById.get(selConn.a.c), selConn.a.p) && isPatchEnd(compById.get(selConn.b.c), selConn.b.p) ? 'Cordão' : 'Conexão'}</div>
                  <div className="font-medium mt-0.5">
                    {endLabel(selConn.a)} ↔ {endLabel(selConn.b)}
                  </div>
                  <PowerLine power={infoPower} onBudget={(r) => onShowBudget(node.name, r)} />
                  {!readOnly && (
                    <button className="btn-danger py-1 text-xs mt-2" onClick={() => removeConn(selConn.id)}>
                      <Trash2 size={13} /> Remover
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {toast && (
          <div
            className={`absolute top-3 left-1/2 -translate-x-1/2 z-10 rounded-md text-white text-sm px-3 py-1.5 shadow flex gap-2 items-center ${toast.error ? 'bg-red-600' : 'bg-emerald-600'}`}
          >
            {toast.text}
            <button onClick={() => setToast(null)} className="cursor-pointer">
              <X size={14} />
            </button>
          </div>
        )}
      </div>

      {matrix && (
        <FusionMatrix
          dio={matrix}
          diagram={diagram}
          cables={linkedCables(diagram, matrix)
            .map((k) => cableMap.get(k))
            .filter((c): c is Cable => !!c)}
          readOnly={readOnly}
          onChange={update}
          onLinkCables={() => setDialog({ t: 'linkDio', dio: matrix.id })}
          onAutoFuse={() => runAutoFuse(matrix)}
          onClose={() => setMatrixDio(null)}
        />
      )}
      {toast && matrix && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[1900] rounded-md text-white text-sm px-3 py-1.5 shadow ${toast.error ? 'bg-red-600' : 'bg-emerald-600'}`}>{toast.text}</div>
      )}

      {dialog?.t === 'olt' && (
        <OltDialog
          initial={dialog.edit}
          defaultTx={network.settings.olt_tx_dbm}
          count={olts.length}
          racks={racks}
          models={catalog.models}
          onCatalog={() => setDialog({ t: 'catalog', kind: 'olt', back: dialog })}
          onClose={() => setDialog(null)}
          onSubmit={(c) => (dialog.edit ? editComponent(c) : addComponent(c))}
        />
      )}
      {dialog?.t === 'dio' && (
        <DioDialog
          initial={dialog.edit}
          count={dios.length}
          racks={racks}
          models={catalog.models}
          onCatalog={() => setDialog({ t: 'catalog', kind: 'dio', back: dialog })}
          onClose={() => setDialog(null)}
          onSubmit={(c) => (dialog.edit ? editComponent(c) : addComponent({ ...c, cables: cables.length === 1 && !dios.length ? [`c${cables[0].id}`] : [] }))}
        />
      )}
      {dialog?.t === 'active' && (
        <ActiveDialog
          initial={dialog.edit}
          count={comps.filter((c) => c.kind === 'active').length}
          racks={racks}
          models={catalog.models}
          onCatalog={() => setDialog({ t: 'catalog', kind: 'active', back: dialog })}
          onClose={() => setDialog(null)}
          onSubmit={(c) => (dialog.edit ? editComponent(c) : addComponent(c))}
        />
      )}
      {dialog?.t === 'catalog' && (
        <EquipmentCatalog
          models={catalog.models}
          hidden={catalog.hidden}
          initialKind={dialog.kind}
          readOnly={readOnly}
          onChanged={catalog.reload}
          onClose={() => setDialog(dialog.back ?? null)}
        />
      )}
      {dialog?.t === 'rack' && (
        <RackDialog initial={dialog.edit} racks={racks} onClose={() => setDialog(null)} onSubmit={(rs) => (dialog.edit ? editComponent(rs[0]) : addRacks(rs))} />
      )}
      {dialog?.t === 'mount' &&
        (() => {
          const rack = rackById.get(dialog.rack);
          if (!rack) return null;
          const item = dialog.item ? comps.find((c) => c.id === dialog.item) : undefined;
          return (
            <MountDialog
              key={`${dialog.rack}-${dialog.item ?? ''}-${dialog.u ?? ''}`}
              rack={rack}
              diagram={diagram}
              item={item}
              startU={dialog.u}
              onClose={() => setDialog(null)}
              onSubmit={(id, u, h) => mount(rack.id, id, u, h)}
              onUnmount={unmountId}
            />
          );
        })()}
      {dialog?.t === 'linkDio' &&
        (() => {
          const dio = dios.find((d) => d.id === dialog.dio);
          if (!dio) return null;
          const initial = linkedCables(diagram, dio);
          return (
            <LinkDialog
              title="Vincular cabos"
              subtitle={(n) => `${dio.name} · ${n} cabo(s) vinculado(s)`}
              items={cableItems}
              initial={initial}
              empty={`Nenhum cabo chega em ${node.name}. Desenhe o cabo no mapa ligando-o a este objeto.`}
              onClose={() => setDialog(null)}
              onSubmit={(keys) => {
                const pairs = cableItems.map((it) => ({ cable: it.key, dio: dio.id, on: keys.includes(it.key) })).filter((p) => p.on !== initial.includes(p.cable));
                if (setLinks(pairs)) setDialog(null);
              }}
            />
          );
        })()}
      {dialog?.t === 'linkCable' &&
        (() => {
          const cable = cableMap.get(dialog.cable);
          if (!cable) return null;
          const initial = dios.filter((d) => linkedCables(diagram, d).includes(dialog.cable)).map((d) => d.id);
          return (
            <LinkDialog
              title={cable.name}
              subtitle={(n) => `${cable.fiber_count} fibras · vinculado a ${n} DIO(s)`}
              items={dios.map((d) => ({ key: d.id, label: d.name, detail: `${d.ports} portas · ${trays(d.ports)} bandeja(s)`, color: '#0ea5e9' }))}
              initial={initial}
              empty="Adicione um DIO para vincular este cabo."
              onClose={() => setDialog(null)}
              onSubmit={(ids) => {
                const pairs = dios.map((d) => ({ cable: dialog.cable, dio: d.id, on: ids.includes(d.id) })).filter((p) => p.on !== initial.includes(p.dio));
                if (setLinks(pairs)) setDialog(null);
              }}
            />
          );
        })()}
    </div>
  );
}

function Tool({
  icon,
  label,
  onClick,
  active,
  danger,
  disabled,
  title,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium cursor-pointer transition disabled:opacity-40 disabled:cursor-not-allowed ${
        danger
          ? 'bg-red-600/90 border-red-500 text-white'
          : active
            ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300'
            : 'bg-slate-800/80 border-slate-700 hover:bg-slate-700 text-slate-200'
      }`}
    >
      {icon}
      {label && <span>{label}</span>}
    </button>
  );
}

function CardBtn({ title, onClick, children, danger }: { title: string; onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <button
      title={title}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`w-7 h-7 rounded-md flex items-center justify-center cursor-pointer text-slate-400 transition ${danger ? 'hover:bg-red-500/15 hover:text-red-400' : 'hover:bg-slate-700 hover:text-white'}`}
    >
      {children}
    </button>
  );
}

function PowerLine({ power, onBudget }: { power: BudgetResult | null; onBudget: (r: BudgetResult) => void }) {
  if (!power) return null;
  return (
    <div className="mt-1 flex items-center justify-between gap-3 text-xs">
      <span className={`font-mono font-semibold ${power.ok ? 'text-slate-100' : 'text-slate-400'}`}>
        {power.ok ? `${power.power!.toFixed(2)} dBm na fibra de saída` : (power.error ?? 'Sem sinal')}
      </span>
      {power.steps.length > 0 && (
        <button className="text-emerald-400 hover:underline cursor-pointer" onClick={() => onBudget(power)}>
          Ver orçamento
        </button>
      )}
    </div>
  );
}

interface CardProps {
  comp: PopComp;
  /** Equipamento instalado em rack e expandido: botão para recolher (e sem arrastar). */
  onCollapse?: () => void;
  rack?: Rack;
  rackConflict?: boolean;
  diagram: Diagram;
  cableMap: Map<string, Cable>;
  usedEnds: Map<string, unknown>;
  readOnly?: boolean;
  pending: End | null;
  selConn?: { a: End; b: End };
  lit: (e: End) => boolean;
  endLabel: (e: End) => string;
  onDrag: (e: React.PointerEvent) => void;
  onPort: (e: End) => void;
  onMatrix: () => void;
  onLink: () => void;
  onPatch: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

/** Card de OLT, DIO ou equipamento ativo em vista frontal. */
function EquipmentCard({ comp: c, onCollapse, rack, rackConflict, diagram, cableMap, usedEnds, readOnly, pending, selConn, lit, endLabel, onDrag, onPort, onMatrix, onLink, onPatch, onEdit, onDelete }: CardProps) {
  const { w, h } = cardSize(c);
  const linked = c.kind === 'dio' ? linkedCables(diagram, c) : [];
  const fusedCount = c.kind === 'dio' ? Array.from({ length: c.ports }, (_, i) => usedEnds.has(`${c.id}:a${i + 1}`)).filter(Boolean).length : 0;
  const anyUsed = cardPorts(c).some((p) => usedEnds.has(`${c.id}:${p}`)) || fusedCount > 0;
  const icon = c.kind === 'olt' ? <Server size={15} className="text-violet-400" /> : c.kind === 'dio' ? <Box size={15} className="text-sky-400" /> : <NetIcon size={15} className="text-emerald-400" />;
  const tag = [c.modelName, c.kind === 'olt' ? `${c.slots}×${c.ports}` : c.kind === 'dio' ? `${c.ports}P` : c.type].filter(Boolean).join(' · ');
  const mgmt = c.kind === 'dio' ? '' : mgmtLabel(c.mgmt);
  const cap = c.kind === 'active' ? activeCapacity(c) : 0;
  const footLeft = mgmt
    ? mgmt
    : c.kind === 'dio'
      ? `${trays(c.ports)} bandeja${trays(c.ports) > 1 ? 's' : ''}`
      : c.kind === 'olt'
        ? `${c.slots} slot${c.slots > 1 ? 's' : ''} · TX ${c.tx_dbm} dBm`
        : `${c.ports} portas${cap ? ` · ${speedLabel(cap)}` : ''}`;
  const footRight =
    c.kind === 'dio' ? `${fusedCount}/${c.ports} fusões` : c.kind === 'olt' ? (c.lags?.length ? `GPON · ${c.lags.length} LAG` : 'GPON') : c.lags?.length ? `${c.lags.length} LAG` : c.groups?.length ? `${c.groups.length} grupo(s)` : 'ETH';

  return (
    <div
      className={`absolute rounded-lg border bg-slate-900 shadow-xl ${onCollapse ? 'border-amber-500/60 z-10' : 'border-slate-800'}`}
      style={{ left: c.x, top: c.y, width: w, height: h }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Cabeçalho com as ferramentas do equipamento */}
      <div className="absolute inset-x-0 top-0 flex items-center gap-2 px-2.5 border-b border-slate-800 cursor-move" style={{ height: G.HEADER }} onPointerDown={onDrag}>
        <span className={`w-2.5 h-2.5 rounded-full ${anyUsed ? 'bg-emerald-400' : 'bg-slate-600'}`} />
        {icon}
        <span className="text-sm font-semibold truncate min-w-[3rem]" title={c.name}>
          {c.name}
        </span>
        <span className="text-[10px] text-slate-500 truncate min-w-0 shrink-[4]" title={tag}>
          {tag}
        </span>
        <div className="ml-auto flex items-center">
          {onCollapse && (
            <CardBtn title="Recolher no rack" onClick={onCollapse}>
              <Minimize2 size={13} />
            </CardBtn>
          )}
          {c.kind === 'dio' && (
            <CardBtn title="Matriz de fusão" onClick={onMatrix}>
              <Grid3x3 size={14} />
            </CardBtn>
          )}
          {c.kind === 'dio' && !readOnly && (
            <CardBtn title="Vincular cabos" onClick={onLink}>
              <Link2 size={14} />
            </CardBtn>
          )}
          {c.kind !== 'active' && (
            <CardBtn title="Patch (manobra)" onClick={onPatch}>
              <Plug size={14} />
            </CardBtn>
          )}
          {!readOnly && (
            <CardBtn title="Editar" onClick={onEdit}>
              <Pencil size={13} />
            </CardBtn>
          )}
          {!readOnly && (
            <CardBtn title="Excluir" onClick={onDelete} danger>
              <Trash2 size={13} />
            </CardBtn>
          )}
        </div>
      </div>

      {/* Cabos vinculados (DIO) */}
      {c.kind === 'dio' && (
        <div className="absolute inset-x-0 flex items-center gap-1.5 px-2.5 overflow-hidden border-b border-slate-800/60" style={{ top: G.HEADER, height: G.CHIPS }}>
          <Link2 size={12} className="text-slate-500 shrink-0" />
          {linked.length === 0 && <span className="text-[10px] text-slate-500">nenhum cabo vinculado</span>}
          {linked.map((k) => {
            const cable = cableMap.get(k);
            if (!cable) return null;
            return (
              <span key={k} className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold border" style={{ borderColor: `${cable.color}99`, color: cable.color, background: `${cable.color}1a` }}>
                {cable.name}
              </span>
            );
          })}
        </div>
      )}

      {/* Rótulos das linhas */}
      {rowLabels(c).map((r, i) => (
        <div
          key={i}
          className={`absolute flex items-center justify-center rounded font-bold leading-tight text-center overflow-hidden ${r.label.length > 5 ? 'text-[8px]' : 'text-[10px]'} ${r.label === 'UP' ? 'text-amber-400' : c.kind === 'dio' ? 'text-sky-400' : 'text-slate-400'}`}
          title={r.label}
          style={{ left: G.PAD, top: r.y, width: labelW(c) - 6, height: G.PORT, background: '#0f172a' }}
        >
          {r.label}
        </div>
      ))}

      {/* Portas em vista frontal */}
      {cardPorts(c).map((p) => {
        const end: End = { c: c.id, p };
        const box = portBox(c, p);
        const n = Number(p.slice(1));
        const patched = usedEnds.has(`${c.id}:${p}`);
        const src = c.kind === 'dio' ? fusionSource(diagram, c.id, n) : null;
        const dotCable = src ? cableMap.get(src.cable) : undefined;
        // Porta do DIO fundida fica na cor ABNT da fibra (FO1 verde, FO2 amarela...).
        const fiberHex = src && dotCable ? fiberColor(src.fiber, dotCable.fibers_per_tube).hex : undefined;
        const fill = fiberHex ?? (patched ? (c.kind === 'dio' ? PORT_FILL.dio : c.kind === 'active' ? PORT_FILL.active : p.startsWith('u') ? PORT_FILL.up : PORT_FILL.olt) : undefined);
        const frontPatched = !!fiberHex && patched;
        const isPending = !!pending && sameEnd(pending, end);
        const isSel = !!selConn && (sameEnd(selConn.a, end) || sameEnd(selConn.b, end));
        const hot = lit(end) || (c.kind === 'dio' && lit({ c: c.id, p: `a${n}` }));
        const label = c.kind === 'olt' ? (p.startsWith('u') ? String(n) : String(((n - 1) % c.ports) + 1)) : c.kind === 'active' ? String(portGroupOf(c, p)?.index ?? n) : String(n);
        const lag = c.kind !== 'dio' ? lagOf(c, p) : undefined;
        const lagColor = lag && c.kind !== 'dio' ? LAG_COLORS[(c.lags ?? []).indexOf(lag) % LAG_COLORS.length] : undefined;
        const vlan = c.kind !== 'dio' ? vlanSummary(c.portVlans?.[lag ? lagKey(lag) : p]) : '';
        const isMgmt = c.kind !== 'dio' && !!c.mgmt?.iface && c.mgmt.iface === (lag ? lagKey(lag) : p);
        const partnerEnd = diagram.connections.find((k) => sameEnd(k.a, end) || sameEnd(k.b, end));
        const other = partnerEnd ? (sameEnd(partnerEnd.a, end) ? partnerEnd.b : partnerEnd.a) : null;
        const tip = [
          endLabel(end),
          lag ? `Agregação: ${lag.name} (${lag.mode === 'lacp' ? 'LACP' : 'estática'})` : null,
          vlan ? `VLAN: ${vlan}` : null,
          isMgmt ? `Gerência${c.mgmt?.vlan ? ` (VLAN ${c.mgmt.vlan})` : ''}` : null,
          src && dotCable ? `Fusão: ${dotCable.name} · fibra ${src.fiber} (${fiberColor(src.fiber, dotCable.fibers_per_tube).name})${src.splitter ? ' via splitter' : ''}` : null,
          other ? `Cordão: ${endLabel(other)}` : 'Frente livre',
        ]
          .filter(Boolean)
          .join('\n');
        return (
          <button
            key={p}
            title={tip}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onPort(end);
            }}
            className="absolute rounded-[5px] border text-[10px] font-semibold flex items-center justify-center cursor-pointer transition hover:brightness-125"
            style={{
              left: box.x,
              top: box.y,
              width: G.PORT,
              height: G.PORT,
              background: fill ?? '#0b1220',
              color: fill ? textOn(fill) : '#64748b',
              borderColor: hot ? VFL : isPending ? '#fbbf24' : isSel ? '#facc15' : fiberHex ? '#475569' : fill ? fill : '#334155',
              boxShadow: hot
                ? `0 0 10px ${VFL}, inset 0 0 6px ${VFL}`
                : isPending || isSel
                  ? '0 0 0 2px #facc15'
                  : lagColor
                    ? `inset 0 -4px 0 ${lagColor}`
                    : frontPatched
                      ? 'inset 0 -3px 0 #e2e8f0'
                      : undefined,
            }}
          >
            {label}
            {isMgmt && <span className="absolute rounded-sm bg-sky-400 border border-slate-950" title="Gerência" style={{ top: -3, left: -3, width: 8, height: 8 }} />}
            {dotCable && (
              <span
                className="absolute rounded-full border border-slate-950"
                style={{ top: -3, right: -3, width: 9, height: 9, background: dotCable.color }}
              />
            )}
          </button>
        );
      })}

      {/* Rodapé */}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 px-2.5 text-[10px] font-mono text-slate-500 border-t border-slate-800/60" style={{ height: G.FOOT }}>
        <span className="truncate" title={c.kind !== 'dio' && mgmt ? [`Gerência: ${mgmt}`, mgmtPath(c)].filter(Boolean).join(' · ') : undefined}>
          {footLeft}
        </span>
        {rack && (
          <span className={`flex items-center gap-1 truncate ${rackConflict ? 'text-red-400' : 'text-slate-400'}`} title={rackConflict ? 'Posição inválida no rack' : 'Posição no rack'}>
            <Rows4 size={11} />
            {rackCode(rack.loc) || rack.name} · U{c.u}
            {rackHeight(c) > 1 ? `–${c.u! + rackHeight(c) - 1}` : ''}
          </span>
        )}
        <span>{footRight}</span>
      </div>
    </div>
  );
}

interface RackCardProps {
  rack: Rack;
  diagram: Diagram;
  conflicts: Set<string>;
  /** Outro rack tem o mesmo código de endereçamento. */
  duplicate?: boolean;
  /** Rack encontrado pela busca (destaque). */
  highlight?: boolean;
  readOnly?: boolean;
  onDrag: (e: React.PointerEvent) => void;
  /** Instalar equipamento (u = U vazia clicada). */
  onAdd: (u?: number) => void;
  onEdit: () => void;
  onDelete: () => void;
  /** Equipamento expandido agora (os demais ficam recolhidos na faixa). */
  expanded: string[];
  hot: (id: string) => boolean;
  inUse: (id: string) => boolean;
  /** Ações da faixa de cada equipamento instalado. */
  item: Record<'toggle' | 'move' | 'matrix' | 'link' | 'patch' | 'edit' | 'remove', (id: string) => void>;
}

/** Rack em vista frontal: U numeradas (U1 embaixo) e os equipamentos instalados ocupando suas U. */
function RackCard({ rack: r, diagram, conflicts, duplicate, highlight, readOnly, onDrag, onAdd, onEdit, onDelete, expanded, hot, inUse, item }: RackCardProps) {
  const code = rackCode(r.loc);
  const { w, h } = rackSize(r);
  const items = rackItems(diagram, r.id);
  const used = rackUsed(diagram, r.id);
  const occupied = new Set<number>();
  items.forEach((it) => {
    for (let k = 0; k < rackHeight(it); k++) occupied.add(it.u! + k);
  });
  const left = RACK.PAD + RACK.NUM;
  const inner = left + RACK.POST;
  const top = rackUTop(r, r.units);

  return (
    <div
      className={`absolute rounded-lg border bg-slate-900 shadow-xl ${highlight ? 'border-amber-400 ring-4 ring-amber-400/40' : 'border-slate-700'}`}
      style={{ left: r.x, top: r.y, width: w, height: h }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="absolute inset-x-0 top-0 flex items-center gap-2 px-2.5 border-b border-slate-800 cursor-move" style={{ height: RACK.HEADER }} onPointerDown={onDrag}>
        <Rows4 size={15} className="text-amber-400" />
        <span className="text-sm font-semibold truncate">{r.name}</span>
        {code && code !== r.name && <span className="font-mono text-[11px] font-semibold text-emerald-300 shrink-0">{code}</span>}
        {duplicate && (
          <span className="text-[10px] font-semibold text-amber-400 shrink-0" title="Outro rack usa o mesmo endereço">
            duplicado
          </span>
        )}
        <span className="text-[10px] text-slate-500 shrink-0">
          {r.units}U · {RACK_MOUNTS[r.mount].label}
        </span>
        <div className="ml-auto flex items-center">
          {!readOnly && (
            <CardBtn title="Instalar equipamento" onClick={() => onAdd()}>
              <PackagePlus size={14} />
            </CardBtn>
          )}
          {!readOnly && (
            <CardBtn title="Editar rack" onClick={onEdit}>
              <Pencil size={13} />
            </CardBtn>
          )}
          {!readOnly && (
            <CardBtn title="Excluir rack" onClick={onDelete} danger>
              <Trash2 size={13} />
            </CardBtn>
          )}
        </div>
      </div>

      {/* Colunas (montantes) e área útil */}
      <div className="absolute rounded-sm" style={{ left, top, width: RACK.INNER + RACK.POST * 2, height: r.units * RACK.RU, background: '#334155' }} />
      <div className="absolute" style={{ left: inner, top, width: RACK.INNER, height: r.units * RACK.RU, background: '#020617' }} />

      {/* U numeradas e posições vazias (clique para instalar ali) */}
      {Array.from({ length: r.units }, (_, i) => {
        const u = r.units - i;
        const y = rackUTop(r, u);
        return (
          <div key={u}>
            <div className="absolute text-[9px] font-mono text-slate-500 text-right pr-1" style={{ left: RACK.PAD, top: y, width: RACK.NUM, height: RACK.RU, lineHeight: `${RACK.RU}px` }}>
              {u}
            </div>
            {!occupied.has(u) && (
              <button
                title={readOnly ? `U${u} livre` : `U${u} livre · clique para instalar um equipamento aqui`}
                disabled={readOnly}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => onAdd(u)}
                className="absolute border-b border-slate-800/80 hover:bg-emerald-500/15 cursor-pointer disabled:cursor-default disabled:hover:bg-transparent"
                style={{ left: inner, top: y, width: RACK.INNER, height: RACK.RU }}
              />
            )}
          </div>
        );
      })}

      {/* Equipamentos instalados: faixa recolhida com as ferramentas do equipamento; clique expande o card */}
      {items.map((it) => {
        const st = rackStrip(r, it.u!, rackHeight(it));
        const col = KIND_COLOR[it.kind];
        const bad = conflicts.has(it.id);
        const open = expanded.includes(it.id);
        const lit = hot(it.id);
        const fg = textOn(col);
        const detail = [it.modelName, it.kind === 'olt' ? `${it.slots}×${it.ports} PON` : it.kind === 'dio' ? `${it.ports}P` : it.type].filter(Boolean).join(' · ');
        return (
          <div
            key={it.id}
            title={`${it.name} · U${it.u}${rackHeight(it) > 1 ? `–${it.u! + rackHeight(it) - 1}` : ''} (${rackHeight(it)}U)${bad ? '\nPosição inválida: reposicione' : ''}\nClique para ${open ? 'recolher' : 'expandir'}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => item.toggle(it.id)}
            className="absolute flex items-center gap-1 rounded-[3px] pl-1.5 pr-1 text-[10px] font-semibold overflow-hidden cursor-pointer hover:brightness-110"
            style={{
              left: st.x - r.x,
              top: st.y - r.y,
              width: st.w,
              height: st.h,
              background: `linear-gradient(180deg, ${col}, ${col}cc)`,
              color: fg,
              outline: lit ? `2px solid ${VFL}` : bad ? '2px solid #ef4444' : open ? '2px solid #f59e0b' : undefined,
              boxShadow: lit ? `0 0 10px ${VFL}` : undefined,
            }}
          >
            <span className={`w-2 h-2 rounded-full shrink-0 border border-black/30 ${inUse(it.id) ? 'bg-emerald-300' : 'bg-slate-500'}`} />
            <span className="truncate">{it.name}</span>
            <span className="truncate font-normal opacity-75 hidden sm:inline">{detail}</span>
            <span className="ml-auto flex items-center">
              {it.kind === 'dio' && (
                <StripBtn title="Matriz de fusão" onClick={() => item.matrix(it.id)}>
                  <Grid3x3 size={12} />
                </StripBtn>
              )}
              {it.kind === 'dio' && !readOnly && (
                <StripBtn title="Vincular cabos" onClick={() => item.link(it.id)}>
                  <Link2 size={12} />
                </StripBtn>
              )}
              {it.kind !== 'active' && (
                <StripBtn title="Patch (manobra)" onClick={() => item.patch(it.id)}>
                  <Plug size={12} />
                </StripBtn>
              )}
              {!readOnly && (
                <StripBtn title="Posição no rack" onClick={() => item.move(it.id)}>
                  <MoveVertical size={12} />
                </StripBtn>
              )}
              {!readOnly && (
                <StripBtn title="Editar" onClick={() => item.edit(it.id)}>
                  <Pencil size={11} />
                </StripBtn>
              )}
              {!readOnly && (
                <StripBtn title="Excluir" onClick={() => item.remove(it.id)}>
                  <Trash2 size={11} />
                </StripBtn>
              )}
              <StripBtn title={open ? 'Recolher' : 'Expandir'} onClick={() => item.toggle(it.id)}>
                {open ? <Minimize2 size={12} /> : <ChevronsUpDown size={12} />}
              </StripBtn>
            </span>
          </div>
        );
      })}

      {/* Base (rack de piso) */}
      {r.mount === 'floor' && <div className="absolute rounded-sm bg-slate-700" style={{ left: left - 4, top: top + r.units * RACK.RU + 2, width: RACK.INNER + RACK.POST * 2 + 8, height: 6 }} />}

      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between px-2.5 text-[10px] font-mono text-slate-500 border-t border-slate-800/60" style={{ height: RACK.FOOT }}>
        <span>{items.length} equip.</span>
        <span className={used >= r.units ? 'text-amber-400' : undefined}>
          {r.units - used}U livres de {r.units}U
        </span>
      </div>
    </div>
  );
}

/** Botão pequeno da faixa do equipamento no rack (não arrasta nem expande ao clicar). */
function StripBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      title={title}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="w-[18px] h-[18px] rounded flex items-center justify-center cursor-pointer hover:bg-black/25 shrink-0"
    >
      {children}
    </button>
  );
}
