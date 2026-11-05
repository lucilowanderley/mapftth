import { Link2, Search } from 'lucide-react';
import { useState } from 'react';
import { api, errorMessage } from '../lib/api';
import { NODE_TYPES } from '../lib/catalog';
import type { DuplicateGroup, NodeType } from '../lib/types';
import { Modal } from './ui';

/** Tipos que podem ser procurados (clientes e câmeras ficam de fora). */
const TYPES: NodeType[] = ['pole', 'pop', 'dc', 'tower', 'box', 'cto', 'ceo', 'condo'];
const DEFAULT_TYPES: NodeType[] = ['pole', 'pop', 'dc', 'tower', 'box'];

/**
 * Unificar duplicados: o mesmo poste/POP/caixa importado em vários projetos (ex.: exportação do ISM)
 * vira um objeto só, compartilhado entre esses projetos. Cabos e objetos fixados passam para ele.
 */
export default function DuplicatesModal({ onClose, onDone }: { onClose: () => void; onDone?: () => void }) {
  const [types, setTypes] = useState<NodeType[]>(DEFAULT_TYPES);
  const [radius, setRadius] = useState('3');
  const [groups, setGroups] = useState<DuplicateGroup[] | null>(null);
  const [picked, setPicked] = useState<Record<number, boolean>>({});
  const [keep, setKeep] = useState<Record<number, number>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function search() {
    setBusy(true);
    setMessage('');
    try {
      const r = Math.max(0.5, Math.min(50, Number(radius.replace(',', '.')) || 3));
      const list = await api.duplicates({ types, radius: r });
      setGroups(list);
      setPicked(Object.fromEntries(list.map((_, i) => [i, true])));
      setKeep(Object.fromEntries(list.map((g, i) => [i, g.keep_id])));
    } catch (e) {
      setMessage(errorMessage(e));
    }
    setBusy(false);
  }

  async function merge() {
    if (!groups) return;
    const chosen = groups.map((g, i) => ({ g, i })).filter(({ i }) => picked[i]);
    if (!chosen.length) return;
    if (!confirm(`Unificar ${chosen.length} grupo(s)? Em cada grupo fica um objeto só, compartilhado entre os projetos. Os outros são excluídos e os cabos passam para o que ficou.`)) return;
    setBusy(true);
    try {
      let merged = 0;
      // Em partes, para não estourar o tempo do servidor com milhares de postes.
      for (let k = 0; k < chosen.length; k += 200) {
        merged += await api.mergeDuplicates(chosen.slice(k, k + 200).map(({ g, i }) => ({ keep_id: keep[i] ?? g.keep_id, ids: g.nodes.map((n) => n.id) })));
      }
      setMessage(`${merged} objeto(s) repetido(s) unificado(s).`);
      onDone?.();
      const r = Math.max(0.5, Math.min(50, Number(radius.replace(',', '.')) || 3));
      const list = await api.duplicates({ types, radius: r });
      setGroups(list);
      setPicked(Object.fromEntries(list.map((_, i) => [i, true])));
      setKeep(Object.fromEntries(list.map((g, i) => [i, g.keep_id])));
    } catch (e) {
      setMessage(errorMessage(e));
    }
    setBusy(false);
  }

  const count = groups ? groups.filter((_, i) => picked[i]).length : 0;
  return (
    <Modal title="Unificar objetos repetidos entre projetos" onClose={() => !busy && onClose()} width="max-w-3xl">
      <div className="p-5 space-y-3 overflow-auto">
        <p className="text-sm text-slate-400">
          Procura objetos do mesmo tipo a poucos metros um do outro em projetos diferentes (por exemplo, o mesmo poste em vários arquivos do ISM).
          Ao unificar, fica um objeto só, compartilhado entre esses projetos: o que mudar nele vale para todos.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
            {TYPES.map((t) => (
              <label key={t} className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={types.includes(t)} onChange={(e) => setTypes((l) => (e.target.checked ? [...l, t] : l.filter((x) => x !== t)))} />
                {NODE_TYPES[t].plural}
              </label>
            ))}
          </div>
          <label className="text-sm flex items-center gap-1.5">
            Distância até
            <input className="input !w-16 !py-1" value={radius} onChange={(e) => setRadius(e.target.value)} /> m
          </label>
          <button className="btn-ghost" disabled={busy || !types.length} onClick={search}>
            <Search size={16} /> Procurar
          </button>
        </div>
        {message && <p className="text-sm text-emerald-300">{message}</p>}
        {groups && !groups.length && <p className="text-sm text-slate-400">Nenhum objeto repetido entre projetos com esses filtros.</p>}
        {groups && groups.length > 0 && (
          <>
            <div className="flex items-center gap-3 text-sm">
              <span className="text-slate-400">{groups.length} grupo(s) encontrado(s). Marque qual objeto fica em cada grupo.</span>
              <button className="text-sky-400 hover:underline cursor-pointer" onClick={() => setPicked(Object.fromEntries(groups.map((_, i) => [i, true])))}>
                Marcar todos
              </button>
              <button className="text-sky-400 hover:underline cursor-pointer" onClick={() => setPicked({})}>
                Desmarcar
              </button>
            </div>
            <div className="max-h-[50vh] overflow-auto space-y-1.5 pr-1">
              {groups.map((g, i) => (
                <div key={i} className="rounded-lg border border-slate-800 px-3 py-2 text-sm">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={!!picked[i]} onChange={(e) => setPicked((p) => ({ ...p, [i]: e.target.checked }))} />
                    <b>{NODE_TYPES[g.type].label}</b>
                    <span className="text-slate-500">· {g.nodes.length} objetos · até {g.distance_m.toLocaleString('pt-BR')} m</span>
                  </label>
                  <ul className="mt-1 ml-6 space-y-0.5">
                    {g.nodes.map((n) => (
                      <li key={n.id}>
                        <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                          <input type="radio" name={`keep${i}`} checked={(keep[i] ?? g.keep_id) === n.id} onChange={() => setKeep((k) => ({ ...k, [i]: n.id }))} />
                          <span className="truncate">{n.name}</span>
                          <span className="text-slate-500 truncate">em {n.project_name}</span>
                          <span className="ml-auto text-xs text-slate-500 whitespace-nowrap">
                            {n.cables ? `${n.cables} cabo(s)` : 'sem cabos'}
                            {n.has_diagram ? ' · com diagrama' : ''}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <button className="btn-primary" disabled={busy || !count} onClick={merge}>
                <Link2 size={16} /> Unificar {count} grupo(s)
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
