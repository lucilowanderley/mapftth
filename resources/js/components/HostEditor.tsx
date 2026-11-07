import { useEffect, useMemo, useRef, useState } from 'react';
import { Archive, Camera, ChevronUp, ExternalLink, Info, Network, Plus, Split, Trash2, Unlink, X } from 'lucide-react';
import { ANCHOR_CHILD_TYPES, attachedTo, baseCableName, cableRuns, cablesAtHost, offsetOnPath, onCableNear, sangriaOptions, slacksAtHost, type OnCableItem, type SangriaOption } from '../lib/anchor';
import { CAMERA_KINDS, HEALTH_COLORS, HEALTH_LABEL, cameraHealth, cameraOf } from '../lib/camera';
import { CABLE_CATEGORIES, NODE_TYPES, SLACK_KINDS, STATUSES, splitterModel } from '../lib/catalog';
import { BOX_KINDS, BOX_PLACES, FIXABLE_TYPES, FIX_OFFSET_M, boxOf, fixationOf } from '../lib/fixation';
import { roundLatLng } from '../lib/move';
import { distance } from '../lib/geo';
import type { Cable, NetNode, NodeType, PoleAttributes, Slack, SlackKind } from '../lib/types';
import { IconTool, Sep } from './DiagramEditor';
import { nodeGlyph } from './markers';
import { formatLength } from './ui';
import { countLabel, intersects, isMarquee, joinCounts, rectFrom, type Rect } from '../lib/marquee';

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
  /** Exclui vários objetos fixados de uma vez (seleção por retângulo + Delete). */
  onDeleteMany?: (ids: number[]) => Promise<void>;
  /** Sangria do cabo aqui: numa CTO/CEO fixada, na própria caixa ou numa CTO/CEO nova (tipo). */
  onSangria?: (option: SangriaOption, target: NetNode | NodeType) => Promise<NetNode | null>;
}

/**
 * Editor do poste / da caixa: tudo o que está fixado nele (CTO, CEO, câmera), as reservas técnicas
 * guardadas ali e os cabos que passam, com uma barra de ferramentas para implantar novos objetos.
 */
