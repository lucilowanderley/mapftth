import { useEffect, useMemo, useRef, useState } from 'react';
import { Archive, Camera, ChevronUp, ExternalLink, Info, Network, Plus, Trash2, Unlink, X } from 'lucide-react';
import { ANCHOR_CHILD_TYPES, attachedTo, cablesAtHost, offsetOnPath, onCableNear, slacksAtHost, type OnCableItem } from '../lib/anchor';
import { CAMERA_KINDS, HEALTH_COLORS, HEALTH_LABEL, cameraHealth, cameraOf } from '../lib/camera';
import { CABLE_CATEGORIES, NODE_TYPES, SLACK_KINDS, STATUSES, splitterModel } from '../lib/catalog';
import { BOX_KINDS, BOX_PLACES, FIXABLE_TYPES, FIX_OFFSET_M, boxOf, fixationOf } from '../lib/fixation';
import { roundLatLng } from '../lib/move';
import { distance } from '../lib/geo';
import type { Cable, NetNode, NodeType, PoleAttributes, Slack, SlackKind } from '../lib/types';
import { IconTool, Sep } from './DiagramEditor';
import { nodeGlyph } from './markers';
import { formatLength } from './ui';

/** Objetos soltos até essa distância (m) aparecem como "perto do poste/caixa", para fixar nele. */
const NEAR_M = 15;

type Sel = { kind: 'node'; id: number } | { kind: 'slack'; cable: number; id: string } | null;

interface Props {
  host: NetNode;
  nodes: NetNode[];
  cables: Cable[];
  readOnly?: boolean;
  /** Outro editor (diagrama da CTO/CEO) aberto por cima: as teclas são dele. */
  covered?: boolean;
  onClose: () => void;
  /** Implanta um objeto novo no poste/caixa (já fixado). */
  onAdd: (type: NodeType) => Promise<NetNode | null>;
  /** Fixa (on) ou solta o objeto; com `attach`, fixa o objeto solto neste poste/caixa. */
  onAnchor: (n: NetNode, on: boolean, attach?: NetNode) => void;
  /** Abre o editor do objeto (CTO/CEO: diagrama de fusão; câmera: painel). */
  onOpen: (n: NetNode) => void;
  /** Caixa: o próprio diagrama de fusão. */
  onOpenDiagram?: (host: NetNode) => void;
  /** Abre o painel de propriedades do poste/caixa no mapa. */
  onEditHost: (host: NetNode) => void;
  onSlacksChange: (cable: Cable, slacks: Slack[], message: string) => void;
  /** Abre o painel do cabo/drop no mapa (duplo clique no rótulo). */
  onEditCable?: (cable: Cable) => void;
}

/**
 * Editor do poste / da caixa: tudo o que está fixado nele (CTO, CEO, câmera), as reservas técnicas
 * guardadas ali e os cabos que passam, com uma barra de ferramentas para implantar novos objetos.
 */
