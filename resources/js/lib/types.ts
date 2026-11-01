export type NodeType = 'cto' | 'ceo' | 'pop' | 'pole' | 'client';
export type Status = 'planned' | 'not_deployed' | 'deployed' | 'certified';
export type CableCategory = 'backbone' | 'distribution' | 'drop';
export type LatLng = [number, number];

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
}

/** Componente dentro do diagrama de uma caixa ou POP. */
export type DiagramComponent =
  | { id: string; kind: 'splitter'; model: string; name?: string; x: number; y: number }
  | { id: string; kind: 'olt'; name: string; model: string; slots: number; ports: number; tx_dbm: number; x: number; y: number }
  | { id: string; kind: 'dio'; name: string; ports: number; x: number; y: number };

/** Ponta de uma conexão: componente ("c12" = cabo 12, ou id do componente) e porta. */
export interface End {
  c: string;
  p: string;
}

export interface Connection {
  id: string;
  a: End;
  b: End;
}

export interface Diagram {
  components: DiagramComponent[];
  cablePos: Record<string, { x: number; y: number; side?: 'left' | 'right' }>;
  connections: Connection[];
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
  path: LatLng[];
  from_node_id: number | null;
  to_node_id: number | null;
  slack_m: number;
  length_m: number;
  notes: string | null;
}

export interface Network {
  nodes: NetNode[];
  cables: Cable[];
  settings: Settings;
}
