import { Activity, ArrowLeftRight, Image, Maximize, Plus, Save, Server, SquareStack, Trash2, Wand2, X, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, errorMessage } from '../lib/api';
import { POWER_COLORS, powerLevel, traceUpstream, type BudgetResult } from '../lib/budget';
import { DIO_SIZES, OLT_MODELS, SPLITTER_MODELS, STATUSES, fiberColor, splitterModel, tubeColor } from '../lib/catalog';
import type { Cable, Connection, Diagram, DiagramComponent, End, NetNode, Network, Status } from '../lib/types';
import { Field, Modal } from './ui';

const ROW = 14;
const HEADER = 34;
const CABLE_W = 150;
const BOX_W = 130;
const SPLIT_W = 56;

type Block = { key: string; kind: 'cable'; cable: Cable; x: number; y: number; side: 'left' | 'right'; label: string } | (DiagramComponent & { key: string });

interface Port {
  end: End;
  x: number;
  y: number;
  dir: 1 | -1;
  color: string;
  label: string;
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
      const n = splitterModel(b.model).outputs;
      const top = b.y + (h - n * ROW) / 2;
      return [
        { end: { c: b.key, p: 'in' }, x: b.x, y: b.y + h / 2, dir: -1, color: '#334155', label: 'E' },
        ...Array.from({ length: n }, (_, i) => ({
          end: { c: b.key, p: `o${i + 1}` },
          x: b.x + w,
          y: top + (i + 0.5) * ROW,
          dir: 1 as const,
          color: '#334155',
          label: String(i + 1),
        })),
      ];
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
  const [selected, setSelected] = useState<{ kind: 'conn' | 'block'; key: string } | null>(null);
  const [dialog, setDialog] = useState<'splitter' | 'olt' | 'dio' | 'auto' | null>(null);
  const [showPower, setShowPower] = useState(true);
  const [error, setError] = useState('');
  const svgRef = useRef<SVGSVGElement>(null);
  const contentRef = useRef<SVGGElement>(null);
  const drag = useRef<{ key?: string; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);

  const cables = useMemo(() => network.cables.filter((c) => c.from_node_id === node.id || c.to_node_id === node.id), [network.cables, node.id]);
  const nodeName = (id: number | null) => network.nodes.find((n) => n.id === id)?.name ?? 'ponta solta';

  const update = (fn: (d: Diagram) => Diagram) => {
    setDiagram((d) => fn(structuredClone(d)));
    setDirty(true);
  };

