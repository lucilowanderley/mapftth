import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { Activity } from '../lib/types';
import { Modal } from './ui';

export const ACTIONS: Record<string, string> = {
  created: 'criou',
  updated: 'alterou',
  deleted: 'excluiu',
  moved: 'moveu',
  diagram: 'editou o diagrama de',
  imported: 'importou',
};
export const TYPES: Record<string, string> = { node: '', cable: 'o cabo', area: 'a área', project: '', member: 'o membro' };
const FIELDS: Record<string, string> = {
  name: 'nome', status: 'status', notes: 'observações', attributes: 'atributos', diagram: 'diagrama', position: 'posição',
  fiber_count: 'fibras', category: 'tipo', color: 'cor', width: 'espessura', slack_m: 'reserva', path: 'traçado', model: 'modelo', papel: 'papel',
};

function describe(changes: Activity['changes']): string {
  if (!changes) return '';
  if (Array.isArray(changes)) return changes.map((k) => FIELDS[k as string] ?? k).join(', ');
  return Object.entries(changes)
    .map(([k, v]) => {
      const label = FIELDS[k] ?? k;
      if (v && typeof v === 'object' && 'para' in (v as object)) {
        const p = (v as { para: unknown }).para;
        return typeof p === 'object' ? label : `${label}: ${String(p)}`;
      }
      return typeof v === 'string' || typeof v === 'number' ? `${label}: ${v}` : label;
    })
    .join(' · ');
}

export default function HistoryModal({ projectId, title, filter, onClose }: { projectId: number; title: string; filter?: { type: string; subject_id: number }; onClose: () => void }) {
  const [items, setItems] = useState<Activity[] | null>(null);
  useEffect(() => {
    api.activity(projectId, filter).then(setItems);
  }, [projectId, filter]);

  return (
    <Modal title={`Histórico · ${title}`} onClose={onClose} width="max-w-xl">
      {!items ? (
        <p className="text-sm text-slate-400">Carregando...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-400">Nenhuma alteração registrada ainda.</p>
      ) : (
        <ol className="relative border-l border-slate-700 ml-2 space-y-3">
          {items.map((a) => (
            <li key={a.id} className="ml-4">
              <span className="absolute -left-1.5 mt-1.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-slate-900" />
              <div className="text-sm">
                <b>{a.user?.name ?? 'Alguém'}</b> {ACTIONS[a.action] ?? a.action} {TYPES[a.subject_type]} <b>{a.subject_name}</b>
              </div>
              {a.changes && <div className="text-xs text-slate-400">{describe(a.changes)}</div>}
              <div className="text-xs text-slate-500">{new Date(a.created_at).toLocaleString('pt-BR')}</div>
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}
