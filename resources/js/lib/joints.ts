import type { Connection, Settings } from './types';

/** Tipo de conector / acoplador com a perda típica por par conectado (dB). */
export interface JointSpec {
  id: string;
  label: string;
  loss: number;
  hint?: string;
}

/** Conectores/acopladores mais comuns em FTTH. Perdas típicas por par conector + acoplador. */
export const CONNECTOR_TYPES: JointSpec[] = [
  { id: 'SC/APC', label: 'SC/APC (verde)', loss: 0.3 },
  { id: 'SC/UPC', label: 'SC/UPC (azul)', loss: 0.25 },
  { id: 'LC/APC', label: 'LC/APC', loss: 0.25 },
  { id: 'LC/UPC', label: 'LC/UPC', loss: 0.2 },
  { id: 'FC/APC', label: 'FC/APC', loss: 0.3 },
  { id: 'FC/UPC', label: 'FC/UPC', loss: 0.25 },
  { id: 'ST/UPC', label: 'ST/UPC', loss: 0.3 },
  { id: 'E2000/APC', label: 'E2000/APC', loss: 0.25 },
  { id: 'MPO/MTP', label: 'MPO/MTP', loss: 0.5 },
  { id: 'FAST', label: 'Conector de campo (fast connector)', loss: 0.5, hint: 'montado em campo, sem polimento de fábrica' },
  { id: 'HYBRID', label: 'Acoplador híbrido (ex.: SC ↔ LC)', loss: 0.35 },
];

/** Métodos de emenda permanente. */
export const FUSION_TYPES: JointSpec[] = [
  { id: 'core', label: 'Fusão por alinhamento de núcleo', loss: 0.03, hint: 'máquinas de 6 motores' },
  { id: 'cladding', label: 'Fusão por alinhamento de casca', loss: 0.08, hint: 'máquinas de 2/3 motores' },
  { id: 'mechanical', label: 'Emenda mecânica', loss: 0.2 },
];

export const JOINT_LOSS_MAX = 10;

function specsOf(conn: Connection): JointSpec[] {
  return conn.joint === 'connector' ? CONNECTOR_TYPES : FUSION_TYPES;
}

/** Tipo escolhido para a emenda (conector ou método de fusão), se houver. */
export function jointSpec(conn: Connection): JointSpec | undefined {
  if (!conn.spec) return undefined;
  return specsOf(conn).find((s) => s.id === conn.spec);
}

/** Perda padrão da emenda sem valor manual: a do tipo escolhido, ou a do projeto. */
export function defaultJointLoss(conn: Connection, s: Pick<Settings, 'fusion_loss_db' | 'connector_loss_db'>): number {
  const spec = jointSpec(conn);
  if (spec) return spec.loss;
  return conn.joint === 'connector' ? s.connector_loss_db : s.fusion_loss_db;
}

/** Perda usada no cálculo de potência: passagem = 0; valor informado; tipo; padrão do projeto. */
export function jointLoss(conn: Connection, s: Pick<Settings, 'fusion_loss_db' | 'connector_loss_db'>): number {
  if (conn.pass) return 0;
  if (typeof conn.loss_db === 'number' && Number.isFinite(conn.loss_db)) return conn.loss_db;
  return defaultJointLoss(conn, s);
}

/** De onde vem a perda, para mostrar ao usuário. */
export function jointLossSource(conn: Connection): 'manual' | 'type' | 'project' {
  if (typeof conn.loss_db === 'number' && Number.isFinite(conn.loss_db)) return 'manual';
  return jointSpec(conn) ? 'type' : 'project';
}

/** Nome curto da emenda: "Conector SC/APC", "Fusão", "Emenda mecânica"... */
export function jointName(conn: Connection): string {
  if (conn.pass) return 'Passagem';
  if (conn.joint === 'connector') return conn.spec ? `Conector ${jointSpec(conn)?.id === 'HYBRID' ? 'híbrido' : conn.spec}` : 'Conector';
  const spec = jointSpec(conn);
  if (spec?.id === 'mechanical') return 'Emenda mecânica';
  return 'Fusão';
}

export function formatDb(v: number): string {
  return `${v.toFixed(2).replace('.', ',')} dB`;
}
