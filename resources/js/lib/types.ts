export type NodeType = 'cto' | 'ceo' | 'pop' | 'dc' | 'tower' | 'pole' | 'client' | 'condo';
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

/** Modelo do cadastro de equipamentos (padrões do sistema ou cadastrados pelo usuário). */
export interface EquipmentModel {
  /** Número = cadastrado no banco; texto = modelo padrão do sistema. */
  id: number | string;
  kind: 'olt' | 'dio' | 'active';
  vendor: string | null;
  model: string;
  /** Tipo do ativo (Switch, Roteador...). */
  type?: string | null;
  /** DIO/ativo: total de portas; OLT: portas PON por slot. */
  ports: number;
  slots?: number | null;
  uplinks?: number | null;
  tx_dbm?: number | null;
  height_u: number;
  /** Ativo: grupos de portas (tipo, quantidade, capacidade). Sem grupos = `ports` portas Ethernet. */
  port_groups?: PortGroup[] | null;
  notes?: string | null;
  /** Cadastrado por quem está usando (pode editar/excluir). */
  own?: boolean;
  builtin?: boolean;
  /** Id do modelo padrão que este cadastro substitui (padrão editado) ou oculta (`hidden`). */
  replaces?: string | null;
  /** Padrão excluído pelo usuário. */
  hidden?: boolean;
  /** Foto de referência do equipamento. */
  image_url?: string | null;
}

/** Grupo de portas de um ativo: tipo (RJ45, SFP+...), quantidade e capacidade de cada porta (Gbps). */
export interface PortGroup {
  type: string;
  count: number;
  /** Capacidade de tráfego por porta, em Gbps (ex.: 1, 10, 100). */
  speed?: number | null;
}

/** Agregação de portas (LAG / port-channel / bond) de um ativo. */
export interface PortLag {
  id: string;
  name: string;
  mode: 'lacp' | 'static';
  /** Portas do ativo ("e1", "e5"...) ou uplinks da OLT ("u1", "u2"...). */
  ports: string[];
}

/** VLAN declarada no equipamento. */
export interface Vlan {
  id: number;
  name?: string;
}

/** Modo da porta: access (uma VLAN sem tag), trunk (várias com tag + nativa), híbrida (várias sem e com tag). */
export type VlanMode = 'access' | 'trunk' | 'hybrid';

/** VLANs de uma interface (porta física "e1"/"u1" ou agregação "lag:<id>"). */
export interface PortVlan {
  mode: VlanMode;
  /** access: VLAN da porta; trunk/híbrida: VLAN nativa (PVID, sem tag). */
  pvid?: number;
  /** trunk/híbrida: VLANs com tag. */
  tagged?: number[];
  /** trunk: libera todas as VLANs. */
  all?: boolean;
}

export type MgmtProto = 'SSH' | 'HTTPS' | 'HTTP' | 'Telnet' | 'SNMP' | 'Winbox' | 'API';

/** Endereço de gerência do equipamento. */
export interface MgmtAccess {
  ip?: string;
  port?: number;
  proto?: MgmtProto;
  /** Interface usada na gerência: porta física ("e1"/"u1"), agregação ("lag:<id>") ou "mgmt" (porta dedicada). */
  iface?: string;
  /** VLAN de gerência. */
  vlan?: number;
}

/** Configuração de rede comum a OLT e ativo: agregações e VLANs. */
export interface NetConfig {
  lags?: PortLag[];
  vlans?: Vlan[];
  /** Chave: porta ("e1", "u1") ou agregação ("lag:<id>"). */
  portVlans?: Record<string, PortVlan>;
}

/** Fabricante e modelo do cadastro usados no equipamento (para exibir no card). */
export interface ModelRef {
  vendor?: string;
  modelName?: string;
}

/** Posição de um equipamento dentro de um rack do POP (U1 = parte de baixo). */
export interface RackMount {
  /** id do rack onde o equipamento está instalado. */
  rack?: string;
  /** U mais baixa ocupada (1 = base do rack). */
  u?: number;
  /** Altura em U (padrão calculado pelo tipo/tamanho do equipamento). */
  h?: number;
  /** Posição do card quando expandido fora do rack (arrastado pelo usuário). Sem valor = ao lado do rack. */
  ex?: number;
  ey?: number;
}

export type RackMountType = 'floor' | 'wall';

/**
 * Endereço do rack no datacenter, no estilo ANSI/TIA-606 (grade do piso): prédio/site, andar + sala,
 * fileira (letras) e posição na fileira (número). Ex.: DC1.1A-AJ05.
 */
export interface RackLocation {
  /** Prédio ou site (ex.: DC1, SP01). */
  site?: string;
  /** Andar (ex.: 1, T, S1). */
  floor?: string;
  /** Sala ou espaço (ex.: A, DH2). */
  room?: string;
  /** Fileira (letras, ex.: A, AJ). */
  row?: string;
  /** Posição do gabinete na fileira (1, 2, 3...). */
  pos?: number;
}

