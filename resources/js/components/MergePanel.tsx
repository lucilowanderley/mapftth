import { Loader2, Merge, X } from 'lucide-react';
import { useState } from 'react';
import { api, errorMessage } from '../lib/api';
import type { Cable, Duct, NetNode } from '../lib/types';
import { formatLength } from './ui';

export type MergeKind = 'cable' | 'duct';

export interface MergeSelection {
  kind: MergeKind;
  ids: number[];
}

interface Props {
  projectId: number;
  selection: MergeSelection;
  cables: Cable[];
  ducts: Duct[];
  onKind: (kind: MergeKind) => void;
  onRemove: (id: number) => void;
  onClear: () => void;
  onMerged: (r: { cables?: Cable[]; ducts?: Duct[]; nodes?: NetNode[]; removed: number[]; kind: MergeKind; message: string }) => void;
  onError: (msg: string) => void;
  onClose: () => void;
}

/** Unir: junta vários cabos (ou dutos) ligados ponta com ponta num objeto só. */
export default function MergePanel({ projectId, selection, cables, ducts, onKind, onRemove, onClear, onMerged, onError, onClose }: Props) {
  const [busy, setBusy] = useState(false);
  const { kind, ids } = selection;
  const items = ids
    .map((id) => (kind === 'cable' ? cables.find((c) => c.id === id) : ducts.find((d) => d.id === id)))
    .filter((x): x is Cable | Duct => !!x);
  const total = items.reduce((s, x) => s + (x.length_m ?? 0), 0);
  const fibers = kind === 'cable' ? new Set((items as Cable[]).map((c) => c.fiber_count)) : new Set<number>();
  const noun = kind === 'cable' ? 'cabos' : 'dutos';

  async function run() {
    setBusy(true);
    try {
      if (kind === 'cable') {
        const r = await api.mergeCables(projectId, ids);
        const s = r.sangrias.length
          ? ` Sangria em ${r.sangrias.map((x) => `${x.name} (${x.passes} FO em passagem)`).join(', ')}: o cabo segue em ${r.cables.length} trechos.`
          : '';
        onMerged({ kind, cables: r.cables, nodes: r.nodes, ducts: r.ducts, removed: r.removed, message: `${ids.length} cabos unidos em ${r.cables[0]?.name ?? 'um cabo'}.${s}` });
      } else {
        const r = await api.mergeDucts(projectId, ids);
        onMerged({ kind, ducts: [r.duct], removed: r.removed, message: `${ids.length} dutos unidos em ${r.duct.name}.` });
      }
    } catch (e) {
      onError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="absolute top-3 left-3 z-[1000] panel w-80 max-h-[calc(100%-1.5rem)] overflow-y-auto text-sm">
      <div className="flex items-start justify-between px-4 py-3 border-b border-slate-800">
        <div>
          <div className="font-semibold">Unir</div>
          <div className="text-xs text-slate-400">Junta {noun} ligados ponta com ponta num só</div>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-white cursor-pointer" aria-label="Fechar">
          <X size={18} />
        </button>
      </div>

      <div className="p-3 space-y-3">
        <div className="grid grid-cols-2 gap-1 rounded-md bg-slate-800/60 p-1">
          {(['cable', 'duct'] as MergeKind[]).map((k) => (
            <button
              key={k}
              onClick={() => onKind(k)}
              className={`rounded px-2 py-1 text-xs cursor-pointer ${kind === k ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}
            >
              {k === 'cable' ? 'Cabos' : 'Dutos'}
            </button>
          ))}
        </div>

        <p className="text-xs text-slate-400">
          Clique nos {noun} no mapa para marcar ou desmarcar (no modo Selecionar, Ctrl+clique também marca). A ordem não importa: eles só precisam
          formar um caminho contínuo, sem ramificação.
        </p>

        {items.length ? (
          <ul className="rounded-md border border-slate-800 divide-y divide-slate-800">
            {items.map((x) => (
              <li key={x.id} className="flex items-center gap-2 px-2 py-1.5 text-xs">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: x.color }} />
                <span className="flex-1 min-w-0 truncate">{x.name}</span>
                <span className="shrink-0 text-slate-500">
                  {'fiber_count' in x ? `${x.fiber_count} FO · ` : ''}
                  {formatLength(x.length_m)}
                </span>
                <button onClick={() => onRemove(x.id)} className="text-slate-500 hover:text-white cursor-pointer" aria-label="Tirar">
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-md border border-dashed border-slate-700 px-3 py-4 text-center text-xs text-slate-500">Nenhum {kind === 'cable' ? 'cabo' : 'duto'} marcado</div>
        )}

        {items.length > 1 && <div className="text-xs text-slate-400">Total: {formatLength(total)}</div>}

        {kind === 'cable' ? (
          <div className="rounded-md bg-slate-800/50 p-2 text-xs text-slate-300 space-y-1">
            <p>Fica o cabo que você marcou primeiro, com as características e o sentido dele. CTO/CEO e reservas fixadas, dutos e as caixas das pontas passam para ele.</p>
            <p>
              Onde os cabos se encontram numa CTO, CEO, caixa ou POP <b>com emendas</b>, ali vira <b>sangria</b>: as emendas ficam e as fibras livres seguem em
              passagem. Sem emenda, o cabo só passa pela caixa.
            </p>
            {fibers.size > 1 && <p className="text-amber-300">Cabos com quantidades de fibras diferentes só se unem numa caixa com emendas (sangria).</p>}
          </div>
        ) : (
          <div className="rounded-md bg-slate-800/50 p-2 text-xs text-slate-300">Fica o duto que você marcou primeiro, com as características dele; os cabos de todos passam a correr nele.</div>
        )}

        <div className="flex gap-2">
          <button className="btn-primary flex-1" disabled={items.length < 2 || busy} onClick={run}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Merge size={15} />} Unir {items.length > 1 ? `${items.length} ${noun}` : ''}
          </button>
          <button className="btn-ghost" disabled={!items.length || busy} onClick={onClear}>
            Limpar
          </button>
        </div>
      </div>
    </div>
  );
}
