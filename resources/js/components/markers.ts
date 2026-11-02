import L from 'leaflet';
import { NODE_TYPES, STATUSES } from '../lib/catalog';
import type { NetNode } from '../lib/types';

const SHAPES: Record<NetNode['type'], (fill: string, ring: string) => string> = {
  cto: (f, r) => `<rect x="3" y="3" width="18" height="18" rx="4" fill="${f}" stroke="${r}" stroke-width="2.5"/><path d="M8 9h8M8 12h8M8 15h5" stroke="white" stroke-width="1.6" stroke-linecap="round"/>`,
  ceo: (f, r) => `<path d="M12 2l9 5v10l-9 5-9-5V7z" fill="${f}" stroke="${r}" stroke-width="2.5"/><circle cx="12" cy="12" r="3" fill="white"/>`,
  pop: (f, r) => `<rect x="2" y="2" width="20" height="20" rx="3" fill="${f}" stroke="${r}" stroke-width="2.5"/><path d="M7 7h10v3H7zM7 12h10v3H7zM9 17h6" stroke="white" stroke-width="1.5" fill="none"/>`,
  pole: (f, r) => `<circle cx="12" cy="12" r="6" fill="${f}" stroke="${r}" stroke-width="2.5"/>`,
  client: (f, r) => `<circle cx="12" cy="12" r="9" fill="${f}" stroke="${r}" stroke-width="2.5"/><path d="M8 13l4-4 4 4v4H8z" fill="white"/>`,
  // Condomínio de prédios: dois blocos com janelas.
  condo: (f, r) =>
    `<rect x="2" y="2" width="20" height="20" rx="5" fill="${f}" stroke="${r}" stroke-width="2.5"/><path d="M6 18V8h5v10M13 18V5h5v13" fill="white"/><path d="M7.5 10h2M7.5 13h2M14.5 7.5h2M14.5 10.5h2M14.5 13.5h2" stroke="${f}" stroke-width="1.3"/>`,
};

/** Condomínio de casas: duas casinhas. */
const CONDO_HOUSES = (f: string, r: string) =>
  `<rect x="2" y="2" width="20" height="20" rx="5" fill="${f}" stroke="${r}" stroke-width="2.5"/><path d="M4.5 12l3.5-3.5 3.5 3.5v5h-7zM12.5 12l3.5-3.5 3.5 3.5v5h-7z" fill="white"/>`;

const SIZES: Record<NetNode['type'], number> = { cto: 24, ceo: 24, pop: 30, pole: 14, client: 20, condo: 28 };

/**
 * Os ícones ficam em cache: devolver sempre a mesma instância evita que o Leaflet
 * troque o elemento do marcador a cada renderização, o que interrompia o arrasto
 * e o duplo clique.
 */
const cache = new Map<string, L.DivIcon>();

export function nodeIcon(node: NetNode, opts: { selected?: boolean; fill?: string } = {}) {
  const size = SIZES[node.type];
  const fill = opts.fill ?? NODE_TYPES[node.type].color;
  const ring = opts.selected ? '#facc15' : STATUSES[node.status].color;
  const houses = node.type === 'condo' && node.attributes?.condo_kind === 'houses';
  const key = `${node.type}${houses ? '-h' : ''}|${fill}|${ring}|${opts.selected ? 1 : 0}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const glow = opts.selected ? 'filter:drop-shadow(0 0 6px #facc15);' : 'filter:drop-shadow(0 1px 2px rgba(0,0,0,.6));';
  const icon = L.divIcon({
    className: 'node-marker',
    html: `<svg viewBox="0 0 24 24" width="${size}" height="${size}" style="${glow}">${(houses ? CONDO_HOUSES : SHAPES[node.type])(fill, ring)}</svg>`,
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
