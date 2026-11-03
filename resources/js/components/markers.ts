import L from 'leaflet';
import { NODE_TYPES, STATUSES } from '../lib/catalog';
import type { NetNode } from '../lib/types';

const SHAPES: Record<NetNode['type'], (fill: string, ring: string) => string> = {
  cto: (f, r) => `<rect x="3" y="3" width="18" height="18" rx="4" fill="${f}" stroke="${r}" stroke-width="2.5"/><path d="M8 9h8M8 12h8M8 15h5" stroke="white" stroke-width="1.6" stroke-linecap="round"/>`,
  ceo: (f, r) => `<path d="M12 2l9 5v10l-9 5-9-5V7z" fill="${f}" stroke="${r}" stroke-width="2.5"/><circle cx="12" cy="12" r="3" fill="white"/>`,
  pop: (f, r) => `<rect x="2" y="2" width="20" height="20" rx="3" fill="${f}" stroke="${r}" stroke-width="2.5"/><path d="M7 7h10v3H7zM7 12h10v3H7zM9 17h6" stroke="white" stroke-width="1.5" fill="none"/>`,
  // Datacenter: três racks lado a lado com LEDs.
  dc: (f, r) =>
    `<rect x="2" y="2" width="20" height="20" rx="3" fill="${f}" stroke="${r}" stroke-width="2.5"/><path d="M5.5 6h3.5v12H5.5zM10.25 6h3.5v12h-3.5zM15 6h3.5v12H15z" fill="white"/><path d="M6.5 8.5h1.5M11.25 8.5h1.5M16 8.5h1.5M6.5 11h1.5M11.25 11h1.5M16 11h1.5" stroke="${f}" stroke-width="1.2"/>`,
  // Torre: estrutura treliçada com ondas de rádio no topo.
  tower: (f, r) =>
    `<rect x="2" y="2" width="20" height="20" rx="5" fill="${f}" stroke="${r}" stroke-width="2.5"/><path d="M12 8.5L8.5 19M12 8.5l3.5 10.5M9.6 15.5h4.8M10.6 12.5h2.8M9.2 17.5l5.2-2M14.8 17.5l-5.2-2" stroke="white" stroke-width="1.4" fill="none" stroke-linecap="round"/><circle cx="12" cy="7.5" r="1.3" fill="white"/><path d="M8.6 4.6a4.5 4.5 0 0 0 0 5.8M15.4 4.6a4.5 4.5 0 0 1 0 5.8" stroke="white" stroke-width="1.3" fill="none" stroke-linecap="round"/>`,
  pole: (f, r) => `<circle cx="12" cy="12" r="6" fill="${f}" stroke="${r}" stroke-width="2.5"/>`,
  client: (f, r) => `<circle cx="12" cy="12" r="9" fill="${f}" stroke="${r}" stroke-width="2.5"/><path d="M8 13l4-4 4 4v4H8z" fill="white"/>`,
  // Condomínio de prédios: dois blocos com janelas.
  condo: (f, r) =>
    `<rect x="2" y="2" width="20" height="20" rx="5" fill="${f}" stroke="${r}" stroke-width="2.5"/><path d="M6 18V8h5v10M13 18V5h5v13" fill="white"/><path d="M7.5 10h2M7.5 13h2M14.5 7.5h2M14.5 10.5h2M14.5 13.5h2" stroke="${f}" stroke-width="1.3"/>`,
  // Câmera IP / analógica: corpo tipo "bullet" com lente, preso num suporte.
  camera: (f, r) =>
    `<rect x="2" y="2" width="20" height="20" rx="6" fill="${f}" stroke="${r}" stroke-width="2.5"/><path d="M5 8.5l9.5-2.2 1.6 5.6-9.5 2.2z" fill="white"/><circle cx="14.9" cy="9.2" r="1.3" fill="${f}"/><path d="M16.2 10.2l2.6-1.3v3.4l-2.2.6M9 13.6l-.4 3.9M6.5 17.5h4.5" stroke="white" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
};

/** Gravador DVR/NVR: caixa com LEDs e conectores. */
const CAMERA_DVR = (f: string, r: string) =>
  `<rect x="2" y="2" width="20" height="20" rx="6" fill="${f}" stroke="${r}" stroke-width="2.5"/><rect x="4.5" y="8" width="15" height="8" rx="1.5" fill="white"/><circle cx="7.3" cy="12" r="1" fill="${f}"/><circle cx="10.1" cy="12" r="1" fill="${f}"/><path d="M12.8 12h4.4" stroke="${f}" stroke-width="1.4" stroke-linecap="round"/><path d="M7 18.5v-2.5M17 18.5v-2.5" stroke="white" stroke-width="1.4"/>`;

/** Ponto de situação da câmera (canto superior direito): verde online, vermelho sem resposta. */
const healthDot = (color: string) =>
  `<div style="position:absolute;right:-3px;top:-3px;width:9px;height:9px;border-radius:9999px;background:${color};border:1.5px solid #0f172a;pointer-events:none"></div>`;

/** Cliente empresarial (loja com toldo) e corporativo (prédio). O residencial usa a casinha padrão. */
const CLIENT_BUSINESS = (f: string, r: string) =>
  `<circle cx="12" cy="12" r="9" fill="${f}" stroke="${r}" stroke-width="2.5"/><path d="M7 11l1-3h8l1 3zM8 12h8v5H8z" fill="white"/><path d="M11 17v-3h2v3" fill="${f}"/>`;
const CLIENT_CORPORATE = (f: string, r: string) =>
  `<circle cx="12" cy="12" r="9" fill="${f}" stroke="${r}" stroke-width="2.5"/><path d="M8 6.5h5v11H8zM13.5 10h3v7.5h-3z" fill="white"/><path d="M9.3 8.5h1M11.2 8.5h1M9.3 11h1M11.2 11h1M9.3 13.5h1M11.2 13.5h1" stroke="${f}" stroke-width="1"/>`;

/** Condomínio de casas: duas casinhas. */
const CONDO_HOUSES = (f: string, r: string) =>
  `<rect x="2" y="2" width="20" height="20" rx="5" fill="${f}" stroke="${r}" stroke-width="2.5"/><path d="M4.5 12l3.5-3.5 3.5 3.5v5h-7zM12.5 12l3.5-3.5 3.5 3.5v5h-7z" fill="white"/>`;

/** Anel tracejado em volta do objeto agrupado. */
const groupRing = (size: number) => {
  const d = size + 10;
  return `<div class="group-ring" style="position:absolute;left:-5px;top:-5px;width:${d}px;height:${d}px;border-radius:9999px;border:2px dashed #facc15;background:rgba(250,204,21,.12);pointer-events:none"></div>`;
};

/** Selo com a quantidade de objetos escondidos pelo grupo (canto superior direito). */
const groupBadge = (count: number) =>
  `<div class="group-badge" style="position:absolute;right:-9px;top:-9px;min-width:17px;height:17px;padding:0 4px;border-radius:9999px;background:#facc15;color:#0f172a;border:1.5px solid #0f172a;font:700 10px/14px system-ui,sans-serif;text-align:center;pointer-events:none;box-shadow:0 1px 2px rgba(0,0,0,.5)">+${count > 999 ? '999' : count}</div>`;

const SIZES: Record<NetNode['type'], number> = { cto: 24, ceo: 24, pop: 30, dc: 32, tower: 30, pole: 14, client: 20, condo: 28, camera: 22 };

/**
 * Os ícones ficam em cache: devolver sempre a mesma instância evita que o Leaflet
 * troque o elemento do marcador a cada renderização, o que interrompia o arrasto
 * e o duplo clique.
 */
const cache = new Map<string, L.DivIcon>();

/**
 * opts.group: objeto agrupado (esconde o que está a jusante); mostra um selo com a quantidade
 * de objetos ocultos e um anel tracejado em volta do ícone.
 */
export function nodeIcon(node: NetNode, opts: { selected?: boolean; fill?: string; group?: number; dot?: string } = {}) {
  const size = SIZES[node.type];
  const fill = opts.fill ?? NODE_TYPES[node.type].color;
  const ring = opts.selected ? '#facc15' : STATUSES[node.status].color;
  const houses = node.type === 'condo' && node.attributes?.condo_kind === 'houses';
  const seg = node.type === 'client' ? node.attributes?.segment : undefined;
  const dvr = node.type === 'camera' && node.attributes?.cam_kind === 'dvr';
  const variant = houses ? '-h' : dvr ? '-dvr' : seg === 'business' || seg === 'corporate' ? `-${seg}` : '';
  const group = opts.group;
  const key = `${node.type}${variant}|${fill}|${ring}|${opts.selected ? 1 : 0}|${group ?? ''}|${opts.dot ?? ''}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const glow = opts.selected ? 'filter:drop-shadow(0 0 6px #facc15);' : 'filter:drop-shadow(0 1px 2px rgba(0,0,0,.6));';
  const icon = L.divIcon({
    className: 'node-marker',
    html: `${group !== undefined ? groupRing(size) : ''}<svg viewBox="0 0 24 24" width="${size}" height="${size}" style="${glow}${group !== undefined ? 'position:relative;' : ''}">${(houses ? CONDO_HOUSES : dvr ? CAMERA_DVR : variant === '-business' ? CLIENT_BUSINESS : variant === '-corporate' ? CLIENT_CORPORATE : SHAPES[node.type])(fill, ring)}</svg>${group !== undefined ? groupBadge(group) : ''}${opts.dot ? healthDot(opts.dot) : ''}`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
  cache.set(key, icon);
  return icon;
}

const handles = new Map<string, L.DivIcon>();

/**
 * Alça com área de pegar maior (HIT px) que o ponto visível. O destaque ao passar o mouse
 * e durante o arrasto fica no CSS (.vh-dot em app.css), usando a cor do cabo (--c).
 */
const HIT = 26;
function handle(key: string, kind: 'vertex' | 'mid' | 'connect', color: string, dot: string) {
  let icon = handles.get(key);
  if (!icon) {
    icon = L.divIcon({
      className: `vertex-handle vh-${kind}`,
      html: `<div class="vh" style="--c:${color}"><div class="vh-dot" style="${dot}"></div></div>`,
      iconSize: [HIT, HIT],
      iconAnchor: [HIT / 2, HIT / 2],
    });
    handles.set(key, icon);
  }
  return icon;
}

/** Alça de um vértice do cabo: fundo branco e borda na cor do cabo. */
export const vertexIcon = (color: string) =>
  handle(`v${color}`, 'vertex', color, `width:12px;height:12px;background:#fff;border:3px solid ${color};box-shadow:0 0 0 1px rgba(15,23,42,.55)`);

/** Alça para criar um vértice novo no meio de um trecho (menor e translúcida). */
export const midpointIcon = (color: string) =>
  handle(`m${color}`, 'mid', color, `width:9px;height:9px;background:rgba(255,255,255,.55);border:2px solid ${color}`);

/** Alça do modo "Conectar a caixa": maior, para soltar sobre um objeto. */
export const connectIcon = (color: string) =>
  handle(`c${color}`, 'connect', color, `width:16px;height:16px;background:#fff;border:4px solid ${color};box-shadow:0 0 0 2px rgba(15,23,42,.6)`);

const slackIcons = new Map<string, L.DivIcon>();

/** Reserva técnica: círculo (suspensa) ou quadrado (subterrânea) com a "bobina" do cabo. */
export function slackIcon(kind: 'aerial' | 'underground', color: string, selected = false) {
  const key = `${kind}|${color}|${selected ? 1 : 0}`;
  let icon = slackIcons.get(key);
  if (!icon) {
    const ring = selected ? '#facc15' : kind === 'aerial' ? '#f59e0b' : '#a16207';
    const shape =
      kind === 'aerial'
        ? `<circle cx="12" cy="12" r="9.5" fill="#fff" stroke="${ring}" stroke-width="3"/>`
        : `<rect x="2.5" y="2.5" width="19" height="19" rx="3" fill="#fff" stroke="${ring}" stroke-width="3"/>`;
    const coil = `<ellipse cx="12" cy="12" rx="5.5" ry="3.2" fill="none" stroke="${color}" stroke-width="1.8"/><ellipse cx="12" cy="12" rx="2.8" ry="1.6" fill="none" stroke="${color}" stroke-width="1.6"/>`;
    icon = L.divIcon({
      className: 'node-marker slack-marker',
      html: `<svg viewBox="0 0 24 24" width="22" height="22" style="filter:drop-shadow(0 1px 2px rgba(0,0,0,.6))${selected ? ' drop-shadow(0 0 5px #facc15)' : ''}">${shape}${coil}</svg>`,
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });
    slackIcons.set(key, icon);
  }
  return icon;
}

const linkIcons = new Map<string, L.DivIcon>();

/** Ícone de rádio no meio da linha de enlace wireless (círculo com ondas), na cor do enlace. */
export function wirelessLinkIcon(color: string) {
  const hit = linkIcons.get(color);
  if (hit) return hit;
  const icon = L.divIcon({
    className: 'wireless-link-marker',
    html: `<svg viewBox="0 0 24 24" width="22" height="22" style="filter:drop-shadow(0 1px 2px rgba(0,0,0,.6))"><circle cx="12" cy="12" r="10" fill="#0f172a" stroke="${color}" stroke-width="2"/><circle cx="12" cy="12" r="1.8" fill="${color}"/><path d="M8.6 8.6a4.8 4.8 0 0 0 0 6.8M15.4 8.6a4.8 4.8 0 0 1 0 6.8M6.4 6.4a7.9 7.9 0 0 0 0 11.2M17.6 6.4a7.9 7.9 0 0 1 0 11.2" stroke="${color}" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
  linkIcons.set(color, icon);
  return icon;
}
