import L from 'leaflet';
import { NODE_TYPES, STATUSES } from '../lib/catalog';
import type { NetNode } from '../lib/types';

const SHAPES: Record<NetNode['type'], (fill: string, ring: string) => string> = {
  cto: (f, r) => `<rect x="3" y="3" width="18" height="18" rx="4" fill="${f}" stroke="${r}" stroke-width="2.5"/><path d="M8 9h8M8 12h8M8 15h5" stroke="white" stroke-width="1.6" stroke-linecap="round"/>`,
  ceo: (f, r) => `<path d="M12 2l9 5v10l-9 5-9-5V7z" fill="${f}" stroke="${r}" stroke-width="2.5"/><circle cx="12" cy="12" r="3" fill="white"/>`,
  pop: (f, r) => `<rect x="2" y="2" width="20" height="20" rx="3" fill="${f}" stroke="${r}" stroke-width="2.5"/><path d="M7 7h10v3H7zM7 12h10v3H7zM9 17h6" stroke="white" stroke-width="1.5" fill="none"/>`,
  pole: (f, r) => `<circle cx="12" cy="12" r="6" fill="${f}" stroke="${r}" stroke-width="2.5"/>`,
  client: (f, r) => `<circle cx="12" cy="12" r="9" fill="${f}" stroke="${r}" stroke-width="2.5"/><path d="M8 13l4-4 4 4v4H8z" fill="white"/>`,
};

const SIZES: Record<NetNode['type'], number> = { cto: 24, ceo: 24, pop: 30, pole: 14, client: 20 };

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
  const key = `${node.type}|${fill}|${ring}|${opts.selected ? 1 : 0}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const glow = opts.selected ? 'filter:drop-shadow(0 0 6px #facc15);' : 'filter:drop-shadow(0 1px 2px rgba(0,0,0,.6));';
  const icon = L.divIcon({
    className: 'node-marker',
    html: `<svg viewBox="0 0 24 24" width="${size}" height="${size}" style="${glow}">${SHAPES[node.type](fill, ring)}</svg>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
  cache.set(key, icon);
  return icon;
}

/** Alça para arrastar vértices de um cabo (quadrado) ou inserir um novo (círculo). */
export const vertexIcon = L.divIcon({
  className: 'vertex-handle',
  html: '<div style="width:12px;height:12px;background:#facc15;border:2px solid #0f172a;border-radius:2px"></div>',
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

export const midpointIcon = L.divIcon({
  className: 'vertex-handle',
  html: '<div style="width:10px;height:10px;background:rgba(250,204,21,.45);border:2px solid #facc15;border-radius:50%"></div>',
  iconSize: [10, 10],
  iconAnchor: [5, 5],
});