export default function HostEditor({ host, nodes, cables, readOnly, covered, onClose, onAdd, onAnchor, onOpen, onOpenDiagram, onEditHost, onSlacksChange, onEditCable }: Props) {
  const isPole = host.type === 'pole';
  const children = attachedTo(host, nodes);
  const ids = children.map((c) => c.id);
  const here = cablesAtHost(host, cables, ids);
  const slacks = slacksAtHost(host, cables, nodes);
  // Drops que saem das CTO/CEO do poste: desenhados ligados a elas (não na faixa dos cabos).
  const dropsOf = (n: NetNode) => cables.filter((c) => c.category === 'drop' && (c.from_node_id === n.id || c.to_node_id === n.id));
  const ownDrops = new Set(children.flatMap((n) => dropsOf(n).map((c) => c.id)));
  const lines = isPole ? here.filter((c) => !ownDrops.has(c.id)) : here;
  // CTO/CEO e reservas fixadas no cabo, perto do poste: ficam sobre a linha do cabo.
  const onCable = isPole ? onCableNear(host, lines, nodes) : [];
  // Objeto recolhido (ícone) ou aberto (cartão), como no rack. Clique abre/fecha, duplo clique abre o editor.
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const clickTimer = useRef<number | undefined>(undefined);
  const toggle = (key: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const itemClick = (key: string, select: Sel) => {
    setSel(select);
    window.clearTimeout(clickTimer.current);
    clickTimer.current = window.setTimeout(() => toggle(key), 230);
  };
  const itemDouble = (action: () => void) => {
    window.clearTimeout(clickTimer.current);
    action();
  };
  useEffect(() => () => window.clearTimeout(clickTimer.current), []);
  const allowed = ANCHOR_CHILD_TYPES[isPole ? 'pole' : 'box'];
  // Objetos que podem ir para o poste/caixa, perto dele, ainda sem fixação (ou instalados em outro lugar).
  const near = useMemo(
    () =>
      nodes.filter((n) => {
        if (!allowed.includes(n.type) || ids.includes(n.id)) return false;
        if (n.type === 'camera' && (!isPole || cameraOf(n).mount_id)) return false;
        if (FIXABLE_TYPES.includes(n.type) && fixationOf(n).fixed_kind) return false;
        return distance([n.lat, n.lng], [host.lat, host.lng]) <= NEAR_M;
      }),
    [nodes, host, ids.join(',')],
  );
  const [sel, setSel] = useState<Sel>(null);
  const [slackForm, setSlackForm] = useState<{ cable: number | ''; length: string; kind: SlackKind; on: 'host' | 'cable' } | null>(null);
  const selNode = sel?.kind === 'node' ? nodes.find((n) => n.id === sel.id) : undefined;
  const selSlack = sel?.kind === 'slack' ? slacks.find((s) => s.cable.id === sel.cable && s.slack.id === sel.id) : undefined;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || covered) return;
      if ((e.target as HTMLElement).closest('input,textarea,select')) return;
      if (slackForm) setSlackForm(null);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [slackForm, onClose, covered]);

  async function add(type: NodeType) {
    const n = await onAdd(type);
    if (n) setSel({ kind: 'node', id: n.id });
  }

  function openSlackForm() {
    const first = here.find((c) => c.category !== 'drop') ?? here[0];
    setSlackForm({ cable: first?.id ?? '', length: '20', kind: isPole ? 'aerial' : 'underground', on: 'host' });
  }

  function saveSlack() {
    if (!slackForm) return;
    const cable = cables.find((c) => c.id === slackForm.cable);
    const length = Math.round(Number(slackForm.length.replace(',', '.')));
    if (!cable || !(length > 0)) return;
    const onSpan = slackForm.on === 'cable' && cable.path.length > 1;
    // No cabo (vão): um pouco ao longo do cabo, ao lado do poste. No poste/caixa: na posição dele.
    const [lat, lng] = onSpan ? roundLatLng(offsetOnPath(cable.path, [host.lat, host.lng], FIX_OFFSET_M)) : [host.lat, host.lng];
    const slack: Slack = {
      id: `r${Math.random().toString(36).slice(2, 9)}`,
      lat,
      lng,
      length_m: length,
      kind: slackForm.kind,
      notes: host.name,
      ...(onSpan ? { fixed_kind: 'cable' as const } : { fixed_kind: isPole ? ('pole' as const) : ('box' as const), fixed_id: host.id }),
    };
    onSlacksChange(cable, [...(cable.slacks ?? []), slack], `Reserva ${SLACK_KINDS[slack.kind].label.toLowerCase()} de ${length} m em ${cable.name} (${host.name})`);
    setSlackForm(null);
    setSel({ kind: 'slack', cable: cable.id, id: slack.id });
  }

  function removeSlack(cable: Cable, id: string) {
    if (!confirm(`Remover a reserva de ${cable.name}?`)) return;
    onSlacksChange(cable, (cable.slacks ?? []).filter((r) => r.id !== id), `Reserva removida de ${cable.name}`);
    setSel(null);
  }

  const pole = (host.attributes ?? {}) as PoleAttributes;
  const box = boxOf(host);
  const info = isPole
    ? [pole.code && `Código ${pole.code}`, pole.material, pole.height_m && `${pole.height_m} m`, pole.load_dan && `${pole.load_dan} daN`, pole.owner].filter(Boolean).join(' · ')
    : [`${BOX_KINDS[box.box_kind ?? 'underground'].label} · ${BOX_PLACES[box.box_place ?? 'external'].label.toLowerCase()}`, box.model, box.address].filter(Boolean).join(' · ');

  const cards = children.map((n) => (
    <ObjectCard
      key={n.id}
      node={n}
      nodes={nodes}
      cables={cables}
      selected={sel?.kind === 'node' && sel.id === n.id}
      readOnly={readOnly}
      onSelect={() => setSel({ kind: 'node', id: n.id })}
      onOpen={() => onOpen(n)}
      onAnchor={(on) => onAnchor(n, on)}
    />
  ));
  const slackCards = slacks.map(({ cable, slack }) => (
    <SlackCard
      key={`${cable.id}-${slack.id}`}
      cable={cable}
      slack={slack}
      selected={sel?.kind === 'slack' && sel.cable === cable.id && sel.id === slack.id}
      readOnly={readOnly}
      onSelect={() => setSel({ kind: 'slack', cable: cable.id, id: slack.id })}
      onRemove={() => removeSlack(cable, slack.id)}
    />
  ));
  const empty = !children.length && !slacks.length;

  return (
    <div className="fixed inset-0 z-[1500] flex flex-col bg-slate-900">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-slate-800">
        <div className="mr-2 flex items-center gap-2 font-semibold">
          <span dangerouslySetInnerHTML={{ __html: nodeGlyph(host, 20) }} />
          {host.name} <span className="text-slate-400 font-normal text-sm">· {isPole ? 'Editor do poste' : 'Editor da caixa'}</span>
        </div>
        {info && <div className="text-xs text-slate-400 truncate">{info}</div>}
        <div className="ml-auto flex items-center gap-2">
          <button onClick={onClose} className="text-slate-400 hover:text-white cursor-pointer ml-2" aria-label="Fechar">
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Barra de ferramentas: só o que pode ser implantado neste tipo de suporte. */}
      <div className="flex flex-wrap items-center gap-1 px-3 py-1.5 bg-white border-b border-slate-200 text-slate-700">
        {!readOnly && (
          <>
            {allowed.map((t) => (
              <IconTool
                key={t}
                icon={t === 'camera' ? <Camera size={16} /> : <span className="inline-flex" dangerouslySetInnerHTML={{ __html: nodeGlyph({ ...host, type: t, status: 'planned', attributes: {} }, 16) }} />}
                label={`Implantar ${NODE_TYPES[t].label} ${isPole ? 'no poste' : 'na caixa'} (fica fixada)`}
                text={`+ ${NODE_TYPES[t].label}`}
                onClick={() => add(t)}
              />
            ))}
            <IconTool icon={<SlackGlyph />} label={`Reserva técnica de um cabo que passa ${isPole ? 'no poste' : 'na caixa'}`} text="+ Reserva" onClick={openSlackForm} disabled={!here.length} active={!!slackForm} />
            <Sep />
          </>
        )}
        <IconTool icon={<ExternalLink size={16} />} label="Abrir o editor do selecionado (duplo clique no cartão)" text="Abrir" onClick={() => selNode && onOpen(selNode)} disabled={!selNode} />
        {!readOnly && (
          <>
            <IconTool
              icon={<Unlink size={16} />}
              label={`Soltar ${isPole ? 'do poste' : 'da caixa'}: o objeto ganha ícone próprio no mapa e pode ser arrastado`}
              text="Soltar"
              onClick={() => selNode && onAnchor(selNode, false)}
              disabled={!selNode || !ids.includes(selNode.id)}
            />
            <IconTool icon={<Trash2 size={16} />} label="Remover a reserva selecionada" onClick={() => selSlack && removeSlack(selSlack.cable, selSlack.slack.id)} disabled={!selSlack} danger />
            <Sep />
          </>
        )}
        {!isPole && onOpenDiagram && <IconTool icon={<Network size={16} />} label="Diagrama de fusão da própria caixa (emendas, splitters e cabos)" text="Diagrama de fusão" onClick={() => onOpenDiagram(host)} />}
        <div className="ml-auto flex items-center gap-1">
          <IconTool icon={<Info size={16} />} label={`Dados ${isPole ? 'do poste' : 'da caixa'} (painel de propriedades)`} text={isPole ? 'Dados do poste' : 'Dados da caixa'} onClick={() => onEditHost(host)} />
        </div>
      </div>

      {/* Formulário da reserva */}
      {slackForm && (
        <div className="flex flex-wrap items-end gap-2 px-3 py-2 bg-slate-50 border-b border-slate-200 text-slate-700 text-xs">
          <label className="flex flex-col gap-0.5">
            Cabo
            <select className="rounded border border-slate-300 bg-white px-2 py-1 text-sm" value={slackForm.cable} onChange={(e) => setSlackForm({ ...slackForm, cable: e.target.value ? Number(e.target.value) : '' })}>
              {here.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.fiber_count}FO · {CABLE_CATEGORIES[c.category].label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-0.5">
            Comprimento (m)
            <input className="w-24 rounded border border-slate-300 bg-white px-2 py-1 text-sm" inputMode="numeric" value={slackForm.length} onChange={(e) => setSlackForm({ ...slackForm, length: e.target.value })} />
          </label>
          <label className="flex flex-col gap-0.5">
            Tipo
            <select className="rounded border border-slate-300 bg-white px-2 py-1 text-sm" value={slackForm.kind} onChange={(e) => setSlackForm({ ...slackForm, kind: e.target.value as SlackKind })}>
              {(Object.keys(SLACK_KINDS) as SlackKind[]).map((k) => (
                <option key={k} value={k}>
                  {SLACK_KINDS[k].label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-0.5">
            Fixada em
            <select className="rounded border border-slate-300 bg-white px-2 py-1 text-sm" value={slackForm.on} onChange={(e) => setSlackForm({ ...slackForm, on: e.target.value as 'host' | 'cable' })}>
              <option value="host">{isPole ? 'Poste' : 'Caixa'}</option>
              <option value="cable">Cabo (no vão, ao lado)</option>
            </select>
          </label>
          <button className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 cursor-pointer" onClick={saveSlack}>
            Adicionar reserva
          </button>
          <button className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-100 cursor-pointer" onClick={() => setSlackForm(null)}>
            Cancelar
          </button>
        </div>
      )}

      {/* Área de desenho */}
      <div
        className="relative flex-1 min-h-0 overflow-auto text-slate-800"
        style={{ background: '#f1f5f9', backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)', backgroundSize: '20px 20px' }}
        onClick={() => setSel(null)}
      >
        {isPole ? (
          <PoleView
            host={host}
            nodes={nodes}
            lines={lines}
            onCable={onCable}
            children={children}
            slacks={slacks}
            dropsOf={dropsOf}
            sel={sel}
            open={open}
            readOnly={readOnly}
            onItemClick={itemClick}
            onItemDouble={itemDouble}
            onToggle={toggle}
            onOpen={onOpen}
            onAnchor={onAnchor}
            onRemoveSlack={removeSlack}
            onEditCable={onEditCable}
            renderCard={(n) => (
              <ObjectCard
                node={n}
                nodes={nodes}
                cables={cables}
                selected={sel?.kind === 'node' && sel.id === n.id}
                readOnly={readOnly}
                onSelect={() => itemClick(`n${n.id}`, { kind: 'node', id: n.id })}
                onOpen={() => itemDouble(() => onOpen(n))}
                onAnchor={(on) => onAnchor(n, on)}
                onCollapse={() => toggle(`n${n.id}`)}
              />
            )}
          />
        ) : (
          // Caixa: cabos que passam e moldura com tudo o que está dentro.
          <div className="mx-auto mt-4 mb-8 max-w-5xl px-4">
            <div className="mb-4">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Cabos na caixa</div>
              {here.length ? (
                <div className="mt-1 space-y-1.5">
                  {here.map((c) => (
                    <CableLine key={c.id} cable={c} host={host} nodes={nodes} onEdit={onEditCable} />
                  ))}
                </div>
              ) : (
                <div className="mt-1 text-xs text-slate-500">Nenhum cabo passa nesta caixa.</div>
              )}
            </div>
            <div className="rounded-2xl border-4 border-slate-500 bg-white/60 p-4 shadow-inner">
              <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                <Archive size={14} /> Dentro da caixa
              </div>
              <div className="flex flex-wrap items-start gap-4">
                {cards}
                {slackCards}
                {empty && <div className="text-sm text-slate-500">Nenhum objeto dentro da caixa. Use a barra acima para implantar CTO, CEO ou reserva técnica.</div>}
              </div>
            </div>
          </div>
        )}

        {/* Soltos por perto: fixar aqui */}
        {!readOnly && near.length > 0 && (
          <div className="mx-auto mb-8 max-w-5xl px-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Perto {isPole ? 'do poste' : 'da caixa'}, sem fixação</div>
            <div className="mt-1 flex flex-wrap gap-2">
              {near.map((n) => (
                <button
                  key={n.id}
                  className="flex items-center gap-1.5 rounded-md border border-dashed border-slate-400 bg-white px-2 py-1 text-xs hover:border-emerald-500 hover:bg-emerald-50 cursor-pointer"
                  title={`Fixar ${n.name} ${isPole ? 'neste poste' : 'nesta caixa'}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onAnchor(n, true, host);
                  }}
                >
                  <span dangerouslySetInnerHTML={{ __html: nodeGlyph(n, 14) }} />
                  {n.name} · {formatLength(distance([n.lat, n.lng], [host.lat, host.lng]))}
                  <Plus size={12} />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Cartão de um objeto preso no poste/caixa. Duplo clique abre o editor dele. */
function ObjectCard({
  node: n,
  nodes,
  cables,
  selected,
  readOnly,
  onSelect,
  onOpen,
  onAnchor,
  onCollapse,
}: {
  node: NetNode;
  nodes: NetNode[];
  cables: Cable[];
  selected: boolean;
  readOnly?: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onAnchor: (on: boolean) => void;
  /** Volta a ser só o ícone (editor do poste). */
  onCollapse?: () => void;
}) {
  const lines: string[] = [];
  if (n.type === 'camera') {
    const a = cameraOf(n);
    lines.push(CAMERA_KINDS[a.cam_kind ?? 'ip'].label);
    if (a.vendor || a.model) lines.push([a.vendor, a.model].filter(Boolean).join(' '));
    if (a.host) lines.push(`IP ${a.host}`);
    if (a.dvr_id) {
      const dvr = nodes.find((x) => x.id === a.dvr_id);
      if (dvr) lines.push(`Gravador ${dvr.name}${a.dvr_channel ? ` · canal ${a.dvr_channel}` : ''}`);
    }
  } else {
    const d = n.diagram;
    const splitters = (d?.components ?? []).filter((c) => c.kind === 'splitter').map((c) => splitterModel((c as { model: string }).model).name);
    const own = cables.filter((c) => c.from_node_id === n.id || c.to_node_id === n.id);
    const drops = own.filter((c) => c.category === 'drop').length;
    lines.push(`${own.length - drops} cabo${own.length - drops === 1 ? '' : 's'} · ${drops} drop${drops === 1 ? '' : 's'}`);
    lines.push(splitters.length ? `Splitter ${splitters.join(', ')}` : 'Sem splitter');
    lines.push(`${d?.connections?.length ?? 0} emenda(s)/passagem(ns)`);
  }
  const health = n.type === 'camera' && n.attributes?.cam_kind !== 'dvr' ? cameraHealth(cameraOf(n).cam_status) : null;
  return (
    <div
      className={`w-64 rounded-lg border bg-white shadow-sm cursor-pointer select-none ${selected ? 'ring-2 ring-emerald-500 border-emerald-500' : 'border-slate-300'}`}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
    >
      <div className="flex items-center gap-2 border-b border-slate-200 px-2.5 py-1.5">
        <span className="shrink-0" dangerouslySetInnerHTML={{ __html: nodeGlyph(n, 20) }} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{n.name}</div>
          <div className="text-[11px] text-slate-500">
            {NODE_TYPES[n.type].label} ·{' '}
            <span style={{ color: STATUSES[n.status].color }} className="font-medium">
              {STATUSES[n.status].label}
            </span>
          </div>
        </div>
        {onCollapse && <CollapseBtn onClick={onCollapse} />}
      </div>
      <div className="space-y-0.5 px-2.5 py-1.5 text-xs text-slate-600">
        {lines.map((l, i) => (
          <div key={i} className="truncate">
            {l}
          </div>
        ))}
        {health && (
          <div className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: HEALTH_COLORS[health] }} /> {HEALTH_LABEL[health]}
          </div>
        )}
      </div>
      <div className="flex gap-1.5 border-t border-slate-200 px-2.5 py-1.5">
        <button
          className="flex-1 rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-500 cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
        >
          {n.type === 'camera' ? 'Abrir câmera' : 'Diagrama de fusão'}
        </button>
        {!readOnly && fixationOf(n).fixed_kind !== 'cable' && (
          <button
            className="flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 cursor-pointer"
            title="Soltar do poste/caixa para mover sozinha no mapa"
            onClick={(e) => {
              e.stopPropagation();
              onAnchor(false);
            }}
          >
            <Unlink size={12} /> Soltar
          </button>
        )}
      </div>
    </div>
  );
}

/** Cartão da reserva técnica guardada no poste/caixa. */
function SlackCard({
  cable,
  slack,
  selected,
  readOnly,
  onSelect,
  onRemove,
  onCollapse,
  onDouble,
}: {
  cable: Cable;
  slack: Slack;
  selected: boolean;
  readOnly?: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onCollapse?: () => void;
  onDouble?: () => void;
}) {
  return (
    <div
      className={`w-64 rounded-lg border bg-white shadow-sm cursor-pointer select-none ${selected ? 'ring-2 ring-emerald-500 border-emerald-500' : 'border-slate-300'}`}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onDouble?.();
      }}
    >
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <CoilGlyph kind={slack.kind} color={cable.color} size={20} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">Reserva {slack.length_m} m</div>
          <div className="truncate text-[11px] text-slate-500">
            {SLACK_KINDS[slack.kind].label} · {cable.name} · {cable.fiber_count}FO
          </div>
        </div>
        {!readOnly && (
          <button
            className="text-slate-400 hover:text-red-600 cursor-pointer"
            title="Remover reserva"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
          >
            <Trash2 size={14} />
          </button>
        )}
        {onCollapse && <CollapseBtn onClick={onCollapse} />}
      </div>
    </div>
  );
}

/** Rótulo do cabo no mesmo estilo do drop do diagrama: fundo branco, borda na cor do cabo, nome em negrito. */
function CablePill({ cable: c, extra, onEdit, title }: { cable: Cable; extra?: string; onEdit?: (c: Cable) => void; title?: string }) {
  return (
    <div
      className={`shrink-0 whitespace-nowrap rounded-full border bg-white px-2.5 py-0.5 text-[11px] text-slate-600 shadow-sm ${onEdit ? 'cursor-pointer hover:bg-slate-50' : ''}`}
      style={{ borderColor: c.color }}
      title={title ?? (onEdit ? `${c.name}: duplo clique para editar` : c.name)}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onEdit?.(c);
      }}
    >
      <span className="font-bold text-slate-900">{c.name}</span>
      {extra ? ` · ${extra}` : ''}
    </div>
  );
}

/** Onde o cabo termina (ou se só passa) no poste/caixa. */
function cableRole(c: Cable, host: NetNode, nodes: NetNode[]): string {
  const ends = [c.from_node_id, c.to_node_id].map((id) => nodes.find((n) => n.id === id)).filter(Boolean) as NetNode[];
  const atHost = ends.filter((n) => n.id === host.id || distance([n.lat, n.lng], [host.lat, host.lng]) < 0.5);
  return atHost.length ? `chega em ${atHost.map((n) => n.name).join(' e ')}` : 'passa (apoio)';
}

/** Linha de um cabo na caixa: cor do cabo, nome e onde ele termina (ou se só passa). */
function CableLine({ cable: c, host, nodes, onEdit }: { cable: Cable; host: NetNode; nodes: NetNode[]; onEdit?: (c: Cable) => void }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 rounded-full" style={{ background: c.color }} />
      <CablePill cable={c} extra={`${c.fiber_count}FO · ${CABLE_CATEGORIES[c.category].label} · ${cableRole(c, host, nodes)}`} onEdit={onEdit} />
      <div className="h-1.5 flex-1 rounded-full" style={{ background: c.color }} />
    </div>
  );
}

function CollapseBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
      title="Recolher (volta a ser só o ícone)"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <ChevronUp size={14} />
    </button>
  );
}

function CoilGlyph({ kind, color, size }: { kind: SlackKind; color: string; size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className="shrink-0">
      {kind === 'aerial' ? <circle cx="12" cy="12" r="9.5" fill="#fff" stroke={SLACK_KINDS.aerial.color} strokeWidth="3" /> : <rect x="2.5" y="2.5" width="19" height="19" rx="3" fill="#fff" stroke={SLACK_KINDS.underground.color} strokeWidth="3" />}
      <ellipse cx="12" cy="12" rx="5.5" ry="3.2" fill="none" stroke={color} strokeWidth="1.8" />
      <ellipse cx="12" cy="12" rx="2.8" ry="1.6" fill="none" stroke={color} strokeWidth="1.6" />
    </svg>
  );
}

/** Ícone recolhido de um objeto (como os equipamentos no rack): clique abre o cartão, duplo clique o editor. */
function ObjIcon({ glyph, name, sub, selected, onClick, onDouble, title }: { glyph: React.ReactNode; name: string; sub?: string; selected: boolean; onClick: () => void; onDouble: () => void; title: string }) {
  return (
    <button
      type="button"
      title={title}
      className="group flex flex-col items-center gap-0.5 cursor-pointer select-none"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onDouble();
      }}
    >
      <span className={`flex h-11 w-11 items-center justify-center rounded-lg border bg-white shadow-sm transition-shadow group-hover:shadow-md ${selected ? 'border-emerald-500 ring-2 ring-emerald-500' : 'border-slate-300'}`}>{glyph}</span>
      <span className="max-w-[6.5rem] truncate rounded bg-white/90 px-1 text-[10px] font-semibold leading-tight text-slate-700">{name}</span>
      {sub && <span className="max-w-[6.5rem] truncate rounded bg-white/90 px-1 text-[9px] leading-tight text-slate-500">{sub}</span>}
    </button>
  );
}

const nodeGlyphEl = (n: NetNode, size = 26) => <span className="inline-flex" dangerouslySetInnerHTML={{ __html: nodeGlyph(n, size) }} />;

interface PoleViewProps {
  host: NetNode;
  nodes: NetNode[];
  lines: Cable[];
  onCable: OnCableItem[];
  children: NetNode[];
  slacks: { cable: Cable; slack: Slack }[];
  dropsOf: (n: NetNode) => Cable[];
  sel: Sel;
  open: Set<string>;
  readOnly?: boolean;
  onItemClick: (key: string, sel: Sel) => void;
  onItemDouble: (action: () => void) => void;
  onToggle: (key: string) => void;
  onOpen: (n: NetNode) => void;
  onAnchor: (n: NetNode, on: boolean) => void;
  onRemoveSlack: (cable: Cable, id: string) => void;
  onEditCable?: (c: Cable) => void;
  renderCard: (n: NetNode) => React.ReactNode;
}

/** Altura (px) de cada cabo na faixa abaixo da cruzeta. */
const LINE_H = 60;

/**
 * Desenho do poste: cruzeta no alto, cabos atravessando o poste logo abaixo dela e os objetos presos
 * no poste mais embaixo (recolhidos como ícones, alternando os lados), com os drops ligados à CTO/CEO.
 * Objetos fixados no cabo ficam sobre a linha do cabo, do lado em que estão.
 */
function PoleView(p: PoleViewProps) {
  const { host, nodes, lines, onCable, children, slacks, sel, open } = p;
  const items: ({ kind: 'node'; node: NetNode } | { kind: 'slack'; cable: Cable; slack: Slack })[] = [
    ...children.map((node) => ({ kind: 'node' as const, node })),
    ...slacks.map((x) => ({ kind: 'slack' as const, ...x })),
  ];
  const empty = !items.length && !onCable.length;

  const slackKey = (c: Cable, r: Slack) => `s${c.id}-${r.id}`;
  const slackSel = (c: Cable, r: Slack): Sel => ({ kind: 'slack', cable: c.id, id: r.id });
  const isSlackSel = (c: Cable, r: Slack) => sel?.kind === 'slack' && sel.cable === c.id && sel.id === r.id;
  const isNodeSel = (n: NetNode) => sel?.kind === 'node' && sel.id === n.id;

  const nodeItem = (n: NetNode, sub?: string) =>
    open.has(`n${n.id}`) ? (
      p.renderCard(n)
    ) : (
      <ObjIcon
        glyph={nodeGlyphEl(n)}
        name={n.name}
        sub={sub}
        selected={isNodeSel(n)}
        title={`${NODE_TYPES[n.type].label} ${n.name}: clique para abrir o cartão, duplo clique para ${n.type === 'camera' ? 'abrir a câmera' : 'abrir o diagrama de fusão'}`}
        onClick={() => p.onItemClick(`n${n.id}`, { kind: 'node', id: n.id })}
        onDouble={() => p.onItemDouble(() => p.onOpen(n))}
      />
    );
  const slackItem = (c: Cable, r: Slack, sub?: string) =>
    open.has(slackKey(c, r)) ? (
      <SlackCard
        cable={c}
        slack={r}
        selected={isSlackSel(c, r)}
        readOnly={p.readOnly}
        onSelect={() => p.onItemClick(slackKey(c, r), slackSel(c, r))}
        onRemove={() => p.onRemoveSlack(c, r.id)}
        onCollapse={() => p.onToggle(slackKey(c, r))}
        onDouble={() => p.onItemDouble(() => p.onEditCable?.(c))}
      />
    ) : (
      <ObjIcon
        glyph={<CoilGlyph kind={r.kind} color={c.color} size={28} />}
        name={`Reserva ${r.length_m} m`}
        sub={sub ?? c.name}
        selected={isSlackSel(c, r)}
        title={`Reserva técnica de ${r.length_m} m em ${c.name}: clique para abrir o cartão, duplo clique para editar o cabo`}
        onClick={() => p.onItemClick(slackKey(c, r), slackSel(c, r))}
        onDouble={() => p.onItemDouble(() => p.onEditCable?.(c))}
      />
    );

  // Objetos no cabo: a partir do poste, para fora, do lado em que estão.
  const sideCount = { left: 0, right: 0 };
  const placed = onCable.map((it) => ({ it, slot: sideCount[it.side]++ }));

  const linesTop = 64;
  const linesH = Math.max(1, lines.length) * LINE_H;

  return (
    <div className="relative mx-auto mb-8 max-w-6xl px-4" style={{ minHeight: linesTop + linesH + 420 }}>
      {/* Haste do poste e cruzeta (no alto) */}
      <div className="absolute left-1/2 top-3 bottom-0 w-6 -translate-x-1/2 rounded-t-md bg-gradient-to-r from-slate-400 via-slate-300 to-slate-400 shadow-inner" />
      <div className="absolute left-1/2 top-7 h-3 w-72 -translate-x-1/2 rounded bg-slate-500 shadow" />
      {[-120, -60, 60, 120].map((dx) => (
        <div key={dx} className="absolute top-[18px] h-2.5 w-2 -translate-x-1/2 rounded-t bg-slate-600" style={{ left: `calc(50% + ${dx}px)` }} />
      ))}
      <div className="absolute left-4 top-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{host.name}</div>

      {/* Cabos sobre o poste, abaixo da cruzeta */}
      <div className="relative" style={{ paddingTop: linesTop }}>
        {lines.length === 0 && <div className="relative z-[1] mx-auto w-fit rounded bg-white/90 px-2 py-1 text-xs text-slate-500 shadow-sm">Nenhum cabo passa neste poste.</div>}
        {lines.map((c) => (
          <div key={c.id} className="relative" style={{ height: LINE_H }}>
            <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full" style={{ background: c.color }} />
            {/* Braçadeira que prende o cabo no poste */}
            <div className="absolute left-1/2 top-1/2 h-3.5 w-8 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-slate-700 bg-slate-600/90" />
            <div className="absolute left-0 top-1/2 -translate-y-1/2">
              <CablePill cable={c} extra={`${c.fiber_count}FO · ${CABLE_CATEGORIES[c.category].label} · ${cableRole(c, host, nodes)}`} onEdit={p.onEditCable} />
            </div>
            {placed
              .filter(({ it }) => it.cable.id === c.id)
              .map(({ it, slot }) => {
                const key = it.kind === 'node' ? `n${it.node.id}` : slackKey(it.cable, it.slack);
                const offset = 90 + slot * 96;
                const expanded = open.has(key);
                return (
                  <div
                    key={key}
                    className={`absolute top-1/2 z-[2] ${expanded ? 'z-20' : ''}`}
                    style={{ left: `calc(50% ${it.side === 'left' ? '-' : '+'} ${offset}px)`, transform: expanded ? `translate(${it.side === 'left' ? '-100%' : '0'}, -22px)` : 'translate(-50%, -22px)' }}
                  >
                    {it.kind === 'node' ? nodeItem(it.node, `no cabo · ${formatLength(it.dist)}`) : slackItem(it.cable, it.slack, `no cabo · ${formatLength(it.dist)}`)}
                  </div>
                );
              })}
          </div>
        ))}
      </div>

      {/* Objetos presos no poste, abaixo da linha dos cabos */}
      <div className="relative z-[1] mt-10 grid grid-cols-[1fr_1.5rem_1fr] gap-y-4">
        {items.map((it, i) => {
          const left = i % 2 === 0;
          const key = it.kind === 'node' ? `n${it.node.id}` : slackKey(it.cable, it.slack);
          const drops = it.kind === 'node' && (it.node.type === 'cto' || it.node.type === 'ceo') ? p.dropsOf(it.node) : [];
          return (
            <div key={key} className={`flex items-start ${left ? 'col-start-1 flex-row-reverse' : 'col-start-3'}`} style={{ gridRow: i + 1 }}>
              {/* Cinta que prende o objeto ao poste */}
              <div className="mt-[18px] h-1.5 w-6 shrink-0 rounded bg-slate-500" />
              <div className="shrink-0">{it.kind === 'node' ? nodeItem(it.node) : slackItem(it.cable, it.slack)}</div>
              {drops.length > 0 && it.kind === 'node' && <Drops drops={drops} from={it.node} nodes={nodes} left={left} onEdit={p.onEditCable} />}
            </div>
          );
        })}
        {empty && (
          <div className="col-span-3 mx-auto mt-10 max-w-sm rounded-lg bg-white/90 px-4 py-3 text-center text-sm text-slate-500 shadow">
            Nenhum objeto neste poste. Use a barra acima para implantar CTO, CEO, câmera ou reserva técnica.
          </div>
        )}
      </div>
    </div>
  );
}

/** Drops que saem da CTO/CEO até os clientes, com o rótulo no estilo do drop do diagrama (nome · metros). */
function Drops({ drops, from, nodes, left, onEdit }: { drops: Cable[]; from: NetNode; nodes: NetNode[]; left: boolean; onEdit?: (c: Cable) => void }) {
  return (
    <div className={`mt-[19px] flex flex-col gap-1.5 ${left ? 'items-end' : 'items-start'}`}>
      {drops.map((c, i) => {
        const otherId = c.from_node_id === from.id ? c.to_node_id : c.from_node_id;
        const client = nodes.find((n) => n.id === otherId);
        return (
          <div key={c.id} className={`relative flex items-center ${left ? 'flex-row-reverse' : ''}`}>
            {/* Barramento vertical ligando os drops ao objeto */}
            {i > 0 && <div className={`absolute bottom-1/2 w-0.5 ${left ? 'right-0' : 'left-0'}`} style={{ height: 'calc(100% + 6px)', background: c.color }} />}
            <div className="h-0.5 w-10" style={{ background: c.color }} />
            <CablePill cable={c} extra={`${Math.round(c.length_m ?? 0)} m`} onEdit={onEdit} title={`Drop ${c.name}${client ? ` até ${client.name}` : ''}: duplo clique para editar`} />
            {client && (
              <div className={`flex items-center gap-1 text-[11px] text-slate-600 ${left ? 'mr-1.5' : 'ml-1.5'}`}>
                {nodeGlyphEl(client, 16)}
                <span className="max-w-[9rem] truncate">{client.name}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SlackGlyph() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <circle cx="12" cy="12" r="9.5" strokeWidth="2.2" />
      <ellipse cx="12" cy="12" rx="5.5" ry="3.2" strokeWidth="1.8" />
    </svg>
  );
}
