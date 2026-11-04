import { useEffect, useMemo, useState } from 'react';
import { Archive, Camera, ExternalLink, Info, Network, Plus, Trash2, Unlink, X } from 'lucide-react';
import { ANCHOR_CHILD_TYPES, attachedTo, cablesAtHost, slacksAtHost } from '../lib/anchor';
import { CAMERA_KINDS, HEALTH_COLORS, HEALTH_LABEL, cameraHealth, cameraOf } from '../lib/camera';
import { CABLE_CATEGORIES, NODE_TYPES, SLACK_KINDS, STATUSES, splitterModel } from '../lib/catalog';
import { BOX_KINDS, BOX_PLACES, FIXABLE_TYPES, boxOf, fixationOf } from '../lib/fixation';
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
}

/**
 * Editor do poste / da caixa: tudo o que está fixado nele (CTO, CEO, câmera), as reservas técnicas
 * guardadas ali e os cabos que passam, com uma barra de ferramentas para implantar novos objetos.
 */
export default function HostEditor({ host, nodes, cables, readOnly, covered, onClose, onAdd, onAnchor, onOpen, onOpenDiagram, onEditHost, onSlacksChange }: Props) {
  const isPole = host.type === 'pole';
  const children = attachedTo(host, nodes);
  const ids = children.map((c) => c.id);
  const here = cablesAtHost(host, cables, ids);
  const slacks = slacksAtHost(host, cables);
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
  const [slackForm, setSlackForm] = useState<{ cable: number | ''; length: string; kind: SlackKind } | null>(null);
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
    setSlackForm({ cable: first?.id ?? '', length: '20', kind: isPole ? 'aerial' : 'underground' });
  }

  function saveSlack() {
    if (!slackForm) return;
    const cable = cables.find((c) => c.id === slackForm.cable);
    const length = Math.round(Number(slackForm.length.replace(',', '.')));
    if (!cable || !(length > 0)) return;
    const slack: Slack = { id: `r${Math.random().toString(36).slice(2, 9)}`, lat: host.lat, lng: host.lng, length_m: length, kind: slackForm.kind, notes: host.name };
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
              disabled={!selNode}
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
        {/* Cabos que passam / chegam */}
        <div className="px-6 pt-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{isPole ? 'Cabos no poste' : 'Cabos na caixa'}</div>
          {here.length ? (
            <div className="mt-1 space-y-1.5">
              {here.map((c) => (
                <CableLine key={c.id} cable={c} host={host} nodes={nodes} />
              ))}
            </div>
          ) : (
            <div className="mt-1 text-xs text-slate-500">Nenhum cabo passa {isPole ? 'neste poste' : 'nesta caixa'}.</div>
          )}
        </div>

        {isPole ? (
          // Poste: haste no meio, cruzeta no alto, objetos presos dos dois lados (alternando).
          <div className="relative mx-auto mt-4 mb-8 flex min-h-[420px] max-w-5xl justify-center px-4">
            <div className="absolute left-1/2 top-0 bottom-0 w-6 -translate-x-1/2 rounded-t-md bg-gradient-to-r from-slate-400 via-slate-300 to-slate-400 shadow-inner" />
            <div className="absolute left-1/2 top-6 h-3 w-64 -translate-x-1/2 rounded bg-slate-500 shadow" />
            <div className="relative z-[1] grid w-full grid-cols-2 items-start gap-x-16 pt-16">
              {[...cards, ...slackCards].map((card, i) => (
                <div key={i} className={`relative mb-4 flex items-start ${i % 2 === 0 ? 'justify-end pr-2' : 'justify-start pl-2 mt-14'}`}>
                  {/* Cinta que prende o objeto ao poste */}
                  <div className={`absolute top-6 h-1.5 w-10 rounded bg-slate-500 ${i % 2 === 0 ? '-right-8' : '-left-8'}`} />
                  {card}
                </div>
              ))}
              {empty && (
                <div className="col-span-2 mx-auto mt-24 max-w-sm rounded-lg bg-white/90 px-4 py-3 text-center text-sm text-slate-500 shadow">
                  Nenhum objeto neste poste. Use a barra acima para implantar CTO, CEO, câmera ou reserva técnica.
                </div>
              )}
            </div>
          </div>
        ) : (
          // Caixa: moldura com tudo o que está dentro.
          <div className="mx-auto mt-4 mb-8 max-w-5xl px-4">
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
}: {
  node: NetNode;
  nodes: NetNode[];
  cables: Cable[];
  selected: boolean;
  readOnly?: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onAnchor: (on: boolean) => void;
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
        {!readOnly && (
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
function SlackCard({ cable, slack, selected, readOnly, onSelect, onRemove }: { cable: Cable; slack: Slack; selected: boolean; readOnly?: boolean; onSelect: () => void; onRemove: () => void }) {
  return (
    <div
      className={`w-64 rounded-lg border bg-white shadow-sm cursor-pointer select-none ${selected ? 'ring-2 ring-emerald-500 border-emerald-500' : 'border-slate-300'}`}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <svg viewBox="0 0 24 24" width={20} height={20} className="shrink-0">
          {slack.kind === 'aerial' ? <circle cx="12" cy="12" r="9.5" fill="#fff" stroke={SLACK_KINDS.aerial.color} strokeWidth="3" /> : <rect x="2.5" y="2.5" width="19" height="19" rx="3" fill="#fff" stroke={SLACK_KINDS.underground.color} strokeWidth="3" />}
          <ellipse cx="12" cy="12" rx="5.5" ry="3.2" fill="none" stroke={cable.color} strokeWidth="1.8" />
          <ellipse cx="12" cy="12" rx="2.8" ry="1.6" fill="none" stroke={cable.color} strokeWidth="1.6" />
        </svg>
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
      </div>
    </div>
  );
}

/** Linha de um cabo no poste/caixa: cor do cabo, nome e onde ele termina (ou se só passa). */
function CableLine({ cable: c, host, nodes }: { cable: Cable; host: NetNode; nodes: NetNode[] }) {
  const ends = [c.from_node_id, c.to_node_id].map((id) => nodes.find((n) => n.id === id)).filter(Boolean) as NetNode[];
  const atHost = ends.filter((n) => n.id === host.id || distance([n.lat, n.lng], [host.lat, host.lng]) < 0.5);
  const role = atHost.length ? `chega em ${atHost.map((n) => n.name).join(' e ')}` : 'passa (apoio)';
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 rounded-full" style={{ background: c.color }} />
      <div className="shrink-0 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-600 shadow-sm">
        <span className="font-semibold text-slate-800">{c.name}</span> · {c.fiber_count}FO · {CABLE_CATEGORIES[c.category].label} · {role}
      </div>
      <div className="h-1.5 flex-1 rounded-full" style={{ background: c.color }} />
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
