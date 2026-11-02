import type { Cable, CableCategory, CondoKind, EquipmentModel, LineStyle, NodeType, RackMountType, SlackKind, Status } from './types';

/** Cores de fibras e tubos conforme padrão ABNT (NBR 14160). */
export const ABNT_COLORS = [
  { name: 'Verde', hex: '#16a34a' },
  { name: 'Amarelo', hex: '#eab308' },
  { name: 'Branco', hex: '#f8fafc' },
  { name: 'Azul', hex: '#2563eb' },
  { name: 'Vermelho', hex: '#dc2626' },
  { name: 'Violeta', hex: '#7c3aed' },
  { name: 'Marrom', hex: '#78350f' },
  { name: 'Rosa', hex: '#ec4899' },
  { name: 'Preto', hex: '#0f172a' },
  { name: 'Cinza', hex: '#9ca3af' },
  { name: 'Laranja', hex: '#f97316' },
  { name: 'Água-marinha', hex: '#06b6d4' },
];

export function fiberColor(fiber: number, perTube = 12) {
  const idx = (fiber - 1) % Math.max(1, Math.min(perTube, 12));
  return ABNT_COLORS[idx];
}

export function tubeColor(fiber: number, perTube = 12) {
  return ABNT_COLORS[Math.floor((fiber - 1) / Math.max(1, perTube)) % 12];
}

export interface CableModel {
  id: string;
  name: string;
  fibers: number;
  perTube: number;
  category: CableCategory;
}

export const CABLE_MODELS: CableModel[] = [
  { id: 'drop-1', name: 'Cabo Drop 1FO', fibers: 1, perTube: 1, category: 'drop' },
  { id: 'drop-2', name: 'Cabo Drop 2FO', fibers: 2, perTube: 2, category: 'drop' },
  { id: 'as-6', name: 'Cabo 6FO', fibers: 6, perTube: 6, category: 'distribution' },
  { id: 'as-12', name: 'Cabo 12FO', fibers: 12, perTube: 12, category: 'distribution' },
  { id: 'as-24', name: 'Cabo 24FO', fibers: 24, perTube: 12, category: 'distribution' },
  { id: 'as-36', name: 'Cabo 36FO', fibers: 36, perTube: 12, category: 'distribution' },
  { id: 'as-48', name: 'Cabo 48FO', fibers: 48, perTube: 12, category: 'backbone' },
  { id: 'as-72', name: 'Cabo 72FO', fibers: 72, perTube: 12, category: 'backbone' },
  { id: 'as-144', name: 'Cabo 144FO', fibers: 144, perTube: 12, category: 'backbone' },
];

export interface SplitterModel {
  id: string;
  name: string;
  outputs: number;
  /** Perda em dB de cada saída (índice 0 = saída 1). */
  losses: number[];
  /** Saídas conectorizadas somam a perda de conector. */
  connectorized: boolean;
  balanced: boolean;
}

const BALANCED_LOSS: Record<number, number> = { 2: 3.7, 4: 7.1, 8: 10.5, 16: 13.8, 32: 17.1, 64: 20.5 };
const UNBALANCED: [number, number, number][] = [
  // [porcentagem menor, perda do ramo menor, perda do ramo maior]
  [1, 20.0, 0.32], [2, 17.0, 0.35], [5, 13.7, 0.48], [10, 10.0, 0.73], [15, 8.2, 0.95], [20, 7.0, 1.25],
  [25, 6.0, 1.55], [30, 5.3, 1.8], [35, 4.7, 2.1], [40, 4.2, 2.5], [45, 3.7, 2.9], [50, 3.2, 3.2],
];

export const SPLITTER_MODELS: SplitterModel[] = [
  ...Object.entries(BALANCED_LOSS).flatMap(([n, loss]) => {
    const outputs = Number(n);
    return (['RF', 'APC', 'UPC'] as const).map((conn) => ({
      id: `1x${outputs}-${conn.toLowerCase()}`,
      name: conn === 'RF' ? `1:${outputs} RF` : `1:${outputs} AC ${conn}`,
      outputs,
      losses: Array(outputs).fill(loss),
      connectorized: conn !== 'RF',
      balanced: true,
    }));
  }),
  ...UNBALANCED.map(([pct, small, big]) => ({
    id: `unb-${pct}`,
    name: `${pct}/${100 - pct}`,
    outputs: 2,
    losses: [small, big],
    connectorized: false,
    balanced: false,
  })),
];

