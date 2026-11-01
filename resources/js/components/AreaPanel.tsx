import { FileText, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { api, errorMessage } from '../lib/api';
import { polygonArea } from '../lib/analysis';
import type { Area } from '../lib/types';
import { Field } from './ui';

const COLORS = ['#a855f7', '#0ea5e9', '#22c55e', '#f97316', '#ef4444', '#eab308', '#ec4899', '#ffffff'];

interface Props {
  area: Area;
  readOnly: boolean;
  onClose: () => void;
  onSaved: (a: Area) => void;
  onDeleted: () => void;
  onReport: () => void;
  onError: (message: string) => void;
}

export default function AreaPanel({ area, readOnly, onClose, onSaved, onDeleted, onReport, onError }: Props) {
  const [name, setName] = useState(area.name);
  const [color, setColor] = useState(area.color);
  const [notes, setNotes] = useState(area.notes ?? '');
  const [saving, setSaving] = useState(false);
  const m2 = polygonArea(area.polygon);

  async function save() {
    setSaving(true);
    try {
      onSaved(await api.updateArea(area.id, { name, color, notes: notes || null }));
    } catch (e) {
      onError(errorMessage(e));
    }
    setSaving(false);
  }

  async function remove() {
    if (!confirm(`Excluir a área ${area.name}? Os elementos da rede não são afetados.`)) return;
    try {
      await api.deleteArea(area.id);
      onDeleted();
    } catch (e) {
      onError(errorMessage(e));
    }
  }

  return (
    <div className="absolute top-3 left-3 z-[1000] panel w-72">
      <div className="flex items-start justify-between px-4 py-3 border-b border-slate-800">
        <div>
          <div className="font-semibold">{area.name}</div>
          <div className="text-xs text-slate-400">
            Área · {m2 >= 1e6 ? `${(m2 / 1e6).toFixed(2)} km²` : `${Math.round(m2).toLocaleString('pt-BR')} m²`} · {area.polygon.length} vértices
          </div>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-white cursor-pointer" aria-label="Fechar">
          <X size={18} />
        </button>
      </div>
      <div className="p-4 space-y-3">
        <button className="btn-primary w-full" onClick={onReport}>
          <FileText size={16} /> Relatório da área
        </button>
        <Field label="Nome">
          <input className="input" value={name} disabled={readOnly} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Cor">
          <div className="flex gap-1.5">
            {COLORS.map((c) => (
              <button
                key={c}
                disabled={readOnly}
                onClick={() => setColor(c)}
                className={`w-5 h-5 rounded-full border-2 cursor-pointer ${color === c ? 'border-yellow-400' : 'border-slate-700'}`}
                style={{ background: c }}
                aria-label={c}
              />
            ))}
          </div>
        </Field>
        <Field label="Observações">
          <textarea className="input" rows={2} value={notes} disabled={readOnly} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {!readOnly && (
          <div className="flex gap-2">
            <button className="btn-danger" onClick={remove} title="Excluir">
              <Trash2 size={16} />
            </button>
            <button className="btn-primary flex-1" onClick={save} disabled={saving}>
              Salvar área
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
