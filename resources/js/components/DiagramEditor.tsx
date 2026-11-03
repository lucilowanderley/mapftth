import {
  Activity,
  Copy,
  Eraser,
  Image,
  Keyboard,
  Layers,
  LayoutGrid,
  Maximize,
  MoveHorizontal,
  Redo2,
  RotateCw,
  Save,
  Server,
  Spline,
  SquareStack,
  Trash2,
  Triangle,
  Undo2,
  Wand2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, errorMessage } from '../lib/api';
import { POWER_COLORS, powerLevel, traceUpstream, type BudgetResult } from '../lib/budget';
import { DIO_SIZES, OLT_MODELS, SPLITTER_MODELS, STATUSES, fiberColor, splitterModel, tubeColor } from '../lib/catalog';
import { cableLetter, curvePath, laneSegment, polylinePath, routeOrthogonal, spliceAnchor, textOn, type Pt } from '../lib/splice';
import { TRAY_CAPACITIES, pruneTrays, toggleTube, trayOfConnection, trayOfFiber, trayUsage, tubeCount, tubeFibers, tubeKey } from '../lib/tray';
import type { Cable, Connection, Diagram, DiagramComponent, End, NetNode, Network, SpliceTray, Status } from '../lib/types';
import { Field, Modal } from './ui';

const ROW = 14;
const HEADER = 34;
const CABLE_W = 150;
const BOX_W = 130;
const SPLIT_W = 56;
/** Leque até os conectores das saídas de um splitter conectorizado. */
const CONN_W = 26;
const HISTORY_MAX = 60;
const ROUTE_KEY = 'mapftth.splice.route';
const TRAY_W = 190;
const TRAY_ROW = 16;

/** Altura do cartão da bandeja (cabeçalho, barra de ocupação e uma linha por tubo). */
const trayHeight = (t: SpliceTray) => HEADER + 14 + Math.max(1, t.tubes.length) * TRAY_ROW + 6;

type RouteStyle = 'ortho' | 'curve';
type Tool = 'fuse' | 'connector' | 'pass';

/** Racks só existem no editor de POP e não entram no diagrama de fusão. */
type BoxComponent = Exclude<DiagramComponent, { kind: 'rack' }>;
type Block = { key: string; kind: 'cable'; cable: Cable; x: number; y: number; side: 'left' | 'right'; label: string; letter: string } | (BoxComponent & { key: string });

interface Port {
  end: End;
  x: number;
  y: number;
  dir: 1 | -1;
  /** Porta virada para cima (-1) ou para baixo (1): splitter girado 90°/270°. */
  vdir?: 1 | -1;
  color: string;
  label: string;
  /** Saída conectorizada (splitter AC APC/UPC): desenhada como conector quadrado. */
  connector?: boolean;
}

// Ids de componentes começam com "k" para nunca colidir com cabos ("c{id}").
const uid = () => `k${Math.random().toString(36).slice(2, 9)}`;
const sameEnd = (a: End, b: End) => a.c === b.c && a.p === b.p;

function blockSize(b: Block): { w: number; h: number } {
  switch (b.kind) {
    case 'cable':
      return { w: CABLE_W, h: HEADER + b.cable.fiber_count * ROW + 6 };
    case 'splitter': {
      const n = splitterModel(b.model).outputs;
      return { w: SPLIT_W, h: Math.max(40, n * ROW + 12) };
    }
    case 'olt':
      return { w: BOX_W, h: HEADER + b.slots * b.ports * ROW + 6 };
    case 'dio':
    case 'active':
      return { w: BOX_W, h: HEADER + b.ports * ROW + 6 };
  }
}

function blockPorts(b: Block): Port[] {
  const { w, h } = blockSize(b);
  switch (b.kind) {
    case 'cable': {
      // As fibras ficam na borda voltada para o centro do diagrama.
      const right = b.side === 'left';
      return Array.from({ length: b.cable.fiber_count }, (_, i) => ({
        end: { c: b.key, p: `f${i + 1}` },
        x: right ? b.x + w : b.x,
        y: b.y + HEADER + (i + 0.5) * ROW,
        dir: right ? 1 : -1,
        color: fiberColor(i + 1, b.cable.fibers_per_tube).hex,
        label: String(i + 1),
      }));
    }
    case 'splitter': {
      // Geometria sem rotação (entrada à esquerda, saídas à direita), girada em torno do centro do bloco.
      const m = splitterModel(b.model);
      const n = m.outputs;
      const top = b.y + (h - n * ROW) / 2;
      const g = splitterFrame(b);
      const outX = b.x + w + (m.connectorized ? CONN_W : 0);
      const make = (p: string, x: number, y: number, ux: number, label: string, connector?: boolean): Port => {
        const r = g.pt(x, y);
        const [vx, vy] = g.vec(ux, 0);
        return {
          end: { c: b.key, p },
          x: r.x,
          y: r.y,
          dir: (vx < 0 ? -1 : 1) as 1 | -1,
          vdir: vy ? ((vy < 0 ? -1 : 1) as 1 | -1) : undefined,
          color: '#334155',
          label,
          connector,
        };
      };
      return [make('in', b.x, b.y + h / 2, -1, 'E'), ...Array.from({ length: n }, (_, i) => make(`o${i + 1}`, outX, top + (i + 0.5) * ROW, 1, String(i + 1), m.connectorized))];
    }
    case 'olt':
      return Array.from({ length: b.slots * b.ports }, (_, i) => ({
        end: { c: b.key, p: `p${i + 1}` },
        x: b.x + w,
        y: b.y + HEADER + (i + 0.5) * ROW,
        dir: 1,
        color: '#7c3aed',
        label: `${Math.floor(i / b.ports) + 1}/${(i % b.ports) + 1}`,
      }));
    case 'dio':
      return Array.from({ length: b.ports }, (_, i) => [
        // Lado "b" (conector, cordão para a OLT) à esquerda; lado "a" (fusão com o cabo) à direita.
        { end: { c: b.key, p: `b${i + 1}` }, x: b.x, y: b.y + HEADER + (i + 0.5) * ROW, dir: -1 as const, color: '#0ea5e9', label: String(i + 1) },
        { end: { c: b.key, p: `a${i + 1}` }, x: b.x + w, y: b.y + HEADER + (i + 0.5) * ROW, dir: 1 as const, color: '#0ea5e9', label: String(i + 1) },
      ]).flat();
    case 'active':
      // Equipamentos ativos só existem no editor de POP.
      return [];
  }
}

/** Rotação do splitter (0, 90, 180, 270) e funções para girar pontos/vetores em torno do centro do bloco. */
function splitterFrame(b: Extract<Block, { kind: 'splitter' }>) {
  const { w, h } = blockSize(b);
  const m = splitterModel(b.model);
  const W = w + (m.connectorized ? CONN_W : 0);
  const rot = ((((b.rot ?? 0) % 360) + 360) % 360) as 0 | 90 | 180 | 270;
  const cx = b.x + W / 2;
  const cy = b.y + h / 2;
  const vec = (dx: number, dy: number): [number, number] => {
    switch (rot) {
      case 90:
        return [-dy, dx];
      case 180:
        return [-dx, -dy];
      case 270:
        return [dy, -dx];
      default:
        return [dx, dy];
    }
  };
  const pt = (x: number, y: number) => {
    const [dx, dy] = vec(x - cx, y - cy);
    return { x: cx + dx, y: cy + dy };
  };
  const vertical = rot === 90 || rot === 270;
  // Caixa já girada (para seleção e rótulo).
  const box = { x: cx - (vertical ? h : W) / 2, y: cy - (vertical ? W : h) / 2, w: vertical ? h : W, h: vertical ? W : h };
  return { rot, cx, cy, W, vec, pt, box };
}

function emptyDiagram(): Diagram {
  return { components: [], cablePos: {}, connections: [] };
}

interface Props {
  node: NetNode;
  network: Network;
  onClose: () => void;
  onSaved: (n: NetNode) => void;
  onShowBudget: (title: string, result: BudgetResult) => void;
  /** Acesso de leitura: permite explorar o diagrama, mas não salvar. */
  readOnly?: boolean;
}

