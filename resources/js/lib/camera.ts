import type { CameraAttributes, CameraKind, CameraPower, CameraProto, CameraStatus, LatLng, NetNode, NodeType } from './types';
import { sectorPolygon } from './tower';

/** Catálogos e funções da câmera / DVR (sem React), usados também nos testes. */

export const CAMERA_KINDS: Record<CameraKind, { label: string; short: string; hint: string }> = {
  ip: { label: 'Câmera IP', short: 'IP', hint: 'Câmera de rede (RJ45/PoE), acessada por IP' },
  analog: { label: 'Câmera analógica / HD (DVR)', short: 'Analógica', hint: 'Câmera coaxial (HDCVI, AHD, HDTVI) gravada num canal de DVR' },
  dvr: { label: 'Gravador DVR / NVR', short: 'DVR', hint: 'Gravador com canais; as câmeras ficam ligadas a ele' },
};

export const CAMERA_PROTOS: Record<CameraProto, string> = { rtsp: 'RTSP', onvif: 'ONVIF', http: 'HTTP (web)' };

export const CAMERA_POWER: Record<CameraPower, string> = {
  poe: 'PoE (802.3af)',
  poe_plus: 'PoE+ (802.3at)',
  dc12: '12 Vcc (fonte)',
  ac24: '24 Vca',
  solar: 'Solar / bateria',
  other: 'Outra',
};

export const CAMERA_RESOLUTIONS = ['720p (1 MP)', '1080p (2 MP)', '3 MP', '4 MP (2K)', '5 MP', '8 MP (4K)', '12 MP'];

/** Canais comuns de DVR/NVR. */
export const DVR_CHANNELS = [4, 8, 16, 32, 64];

/** Objetos onde a câmera pode ser instalada. */
export const CAMERA_MOUNT_TYPES: NodeType[] = ['pole', 'client', 'dc', 'pop'];

/** Objetos pelos quais a câmera chega na rede. */
export const CAMERA_UPLINK_TYPES: NodeType[] = ['cto', 'ceo', 'client', 'condo', 'pop', 'dc', 'tower'];

/**
 * Caminhos de vídeo (RTSP) e de foto (snapshot) por fabricante. `{ch}` = canal (1 numa câmera avulsa).
 * Intelbras e Dahua usam o mesmo padrão; Hikvision e HiLook também.
 */
export const CAMERA_VENDORS: Record<string, { rtsp: string; snapshot: string; onvif: number }> = {
  Intelbras: { rtsp: '/cam/realmonitor?channel={ch}&subtype=0', snapshot: '/cgi-bin/snapshot.cgi?channel={ch}', onvif: 80 },
  Dahua: { rtsp: '/cam/realmonitor?channel={ch}&subtype=0', snapshot: '/cgi-bin/snapshot.cgi?channel={ch}', onvif: 80 },
  Hikvision: { rtsp: '/Streaming/Channels/{ch}01', snapshot: '/ISAPI/Streaming/channels/{ch}01/picture', onvif: 80 },
  HiLook: { rtsp: '/Streaming/Channels/{ch}01', snapshot: '/ISAPI/Streaming/channels/{ch}01/picture', onvif: 80 },
  Axis: { rtsp: '/axis-media/media.amp?camera={ch}', snapshot: '/axis-cgi/jpg/image.cgi?camera={ch}', onvif: 80 },
  'Uniview (UNV)': { rtsp: '/unicast/c{ch}/s0/live', snapshot: '/images/snapshot.jpg', onvif: 80 },
  'Genérico ONVIF': { rtsp: '/', snapshot: '', onvif: 80 },
};

export const DEFAULT_FOV = 90;
export const DEFAULT_RANGE = 30;
export const CAMERA_COLOR = '#eab308';

export function cameraOf(n: NetNode | null | undefined): CameraAttributes {
  return ((n?.attributes as CameraAttributes | null) ?? {}) as CameraAttributes;
}

export const cameraKind = (n: NetNode): CameraKind => cameraOf(n).cam_kind ?? 'ip';

/** Leque do campo de visão (só câmeras com azimute; DVR não tem). */
export function fovPolygon(n: NetNode): LatLng[] | null {
  const a = cameraOf(n);
  if (n.type !== 'camera' || a.cam_kind === 'dvr' || typeof a.azimuth !== 'number') return null;
  const fov = Math.max(5, Math.min(360, a.fov ?? DEFAULT_FOV));
  const range = Math.max(2, Math.min(500, a.range_m ?? DEFAULT_RANGE));
  return sectorPolygon([n.lat, n.lng], a.azimuth, fov, range);
}

