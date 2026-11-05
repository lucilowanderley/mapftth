import { Loader2, Undo2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api, errorMessage } from '../lib/api';
import {
  BULK_DEFAULT_M,
  BULK_MAX_M,
  BULK_TARGET,
  BULK_WHAT,
  CABLE_TARGET_HINT,
  bulkPayload,
  bulkSummary,
  planBulkFix,
  undoPayload,
  type BulkItem,
  type BulkPayload,
  type BulkTarget,
  type BulkWhat,
} from '../lib/bulkfix';
import type { Cable, LatLng, NetNode } from '../lib/types';
import { formatLength } from './ui';

/** O que o mapa desenha enquanto o painel está aberto: de onde cada objeto sai até onde vai. */
export interface BulkPreview {
  lines: [LatLng, LatLng][];
  targets: LatLng[];
  /** Item com o mouse em cima (destacado). */
  focus?: [LatLng, LatLng][];
}

interface Props {
  projectId: number;
  nodes: NetNode[];
  cables: Cable[];
  /** Área visível do mapa [[sul, oeste], [norte, leste]]. */
  view: [LatLng, LatLng] | null;
  onPreview: (p: BulkPreview | null) => void;
  onFocus: (lines: [LatLng, LatLng][]) => void;
  onApplied: (nodes: NetNode[], cables: Cable[], message: string) => void;
  onError: (msg: string) => void;
  onClose: () => void;
}

const LIST_LIMIT = 300;
const QUICK_M = [5, 10, 20, 50];

function loadPrefs(): { what: BulkWhat; target: BulkTarget; maxM: number } {
  try {
    const p = JSON.parse(localStorage.getItem('mapftth.bulkfix') ?? '{}');
    const what: BulkWhat = p.what in BULK_WHAT ? p.what : 'cto';
    const target: BulkTarget = BULK_WHAT[what].targets.includes(p.target) ? p.target : BULK_WHAT[what].targets[0];
    const maxM = Number(p.maxM) > 0 ? Math.min(BULK_MAX_M, Number(p.maxM)) : BULK_DEFAULT_M;
    return { what, target, maxM };
  } catch {
    return { what: 'cto', target: 'pole', maxM: BULK_DEFAULT_M };
  }
}