export default function DiagramEditor({ node, network, onClose, onSaved, onShowBudget, readOnly }: Props) {
  const [diagram, setDiagram] = useState<Diagram>(() => structuredClone(node.diagram ?? emptyDiagram()));
  const [status, setStatus] = useState<Status>(node.status);
  const [dirty, setDirty] = useState(false);
  const [view, setView] = useState({ x: 40, y: 40, k: 1 });
  const [pending, setPending] = useState<End | null>(null);
  const [selected, setSelected] = useState<{ kind: 'conn' | 'block' | 'tray'; key: string } | null>(null);
  const [dialog, setDialog] = useState<'splitter' | 'olt' | 'dio' | 'auto' | 'trays' | null>(null);
  const [trayFocus, setTrayFocus] = useState<string | null>(null);
  const [showPower, setShowPower] = useState(true);
  const [tool, setTool] = useState<Tool>('fuse');
  const [route, setRoute] = useState<RouteStyle>(() => {
    try {
      return localStorage.getItem(ROUTE_KEY) === 'curve' ? 'curve' : 'ortho';
    } catch {
      return 'ortho';
    }
  });
  const [showHelp, setShowHelp] = useState(false);
  const [error, setError] = useState('');
  // Desfazer / refazer (Ctrl+Z / Ctrl+Y): fotos do diagrama antes de cada alteração.
  const past = useRef<Diagram[]>([]);
  const future = useRef<Diagram[]>([]);
  const [, setHistoryTick] = useState(0);
  const svgRef = useRef<SVGSVGElement>(null);
  const contentRef = useRef<SVGGElement>(null);
  const drag = useRef<{ key?: string; lane?: string; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);

  const cables = useMemo(() => network.cables.filter((c) => c.from_node_id === node.id || c.to_node_id === node.id), [network.cables, node.id]);
  const nodeName = (id: number | null) => network.nodes.find((n) => n.id === id)?.name ?? 'ponta solta';

  const remember = (d: Diagram) => {
    past.current = [...past.current.slice(-(HISTORY_MAX - 1)), structuredClone(d)];
    future.current = [];
    setHistoryTick((t) => t + 1);
  };

  const update = (fn: (d: Diagram) => Diagram) => {
    remember(diagram);
    setDiagram((d) => fn(structuredClone(d)));
    setDirty(true);
  };

  function undo() {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(structuredClone(diagram));
    setDiagram(prev);
    setDirty(true);
    setSelected(null);
    setPending(null);
    setHistoryTick((t) => t + 1);
  }

  function redo() {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(structuredClone(diagram));
    setDiagram(next);
    setDirty(true);
    setSelected(null);
    setHistoryTick((t) => t + 1);
  }

  function resetLane(id: string) {
    update((d) => ({ ...d, connections: d.connections.map((c) => (c.id === id ? (({ lane: _l, ...rest }) => rest)(c) : c)) }));
  }

  function changeRoute(r: RouteStyle) {
    setRoute(r);
    try {
      localStorage.setItem(ROUTE_KEY, r);
    } catch {
      /* sem localStorage: vale só nesta sessão */
    }
  }

  // Blocos: cabos que chegam na caixa + componentes do diagrama.
  const blocks: Block[] = useMemo(() => {
    let leftY = 0;
    let rightY = 0;
    const cableBlocks = cables.map((c, i) => {
      const key = `c${c.id}`;
      const incoming = c.to_node_id === node.id;
      const pos = diagram.cablePos[key];
      const side = pos?.side ?? (incoming ? 'left' : 'right');
      const h = HEADER + c.fiber_count * ROW + 30;
      const auto = side === 'left' ? { x: 0, y: (leftY += h) - h } : { x: 520, y: (rightY += h) - h };
      return {
        key,
        kind: 'cable' as const,
        cable: c,
        x: pos?.x ?? auto.x,
        y: pos?.y ?? auto.y,
        side,
        label: incoming ? `de ${nodeName(c.from_node_id)}` : `para ${nodeName(c.to_node_id)}`,
        letter: cableLetter(i),
      };
    });
    return [...cableBlocks, ...diagram.components.filter((c): c is BoxComponent => c.kind !== 'rack').map((c) => ({ ...c, key: c.id }))];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cables, diagram, node.id]);

  const ports = useMemo(() => blocks.flatMap(blockPorts), [blocks]);
  const portOf = (e: End) => ports.find((p) => sameEnd(p.end, e));
  const validConnections = diagram.connections.filter((c) => portOf(c.a) && portOf(c.b));
  const connectedTo = (e: End) => validConnections.find((c) => sameEnd(c.a, e) || sameEnd(c.b, e));

  // Rede com o diagrama em edição, para calcular potência em tempo real.
  const liveNetwork: Network = useMemo(
    () => ({ ...network, nodes: network.nodes.map((n) => (n.id === node.id ? { ...n, diagram } : n)) }),
    [network, node.id, diagram],
  );
  const powerAt = (e: End) => traceUpstream(liveNetwork, node.id, e);

  const splitterPower = useMemo(() => {
    const map = new Map<string, BudgetResult>();
    if (!showPower) return map;
    diagram.components
      .filter((c) => c.kind === 'splitter')
      .forEach((s) => {
        const n = splitterModel((s as { model: string }).model).outputs;
        for (let i = 1; i <= n; i++) map.set(`${s.id}:o${i}`, traceUpstream(liveNetwork, node.id, { c: s.id, p: `o${i}` }));
      });
    return map;
  }, [diagram, liveNetwork, node.id, showPower]);

  // ---------- Interação ----------
  const toWorld = (clientX: number, clientY: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: (clientX - r.left - view.x) / view.k, y: (clientY - r.top - view.y) / view.k };
  };

  function onPointerDown(e: React.PointerEvent, key?: string) {
    if (e.button !== 0) return;
    e.stopPropagation();
    const b = key ? (blocks.find((x) => x.key === key) ?? diagram.trays?.find((t) => t.id === key)) : undefined;
    drag.current = { key, sx: e.clientX, sy: e.clientY, ox: b ? b.x : view.x, oy: b ? b.y : view.y, moved: false };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) > 3) {
      d.moved = true;
      if (d.key || d.lane) remember(diagram);
    }
    if (!d.moved) return;
    if (d.lane) {
      const id = d.lane;
      const x = Math.round((d.ox + dx / view.k) / 2) * 2;
      setDiagram((dg) => ({ ...dg, connections: dg.connections.map((c) => (c.id === id ? { ...c, lane: x } : c)) }));
      setDirty(true);
      return;
    }
    if (!d.key) {
      setView((v) => ({ ...v, x: d.ox + dx, y: d.oy + dy }));
      return;
    }
    const nx = Math.round((d.ox + dx / view.k) / 2) * 2;
    const ny = Math.round((d.oy + dy / view.k) / 2) * 2;
    const key = d.key;
    setDiagram((dg) => {
      const next = { ...dg };
      if (dg.trays?.some((t) => t.id === key)) {
        next.trays = dg.trays.map((t) => (t.id === key ? { ...t, x: nx, y: ny } : t));
      } else if (key.startsWith('c') && !dg.components.some((c) => c.id === key)) {
        const side = blocks.find((b) => b.key === key && b.kind === 'cable') as { side: 'left' | 'right' } | undefined;
        next.cablePos = { ...dg.cablePos, [key]: { ...dg.cablePos[key], side: side?.side, x: nx, y: ny } };
      } else {
        next.components = dg.components.map((c) => (c.id === key ? { ...c, x: nx, y: ny } : c));
      }
      return next;
    });
    setDirty(true);
  }

  function onPointerUp() {
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved && !d.lane) {
      if (d.key) setSelected({ kind: diagram.trays?.some((t) => t.id === d.key) ? 'tray' : 'block', key: d.key });
      else {
        setSelected(null);
        setPending(null);
      }
    }
  }

  function onWheel(e: React.WheelEvent) {
    const r = svgRef.current!.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    const k = Math.min(3, Math.max(0.25, view.k * (e.deltaY < 0 ? 1.1 : 0.9)));
    setView((v) => ({ k, x: mx - ((mx - v.x) / v.k) * k, y: my - ((my - v.y) / v.k) * k }));
  }

  function clickPort(e: React.MouseEvent, port: Port) {
    e.stopPropagation();
    const existing = connectedTo(port.end);
    if (!pending) {
      if (existing) setSelected({ kind: 'conn', key: existing.id });
      else setPending(port.end);
      return;
    }
    if (sameEnd(pending, port.end)) {
      setPending(null);
      return;
    }
    if (pending.c === port.end.c) {
      setError('Não é possível ligar duas portas do mesmo elemento.');
      setPending(null);
      return;
    }
    if (existing) {
      setError('Essa porta já está conectada. Remova a conexão atual antes.');
      setPending(null);
      return;
    }
    const a = pending;
    const extra: Partial<Connection> = tool === 'pass' ? { pass: true } : tool === 'connector' ? { joint: 'connector' } : {};
    update((d) => ({ ...d, connections: [...d.connections.filter((c) => portOf(c.a) && portOf(c.b)), { id: uid(), a, b: port.end, ...extra }] }));
    setPending(null);
    setError('');
  }

  function removeSelected() {
    if (!selected) return;
    if (selected.kind === 'conn') {
      update((d) => ({ ...d, connections: d.connections.filter((c) => c.id !== selected.key) }));
    } else if (selected.kind === 'tray') {
      // A bandeja sai; as emendas continuam (só deixam de estar vinculadas a ela).
      update((d) => ({ ...d, trays: (d.trays ?? []).filter((t) => t.id !== selected.key) }));
    } else if (diagram.components.some((c) => c.id === selected.key)) {
      update((d) => ({
        ...d,
        components: d.components.filter((c) => c.id !== selected.key),
        connections: d.connections.filter((c) => c.a.c !== selected.key && c.b.c !== selected.key),
      }));
    } else {
      // Cabo: só remove as fusões (o cabo em si é excluído no mapa).
      if (!confirm('Remover todas as fusões deste cabo nesta caixa?')) return;
      update((d) => ({ ...d, connections: d.connections.filter((c) => c.a.c !== selected.key && c.b.c !== selected.key) }));
    }
    setSelected(null);
  }

  /** Girar: no cabo, troca o lado das fibras; no splitter, espelha (entrada ↔ saídas). */
  function rotateSelected() {
    const b = selected?.kind === 'block' ? blocks.find((x) => x.key === selected.key) : undefined;
    if (!b) {
      setError('Selecione um cabo ou splitter para girar.');
      return;
    }
    if (b.kind === 'cable') {
      update((d) => ({ ...d, cablePos: { ...d.cablePos, [b.key]: { x: b.x, y: b.y, side: b.side === 'left' ? 'right' : 'left' } } }));
    } else if (b.kind === 'splitter') {
      // Gira 90° no sentido horário a cada clique.
      update((d) => ({ ...d, components: d.components.map((c) => (c.id === b.key && c.kind === 'splitter' ? { ...c, rot: (((c.rot ?? 0) + 90) % 360) } : c)) }));
    }
  }

  function duplicateSelected() {
    const c = selected?.kind === 'block' ? diagram.components.find((x) => x.id === selected.key) : undefined;
    if (!c || c.kind !== 'splitter') {
      setError('Selecione um splitter para duplicar.');
      return;
    }
    const copy = { ...c, id: uid(), name: undefined, x: c.x + 30, y: c.y + blockSize({ ...c, key: c.id }).h + 30 };
    update((d) => ({ ...d, components: [...d.components, copy] }));
    setSelected({ kind: 'block', key: copy.id });
  }

  function clearConnections() {
    if (!validConnections.length) return;
    if (!confirm(`Remover todas as ${validConnections.length} fusões/passagens desta caixa? (Dá para desfazer com Ctrl+Z.)`)) return;
    update((d) => ({ ...d, connections: [] }));
    setSelected(null);
  }

  /** Organizar: cabos de entrada à esquerda, de saída à direita, splitters numa fileira acima. */
  function organize() {
    const cableBlocks = blocks.filter((b): b is Extract<Block, { kind: 'cable' }> => b.kind === 'cable');
    const splitters = diagram.components.filter((c) => c.kind === 'splitter');
    const gapX = Math.max(300, 80 + validConnections.length * 7);
    const cablePos: Diagram['cablePos'] = {};
    let ly = 0;
    let ry = 0;
    cableBlocks.forEach((b) => {
      const h = blockSize(b).h + 30;
      if (b.side === 'left') {
        cablePos[b.key] = { x: 0, y: ly, side: 'left' };
        ly += h;
      } else {
        cablePos[b.key] = { x: CABLE_W + gapX, y: ry, side: 'right' };
        ry += h;
      }
    });
    const maxH = Math.max(0, ...splitters.map((c) => blockSize({ ...c, key: c.id }).h));
    const pos = new Map<string, { x: number; y: number }>();
    splitters.forEach((c, i) => {
      const h = blockSize({ ...c, key: c.id }).h;
      pos.set(c.id, { x: CABLE_W + 60 + i * (SPLIT_W + CONN_W + 90), y: -60 - maxH + (maxH - h) / 2 });
    });
    // Bandejas empilhadas abaixo dos cabos, no meio: as linhas dos tubos chegam pelos dois lados sem cruzar cartões.
    let trayY = Math.max(ly, ry) + 20;
    const trayX = (CABLE_W + gapX + CABLE_W) / 2 - TRAY_W / 2;
    const trayPos = new Map(
      (diagram.trays ?? []).map((t) => {
        const pos = { x: trayX, y: trayY };
        trayY += trayHeight(t) + 24;
        return [t.id, pos];
      }),
    );
    // Os ajustes manuais das pistas deixam de fazer sentido com os blocos em outro lugar: voltam ao automático.
    update((d) => ({
      ...d,
      trays: d.trays?.map((t) => ({ ...t, ...trayPos.get(t.id) })),
      cablePos,
      components: d.components.map((c) => (pos.has(c.id) ? { ...c, ...pos.get(c.id)! } : c)),
      connections: d.connections.map(({ lane: _l, ...c }) => c),
    }));
    setTimeout(fit, 30);
  }

  function addComponent(c: DiagramComponent) {
    const r = svgRef.current?.getBoundingClientRect();
    const center = r ? toWorld(r.left + r.width / 2, r.top + r.height / 3) : { x: 260, y: 40 };
    update((d) => ({ ...d, components: [...d.components, { ...c, x: Math.round(center.x), y: Math.round(center.y) }] }));
    setDialog(null);
  }

  function autoFuse(fromKey: string, toKey: string, offset: number) {
    const from = blocks.find((b) => b.key === fromKey);
    const to = blocks.find((b) => b.key === toKey);
    if (!from || !to) return;
    const fromPorts = blockPorts(from).filter((p) => p.end.p.startsWith('f'));
    const toPorts = blockPorts(to).filter((p) => p.end.p.startsWith(to.kind === 'dio' ? 'a' : 'f'));
    const created: Connection[] = [];
    fromPorts.forEach((fp, i) => {
      const tp = toPorts[i + offset];
      if (!tp || connectedTo(fp.end) || connectedTo(tp.end)) return;
      created.push({ id: uid(), a: fp.end, b: tp.end });
    });
    update((d) => ({ ...d, connections: [...d.connections, ...created] }));
    setDialog(null);
    setError(created.length ? '' : 'Nenhuma fusão criada: as fibras já estão ocupadas.');
  }

  async function save(close: boolean) {
    try {
      const trays = diagram.trays?.length ? pruneTrays(diagram.trays, cables) : undefined;
      const r = await api.updateNode(node.id, { diagram: { ...diagram, connections: validConnections, trays }, status });
      onSaved(r.node);
      setDirty(false);
      if (close) onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  function requestClose() {
    if (dirty && !readOnly && !confirm('Há alterações não salvas. Deseja sair sem salvar?')) return;
    onClose();
  }

  function fit() {
    const g = contentRef.current;
    const svg = svgRef.current;
    if (!g || !svg) return;
    const bb = g.getBBox();
    const r = svg.getBoundingClientRect();
    if (!bb.width || !bb.height) return;
    const k = Math.min(2, Math.max(0.25, Math.min((r.width - 80) / bb.width, (r.height - 80) / bb.height)));
    setView({ k, x: (r.width - bb.width * k) / 2 - bb.x * k, y: (r.height - bb.height * k) / 2 - bb.y * k });
  }

  useEffect(() => {
    const t = setTimeout(fit, 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea,select')) return;
      if (readOnly) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        duplicateSelected();
        return;
      }
      if (mod) return;
      if (e.key === 'Delete' || e.key === 'Backspace') removeSelected();
      else if (e.key === 'r' || e.key === 'R') rotateSelected();
      else if (e.key === 'f' || e.key === 'F') setTool('fuse');
      else if (e.key === 'p' || e.key === 'P') setTool('pass');
      else if (e.key === 'c' || e.key === 'C') setTool('connector');
      else if (e.key === 's' || e.key === 'S') setDialog('splitter');
      else if (e.key === 'b' || e.key === 'B') setDialog('trays');
      else if (e.key === '?') setShowHelp((v) => !v);
      if (e.key === 'Escape') {
        setPending(null);
        setSelected(null);
        setShowHelp(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function exportPng() {
    const g = contentRef.current;
    if (!g) return;
    const bb = g.getBBox();
    const pad = 40;
    const titleH = 70;
    const legendH = 50;
    const w = Math.ceil(bb.width + pad * 2);
    const h = Math.ceil(bb.height + pad * 2 + titleH + legendH);
    const legend = Array.from({ length: 12 }, (_, i) => {
      const c = fiberColor(i + 1);
      return `<g transform="translate(${pad + i * 70},${h - 30})"><circle r="6" cx="6" cy="0" fill="${c.hex}" stroke="#334155"/><text x="16" y="4" font-size="11" fill="#334155">${i + 1} ${c.name}</text></g>`;
    }).join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" font-family="Arial, sans-serif">
      <rect width="100%" height="100%" fill="#ffffff"/>
      <rect x="0" y="0" width="${w}" height="${titleH - 14}" fill="#0f172a"/>
      <text x="${pad}" y="34" font-size="20" font-weight="bold" fill="#ffffff">${node.name} · Diagrama unifilar</text>
      <text x="${w - pad}" y="34" font-size="12" fill="#94a3b8" text-anchor="end">${new Date().toLocaleString('pt-BR')} · ${node.lat.toFixed(6)}, ${node.lng.toFixed(6)} · ${STATUSES[status].label}</text>
      <g transform="translate(${pad - bb.x},${titleH + pad - bb.y})">${g.innerHTML}</g>
      ${legend}
    </svg>`;
    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = w * 2;
      canvas.height = h * 2;
      const ctx = canvas.getContext('2d')!;
      ctx.scale(2, 2);
      ctx.drawImage(img, 0, 0);
      const a = document.createElement('a');
      a.download = `${node.name.replace(/[^\w-]+/g, '_')}_unifilar.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
    };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  // ---------- Renderização ----------
  const pendingPort = pending ? portOf(pending) : undefined;
  const pendingPower = pending ? powerAt(pending) : null;
  const isPop = node.type === 'pop';
  const selBlock = selected?.kind === 'block' ? blocks.find((b) => b.key === selected.key) : undefined;
  const selConn = selected?.kind === 'conn' ? validConnections.find((c) => c.id === selected.key) : undefined;
  const isCablePort = (p: Port) => p.end.c.startsWith('c') && p.end.p.startsWith('f') && !diagram.components.some((c) => c.id === p.end.c);
  const describe = (e: End) => {
    const b = blocks.find((x) => x.key === e.c);
    if (!b) return e.p;
    if (b.kind === 'cable') {
      const t = trayOfFiber(diagram, cables, e.c, e.p);
      return `Cabo ${b.letter} · FO ${e.p.slice(1)} ${fiberColor(Number(e.p.slice(1)), b.cable.fibers_per_tube).name}${t ? ` · ${t.name}` : ''}`;
    }
    if (b.kind === 'splitter') return `${b.name || splitterModel(b.model).name} · ${e.p === 'in' ? 'entrada' : `saída ${e.p.slice(1)}`}`;
    return `${b.name} · ${e.p}`;
  };

  // Bandejas: ocupação e linhas tracejadas do tubo loose (borda externa do cabo) até a linha dele na bandeja.
  const trays = diagram.trays ?? [];
  const usage = trayUsage({ trays, connections: validConnections }, cables);
  const cableBlockOf = (key: string) => blocks.find((b): b is Extract<Block, { kind: 'cable' }> => b.kind === 'cable' && b.key === key);
  const tubeLinks = (() => {
    const reqs: { id: string; color: string; a: { x: number; y: number; dir: 1 | -1 }; b: { x: number; y: number; dir: 1 | -1 } }[] = [];
    trays.forEach((t) =>
      t.tubes.forEach((key, j) => {
        const [ck, tn] = key.split(':t');
        const b = cableBlockOf(ck);
        if (!b) return;
        const [f1, f2] = tubeFibers(Number(tn), b.cable);
        const sx = b.side === 'left' ? b.x : b.x + CABLE_W;
        const sy = b.y + HEADER + ((f1 - 1 + f2) / 2) * ROW;
        const ty = t.y + HEADER + 14 + (j + 0.5) * TRAY_ROW;
        const toLeft = sx < t.x + TRAY_W / 2;
        reqs.push({
          id: `${t.id}|${key}`,
          color: tubeColor(f1, b.cable.fibers_per_tube).hex,
          a: { x: sx, y: sy, dir: b.side === 'left' ? -1 : 1 },
          b: { x: toLeft ? t.x : t.x + TRAY_W, y: ty, dir: toLeft ? -1 : 1 },
        });
      }),
    );
    const r = routeOrthogonal(reqs, { stub: 14, gap: 4 });
    return reqs.map((q) => ({ ...q, pts: r.get(q.id)! }));
  })();

  // Rotas das fibras: em ângulo reto (padrão, uma pista por fibra) ou em curva.
  const routes = useMemo(() => {
    if (route !== 'ortho') return new Map<string, Pt[]>();
    return routeOrthogonal(
      validConnections.map((c) => {
        const a = portOf(c.a)!;
        const b = portOf(c.b)!;
        return { id: c.id, a: { x: a.x, y: a.y, dir: a.dir, vdir: a.vdir }, b: { x: b.x, y: b.y, dir: b.dir, vdir: b.vdir }, lane: c.lane };
      }),
      { stub: 16, gap: 6 },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, ports, diagram.connections]);

  return (
    <div className="fixed inset-0 z-[1500] flex flex-col bg-slate-900">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-slate-800">
        <div className="font-semibold mr-2">
          {node.name} <span className="text-slate-400 font-normal text-sm">· {isPop ? 'Editor do POP' : 'Diagrama de fusão'}</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={requestClose} className="text-slate-400 hover:text-white cursor-pointer ml-2" aria-label="Fechar">
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Barra de ferramentas */}
      <div className="flex flex-wrap items-center gap-1 px-3 py-1.5 bg-white border-b border-slate-200 text-slate-700">
        {!readOnly && (
          <>
            <IconTool icon={<Undo2 size={16} />} label="Desfazer (Ctrl+Z)" onClick={undo} disabled={!past.current.length} />
            <IconTool icon={<Redo2 size={16} />} label="Refazer (Ctrl+Y)" onClick={redo} disabled={!future.current.length} />
            <Sep />
          </>
        )}
        <IconTool icon={<SpliceIcon />} label="Emenda / fusão (F): clique numa porta e depois em outra" text="Emenda" active={tool === 'fuse'} onClick={() => setTool('fuse')} />
        <IconTool icon={<ConnectorIcon />} label="Emenda por conector / acoplador (C): soma a perda de conector no orçamento" text="Conector" active={tool === 'connector'} onClick={() => setTool('connector')} />
        <IconTool icon={<MoveHorizontal size={16} />} label="Passagem sem fusão (P): a fibra atravessa a caixa sem emenda e sem perda" text="Passagem" active={tool === 'pass'} onClick={() => setTool('pass')} />
        <IconTool icon={<Triangle size={15} className="-rotate-90" />} label="Adicionar splitter (S)" text="Splitter" onClick={() => setDialog('splitter')} />
        {isPop && <IconTool icon={<Server size={16} />} label="Adicionar OLT" text="OLT" onClick={() => setDialog('olt')} />}
        {isPop && <IconTool icon={<SquareStack size={16} />} label="Adicionar DIO" text="DIO" onClick={() => setDialog('dio')} />}
        <IconTool icon={<Wand2 size={16} />} label="Auto-fusão: funde as fibras em sequência entre dois cabos" onClick={() => setDialog('auto')} />
        <IconTool
          icon={<Layers size={16} />}
          label="Bandejas de emenda (B): criar bandejas e vincular os tubos loose dos cabos"
          text={`Bandejas${diagram.trays?.length ? ` (${diagram.trays.length})` : ''}`}
          onClick={() => {
            setTrayFocus(selected?.kind === 'tray' ? selected.key : null);
            setDialog('trays');
          }}
        />
        <Sep />
        <IconTool icon={<RotateCw size={16} />} label="Girar o selecionado (R): cabo troca de lado, splitter espelha" onClick={rotateSelected} disabled={!selBlock || (selBlock.kind !== 'cable' && selBlock.kind !== 'splitter')} />
        <IconTool icon={<Copy size={16} />} label="Duplicar splitter (Ctrl+D)" onClick={duplicateSelected} disabled={selBlock?.kind !== 'splitter'} />
        <IconTool
          icon={<Trash2 size={16} />}
          label={selConn ? (selConn.pass ? 'Apagar passagem (Delete)' : 'Apagar emenda (Delete)') : selBlock?.kind === 'cable' ? 'Apagar as emendas deste cabo (Delete)' : 'Apagar o selecionado (Delete)'}
          onClick={removeSelected}
          disabled={!selected}
          danger
        />
        <IconTool icon={<Eraser size={16} />} label="Limpar todas as emendas e passagens" onClick={clearConnections} disabled={!validConnections.length} danger />
        <Sep />
        <IconTool icon={<LayoutGrid size={16} />} label="Organizar: cabos lado a lado e splitters acima" onClick={organize} />
        <IconTool
          icon={<Spline size={16} />}
          label={route === 'ortho' ? 'Rotas em ângulo reto (clique para curvas)' : 'Rotas em curva (clique para ângulo reto)'}
          active={route === 'curve'}
          onClick={() => changeRoute(route === 'ortho' ? 'curve' : 'ortho')}
        />
        <IconTool icon={<Activity size={16} />} label="Mostrar potência (dBm) nas saídas" active={showPower} onClick={() => setShowPower((v) => !v)} />
        <IconTool icon={<Keyboard size={16} />} label="Atalhos do teclado (?)" active={showHelp} onClick={() => setShowHelp((v) => !v)} />
        <div className="ml-auto flex items-center gap-1">
          <IconTool icon={<Image size={16} />} label="Exportar unifilar em PNG" text="PNG" onClick={exportPng} />
        </div>
      </div>

      {/* Canvas */}
      <div className="relative flex-1 min-h-0">
        <svg
          ref={svgRef}
          className="w-full h-full select-none touch-none"
          style={{ background: '#f1f5f9', cursor: drag.current && !drag.current.key ? 'grabbing' : 'default' }}
          onPointerDown={(e) => onPointerDown(e)}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onWheel={onWheel}
        >
          <defs>
            <pattern id="grid" width={20 * view.k} height={20 * view.k} patternUnits="userSpaceOnUse" x={view.x} y={view.y}>
              <circle cx={1} cy={1} r={1} fill="#cbd5e1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
          <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
            <g ref={contentRef}>
              {/* Conexões */}
              {validConnections.map((c) => {
                const a = portOf(c.a)!;
                const b = portOf(c.b)!;
                const aCable = isCablePort(a);
                const cablePort = aCable ? a : isCablePort(b) ? b : undefined;
                const color = cablePort?.color ?? '#334155';
                const pts = routes.get(c.id);
                const d = pts ? polylinePath(pts) : curvePath(a, b);
                const isSel = selected?.kind === 'conn' && selected.key === c.id;
                // Emenda desenhada sobre a fibra, perto da ponta do cabo (fibras vizinhas ficam em coluna).
                const splice = !c.pass ? (pts ? spliceAnchor(pts, aCable || !cablePort ? 'a' : 'b') : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, vertical: false }) : null;
                return (
                  <g
                    key={c.id}
                    className="cursor-pointer"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelected({ kind: 'conn', key: c.id });
                    }}
                  >
                    <path d={d} fill="none" stroke="transparent" strokeWidth={10} />
                    <path d={d} fill="none" stroke={isSel ? '#facc15' : '#0f172a'} strokeWidth={isSel ? 6 : 4} strokeOpacity={isSel ? 1 : 0.55} strokeLinejoin="round" />
                    <path d={d} fill="none" stroke={color} strokeWidth={2.4} strokeDasharray={c.pass ? '6 4' : undefined} strokeLinejoin="round" />
                    {splice && (c.joint === 'connector' ? <ConnectorMark x={splice.x} y={splice.y} vertical={splice.vertical} selected={isSel} /> : <SpliceMark x={splice.x} y={splice.y} vertical={splice.vertical} selected={isSel} />)}
                  </g>
                );
              })}

              {/* Ajuste do traçado em 90°: arraste a pista vertical da fibra selecionada. */}
              {selConn &&
                !readOnly &&
                (() => {
                  const pts = routes.get(selConn.id);
                  const seg = pts && laneSegment(pts);
                  if (!seg) return null;
                  const my = (seg.y1 + seg.y2) / 2;
                  return (
                    <g
                      className="cursor-ew-resize"
                      onPointerDown={(e) => {
                        if (e.button !== 0) return;
                        e.stopPropagation();
                        drag.current = { lane: selConn.id, sx: e.clientX, sy: e.clientY, ox: seg.x, oy: 0, moved: false };
                        (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        resetLane(selConn.id);
                      }}
                    >
                      <title>Arraste para ajustar o traçado (duplo clique volta ao automático)</title>
                      <line x1={seg.x} y1={seg.y1} x2={seg.x} y2={seg.y2} stroke="transparent" strokeWidth={12} />
                      <rect x={seg.x - 7} y={my - 11} width={14} height={22} rx={4} fill="#ffffff" stroke="#eab308" strokeWidth={2} />
                      <path d={`M${seg.x - 3.5},${my - 4} l-2,4 l2,4 M${seg.x + 3.5},${my - 4} l2,4 l-2,4`} fill="none" stroke="#0f172a" strokeWidth={1.3} />
                    </g>
                  );
                })()}

              {/* Tubos loose vinculados às bandejas */}
              {tubeLinks.map((l) => {
                const d = polylinePath(l.pts);
                return (
                  <g key={l.id} className="pointer-events-none">
                    <path d={d} fill="none" stroke="#0f172a" strokeOpacity={0.45} strokeWidth={4} strokeLinejoin="round" />
                    <path d={d} fill="none" stroke={l.color} strokeWidth={2.4} strokeDasharray="7 3" strokeLinejoin="round" />
                  </g>
                );
              })}

              {/* Blocos */}
              {blocks.map((b) => (
                <BlockView
                  key={b.key}
                  showTubes={trays.length > 0}
                  block={b}
                  selected={selected?.kind === 'block' && selected.key === b.key}
                  onPointerDown={(e) => onPointerDown(e, b.key)}
                />
              ))}

              {/* Bandejas */}
              {trays.map((t) => (
                <TrayCard
                  key={t.id}
                  tray={t}
                  used={usage.get(t.id) ?? 0}
                  rows={t.tubes.map((key) => {
                    const [ck, tn] = key.split(':t');
                    const b = cableBlockOf(ck);
                    if (!b) return { key, color: '#cbd5e1', text: 'Cabo fora da caixa' };
                    const [f1, f2] = tubeFibers(Number(tn), b.cable);
                    const tc = tubeColor(f1, b.cable.fibers_per_tube);
                    return { key, color: tc.hex, text: `Cabo ${b.letter} · Tubo ${tn} ${tc.name} · FO ${f1}–${f2}` };
                  })}
                  selected={selected?.kind === 'tray' && selected.key === t.id}
                  onPointerDown={(e) => onPointerDown(e, t.id)}
                  onDoubleClick={() => {
                    setTrayFocus(t.id);
                    setDialog('trays');
                  }}
                />
              ))}

              {/* Portas */}
              {ports.map((p) => {
                const isPending = pending && sameEnd(pending, p.end);
                const linked = !!connectedTo(p.end);
                const cablePort = isCablePort(p);
                return (
                  <g key={`${p.end.c}:${p.end.p}`} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => clickPort(e, p)} className="cursor-pointer">
                    <title>{describe(p.end)}</title>
                    <circle cx={p.x} cy={p.y} r={8} fill="transparent" />
                    {p.connector ? (
                      <rect
                        x={p.x - (isPending ? 5.5 : 4.5)}
                        y={p.y - (isPending ? 5.5 : 4.5)}
                        width={isPending ? 11 : 9}
                        height={isPending ? 11 : 9}
                        rx={1.5}
                        fill={linked ? '#15803d' : '#4ade80'}
                        stroke={isPending ? '#facc15' : '#14532d'}
                        strokeWidth={isPending ? 2.5 : 1}
                      />
                    ) : (
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r={isPending ? 7 : cablePort ? 5.6 : 4.5}
                        fill={cablePort ? p.color : linked ? '#0f172a' : '#ffffff'}
                        stroke={isPending ? '#facc15' : '#0f172a'}
                        strokeWidth={isPending ? 2.5 : 1.2}
                      />
                    )}
                    {cablePort && (
                      <text x={p.x} y={p.y + 2.2} fontSize={6.2} fontWeight="bold" textAnchor="middle" fill={textOn(p.color)} className="pointer-events-none">
                        {p.label}
                      </text>
                    )}
                    {/* Número da derivação (saída) do splitter. */}
                    {p.end.p.startsWith('o') && !cablePort && (
                      <text
                        x={p.vdir ? p.x + 4 : p.x + p.dir * 7}
                        y={p.vdir ? p.y + p.vdir * 8 + (p.vdir > 0 ? 3 : 0) : p.y - 3.5}
                        fontSize={6.5}
                        fontWeight="bold"
                        textAnchor={p.vdir ? 'start' : p.dir > 0 ? 'start' : 'end'}
                        fill="#1e3a8a"
                        stroke="#f1f5f9"
                        strokeWidth={2}
                        paintOrder="stroke"
                        className="pointer-events-none"
                      >
                        {p.label}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Potência nas saídas dos splitters */}
              {showPower &&
                [...splitterPower.entries()].map(([key, r]) => {
                  if (!r.ok) return null;
                  const [c, p] = key.split(':');
                  const port = portOf({ c, p });
                  if (!port) return null;
                  const color = POWER_COLORS[powerLevel(r.power, network.settings)];
                  const vx = port.vdir ? port.x - 4 : port.x + port.dir * 17;
                  const vy = port.vdir ? port.y + port.vdir * 9 + (port.vdir > 0 ? 3 : 0) : port.y - 3;
                  return (
                    <text
                      key={key}
                      x={vx}
                      y={vy}
                      textAnchor={port.vdir ? 'end' : port.dir > 0 ? 'start' : 'end'}
                      fontSize={port.vdir ? 7 : 8.5}
                      fill={color}
                      fontWeight="bold"
                      stroke="#f1f5f9"
                      strokeWidth={3}
                      paintOrder="stroke"
                      className="pointer-events-none"
                    >
                      {r.power!.toFixed(1)}
                    </text>
                  );
                })}
            </g>
          </g>
        </svg>

        {/* Zoom */}
        <div className="absolute right-3 bottom-3 flex flex-col gap-1">
          {[
            { icon: <ZoomIn size={16} />, fn: () => setView((v) => ({ ...v, k: Math.min(3, v.k * 1.2) })) },
            { icon: <ZoomOut size={16} />, fn: () => setView((v) => ({ ...v, k: Math.max(0.25, v.k / 1.2) })) },
            { icon: <Maximize size={16} />, fn: fit },
          ].map((z, i) => (
            <button
              key={i}
              onClick={z.fn}
              className="w-8 h-8 rounded-md bg-white text-slate-700 shadow flex items-center justify-center cursor-pointer hover:bg-slate-100"
            >
              {z.icon}
            </button>
          ))}
        </div>

        {/* Porta selecionada */}
        {pendingPort && pendingPower && (
          <div className="absolute left-3 bottom-3 panel px-4 py-3 text-sm max-w-xs">
            <div className="text-xs text-slate-400">Porta selecionada · clique em outra porta para fundir</div>
            <div className="mt-1 flex items-center justify-between gap-3">
              <span className="font-mono font-semibold" style={{ color: POWER_COLORS[powerLevel(pendingPower.power, network.settings)] }}>
                {pendingPower.ok ? `${pendingPower.power!.toFixed(2)} dBm` : 'Sem sinal'}
              </span>
              {pendingPower.steps.length > 0 && (
                <button className="text-emerald-400 text-xs hover:underline cursor-pointer" onClick={() => onShowBudget(node.name, pendingPower)}>
                  Ver orçamento
                </button>
              )}
            </div>
            {!pendingPower.ok && pendingPower.error && <div className="text-xs text-slate-500 mt-1">{pendingPower.error}</div>}
          </div>
        )}
        {selConn && !pendingPort && (
          <div className="absolute left-3 bottom-3 panel px-4 py-3 text-sm max-w-sm">
            <div className="text-xs text-slate-400">
              {selConn.pass ? 'Passagem (sem fusão, sem perda)' : selConn.joint === 'connector' ? 'Emenda por conector / acoplador' : 'Emenda por fusão'}
            </div>
            {(() => {
              const t = trayOfConnection(diagram, cables, selConn);
              return t && !selConn.pass ? <div className="text-xs text-sky-300">{t.name}</div> : null;
            })()}
            <div className="mt-1">{describe(selConn.a)}</div>
            <div className="text-slate-400 text-xs">↕</div>
            <div>{describe(selConn.b)}</div>
            {!readOnly && (
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                {(
                  [
                    ['fuse', 'Fusão'],
                    ['connector', 'Conector'],
                    ['pass', 'Passagem'],
                  ] as const
                ).map(([k, label]) => {
                  const cur = selConn.pass ? 'pass' : selConn.joint === 'connector' ? 'connector' : 'fuse';
                  return (
                    <button
                      key={k}
                      disabled={cur === k}
                      className={cur === k ? 'text-slate-500' : 'text-emerald-400 hover:underline cursor-pointer'}
                      onClick={() =>
                        update((d) => ({
                          ...d,
                          connections: d.connections.map((c) => {
                            if (c.id !== selConn.id) return c;
                            const { pass: _p, joint: _j, ...rest } = c;
                            return k === 'pass' ? { ...rest, pass: true } : k === 'connector' ? { ...rest, joint: 'connector' as const } : rest;
                          }),
                        }))
                      }
                    >
                      {cur === k ? `✓ ${label}` : label}
                    </button>
                  );
                })}
                {selConn.lane !== undefined && (
                  <button className="text-sky-400 hover:underline cursor-pointer" onClick={() => resetLane(selConn.id)}>
                    Traçado automático
                  </button>
                )}
                <button className="text-red-400 hover:underline cursor-pointer" onClick={removeSelected}>
                  Apagar
                </button>
              </div>
            )}
          </div>
        )}
        {showHelp && (
          <div className="absolute right-14 top-3 panel px-4 py-3 text-xs w-80">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-sm">Atalhos do teclado</span>
              <button onClick={() => setShowHelp(false)} className="text-slate-400 hover:text-white cursor-pointer" aria-label="Fechar atalhos">
                <X size={14} />
              </button>
            </div>
            <table className="w-full">
              <tbody>
                {[
                  ['F', 'Ferramenta Emenda (fusão)'],
                  ['C', 'Ferramenta Conector / acoplador'],
                  ['P', 'Ferramenta Passagem (sem fusão)'],
                  ['S', 'Adicionar splitter'],
                  ['B', 'Bandejas e tubos loose'],
                  ['R', 'Girar o selecionado'],
                  ['Ctrl+D', 'Duplicar splitter'],
                  ['Delete', 'Apagar o selecionado'],
                  ['Ctrl+Z / Ctrl+Y', 'Desfazer / refazer'],
                  ['Esc', 'Cancelar seleção'],
                  ['Roda do mouse', 'Zoom'],
                ].map(([k, v]) => (
                  <tr key={k}>
                    <td className="py-0.5 pr-2 font-mono text-emerald-400 whitespace-nowrap">{k}</td>
                    <td className="py-0.5 text-slate-300">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {cables.length === 0 && diagram.components.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="panel px-5 py-4 text-sm text-center max-w-sm">
              Nenhum cabo chega nesta caixa ainda. Desenhe cabos no mapa ligando a {node.name} e depois volte aqui para fazer as fusões.
            </div>
          </div>
        )}
        {error && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 rounded-md bg-red-600 text-white text-sm px-3 py-1.5 shadow flex gap-2 items-center">
            {error}
            <button onClick={() => setError('')} className="cursor-pointer">
              <X size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Rodapé */}
      <div className="flex flex-wrap items-center gap-4 px-4 py-2 border-t border-slate-800 text-sm">
        {(Object.keys(STATUSES) as Status[]).map((s) => (
          <label key={s} className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="radio"
              checked={status === s}
              onChange={() => {
                setStatus(s);
                setDirty(true);
              }}
              className="accent-emerald-500"
            />
            <span style={{ color: status === s ? STATUSES[s].color : undefined }}>{STATUSES[s].label}</span>
          </label>
        ))}
        <span className="text-xs text-slate-500">
          {validConnections.length} conexões · {diagram.components.filter((c) => c.kind === 'splitter').length} splitters
        </span>
        {readOnly ? (
          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs text-amber-400">Acesso de leitura: alterações não são salvas</span>
            <button className="btn-ghost" onClick={onClose}>
              Fechar
            </button>
          </div>
        ) : (
          <div className="ml-auto flex gap-2">
            <button className="btn-ghost" onClick={() => save(false)} disabled={!dirty}>
              Aplicar
            </button>
            <button className="btn-primary" onClick={() => save(true)}>
              <Save size={15} /> Salvar e sair
            </button>
          </div>
        )}
      </div>

      {dialog === 'splitter' && (
        <SplitterDialog onClose={() => setDialog(null)} onPick={(model) => addComponent({ id: uid(), kind: 'splitter', model, x: 0, y: 0 })} />
      )}
      {dialog === 'olt' && (
        <OltDialog
          defaultTx={network.settings.olt_tx_dbm}
          count={diagram.components.filter((c) => c.kind === 'olt').length}
          onClose={() => setDialog(null)}
          onCreate={(c) => addComponent(c)}
        />
      )}
      {dialog === 'dio' && (
        <DioDialog count={diagram.components.filter((c) => c.kind === 'dio').length} onClose={() => setDialog(null)} onCreate={(c) => addComponent(c)} />
      )}
      {dialog === 'trays' && (
        <TrayDialog
          trays={trays}
          cables={blocks.filter((b): b is Extract<Block, { kind: 'cable' }> => b.kind === 'cable')}
          usage={usage}
          focus={trayFocus}
          readOnly={readOnly}
          onFocus={setTrayFocus}
          onChange={(next) => update((d) => ({ ...d, trays: next }))}
          onAdd={(capacity) => {
            const cableBottom = Math.max(0, ...blocks.filter((b) => b.kind === 'cable').map((b) => b.y + blockSize(b).h), ...trays.map((t) => t.y + trayHeight(t)));
            const t: SpliceTray = {
              id: uid(),
              name: `Bandeja ${trays.length + 1}`,
              capacity,
              tubes: [],
              x: trays[trays.length - 1]?.x ?? CABLE_W + 60,
              y: cableBottom + (trays.length ? 24 : 40),
            };
            update((d) => ({ ...d, trays: [...(d.trays ?? []), t] }));
            setTrayFocus(t.id);
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'auto' && <AutoFuseDialog blocks={blocks} onClose={() => setDialog(null)} onRun={autoFuse} />}
    </div>
  );
}

/** Botão da barra de ferramentas (ícone com dica; texto opcional em telas largas). */
function IconTool({
  icon,
  label,
  text,
  onClick,
  active,
  danger,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  text?: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`flex items-center gap-1.5 h-8 min-w-8 justify-center rounded-md border px-2 text-xs font-medium transition-colors ${
        disabled
          ? 'border-transparent text-slate-300 cursor-not-allowed'
          : active
            ? 'border-emerald-600 bg-emerald-600 text-white cursor-pointer'
            : danger
              ? 'border-slate-200 bg-white text-slate-600 hover:border-red-300 hover:bg-red-50 hover:text-red-600 cursor-pointer'
              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100 cursor-pointer'
      }`}
    >
      {icon}
      {text && <span className="hidden lg:inline">{text}</span>}
    </button>
  );
}

function Sep() {
  return <div className="mx-1 h-5 w-px bg-slate-200" />;
}

/** Ícone da emenda (protetor de fusão) para a barra de ferramentas. */
function SpliceIcon() {
  return (
    <svg width={18} height={16} viewBox="0 0 18 16" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
      <line x1={0} y1={8} x2={18} y2={8} />
      <rect x={4} y={5} width={10} height={6} rx={3} fill="currentColor" fillOpacity={0.15} />
      <circle cx={7} cy={8} r={1.3} fill="currentColor" />
      <circle cx={11} cy={8} r={1.3} fill="currentColor" />
    </svg>
  );
}

/** Ícone do conector/acoplador para a barra de ferramentas. */
function ConnectorIcon() {
  return (
    <svg width={18} height={16} viewBox="0 0 18 16" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
      <line x1={0} y1={8} x2={4} y2={8} />
      <line x1={14} y1={8} x2={18} y2={8} />
      <rect x={4} y={4.5} width={4.5} height={7} rx={1} fill="currentColor" fillOpacity={0.25} />
      <rect x={9.5} y={4.5} width={4.5} height={7} rx={1} fill="currentColor" fillOpacity={0.25} />
    </svg>
  );
}

/** Conector/acoplador desenhado sobre a fibra: dois conectores encaixados num adaptador. */
function ConnectorMark({ x, y, vertical, selected }: { x: number; y: number; vertical: boolean; selected: boolean }) {
  return (
    <g transform={`translate(${x},${y})${vertical ? ' rotate(90)' : ''}`} className="pointer-events-none">
      <rect x={-8} y={-4.5} width={7} height={9} rx={1.2} fill={selected ? '#fde047' : '#3b82f6'} stroke="#1f2937" strokeWidth={1} />
      <rect x={1} y={-4.5} width={7} height={9} rx={1.2} fill={selected ? '#fde047' : '#22c55e'} stroke="#1f2937" strokeWidth={1} />
      <rect x={-2} y={-6} width={4} height={12} rx={1} fill="#e5e7eb" stroke="#1f2937" strokeWidth={0.9} />
    </g>
  );
}

/** Emenda desenhada sobre a fibra: protetor (tubete) cinza com as duas pontas fundidas. */
function SpliceMark({ x, y, vertical, selected }: { x: number; y: number; vertical: boolean; selected: boolean }) {
  return (
    <g transform={`translate(${x},${y})${vertical ? ' rotate(90)' : ''}`} className="pointer-events-none">
      <rect x={-8} y={-3.6} width={16} height={7.2} rx={3.6} fill={selected ? '#fde047' : '#9ca3af'} stroke="#1f2937" strokeWidth={1} />
      <circle cx={-3.4} cy={0} r={1.9} fill="#ffffff" stroke="#1f2937" strokeWidth={0.8} />
      <circle cx={3.4} cy={0} r={1.9} fill="#ffffff" stroke="#1f2937" strokeWidth={0.8} />
    </g>
  );
}

function BlockView({
  block: b,
  selected,
  showTubes,
  onPointerDown,
}: {
  block: Block;
  selected: boolean;
  showTubes?: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  const { w, h } = blockSize(b);
  const stroke = selected ? '#eab308' : '#94a3b8';
  const sw = selected ? 2.5 : 1;

  if (b.kind === 'splitter') {
    const m = splitterModel(b.model);
    const g = splitterFrame(b);
    // Desenho sem rotação (ponta = entrada à esquerda, base = saídas à direita), girado em torno do centro.
    const n = m.outputs;
    const top = b.y + (h - n * ROW) / 2;
    const baseX = b.x + w;
    const outX = baseX + (m.connectorized ? CONN_W : 0);
    const labelW = (b.name || m.name).length * 5 + 12;
    const vertical = g.rot === 90 || g.rot === 270;
    // Rótulo abaixo do splitter; girado 90°/270°, fica ao lado (embaixo/em cima estão as portas).
    const lx = vertical ? g.box.x + g.box.w + 10 + labelW / 2 : g.cx;
    const ly = vertical ? g.cy - 6.5 : g.box.y + g.box.h + 4;
    return (
      <g onPointerDown={onPointerDown} className="cursor-move">
        {selected && <rect x={g.box.x - 8} y={g.box.y - 8} width={g.box.w + 16} height={g.box.h + 16} rx={6} fill="#fef9c3" stroke="#eab308" strokeDasharray="4 3" />}
        <g transform={g.rot ? `rotate(${g.rot} ${g.cx} ${g.cy})` : undefined}>
          {/* Splitter conectorizado: leque da base até os conectores das saídas. */}
          {m.connectorized &&
            Array.from({ length: n }, (_, i) => (
              <line key={i} x1={baseX + 3} y1={b.y + h / 2} x2={outX} y2={top + (i + 0.5) * ROW} stroke="#1f2937" strokeWidth={1.1} />
            ))}
          <path
            d={`M${b.x},${b.y + h / 2} L${baseX},${b.y} L${baseX},${b.y + h} Z`}
            fill="#6b7280"
            stroke={selected ? '#eab308' : '#1f2937'}
            strokeWidth={sw + 0.5}
            strokeLinejoin="round"
          />
        </g>
        <rect x={lx - labelW / 2} y={ly} width={labelW} height={13} rx={3} fill="#ffffff" stroke="#cbd5e1" strokeWidth={0.6} />
        <text x={lx} y={ly + 9.5} fontSize={8} textAnchor="middle" fill="#0f172a" fontWeight="bold">
          {b.name || m.name}
        </text>
      </g>
    );
  }

  const title = b.kind === 'cable' ? `${b.cable.name} (${b.letter})` : b.name;
  const subtitle =
    b.kind === 'cable'
      ? `${b.cable.fiber_count} fibras · ${b.label}`
      : b.kind === 'olt'
        ? `${b.slots} slot(s) × ${b.ports} PON · ${b.tx_dbm} dBm`
        : `${b.ports} portas · conector ◂ ▸ fusão`;
  const right = b.kind === 'cable' ? b.side === 'left' : b.kind === 'olt';
  const fill = b.kind === 'olt' ? '#ede9fe' : b.kind === 'dio' ? '#e0f2fe' : '#ffffff';

  return (
    <g onPointerDown={onPointerDown} className="cursor-move">
      <rect x={b.x} y={b.y} width={w} height={h} rx={4} fill={fill} stroke={stroke} strokeWidth={sw} />
      <text x={b.x + 8} y={b.y + 14} fontSize={11} fontWeight="bold" fill="#0f172a">
        {title.length > 22 ? `${title.slice(0, 21)}…` : title}
      </text>
      <text x={b.x + 8} y={b.y + 26} fontSize={8.5} fill="#64748b">
        {subtitle.length > 32 ? `${subtitle.slice(0, 31)}…` : subtitle}
      </text>
      {b.kind === 'cable' &&
        Array.from({ length: b.cable.fiber_count }, (_, i) => {
          const y = b.y + HEADER + i * ROW;
          const tube = tubeColor(i + 1, b.cable.fibers_per_tube);
          // Faixa do tubo loose na borda externa (sempre visível quando há bandejas, para o vínculo).
          const showTube = showTubes || b.cable.fiber_count > b.cable.fibers_per_tube;
          const fc = fiberColor(i + 1, b.cable.fibers_per_tube);
          return (
            <g key={i}>
              {showTube && <rect x={right ? b.x + 3 : b.x + w - (showTubes ? 9 : 8)} y={y} width={showTubes ? 6 : 4} height={ROW} fill={tube.hex} stroke="#cbd5e1" strokeWidth={0.3} />}
              <rect x={right ? b.x + w - 50 : b.x + 10} y={y + 3} width={40} height={ROW - 6} rx={2} fill={fc.hex} stroke="#94a3b8" strokeWidth={0.4} />
              <text x={right ? b.x + w - 56 : b.x + 56} y={y + ROW - 3.5} fontSize={8.5} fill="#334155" textAnchor={right ? 'end' : 'start'}>
                {i + 1} {fc.name}
              </text>
            </g>
          );
        })}
      {(b.kind === 'olt' || b.kind === 'dio') &&
        blockPorts(b)
          .filter((p) => b.kind === 'olt' || p.end.p.startsWith('b'))
          .map((p) => (
            <text key={p.end.p} x={b.x + w / 2} y={p.y + 3} fontSize={8.5} textAnchor="middle" fill="#334155">
              {b.kind === 'olt' ? `S${p.label.replace('/', ' / P')}` : `Porta ${p.label}`}
            </text>
          ))}
    </g>
  );
}

export function SplitterDialog({ onClose, onPick }: { onClose: () => void; onPick: (model: string) => void }) {
  const [balanced, setBalanced] = useState(true);
  return (
    <Modal title="Selecionar splitter" onClose={onClose} width="max-w-sm">
      <div className="flex rounded-md bg-slate-950 p-1 mb-3">
        {[true, false].map((v) => (
          <button
            key={String(v)}
            onClick={() => setBalanced(v)}
            className={`flex-1 rounded py-1.5 text-sm cursor-pointer ${balanced === v ? 'bg-emerald-600' : ''}`}
          >
            {v ? 'Balanceado' : 'Desbalanceado'}
          </button>
        ))}
      </div>
      <ul className="max-h-80 overflow-y-auto divide-y divide-slate-800">
        {SPLITTER_MODELS.filter((m) => m.balanced === balanced).map((m) => (
          <li key={m.id}>
            <button onClick={() => onPick(m.id)} className="w-full flex justify-between px-2 py-2 text-sm hover:bg-slate-800 rounded cursor-pointer">
              <span>{m.name}</span>
              <span className="text-slate-400 text-xs">
                {m.outputs} saídas · {m.balanced ? `${m.losses[0]} dB` : `${m.losses[0]} / ${m.losses[1]} dB`}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

function OltDialog({
  defaultTx,
  count,
  onClose,
  onCreate,
}: {
  defaultTx: number;
  count: number;
  onClose: () => void;
  onCreate: (c: DiagramComponent) => void;
}) {
  const [model, setModel] = useState('custom');
  const [slots, setSlots] = useState(1);
  const [ports, setPorts] = useState(8);
  const [tx, setTx] = useState(defaultTx);
  const [name, setName] = useState(`OLT ${count + 1}`);
  return (
    <Modal title="Adicionar OLT" onClose={onClose} width="max-w-sm">
      <div className="space-y-3">
        <Field label="Modelo">
          <select
            className="input"
            value={model}
            onChange={(e) => {
              const m = OLT_MODELS.find((x) => x.id === e.target.value)!;
              setModel(m.id);
              setSlots(m.slots);
              setPorts(m.ports);
              if (m.id !== 'custom') setName(m.name.replace('OLT ', ''));
            }}
          >
            {OLT_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Nome">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Slots">
            <input type="number" min={1} max={16} className="input" value={slots} onChange={(e) => setSlots(Number(e.target.value))} />
          </Field>
          <Field label="PON/slot">
            <input type="number" min={1} max={16} className="input" value={ports} onChange={(e) => setPorts(Number(e.target.value))} />
          </Field>
          <Field label="TX (dBm)">
            <input type="number" step={0.5} className="input" value={tx} onChange={(e) => setTx(Number(e.target.value))} />
          </Field>
        </div>
        <p className="text-xs text-slate-400">Total: {slots * ports} portas PON</p>
        <button
          className="btn-primary w-full"
          onClick={() => onCreate({ id: uid(), kind: 'olt', name, model, slots: Math.max(1, slots), ports: Math.max(1, ports), tx_dbm: tx, x: 0, y: 0 })}
        >
          Criar OLT
        </button>
      </div>
    </Modal>
  );
}

function DioDialog({ count, onClose, onCreate }: { count: number; onClose: () => void; onCreate: (c: DiagramComponent) => void }) {
  const [ports, setPorts] = useState(24);
  return (
    <Modal title="Adicionar DIO" onClose={onClose} width="max-w-sm">
      <div className="grid grid-cols-3 gap-2">
        {DIO_SIZES.map((n) => (
          <button
            key={n}
            onClick={() => setPorts(n)}
            className={`rounded-md border py-3 cursor-pointer ${ports === n ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-700'}`}
          >
            <div className="text-lg font-semibold">{n}</div>
            <div className="text-xs text-slate-400">{Math.ceil(n / 12)} bandeja(s)</div>
          </button>
        ))}
      </div>
      <button className="btn-primary w-full mt-4" onClick={() => onCreate({ id: uid(), kind: 'dio', name: `DIO ${count + 1}`, ports, x: 0, y: 0 })}>
        Criar DIO com {ports} portas
      </button>
    </Modal>
  );
}

function AutoFuseDialog({ blocks, onClose, onRun }: { blocks: Block[]; onClose: () => void; onRun: (from: string, to: string, offset: number) => void }) {
  const cablesB = blocks.filter((b) => b.kind === 'cable');
  const targets = blocks.filter((b) => b.kind === 'cable' || b.kind === 'dio');
  const [from, setFrom] = useState(cablesB[0]?.key ?? '');
  const [to, setTo] = useState(targets.find((t) => t.key !== cablesB[0]?.key)?.key ?? '');
  const [offset, setOffset] = useState(0);
  const label = (b: Block) => (b.kind === 'cable' ? `${b.cable.name} (${b.label})` : b.kind === 'dio' ? b.name : '');
  return (
    <Modal title="Auto-fusão" onClose={onClose} width="max-w-sm">
      <p className="text-sm text-slate-400 mb-3">
        Funde as fibras em sequência (1↔1, 2↔2...), pulando as que já estão ocupadas. Use para sangrias e para ligar o cabo ao DIO.
      </p>
      <div className="space-y-3">
        <Field label="Cabo de origem">
          <select className="input" value={from} onChange={(e) => setFrom(e.target.value)}>
            {cablesB.map((b) => (
              <option key={b.key} value={b.key}>
                {label(b)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Destino">
          <select className="input" value={to} onChange={(e) => setTo(e.target.value)}>
            {targets
              .filter((b) => b.key !== from)
              .map((b) => (
                <option key={b.key} value={b.key}>
                  {label(b)}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Começar na porta/fibra do destino">
          <input type="number" min={1} className="input" value={offset + 1} onChange={(e) => setOffset(Math.max(0, Number(e.target.value) - 1))} />
        </Field>
        <button className="btn-primary w-full" disabled={!from || !to} onClick={() => onRun(from, to, offset)}>
          <Wand2 size={15} /> Fundir
        </button>
      </div>
    </Modal>
  );
}

/** Cartão da bandeja no diagrama: nome, ocupação (emendas / capacidade) e os tubos loose vinculados. */
function TrayCard({
  tray: t,
  used,
  rows,
  selected,
  onPointerDown,
  onDoubleClick,
}: {
  tray: SpliceTray;
  used: number;
  rows: { key: string; color: string; text: string }[];
  selected: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onDoubleClick: () => void;
}) {
  const h = trayHeight(t);
  const over = used > t.capacity;
  const pct = Math.min(1, used / Math.max(1, t.capacity));
  return (
    <g onPointerDown={onPointerDown} onDoubleClick={onDoubleClick} className="cursor-move">
      <title>Duplo clique para vincular tubos</title>
      <rect x={t.x} y={t.y} width={TRAY_W} height={h} rx={6} fill="#f8fafc" stroke={selected ? '#eab308' : over ? '#dc2626' : '#64748b'} strokeWidth={selected ? 2.5 : 1.2} />
      <rect x={t.x} y={t.y} width={TRAY_W} height={22} rx={6} fill={over ? '#fee2e2' : '#e2e8f0'} />
      <rect x={t.x} y={t.y + 16} width={TRAY_W} height={6} fill={over ? '#fee2e2' : '#e2e8f0'} />
      {/* Ícone: bandeja com as emendas */}
      <g transform={`translate(${t.x + 8},${t.y + 6})`}>
        <rect width={16} height={10} rx={2} fill="none" stroke="#334155" strokeWidth={1.2} />
        <line x1={3} y1={3.5} x2={13} y2={3.5} stroke="#334155" strokeWidth={1} />
        <line x1={3} y1={6.5} x2={13} y2={6.5} stroke="#334155" strokeWidth={1} />
      </g>
      <text x={t.x + 30} y={t.y + 15} fontSize={10.5} fontWeight="bold" fill="#0f172a">
        {t.name.length > 18 ? `${t.name.slice(0, 17)}…` : t.name}
      </text>
      <text x={t.x + TRAY_W - 8} y={t.y + 15} fontSize={9} fontWeight="bold" textAnchor="end" fill={over ? '#dc2626' : '#334155'}>
        {used}/{t.capacity} fusões
      </text>
      <rect x={t.x + 8} y={t.y + HEADER - 4} width={TRAY_W - 16} height={5} rx={2.5} fill="#e2e8f0" />
      <rect x={t.x + 8} y={t.y + HEADER - 4} width={(TRAY_W - 16) * pct} height={5} rx={2.5} fill={over ? '#dc2626' : pct > 0.85 ? '#f59e0b' : '#16a34a'} />
      {rows.length === 0 && (
        <text x={t.x + 10} y={t.y + HEADER + 14 + TRAY_ROW * 0.65} fontSize={8.5} fill="#94a3b8">
          Nenhum tubo vinculado
        </text>
      )}
      {rows.map((r, j) => {
        const y = t.y + HEADER + 14 + j * TRAY_ROW;
        return (
          <g key={r.key}>
            <rect x={t.x + 8} y={y + 3} width={14} height={TRAY_ROW - 6} rx={2} fill={r.color} stroke="#64748b" strokeWidth={0.6} />
            <text x={t.x + 28} y={y + TRAY_ROW - 4.5} fontSize={8.5} fill="#334155">
              {r.text}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/** Bandejas da caixa: criar, renomear, capacidade e vínculo dos tubos loose de cada cabo. */
function TrayDialog({
  trays,
  cables,
  usage,
  focus,
  readOnly,
  onFocus,
  onChange,
  onAdd,
  onClose,
}: {
  trays: SpliceTray[];
  cables: Extract<Block, { kind: 'cable' }>[];
  usage: Map<string, number>;
  focus: string | null;
  readOnly?: boolean;
  onFocus: (id: string) => void;
  onChange: (trays: SpliceTray[]) => void;
  onAdd: (capacity: number) => void;
  onClose: () => void;
}) {
  const [capacity, setCapacity] = useState(24);
  const current = trays.find((t) => t.id === focus) ?? trays[0];
  const edit = (patch: Partial<SpliceTray>) => current && onChange(trays.map((t) => (t.id === current.id ? { ...t, ...patch } : t)));
  return (
    <Modal title="Bandejas de emenda" onClose={onClose} width="max-w-2xl">
      <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
        <div>
          <ul className="space-y-1">
            {trays.map((t) => {
              const used = usage.get(t.id) ?? 0;
              return (
                <li key={t.id}>
                  <button
                    onClick={() => onFocus(t.id)}
                    className={`w-full text-left rounded-md px-3 py-2 text-sm cursor-pointer border ${current?.id === t.id ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-700 hover:bg-slate-800'}`}
                  >
                    <div className="font-medium">{t.name}</div>
                    <div className={`text-xs ${used > t.capacity ? 'text-red-400' : 'text-slate-400'}`}>
                      {used}/{t.capacity} fusões · {t.tubes.length} tubo(s)
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
          {!readOnly && (
            <div className="mt-3 flex gap-2">
              <select className="input" value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} aria-label="Capacidade da nova bandeja">
                {TRAY_CAPACITIES.map((n) => (
                  <option key={n} value={n}>
                    {n} fusões
                  </option>
                ))}
              </select>
              <button className="btn-primary whitespace-nowrap" onClick={() => onAdd(capacity)}>
                + Bandeja
              </button>
            </div>
          )}
        </div>
        <div>
          {!current ? (
            <p className="text-sm text-slate-400">Crie uma bandeja e depois marque os tubos loose dos cabos que ficam nela.</p>
          ) : (
            <>
              <div className="grid grid-cols-[1fr_120px] gap-2">
                <Field label="Nome">
                  <input className="input" value={current.name} disabled={readOnly} onChange={(e) => edit({ name: e.target.value })} />
                </Field>
                <Field label="Capacidade">
                  <select className="input" value={current.capacity} disabled={readOnly} onChange={(e) => edit({ capacity: Number(e.target.value) })}>
                    {[...new Set([...TRAY_CAPACITIES, current.capacity])].sort((a, b) => a - b).map((n) => (
                      <option key={n} value={n}>
                        {n} fusões
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <p className="text-xs text-slate-400 mt-3 mb-2">Clique nos tubos para vincular ou desvincular. Cada tubo fica em uma bandeja só.</p>
              <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                {cables.map((b) => (
                  <div key={b.key}>
                    <div className="text-sm font-medium">
                      Cabo {b.letter} · {b.cable.name} <span className="text-xs text-slate-400">({b.cable.fiber_count} FO · {b.label})</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {Array.from({ length: tubeCount(b.cable) }, (_, i) => {
                        const key = tubeKey(b.key, i + 1);
                        const [f1, f2] = tubeFibers(i + 1, b.cable);
                        const tc = tubeColor(f1, b.cable.fibers_per_tube);
                        const owner = trays.find((t) => t.tubes.includes(key));
                        const mine = owner?.id === current.id;
                        return (
                          <button
                            key={key}
                            disabled={readOnly}
                            onClick={() => onChange(toggleTube(trays, current.id, key))}
                            title={owner && !mine ? `Hoje em ${owner.name}: clique para mover para ${current.name}` : undefined}
                            className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs cursor-pointer ${
                              mine ? 'border-emerald-500 bg-emerald-500/15' : owner ? 'border-slate-700 opacity-60' : 'border-slate-700 hover:bg-slate-800'
                            }`}
                          >
                            <span className="inline-block w-3 h-3 rounded-sm border border-slate-500" style={{ background: tc.hex }} />
                            Tubo {i + 1} {tc.name} · FO {f1}–{f2}
                            {mine ? ' ✓' : owner ? ` (${owner.name})` : ''}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {cables.length === 0 && <p className="text-sm text-slate-400">Nenhum cabo chega nesta caixa.</p>}
              </div>
              {!readOnly && (
                <button
                  className="mt-4 text-xs text-red-400 hover:underline cursor-pointer"
                  onClick={() => {
                    if (!confirm(`Apagar ${current.name}? As emendas continuam no diagrama.`)) return;
                    onChange(trays.filter((t) => t.id !== current.id));
                  }}
                >
                  Apagar esta bandeja
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