export const splitterModel = (id: string) => SPLITTER_MODELS.find((m) => m.id === id) ?? SPLITTER_MODELS[0];

export interface OltModel {
  id: string;
  name: string;
  vendor: string;
  slots: number;
  ports: number;
  uplinks: number;
  height_u: number;
}

export const OLT_MODELS: OltModel[] = [
  { id: 'custom', name: 'Configuração personalizada', vendor: '', slots: 1, ports: 8, uplinks: 2, height_u: 1 },
  { id: 'huawei-ma5608t', name: 'OLT Huawei MA5608T', vendor: 'Huawei', slots: 2, ports: 16, uplinks: 4, height_u: 2 },
  { id: 'vsol-8', name: 'OLT V-Sol 8 portas', vendor: 'V-Sol', slots: 1, ports: 8, uplinks: 4, height_u: 1 },
  { id: 'zte-c320', name: 'OLT ZTE C320', vendor: 'ZTE', slots: 2, ports: 16, uplinks: 4, height_u: 2 },
];

/** Modelos padrão do cadastro de equipamentos (somente leitura). Os do usuário vêm da API. */
export const BUILTIN_EQUIPMENT: EquipmentModel[] = [
  ...OLT_MODELS.filter((m) => m.id !== 'custom').map(
    (m): EquipmentModel => ({ id: m.id, kind: 'olt', vendor: m.vendor, model: m.name.replace(/^OLT /, '').replace(`${m.vendor} `, ''), ports: m.ports, slots: m.slots, uplinks: m.uplinks, height_u: m.height_u, builtin: true }),
  ),
  ...[
    [12, 1],
    [24, 1],
    [48, 2],
    [72, 3],
    [144, 4],
  ].map(([p, h]): EquipmentModel => ({ id: `dio-${p}`, kind: 'dio', vendor: null, model: `DIO ${p} portas ${h}U`, ports: p, height_u: h, builtin: true })),
  { id: 'sw-24', kind: 'active', vendor: null, model: 'Switch 24 portas', type: 'Switch', ports: 24, height_u: 1, builtin: true },
  { id: 'sw-48', kind: 'active', vendor: null, model: 'Switch 48 portas', type: 'Switch', ports: 48, height_u: 1, builtin: true },
  { id: 'ccr2004', kind: 'active', vendor: 'MikroTik', model: 'CCR2004-16G-2S+', type: 'Roteador', ports: 18, height_u: 1, builtin: true },
  { id: 'pp-24', kind: 'active', vendor: null, model: 'Patch panel 24 portas', type: 'Patch panel UTP', ports: 24, height_u: 1, builtin: true },
  { id: 'ups-2u', kind: 'active', vendor: null, model: 'Nobreak rack 2U', type: 'Nobreak / UPS', ports: 1, height_u: 2, builtin: true },
];

export const EQUIPMENT_KINDS: Record<EquipmentModel['kind'], string> = { olt: 'OLT', dio: 'DIO', active: 'Ativos' };

/** Nome para listas: "Huawei MA5608T". */
export const equipmentLabel = (m: EquipmentModel) => [m.vendor, m.model].filter(Boolean).join(' ');

export const oltModel = (id: string) => OLT_MODELS.find((m) => m.id === id);

export const DIO_SIZES = [12, 24, 36, 48, 72, 144];
/** Portas por bandeja do DIO. */
export const DIO_TRAY = 12;

export const ACTIVE_TYPES = ['Switch', 'Roteador', 'BNG / Concentrador', 'Servidor', 'Firewall', 'Nobreak / UPS', 'Patch panel UTP', 'Outro'];

