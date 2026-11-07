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
  Group,
  Save,
  Server,
  Spline,
  Split,
  SquareStack,
  Trash2,
  Triangle,
  Building2,
  Home,
  Store,
  Undo2,
  UserRound,
  Wand2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, errorMessage } from '../lib/api';
import { POWER_COLORS, clientBudget, powerLevel, traceUpstream, type BudgetResult } from '../lib/budget';
import { CABLE_CATEGORIES, DIO_SIZES, OLT_MODELS, SPLITTER_MODELS, STATUSES, fiberColor, splitterModel, tubeColor } from '../lib/catalog';
import CableLossField, { lossRateText, parseLossRate } from './CableLossField';
import { cableLetter, curvePath, laneSegment, polylinePath, routeOrthogonal, spliceAnchor, textOn, type Pt } from '../lib/splice';
import { TRAY_CAPACITIES, cableRows, rowsHeight, trayPorts, type CableRow, pruneTrays, toggleTube, trayOfConnection, trayOfFiber, trayUsage, tubeCount, tubeFibers, tubeKey } from '../lib/tray';
import type { Cable, CableCategory, Connection, Diagram, DiagramComponent, End, NetNode, Network, Settings, SpliceTray, Status } from '../lib/types';
import { distance } from '../lib/geo';
import { HEALTH_COLORS, HEALTH_LABEL, analyzeSignal, measuredClients, type SignalAnalysis } from '../lib/signal';
import SignalHealthBox from './SignalHealthBox';
import { CLIENT_SEGMENTS, SEGMENT_GLYPH, clientDataOf, looksLikeGponSerial, normalizeSerial, type ClientData, type ClientSegment } from '../lib/client';
import { Field, Modal } from './ui';
import JointForm from './JointForm';
import { formatDb, jointLoss, jointName, jointLossSource } from '../lib/joints';
import { routeMembers, routeName, type RouteComp, type RouteEnv } from '../lib/route';
import { countLabel, intersects, isMarquee, joinCounts, pointIn, rectFrom, type Rect } from '../lib/marquee';

const ROW = 14;
const HEADER = 34;
const CLIENT_W = 180;
const CLIENT_H = 70;
const CABLE_W = 150;
const BOX_W = 130;
const SPLIT_W = 56;
/** Leque até os conectores das saídas de um splitter conectorizado. */
const CONN_W = 26;
const HISTORY_MAX = 60;
const ROUTE_KEY = 'mapftth.splice.route';
const TRAY_W = 230;
/** Topo das portas da bandeja (abaixo do cabeçalho e da barra de ocupação). */
const TRAY_TOP = HEADER + 12;
const TRAY_FOOT = 22;
/** Cartão da Rota recolhida e cor da rota (cartão, moldura e portas). */
const ROTA_W = 210;
const ROTA_COLOR = '#4338ca';
const ROTA_LIST = 5;

/** Altura do cartão da bandeja aberta: uma linha por FO do lado com mais fibras, mais o rodapé com o resumo. */
const trayHeightFor = (nLeft: number, nRight: number) => TRAY_TOP + Math.max(1, nLeft, nRight) * ROW + TRAY_FOOT;

type RouteStyle = 'ortho' | 'curve';
type Tool = 'fuse' | 'connector' | 'pass';

/** Racks só existem no editor de POP; a Rota é desenhada à parte (cartão recolhido ou moldura). */
type BoxComponent = Exclude<DiagramComponent, { kind: 'rack' | 'route' }>;
type Block =
  | {
      key: string;
      kind: 'cable';
      cable: Cable;
      x: number;
      y: number;
      side: 'left' | 'right';
      label: string;
      letter: string;
      rows: CableRow[];
      /** Cabo drop que vai até um cliente do mapa: desenhado como o objeto Cliente (o drop é a própria linha). */
      client?: NetNode;
    }
  | (BoxComponent & { key: string });

/** Drop até um cliente: ponta do cartão do cliente (porta voltada para o centro do diagrama). */
const dropHeight = (n: number) => Math.max(CLIENT_H, n * ROW + 16);

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

/** Vários itens marcados no diagrama: blocos (cabos, splitters, clientes, grupos...), bandejas e fusões. */
interface Picked {
  blocks: string[];
  trays: string[];
  conns: string[];
}
const pickedCount = (p: Picked | null) => (p ? p.blocks.length + p.trays.length + p.conns.length : 0);

// Ids de componentes começam com "k" para nunca colidir com cabos ("c{id}").
const uid = () => `k${Math.random().toString(36).slice(2, 9)}`;
const sameEnd = (a: End, b: End) => a.c === b.c && a.p === b.p;
/** Cliente desenhado no diagrama ou cliente do mapa ligado por drop. */
const isClientBlock = (b: Block) => b.kind === 'client' || (b.kind === 'cable' && !!b.client);

function blockSize(b: Block): { w: number; h: number } {
  switch (b.kind) {
    case 'cable':
      if (b.client) return { w: CLIENT_W, h: dropHeight(b.cable.fiber_count) };
      return { w: CABLE_W, h: HEADER + rowsHeight(b.rows) + 6 };
    case 'splitter': {
      const n = splitterModel(b.model).outputs;
      return { w: SPLIT_W, h: Math.max(40, n * ROW + 12) };
    }
    case 'olt':
      return { w: BOX_W, h: HEADER + b.slots * b.ports * ROW + 6 };
    case 'dio':
    case 'active':
      return { w: BOX_W, h: HEADER + b.ports * ROW + 6 };
    case 'client':
      return { w: CLIENT_W, h: CLIENT_H };
  }
}

