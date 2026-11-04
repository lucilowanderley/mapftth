import { useState } from 'react';
import { api, errorMessage } from '../lib/api';
import type { Project, Settings } from '../lib/types';
import { LAYERS, MAP_ENGINES, MAP_STYLES, maskKey, testGoogleKey, type GoogleKeySource, type MapEngine, type MapStyle } from '../lib/basemaps';
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
  /** Motor em uso (o Google sem chave aparece como OpenStreetMap). */
  engine: MapEngine;
  /** Motor escolhido neste navegador. */
  preferredEngine: MapEngine;
  googleKey: { key: string | null; source: GoogleKeySource };
  /** Só o dono do projeto cadastra a chave (ela é da conta dele). */
  isOwner: boolean;
  onGoogleKey: (k: { key: string | null; source: GoogleKeySource }) => void;
  onEngine: (e: MapEngine) => void;
  onClose: () => void;
  onSaved: (p: Project, s: Settings) => void;
}

export default function SettingsModal({ project, settings, canManage, engine, preferredEngine, googleKey, isOwner, onGoogleKey, onEngine, onClose, onSaved }: Props) {
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
          {(Object.keys(MAP_ENGINES) as MapEngine[]).map((e) => (
            <option key={e} value={e} disabled={MAP_ENGINES[e].needsKey && !googleKey.key}>
              {MAP_ENGINES[e].label}
              {MAP_ENGINES[e].needsKey && !googleKey.key ? ' (precisa de chave)' : ''}
            </option>
          ))}
        </select>
        {preferredEngine !== engine && (
          <p className="text-xs text-amber-400">Google Maps escolhido, mas este projeto não tem chave: usando o OpenStreetMap.</p>
        )}
        <ul className="text-xs text-slate-400 space-y-0.5">
          {(Object.keys(MAP_STYLES) as MapStyle[]).map((st) => (
            <li key={st}>
              <b className="text-slate-300">{MAP_STYLES[st]}</b>: {LAYERS[engine][st].note ?? LAYERS[engine][st].attribution.replaceAll('&copy;', '©')}
            </li>
          ))}
        </ul>
        <GoogleKeyField googleKey={googleKey} isOwner={isOwner} onSaved={onGoogleKey} />
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

/** Chave da Google Map Tiles API: o dono cadastra; os outros só veem se há chave. */
function GoogleKeyField({
  googleKey,
  isOwner,
  onSaved,
}: {
  googleKey: { key: string | null; source: GoogleKeySource };
  isOwner: boolean;
  onSaved: (k: { key: string | null; source: GoogleKeySource }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    const key = value.trim();
    if (!key) return;
    setBusy(true);
    setError('');
    try {
      // testa no navegador: as restrições de domínio da chave valem para este endereço
      await testGoogleKey(key);
      const r = await api.saveGoogleKey(key);
      onSaved({ key: r.google_maps_key, source: r.google_key_source });
      setEditing(false);
      setValue('');
    } catch (err) {
      setError(err instanceof Error && !('response' in err) ? err.message : errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm('Remover a chave do Google Maps da sua conta? Os seus projetos voltam para o OpenStreetMap.')) return;
    setBusy(true);
    setError('');
    try {
      const r = await api.saveGoogleKey(null);
      onSaved({ key: r.google_maps_key, source: r.google_key_source });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const status =
    googleKey.source === 'account'
      ? `Chave do Google cadastrada${isOwner ? ' na sua conta' : ' pelo dono do projeto'} (${maskKey(googleKey.key ?? '')}).`
      : googleKey.source === 'env'
        ? 'Usando a chave do Google do servidor (GOOGLE_MAPS_KEY).'
        : 'Google Maps sem chave.';

  return (
    <div className="rounded border border-slate-800 p-2 space-y-1.5">
      <div className="text-xs text-slate-300">{status}</div>
      {!isOwner ? (
        !googleKey.key && <p className="text-xs text-slate-500">Peça ao dono do projeto para cadastrar a chave da Google Map Tiles API em Configurações.</p>
      ) : editing ? (
        <div className="space-y-1.5">
          <input
            className="input font-mono text-xs"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="AIza..."
            autoFocus
            spellCheck={false}
            autoComplete="off"
            aria-label="Chave da Google Map Tiles API"
          />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => (setEditing(false), setError(''))} disabled={busy}>
              Cancelar
            </button>
            <button type="button" className="btn-primary" onClick={save} disabled={busy || !value.trim()}>
              {busy ? 'Testando...' : 'Testar e salvar'}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-ghost text-xs" onClick={() => setEditing(true)}>
            {googleKey.source === 'account' ? 'Trocar chave' : 'Cadastrar chave do Google'}
          </button>
          {googleKey.source === 'account' && (
            <button type="button" className="btn-ghost text-xs" onClick={remove} disabled={busy}>
              Remover
            </button>
          )}
        </div>
      )}
      {isOwner && (
        <p className="text-[11px] text-slate-500">
          A chave fica criptografada no servidor e vale para todos os projetos de que você é dono. Ative a Map Tiles API no Google Cloud e
          restrinja a chave a este endereço.
        </p>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
