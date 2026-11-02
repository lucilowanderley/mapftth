export type NodeType = 'cto' | 'ceo' | 'pop' | 'pole' | 'client' | 'condo';
export type Status = 'planned' | 'not_deployed' | 'deployed' | 'certified';
export type CableCategory = 'backbone' | 'distribution' | 'drop';
export type LatLng = [number, number];
export type LineStyle = 'solid' | 'dashed' | 'dotted';
export type SlackKind = 'aerial' | 'underground';

/** Reserva técnica posicionada sobre o cabo. */
export interface Slack {
  id: string;
  lat: number;
  lng: number;
  length_m: number;
  kind: SlackKind;
  notes?: string | null;
}

export interface Settings {
  olt_tx_dbm: number;
  fusion_loss_db: number;
  connector_loss_db: number;
  fiber_loss_db_km: number;
  onu_min_dbm: number;
  onu_warn_dbm: number;
  onu_max_dbm: number;
}

export interface Project {
  id: number;
  name: string;
  city: string | null;
  center_lat: number;
  center_lng: number;
  zoom: number;
  settings: Partial<Settings> | null;
  updated_at: string;
  cto_count?: number;
  ceo_count?: number;
  pop_count?: number;
  client_count?: number;
  deployed_count?: number;
  total_nodes?: number;
  cables_count?: number;
  cable_length_m?: number | null;
  role?: Role;
  user?: { id: number; name: string };
}

/** Posição de um equipamento dentro de um rack do POP (U1 = parte de baixo). */
export interface RackMount {
  /** id do rack onde o equipamento está instalado. */
  rack?: string;
  /** U mais baixa ocupada (1 = base do rack). */
  u?: number;
  /** Altura em U (padrão calculado pelo tipo/tamanho do equipamento). */
  h?: number;
}

export type RackMountType = 'floor' | 'wall';

/** Componente dentro do diagrama de uma caixa ou POP. */
export type DiagramComponent =
  /** dio: no POP, o splitter fica dentro da matriz de fusão desse DIO. */
  | { id: string; kind: 'splitter'; model: string; name?: string; dio?: string; x: number; y: number }
  /** Portas PON "p1..pN" (slot a slot) e uplinks "u1..uN". */
  | ({ id: string; kind: 'olt'; name: string; model: string; slots: number; ports: number; uplinks?: number; tx_dbm: number; x: number; y: number } & RackMount)
  /** Lado "a" = fusão com o cabo; lado "b" = conector frontal (patch). cables = cabos vinculados ("c12"). */
  | ({ id: string; kind: 'dio'; name: string; ports: number; cables?: string[]; x: number; y: number } & RackMount)
  /** Equipamento ativo (switch, roteador, BNG...). Portas "e1..eN", só cordões. */
  | ({ id: string; kind: 'active'; name: string; type: string; ports: number; x: number; y: number } & RackMount)
  /** Rack do POP: de piso ou suspenso (parede), com altura em U (ex.: 44U, 48U). */
  | { id: string; kind: 'rack'; name: string; mount: RackMountType; units: number; x: number; y: number };

/** Ponta de uma conexão: componente ("c12" = cabo 12, ou id do componente) e porta. */
export interface End {
  c: string;
  p: string;
}

export interface Connection {
  id: string;
  a: End;
  b: End;
  /** Passagem direta da fibra pela caixa (sangria): não é fusão e não soma perda. */
  pass?: boolean;
}

export interface Diagram {
  components: DiagramComponent[];
  cablePos: Record<string, { x: number; y: number; side?: 'left' | 'right' }>;
  connections: Connection[];
  /** true quando os cards já foram organizados pelo editor de POP. */
  popLayout?: boolean;
}

export interface NetNode {
  id: number;
  project_id: number;
  type: NodeType;
  name: string;
  lat: number;
  lng: number;
  status: Status;
  notes: string | null;
  attributes: Record<string, unknown> | null;
  diagram: Diagram | null;
}

export interface Cable {
  id: number;
  project_id: number;
  name: string;
  category: CableCategory;
  model: string | null;
  fiber_count: number;
  fibers_per_tube: number;
  status: Status;
  color: string;
  width: number;
  /** null = automático (tracejado quando "Em projeto"). */
  line_style: LineStyle | null;
  path: LatLng[];
  from_node_id: number | null;
  to_node_id: number | null;
  /** Soma das reservas (ou a metragem antiga, sem local). */
  slack_m: number;
  slacks?: Slack[] | null;
  length_m: number;
  notes: string | null;
}

export interface Network {
  nodes: NetNode[];
  cables: Cable[];
  settings: Settings;
}

export type Role = 'owner' | 'admin' | 'editor' | 'viewer';

export interface Area {
  id: number;
  project_id: number;
  name: string;
  color: string;
  polygon: LatLng[];
  notes: string | null;
}

export interface Member {
  id: number;
  user_id: number;
  role: Exclude<Role, 'owner'>;
  user: { id: number; name: string; email: string };
}

export interface Activity {
  id: number;
  user: { id: number; name: string } | null;
  subject_type: 'node' | 'cable' | 'area' | 'project' | 'member';
  subject_id: number | null;
  subject_name: string | null;
  action: string;
  changes: Record<string, unknown> | null;
  created_at: string;
}

export type CondoKind = 'houses' | 'buildings';

/** Atributos de condomínio (guardados em node.attributes). */
export interface CondoAttributes extends Record<string, unknown> {
  condo_kind?: CondoKind;
  /** Total de unidades habitacionais (casas ou apartamentos). */
  units?: number;
  /** Prédios/torres (verticais) ou quadras (horizontais). */
  blocks?: number;
  /** Andares por prédio (só condomínio de prédios). */
  floors?: number;
  address?: string;
  manager?: string;
  phone?: string;
}

/** Atributos de poste (guardados em node.attributes). */
export interface PoleAttributes extends Record<string, unknown> {
  code?: string;
  material?: string;
  height_m?: number;
  load_dan?: number;
  owner?: string;
  structure?: string;
}