/** Troca `{ch}` pelo canal. */
const withChannel = (path: string, ch: number) => path.replaceAll('{ch}', String(ch));

/** Câmera ligada a um gravador usa o endereço e o canal do gravador para vídeo e foto. */
export function streamSource(cam: NetNode, nodes: NetNode[]): { node: NetNode; channel: number } {
  const a = cameraOf(cam);
  if (a.dvr_id && a.dvr_channel) {
    const dvr = nodes.find((n) => n.id === a.dvr_id && n.type === 'camera');
    if (dvr && (a.cam_kind === 'analog' || !a.host)) return { node: dvr, channel: a.dvr_channel };
  }
  return { node: cam, channel: 1 };
}

const hostPart = (host: string) => (host.includes(':') && !host.startsWith('[') ? `[${host}]` : host);

/** Endereço da interface web do equipamento (abre no navegador de quem está usando). */
export function webUrl(a: CameraAttributes): string | null {
  if (!a.host) return null;
  const https = !!a.https;
  const port = a.http_port ?? (https ? 443 : 80);
  const def = https ? 443 : 80;
  return `${https ? 'https' : 'http'}://${hostPart(a.host)}${port === def ? '' : `:${port}`}/`;
}

/** URL RTSP para VLC / NVR / Frigate. A senha nunca entra (o usuário completa no player). */
export function rtspUrl(a: CameraAttributes, channel = 1): string | null {
  if (!a.host) return null;
  const preset = a.vendor ? CAMERA_VENDORS[a.vendor] : undefined;
  const path = a.rtsp_path || preset?.rtsp || '/';
  const user = a.username ? `${encodeURIComponent(a.username)}@` : '';
  const port = a.rtsp_port ?? 554;
  return `rtsp://${user}${hostPart(a.host)}${port === 554 ? '' : `:${port}`}${withChannel(path.startsWith('/') ? path : `/${path}`, channel)}`;
}

/** Situação mostrada no mapa e no painel. */
export type CameraHealth = 'online' | 'offline' | 'unknown';
export function cameraHealth(s: CameraStatus | undefined | null): CameraHealth {
  if (!s) return 'unknown';
  return s.online ? 'online' : 'offline';
}
export const HEALTH_COLORS: Record<CameraHealth, string> = { online: '#22c55e', offline: '#ef4444', unknown: '#64748b' };
export const HEALTH_LABEL: Record<CameraHealth, string> = { online: 'Online', offline: 'Sem resposta', unknown: 'Não testada' };

/** Canais do gravador e a câmera ligada em cada um. */
export function dvrChannels(dvr: NetNode, nodes: NetNode[]): { channel: number; camera: NetNode | null; extra: NetNode[] }[] {
  const total = Math.max(1, Math.min(256, cameraOf(dvr).channels ?? 8));
  const linked = nodes.filter((n) => n.type === 'camera' && n.id !== dvr.id && cameraOf(n).dvr_id === dvr.id);
  return Array.from({ length: total }, (_, i) => {
    const on = linked.filter((n) => cameraOf(n).dvr_channel === i + 1);
    return { channel: i + 1, camera: on[0] ?? null, extra: on.slice(1) };
  });
}

/** Linhas tracejadas no mapa: câmera → gravador e câmera → objeto onde está instalada. */
export function cameraLinks(nodes: NetNode[]): { key: string; kind: 'dvr' | 'mount'; from: NetNode; to: NetNode }[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out: { key: string; kind: 'dvr' | 'mount'; from: NetNode; to: NetNode }[] = [];
  for (const n of nodes) {
    if (n.type !== 'camera') continue;
    const a = cameraOf(n);
    const dvr = a.dvr_id ? byId.get(a.dvr_id) : undefined;
    if (dvr && dvr.type === 'camera' && dvr.id !== n.id) out.push({ key: `d${n.id}`, kind: 'dvr', from: n, to: dvr });
    const mount = a.mount_id ? byId.get(a.mount_id) : undefined;
    if (mount && CAMERA_MOUNT_TYPES.includes(mount.type)) out.push({ key: `m${n.id}`, kind: 'mount', from: n, to: mount });
  }
  return out;
}

/** Valida endereço IP/nome (o servidor confere de novo). */
export function validHost(host: string): boolean {
  const h = host.trim();
  if (!h) return true;
  return /^[A-Za-z0-9.-]{1,253}$/.test(h) || /^\[?[0-9A-Fa-f:.]+\]?$/.test(h);
}