export default function HostEditor({ host, nodes, cables, readOnly, covered, onClose, onAdd, onAnchor, onOpen, onOpenDiagram, onEditHost, onSlacksChange, onEditCable, onDeleteMany, onSangria }: Props) {
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
  // O mesmo cabo aparece uma vez só, mesmo cortado em trechos pelas CTO/CEO do poste/caixa.
  const runs = cableRuns(host, lines, ids);
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
  /** Seleção por retângulo (arrastar no fundo) ou Ctrl+clique: chaves "n{id}" (objeto) e "s{cabo}-{reserva}". */
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  /** Ctrl/Shift no último clique (os ícones não repassam o evento) e arrasto recém-terminado (não limpa no clique). */
  const modDown = useRef(false);
  const justBoxed = useRef(false);
  const itemClick = (key: string, select: Sel) => {
    if (modDown.current) {
      setPicked((p) => {
        const next = new Set(p);
        if (!p.size && sel) next.add(sel.kind === 'node' ? `n${sel.id}` : `s${sel.cable}-${sel.id}`);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
      setSel(null);
      return;
    }
    setPicked(new Set());
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
  // Sangria: cabo escolhido e onde fazer (CTO/CEO fixada "n12", a própria caixa "host" ou nova "new:ceo").
  const [sangriaForm, setSangriaForm] = useState<{ option: string; target: string } | null>(null);
  const [sangriaBusy, setSangriaBusy] = useState(false);
  const sangriaOpts = sangriaOptions(host, here, ids);
  const sangriaTargets: { key: string; label: string }[] = [
    ...children.filter((n) => n.type === 'cto' || n.type === 'ceo').map((n) => ({ key: `n${n.id}`, label: `${NODE_TYPES[n.type].label} ${n.name}` })),
    ...(isPole ? [] : [{ key: 'host', label: `Na própria caixa (${host.name})` }]),
    { key: 'new:ceo', label: `Nova CEO ${isPole ? 'no poste' : 'na caixa'}` },
    { key: 'new:cto', label: `Nova CTO ${isPole ? 'no poste' : 'na caixa'}` },
  ];
  const selNode = sel?.kind === 'node' ? nodes.find((n) => n.id === sel.id) : undefined;
  const selSlack = sel?.kind === 'slack' ? slacks.find((s) => s.cable.id === sel.cable && s.slack.id === sel.id) : undefined;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (covered) return;
      if ((e.target as HTMLElement).closest('input,textarea,select')) return;
      if (e.key === 'Delete' && picked.size && !readOnly) {
        e.preventDefault();
        deletePicked();
        return;
      }
      if (e.key !== 'Escape') return;
      if (picked.size) setPicked(new Set());
      else if (sangriaForm) setSangriaForm(null);
      else if (slackForm) setSlackForm(null);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Objeto que saiu do poste/caixa (excluído, solto) sai da seleção.
  const pickable = new Set([...children.map((n) => `n${n.id}`), ...slacks.map(({ cable, slack }) => `s${cable.id}-${slack.id}`), ...onCable.map((it) => (it.kind === 'node' ? `n${it.node.id}` : `s${it.cable.id}-${it.slack.id}`))]);
  const pickedNow = [...picked].filter((k) => pickable.has(k));

  /** Arrastar no fundo desenha o retângulo; ao soltar, marca o que encosta nele (Ctrl/Shift soma ao que já estava). */
  function startMarquee(e: React.MouseEvent) {
    modDown.current = e.ctrlKey || e.metaKey || e.shiftKey;
    if (e.button !== 0 || (e.target as HTMLElement).closest('[data-pick],button,input,select,textarea,label,a')) return;
    const area = areaRef.current;
    if (!area) return;
    const add = modDown.current;
    const start = { x: e.clientX, y: e.clientY };
    let rect: Rect | null = null;
    const toArea = (r: Rect) => {
      const b = area.getBoundingClientRect();
      return { x: r.x - b.left + area.scrollLeft, y: r.y - b.top + area.scrollTop, w: r.w, h: r.h };
    };
    const move = (ev: MouseEvent) => {
      const r = rectFrom(start, { x: ev.clientX, y: ev.clientY });
      if (!rect && !isMarquee(r)) return;
      rect = r;
      setMarquee(toArea(r));
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      setMarquee(null);
      if (!rect) return;
      justBoxed.current = true;
      setTimeout(() => (justBoxed.current = false), 0);
      const r = rect;
      const found = [...area.querySelectorAll<HTMLElement>('[data-pick]')]
        .filter((el) => {
          const b = el.getBoundingClientRect();
          return intersects(r, { x: b.left, y: b.top, w: b.width, h: b.height });
        })
        .map((el) => el.dataset.pick!);
      const next = new Set(add ? [...pickedNow, ...found] : found);
      if (add && sel) next.add(sel.kind === 'node' ? `n${sel.id}` : `s${sel.cable}-${sel.id}`);
      if (next.size === 1) {
        const k = [...next][0];
        setPicked(new Set());
        const sk = slacks.find(({ cable, slack }) => `s${cable.id}-${slack.id}` === k);
        setSel(k.startsWith('n') ? { kind: 'node', id: Number(k.slice(1)) } : sk ? { kind: 'slack', cable: sk.cable.id, id: sk.slack.id } : null);
        return;
      }
      setSel(null);
      setPicked(next);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    e.preventDefault();
  }

  /** Reservas e objetos marcados, prontos para excluir. */
  const pickedNodes = nodes.filter((n) => pickedNow.includes(`n${n.id}`));
  const allSlacks = [...slacks, ...onCable.flatMap((it) => (it.kind === 'slack' ? [{ cable: it.cable, slack: it.slack }] : []))];
  const pickedSlacks = allSlacks.filter(({ cable, slack }) => pickedNow.includes(`s${cable.id}-${slack.id}`));
  function pickedSummary(): string {
    const byType = new Map<NodeType, number>();
    pickedNodes.forEach((n) => byType.set(n.type, (byType.get(n.type) ?? 0) + 1));
    const parts = [...byType.entries()].map(([t, k]) => countLabel(k, NODE_TYPES[t].label, NODE_TYPES[t].plural));
    if (pickedSlacks.length) parts.push(countLabel(pickedSlacks.length, 'reserva', 'reservas'));
    return joinCounts(parts);
  }
  /** Delete com vários marcados: pergunta uma vez e exclui objetos e reservas. */
  async function deletePicked() {
    const total = pickedNodes.length + pickedSlacks.length;
    if (!total || readOnly) return;
    if (pickedNodes.length && !onDeleteMany) return;
    const what = pickedNodes.some((n) => n.type === 'cto' || n.type === 'ceo') ? ' As fusões e splitters das CTO/CEO excluídas saem junto.' : '';
    if (!confirm(`Excluir ${total === 1 ? 'o item selecionado' : `os ${total} itens selecionados`} (${pickedSummary()})?${what}`)) return;
    const byCable = new Map<number, { cable: Cable; ids: Set<string> }>();
    pickedSlacks.forEach(({ cable, slack }) => {
      const g = byCable.get(cable.id) ?? { cable, ids: new Set<string>() };
      g.ids.add(slack.id);
      byCable.set(cable.id, g);
    });
    setPicked(new Set());
    setSel(null);
    for (const { cable, ids } of byCable.values())
      onSlacksChange(cable, (cable.slacks ?? []).filter((r) => !ids.has(r.id)), `${countLabel(ids.size, 'reserva removida', 'reservas removidas')} de ${cable.name}`);
    if (pickedNodes.length) await onDeleteMany!(pickedNodes.map((n) => n.id));
  }

  async function add(type: NodeType) {
    const n = await onAdd(type);
    if (n) setSel({ kind: 'node', id: n.id });
  }

  function openSangriaForm() {
    setSlackForm(null);
    setSangriaForm({ option: sangriaOpts[0]?.key ?? '', target: sangriaTargets[0].key });
  }

  async function runSangria() {
    if (!sangriaForm || !onSangria) return;
    const option = sangriaOpts.find((o) => o.key === sangriaForm.option);
    if (!option) return;
    const t = sangriaForm.target;
    const target = t === 'host' ? host : t.startsWith('new:') ? (t.slice(4) as NodeType) : children.find((n) => `n${n.id}` === t);
    if (!target) return;
    setSangriaBusy(true);
    const done = await onSangria(option, target);
    setSangriaBusy(false);
    if (done) {
      setSangriaForm(null);
      if (done.id !== host.id) setSel({ kind: 'node', id: done.id });
    }
  }

  /** Clique no rótulo de um cabo com a sangria aberta: escolhe aquele cabo. */
  function pickCable(c: Cable) {
    if (!sangriaForm) return;
    const o = sangriaOpts.find((x) => (x.kind === 'cut' ? x.cable.id === c.id : x.cables.some((y) => y.id === c.id)));
    if (o) setSangriaForm({ ...sangriaForm, option: o.key });
  }

  function openSlackForm() {
    setSangriaForm(null);
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
      pick={`n${n.id}`}
      selected={(sel?.kind === 'node' && sel.id === n.id) || picked.has(`n${n.id}`)}
      readOnly={readOnly}
      onSelect={() => itemClick(`n${n.id}`, { kind: 'node', id: n.id })}
      onOpen={() => onOpen(n)}
      onAnchor={(on) => onAnchor(n, on)}
    />
  ));
  const slackCards = slacks.map(({ cable, slack }) => (
    <SlackCard
      key={`${cable.id}-${slack.id}`}
      cable={cable}
      slack={slack}
      pick={`s${cable.id}-${slack.id}`}
      selected={(sel?.kind === 'slack' && sel.cable === cable.id && sel.id === slack.id) || picked.has(`s${cable.id}-${slack.id}`)}
      readOnly={readOnly}
      onSelect={() => itemClick(`s${cable.id}-${slack.id}`, { kind: 'slack', cable: cable.id, id: slack.id })}
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
            {onSangria && (
              <IconTool
                icon={<Split size={16} />}
                label={
                  sangriaOpts.length
                    ? `Sangria: escolha o cabo que passa ${isPole ? 'no poste' : 'na caixa'} e onde abrir (CTO/CEO). As fibras livres passam direto; derive só as que for usar.`
                    : `Nenhum cabo para sangria ${isPole ? 'neste poste' : 'nesta caixa'} (o cabo precisa passar por aqui e não chegar numa CTO/CEO daqui)`
                }
                text="Sangria"
                onClick={() => (sangriaForm ? setSangriaForm(null) : openSangriaForm())}
                disabled={!sangriaOpts.length}
                active={!!sangriaForm}
              />
            )}
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

      {/* Formulário da sangria */}
      {sangriaForm && (
        <div className="flex flex-wrap items-end gap-2 px-3 py-2 bg-slate-50 border-b border-slate-200 text-slate-700 text-xs">
          <label className="flex flex-col gap-0.5">
            Cabo
            <select className="max-w-[28rem] rounded border border-slate-300 bg-white px-2 py-1 text-sm" value={sangriaForm.option} onChange={(e) => setSangriaForm({ ...sangriaForm, option: e.target.value })}>
              {sangriaOpts.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-0.5">
            Fazer a sangria em
            <select className="rounded border border-slate-300 bg-white px-2 py-1 text-sm" value={sangriaForm.target} onChange={(e) => setSangriaForm({ ...sangriaForm, target: e.target.value })}>
              {sangriaTargets.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <button
            className="flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 cursor-pointer disabled:opacity-50"
            disabled={sangriaBusy || !sangriaForm.option}
            onClick={runSangria}
          >
            <Split size={14} /> Fazer sangria
          </button>
          <button className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-100 cursor-pointer" onClick={() => setSangriaForm(null)}>
            Cancelar
          </button>
          <div className="basis-full text-[11px] text-slate-500">
            O cabo é aberto ali sem cortar as fibras: todas passam direto (passagem) e você deriva no diagrama de fusão só as que for usar. Dica: clique no rótulo de um cabo no desenho para escolhê-lo.
          </div>
        </div>
      )}

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
        ref={areaRef}
        className="relative flex-1 min-h-0 overflow-auto text-slate-800 select-none"
        style={{ background: '#f1f5f9', backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)', backgroundSize: '20px 20px' }}
        onMouseDownCapture={(e) => (modDown.current = e.ctrlKey || e.metaKey || e.shiftKey)}
        onMouseDown={startMarquee}
        onClick={() => {
          if (justBoxed.current) return;
          setSel(null);
          setPicked(new Set());
        }}
      >
        {marquee && <div className="marquee-box" style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }} />}
        {pickedNow.length > 1 && (
          <div className="sticky top-2 z-20 mx-auto flex w-max items-center gap-2 rounded-lg border border-yellow-500 bg-white/95 px-3 py-1.5 text-xs text-slate-700 shadow" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
            <span>
              <b>{pickedNow.length} selecionados</b> · {pickedSummary()}
              {!readOnly && <span className="text-slate-500"> · Delete exclui</span>}
            </span>
            {!readOnly && (
              <button className="rounded bg-red-600 px-2 py-0.5 font-medium text-white hover:bg-red-500 cursor-pointer" onClick={deletePicked} title="Delete">
                Excluir
              </button>
            )}
            <button className="rounded border border-slate-300 px-2 py-0.5 hover:bg-slate-100 cursor-pointer" onClick={() => setPicked(new Set())} title="Esc">
              Limpar
            </button>
          </div>
        )}
        {isPole ? (
          <PoleView
            host={host}
            nodes={nodes}
            runs={runs}
            onCable={onCable}
            children={children}
            slacks={slacks}
            dropsOf={dropsOf}
            sel={sel}
            picked={picked}
            open={open}
            readOnly={readOnly}
            onItemClick={itemClick}
            onItemDouble={itemDouble}
            onToggle={toggle}
            onOpen={onOpen}
            onAnchor={onAnchor}
            onRemoveSlack={removeSlack}
            onEditCable={onEditCable}
            onPickCable={sangriaForm ? pickCable : undefined}
            renderCard={(n) => (
              <ObjectCard
                node={n}
                nodes={nodes}
                cables={cables}
                pick={`n${n.id}`}
                selected={(sel?.kind === 'node' && sel.id === n.id) || picked.has(`n${n.id}`)}
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
                  {runs.map((run) => (
                    <CableLine key={run[0].id} run={run} host={host} nodes={nodes} onEdit={onEditCable} onPick={sangriaForm ? pickCable : undefined} />
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
  pick,
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
  /** Chave para a seleção por retângulo. */
  pick?: string;
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
      data-pick={pick}
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
  pick,
  selected,
  readOnly,
  onSelect,
  onRemove,
  onCollapse,
  onDouble,
}: {
  cable: Cable;
  slack: Slack;
  pick?: string;
  selected: boolean;
  readOnly?: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onCollapse?: () => void;
  onDouble?: () => void;
}) {
  return (
    <div
      data-pick={pick}
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
function CablePill({ cable: c, name, extra, onEdit, onPick, title }: { cable: Cable; name?: string; extra?: string; onEdit?: (c: Cable) => void; onPick?: (c: Cable) => void; title?: string }) {
  return (
    <div
      className={`shrink-0 whitespace-nowrap rounded-full border bg-white px-2.5 py-0.5 text-[11px] text-slate-600 shadow-sm ${onEdit || onPick ? 'cursor-pointer hover:bg-slate-50' : ''} ${onPick ? 'ring-2 ring-emerald-400/60' : ''}`}
      style={{ borderColor: c.color }}
      title={onPick ? `${c.name}: clique para escolher este cabo para a sangria` : (title ?? (onEdit ? `${c.name}: duplo clique para editar` : c.name))}
      onClick={(e) => {
        e.stopPropagation();
        onPick?.(c);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onEdit?.(c);
      }}
    >
      <span className="font-bold text-slate-900">{name ?? c.name}</span>
      {extra ? ` · ${extra}` : ''}
    </div>
  );
}

/** Onde o cabo (ou os trechos dele) termina no poste/caixa, ou se só passa. */
function cableRole(run: Cable[], host: NetNode, nodes: NetNode[]): string {
  const ids = [...new Set(run.flatMap((c) => [c.from_node_id, c.to_node_id]))];
  const ends = ids.map((id) => nodes.find((n) => n.id === id)).filter(Boolean) as NetNode[];
  const atHost = ends.filter((n) => n.id === host.id || distance([n.lat, n.lng], [host.lat, host.lng]) < 0.5);
  if (!atHost.length) return 'passa (apoio)';
  const names = atHost.map((n) => n.name).join(' e ');
  return run.length > 1 ? `entra e sai por ${names}` : `chega em ${names}`;
}

/** O trecho mais longo representa o cabo no rótulo. */
const mainOf = (run: Cable[]) => run.reduce((a, b) => ((b.length_m ?? 0) > (a.length_m ?? 0) ? b : a));
const runLabel = (run: Cable[], host: NetNode, nodes: NetNode[]) =>
  `${run[0].fiber_count}FO · ${CABLE_CATEGORIES[run[0].category].label} · ${cableRole(run, host, nodes)}${run.length > 1 ? ` · ${run.length} trechos` : ''}`;

/** Linha de um cabo na caixa: cor do cabo, nome e onde ele termina (ou se só passa). */
function CableLine({ run, host, nodes, onEdit, onPick }: { run: Cable[]; host: NetNode; nodes: NetNode[]; onEdit?: (c: Cable) => void; onPick?: (c: Cable) => void }) {
  const c = mainOf(run);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 rounded-full" style={{ background: c.color }} />
      <CablePill cable={c} name={baseCableName(c.name)} extra={runLabel(run, host, nodes)} onEdit={onEdit} onPick={onPick} />
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
function ObjIcon({ glyph, name, sub, selected, onClick, onDouble, title, pick }: { glyph: React.ReactNode; name: string; sub?: string; selected: boolean; onClick: () => void; onDouble: () => void; title: string; pick?: string }) {
  return (
    <button
      type="button"
      data-pick={pick}
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
  runs: Cable[][];
  onCable: OnCableItem[];
  children: NetNode[];
  slacks: { cable: Cable; slack: Slack }[];
  dropsOf: (n: NetNode) => Cable[];
  sel: Sel;
  /** Marcados pela seleção por retângulo. */
  picked: Set<string>;
  open: Set<string>;
  readOnly?: boolean;
  onItemClick: (key: string, sel: Sel) => void;
  onItemDouble: (action: () => void) => void;
  onToggle: (key: string) => void;
  onOpen: (n: NetNode) => void;
  onAnchor: (n: NetNode, on: boolean) => void;
  onRemoveSlack: (cable: Cable, id: string) => void;
  onEditCable?: (c: Cable) => void;
  /** Sangria aberta: clique no rótulo escolhe o cabo. */
  onPickCable?: (c: Cable) => void;
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
  const { host, nodes, runs, onCable, children, slacks, sel, open } = p;
  const items: ({ kind: 'node'; node: NetNode } | { kind: 'slack'; cable: Cable; slack: Slack })[] = [
    ...children.map((node) => ({ kind: 'node' as const, node })),
    ...slacks.map((x) => ({ kind: 'slack' as const, ...x })),
  ];
  const empty = !items.length && !onCable.length;

  const slackKey = (c: Cable, r: Slack) => `s${c.id}-${r.id}`;
  const slackSel = (c: Cable, r: Slack): Sel => ({ kind: 'slack', cable: c.id, id: r.id });
  const isSlackSel = (c: Cable, r: Slack) => (sel?.kind === 'slack' && sel.cable === c.id && sel.id === r.id) || p.picked.has(slackKey(c, r));
  const isNodeSel = (n: NetNode) => (sel?.kind === 'node' && sel.id === n.id) || p.picked.has(`n${n.id}`);

  const nodeItem = (n: NetNode, sub?: string) =>
    open.has(`n${n.id}`) ? (
      p.renderCard(n)
    ) : (
      <ObjIcon
        glyph={nodeGlyphEl(n)}
        name={n.name}
        sub={sub}
        pick={`n${n.id}`}
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
        pick={slackKey(c, r)}
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
        pick={slackKey(c, r)}
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
  const linesH = Math.max(1, runs.length) * LINE_H;

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
        {runs.length === 0 && <div className="relative z-[1] mx-auto w-fit rounded bg-white/90 px-2 py-1 text-xs text-slate-500 shadow-sm">Nenhum cabo passa neste poste.</div>}
        {runs.map((run) => {
          const c = mainOf(run);
          return (
          <div key={run[0].id} className="relative" style={{ height: LINE_H }}>
            <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full" style={{ background: c.color }} />
            {/* Braçadeira que prende o cabo no poste */}
            <div className="absolute left-1/2 top-1/2 h-3.5 w-8 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-slate-700 bg-slate-600/90" />
            <div className="absolute left-0 top-1/2 -translate-y-1/2">
              <CablePill cable={c} name={baseCableName(c.name)} extra={runLabel(run, host, nodes)} onEdit={p.onEditCable} onPick={p.onPickCable} />
            </div>
            {placed
              .filter(({ it }) => run.some((x) => x.id === it.cable.id))
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
          );
        })}
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