export default function BulkFixPanel({ projectId, nodes, cables, view, onPreview, onFocus, onApplied, onError, onClose }: Props) {
  const initial = useMemo(loadPrefs, []);
  const [what, setWhat] = useState<BulkWhat>(initial.what);
  const [target, setTarget] = useState<BulkTarget>(initial.target);
  const [maxM, setMaxM] = useState(initial.maxM);
  const [includeFixed, setIncludeFixed] = useState(false);
  const [onlyView, setOnlyView] = useState(false);
  const [addOnPath, setAddOnPath] = useState(false);
  /** Itens desmarcados na lista (por chave). */
  const [off, setOff] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [undo, setUndo] = useState<{ payload: BulkPayload; label: string } | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem('mapftth.bulkfix', JSON.stringify({ what, target, maxM }));
    } catch {
      // ignora
    }
  }, [what, target, maxM]);

  const plan = useMemo(
    () => planBulkFix({ what, target, maxM, includeFixed, addOnPath, bounds: onlyView ? view : null }, nodes, cables),
    [what, target, maxM, includeFixed, addOnPath, onlyView, view, nodes, cables],
  );
  const chosen = useMemo(() => plan.items.filter((it) => !off.has(it.key)), [plan, off]);

  // Muda a pergunta: volta a marcar tudo.
  useEffect(() => setOff(new Set()), [what, target]);

  useEffect(() => {
    const hovered = hover ? plan.items.find((it) => it.key === hover) : undefined;
    onPreview({
      lines: chosen.flatMap((it) => it.lines),
      targets: chosen.flatMap((it) => it.lines.map((l) => l[1])),
      focus: hovered?.lines,
    });
  }, [chosen, hover, plan, onPreview]);
  useEffect(() => () => onPreview(null), [onPreview]);

  const pickWhat = (w: BulkWhat) => {
    setWhat(w);
    if (!BULK_WHAT[w].targets.includes(target)) setTarget(BULK_WHAT[w].targets[0]);
  };
  const toggle = (key: string) =>
    setOff((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  async function apply() {
    if (!chosen.length) return;
    const label = bulkSummary(what, target, chosen.length, maxM);
    const back = undoPayload(chosen, nodes, cables);
    setSaving(true);
    try {
      const r = await api.fixBulk(projectId, { ...bulkPayload(chosen), label });
      setUndo({ payload: back, label });
      setOff(new Set());
      onApplied(r.nodes, r.cables, `Fixado: ${label}.`);
    } catch (e) {
      onError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function undoLast() {
    if (!undo) return;
    setSaving(true);
    try {
      const r = await api.fixBulk(projectId, { ...undo.payload, label: `Desfeito: ${undo.label}` });
      setUndo(null);
      onApplied(r.nodes, r.cables, `Desfeito: ${undo.label}.`);
    } catch (e) {
      onError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  const isCable = what === 'cable';
  const noun = BULK_WHAT[what].plural;

  return (
    <div className="absolute top-3 left-3 z-[1000] panel w-80 max-h-[calc(100%-1.5rem)] overflow-y-auto text-sm">
      <div className="flex items-start justify-between px-4 py-3 border-b border-slate-800">
        <div>
          <div className="font-semibold">Fixar em massa</div>
          <div className="text-xs text-slate-400">Fixa vários objetos de uma vez no alvo mais perto</div>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-white cursor-pointer" aria-label="Fechar">
          <X size={18} />
        </button>
      </div>

      <div className="p-3 space-y-3">
        <div>
          <span className="label">1. O que fixar</span>
          <div className="grid grid-cols-3 gap-1">
            {(Object.keys(BULK_WHAT) as BulkWhat[]).map((w) => (
              <button
                key={w}
                onClick={() => pickWhat(w)}
                className={`rounded-md border px-1.5 py-1.5 text-xs leading-tight cursor-pointer ${what === w ? 'border-emerald-500 bg-emerald-600/20 text-emerald-300' : 'border-slate-700 text-slate-300 hover:bg-slate-800'}`}
              >
                {BULK_WHAT[w].label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="label">2. Onde fixar</span>
          <div className="grid grid-cols-3 gap-1">
            {BULK_WHAT[what].targets.map((t) => (
              <button
                key={t}
                onClick={() => setTarget(t)}
                className={`rounded-md border px-1.5 py-1.5 text-xs cursor-pointer ${target === t ? 'border-emerald-500 bg-emerald-600/20 text-emerald-300' : 'border-slate-700 text-slate-300 hover:bg-slate-800'}`}
              >
                {BULK_TARGET[t].label}
              </button>
            ))}
          </div>
          <div className="mt-1 text-xs text-slate-400">{isCable ? CABLE_TARGET_HINT : BULK_TARGET[target].hint}</div>
        </div>

        <div>
          <span className="label">3. Distância máxima até o {BULK_TARGET[target].label.toLowerCase()}</span>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={1}
              max={BULK_MAX_M}
              className="input !w-20"
              value={maxM}
              onChange={(e) => setMaxM(Math.max(0, Math.min(BULK_MAX_M, Number(e.target.value) || 0)))}
            />
            <span className="text-xs text-slate-400 mr-1">m</span>
            {QUICK_M.map((m) => (
              <button key={m} onClick={() => setMaxM(m)} className={`rounded px-1.5 py-1 text-xs cursor-pointer ${maxM === m ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}>
                {m} m
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1 text-xs text-slate-300">
          {!isCable && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="accent-emerald-500" checked={includeFixed} onChange={(e) => setIncludeFixed(e.target.checked)} />
              Trocar também os que já estão fixados
            </label>
          )}
          {isCable && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="accent-emerald-500" checked={addOnPath} onChange={(e) => setAddOnPath(e.target.checked)} />
              Passar também pelos {target === 'box' ? 'caixas' : 'postes'} perto do traçado (novo vértice)
            </label>
          )}
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" className="accent-emerald-500" checked={onlyView} onChange={(e) => setOnlyView(e.target.checked)} />
            Só na área visível do mapa
          </label>
        </div>

        <div className="rounded-md bg-slate-800/60 px-2.5 py-2 text-xs space-y-0.5">
          <div>
            <b className="text-emerald-300">{plan.items.length}</b> {isCable ? (plan.items.length === 1 ? 'cabo para ajustar' : 'cabos para ajustar') : `${plan.items.length === 1 ? BULK_WHAT[what].label.toLowerCase().replace(/^(cto|ceo)$/, (x) => x.toUpperCase()) : noun} para fixar`}
            {plan.items.length !== chosen.length && <span className="text-slate-400"> ({chosen.length} marcados)</span>}
          </div>
          {plan.unmatched > 0 && (
            <div className="text-amber-300">
              {plan.unmatched} {isCable ? 'sem vértice' : 'sem alvo'} a até {maxM} m
            </div>
          )}
          {plan.skippedFixed > 0 && <div className="text-slate-400">{plan.skippedFixed} já fixados (ignorados)</div>}
          {plan.total === 0 && <div className="text-slate-400">Nenhum {BULK_WHAT[what].label.toLowerCase()} {onlyView ? 'na área visível' : 'no projeto'}.</div>}
        </div>

        {plan.items.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="label !mb-0">Prévia (linhas tracejadas no mapa)</span>
              <span className="flex gap-1">
                <button className="btn-ghost !px-2 !py-0.5 text-xs" onClick={() => setOff(new Set())}>
                  Todos
                </button>
                <button className="btn-ghost !px-2 !py-0.5 text-xs" onClick={() => setOff(new Set(plan.items.map((it) => it.key)))}>
                  Nenhum
                </button>
              </span>
            </div>
            <ul className="max-h-64 overflow-y-auto rounded-md border border-slate-800 divide-y divide-slate-800/70">
              {plan.items.slice(0, LIST_LIMIT).map((it) => (
                <Row key={it.key} item={it} checked={!off.has(it.key)} onToggle={() => toggle(it.key)} onHover={setHover} onFocus={() => onFocus(it.lines)} />
              ))}
            </ul>
            {plan.items.length > LIST_LIMIT && <div className="mt-1 text-xs text-slate-500">Mostrando {LIST_LIMIT} de {plan.items.length} (todos marcados entram).</div>}
          </div>
        )}

        <button className="btn-primary w-full justify-center" disabled={!chosen.length || saving} onClick={apply}>
          {saving && <Loader2 size={14} className="animate-spin" />}
          {isCable ? `Ajustar ${chosen.length} cabo${chosen.length === 1 ? '' : 's'}` : `Fixar ${chosen.length}`}
        </button>
        {undo && (
          <button className="btn-ghost w-full justify-center" disabled={saving} onClick={undoLast} title={undo.label}>
            <Undo2 size={14} /> Desfazer a última fixação em massa
          </button>
        )}
      </div>
    </div>
  );
}

function Row({ item, checked, onToggle, onHover, onFocus }: { item: BulkItem; checked: boolean; onToggle: () => void; onHover: (k: string | null) => void; onFocus: () => void }) {
  const detail =
    item.kind === 'cable'
      ? [item.moved ? `${item.moved} vértice${item.moved > 1 ? 's' : ''}` : '', item.added ? `+${item.added} novo${item.added > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ')
      : formatLength(Math.round(item.dist * 10) / 10);
  return (
    <li className="flex items-center gap-2 px-2 py-1 text-xs hover:bg-slate-800/60" onMouseEnter={() => onHover(item.key)} onMouseLeave={() => onHover(null)}>
      <input type="checkbox" checked={checked} onChange={onToggle} className="accent-emerald-500" />
      <button className="flex-1 min-w-0 text-left cursor-pointer" onClick={onFocus} title="Ver no mapa">
        <span className="block truncate">
          {item.name}
          {item.refix && <span className="text-amber-300"> (trocar)</span>}
        </span>
        <span className="block truncate text-slate-400">→ {item.targetName}</span>
      </button>
      <span className="shrink-0 text-slate-500">{detail}</span>
    </li>
  );
}