export const NODE_TYPES: Record<NodeType, { label: string; plural: string; color: string }> = {
  pop: { label: 'POP', plural: 'POPs', color: '#7c3aed' },
  dc: { label: 'Datacenter', plural: 'Datacenters', color: '#0d9488' },
  tower: { label: 'Torre', plural: 'Torres', color: '#f43f5e' },
  ceo: { label: 'CEO', plural: 'CEOs', color: '#0ea5e9' },
  cto: { label: 'CTO', plural: 'CTOs', color: '#f97316' },
  pole: { label: 'Poste', plural: 'Postes', color: '#94a3b8' },
  client: { label: 'Cliente', plural: 'Clientes', color: '#22c55e' },
  condo: { label: 'Condomínio', plural: 'Condomínios', color: '#d946ef' },
};

/** Todos os tipos de objeto, na ordem usada em listas e relatórios. */
export const NODE_TYPE_LIST: NodeType[] = ['dc', 'pop', 'tower', 'ceo', 'cto', 'condo', 'pole', 'client'];

/** Objetos com diagrama de fusão (aceitam cabos, splitters e sangria). */
export const BOX_TYPES: NodeType[] = ['dc', 'pop', 'tower', 'ceo', 'cto', 'condo'];

/** Objetos que abrem o editor de racks (OLT, DIO, ativos e racks): POP, Datacenter e Torre (shelter). */
export const RACK_HOST_TYPES: NodeType[] = ['pop', 'dc', 'tower'];

export const CONDO_KINDS: Record<CondoKind, { label: string; unit: string; units: string; block: string }> = {
  buildings: { label: 'Prédios', unit: 'apartamento', units: 'Apartamentos', block: 'Prédios / torres' },
  houses: { label: 'Casas', unit: 'casa', units: 'Casas', block: 'Quadras' },
};

/** Alturas comuns de rack (U). */
export const RACK_SIZES = [6, 8, 12, 16, 24, 32, 36, 40, 42, 44, 46, 48];

export const RACK_MOUNTS: Record<RackMountType, { label: string; hint: string }> = {
  floor: { label: 'Piso', hint: 'Rack fechado ou aberto, apoiado no chão' },
  wall: { label: 'Suspenso', hint: 'Rack de parede (brise)' },
};

export const STATUSES: Record<Status, { label: string; color: string }> = {
  planned: { label: 'Em projeto', color: '#f59e0b' },
  not_deployed: { label: 'Não implantado', color: '#ef4444' },
  deployed: { label: 'Implantado', color: '#22c55e' },
  certified: { label: 'Certificado', color: '#3b82f6' },
};

export const CABLE_CATEGORIES: Record<CableCategory, { label: string; color: string }> = {
  backbone: { label: 'Backbone', color: '#ef4444' },
  distribution: { label: 'Distribuição', color: '#0ea5e9' },
  drop: { label: 'Drop', color: '#22c55e' },
};

export const LINE_STYLES: Record<LineStyle, { label: string }> = {
  solid: { label: 'Contínuo' },
  dashed: { label: 'Tracejado' },
  dotted: { label: 'Pontilhado' },
};

/** Estilo efetivo: sem escolha, o cabo "Em projeto" fica tracejado e os demais contínuos. */
export const effectiveLineStyle = (c: Pick<Cable, 'line_style' | 'status'>): LineStyle => c.line_style ?? (c.status === 'planned' ? 'dashed' : 'solid');

/** dashArray do Leaflet/SVG para o estilo, proporcional à espessura. */
export function lineDash(style: LineStyle, width: number): string | undefined {
  if (style === 'dashed') return `${width * 2 + 6} ${width + 5}`;
  if (style === 'dotted') return `0.1 ${width * 2 + 3}`;
  return undefined;
}

export const SLACK_KINDS: Record<SlackKind, { label: string; hint: string; color: string }> = {
  aerial: { label: 'Suspensa', hint: 'aérea, presa no poste', color: '#f59e0b' },
  underground: { label: 'Subterrânea', hint: 'em caixa subterrânea ou câmara', color: '#a16207' },
};
