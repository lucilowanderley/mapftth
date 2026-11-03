import { useEffect, useState } from 'react';
import { CONNECTOR_TYPES, FUSION_TYPES, JOINT_LOSS_MAX, defaultJointLoss, formatDb, jointLoss, jointLossSource, jointSpec } from '../lib/joints';
import type { Connection, Settings } from '../lib/types';

/** Limites práticos: acima disso a emenda provavelmente está ruim (ou o valor foi digitado errado). */
const WARN_FUSION = 0.3;
const WARN_CONNECTOR = 0.75;

/**
 * Edição de uma emenda do diagrama: fusão ou conector/acoplador, o tipo e a perda em dB.
 * A perda informada vale só para esta emenda; sem valor, usa a típica do tipo ou a padrão do projeto.
 */
export default function JointForm({
  conn,
  settings,
  readOnly,
  onChange,
}: {
  conn: Connection;
  settings: Pick<Settings, 'fusion_loss_db' | 'connector_loss_db'>;
  readOnly?: boolean;
  onChange: (next: Connection) => void;
}) {
  const [text, setText] = useState(conn.loss_db !== undefined ? String(conn.loss_db).replace('.', ',') : '');
  useEffect(() => {
    setText(conn.loss_db !== undefined ? String(conn.loss_db).replace('.', ',') : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conn.id]);

  if (conn.pass) {
    return <p className="text-xs text-slate-400">Passagem direta da fibra: sem fusão e sem perda.</p>;
  }

  const isConnector = conn.joint === 'connector';
  const specs = isConnector ? CONNECTOR_TYPES : FUSION_TYPES;
  const spec = jointSpec(conn);
  const used = jointLoss(conn, settings);
  const source = jointLossSource(conn);
  const def = defaultJointLoss(conn, settings);
  const projectDefault = isConnector ? settings.connector_loss_db : settings.fusion_loss_db;
  const parsed = text.trim() === '' ? undefined : Number(text.replace(',', '.'));
  const invalid = parsed !== undefined && (!Number.isFinite(parsed) || parsed < 0 || parsed > JOINT_LOSS_MAX);
  const high = used > (isConnector ? WARN_CONNECTOR : WARN_FUSION);

  function setKind(k: 'fusion' | 'connector') {
    if (k === (isConnector ? 'connector' : 'fusion')) return;
    // O tipo e a perda informada valem para um tipo de emenda: ao trocar, volta ao padrão.
    const { joint: _j, spec: _s, loss_db: _l, ...rest } = conn;
    onChange(k === 'connector' ? { ...rest, joint: 'connector' } : rest);
  }
  function setSpec(id: string) {
    const { spec: _s, ...rest } = conn;
    onChange(id ? { ...rest, spec: id } : rest);
  }
  function commitLoss(v: string) {
    setText(v);
    const t = v.trim();
    const { loss_db: _l, ...rest } = conn;
    if (t === '') return onChange(rest);
    const n = Number(t.replace(',', '.'));
    if (!Number.isFinite(n) || n < 0 || n > JOINT_LOSS_MAX) return;
    onChange({ ...rest, loss_db: Math.round(n * 1000) / 1000 });
  }

  return (
    <div className="space-y-3 text-sm">
      <div>
        <span className="label">Tipo de emenda</span>
        <div className="flex gap-2">
          {(
            [
              ['fusion', 'Fusão / emenda'],
              ['connector', 'Conector / acoplador'],
            ] as const
          ).map(([k, t]) => {
            const on = (isConnector ? 'connector' : 'fusion') === k;
            return (
              <button
                key={k}
                type="button"
                disabled={readOnly}
                onClick={() => setKind(k)}
                className={`rounded-md px-3 py-1.5 text-xs border ${on ? 'bg-emerald-600 border-emerald-600' : 'border-slate-700 hover:bg-slate-800'} ${readOnly ? '' : 'cursor-pointer'}`}
              >
                {t}
              </button>
            );
          })}
        </div>
      </div>
      <label className="block">
        <span className="label">{isConnector ? 'Conector / acoplador' : 'Método'}</span>
        <select className="input" value={spec?.id ?? ''} disabled={readOnly} onChange={(e) => setSpec(e.target.value)} aria-label={isConnector ? 'Tipo de conector' : 'Método da emenda'}>
          <option value="">Padrão do projeto ({formatDb(projectDefault)})</option>
          {specs.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label} · típico {formatDb(s.loss)}
            </option>
          ))}
        </select>
        {spec?.hint && <span className="text-xs text-slate-500">{spec.hint}</span>}
      </label>
      <label className="block">
        <span className="label">Perda desta emenda (dB)</span>
        <div className="flex items-center gap-2">
          <input
            className="input w-32"
            inputMode="decimal"
            placeholder={String(def).replace('.', ',')}
            value={text}
            disabled={readOnly}
            onChange={(e) => commitLoss(e.target.value)}
            aria-label="Perda da emenda em dB"
          />
          {conn.loss_db !== undefined && !readOnly && (
            <button type="button" className="text-xs text-sky-400 hover:underline cursor-pointer" onClick={() => commitLoss('')}>
              Usar a típica ({formatDb(def)})
            </button>
          )}
        </div>
        <span className="text-xs text-slate-500">Deixe vazio para usar a perda típica do tipo. Use o valor medido (máquina de fusão ou OTDR) quando tiver.</span>
      </label>
      {invalid && <p className="text-xs text-red-400">Informe um valor entre 0 e {JOINT_LOSS_MAX} dB.</p>}
      <div className="rounded-md bg-slate-800/60 px-3 py-2 text-xs">
        Perda usada no cálculo: <b className="font-mono text-sm">{formatDb(used)}</b>{' '}
        <span className="text-slate-400">
          ({source === 'manual' ? 'informada' : source === 'type' ? `típica de ${spec?.id === 'HYBRID' ? 'acoplador híbrido' : isConnector ? spec?.id : spec?.label.toLowerCase()}` : 'padrão do projeto'})
        </span>
        {high && (
          <div className="text-amber-300 mt-1">
            {isConnector ? 'Acima de 0,75 dB, o máximo da norma para um par de conectores: verifique limpeza e polimento.' : 'Acima de 0,30 dB: perda alta para uma fusão, considere refazer.'}
          </div>
        )}
      </div>
    </div>
  );
}