  // Blocos: cabos que chegam na caixa + componentes do diagrama.
  const blocks: Block[] = useMemo(() => {
    let leftY = 0;
    let rightY = 0;
    const cableBlocks = cables.map((c) => {
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
      };
    });
    return [...cableBlocks, ...diagram.components.map((c) => ({ ...c, key: c.id }))];
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
    const b = key ? blocks.find((x) => x.key === key) : undefined;
    drag.current = { key, sx: e.clientX, sy: e.clientY, ox: b ? b.x : view.x, oy: b ? b.y : view.y, moved: false };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    if (!d.moved) return;
    if (!d.key) {
      setView((v) => ({ ...v, x: d.ox + dx, y: d.oy + dy }));
      return;
    }
    const nx = Math.round((d.ox + dx / view.k) / 2) * 2;
    const ny = Math.round((d.oy + dy / view.k) / 2) * 2;
    const key = d.key;
    setDiagram((dg) => {
      const next = { ...dg };
      if (key.startsWith('c') && !dg.components.some((c) => c.id === key)) {
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
    if (d && !d.moved) {
      if (d.key) setSelected({ kind: 'block', key: d.key });
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
    update((d) => ({ ...d, connections: [...d.connections.filter((c) => portOf(c.a) && portOf(c.b)), { id: uid(), a, b: port.end }] }));
    setPending(null);
    setError('');
  }

  function removeSelected() {
    if (!selected) return;
    if (selected.kind === 'conn') {
      update((d) => ({ ...d, connections: d.connections.filter((c) => c.id !== selected.key) }));
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

  function flipCable(key: string) {
    const b = blocks.find((x) => x.key === key);
    if (!b || b.kind !== 'cable') return;
    update((d) => ({ ...d, cablePos: { ...d.cablePos, [key]: { x: b.x, y: b.y, side: b.side === 'left' ? 'right' : 'left' } } }));
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
      const r = await api.updateNode(node.id, { diagram: { ...diagram, connections: validConnections }, status });
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
      if (e.key === 'Delete' || e.key === 'Backspace') removeSelected();
      if (e.key === 'Escape') {
        setPending(null);
        setSelected(null);
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

  return (
    <div className="fixed inset-0 z-[1500] flex flex-col bg-slate-900">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-slate-800">
        <div className="font-semibold mr-2">
          {node.name} <span className="text-slate-400 font-normal text-sm">· {isPop ? 'Editor do POP' : 'Diagrama de fusão'}</span>
        </div>
        <ToolButton icon={<Plus size={15} />} label="Splitter" onClick={() => setDialog('splitter')} />
        {isPop && <ToolButton icon={<Server size={15} />} label="OLT" onClick={() => setDialog('olt')} />}
        {isPop && <ToolButton icon={<SquareStack size={15} />} label="DIO" onClick={() => setDialog('dio')} />}
        <ToolButton icon={<Wand2 size={15} />} label="Auto-fusão" onClick={() => setDialog('auto')} />
        <ToolButton icon={<Activity size={15} />} label="Potência" active={showPower} onClick={() => setShowPower((v) => !v)} />
        {selected && <ToolButton icon={<Trash2 size={15} />} label={selected.kind === 'conn' ? (diagram.connections.find((c) => c.id === selected.key)?.pass ? 'Remover passagem' : 'Remover fusão') : 'Remover'} onClick={removeSelected} danger />}
        {selected?.kind === 'block' && blocks.find((b) => b.key === selected.key)?.kind === 'cable' && (
          <ToolButton icon={<ArrowLeftRight size={15} />} label="Inverter lado" onClick={() => flipCable(selected.key)} />
        )}
        <div className="ml-auto flex items-center gap-2">
          <ToolButton icon={<Image size={15} />} label="PNG" onClick={exportPng} />
          <button onClick={requestClose} className="text-slate-400 hover:text-white cursor-pointer ml-2" aria-label="Fechar">
            <X size={20} />
          </button>
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
                const cablePort = [a, b].find((p) => p.end.c.startsWith('c') && p.end.p.startsWith('f'));
                const color = cablePort?.color ?? '#475569';
                const dx = Math.max(40, Math.abs(b.x - a.x) / 2);
                const d = `M${a.x},${a.y} C${a.x + a.dir * dx},${a.y} ${b.x + b.dir * dx},${b.y} ${b.x},${b.y}`;
                const isSel = selected?.kind === 'conn' && selected.key === c.id;
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
                    <path d={d} fill="none" stroke={isSel ? '#facc15' : '#0f172a'} strokeWidth={isSel ? 6 : 4} strokeOpacity={isSel ? 1 : 0.55} />
                    <path d={d} fill="none" stroke={color} strokeWidth={2.4} strokeDasharray={c.pass ? '6 4' : undefined} />
                  </g>
                );
              })}

              {/* Blocos */}
              {blocks.map((b) => (
                <BlockView
                  key={b.key}
                  block={b}
                  selected={selected?.kind === 'block' && selected.key === b.key}
                  onPointerDown={(e) => onPointerDown(e, b.key)}
                />
              ))}

              {/* Portas */}
              {ports.map((p) => {
                const isPending = pending && sameEnd(pending, p.end);
                const linked = !!connectedTo(p.end);
                return (
                  <g key={`${p.end.c}:${p.end.p}`} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => clickPort(e, p)} className="cursor-pointer">
                    <circle cx={p.x} cy={p.y} r={8} fill="transparent" />
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={isPending ? 6 : 4.5}
                      fill={p.end.c.startsWith('c') ? p.color : linked ? '#0f172a' : '#ffffff'}
                      stroke={isPending ? '#facc15' : '#0f172a'}
                      strokeWidth={isPending ? 2.5 : 1.2}
                    />
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
                  return (
                    <text
                      key={key}
                      x={port.x + 9}
                      y={port.y - 3}
                      fontSize={8.5}
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
      {dialog === 'auto' && <AutoFuseDialog blocks={blocks} onClose={() => setDialog(null)} onRun={autoFuse} />}
    </div>
  );
}

function ToolButton({
  icon,
  label,
  onClick,
  active,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs cursor-pointer ${
        danger ? 'bg-red-600/90 hover:bg-red-500' : active ? 'bg-emerald-600' : 'bg-slate-800 hover:bg-slate-700'
      }`}
    >
      {icon} {label}
    </button>
  );
}

function BlockView({ block: b, selected, onPointerDown }: { block: Block; selected: boolean; onPointerDown: (e: React.PointerEvent) => void }) {
  const { w, h } = blockSize(b);
  const stroke = selected ? '#eab308' : '#94a3b8';
  const sw = selected ? 2.5 : 1;

  if (b.kind === 'splitter') {
    const m = splitterModel(b.model);
    return (
      <g onPointerDown={onPointerDown} className="cursor-move">
        <path
          d={`M${b.x},${b.y + h / 2} L${b.x + w},${b.y} L${b.x + w},${b.y + h} Z`}
          fill="#64748b"
          stroke={selected ? '#eab308' : '#334155'}
          strokeWidth={sw + 0.5}
        />
        <text x={b.x + w / 2} y={b.y + h + 12} fontSize={9} textAnchor="middle" fill="#334155" fontWeight="bold">
          {b.name || m.name}
        </text>
      </g>
    );
  }

  const title = b.kind === 'cable' ? b.cable.name : b.name;
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
          const showTube = b.cable.fiber_count > b.cable.fibers_per_tube;
          const fc = fiberColor(i + 1, b.cable.fibers_per_tube);
          return (
            <g key={i}>
              {showTube && <rect x={right ? b.x + 4 : b.x + w - 8} y={y} width={4} height={ROW} fill={tube.hex} stroke="#cbd5e1" strokeWidth={0.3} />}
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
