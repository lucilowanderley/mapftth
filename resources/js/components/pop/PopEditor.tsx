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
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, errorMessage } from '../../lib/api';
import { traceUpstream, type BudgetResult } from '../../lib/budget';
import { CABLE_CATEGORIES, STATUSES, fiberColor } from '../../lib/catalog';
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
  sameEnd,
  trays,
  uid,
  vflTrace,
} from '../../lib/pop';
import type { Cable, Diagram, DiagramComponent, End, NetNode, Network, Status } from '../../lib/types';
import { ActiveDialog, DioDialog, LinkDialog, OltDialog, useCableItems } from './dialogs';
import FusionMatrix from './FusionMatrix';
import { G, cardPorts, cardSize, portBox, rowLabels, textOn, type PopComp } from './geometry';
import ManobraView from './ManobraView';

type Olt = Extract<DiagramComponent, { kind: 'olt' }>;
type Dio = Extract<DiagramComponent, { kind: 'dio' }>;
type Active = Extract<DiagramComponent, { kind: 'active' }>;

type Dialog =
  | { t: 'olt'; edit?: Olt }
  | { t: 'dio'; edit?: Dio }
  | { t: 'active'; edit?: Active }
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

const isPopComp = (c: DiagramComponent): c is PopComp => c.kind !== 'splitter';

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
    const p = c.kind === 'dio' ? `b${e.p.slice(1)}` : e.p;
    const b = portBox(c, p);
    return { x: c.x + b.x + G.PORT / 2, y: c.y + b.y + G.PORT / 2 };
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
        return `${c.name} · porta ${e.p.slice(1)}`;
      case 'splitter':
        return `Splitter · ${e.p === 'in' ? 'entrada' : `saída ${e.p.slice(1)}`}`;
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
      const p = c ? { x: c.x, y: c.y } : cablePos(key);
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
        ? { ...dg, components: dg.components.map((c) => (c.id === key ? { ...c, x: nx, y: ny } : c)) }
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
      ...comps.map((c) => ({ x: c.x, y: c.y, ...cardSize(c) })),
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
  function addComponent(c: PopComp) {
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

  function editComponent(c: PopComp) {
    const next: Diagram = { ...diagram, components: diagram.components.map((x) => (x.id === c.id ? c : x)) };
    const kept = pruneConnections(next, new Set(cableMap.keys()));
    const lost = next.connections.length - kept.length;
    if (lost > 0 && !confirm(`${lost} conexão(ões) usam portas que deixam de existir e serão removidas. Continuar?`)) return;
    update(() => ({ ...next, connections: kept }));
    setDialog(null);
  }

  function deleteComponent(c: PopComp) {
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
      ...comps.map((c) => ({ x: c.x, y: c.y, ...cardSize(c) })),
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
        const by = dio.y + G.HEADER + G.CHIPS / 2;
        const dx = Math.max(40, Math.abs(dio.x - sx) / 2);
        parts.push(`<path d="M${sx},${sy} C${sx + dx},${sy} ${dio.x - dx},${by} ${dio.x},${by}" fill="none" stroke="${cable.color}" stroke-width="2.5"/>`);
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
    comps.forEach((c) => {
      const { w: cw, h: ch } = cardSize(c);
      const tag = c.kind === 'olt' ? `${c.slots}×${c.ports}` : c.kind === 'dio' ? `${c.ports}P` : c.type;
      parts.push(
        `<rect x="${c.x}" y="${c.y}" width="${cw}" height="${ch}" rx="8" fill="#ffffff" stroke="#94a3b8"/>`,
        `<text x="${c.x + 12}" y="${c.y + 25}" font-size="13" font-weight="bold" fill="#0f172a">${esc(c.name)} <tspan font-size="10" fill="#64748b">${esc(tag)}</tspan></text>`,
      );
      rowLabels(c).forEach((r) => parts.push(`<text x="${c.x + G.PAD + 12}" y="${c.y + r.y + 18}" font-size="10" font-weight="bold" fill="#475569" text-anchor="middle">${r.label}</text>`));
      cardPorts(c).forEach((p) => {
        const b = portBox(c, p);
        const n = Number(p.slice(1));
        const patched = usedEnds.has(`${c.id}:${p}`);
        const fill = patched ? (c.kind === 'dio' ? PORT_FILL.dio : c.kind === 'active' ? PORT_FILL.active : p.startsWith('u') ? PORT_FILL.up : PORT_FILL.olt) : '#f8fafc';
        const label = c.kind === 'olt' && !p.startsWith('u') ? ((n - 1) % c.ports) + 1 : n;
        parts.push(
          `<rect x="${c.x + b.x}" y="${c.y + b.y}" width="${G.PORT}" height="${G.PORT}" rx="4" fill="${fill}" stroke="#94a3b8"/>`,
          `<text x="${c.x + b.x + G.PORT / 2}" y="${c.y + b.y + 18}" font-size="10" text-anchor="middle" fill="${patched ? textOn(fill) : '#64748b'}">${label}</text>`,
        );
        const src = c.kind === 'dio' ? fusionSource(diagram, c.id, n) : null;
        const cable = src && cableMap.get(src.cable);
        if (cable) parts.push(`<circle cx="${c.x + b.x + G.PORT - 1}" cy="${c.y + b.y + 1}" r="4" fill="${cable.color}" stroke="#0f172a" stroke-width="0.8"/>`);
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
      <text x="${pad}" y="32" font-size="18" font-weight="bold" fill="#ffffff">${esc(node.name)} · POP</text>
      <text x="${w - pad}" y="32" font-size="11" fill="#94a3b8" text-anchor="end">${new Date().toLocaleString('pt-BR')} · ${node.lat.toFixed(6)}, ${node.lng.toFixed(6)} · ${STATUSES[status].label}</text>
      <g transform="translate(${-x0},${titleH - y0})">${parts.join('')}</g>
      <text x="${pad}" y="${h + titleH - 16}" font-size="10" fill="#475569">OLT: ${olts.length} · DIO: ${dios.length} · Portas do DIO com cordão: ${dioPatched}/${dioPorts} · PON em uso: ${ponUsed}/${ponTotal}</text>
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
      else notify('POP salvo.');
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
        <div className="font-semibold">Editor de POP: {node.name}</div>
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
        </div>
        <div className="hidden md:flex items-center gap-3 pl-3 ml-1 border-l border-slate-700 text-[11px] font-medium uppercase tracking-wide text-slate-400">
          <span>OLT: {olts.length}</span>
          <span>DIO: {dios.length}</span>
          <span title="Portas do DIO com cordão / total">Portas: {dioPatched}/{dioPorts}</span>
          <span title="Portas PON em uso / total">PON: {ponUsed}/{ponTotal}</span>
        </div>

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
              {/* Ligações cabo → DIO */}
              <svg className="absolute left-0 top-0 overflow-visible pointer-events-none" width={1} height={1}>
                {dios.flatMap((dio) =>
                  linkedCables(diagram, dio).map((key) => {
                    const cable = cableMap.get(key);
                    if (!cable) return null;
                    const p = cablePos(key);
                    const ax = p.x + G.CABLE_W;
                    const ay = p.y + G.HEADER / 2;
                    const toLeft = dio.x >= p.x + G.CABLE_W / 2;
                    const bx = toLeft ? dio.x : dio.x + cardSize(dio).w;
                    const by = dio.y + G.HEADER + G.CHIPS / 2;
                    const sx = toLeft ? ax : p.x;
                    const dx = Math.max(40, Math.abs(bx - sx) / 2);
                    const d = `M${sx},${ay} C${sx + (toLeft ? dx : -dx)},${ay} ${bx + (toLeft ? -dx : dx)},${by} ${bx},${by}`;
                    const hot = vflResult?.exits.some((x) => x.cable === key);
                    return (
                      <g key={`${dio.id}-${key}`}>
                        <path d={d} fill="none" stroke="#020617" strokeWidth={5} strokeOpacity={0.6} />
                        <path d={d} fill="none" stroke={hot ? VFL : cable.color} strokeWidth={2.5} />
                        <circle cx={sx} cy={ay} r={3.5} fill={cable.color} stroke="#020617" />
                        <circle cx={bx} cy={by} r={3.5} fill={cable.color} stroke="#020617" />
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

              {/* Equipamentos */}
              {comps.map((c) => (
                <EquipmentCard
                  key={c.id}
                  comp={c}
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

            {cables.length === 0 && comps.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="panel px-5 py-4 text-sm text-center max-w-sm">
                  Este POP ainda está vazio. Adicione uma OLT e um DIO pela barra acima, e desenhe no mapa o cabo que sai do POP.
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
                      {vflResult && vflResult.exits.length === 0 && <div className="text-slate-500">A luz não sai do POP por nenhum cabo.</div>}
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
          onClose={() => setDialog(null)}
          onSubmit={(c) => (dialog.edit ? editComponent(c) : addComponent(c))}
        />
      )}
      {dialog?.t === 'dio' && (
        <DioDialog
          initial={dialog.edit}
          count={dios.length}
          onClose={() => setDialog(null)}
          onSubmit={(c) => (dialog.edit ? editComponent(c) : addComponent({ ...c, cables: cables.length === 1 && !dios.length ? [`c${cables[0].id}`] : [] }))}
        />
      )}
      {dialog?.t === 'active' && (
        <ActiveDialog
          initial={dialog.edit}
          count={comps.filter((c) => c.kind === 'active').length}
          onClose={() => setDialog(null)}
          onSubmit={(c) => (dialog.edit ? editComponent(c) : addComponent(c))}
        />
      )}
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
              empty="Nenhum cabo chega neste POP. Desenhe o cabo no mapa ligando-o ao POP."
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
function EquipmentCard({ comp: c, diagram, cableMap, usedEnds, readOnly, pending, selConn, lit, endLabel, onDrag, onPort, onMatrix, onLink, onPatch, onEdit, onDelete }: CardProps) {
  const { w, h } = cardSize(c);
  const linked = c.kind === 'dio' ? linkedCables(diagram, c) : [];
  const fusedCount = c.kind === 'dio' ? Array.from({ length: c.ports }, (_, i) => usedEnds.has(`${c.id}:a${i + 1}`)).filter(Boolean).length : 0;
  const anyUsed = cardPorts(c).some((p) => usedEnds.has(`${c.id}:${p}`)) || fusedCount > 0;
  const icon = c.kind === 'olt' ? <Server size={15} className="text-violet-400" /> : c.kind === 'dio' ? <Box size={15} className="text-sky-400" /> : <NetIcon size={15} className="text-emerald-400" />;
  const tag = c.kind === 'olt' ? `${c.slots}×${c.ports}` : c.kind === 'dio' ? `${c.ports}P` : c.type;
  const footLeft =
    c.kind === 'dio' ? `${trays(c.ports)} bandeja${trays(c.ports) > 1 ? 's' : ''}` : c.kind === 'olt' ? `${c.slots} slot${c.slots > 1 ? 's' : ''} · TX ${c.tx_dbm} dBm` : `${c.ports} portas`;
  const footRight = c.kind === 'dio' ? `${fusedCount}/${c.ports} fusões` : c.kind === 'olt' ? 'GPON' : 'ETH';

  return (
    <div
      className="absolute rounded-lg border border-slate-800 bg-slate-900 shadow-xl"
      style={{ left: c.x, top: c.y, width: w, height: h }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Cabeçalho com as ferramentas do equipamento */}
      <div className="absolute inset-x-0 top-0 flex items-center gap-2 px-2.5 border-b border-slate-800 cursor-move" style={{ height: G.HEADER }} onPointerDown={onDrag}>
        <span className={`w-2.5 h-2.5 rounded-full ${anyUsed ? 'bg-emerald-400' : 'bg-slate-600'}`} />
        {icon}
        <span className="text-sm font-semibold truncate">{c.name}</span>
        <span className="text-[10px] text-slate-500 shrink-0">{tag}</span>
        <div className="ml-auto flex items-center">
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
          className={`absolute flex items-center justify-center rounded text-[10px] font-bold ${r.label === 'UP' ? 'text-amber-400' : c.kind === 'dio' ? 'text-sky-400' : 'text-slate-400'}`}
          style={{ left: G.PAD, top: r.y, width: G.LABEL - 6, height: G.PORT, background: '#0f172a' }}
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
        const fill = patched ? (c.kind === 'dio' ? PORT_FILL.dio : c.kind === 'active' ? PORT_FILL.active : p.startsWith('u') ? PORT_FILL.up : PORT_FILL.olt) : undefined;
        const src = c.kind === 'dio' ? fusionSource(diagram, c.id, n) : null;
        const dotCable = src ? cableMap.get(src.cable) : undefined;
        const isPending = !!pending && sameEnd(pending, end);
        const isSel = !!selConn && (sameEnd(selConn.a, end) || sameEnd(selConn.b, end));
        const hot = lit(end) || (c.kind === 'dio' && lit({ c: c.id, p: `a${n}` }));
        const label = c.kind === 'olt' ? (p.startsWith('u') ? String(n) : String(((n - 1) % c.ports) + 1)) : String(n);
        const partnerEnd = diagram.connections.find((k) => sameEnd(k.a, end) || sameEnd(k.b, end));
        const other = partnerEnd ? (sameEnd(partnerEnd.a, end) ? partnerEnd.b : partnerEnd.a) : null;
        const tip = [
          endLabel(end),
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
              borderColor: hot ? VFL : isPending ? '#fbbf24' : isSel ? '#facc15' : fill ? fill : '#334155',
              boxShadow: hot ? `0 0 10px ${VFL}, inset 0 0 6px ${VFL}` : isPending || isSel ? '0 0 0 2px #facc15' : undefined,
            }}
          >
            {label}
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
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between px-2.5 text-[10px] font-mono text-slate-500 border-t border-slate-800/60" style={{ height: G.FOOT }}>
        <span>{footLeft}</span>
        <span>{footRight}</span>
      </div>
    </div>
  );
}

