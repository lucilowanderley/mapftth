import type { LatLng, NetNode, NodeType, RadioKind, TowerAttributes, TowerKind, TowerRadio } from './types';

/** Funções e catálogos da torre e dos equipamentos wireless (sem React), usadas também nos testes. */

export const TOWER_KINDS: Record<TowerKind, string> = {
  self: 'Autoportante',
  guyed: 'Estaiada',
  monopole: 'Monopolo / poste metálico',
  mast: 'Mastro',
  rooftop: 'Rooftop (topo de prédio)',
};

/** Tipos de equipamento wireless, com a abertura típica do feixe (graus) e o alcance desenhado no mapa (m). */
export const RADIO_KINDS: Record<RadioKind, { label: string; beam: number; reach: number; color: string }> = {
  ptp: { label: 'Rádio PtP (enlace)', beam: 6, reach: 800, color: '#38bdf8' },
  ap: { label: 'Rádio PtMP (base / AP)', beam: 90, reach: 400, color: '#f59e0b' },
  sector: { label: 'Antena setorial', beam: 60, reach: 400, color: '#fb923c' },
  omni: { label: 'Antena omni', beam: 360, reach: 250, color: '#a3e635' },
  dish: { label: 'Antena parabólica / grade', beam: 4, reach: 800, color: '#22d3ee' },
  cpe: { label: 'CPE / cliente', beam: 20, reach: 200, color: '#c084fc' },
  other: { label: 'Outro', beam: 30, reach: 200, color: '#94a3b8' },
};

/** Objetos do mapa que recebem equipamentos wireless: torre e POP. */
export const RADIO_HOST_TYPES: NodeType[] = ['tower', 'pop'];

/** Faixas de frequência comuns (GHz) para sugerir no cadastro. */
export const RADIO_FREQS = [0.9, 2.4, 3.5, 5, 5.8, 6, 11, 18, 23, 24, 60, 80];

const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Azimute (0 = norte, sentido horário) de `a` para `b`, em graus 0..360. */
export function bearing(a: LatLng, b: LatLng): number {
  const φ1 = rad(a[0]);
  const φ2 = rad(b[0]);
  const Δλ = rad(b[1] - a[1]);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** Ponto a `dist` metros de `from` na direção `az` (graus). */
export function destination(from: LatLng, az: number, dist: number): LatLng {
  const δ = dist / R;
  const θ = rad(az);
  const φ1 = rad(from[0]);
  const λ1 = rad(from[1]);
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return [deg(φ2), ((deg(λ2) + 540) % 360) - 180];
}

/** Abertura efetiva do feixe do equipamento (a informada ou a típica do tipo), entre 1 e 360. */
export const radioBeam = (r: TowerRadio) => Math.max(1, Math.min(360, r.beam ?? RADIO_KINDS[r.kind]?.beam ?? 30));

/**
 * Setor de cobertura desenhado no mapa: leque com vértice no objeto, centrado no azimute.
 * Feixe de 360° vira um círculo (polígono fechado em volta do objeto).
 */
export function sectorPolygon(center: LatLng, az: number, beam: number, reach: number, steps = 24): LatLng[] {
  if (beam >= 360) return Array.from({ length: 48 }, (_, i) => destination(center, (i * 360) / 48, reach));
  const pts: LatLng[] = [center];
  const start = az - beam / 2;
  const n = Math.max(2, Math.ceil((beam / 360) * steps * 4));
  for (let i = 0; i <= n; i++) pts.push(destination(center, start + (beam * i) / n, reach));
  pts.push(center);
  return pts;
}

/** Equipamentos wireless de um objeto (lista vazia quando não há). */
export function radiosOf(n: NetNode): TowerRadio[] {
  const list = (n.attributes as TowerAttributes | null)?.radios;
  return Array.isArray(list) ? list : [];
}

export interface RadioLink {
  key: string;
  from: NetNode;
  to: NetNode;
  radio: TowerRadio;
  /** Distância do enlace (m). */
  dist: number;
  /** O outro lado também tem um rádio apontando de volta. */
  mutual: boolean;
}

/**
 * Enlaces ponto a ponto: rádios com `link` apontando para outro objeto existente.
 * Um par de rádios apontando um para o outro vira um enlace só (mutual).
 */
export function radioLinks(nodes: NetNode[], dist: (a: LatLng, b: LatLng) => number): RadioLink[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out: RadioLink[] = [];
  const seen = new Set<string>();
  nodes.forEach((n) =>
    radiosOf(n).forEach((r) => {
      if (!r.link || r.link === n.id) return;
      const to = byId.get(r.link);
      if (!to) return;
      const pair = [n.id, to.id].sort((a, b) => a - b).join('-');
      if (seen.has(pair)) return;
      seen.add(pair);
      const mutual = radiosOf(to).some((o) => o.link === n.id);
      out.push({ key: `${pair}`, from: n, to, radio: r, dist: dist([n.lat, n.lng], [to.lat, to.lng]), mutual });
    }),
  );
  return out;
}

/**
 * Altura livre mínima (m) da 1ª zona de Fresnel no meio do enlace (60% do raio, regra usual de projeto).
 * r1 = 17,32 · √(d / (4·f)), com d em km e f em GHz.
 */
export function fresnelClearance(distM: number, freqGhz: number): number {
  if (!(distM > 0) || !(freqGhz > 0)) return 0;
  return 0.6 * 17.32 * Math.sqrt(distM / 1000 / (4 * freqGhz));
}

/** Rótulo curto do equipamento para listas e tooltips: "PtP 5.8 GHz · 30 m · 45°". */
export function radioSummary(r: TowerRadio): string {
  const parts = [r.name || RADIO_KINDS[r.kind]?.label || 'Rádio'];
  if (r.freq_ghz) parts.push(`${String(r.freq_ghz).replace('.', ',')} GHz`);
  if (r.height_m) parts.push(`${r.height_m} m`);
  if (typeof r.azimuth === 'number' && radioBeam(r) < 360) parts.push(`${Math.round(r.azimuth)}°`);
  return parts.join(' · ');
}

/**
 * Estilo próprio da linha de enlace wireless, diferente de qualquer cabo ou drop:
 * cor rosa da torre, traço-ponto (símbolo clássico de enlace de rádio) sobre um halo largo e translúcido,
 * e um ícone de rádio no meio da linha. Enlace com só uma ponta cadastrada fica âmbar.
 */
export const LINK_STYLE = {
  color: '#f43f5e',
  pending: '#f59e0b',
  weight: 3.5,
  dash: '14 8 0.1 8',
  halo: 12,
  haloOpacity: 0.22,
};

/** Cor da linha do enlace: rosa (as duas pontas cadastradas) ou âmbar (só uma). */
export const linkColor = (mutual: boolean) => (mutual ? LINK_STYLE.color : LINK_STYLE.pending);

/** Ponto do meio do enlace (onde fica o ícone de rádio). */
export const linkMidpoint = (a: LatLng, b: LatLng): LatLng => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
