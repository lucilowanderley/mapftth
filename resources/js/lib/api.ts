import axios from 'axios';
import type { Activity, Area, CameraStatus, Cable, EquipmentModel, LatLng, Member, NetNode, Project, Role, Settings } from './types';
import type { GoogleKeySource } from './basemaps';

export const http = axios.create({
  headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' },
  withXSRFToken: true,
});

http.interceptors.response.use(undefined, (error) => {
  if (error.response?.status === 401 || error.response?.status === 419) {
    window.location.href = '/login';
  }
  return Promise.reject(error);
});

export function errorMessage(error: unknown): string {
  const e = error as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } };
  const errors = e.response?.data?.errors;
  if (errors) return Object.values(errors)[0]?.[0] ?? 'Erro de validação';
  return e.response?.data?.message ?? 'Algo deu errado. Tente novamente.';
}

export interface LaunchRequest {
  cable: Pick<Cable, 'category' | 'fiber_count' | 'fibers_per_tube'> & Partial<Pick<Cable, 'name' | 'model' | 'status' | 'color' | 'width'>>;
  points: { pole_id?: number; new_pole?: boolean; lat?: number; lng?: number }[];
  slacks?: { point: number; length_m: number; kind?: 'aerial' | 'underground' }[];
  from_node_id?: number | null;
  to_node_id?: number | null;
}