/** Componente dentro do diagrama de uma caixa ou POP. */
export type DiagramComponent =
  /** dio: no POP, o splitter fica dentro da matriz de fusão desse DIO. */
  /** rot: rotação em graus (0, 90, 180, 270), pelo botão Girar do diagrama da CTO. */
  | { id: string; kind: 'splitter'; model: string; name?: string; dio?: string; rot?: number; x: number; y: number }
  /** Portas PON "p1..pN" (slot a slot) e uplinks "u1..uN". */
  | ({ id: string; kind: 'olt'; name: string; model: string; slots: number; ports: number; uplinks?: number; uplink_speed?: number; tx_dbm: number; mgmt?: MgmtAccess; x: number; y: number } & NetConfig & RackMount & ModelRef)
  /** Lado "a" = fusão com o cabo; lado "b" = conector frontal (patch). cables = cabos vinculados ("c12"). */
  | ({ id: string; kind: 'dio'; name: string; ports: number; cables?: string[]; model?: string; x: number; y: number } & RackMount & ModelRef)
  /** Equipamento ativo (switch, roteador, BNG...). Portas "e1..eN", só cordões. */
  | ({ id: string; kind: 'active'; name: string; type: string; ports: number; groups?: PortGroup[]; mgmt?: MgmtAccess; model?: string; x: number; y: number } & NetConfig & RackMount & ModelRef)
  /**
   * Cliente (assinante) no diagrama da CTO/CEO: recebe a fibra (porta "in"), normalmente de uma saída de splitter.
   * node_id = cliente do mapa vinculado (o orçamento dele no mapa usa este caminho quando não há cabo drop).
   * flip = porta do lado direito do cartão. client_code / onu_serial / segment: dados para integração
   * (ID do cliente, serial da ONU/ONT e tipo), copiados para o cliente do mapa vinculado ao salvar.
   * rx_dbm / rx_at: sinal medido na ONU/ONT (digitado ou recebido da integração pelo serial) e quando.
   */
  | { id: string; kind: 'client'; name: string; node_id?: number | null; flip?: boolean; x: number; y: number; client_code?: string | null; onu_serial?: string | null; segment?: 'residential' | 'business' | 'corporate' | null; rx_dbm?: number | null; rx_at?: string | null }
  /** Rack do POP: de piso ou suspenso (parede), com altura em U (ex.: 44U, 48U). */
  | { id: string; kind: 'rack'; name: string; mount: RackMountType; units: number; loc?: RackLocation; x: number; y: number };

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
  /** Tipo de emenda no diagrama da CTO/CEO: fusão (padrão) ou conector/acoplador (soma a perda de conector). */
  joint?: 'fusion' | 'connector';
  /** Tipo do conector/acoplador (ex.: "SC/APC") ou método da fusão ("core", "cladding", "mechanical"). */
  spec?: string;
  /** Perda informada para esta emenda (dB). Sem valor, usa a do tipo ou a padrão do projeto. */
  loss_db?: number;
  /** Posição x da pista vertical da fibra no diagrama (ajuste manual do traçado em 90°). */
  lane?: number;
}

export interface Diagram {
  components: DiagramComponent[];
  cablePos: Record<string, { x: number; y: number; side?: 'left' | 'right' }>;
  connections: Connection[];
  /** true quando os cards já foram organizados pelo editor de POP. */
  popLayout?: boolean;
  /** Bandejas de emenda da CEO/CTO, com os tubos loose vinculados a cada uma. */
  trays?: SpliceTray[];
}

/** Bandeja de emenda: capacidade em fusões e tubos loose vinculados ("c12:t2" = cabo 12, tubo 2). */
export interface SpliceTray {
  id: string;
  name: string;
  capacity: number;
  tubes: string[];
  x: number;
  y: number;
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
  /** Atenuação própria do cabo (dB/km). null = padrão do projeto. */
  loss_db_km?: number | null;
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

export type TowerKind = 'self' | 'guyed' | 'monopole' | 'mast' | 'rooftop';
export type RadioKind = 'ptp' | 'ap' | 'sector' | 'omni' | 'dish' | 'cpe' | 'other';

/** Equipamento wireless instalado na torre (ou no mastro do POP). */
export interface TowerRadio {
  id: string;
  kind: RadioKind;
  name?: string;
  vendor?: string;
  model?: string;
  /** Frequência em GHz (ex.: 5.8). */
  freq_ghz?: number;
  /** Altura de instalação na torre (m). */
  height_m?: number;
  /** Direção (graus, 0 = norte, sentido horário). */
  azimuth?: number;
  /** Abertura do feixe (graus). Sem valor = típica do tipo. */
  beam?: number;
  /** Inclinação (tilt, graus; negativo = para baixo). */
  tilt?: number;
  /** Enlace PtP: id do objeto do outro lado. */
  link?: number;
}

/** Atributos da torre (guardados em node.attributes). O POP usa só `radios`. */
export interface TowerAttributes extends Record<string, unknown> {
  tower_kind?: TowerKind;
  height_m?: number;
  site_code?: string;
  owner?: string;
  address?: string;
  /** Tem shelter/abrigo com racks. */
  shelter?: boolean;
  radios?: TowerRadio[];
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