function blockPorts(b: Block): Port[] {
  const { w, h } = blockSize(b);
  switch (b.kind) {
    case 'cable': {
      // As fibras ficam na borda voltada para o centro do diagrama.
      // Fibras de tubos vinculados a uma bandeja viram portas da bandeja (não aparecem no cabo).
      const right = b.side === 'left';
      if (b.client) {
        // Drop até o cliente: uma porta por fibra na lateral do cartão do cliente.
        const n = b.cable.fiber_count;
        const top = b.y + (h - n * ROW) / 2;
        return Array.from({ length: n }, (_, i) => ({
          end: { c: b.key, p: `f${i + 1}` },
          x: right ? b.x + w : b.x,
          y: top + (i + 0.5) * ROW,
          dir: (right ? 1 : -1) as 1 | -1,
          color: fiberColor(i + 1, b.cable.fibers_per_tube).hex,
          label: n > 1 ? String(i + 1) : '',
        }));
      }
      return b.rows.flatMap((r) =>
        r.kind === 'fiber'
          ? [
              {
                end: { c: b.key, p: `f${r.fiber}` },
                x: right ? b.x + w : b.x,
                y: b.y + HEADER + r.y + ROW / 2,
                dir: (right ? 1 : -1) as 1 | -1,
                color: fiberColor(r.fiber, b.cable.fibers_per_tube).hex,
                label: String(r.fiber),
              },
            ]
          : [],
      );
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
    case 'client':
      // Uma porta só (a fibra que chega no cliente), na lateral esquerda; girado, na direita.
      return [{ end: { c: b.key, p: 'in' }, x: b.flip ? b.x + w : b.x, y: b.y + h / 2, dir: (b.flip ? 1 : -1) as 1 | -1, color: '#0f766e', label: '' }];
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
  /** clients = clientes do mapa atualizados com os dados dos clientes do diagrama (ID, serial, tipo). */
  onSaved: (n: NetNode, clients?: NetNode[]) => void;
  onShowBudget: (title: string, result: BudgetResult) => void;
  /** Acesso de leitura: permite explorar o diagrama, mas não salvar. */
  readOnly?: boolean;
  /** Exclui o cabo do projeto (some do mapa e de todas as caixas). true quando excluiu. */
  onDeleteCable?: (cable: Cable) => Promise<boolean>;
  /** Cliente do mapa alterado direto pelo diagrama (cliente ligado por drop). */
  onNodeSaved?: (n: NetNode) => void;
  /** Cabo alterado direto pelo diagrama (duplo clique no cabo ou no drop). */
  onCableSaved?: (c: Cable, nodes: NetNode[]) => void;
}

export default function DiagramEditor({ node, network, onClose, onSaved, onShowBudget, readOnly, onDeleteCable, onNodeSaved, onCableSaved }: Props) {
  const [diagram, setDiagram] = useState<Diagram>(() => {
    const d = structuredClone(node.diagram ?? emptyDiagram());
    // Clientes vinculados ao mapa: ID, serial e tipo vêm do cliente do mapa (podem ter sido editados lá).
    d.components = d.components.map((c) => {
      if (c.kind !== 'client' || !c.node_id) return c;
      const n = network.nodes.find((x) => x.id === c.node_id && x.type === 'client');
      if (!n) return c;
      const cd = clientDataOf(n.attributes);
      // O cliente do mapa é a referência (o diagrama grava nele ao salvar); o tipo sem valor continua residencial.
      return { ...c, client_code: cd.client_code, onu_serial: cd.onu_serial, segment: cd.segment ?? c.segment, rx_dbm: cd.rx_dbm, rx_at: cd.rx_at };
    });
    // Grupos criados quando o objeto se chamava "Rota": o nome automático passa a "Grupo ..." (nomes digitados ficam).
    d.components = d.components.map((c) => {
      if (c.kind !== 'route') return c;
      const cab = network.cables.find((x) => `c${x.id}` === c.cable);
      return cab && c.name === `Rota ${cab.name}${c.fiber ? ` · FO ${c.fiber.slice(1)}` : ''}` ? { ...c, name: routeName(cab.name, c.fiber) } : c;
    });
    return d;
  });
  const [status, setStatus] = useState<Status>(node.status);
  const [dirty, setDirty] = useState(false);
  const [view, setView] = useState({ x: 40, y: 40, k: 1 });
  const [pending, setPending] = useState<End | null>(null);
  const [selected, setSelected] = useState<{ kind: 'conn' | 'block' | 'tray'; key: string } | null>(null);
  /** Seleção por retângulo (Ctrl/Shift + arrastar no fundo) ou Ctrl+clique: vários de uma vez. */
  const [picked, setPicked] = useState<Picked | null>(null);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [dialog, setDialog] = useState<'splitter' | 'olt' | 'dio' | 'auto' | 'sangria' | 'trays' | 'trayEdit' | 'client' | null>(null);
  const [trayFocus, setTrayFocus] = useState<string | null>(null);
  /** Cliente em edição na janela de cliente (null = novo cliente). */
  const [clientEdit, setClientEdit] = useState<string | null>(null);
  /** Emenda aberta no editor de tipo e perda. */
  const [jointEdit, setJointEdit] = useState<string | null>(null);
  /** Splitter aberto no editor (duplo clique). */
  const [splitterEdit, setSplitterEdit] = useState<string | null>(null);
  /** Cabo selecionado para apagar (só emendas ou o cabo inteiro). */
  const [cableDelete, setCableDelete] = useState<string | null>(null);
  /** Drop de cliente aberto para editar os dados do cliente do mapa. */
  const [dropClientEdit, setDropClientEdit] = useState<string | null>(null);
  /** Cabo (ou drop) aberto no editor do cabo. */
  const [cableEdit, setCableEdit] = useState<number | null>(null);
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
  const drag = useRef<{
    key?: string;
    lane?: string;
    /** Rota expandida (ou vários selecionados): arrasta todos juntos (posições de partida). */
    group?: { key: string; x: number; y: number; side?: 'left' | 'right'; cable: boolean; tray?: boolean }[];
    /** Retângulo de seleção: ponto de partida no sistema do desenho. */
    box?: { x: number; y: number };
    /** Ctrl/Shift apertado no clique: soma/tira o objeto da seleção múltipla. */
    mod?: boolean;
    sx: number;
    sy: number;
    ox: number;
    oy: number;
    moved: boolean;
  } | null>(null);

  const cables = useMemo(() => network.cables.filter((c) => c.from_node_id === node.id || c.to_node_id === node.id), [network.cables, node.id]);
  const nodeName = (id: number | null) => network.nodes.find((n) => n.id === id)?.name ?? 'ponta solta';
  /** Cliente do mapa na outra ponta do cabo (drop): o cartão mostra o cliente, não o cabo. */
  const dropClientOf = (c: Cable): NetNode | undefined => {
    const other = c.from_node_id === node.id ? c.to_node_id : c.from_node_id;
    const n = network.nodes.find((x) => x.id === other);
    return n?.type === 'client' && c.from_node_id !== c.to_node_id ? n : undefined;
  };

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
    setPicked(null);
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
    setPicked(null);
    setHistoryTick((t) => t + 1);
  }

  /** Troca uma emenda pela versão editada (tipo, conector, perda). */
  function updateConnection(next: Connection) {
    update((d) => ({ ...d, connections: d.connections.map((c) => (c.id === next.id ? next : c)) }));
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
      const rows = cableRows(key, c, diagram.trays, ROW);
      const h = HEADER + rowsHeight(rows) + 30;
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
        rows,
        client: dropClientOf(c),
      };
    });
    return [...cableBlocks, ...diagram.components.filter((c): c is BoxComponent => c.kind !== 'rack' && c.kind !== 'route').map((c) => ({ ...c, key: c.id }))];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cables, diagram, node.id, network.nodes]);

  // Bandeja aberta: as FO dos tubos vinculados viram portas nas laterais da bandeja.
  const trayGeo = useMemo(() => {
    const cableInfo = blocks.filter((b): b is Extract<Block, { kind: 'cable' }> => b.kind === 'cable');
    const map = new Map<string, { left: End[]; right: End[]; h: number; ports: Port[] }>();
    for (const t of diagram.trays ?? []) {
      const { left, right } = trayPorts(
        t,
        cableInfo.map((b) => ({ ...b, cx: b.x + CABLE_W / 2 })),
        t.x + TRAY_W / 2,
      );
      const color = (e: End) => {
        const cb = cableInfo.find((b) => b.key === e.c)!;
        return fiberColor(Number(e.p.slice(1)), cb.cable.fibers_per_tube).hex;
      };
      const mk = (e: End, i: number, side: -1 | 1): Port => ({
        end: e,
        x: side < 0 ? t.x : t.x + TRAY_W,
        y: t.y + TRAY_TOP + (i + 0.5) * ROW,
        dir: side,
        color: color(e),
        label: e.p.slice(1),
      });
      map.set(t.id, { left, right, h: trayHeightFor(left.length, right.length), ports: [...left.map((e, i) => mk(e, i, -1)), ...right.map((e, i) => mk(e, i, 1))] });
    }
    return map;
  }, [blocks, diagram.trays]);
  const trayHeight = (t: SpliceTray) => trayGeo.get(t.id)?.h ?? trayHeightFor(0, 0);

  const ports = useMemo(() => [...blocks.flatMap(blockPorts), ...[...trayGeo.values()].flatMap((g) => g.ports)], [blocks, trayGeo]);
  const portOf = (e: End) => ports.find((p) => sameEnd(p.end, e));
  const validConnections = diagram.connections.filter((c) => portOf(c.a) && portOf(c.b));
  const connectedTo = (e: End) => validConnections.find((c) => sameEnd(c.a, e) || sameEnd(c.b, e));

  // ---------- Rotas: grupos com tudo o que vem à frente de um cabo (ou de uma fibra) ----------
  const rotaComps = diagram.components.filter((c): c is RouteComp => c.kind === 'route');
  const rotaEnv: RouteEnv = useMemo(
    () => ({
      kindOf: (key) => {
        const b = blocks.find((x) => x.key === key);
        if (!b) return undefined;
        if (b.kind === 'cable') return b.client ? 'drop' : 'cable';
        return b.kind === 'splitter' || b.kind === 'client' ? b.kind : 'other';
      },
      outputs: (key) => {
        const b = blocks.find((x) => x.key === key);
        return b?.kind === 'splitter' ? splitterModel(b.model).outputs : 0;
      },
    }),
    [blocks],
  );
  /** Caixa ocupada pelos objetos (para a moldura da rota expandida e para onde o cartão aparece). */
  const groupBox = (keys: string[]) => {
    let x1 = Infinity;
    let y1 = Infinity;
    let x2 = -Infinity;
    let y2 = -Infinity;
    keys.forEach((k) => {
      const b = blocks.find((x) => x.key === k);
      if (!b) return;
      const box = b.kind === 'splitter' ? (({ box: bx }) => ({ ...bx, h: bx.h + 18 }))(splitterFrame(b)) : { x: b.x, y: b.y, ...blockSize(b) };
      x1 = Math.min(x1, box.x);
      y1 = Math.min(y1, box.y);
      x2 = Math.max(x2, box.x + box.w);
      y2 = Math.max(y2, box.y + box.h);
    });
    if (x1 === Infinity) return null;
    const pad = 14;
    return { x: x1 - pad, y: y1 - pad, w: x2 - x1 + pad * 2, h: y2 - y1 + pad * 2 };
  };
  const rotaGeo = useMemo(() => {
    const valid = diagram.connections.filter((c) => portOf(c.a) && portOf(c.b));
    /** Objeto escondido -> rota recolhida que o contém (o primeiro grupo ganha). */
    const hidden = new Map<string, string>();
    const geo = new Map<
      string,
      { r: RouteComp; members: string[]; box: { x: number; y: number; w: number; h: number } | null; ports: Map<string, Port>; internal: Set<string> }
    >();
    for (const r of rotaComps) {
      const members = routeMembers({ connections: valid }, r, rotaEnv);
      const ports = new Map<string, Port>();
      const internal = new Set<string>();
      if (r.open) {
        geo.set(r.id, { r, members, box: groupBox(members), ports, internal });
        continue;
      }
      const mine = new Set(members.filter((k) => !hidden.has(k)));
      mine.forEach((k) => hidden.set(k, r.id));
      const left: { id: string; y: number }[] = [];
      const right: { id: string; y: number }[] = [];
      valid.forEach((c) => {
        const a = mine.has(c.a.c);
        const b = mine.has(c.b.c);
        if (a && b) internal.add(c.id);
        else if (a || b) {
          const out = portOf(a ? c.b : c.a)!;
          (out.x < r.x + ROTA_W / 2 ? left : right).push({ id: c.id, y: out.y });
        }
      });
      // Resumo + pior sinal + lista (até ROTA_LIST) + "+ N objeto(s)".
      const lines = 2 + Math.max(1, Math.min(members.length, ROTA_LIST)) + (members.length > ROTA_LIST ? 1 : 0);
      const h = Math.max(HEADER + lines * 12 + 12, HEADER + 8 + Math.max(left.length, right.length) * ROW);
      const place = (list: { id: string; y: number }[], side: -1 | 1) => {
        const top = r.y + (h - list.length * ROW) / 2;
        list
          .sort((p, q) => p.y - q.y)
          .forEach((q, i) =>
            ports.set(q.id, { end: { c: r.id, p: `v${i}` }, x: side < 0 ? r.x : r.x + ROTA_W, y: top + (i + 0.5) * ROW, dir: side, color: ROTA_COLOR, label: '' }),
          );
      };
      place(left, -1);
      place(right, 1);
      geo.set(r.id, { r, members, box: { x: r.x, y: r.y, w: ROTA_W, h }, ports, internal });
    }
    return { geo, hidden };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagram, blocks, ports, rotaEnv]);
  const rotaHidden = rotaGeo.hidden;
  /** Ponta desenhada da ligação: a porta real ou, se o objeto está numa rota recolhida, a porta no cartão da rota. */
  const dispPort = (c: Connection, e: End): Port | undefined => {
    const rid = rotaHidden.get(e.c);
    return rid ? rotaGeo.geo.get(rid)?.ports.get(c.id) : portOf(e);
  };
  const rotaInternal = (c: Connection) => {
    const rid = rotaHidden.get(c.a.c);
    return !!rid && rid === rotaHidden.get(c.b.c);
  };

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

  // Por que a potência não aparece: motivo(s) das saídas de splitter sem caminho até uma OLT.
  const powerProblems = useMemo(() => {
    const errs = new Set<string>();
    let ok = 0;
    splitterPower.forEach((r) => (r.ok ? ok++ : r.error && errs.add(r.error)));
    return { ok, errors: [...errs] };
  }, [splitterPower]);

  // Potência que chega em cada cliente do diagrama.
  const clientPower = useMemo(() => {
    const map = new Map<string, BudgetResult>();
    diagram.components.filter((c) => c.kind === 'client').forEach((c) => map.set(c.id, traceUpstream(liveNetwork, node.id, { c: c.id, p: 'in' })));
    // Clientes do mapa ligados por drop: a potência que chega neles pelo drop.
    blocks.forEach((b) => {
      if (b.kind === 'cable' && b.client) map.set(b.key, clientBudget(liveNetwork, b.client));
    });
    return map;
  }, [diagram, liveNetwork, node.id, blocks]);

  // Sinal medido × estimado de cada cliente do diagrama: saúde e trecho provável do problema.
  const clientSignal = useMemo(() => {
    const map = new Map<string, SignalAnalysis>();
    const peers = measuredClients(liveNetwork);
    diagram.components.forEach((c) => {
      if (c.kind !== 'client') return;
      const budget = clientPower.get(c.id);
      if (!budget) return;
      const key = c.node_id ? `n${c.node_id}` : `d${node.id}:${c.id}`;
      map.set(c.id, analyzeSignal(liveNetwork, { key, measured: c.rx_dbm, measuredAt: c.rx_at, budget }, peers));
    });
    blocks.forEach((b) => {
      if (b.kind !== 'cable' || !b.client) return;
      const budget = clientPower.get(b.key);
      if (!budget) return;
      const data = clientDataOf(b.client.attributes);
      map.set(b.key, analyzeSignal(liveNetwork, { key: `n${b.client.id}`, measured: data.rx_dbm, measuredAt: data.rx_at, budget }, peers));
    });
    return map;
  }, [diagram, liveNetwork, clientPower, node.id, blocks]);

  // ---------- Interação ----------
  const toWorld = (clientX: number, clientY: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: (clientX - r.left - view.x) / view.k, y: (clientY - r.top - view.y) / view.k };
  };

  function onPointerDown(e: React.PointerEvent, key?: string) {
    if (e.button !== 0) return;
    e.stopPropagation();
    const mod = e.ctrlKey || e.metaKey || e.shiftKey;
    if (!key && mod) {
      // Fundo com Ctrl/Shift: retângulo de seleção.
      drag.current = { box: toWorld(e.clientX, e.clientY), sx: e.clientX, sy: e.clientY, ox: 0, oy: 0, moved: false, mod };
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      return;
    }
    if (key && !mod && !readOnly && pickedHas(key) && pickedCount(picked) > 1) {
      // Arrastar um dos selecionados leva todos juntos.
      drag.current = { key, group: pickedGroup(), sx: e.clientX, sy: e.clientY, ox: 0, oy: 0, moved: false };
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      return;
    }
    const b = key ? (blocks.find((x) => x.key === key) ?? diagram.trays?.find((t) => t.id === key) ?? rotaComps.find((r) => r.id === key)) : undefined;
    const rota = key ? rotaGeo.geo.get(key) : undefined;
    const group =
      rota?.r.open && !readOnly
        ? rota.members.flatMap((k) => {
            const m = blocks.find((x) => x.key === k);
            return m ? [{ key: k, x: m.x, y: m.y, side: m.kind === 'cable' ? m.side : undefined, cable: m.kind === 'cable' }] : [];
          })
        : undefined;
    drag.current = { key, group, sx: e.clientX, sy: e.clientY, ox: b ? b.x : view.x, oy: b ? b.y : view.y, moved: false, mod };
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
    if (d.box) {
      setMarquee(rectFrom(d.box, toWorld(e.clientX, e.clientY)));
      return;
    }
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
    if (d.group) {
      const ox = Math.round(dx / view.k / 2) * 2;
      const oy = Math.round(dy / view.k / 2) * 2;
      const start = new Map(d.group.map((g) => [g.key, g]));
      setDiagram((dg) => {
        const cablePos = { ...dg.cablePos };
        d.group!.forEach((g) => {
          if (g.cable) cablePos[g.key] = { ...dg.cablePos[g.key], side: g.side, x: g.x + ox, y: g.y + oy };
        });
        return {
          ...dg,
          cablePos,
          trays: dg.trays?.map((t) => {
            const g = start.get(t.id);
            return g?.tray ? { ...t, x: g.x + ox, y: g.y + oy } : t;
          }),
          components: dg.components.map((c) => {
            const g = start.get(c.id);
            return g ? { ...c, x: g.x + ox, y: g.y + oy } : c.id === d.key ? { ...c, x: d.ox + ox, y: d.oy + oy } : c;
          }),
        };
      });
      setDirty(true);
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
    if (d?.box) {
      const r = marquee;
      setMarquee(null);
      if (d.moved && r && isMarquee(r)) pickInRect(r);
      return;
    }
    if (d && !d.moved && !d.lane) {
      const kind = diagram.trays?.some((t) => t.id === d.key) ? 'tray' : 'block';
      if (d.key && d.mod) togglePick(kind === 'tray' ? 'trays' : 'blocks', d.key);
      else if (d.key) {
        setPicked(null);
        setSelected({ kind, key: d.key });
      } else {
        setSelected(null);
        setPicked(null);
        setPending(null);
      }
    }
  }

  // ---------- Seleção múltipla ----------
  const pickedHas = (key: string) => !!picked && (picked.blocks.includes(key) || picked.trays.includes(key));
  /** Ponto de partida de cada selecionado, para arrastar todos juntos. */
  function pickedGroup() {
    if (!picked) return [];
    return [
      ...picked.blocks.flatMap((k) => {
        const m = blocks.find((x) => x.key === k);
        if (m) return [{ key: k, x: m.x, y: m.y, side: m.kind === 'cable' ? m.side : undefined, cable: m.kind === 'cable' }];
        const r = rotaComps.find((x) => x.id === k);
        return r ? [{ key: k, x: r.x, y: r.y, cable: false }] : [];
      }),
      ...picked.trays.flatMap((k) => {
        const t = diagram.trays?.find((x) => x.id === k);
        return t ? [{ key: k, x: t.x, y: t.y, cable: false, tray: true }] : [];
      }),
    ];
  }
  /** Ctrl+clique: soma ou tira da seleção (o selecionado simples entra junto). */
  function togglePick(kind: 'blocks' | 'trays' | 'conns', key: string) {
    const base: Picked = picked ? { ...picked } : { blocks: [], trays: [], conns: [] };
    if (selected && !picked) {
      const k = selected.kind === 'conn' ? 'conns' : selected.kind === 'tray' ? 'trays' : 'blocks';
      base[k] = [...base[k], selected.key];
    }
    base[kind] = base[kind].includes(key) ? base[kind].filter((x) => x !== key) : [...base[kind], key];
    setSelected(null);
    setPending(null);
    setPicked(pickedCount(base) ? base : null);
  }
  /** Marca o que encosta no retângulo (fusões: as duas pontas dentro). Soma ao que já estava marcado. */
  function pickInRect(r: Rect) {
    const found: Picked = { blocks: [], trays: [], conns: [] };
    blocks.forEach((b) => {
      if (rotaHidden.has(b.key)) return;
      const box = b.kind === 'splitter' ? splitterFrame(b).box : { x: b.x, y: b.y, ...blockSize(b) };
      if (intersects(r, box)) found.blocks.push(b.key);
    });
    rotaGeo.geo.forEach((g) => {
      if (!g.r.open && g.box && intersects(r, g.box)) found.blocks.push(g.r.id);
    });
    (diagram.trays ?? []).forEach((t) => {
      if (intersects(r, { x: t.x, y: t.y, w: TRAY_W, h: trayHeight(t) })) found.trays.push(t.id);
    });
    validConnections.forEach((c) => {
      if (rotaInternal(c)) return;
      const a = dispPort(c, c.a);
      const b = dispPort(c, c.b);
      if (a && b && pointIn(r, a) && pointIn(r, b)) found.conns.push(c.id);
    });
    const base: Picked = picked ?? { blocks: [], trays: [], conns: [] };
    if (selected && !picked) {
      const k = selected.kind === 'conn' ? 'conns' : selected.kind === 'tray' ? 'trays' : 'blocks';
      base[k] = [...base[k], selected.key];
    }
    const join = (x: string[], y: string[]) => [...new Set([...x, ...y])];
    const next: Picked = { blocks: join(base.blocks, found.blocks), trays: join(base.trays, found.trays), conns: join(base.conns, found.conns) };
    setPending(null);
    if (pickedCount(next) === 1) {
      setPicked(null);
      setSelected(next.conns.length ? { kind: 'conn', key: next.conns[0] } : next.trays.length ? { kind: 'tray', key: next.trays[0] } : { kind: 'block', key: next.blocks[0] });
      return;
    }
    setSelected(null);
    setPicked(pickedCount(next) ? next : null);
  }
  /** "2 splitters, 1 bandeja e 14 fusões". */
  function pickedSummary(p: Picked): string {
    const kinds = new Map<string, number>();
    p.blocks.forEach((k) => {
      const b = blocks.find((x) => x.key === k);
      const label = rotaComps.some((x) => x.id === k) ? 'grupo' : !b ? '' : b.kind === 'cable' ? (b.client ? 'drop' : 'cabo') : b.kind;
      if (label) kinds.set(label, (kinds.get(label) ?? 0) + 1);
    });
    const names: Record<string, [string, string]> = {
      cabo: ['cabo', 'cabos'],
      drop: ['drop', 'drops'],
      splitter: ['splitter', 'splitters'],
      client: ['cliente', 'clientes'],
      olt: ['OLT', 'OLTs'],
      dio: ['DIO', 'DIOs'],
      active: ['ativo', 'ativos'],
      grupo: ['grupo', 'grupos'],
    };
    const parts = [...kinds.entries()].map(([k, n]) => countLabel(n, ...(names[k] ?? [k, k])));
    if (p.trays.length) parts.push(countLabel(p.trays.length, 'bandeja', 'bandejas'));
    if (p.conns.length) parts.push(countLabel(p.conns.length, 'fusão/passagem', 'fusões/passagens'));
    return joinCounts(parts);
  }
  /** Delete com vários marcados: pergunta uma vez. Cabos e drops do mapa não são excluídos aqui, só as fusões deles nesta caixa. */
  function removePicked() {
    if (!picked) return;
    const cableKeys = new Set(picked.blocks.filter((k) => blocks.some((b) => b.key === k && b.kind === 'cable')));
    const comps = new Set(picked.blocks.filter((k) => diagram.components.some((c) => c.id === k)));
    const ends = new Set([...cableKeys, ...comps]);
    const conns = new Set(picked.conns);
    const total = pickedCount(picked);
    const note = cableKeys.size ? ' Dos cabos selecionados saem só as fusões nesta caixa (o cabo continua no mapa).' : '';
    if (!confirm(`Apagar ${total} itens selecionados (${pickedSummary(picked)})?${note} Ctrl+Z desfaz.`)) return;
    const trayIds = new Set(picked.trays);
    update((d) => ({
      ...d,
      components: d.components.filter((c) => !comps.has(c.id)),
      trays: d.trays ? d.trays.filter((t) => !trayIds.has(t.id)) : d.trays,
      connections: d.connections.filter((c) => !conns.has(c.id) && !ends.has(c.a.c) && !ends.has(c.b.c)),
    }));
    setPicked(null);
    setSelected(null);
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
      // Cabo: pergunta se apaga só as emendas nesta caixa ou o cabo inteiro (do mapa).
      setCableDelete(selected.key);
      return;
    }
    setSelected(null);
  }

  /** Girar: no cabo, troca o lado das fibras; no splitter, espelha (entrada ↔ saídas). */
  function rotateSelected() {
    const b = selected?.kind === 'block' ? blocks.find((x) => x.key === selected.key) : undefined;
    if (!b) {
      setError('Selecione um cabo, splitter ou cliente para girar.');
      return;
    }
    if (b.kind === 'cable') {
      update((d) => ({ ...d, cablePos: { ...d.cablePos, [b.key]: { x: b.x, y: b.y, side: b.side === 'left' ? 'right' : 'left' } } }));
    } else if (b.kind === 'client') {
      update((d) => ({ ...d, components: d.components.map((c) => (c.id === b.key && c.kind === 'client' ? { ...c, flip: !c.flip } : c)) }));
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

  /** Fibra (do cabo) de onde parte a rota, se o selecionado é uma emenda; o cabo inteiro, se é o cabo. */
  function rotaRoots(): { cable: string; fiber: string | null }[] {
    if (selBlock?.kind === 'cable' && !selBlock.client) return [{ cable: selBlock.key, fiber: null }];
    if (!selConn) return [];
    return [selConn.a, selConn.b].filter((e) => e.p.startsWith('f') && cableBlockOf(e.c) && !cableBlockOf(e.c)!.client).map((e) => ({ cable: e.c, fiber: e.p }));
  }

  /** Criar rota: tudo o que vem à frente do cabo (ou da fibra da emenda selecionada) vai para um cartão recolhido. */
  function createRota() {
    const roots = rotaRoots();
    if (!roots.length) {
      setError('Selecione um cabo (ou a emenda de uma fibra dele) para criar o grupo.');
      return;
    }
    const existing = rotaComps.find((r) => roots.some((x) => x.cable === r.cable && x.fiber === (r.fiber ?? null)));
    if (existing) {
      setSelected({ kind: 'block', key: existing.id });
      toggleRota(existing.id);
      return;
    }
    const pick = roots.map((x) => ({ ...x, members: routeMembers({ connections: validConnections }, x, rotaEnv) })).find((x) => x.members.length);
    if (!pick) {
      setError('Nada ligado à frente desse cabo: faça as fusões até os splitters e clientes antes de criar o grupo.');
      return;
    }
    const box = groupBox(pick.members)!;
    const cable = cableBlockOf(pick.cable)!;
    const r: RouteComp = { id: uid(), kind: 'route', name: routeName(cable.cable.name, pick.fiber), cable: pick.cable, fiber: pick.fiber, open: false, x: box.x, y: box.y };
    update((d) => ({ ...d, components: [...d.components, r] }));
    setSelected({ kind: 'block', key: r.id });
    setPending(null);
    setError('');
  }

  /** Expandir / recolher: ao recolher, o cartão aparece onde estava o grupo. */
  function toggleRota(id: string) {
    const g = rotaGeo.geo.get(id);
    if (!g) return;
    const box = g.r.open ? groupBox(g.members) : null;
    setSelected({ kind: 'block', key: id });
    setPending(null);
    update((d) => ({
      ...d,
      components: d.components.map((c) => (c.id === id && c.kind === 'route' ? { ...c, open: !c.open, ...(box ? { x: box.x, y: box.y } : {}) } : c)),
    }));
  }

  function renameRota(id: string, name: string) {
    update((d) => ({ ...d, components: d.components.map((c) => (c.id === id && c.kind === 'route' ? { ...c, name } : c)) }));
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
    // Clientes numa coluna à direita dos cabos da direita, com a porta virada para o diagrama.
    let cy = -60 - maxH;
    diagram.components
      .filter((c) => c.kind === 'client')
      .forEach((c) => {
        pos.set(c.id, { x: CABLE_W * 2 + gapX + 90, y: cy });
        cy += CLIENT_H + 16;
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
      components: d.components.map((c) => (pos.has(c.id) ? { ...c, ...pos.get(c.id)!, ...(c.kind === 'client' ? { flip: false } : {}) } : c)),
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

  /**
   * Sangria: o cabo de entrada continua no de saída. As fibras com emenda ficam como estão; as livres
   * nos dois cabos (mesmo número) passam direto, sem fusão e sem perda.
   */
  function sangria(fromKey: string, toKey: string) {
    const from = blocks.find((b) => b.key === fromKey);
    const to = blocks.find((b) => b.key === toKey);
    if (!from || !to || from.kind !== 'cable' || to.kind !== 'cable') return;
    const toPorts = new Map(blockPorts(to).filter((p) => p.end.p.startsWith('f')).map((p) => [p.end.p, p]));
    const created: Connection[] = [];
    for (const fp of blockPorts(from).filter((p) => p.end.p.startsWith('f'))) {
      const tp = toPorts.get(fp.end.p);
      if (!tp || connectedTo(fp.end) || connectedTo(tp.end)) continue;
      created.push({ id: uid(), a: fp.end, b: tp.end, pass: true });
    }
    update((d) => ({ ...d, connections: [...d.connections, ...created] }));
    setDialog(null);
    setError(created.length ? '' : 'Nenhuma passagem criada: as fibras já estão ocupadas.');
  }

  async function save(close: boolean) {
    try {
      const trays = diagram.trays?.length ? pruneTrays(diagram.trays, cables) : undefined;
      const r = await api.updateNode(node.id, { diagram: { ...diagram, connections: validConnections, trays }, status });
      onSaved(r.node, r.clients);
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
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (picked) removePicked();
        else removeSelected();
      }
      else if (e.key === 'r' || e.key === 'R') rotateSelected();
      else if (e.key === 'f' || e.key === 'F') setTool('fuse');
      else if (e.key === 'p' || e.key === 'P') setTool('pass');
      else if (e.key === 'c' || e.key === 'C') setTool('connector');
      else if (e.key === 's' || e.key === 'S') setDialog('splitter');
      else if (e.key === 'b' || e.key === 'B') setDialog('trays');
      else if ((e.key === 'g' || e.key === 'G') && !isPop) {
        if (selRota) toggleRota(selRota.r.id);
        else createRota();
      }
      else if ((e.key === 'k' || e.key === 'K') && !isPop) {
        setClientEdit(null);
        setDialog('client');
      }
      else if (e.key === '?') setShowHelp((v) => !v);
      if (e.key === 'Escape') {
        setPending(null);
        setSelected(null);
        setPicked(null);
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
  const selRota = selected?.kind === 'block' ? rotaGeo.geo.get(selected.key) : undefined;
  const rotaFrom = (r: RouteComp) => {
    const cb = blocks.find((b): b is Extract<Block, { kind: 'cable' }> => b.kind === 'cable' && b.key === r.cable);
    if (!cb) return 'cabo removido';
    return `Cabo ${cb.letter}${r.fiber ? ` · FO ${r.fiber.slice(1)} ${fiberColor(Number(r.fiber.slice(1)), cb.cable.fibers_per_tube).name}` : ` · ${cb.cable.name}`}`;
  };
  /** Resumo do grupo: quantos splitters e clientes e o pior sinal estimado (ou medido) nos clientes. */
  const rotaSummary = (members: string[]) => {
    const items = members.map((k) => blocks.find((b) => b.key === k)).filter((b): b is Block => !!b);
    const splitters = items.filter((b) => b.kind === 'splitter').length;
    const clients = items.filter(isClientBlock);
    const powers = clients.map((b) => clientSignal.get(b.key)?.measured ?? clientPower.get(b.key)?.power ?? null).filter((v): v is number => v !== null);
    const worst = powers.length ? Math.min(...powers) : null;
    const list = items.map((b) =>
      b.kind === 'splitter'
        ? `◁ ${b.name || splitterModel(b.model).name}`
        : b.kind === 'cable' && b.client
          ? `⌂ ${b.client.name}`
          : b.kind === 'client'
            ? `⌂ ${b.name}`
            : b.key,
    );
    return { splitters, clients: clients.length, worst, worstColor: POWER_COLORS[powerLevel(worst, network.settings)], list };
  };
  const isCablePort = (p: Port) => p.end.c.startsWith('c') && p.end.p.startsWith('f') && !diagram.components.some((c) => c.id === p.end.c);
  const describe = (e: End) => {
    const b = blocks.find((x) => x.key === e.c);
    if (!b) return e.p;
    if (b.kind === 'cable' && b.client) return `Cliente ${b.client.name} (drop${b.cable.fiber_count > 1 ? ` · FO ${e.p.slice(1)}` : ''})`;
    if (b.kind === 'cable') {
      const t = trayOfFiber(diagram, cables, e.c, e.p);
      return `Cabo ${b.letter} · FO ${e.p.slice(1)} ${fiberColor(Number(e.p.slice(1)), b.cable.fibers_per_tube).name}${t ? ` · ${t.name}` : ''}`;
    }
    if (b.kind === 'splitter') return `${b.name || splitterModel(b.model).name} · ${e.p === 'in' ? 'entrada' : `saída ${e.p.slice(1)}`}`;
    if (b.kind === 'client') return `Cliente ${b.name}`;
    return `${b.name} · ${e.p}`;
  };

  // Bandejas: ocupação e linhas tracejadas do tubo loose (borda externa do cabo) até a linha dele na bandeja.
  const trays = diagram.trays ?? [];
  const usage = trayUsage({ trays, connections: validConnections }, cables);
  const cableBlockOf = (key: string) => blocks.find((b): b is Extract<Block, { kind: 'cable' }> => b.kind === 'cable' && b.key === key);
  // Porta da bandeja de cada FO vinculada ("c1:f3" -> id da bandeja) e emendas internas (as duas pontas na mesma bandeja).
  const portTray = new Map<string, string>();
  trayGeo.forEach((g, id) => g.ports.forEach((p) => portTray.set(`${p.end.c}:${p.end.p}`, id)));
  const trayOfEnd = (e: End) => portTray.get(`${e.c}:${e.p}`);
  const internalTray = (c: Connection) => {
    const ta = trayOfEnd(c.a);
    return ta && ta === trayOfEnd(c.b) ? ta : undefined;
  };
  const traySummary = (id: string) => {
    const g = trayGeo.get(id);
    if (!g) return { fusions: 0, crossed: 0, free: 0 };
    const inner = validConnections.filter((c) => internalTray(c) === id && !c.pass);
    const idx = (e: End) => {
      const l = g.left.findIndex((x) => sameEnd(x, e));
      return l >= 0 ? { side: 'l', i: l } : { side: 'r', i: g.right.findIndex((x) => sameEnd(x, e)) };
    };
    const crossed = inner.filter((c) => {
      const a = idx(c.a);
      const b = idx(c.b);
      return a.side !== b.side && a.i !== b.i;
    }).length;
    const free = g.ports.filter((p) => !connectedTo(p.end)).length;
    return { fusions: inner.length, crossed, free };
  };

  // Derivação do tubo loose: linha grossa na cor do tubo, do cabo até um ponto ao lado da bandeja, e dali um leque até as FO.
  const tubeLinks = (() => {
    const reqs: { id: string; color: string; fan: Pt; ports: Port[]; a: { x: number; y: number; dir: 1 | -1 }; b: { x: number; y: number; dir: 1 | -1 } }[] = [];
    blocks.forEach((b) => {
      if (b.kind !== 'cable' || rotaHidden.has(b.key)) return;
      b.rows.forEach((r) => {
        if (r.kind !== 'tube') return;
        const g = trayGeo.get(r.tray.id);
        if (!g) return;
        // O tubo sai pela borda do cabo voltada para a bandeja.
        const inner = b.x + CABLE_W / 2 < r.tray.x + TRAY_W / 2;
        const [f1, f2] = tubeFibers(r.tube, b.cable);
        const tp = g.ports.filter((p) => p.end.c === b.key && Number(p.end.p.slice(1)) >= f1 && Number(p.end.p.slice(1)) <= f2);
        if (!tp.length) return;
        const left = tp[0].dir < 0;
        const fan = { x: left ? r.tray.x - 26 : r.tray.x + TRAY_W + 26, y: (tp[0].y + tp[tp.length - 1].y) / 2 };
        reqs.push({
          id: `${b.key}:t${r.tube}`,
          color: tubeColor(f1, b.cable.fibers_per_tube).hex,
          fan,
          ports: tp,
          a: { x: inner ? b.x + CABLE_W : b.x, y: b.y + HEADER + r.y + r.h / 2, dir: inner ? 1 : -1 },
          b: { x: fan.x, y: fan.y, dir: left ? -1 : 1 },
        });
      });
    });
    const r = routeOrthogonal(reqs, { stub: 14, gap: 8 });
    return reqs.map((q) => ({ ...q, pts: r.get(q.id)! }));
  })();

  // Rotas das emendas dentro de cada bandeja (pistas entre os dois lados, por dentro do cartão).
  const innerRoutes = (() => {
    const out = new Map<string, Pt[]>();
    trayGeo.forEach((_, id) => {
      const reqs = validConnections
        .filter((c) => internalTray(c) === id)
        .map((c) => {
          const a = portOf(c.a)!;
          const b = portOf(c.b)!;
          return { id: c.id, a: { x: a.x, y: a.y, dir: (-a.dir) as 1 | -1 }, b: { x: b.x, y: b.y, dir: (-b.dir) as 1 | -1 } };
        });
      routeOrthogonal(reqs, { stub: 44, gap: 5 }).forEach((v, k) => out.set(k, v));
    });
    return out;
  })();

  // Rotas das fibras: em ângulo reto (padrão, uma pista por fibra) ou em curva.
  const routes = useMemo(() => {
    if (route !== 'ortho') return new Map<string, Pt[]>();
    return routeOrthogonal(
      validConnections
        .filter((c) => !rotaInternal(c))
        .map((c) => {
          const a = dispPort(c, c.a)!;
          const b = dispPort(c, c.b)!;
          return { id: c.id, a: { x: a.x, y: a.y, dir: a.dir, vdir: a.vdir }, b: { x: b.x, y: b.y, dir: b.dir, vdir: b.vdir }, lane: c.lane };
        }),
      { stub: 16, gap: 6 },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, ports, diagram.connections, rotaGeo]);

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
        {!isPop && (
          <IconTool
            icon={<UserRound size={16} />}
            label="Adicionar cliente (K): ligue uma saída de splitter (ou fibra) ao cliente"
            text="Cliente"
            onClick={() => {
              setClientEdit(null);
              setDialog('client');
            }}
          />
        )}
        {isPop && <IconTool icon={<Server size={16} />} label="Adicionar OLT" text="OLT" onClick={() => setDialog('olt')} />}
        {isPop && <IconTool icon={<SquareStack size={16} />} label="Adicionar DIO" text="DIO" onClick={() => setDialog('dio')} />}
        {!isPop && !readOnly && (
          <IconTool
            icon={<Group size={16} />}
            label={
              selRota
                ? `${selRota.r.open ? 'Recolher' : 'Expandir'} o grupo (G)`
                : 'Criar grupo (G): com um cabo ou a emenda de uma fibra selecionada, junta tudo o que vem à frente dele (splitters, clientes, drops) num objeto Grupo recolhido'
            }
            text={selRota ? (selRota.r.open ? 'Recolher grupo' : 'Expandir grupo') : 'Grupo'}
            onClick={() => (selRota ? toggleRota(selRota.r.id) : createRota())}
            disabled={!selRota && !rotaRoots().length}
          />
        )}
        <IconTool icon={<Wand2 size={16} />} label="Auto-fusão: funde as fibras em sequência entre dois cabos" onClick={() => setDialog('auto')} />
        {!isPop && !readOnly && (
          <IconTool
            icon={<Split size={16} />}
            label="Sangria: o cabo de entrada segue no de saída; as fibras livres passam direto (passagem) e as emendas ficam como estão"
            text="Sangria"
            onClick={() => setDialog('sangria')}
            disabled={blocks.filter((b) => b.kind === 'cable').length < 2}
          />
        )}
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
        <IconTool icon={<RotateCw size={16} />} label="Girar o selecionado (R): cabo e cliente trocam de lado, splitter gira 90°" onClick={rotateSelected} disabled={!selBlock || (selBlock.kind !== 'cable' && selBlock.kind !== 'splitter' && selBlock.kind !== 'client')} />
        <IconTool icon={<Copy size={16} />} label="Duplicar splitter (Ctrl+D)" onClick={duplicateSelected} disabled={selBlock?.kind !== 'splitter'} />
        <IconTool
          icon={<Trash2 size={16} />}
          label={
            selConn
              ? selConn.pass
                ? 'Apagar passagem (Delete)'
                : 'Apagar emenda (Delete)'
              : selBlock?.kind === 'cable'
                ? 'Apagar emendas ou o cabo (Delete)'
                : selRota
                  ? 'Desfazer o grupo (Delete): os objetos continuam no diagrama'
                  : 'Apagar o selecionado (Delete)'
          }
          onClick={() => (picked ? removePicked() : removeSelected())}
          disabled={!selected && !picked}
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
        {picked && (
          <div className="absolute left-1/2 bottom-3 z-10 -translate-x-1/2 flex items-center gap-2 rounded-lg border border-yellow-500 bg-white/95 px-3 py-1.5 text-xs text-slate-700 shadow">
            <span>
              <b>{pickedCount(picked)} selecionados</b> · {pickedSummary(picked)}
              {!readOnly && <span className="text-slate-500"> · arraste um deles para mover todos · Delete apaga</span>}
            </span>
            {!readOnly && (
              <button className="rounded bg-red-600 px-2 py-0.5 font-medium text-white hover:bg-red-500 cursor-pointer" onClick={removePicked} title="Delete">
                Apagar
              </button>
            )}
            <button className="rounded border border-slate-300 px-2 py-0.5 hover:bg-slate-100 cursor-pointer" onClick={() => setPicked(null)} title="Esc">
              Limpar
            </button>
          </div>
        )}
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
              {/* Rotas expandidas: moldura em volta dos objetos, com a aba para recolher e arrastar o grupo. */}
              {[...rotaGeo.geo.values()].map((g) =>
                !g.r.open || !g.box ? null : (
                  <RotaFrame
                    key={g.r.id}
                    rota={g.r}
                    box={g.box}
                    count={g.members.length}
                    selected={selected?.kind === 'block' && selected.key === g.r.id}
                    onPointerDown={(e) => onPointerDown(e, g.r.id)}
                    onToggle={() => toggleRota(g.r.id)}
                  />
                ),
              )}

              {/* Conexões */}
              {validConnections.map((c) => {
                if (internalTray(c) || rotaInternal(c)) return null;
                const a = dispPort(c, c.a)!;
                const b = dispPort(c, c.b)!;
                const aCable = isCablePort(a);
                const cablePort = aCable ? a : isCablePort(b) ? b : undefined;
                const color = cablePort?.color ?? '#334155';
                const pts = routes.get(c.id);
                const d = pts ? polylinePath(pts) : curvePath(a, b);
                const isSel = (selected?.kind === 'conn' && selected.key === c.id) || !!picked?.conns.includes(c.id);
                // Emenda desenhada sobre a fibra, perto da ponta do cabo (fibras vizinhas ficam em coluna).
                const splice = !c.pass ? (pts ? spliceAnchor(pts, aCable || !cablePort ? 'a' : 'b') : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, vertical: false }) : null;
                return (
                  <g
                    key={c.id}
                    className="cursor-pointer"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (e.ctrlKey || e.metaKey || e.shiftKey) return togglePick('conns', c.id);
                      setPicked(null);
                      setSelected({ kind: 'conn', key: c.id });
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setSelected({ kind: 'conn', key: c.id });
                      if (!c.pass) setJointEdit(c.id);
                    }}
                  >
                    <title>{c.pass ? 'Passagem (sem perda)' : `${jointName(c)} · ${formatDb(jointLoss(c, network.settings))} (duplo clique para editar)`}</title>
                    <path d={d} fill="none" stroke="transparent" strokeWidth={10} />
                    <path d={d} fill="none" stroke={isSel ? '#facc15' : '#0f172a'} strokeWidth={isSel ? 6 : 4} strokeOpacity={isSel ? 1 : 0.55} strokeLinejoin="round" />
                    <path d={d} fill="none" stroke={color} strokeWidth={2.4} strokeDasharray={c.pass ? '6 4' : undefined} strokeLinejoin="round" />
                    {splice && (c.joint === 'connector' ? <ConnectorMark x={splice.x} y={splice.y} vertical={splice.vertical} selected={isSel} /> : <SpliceMark x={splice.x} y={splice.y} vertical={splice.vertical} selected={isSel} />)}
                    {(() => {
                      // Drop até o cliente do mapa: a própria linha é o drop, com o nome e o comprimento.
                      const drop = [c.a, c.b].map((e) => cableBlockOf(e.c)).find((x) => x?.client);
                      if (!drop || rotaHidden.has(drop.key)) return null;
                      // Rótulo no trecho que chega no cliente (longe das saídas do splitter).
                      const line = pts ?? [a, b];
                      const atB = cableBlockOf(c.b.c)?.client !== undefined;
                      const [p1, p2] = atB ? [line[line.length - 2], line[line.length - 1]] : [line[1], line[0]];
                      const best = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
                      const text = `${drop.cable.name} · ${Math.round(drop.cable.length_m ?? 0)} m`;
                      const tw = text.length * 4.6 + 10;
                      return (
                        <g
                          className="cursor-pointer"
                          onClick={(e) => e.stopPropagation()}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            setCableEdit(drop.cable.id);
                          }}
                        >
                          <title>Drop {drop.cable.name}: duplo clique para editar (atenuação, status...)</title>
                          <rect x={best.x - tw / 2} y={best.y - 22} width={tw} height={12} rx={6} fill="#ffffff" stroke={color} strokeWidth={0.8} />
                          <text x={best.x} y={best.y - 13.5} fontSize={7.5} textAnchor="middle" fill="#0f172a" fontWeight="bold">
                            {text}
                          </text>
                        </g>
                      );
                    })()}
                  </g>
                );
              })}

              {/* Ajuste do traçado em 90°: arraste a pista vertical da fibra selecionada. */}
              {selConn &&
                !readOnly &&
                !internalTray(selConn) &&
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

              {/* Derivação dos tubos loose até a bandeja */}
              {tubeLinks.map((l) => {
                const d = polylinePath(l.pts);
                return (
                  <g key={l.id} className="pointer-events-none">
                    {l.ports.map((p) => (
                      <line key={p.end.p} x1={l.fan.x} y1={l.fan.y} x2={p.x} y2={p.y} stroke={p.color === '#f8fafc' ? '#cbd5e1' : p.color} strokeWidth={1.6} />
                    ))}
                    <path d={d} fill="none" stroke="#0f172a" strokeOpacity={0.55} strokeWidth={9} strokeLinejoin="round" />
                    <path d={d} fill="none" stroke={l.color} strokeWidth={6} strokeLinejoin="round" />
                    <circle cx={l.fan.x} cy={l.fan.y} r={4} fill="#334155" />
                  </g>
                );
              })}

              {/* Blocos (os que estão numa rota recolhida ficam dentro do cartão dela) */}
              {blocks.filter((b) => !rotaHidden.has(b.key)).map((b) => (
                <BlockView
                  key={b.key}
                  showTubes={trays.length > 0}
                  block={b}
                  selected={(selected?.kind === 'block' && selected.key === b.key) || pickedHas(b.key)}
                  onPointerDown={(e) => onPointerDown(e, b.key)}
                  power={isClientBlock(b) ? clientPower.get(b.key) : undefined}
                  signal={isClientBlock(b) ? clientSignal.get(b.key) : undefined}
                  powerColor={isClientBlock(b) ? POWER_COLORS[powerLevel(clientPower.get(b.key)?.power ?? null, network.settings)] : undefined}
                  linkedName={b.kind === 'client' && b.node_id ? network.nodes.find((n) => n.id === b.node_id)?.name : undefined}
                  onDoubleClick={
                    b.kind === 'client' && !readOnly
                      ? () => {
                          setClientEdit(b.key);
                          setDialog('client');
                        }
                      : b.kind === 'splitter'
                        ? () => setSplitterEdit(b.key)
                        : b.kind === 'cable' && b.client && !readOnly
                          ? () => setDropClientEdit(b.key)
                          : b.kind === 'cable'
                            ? () => setCableEdit(b.cable.id)
                            : undefined
                  }
                />
              ))}

              {/* Bandejas (abertas: as emendas aparecem dentro do cartão) */}
              {trays.map((t) => {
                const sum = traySummary(t.id);
                return (
                  <TrayCard
                    key={t.id}
                    tray={t}
                    h={trayHeight(t)}
                    used={usage.get(t.id) ?? 0}
                    summary={sum}
                    tubes={t.tubes
                      .map((key) => {
                        const [ck, tn] = key.split(':t');
                        const b = cableBlockOf(ck);
                        return b ? `${b.letter}·T${tn}` : '';
                      })
                      .filter(Boolean)
                      .join(' + ')}
                    selected={(selected?.kind === 'tray' && selected.key === t.id) || pickedHas(t.id)}
                    onPointerDown={(e) => onPointerDown(e, t.id)}
                    onDoubleClick={() => {
                      setTrayFocus(t.id);
                      setDialog('trayEdit');
                    }}
                  />
                );
              })}
              {validConnections.map((c) => {
                const id = internalTray(c);
                const pts = id ? innerRoutes.get(c.id) : undefined;
                if (!id || !pts) return null;
                const a = portOf(c.a)!;
                const b = portOf(c.b)!;
                const left = a.dir < 0 ? a : b;
                const d = polylinePath(pts);
                const isSel = (selected?.kind === 'conn' && selected.key === c.id) || !!picked?.conns.includes(c.id);
                const crossed = a.dir !== b.dir && Math.abs(a.y - b.y) > 0.5;
                const sp = !c.pass ? spliceAnchor(pts, left === a ? 'a' : 'b', 30) : null;
                return (
                  <g
                    key={`in-${c.id}`}
                    className="cursor-pointer"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (e.ctrlKey || e.metaKey || e.shiftKey) return togglePick('conns', c.id);
                      setPicked(null);
                      setSelected({ kind: 'conn', key: c.id });
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setSelected({ kind: 'conn', key: c.id });
                      if (!c.pass) setJointEdit(c.id);
                    }}
                  >
                    <title>{c.pass ? 'Passagem (sem perda)' : `${jointName(c)} · ${formatDb(jointLoss(c, network.settings))} (duplo clique para editar)`}</title>
                    <path d={d} fill="none" stroke="transparent" strokeWidth={8} />
                    <path d={d} fill="none" stroke={isSel ? '#facc15' : '#0f172a'} strokeWidth={isSel ? 5 : 3.6} strokeOpacity={isSel ? 1 : 0.5} strokeLinejoin="round" />
                    <path d={d} fill="none" stroke={left.color} strokeWidth={2} strokeDasharray={c.pass ? '5 3' : undefined} strokeLinejoin="round" />
                    {sp &&
                      (c.joint === 'connector' ? (
                        <ConnectorMark x={sp.x} y={sp.y} vertical={sp.vertical} selected={isSel || crossed} />
                      ) : (
                        <SpliceMark x={sp.x} y={sp.y} vertical={sp.vertical} selected={isSel || crossed} />
                      ))}
                  </g>
                );
              })}

              {/* Rotas recolhidas: cartão com o resumo; as fibras que entram e saem chegam nas laterais. */}
              {[...rotaGeo.geo.values()].map((g) =>
                g.r.open || !g.box ? null : (
                  <RotaCard
                    key={g.r.id}
                    rota={g.r}
                    h={g.box.h}
                    ports={[...g.ports.values()]}
                    from={rotaFrom(g.r)}
                    summary={rotaSummary(g.members)}
                    selected={(selected?.kind === 'block' && selected.key === g.r.id) || pickedHas(g.r.id)}
                    onPointerDown={(e) => onPointerDown(e, g.r.id)}
                    onToggle={() => toggleRota(g.r.id)}
                  />
                ),
              )}

              {/* Retângulo de seleção (Ctrl/Shift + arrastar no fundo) */}
              {marquee && (
                <rect
                  x={marquee.x}
                  y={marquee.y}
                  width={marquee.w}
                  height={marquee.h}
                  fill="#facc15"
                  fillOpacity={0.12}
                  stroke="#ca8a04"
                  strokeWidth={1.5 / view.k}
                  strokeDasharray={`${6 / view.k} ${4 / view.k}`}
                  pointerEvents="none"
                />
              )}

              {/* Portas */}
              {ports.filter((p) => !rotaHidden.has(p.end.c)).map((p) => {
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
                  if (!port || rotaHidden.has(c)) return null;
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
            {!selConn.pass && (
              <div className="mt-1 text-xs">
                <span className="text-slate-400">{jointName(selConn)} · perda </span>
                <b className="font-mono">{formatDb(jointLoss(selConn, network.settings))}</b>
                <span className="text-slate-500">
                  {' '}
                  ({jointLossSource(selConn) === 'manual' ? 'informada' : jointLossSource(selConn) === 'type' ? 'típica do tipo' : 'padrão do projeto'})
                </span>{' '}
                <button className="text-sky-400 hover:underline cursor-pointer" onClick={() => setJointEdit(selConn.id)}>
                  {readOnly ? 'Detalhes…' : 'Tipo e perda…'}
                </button>
              </div>
            )}
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
                            if ((k === 'connector') === (c.joint === 'connector') && !c.pass && k !== 'pass') return c;
                            const { pass: _p, joint: _j, spec: _s, loss_db: _l, ...rest } = c;
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
        {selRota && !pendingPort && (
          <div className="absolute left-3 bottom-3 panel px-4 py-3 text-sm w-80 max-h-[70%] overflow-y-auto">
            <div className="text-xs text-slate-400">Grupo {selRota.r.open ? '(expandido)' : '(recolhido)'}</div>
            {readOnly ? (
              <div className="font-semibold">{selRota.r.name}</div>
            ) : (
              <input
                key={selRota.r.id}
                className="input mt-1 w-full font-semibold"
                defaultValue={selRota.r.name}
                aria-label="Nome do grupo"
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== selRota.r.name) renameRota(selRota.r.id, v);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
              />
            )}
            <div className="text-xs text-sky-300 mt-1">À frente de {rotaFrom(selRota.r)}</div>
            {(() => {
              const sm = rotaSummary(selRota.members);
              return (
                <>
                  <div className="text-xs text-slate-300 mt-1">
                    {sm.splitters} splitter(s) · {sm.clients} cliente(s)
                    {sm.worst !== null && (
                      <>
                        {' '}
                        · pior sinal{' '}
                        <b className="font-mono" style={{ color: sm.worstColor }}>
                          {sm.worst.toFixed(2)} dBm
                        </b>
                      </>
                    )}
                  </div>
                  {sm.list.length ? (
                    <ul className="mt-1 text-xs text-slate-400 space-y-0.5">
                      {sm.list.map((t, i) => (
                        <li key={i}>{t}</li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-xs text-amber-400 mt-1">Nada ligado à frente desse cabo ainda.</div>
                  )}
                </>
              );
            })()}
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
              <button className="text-emerald-400 hover:underline cursor-pointer" onClick={() => toggleRota(selRota.r.id)}>
                {selRota.r.open ? 'Recolher' : 'Expandir'}
              </button>
              {!readOnly && (
                <button className="text-red-400 hover:underline cursor-pointer" onClick={removeSelected}>
                  Desfazer grupo
                </button>
              )}
            </div>
          </div>
        )}
        {selBlock?.kind === 'client' && !selConn && !pendingPort && (
          <div className="absolute left-3 bottom-3 panel px-4 py-3 text-sm max-w-md max-h-[70%] overflow-y-auto">
            <div className="text-xs text-slate-400">Cliente</div>
            <div className="font-semibold">{selBlock.name}</div>
            {(() => {
              const r = clientPower.get(selBlock.key);
              const linked = selBlock.node_id ? network.nodes.find((n) => n.id === selBlock.node_id) : undefined;
              return (
                <>
                  {linked && <div className="text-xs text-sky-300">Vinculado ao cliente do mapa: {linked.name}</div>}
                  <div className="text-xs text-slate-300 mt-1">
                    {CLIENT_SEGMENTS[selBlock.segment ?? 'residential']} · ID {selBlock.client_code || '—'} · ONU/ONT{' '}
                    <span className="font-mono">{selBlock.onu_serial || '—'}</span>
                  </div>
                  {r?.ok ? (
                    <div className="text-xs mt-1">
                      <span className="font-semibold" style={{ color: POWER_COLORS[powerLevel(r.power, network.settings)] }}>
                        {r.power!.toFixed(2)} dBm
                      </span>{' '}
                      <span className="text-slate-400">
                        · perda {r.totalLoss.toFixed(2)} dB · {r.source}
                      </span>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500 mt-1">{r?.error ?? 'Sem fibra ligada.'}</div>
                  )}
                  <SignalHealthBox analysis={clientSignal.get(selBlock.key)} />
                </>
              );
            })()}
            {!readOnly && (
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                <button
                  className="text-emerald-400 hover:underline cursor-pointer"
                  onClick={() => {
                    setClientEdit(selBlock.key);
                    setDialog('client');
                  }}
                >
                  Editar
                </button>
                <button className="text-sky-400 hover:underline cursor-pointer" onClick={rotateSelected}>
                  Trocar lado da porta
                </button>
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
                  ['K', 'Adicionar cliente'],
                  ['G', 'Criar grupo do cabo selecionado / expandir ou recolher'],
                  ['R', 'Girar o selecionado'],
                  ['Ctrl+D', 'Duplicar splitter'],
                  ['Delete', 'Apagar o selecionado'],
                  ['Ctrl/Shift + arrastar', 'Selecionar vários (retângulo no fundo)'],
                  ['Ctrl + clique', 'Somar ou tirar da seleção'],
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
        {showPower && powerProblems.errors.length > 0 && (
          <div className="absolute top-3 left-3 max-w-md rounded-md bg-amber-50 border border-amber-300 text-amber-900 text-xs px-3 py-2 shadow">
            <div className="font-semibold mb-0.5">
              {powerProblems.ok ? 'Potência não calculada em algumas saídas' : 'Potência não calculada'}
            </div>
            {powerProblems.errors.slice(0, 3).map((e) => (
              <div key={e}>• {e}</div>
            ))}
            <div className="mt-1 text-amber-800">A potência aparece quando a fibra chega, emenda a emenda, até uma porta PON de OLT.</div>
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
      {dialog === 'client' &&
        (() => {
          const editing = diagram.components.find((c): c is Extract<DiagramComponent, { kind: 'client' }> => c.id === clientEdit && c.kind === 'client');
          // Clientes do mapa já vinculados a outro cliente de diagrama (nesta ou em outra caixa) e seriais em uso.
          const used = new Set<number>();
          const serials = new Map<string, string>();
          liveNetwork.nodes.forEach((n) => {
            if (n.type === 'client') {
              const sn = clientDataOf(n.attributes).onu_serial;
              if (sn && n.id !== editing?.node_id) serials.set(normalizeSerial(sn), n.name);
            }
            n.diagram?.components.forEach((c) => {
              if (c.kind !== 'client' || c.id === editing?.id) return;
              if (c.node_id) used.add(c.node_id);
              if (c.onu_serial) serials.set(normalizeSerial(c.onu_serial), `${c.name} (${n.name})`);
            });
          });
          const options = network.nodes
            .filter((n) => n.type === 'client')
            // Cliente com cabo drop no mapa já aparece na caixa pelo drop: não vincula de novo.
            .map((n) => ({
              id: n.id,
              name: n.name,
              m: distance([node.lat, node.lng], [n.lat, n.lng]),
              used: used.has(n.id) || network.cables.some((c) => c.from_node_id === n.id || c.to_node_id === n.id),
              data: clientDataOf(n.attributes),
            }))
            .sort((a, b) => a.m - b.m);
          return (
            <ClientDialog
              initial={editing}
              count={diagram.components.filter((c) => c.kind === 'client').length}
              options={options}
              serialsInUse={serials}
              onClose={() => setDialog(null)}
              onSave={(name, nodeId, data) => {
                if (editing) {
                  update((d) => ({ ...d, components: d.components.map((c) => (c.id === editing.id && c.kind === 'client' ? { ...c, name, node_id: nodeId, ...data } : c)) }));
                  setDialog(null);
                } else {
                  const id = uid();
                  addComponent({ id, kind: 'client', name, node_id: nodeId, ...data, x: 0, y: 0 });
                  setSelected({ kind: 'block', key: id });
                }
              }}
            />
          );
        })()}
      {dialog === 'dio' && (
        <DioDialog count={diagram.components.filter((c) => c.kind === 'dio').length} onClose={() => setDialog(null)} onCreate={(c) => addComponent(c)} />
      )}
      {dialog === 'trayEdit' &&
        (() => {
          const t = trays.find((x) => x.id === trayFocus);
          const g = t && trayGeo.get(t.id);
          if (!t || !g) return null;
          const left = g.ports.filter((p) => p.dir < 0);
          const right = g.ports.filter((p) => p.dir > 0);
          const isMine = (c: Connection) => internalTray(c) === t.id;
          const short = (e: End) => {
            const b = cableBlockOf(e.c);
            const f = Number(e.p.slice(1));
            return b ? `${b.letter} · ${f} ${fiberColor(f, b.cable.fibers_per_tube).name}` : e.p;
          };
          return (
            <TrayEditDialog
              tray={t}
              left={left}
              right={right}
              connections={validConnections}
              label={short}
              readOnly={readOnly}
              onConnect={(a, b, joint) =>
                update((d) => ({ ...d, connections: [...d.connections, { id: uid(), a, b, ...(joint === 'connector' ? { joint: 'connector' as const } : {}) }] }))
              }
              onRemove={(id) => update((d) => ({ ...d, connections: d.connections.filter((c) => c.id !== id) }))}
              settings={network.settings}
              onChangeConn={updateConnection}
              onToggleJoint={(id) =>
                update((d) => ({
                  ...d,
                  connections: d.connections.map((c) => {
                    if (c.id !== id) return c;
                    const { joint: _j, pass: _p, spec: _s, loss_db: _l, ...rest } = c;
                    return c.joint === 'connector' ? rest : { ...rest, joint: 'connector' as const };
                  }),
                }))
              }
              onAuto={() => {
                const created: Connection[] = [];
                left.forEach((p, i) => {
                  const q = right[i];
                  if (q && !connectedTo(p.end) && !connectedTo(q.end)) created.push({ id: uid(), a: p.end, b: q.end });
                });
                if (created.length) update((d) => ({ ...d, connections: [...d.connections, ...created] }));
              }}
              onClear={() => {
                if (!confirm(`Apagar as emendas internas de ${t.name}? (Dá para desfazer com Ctrl+Z.)`)) return;
                update((d) => ({ ...d, connections: d.connections.filter((c) => !isMine(c)) }));
              }}
              onTubes={() => setDialog('trays')}
              onClose={() => setDialog(null)}
            />
          );
        })()}
      {cableEdit !== null &&
        (() => {
          const cb = network.cables.find((c) => c.id === cableEdit);
          if (!cb) return null;
          return (
            <CableEditDialog
              cable={cb}
              ends={`${nodeName(cb.from_node_id)} → ${nodeName(cb.to_node_id)}`}
              projectRate={network.settings.fiber_loss_db_km}
              readOnly={readOnly || !onCableSaved}
              onClose={() => setCableEdit(null)}
              onSave={async (data) => {
                try {
                  const r = await api.updateCable(cb.id, data);
                  onCableSaved?.(r.cable, r.nodes);
                  setCableEdit(null);
                } catch (err) {
                  setError(errorMessage(err));
                }
              }}
            />
          );
        })()}
      {dropClientEdit &&
        (() => {
          const blk = blocks.find((b): b is Extract<Block, { kind: 'cable' }> => b.key === dropClientEdit && b.kind === 'cable');
          const cl = blk?.client;
          if (!blk || !cl) return null;
          const serials = new Map<string, string>();
          liveNetwork.nodes.forEach((n) => {
            if (n.type === 'client' && n.id !== cl.id) {
              const sn = clientDataOf(n.attributes).onu_serial;
              if (sn) serials.set(normalizeSerial(sn), n.name);
            }
          });
          return (
            <ClientDialog
              initial={{ id: blk.key, kind: 'client', name: cl.name, node_id: cl.id, x: 0, y: 0, ...clientDataOf(cl.attributes) }}
              fixed={`Cliente do mapa ligado a esta caixa pelo drop ${blk.cable.name} (${Math.round(blk.cable.length_m ?? 0)} m). As alterações são salvas no cliente do mapa.`}
              count={0}
              options={[]}
              serialsInUse={serials}
              onClose={() => setDropClientEdit(null)}
              onSave={async (name, _nodeId, data) => {
                try {
                  const r = await api.updateNode(cl.id, { name, attributes: { ...(cl.attributes ?? {}), ...data } });
                  onNodeSaved?.(r.node);
                  setDropClientEdit(null);
                } catch (err) {
                  setError(errorMessage(err));
                }
              }}
            />
          );
        })()}
      {cableDelete &&
        (() => {
          const blk = blocks.find((b): b is Extract<Block, { kind: 'cable' }> => b.key === cableDelete && b.kind === 'cable');
          if (!blk) return null;
          const key = blk.key;
          const splices = diagram.connections.filter((c) => c.a.c === key || c.b.c === key).length;
          return (
            <Modal title={`Apagar ${blk.cable.name}`} onClose={() => setCableDelete(null)}>
              <div className="space-y-3 text-sm">
                {blk.client ? (
                  <p className="text-slate-300">
                    Este é o cliente <b>{blk.client.name}</b> do mapa, ligado a esta caixa pelo drop <b>{blk.cable.name}</b>. O que você quer apagar?
                  </p>
                ) : (
                  <p className="text-slate-300">
                    Este cartão é um <b>cabo do mapa</b> que chega nesta caixa ({blk.label}). O que você quer apagar?
                  </p>
                )}
                <button
                  className="w-full text-left rounded-md border border-slate-700 hover:bg-slate-800 px-3 py-2 cursor-pointer disabled:opacity-50"
                  disabled={!splices}
                  onClick={() => {
                    update((d) => ({ ...d, connections: d.connections.filter((c) => c.a.c !== key && c.b.c !== key) }));
                    setCableDelete(null);
                    setSelected(null);
                  }}
                >
                  <div className="font-medium">{blk.client ? 'Só a ligação do drop nesta caixa' : 'Só as emendas deste cabo nesta caixa'}</div>
                  <div className="text-xs text-slate-400">{splices ? `${splices} emenda(s). O cabo continua no mapa.` : 'Este cabo não tem emendas aqui.'}</div>
                </button>
                {onDeleteCable && (
                  <button
                    className="w-full text-left rounded-md border border-red-800 hover:bg-red-950/50 px-3 py-2 cursor-pointer"
                    onClick={async () => {
                      if (!(await onDeleteCable(blk.cable))) return;
                      // Tira o cabo do diagrama em edição também (o servidor já removeu das caixas salvas).
                      update((d) => {
                        const { [key]: _gone, ...cablePos } = d.cablePos;
                        return { ...d, cablePos, connections: d.connections.filter((c) => c.a.c !== key && c.b.c !== key) };
                      });
                      setCableDelete(null);
                      setSelected(null);
                    }}
                  >
                    <div className="font-medium text-red-300">{blk.client ? 'Excluir o drop do projeto' : 'Excluir o cabo do projeto'}</div>
                    <div className="text-xs text-slate-400">
                      {blk.client
                        ? 'O cabo drop some do mapa e desta caixa. O cliente continua no mapa. Não dá para desfazer com Ctrl+Z.'
                        : 'Some do mapa e de todas as caixas, com as emendas dele. Não dá para desfazer com Ctrl+Z.'}
                    </div>
                  </button>
                )}
              </div>
            </Modal>
          );
        })()}
      {splitterEdit &&
        (() => {
          const sp = diagram.components.find((c): c is Extract<DiagramComponent, { kind: 'splitter' }> => c.id === splitterEdit && c.kind === 'splitter');
          if (!sp) return null;
          const used = [
            ...new Set(
              diagram.connections
                .flatMap((c) => [c.a, c.b])
                .filter((e) => e.c === sp.id && /^o\d+$/.test(e.p))
                .map((e) => Number(e.p.slice(1))),
            ),
          ].sort((x, y) => x - y);
          return (
            <SplitterEditDialog
              splitter={sp}
              usedOutputs={used}
              readOnly={readOnly}
              onClose={() => setSplitterEdit(null)}
              onSave={(model, name) => {
                const outs = splitterModel(model).outputs;
                const gone = (e: End) => e.c === sp.id && /^o\d+$/.test(e.p) && Number(e.p.slice(1)) > outs;
                update((d) => ({
                  ...d,
                  components: d.components.map((c) => {
                    if (c.id !== sp.id || c.kind !== 'splitter') return c;
                    const { name: _n, ...rest } = c;
                    return name ? { ...rest, model, name } : { ...rest, model };
                  }),
                  connections: d.connections.filter((c) => !gone(c.a) && !gone(c.b)),
                }));
                setSplitterEdit(null);
              }}
            />
          );
        })()}
      {jointEdit &&
        (() => {
          const conn = diagram.connections.find((c) => c.id === jointEdit);
          if (!conn) return null;
          return (
            <Modal title={conn.joint === 'connector' ? 'Conector / acoplador' : 'Emenda'} onClose={() => setJointEdit(null)}>
              <div className="text-xs text-slate-400 mb-3">
                {describe(conn.a)} ↔ {describe(conn.b)}
              </div>
              <JointForm conn={conn} settings={network.settings} readOnly={readOnly} onChange={(next) => updateConnection(next)} />
              <div className="flex justify-end mt-4">
                <button className="btn-primary" onClick={() => setJointEdit(null)}>
                  Pronto
                </button>
              </div>
            </Modal>
          );
        })()}
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
      {dialog === 'sangria' && <SangriaDialog blocks={blocks} onClose={() => setDialog(null)} onRun={sangria} />}
    </div>
  );
}

/** Botão da barra de ferramentas (ícone com dica; texto opcional em telas largas). */
/** Rota recolhida: cartão com o nome, de onde parte, o resumo e a lista dos objetos (como os ativos num rack). */
function RotaCard({
  rota,
  h,
  ports,
  from,
  summary,
  selected,
  onPointerDown,
  onToggle,
}: {
  rota: RouteComp;
  h: number;
  ports: Port[];
  from: string;
  summary: { splitters: number; clients: number; worst: number | null; worstColor: string; list: string[] };
  selected: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onToggle: () => void;
}) {
  const { x, y } = rota;
  const cut = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
  const list = summary.list.slice(0, ROTA_LIST);
  const more = summary.list.length - list.length;
  let ly = y + HEADER + 10;
  return (
    <g onPointerDown={onPointerDown} onDoubleClick={onToggle} className="cursor-move">
      <title>{`${rota.name} · duplo clique para expandir`}</title>
      <rect x={x} y={y} width={ROTA_W} height={h} rx={7} fill="#eef2ff" stroke={selected ? '#eab308' : ROTA_COLOR} strokeWidth={selected ? 2.5 : 1.4} />
      <rect x={x} y={y} width={ROTA_W} height={HEADER - 6} rx={7} fill={ROTA_COLOR} />
      <rect x={x} y={y + HEADER - 13} width={ROTA_W} height={7} fill={ROTA_COLOR} />
      {/* Ícone de grupo: dois cartões sobrepostos. */}
      <rect x={x + 10} y={y + 6} width={14} height={11} rx={2} fill="none" stroke="#ffffff" strokeWidth={1.5} />
      <rect x={x + 16} y={y + 11} width={14} height={11} rx={2} fill={ROTA_COLOR} stroke="#ffffff" strokeWidth={1.5} />
      <text x={x + 40} y={y + 13} fontSize={10.5} fontWeight="bold" fill="#ffffff">
        {cut(rota.name, 24)}
      </text>
      <text x={x + 40} y={y + 23} fontSize={7.5} fill="#c7d2fe">
        {cut(from, 34)}
      </text>
      {/* Expandir */}
      <g
        className="cursor-pointer"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
      >
        <title>Expandir o grupo</title>
        <rect x={x + ROTA_W - 24} y={y + 6} width={18} height={16} rx={4} fill="#ffffff" fillOpacity={0.18} />
        <path d={`M${x + ROTA_W - 19},${y + 12} l4,4 l4,-4`} fill="none" stroke="#ffffff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <text x={x + 12} y={ly} fontSize={8.5} fill="#1e1b4b" fontWeight="bold">
        {summary.splitters} splitter(s) · {summary.clients} cliente(s)
      </text>
      {summary.worst !== null && (
        <text x={x + 12} y={(ly += 12)} fontSize={8.5} fill={summary.worstColor} fontWeight="bold">
          pior sinal {summary.worst.toFixed(2)} dBm
        </text>
      )}
      {list.map((t, i) => (
        <text key={i} x={x + 14} y={(ly += 12)} fontSize={8} fill="#475569">
          {cut(t, 34)}
        </text>
      ))}
      {more > 0 && (
        <text x={x + 14} y={(ly += 12)} fontSize={8} fill="#6366f1">
          + {more} objeto(s)
        </text>
      )}
      {summary.list.length === 0 && (
        <text x={x + 12} y={(ly += 12)} fontSize={8} fill="#b45309">
          nada ligado à frente do cabo
        </text>
      )}
      {ports.map((p, i) => (
        <rect key={i} x={p.x - 3.5} y={p.y - 3.5} width={7} height={7} rx={1.5} fill={ROTA_COLOR} stroke="#ffffff" strokeWidth={1} className="pointer-events-none" />
      ))}
    </g>
  );
}

/** Rota expandida: moldura tracejada em volta dos objetos e aba com o nome (arrasta o grupo; o botão recolhe). */
function RotaFrame({
  rota,
  box,
  count,
  selected,
  onPointerDown,
  onToggle,
}: {
  rota: RouteComp;
  box: { x: number; y: number; w: number; h: number };
  count: number;
  selected: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onToggle: () => void;
}) {
  const label = `${rota.name} · ${count} objeto(s)`;
  const tw = Math.min(Math.max(box.w, 120), label.length * 5.4 + 40);
  return (
    <g>
      <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={10} fill={ROTA_COLOR} fillOpacity={0.04} stroke={selected ? '#eab308' : ROTA_COLOR} strokeWidth={selected ? 2 : 1.3} strokeDasharray="7 4" className="pointer-events-none" />
      <g onPointerDown={onPointerDown} onDoubleClick={onToggle} className="cursor-move">
        <title>{`${rota.name}: arraste para mover o grupo · duplo clique para recolher`}</title>
        <rect x={box.x} y={box.y - 18} width={tw} height={18} rx={5} fill={selected ? '#eab308' : ROTA_COLOR} />
        <text x={box.x + 24} y={box.y - 5.5} fontSize={9} fontWeight="bold" fill="#ffffff">
          {label}
        </text>
      </g>
      <g
        className="cursor-pointer"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
      >
        <title>Recolher o grupo</title>
        <rect x={box.x + 3} y={box.y - 15} width={16} height={12} rx={3} fill="#ffffff" fillOpacity={0.2} />
        <path d={`M${box.x + 7},${box.y - 7} l4,-4 l4,4`} fill="none" stroke="#ffffff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </g>
  );
}

export function IconTool({
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

export function Sep() {
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
  onDoubleClick,
  power,
  powerColor,
  signal,
  linkedName,
  via,
  size,
}: {
  block: Block;
  selected: boolean;
  showTubes?: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onDoubleClick?: () => void;
  /** Cliente: potência que chega nele. */
  power?: BudgetResult;
  powerColor?: string;
  /** Cliente: sinal medido × estimado e saúde. */
  signal?: SignalAnalysis;
  /** Cliente: nome do cliente do mapa vinculado. */
  linkedName?: string;
  /** Cliente do mapa ligado por drop: texto no lugar do vínculo (ex.: "drop 35 m"). */
  via?: string;
  /** Tamanho fixo (drop com mais de uma fibra). */
  size?: { w: number; h: number };
}) {
  if (b.kind === 'cable' && b.client) {
    // Drop até um cliente do mapa: o cartão é o próprio cliente (dados do mapa); o drop é a linha.
    const data = clientDataOf(b.client.attributes);
    const meters = Math.round(b.cable.length_m ?? 0);
    return (
      <BlockView
        block={{
          key: b.key,
          id: b.key,
          kind: 'client',
          name: b.client.name,
          node_id: b.client.id,
          x: b.x,
          y: b.y,
          flip: b.side === 'left',
          ...data,
        }}
        size={blockSize(b)}
        selected={selected}
        onPointerDown={onPointerDown}
        onDoubleClick={onDoubleClick}
        power={power}
        powerColor={powerColor}
        signal={signal}
        via={`drop ${meters} m`}
      />
    );
  }
  const { w, h } = size ?? blockSize(b);
  const stroke = selected ? '#eab308' : '#94a3b8';
  const sw = selected ? 2.5 : 1;

  if (b.kind === 'client') {
    const name = b.name.length > 20 ? `${b.name.slice(0, 19)}…` : b.name;
    const ok = power?.ok && power.power !== null;
    const measured = signal?.measured ?? null;
    const sub =
      measured !== null
        ? `Med. ${measured.toFixed(2)}${ok ? ` · Est. ${power!.power!.toFixed(2)}` : ''} dBm`
        : ok
          ? `${power!.power!.toFixed(2)} dBm (estimado)`
          : power?.steps.length
            ? 'sem sinal da OLT'
            : 'sem fibra ligada';
    const subColor = measured !== null && signal ? HEALTH_COLORS[signal.health] : ok ? (powerColor ?? '#0f172a') : '#64748b';
    // Ícone do tipo (casa, loja ou prédio) do lado oposto ao da porta, com o nome do tipo embaixo.
    const seg = b.segment ?? 'residential';
    const ix = b.flip ? b.x + 8 : b.x + w - 34;
    const tx = b.flip ? b.x + 42 : b.x + 10;
    const cut = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
    const kind = via ? `${CLIENT_SEGMENTS[seg]} · ${via}` : linkedName ? `${CLIENT_SEGMENTS[seg]} · ↔ ${linkedName}` : CLIENT_SEGMENTS[seg];
    return (
      <g onPointerDown={onPointerDown} onDoubleClick={onDoubleClick} className="cursor-move">
        <rect x={b.x} y={b.y} width={w} height={h} rx={6} fill="#f0fdfa" stroke={selected ? '#eab308' : '#0f766e'} strokeWidth={sw} />
        <g transform={`translate(${ix} ${b.y + 8})`}>
          <rect x={-1} y={-1} width={28} height={28} rx={5} fill="#ccfbf1" />
          <g transform="translate(1 1)">
            <path d={SEGMENT_GLYPH[seg]} fill="none" stroke="#0f766e" strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
          </g>
          {signal && signal.health !== 'none' && (
            <g>
              <rect x={-6} y={33} width={38} height={12} rx={6} fill={HEALTH_COLORS[signal.health]} />
              <text x={13} y={41.5} fontSize={7} textAnchor="middle" fill="#ffffff" fontWeight="bold">
                {HEALTH_LABEL[signal.health]}
              </text>
            </g>
          )}
        </g>
        <text x={tx} y={b.y + 16} fontSize={10.5} fontWeight="bold" fill="#0f172a">
          {name}
        </text>
        <text x={tx} y={b.y + 29} fontSize={9} fill={subColor} fontWeight={ok || measured !== null ? 'bold' : 'normal'}>
          {sub}
        </text>
        <text x={tx} y={b.y + 40} fontSize={8} fill="#0369a1">
          {cut(kind, 28)}
        </text>
        <text x={tx} y={b.y + 52} fontSize={7.5} fill="#475569" fontFamily="ui-monospace, monospace">
          ID {cut(b.client_code || '—', 18)}
        </text>
        <text x={tx} y={b.y + 63} fontSize={7.5} fill="#475569" fontFamily="ui-monospace, monospace">
          ONU {cut(b.onu_serial || '—', 18)}
        </text>
      </g>
    );
  }

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
      <g onPointerDown={onPointerDown} onDoubleClick={onDoubleClick} className="cursor-move">
        <title>{`${b.name || m.name} · duplo clique para editar ou trocar o tipo`}</title>
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
    <g onPointerDown={onPointerDown} onDoubleClick={onDoubleClick} className="cursor-move">
      {b.kind === 'cable' && <title>{`${b.cable.name} · duplo clique para editar o cabo (atenuação, status...)`}</title>}
      <rect x={b.x} y={b.y} width={w} height={h} rx={4} fill={fill} stroke={stroke} strokeWidth={sw} />
      <text x={b.x + 8} y={b.y + 14} fontSize={11} fontWeight="bold" fill="#0f172a">
        {title.length > 22 ? `${title.slice(0, 21)}…` : title}
      </text>
      <text x={b.x + 8} y={b.y + 26} fontSize={8.5} fill="#64748b">
        {subtitle.length > 32 ? `${subtitle.slice(0, 31)}…` : subtitle}
      </text>
      {b.kind === 'cable' &&
        b.rows.map((r) => {
          const y = b.y + HEADER + r.y;
          // Faixa do tubo loose na borda externa (cabos com mais de um tubo ou quando há bandejas).
          const showTube = showTubes || b.cable.fiber_count > b.cable.fibers_per_tube;
          if (r.kind === 'tube') {
            const [f1, f2] = tubeFibers(r.tube, b.cable);
            const tc = tubeColor(f1, b.cable.fibers_per_tube);
            const text = `Tubo ${r.tube} ${tc.name} · FO ${f1}–${f2}`;
            return (
              <g key={`t${r.tube}`}>
                <rect x={b.x + 3} y={y + 2} width={w - 6} height={r.h - 4} rx={4} fill="#f1f5f9" stroke="#cbd5e1" strokeWidth={0.6} />
                <rect x={right ? b.x + 10 : b.x + w - 26} y={y + 6} width={16} height={r.h - 12} rx={3} fill={tc.hex} stroke="#64748b" strokeWidth={0.6} />
                <text x={right ? b.x + 32 : b.x + w - 32} y={y + 11.5} fontSize={8.5} fill="#0f172a" fontWeight="bold" textAnchor={right ? 'start' : 'end'}>
                  {text}
                </text>
                <text x={right ? b.x + 32 : b.x + w - 32} y={y + 21} fontSize={7.5} fill="#0369a1" textAnchor={right ? 'start' : 'end'}>
                  → {r.tray.name.length > 18 ? `${r.tray.name.slice(0, 17)}…` : r.tray.name}
                </text>
              </g>
            );
          }
          const i = r.fiber - 1;
          const tube = tubeColor(r.fiber, b.cable.fibers_per_tube);
          const fc = fiberColor(r.fiber, b.cable.fibers_per_tube);
          return (
            <g key={i}>
              {showTube && <rect x={right ? b.x + 3 : b.x + w - (showTubes ? 9 : 8)} y={y} width={showTubes ? 6 : 4} height={ROW} fill={tube.hex} stroke="#cbd5e1" strokeWidth={0.3} />}
              <rect x={right ? b.x + w - 50 : b.x + 10} y={y + 3} width={40} height={ROW - 6} rx={2} fill={fc.hex} stroke="#94a3b8" strokeWidth={0.4} />
              <text x={right ? b.x + w - 56 : b.x + 56} y={y + ROW - 3.5} fontSize={8.5} fill="#334155" textAnchor={right ? 'end' : 'start'}>
                {r.fiber} {fc.name}
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

/** Editar o cabo (ou drop) pelo diagrama: nome, tipo, status e atenuação em dB/km. */
function CableEditDialog({
  cable,
  ends,
  projectRate,
  readOnly,
  onClose,
  onSave,
}: {
  cable: Cable;
  ends: string;
  projectRate: number;
  readOnly?: boolean;
  onClose: () => void;
  onSave: (data: Partial<Cable>) => void;
}) {
  const [name, setName] = useState(cable.name);
  const [category, setCategory] = useState<CableCategory>(cable.category);
  const [status, setStatus] = useState<Status>(cable.status);
  const [loss, setLoss] = useState(lossRateText(cable.loss_db_km));
  const bad = loss.trim() !== '' && parseLossRate(loss) === null;
  const meters = cable.length_m + (cable.slack_m ?? 0);
  return (
    <Modal title={cable.category === 'drop' ? 'Editar drop' : 'Editar cabo'} onClose={onClose}>
      <div className="space-y-3">
        <div className="text-xs text-slate-400">
          {ends} · {cable.fiber_count} fibras · {Math.round(cable.length_m)} m{cable.slack_m ? ` + ${cable.slack_m} m de reserva` : ''}
        </div>
        <Field label="Nome">
          <input className="input" value={name} disabled={readOnly} onChange={(e) => setName(e.target.value)} aria-label="Nome do cabo" />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Tipo">
            <select className="input" value={category} disabled={readOnly} onChange={(e) => setCategory(e.target.value as CableCategory)}>
              {(Object.keys(CABLE_CATEGORIES) as CableCategory[]).map((c) => (
                <option key={c} value={c}>
                  {CABLE_CATEGORIES[c].label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select className="input" value={status} disabled={readOnly} onChange={(e) => setStatus(e.target.value as Status)}>
              {(Object.keys(STATUSES) as Status[]).map((st) => (
                <option key={st} value={st}>
                  {STATUSES[st].label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <CableLossField value={loss} onChange={setLoss} projectRate={projectRate} meters={meters} disabled={readOnly} />
        <p className="text-xs text-slate-500">Traçado, cor, reservas e o restante dos dados ficam no painel do cabo, no mapa.</p>
        {!readOnly && (
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={onClose}>
              Cancelar
            </button>
            <button className="btn-primary" disabled={bad || !name.trim()} onClick={() => onSave({ name: name.trim(), category, status, loss_db_km: parseLossRate(loss) })}>
              Salvar
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

/**
 * Editar um splitter do diagrama: nome e troca do modelo (balanceado/desbalanceado, RF/APC/UPC).
 * Se o novo modelo tiver menos saídas, as ligações das saídas que deixam de existir são apagadas.
 */
function SplitterEditDialog({
  splitter,
  usedOutputs,
  readOnly,
  onClose,
  onSave,
}: {
  splitter: Extract<DiagramComponent, { kind: 'splitter' }>;
  /** Saídas (1, 2, 3...) com fibra ligada. */
  usedOutputs: number[];
  readOnly?: boolean;
  onClose: () => void;
  onSave: (model: string, name: string) => void;
}) {
  const current = splitterModel(splitter.model);
  const [model, setModel] = useState(current.id);
  const [balanced, setBalanced] = useState(current.balanced);
  const [name, setName] = useState(splitter.name ?? '');
  const picked = splitterModel(model);
  const lost = usedOutputs.filter((n) => n > picked.outputs);
  return (
    <Modal title="Editar splitter" onClose={onClose} width="max-w-md">
      <div className="space-y-3">
        <Field label="Nome (opcional)">
          <input className="input" value={name} disabled={readOnly} placeholder={picked.name} onChange={(e) => setName(e.target.value)} aria-label="Nome do splitter" />
        </Field>
        <div className="text-xs text-slate-400">
          Atual: <b className="text-slate-200">{current.name}</b> · {current.outputs} saídas
          {usedOutputs.length > 0 && ` · ${usedOutputs.length} em uso`}
        </div>
        <div className="flex rounded-md bg-slate-950 p-1">
          {[true, false].map((v) => (
            <button
              key={String(v)}
              type="button"
              onClick={() => setBalanced(v)}
              className={`flex-1 rounded py-1.5 text-sm cursor-pointer ${balanced === v ? 'bg-emerald-600' : ''}`}
            >
              {v ? 'Balanceado' : 'Desbalanceado'}
            </button>
          ))}
        </div>
        <ul className="max-h-72 overflow-y-auto divide-y divide-slate-800" role="listbox" aria-label="Modelo do splitter">
          {SPLITTER_MODELS.filter((m) => m.balanced === balanced).map((m) => (
            <li key={m.id}>
              <button
                type="button"
                role="option"
                aria-selected={m.id === model}
                disabled={readOnly}
                onClick={() => setModel(m.id)}
                className={`w-full flex justify-between px-2 py-2 text-sm rounded cursor-pointer ${m.id === model ? 'bg-emerald-700/40 ring-1 ring-emerald-500' : 'hover:bg-slate-800'}`}
              >
                <span>
                  {m.id === model ? '✓ ' : ''}
                  {m.name}
                  {m.id === current.id && <span className="text-slate-500 text-xs"> (atual)</span>}
                </span>
                <span className="text-slate-400 text-xs">
                  {m.outputs} saídas · {m.balanced ? `${m.losses[0]} dB` : `${m.losses[0]} / ${m.losses[1]} dB`}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {lost.length > 0 && (
          <p className="text-xs text-amber-300">
            O {picked.name} tem só {picked.outputs} saídas: as ligações da{lost.length > 1 ? 's' : ''} saída{lost.length > 1 ? 's' : ''} {lost.join(', ')} serão apagadas
            (dá para desfazer com Ctrl+Z).
          </p>
        )}
        {model !== current.id && picked.connectorized !== current.connectorized && (
          <p className="text-xs text-sky-300">
            {picked.connectorized ? 'Saídas conectorizadas: cada saída soma a perda de conector.' : 'Saídas sem conector (RF): a perda de conector das saídas deixa de contar.'}
          </p>
        )}
        {!readOnly && (
          <div className="flex justify-end gap-2 pt-1">
            <button className="btn-ghost" onClick={onClose}>
              Cancelar
            </button>
            <button className="btn-primary" onClick={() => onSave(model, name.trim())}>
              Salvar
            </button>
          </div>
        )}
      </div>
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

const SEGMENT_ICON: Record<ClientSegment, typeof Home> = { residential: Home, business: Store, corporate: Building2 };


/**
 * Novo cliente no diagrama (ou edição): nome, cliente do mapa ao qual ele corresponde (opcional) e os dados para
 * integração com outros sistemas: ID, serial da ONU/ONT e tipo (residencial, empresarial ou corporativo).
 */
function ClientDialog({
  initial,
  count,
  options,
  serialsInUse,
  onClose,
  onSave,
  fixed,
}: {
  initial?: Extract<DiagramComponent, { kind: 'client' }>;
  /** Cliente do mapa já definido (ligado por drop): mostra este texto no lugar da escolha. */
  fixed?: string;
  count: number;
  options: { id: number; name: string; m: number; used: boolean; data: ClientData }[];
  /** Seriais já usados por outros clientes (serial normalizado → nome do cliente). */
  serialsInUse: Map<string, string>;
  onClose: () => void;
  onSave: (name: string, nodeId: number | null, data: ClientData) => void;
}) {
  const [name, setName] = useState(initial?.name ?? `Cliente ${count + 1}`);
  const [nodeId, setNodeId] = useState<number | null>(initial?.node_id ?? null);
  const [code, setCode] = useState(initial?.client_code ?? '');
  const [serial, setSerial] = useState(initial?.onu_serial ?? '');
  const [segment, setSegment] = useState<ClientSegment | null>(initial?.segment ?? 'residential');
  const [rx, setRx] = useState(initial?.rx_dbm != null ? String(initial.rx_dbm) : '');
  const [rxAt, setRxAt] = useState<string | null>(initial?.rx_at ?? null);
  const rxNum = rx.trim() === '' ? null : Number(rx.replace(',', '.'));
  const rxBad = rxNum !== null && (Number.isNaN(rxNum) || rxNum < -60 || rxNum > 10);
  const fmt = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);
  const sn = normalizeSerial(serial);
  const dup = sn ? serialsInUse.get(sn) : undefined;
  return (
    <Modal title={initial ? 'Editar cliente' : 'Adicionar cliente'} onClose={onClose} width="max-w-sm">
      <div className="space-y-3">
        {fixed ? (
          <p className="text-xs text-sky-300">{fixed}</p>
        ) : (
        <Field label="Cliente do mapa (opcional)">
          <select
            className="input"
            value={nodeId ?? ''}
            onChange={(e) => {
              const id = e.target.value ? Number(e.target.value) : null;
              setNodeId(id);
              const o = options.find((x) => x.id === id);
              if (o) {
                setName(o.name);
                // Traz os dados que o cliente do mapa já tem (sem apagar o que foi digitado aqui).
                if (o.data.client_code) setCode(o.data.client_code);
                if (o.data.onu_serial) setSerial(o.data.onu_serial);
                if (o.data.segment) setSegment(o.data.segment);
                if (o.data.rx_dbm != null) {
                  setRx(String(o.data.rx_dbm));
                  setRxAt(o.data.rx_at ?? null);
                }
              }
            }}
          >
            <option value="">— Nenhum (só no diagrama) —</option>
            {options.map((o) => (
              <option key={o.id} value={o.id} disabled={o.used}>
                {o.name} · {fmt(o.m)}
                {o.used ? ' · já ligado (drop ou outra caixa)' : ''}
              </option>
            ))}
          </select>
        </Field>
        )}
        <Field label="Nome">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Tipo de cliente">
          <div className="grid grid-cols-3 gap-1.5">
            {(Object.keys(CLIENT_SEGMENTS) as ClientSegment[]).map((k) => {
              const Icon = SEGMENT_ICON[k];
              const on = segment === k;
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setSegment(k)}
                  className={`flex flex-col items-center gap-1 rounded-md border py-2 text-xs cursor-pointer ${on ? 'border-emerald-500 bg-emerald-600/20 text-emerald-300' : 'border-slate-700 text-slate-300 hover:bg-slate-800'}`}
                >
                  <Icon size={18} />
                  {CLIENT_SEGMENTS[k]}
                </button>
              );
            })}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="ID do cliente">
            <input className="input" placeholder="ex.: 104523" maxLength={64} value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
          <Field label="Serial da ONU/ONT">
            <input
              className="input font-mono uppercase"
              placeholder="HWTC1A2B3C4D"
              maxLength={64}
              value={serial}
              onChange={(e) => setSerial(e.target.value)}
              onBlur={() => setSerial(normalizeSerial(serial))}
            />
          </Field>
        </div>
        <Field label="Sinal medido na ONU/ONT (dBm)">
          <input
            className="input font-mono"
            inputMode="decimal"
            placeholder="ex.: -21,4"
            value={rx}
            onChange={(e) => {
              setRx(e.target.value);
              setRxAt(new Date().toISOString());
            }}
          />
        </Field>
        <p className="text-xs text-slate-400 -mt-2">
          Valor lido na ONU/ONT (no futuro, coletado do FiberControl pelo serial). O sistema compara com o sinal estimado e indica a saúde e o trecho
          provável de problema.
          {rxAt && rxNum !== null && !rxBad ? ` Medido em ${new Date(rxAt).toLocaleString('pt-BR')}.` : ''}
        </p>
        {rxBad && <p className="text-xs text-red-400">Informe um valor entre -60 e 10 dBm.</p>}
        {dup && <p className="text-xs text-amber-400">Este serial já está no cliente {dup}.</p>}
        {sn && !dup && !looksLikeGponSerial(sn) && (
          <p className="text-xs text-slate-400">Formato diferente do usual (4 letras do fabricante + 8 dígitos hexadecimais, ex.: HWTC1A2B3C4D).</p>
        )}
        {!fixed && (
        <p className="text-xs text-slate-400">
          Depois, ligue uma saída de splitter (ou uma fibra) à porta do cliente com Emenda ou Conector. A potência que chega nele aparece no cartão
          {nodeId ? ' e no cliente do mapa. O ID, o serial e o tipo também são gravados no cliente do mapa ao salvar o diagrama' : ''}.
        </p>
        )}
        <button
          className="btn-primary w-full"
          disabled={!name.trim() || rxBad}
          onClick={() =>
            onSave(name.trim(), nodeId, {
              client_code: code.trim() || null,
              onu_serial: sn || null,
              segment,
              rx_dbm: rxNum === null ? null : Math.round(rxNum * 100) / 100,
              rx_at: rxNum === null ? null : (rxAt ?? new Date().toISOString()),
            })
          }
        >
          {initial ? 'Salvar' : 'Adicionar cliente'}
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

function SangriaDialog({ blocks, onClose, onRun }: { blocks: Block[]; onClose: () => void; onRun: (from: string, to: string) => void }) {
  const cablesB = blocks.filter((b) => b.kind === 'cable');
  const [from, setFrom] = useState(cablesB[0]?.key ?? '');
  const [to, setTo] = useState(cablesB.find((b) => b.key !== cablesB[0]?.key)?.key ?? '');
  const label = (b: Block) => (b.kind === 'cable' ? `${b.cable.name} (${b.label})` : '');
  return (
    <Modal title="Sangria" onClose={onClose} width="max-w-sm">
      <p className="text-sm text-slate-400 mb-3">
        O cabo de entrada segue no cabo de saída. As fibras que já têm emenda ficam como estão; as livres nos dois cabos passam direto (passagem: sem fusão e sem
        perda), 1↔1, 2↔2...
      </p>
      <div className="space-y-3">
        <Field label="Cabo que chega">
          <select className="input" value={from} onChange={(e) => setFrom(e.target.value)}>
            {cablesB.map((b) => (
              <option key={b.key} value={b.key}>
                {label(b)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Cabo que segue à frente">
          <select className="input" value={to} onChange={(e) => setTo(e.target.value)}>
            {cablesB
              .filter((b) => b.key !== from)
              .map((b) => (
                <option key={b.key} value={b.key}>
                  {label(b)}
                </option>
              ))}
          </select>
        </Field>
        <button className="btn-primary w-full" disabled={!from || !to || from === to} onClick={() => onRun(from, to)}>
          <Split size={15} /> Fazer sangria
        </button>
      </div>
    </Modal>
  );
}

/** Cartão da bandeja aberta: cabeçalho com ocupação; as FO ficam nas laterais e as emendas são desenhadas por cima. */
function TrayCard({
  tray: t,
  h,
  used,
  summary,
  tubes,
  selected,
  onPointerDown,
  onDoubleClick,
}: {
  tray: SpliceTray;
  h: number;
  used: number;
  summary: { fusions: number; crossed: number; free: number };
  tubes: string;
  selected: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onDoubleClick: () => void;
}) {
  const over = used > t.capacity;
  const pct = Math.min(1, used / Math.max(1, t.capacity));
  const foot = [`${summary.fusions} fusões`, summary.crossed ? `${summary.crossed} cruzadas` : '', `${summary.free} FO livres`].filter(Boolean).join(' · ');
  return (
    <g onPointerDown={onPointerDown} onDoubleClick={onDoubleClick} className="cursor-move">
      <title>{`${t.name}${tubes ? ` · tubos ${tubes}` : ''} · duplo clique para editar as fusões`}</title>
      <rect x={t.x} y={t.y} width={TRAY_W} height={h} rx={8} fill="#f8fafc" stroke={selected ? '#eab308' : over ? '#dc2626' : '#64748b'} strokeWidth={selected ? 2.5 : 1.4} />
      <rect x={t.x} y={t.y} width={TRAY_W} height={24} rx={8} fill={over ? '#fee2e2' : '#e2e8f0'} />
      <rect x={t.x} y={t.y + 16} width={TRAY_W} height={8} fill={over ? '#fee2e2' : '#e2e8f0'} />
      <g transform={`translate(${t.x + 9},${t.y + 7})`}>
        <rect width={16} height={10} rx={2} fill="none" stroke="#334155" strokeWidth={1.2} />
        <line x1={3} y1={3.5} x2={13} y2={3.5} stroke="#334155" strokeWidth={1} />
        <line x1={3} y1={6.5} x2={13} y2={6.5} stroke="#334155" strokeWidth={1} />
      </g>
      <text x={t.x + 31} y={t.y + 16} fontSize={11} fontWeight="bold" fill="#0f172a">
        {t.name.length > 20 ? `${t.name.slice(0, 19)}…` : t.name}
      </text>
      <text x={t.x + TRAY_W - 9} y={t.y + 16} fontSize={9} fontWeight="bold" textAnchor="end" fill={over ? '#dc2626' : '#334155'}>
        {used}/{t.capacity} fusões
      </text>
      <rect x={t.x + 9} y={t.y + 30} width={TRAY_W - 18} height={5} rx={2.5} fill="#e2e8f0" />
      <rect x={t.x + 9} y={t.y + 30} width={(TRAY_W - 18) * pct} height={5} rx={2.5} fill={over ? '#dc2626' : pct > 0.85 ? '#f59e0b' : '#16a34a'} />
      {!t.tubes.length && (
        <text x={t.x + TRAY_W / 2} y={t.y + TRAY_TOP + 10} fontSize={8.5} textAnchor="middle" fill="#94a3b8">
          Vincule tubos em Bandejas
        </text>
      )}
      <text x={t.x + TRAY_W / 2} y={t.y + h - 8} fontSize={8.5} textAnchor="middle" fill={summary.crossed ? '#b45309' : '#64748b'}>
        {foot}
      </text>
    </g>
  );
}

/** Edição das fusões internas da bandeja: FO do lado esquerdo × lado direito, com cruzamento livre. */
function TrayEditDialog({
  tray,
  left,
  right,
  connections,
  label,
  readOnly,
  onConnect,
  onRemove,
  settings,
  onChangeConn,
  onToggleJoint,
  onAuto,
  onClear,
  onTubes,
  onClose,
}: {
  tray: SpliceTray;
  left: Port[];
  right: Port[];
  connections: Connection[];
  label: (e: End) => string;
  readOnly?: boolean;
  onConnect: (a: End, b: End, joint: 'fusion' | 'connector') => void;
  onRemove: (id: string) => void;
  settings: Settings;
  onChangeConn: (c: Connection) => void;
  onToggleJoint: (id: string) => void;
  onAuto: () => void;
  onClear: () => void;
  onTubes: () => void;
  onClose: () => void;
}) {
  const [joint, setJoint] = useState<'fusion' | 'connector'>('fusion');
  const [pick, setPick] = useState<End | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const RW = 26;
  const lx = 190;
  const rx = 510;
  const n = Math.max(left.length, right.length, 1);
  const H = 30 + n * RW + 10;
  const all = [...left.map((p, i) => ({ p, x: lx, y: 30 + (i + 0.5) * RW, side: -1 })), ...right.map((p, i) => ({ p, x: rx, y: 30 + (i + 0.5) * RW, side: 1 }))];
  const at = (e: End) => all.find((q) => sameEnd(q.p.end, e));
  const busy = (e: End) => connections.find((c) => sameEnd(c.a, e) || sameEnd(c.b, e));
  const inner = connections.filter((c) => at(c.a) && at(c.b));
  const routes = routeOrthogonal(
    inner.map((c) => {
      const a = at(c.a)!;
      const b = at(c.b)!;
      return { id: c.id, a: { x: a.x, y: a.y, dir: (-a.side) as 1 | -1 }, b: { x: b.x, y: b.y, dir: (-b.side) as 1 | -1 } };
    }),
    { stub: 60, gap: 7 },
  );
  function click(e: End) {
    if (readOnly) return;
    const c = busy(e);
    if (!pick) {
      if (c) setSel(c.id);
      else setPick(e);
      return;
    }
    if (sameEnd(pick, e)) return setPick(null);
    if (c) return setPick(null);
    onConnect(pick, e, joint);
    setPick(null);
  }
  const selConn = inner.find((c) => c.id === sel);
  return (
    <Modal title={`${tray.name} · fusões internas`} onClose={onClose} width="max-w-3xl">
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {(
            [
              ['fusion', 'Emenda (fusão)'],
              ['connector', 'Conector'],
            ] as const
          ).map(([k, t]) => (
            <button key={k} onClick={() => setJoint(k)} className={`rounded-md px-3 py-1.5 text-xs cursor-pointer border ${joint === k ? 'bg-emerald-600 border-emerald-600' : 'border-slate-700 hover:bg-slate-800'}`}>
              {t}
            </button>
          ))}
          <button onClick={onAuto} className="rounded-md px-3 py-1.5 text-xs cursor-pointer border border-slate-700 hover:bg-slate-800">
            1↔1 automático
          </button>
          <button onClick={onClear} className="rounded-md px-3 py-1.5 text-xs cursor-pointer border border-slate-700 hover:bg-slate-800 text-red-300">
            Limpar bandeja
          </button>
          <button onClick={onTubes} className="rounded-md px-3 py-1.5 text-xs cursor-pointer border border-slate-700 hover:bg-slate-800 ml-auto">
            Tubos da bandeja…
          </button>
        </div>
      )}
      <p className="text-xs text-slate-400 mb-2">
        Clique numa FO de um lado e depois na FO do outro lado para fundir. Para <b>cruzar</b>, é só ligar números diferentes (ex.: 3 → 5). Clique numa emenda para
        selecioná-la. Emendas cruzadas ficam em amarelo.
      </p>
      <div className="rounded-lg bg-slate-100 overflow-auto max-h-[60vh]">
        <svg width={700} height={H} className="block mx-auto select-none" fontFamily="inherit">
          {inner.map((c) => {
            const pts = routes.get(c.id)!;
            const a = at(c.a)!;
            const b = at(c.b)!;
            const leftEnd = a.side < 0 ? a : b;
            const d = polylinePath(pts);
            const isSel = sel === c.id;
            const crossed = a.side !== b.side && a.y !== b.y;
            const sp = spliceAnchor(pts, leftEnd === a ? 'a' : 'b', 44);
            return (
              <g key={c.id} className="cursor-pointer" onClick={() => setSel(c.id)}>
                <path d={d} fill="none" stroke="transparent" strokeWidth={10} />
                <path d={d} fill="none" stroke={isSel ? '#facc15' : '#0f172a'} strokeOpacity={isSel ? 1 : 0.5} strokeWidth={isSel ? 6 : 4.4} strokeLinejoin="round" />
                <path d={d} fill="none" stroke={leftEnd.p.color} strokeWidth={2.6} strokeDasharray={c.pass ? '6 4' : undefined} strokeLinejoin="round" />
                {!c.pass &&
                  (c.joint === 'connector' ? (
                    <ConnectorMark x={sp.x} y={sp.y} vertical={sp.vertical} selected={isSel || crossed} />
                  ) : (
                    <SpliceMark x={sp.x} y={sp.y} vertical={sp.vertical} selected={isSel || crossed} />
                  ))}
              </g>
            );
          })}
          {all.map(({ p, x, y, side }) => {
            const ext = busy(p.end) && !inner.some((c) => sameEnd(c.a, p.end) || sameEnd(c.b, p.end));
            const isPick = pick && sameEnd(pick, p.end);
            return (
              <g key={`${p.end.c}:${p.end.p}`} className="cursor-pointer" onClick={() => click(p.end)}>
                <rect x={side < 0 ? x - 176 : x + 10} y={y - 9} width={166} height={18} fill="transparent" />
                <rect x={side < 0 ? x - 172 : x + 136} y={y - 4.5} width={36} height={9} rx={2} fill={p.color} stroke="#94a3b8" strokeWidth={0.5} />
                <text x={side < 0 ? x - 12 : x + 12} y={y + 3.5} fontSize={10} textAnchor={side < 0 ? 'end' : 'start'} fill="#334155">
                  {label(p.end)}
                </text>
                {ext && (
                  <text x={side < 0 ? x - 12 : x + 12} y={y + 12} fontSize={7} textAnchor={side < 0 ? 'end' : 'start'} fill="#0369a1">
                    ligada fora da bandeja
                  </text>
                )}
                <circle cx={x} cy={y} r={isPick ? 9 : 7.5} fill={p.color} stroke={isPick ? '#facc15' : '#0f172a'} strokeWidth={isPick ? 3 : 1.2} />
                <text x={x} y={y + 3} fontSize={8} fontWeight="bold" textAnchor="middle" fill={textOn(p.color)} className="pointer-events-none">
                  {p.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      {selConn && !readOnly && (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <span className="text-slate-300">
            {label(selConn.a)} ↔ {label(selConn.b)} · {selConn.pass ? 'passagem' : selConn.joint === 'connector' ? 'conector' : 'fusão'}
          </span>
          <button className="text-emerald-400 text-xs hover:underline cursor-pointer" onClick={() => onToggleJoint(selConn.id)}>
            Trocar fusão/conector
          </button>
          <button
            className="text-red-400 text-xs hover:underline cursor-pointer"
            onClick={() => {
              onRemove(selConn.id);
              setSel(null);
            }}
          >
            Apagar emenda
          </button>
        </div>
      )}
      {selConn && !selConn.pass && (
        <div className="mt-3 border-t border-slate-800 pt-3">
          <JointForm conn={selConn} settings={settings} readOnly={readOnly} onChange={onChangeConn} />
        </div>
      )}
    </Modal>
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
