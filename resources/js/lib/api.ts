import axios from 'axios';
import type { Cable, NetNode, Project, Settings } from './types';

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

export const api = {
  projects: () => http.get<Project[]>('/api/projects').then((r) => r.data),
  createProject: (data: Partial<Project>) => http.post<Project>('/api/projects', data).then((r) => r.data),
  updateProject: (id: number, data: Partial<Project> & { settings?: Partial<Settings> }) =>
    http.put<{ project: Project; settings: Settings }>(`/api/projects/${id}`, data).then((r) => r.data),
  deleteProject: (id: number) => http.delete(`/api/projects/${id}`),
  project: (id: number) =>
    http
      .get<{ project: Project; settings: Settings; nodes: NetNode[]; cables: Cable[] }>(`/api/projects/${id}`)
      .then((r) => r.data),

  createNode: (projectId: number, data: Partial<NetNode>) =>
    http.post<NetNode>(`/api/projects/${projectId}/nodes`, data).then((r) => r.data),
  updateNode: (id: number, data: Partial<NetNode>) =>
    http.put<{ node: NetNode; cables: Cable[] }>(`/api/nodes/${id}`, data).then((r) => r.data),
  deleteNode: (id: number) => http.delete(`/api/nodes/${id}`),

  createCable: (projectId: number, data: Partial<Cable>) =>
    http.post<Cable>(`/api/projects/${projectId}/cables`, data).then((r) => r.data),
  updateCable: (id: number, data: Partial<Cable>) =>
    http.put<{ cable: Cable; nodes: NetNode[] }>(`/api/cables/${id}`, data).then((r) => r.data),
  deleteCable: (id: number) => http.delete<{ nodes: NetNode[] }>(`/api/cables/${id}`).then((r) => r.data),

  importKmz: (projectId: number, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return http
      .post<{ nodes: number; cables: number }>(`/api/projects/${projectId}/import`, form)
      .then((r) => r.data);
  },
  exportUrl: (projectId: number) => `/api/projects/${projectId}/export`,
};
