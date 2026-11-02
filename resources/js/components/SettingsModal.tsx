import { useState } from 'react';
import { api, errorMessage } from '../lib/api';
import type { Project, Settings } from '../lib/types';
import { LAYERS, MAP_ENGINES, MAP_STYLES, type MapEngine, type MapStyle } from '../lib/basemaps';
import { Field, Modal } from './ui';

const FIELDS: { key: keyof Settings; label: string; step: number }[] = [
  { key: 'olt_tx_dbm', label: 'Potência padrão da OLT (dBm)', step: 0.5 },
  { key: 'fiber_loss_db_km', label: 'Atenuação da fibra (dB/km)', step: 0.01 },
  { key: 'fusion_loss_db', label: 'Perda por fusão (dB)', step: 0.01 },
  { key: 'connector_loss_db', label: 'Perda por conector (dB)', step: 0.05 },
  { key: 'onu_max_dbm', label: 'Potência máxima na ONU (dBm)', step: 0.5 },
  { key: 'onu_warn_dbm', label: 'Limite de atenção na ONU (dBm)', step: 0.5 },
  { key: 'onu_min_dbm', label: 'Sensibilidade mínima da ONU (dBm)', step: 0.5 },
];

interface Props {
  project: Project;
  settings: Settings;
  /** Dono/administrador: pode alterar os dados do projeto. */
  canManage: boolean;
  engine: MapEngine;
  engines: MapEngine[];
  onEngine: (e: MapEngine) => void;
  onClose: () => void;
  onSaved: (p: Project, s: Settings) => void;
}

export default function SettingsModal({ project, settings, canManage, engine, engines, onEngine, onClose, onSaved }: Props) {
  const [name, setName] = useState(project.name);
  const [city, setCity] = useState(project.city ?? '');
  const [values, setValues] = useState<Settings>(settings);
  const [error, setError] = useState('');

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      const r = await api.updateProject(project.id, { name, city: city || null, settings: values });
      onSaved(r.project, r.settings);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Modal title="Configurações" onClose={onClose}>
      <div className="space-y-2 pb-4 mb-4 border-b border-slate-800">
        <div className="label">Motor de mapas (salvo neste navegador)</div>
        <select className="input" value={engine} onChange={(e) => onEngine(e.target.value as MapEngine)} aria-label="Motor de mapas">
          {engines.map((e) => (
            <option key={e} value={e}>
              {MAP_ENGINES[e].label}
            </option>
          ))}
        </select>
        <ul className="text-xs text-slate-400 space-y-0.5">
          {(Object.keys(MAP_STYLES) as MapStyle[]).map((st) => (
            <li key={st}>
              <b className="text-slate-300">{MAP_STYLES[st]}</b>: {LAYERS[engine][st].note ?? LAYERS[engine][st].attribution.replace('&copy;', '©')}
            </li>
          ))}
        </ul>
        {!engines.includes('google') && (
          <p className="text-xs text-slate-500">
            Google Maps: disponível quando o administrador do servidor configura a chave GOOGLE_MAPS_KEY (veja o manual).
          </p>
        )}
      </div>
      {canManage ? (
        <form onSubmit={save} className="space-y-3">
          <div className="label">Projeto</div>
          <Field label="Nome do projeto">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label="Cidade">
            <input className="input" value={city} onChange={(e) => setCity(e.target.value)} />
          </Field>
          <div className="label pt-2">Parâmetros do orçamento óptico</div>
          <div className="grid grid-cols-2 gap-3">
            {FIELDS.map((f) => (
              <Field key={f.key} label={f.label}>
                <input
                  type="number"
                  step={f.step}
                  className="input"
                  value={values[f.key]}
                  onChange={(e) => setValues({ ...values, [f.key]: Number(e.target.value) })}
                />
              </Field>
            ))}
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-ghost" onClick={onClose}>
              Cancelar
            </button>
            <button className="btn-primary">Salvar</button>
          </div>
        </form>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-slate-500">Os dados do projeto só podem ser alterados pelo dono ou por administradores.</p>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Fechar
          </button>
        </div>
      )}
    </Modal>
  );
}