export const api = {
  equipmentModels: (projectId?: number) =>
    http.get<EquipmentModel[]>('/api/equipment-models', { params: projectId ? { project: projectId } : {} }).then((r) => r.data),
  createEquipmentModel: (data: Partial<EquipmentModel>) => http.post<EquipmentModel>('/api/equipment-models', data).then((r) => r.data),
  updateEquipmentModel: (id: number, data: Partial<EquipmentModel>) => http.put<EquipmentModel>(`/api/equipment-models/${id}`, data).then((r) => r.data),
  deleteEquipmentModel: (id: number) => http.delete(`/api/equipment-models/${id}`),
  uploadEquipmentImage: (id: number, file: File) => {
    const fd = new FormData();
    fd.append('image', file);
    return http.post<EquipmentModel>(`/api/equipment-models/${id}/image`, fd).then((r) => r.data);
  },
  deleteEquipmentImage: (id: number) => http.delete<EquipmentModel>(`/api/equipment-models/${id}/image`).then((r) => r.data),
  /** Grava (ou apaga, com null) a chave do Google Maps da conta logada. */
  saveGoogleKey: (key: string | null) =>
    http.put<{ google_maps_key: string | null; google_key_source: GoogleKeySource }>('/api/me/google-maps-key', { key }).then((r) => r.data),
  projects: () => http.get<Project[]>('/api/projects').then((r) => r.data),
  createProject: (data: Partial<Project>) => http.post<Project>('/api/projects', data).then((r) => r.data),
  updateProject: (id: number, data: Partial<Project> & { settings?: Partial<Settings> }) =>
    http.put<{ project: Project; settings: Settings }>(`/api/projects/${id}`, data).then((r) => r.data),
  deleteProject: (id: number) => http.delete(`/api/projects/${id}`),
  project: (id: number) =>
    http
      .get<{ project: Project; role: Role; settings: Settings; nodes: NetNode[]; cables: Cable[]; areas: Area[]; google_maps_key?: string | null; google_key_source?: GoogleKeySource }>(`/api/projects/${id}`)
      .then((r) => r.data),

  createNode: (projectId: number, data: Partial<NetNode>) =>
    http.post<NetNode>(`/api/projects/${projectId}/nodes`, data).then((r) => r.data),
  /** ends_only: ao mover, só as pontas dos cabos ligados ao objeto acompanham (objeto fixado no poste/caixa). */
  updateNode: (id: number, data: Partial<NetNode> & { ends_only?: boolean }) =>
    http.put<{ node: NetNode; cables: Cable[]; clients?: NetNode[] }>(`/api/nodes/${id}`, data).then((r) => r.data),
  deleteNode: (id: number) => http.delete(`/api/nodes/${id}`),
  /** Câmera: o servidor testa HTTP/RTSP/ONVIF e guarda o resultado em attributes.cam_status. */
  checkCamera: (id: number) => http.post<{ node: NetNode; status: CameraStatus }>(`/api/nodes/${id}/camera/check`).then((r) => r.data),
  /** Câmera: foto atual buscada pelo servidor (a senha não sai dele). */
  cameraSnapshot: (id: number, channel?: number) =>
    http.get<Blob>(`/api/nodes/${id}/camera/snapshot`, { params: { ...(channel ? { channel } : {}), t: Date.now() }, responseType: 'blob' }).then((r) => r.data),

  createCable: (projectId: number, data: Partial<Cable>) =>
    http.post<Cable>(`/api/projects/${projectId}/cables`, data).then((r) => r.data),
  /** Lançamento de cabo: caminho pela rua entre dois pontos (source 'line' = linha reta, o roteador não respondeu). */
  launchRoute: (projectId: number, from: LatLng, to: LatLng) =>
    http
      .post<{ source: string; path: LatLng[]; distance_m: number }>(`/api/projects/${projectId}/launch/route`, { from, to })
      .then((r) => r.data),
  /** Lançamento de cabo: cria o cabo com os postes novos e as reservas fixadas nos postes. */
  launchCable: (projectId: number, data: LaunchRequest) =>
    http.post<{ cable: Cable; nodes: NetNode[] }>(`/api/projects/${projectId}/launch`, data).then((r) => r.data),
  updateCable: (id: number, data: Partial<Cable>) =>
    http.put<{ cable: Cable; nodes: NetNode[] }>(`/api/cables/${id}`, data).then((r) => r.data),
  /** Sangria: divide o cabo nas caixas dos vértices indicados. */
  splitCable: (id: number, path: LatLng[], cuts: { index: number; node_id: number }[]) =>
    http.post<{ cables: Cable[]; nodes: NetNode[] }>(`/api/cables/${id}/split`, { path, cuts }).then((r) => r.data),
  deleteCable: (id: number) => http.delete<{ nodes: NetNode[] }>(`/api/cables/${id}`).then((r) => r.data),

  importKmz: (projectId: number, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return http
      .post<{ nodes: number; cables: number }>(`/api/projects/${projectId}/import`, form)
      .then((r) => r.data);
  },
  exportUrl: (projectId: number) => `/api/projects/${projectId}/export`,

  bulkNodes: (projectId: number, nodes: Partial<NetNode>[]) =>
    http.post<{ created: NetNode[] }>(`/api/projects/${projectId}/nodes/bulk`, { nodes }).then((r) => r.data),

  createArea: (projectId: number, data: Partial<Area>) => http.post<Area>(`/api/projects/${projectId}/areas`, data).then((r) => r.data),
  updateArea: (id: number, data: Partial<Area>) => http.put<Area>(`/api/areas/${id}`, data).then((r) => r.data),
  deleteArea: (id: number) => http.delete(`/api/areas/${id}`),

  members: (projectId: number) =>
    http.get<{ owner: { id: number; name: string; email: string }; members: Member[] }>(`/api/projects/${projectId}/members`).then((r) => r.data),
  addMember: (projectId: number, email: string, role: string) =>
    http.post<Member>(`/api/projects/${projectId}/members`, { email, role }).then((r) => r.data),
  updateMember: (projectId: number, id: number, role: string) =>
    http.put<Member>(`/api/projects/${projectId}/members/${id}`, { role }).then((r) => r.data),
  removeMember: (projectId: number, id: number) => http.delete(`/api/projects/${projectId}/members/${id}`),

  activity: (projectId: number, params: { type?: string; subject_id?: number } = {}) =>
    http.get<Activity[]>(`/api/projects/${projectId}/activity`, { params }).then((r) => r.data),
};
