import { nearestOnPath } from './connect';
import { distance, pathLength } from './geo';
import type { Cable, Duct, DuctMaterial, DuctPlacement, LatLng } from './types';

export const DUCT_MATERIALS: Record<DuctMaterial, { label: string; hint: string }> = {
  pead: { label: 'PEAD', hint: 'Polietileno de alta densidade (liso ou corrugado, o mais comum em redes de fibra)' },
  pvc: { label: 'PVC', hint: 'Eletroduto de PVC rígido' },
  corrugated: { label: 'Corrugado', hint: 'Eletroduto corrugado flexível (PEAD/PVC corrugado)' },
  steel: { label: 'Aço galvanizado', hint: 'Eletroduto de aço, usado em travessias, pontes e trechos expostos' },
  concrete: { label: 'Concreto', hint: 'Banco de dutos / manilha de concreto' },
  other: { label: 'Outro', hint: 'Outro material' },
};

export const DUCT_PLACEMENTS: Record<DuctPlacement, { label: string; hint: string }> = {
  buried: { label: 'Enterrado (vala)', hint: 'Duto em vala aberta, coberto' },
  directional: { label: 'Perfuração direcional (MND)', hint: 'Método não destrutivo, sem abrir vala (travessia de rua, rodovia, rio)' },
  surface: { label: 'Aparente', hint: 'Duto exposto: fachada, ponte, galeria' },
};

/** Diâmetros externos usuais (mm). */
export const DUCT_DIAMETERS = [25, 32, 40, 50, 63, 75, 90, 100, 110, 125, 160];

export const DUCT_COLOR = '#a16207';

/** Cores sugeridas para o duto (tons de terra, para não confundir com as cores dos cabos). */
export const DUCT_COLORS = ['#a16207', '#78350f', '#d97706', '#57534e', '#ea580c', '#a8a29e'];

/** Diâmetro interno estimado: parede de PEAD SDR 11 (≈ 9% do diâmetro externo de cada lado). */
export const innerDiameter = (d: Duct) => d.diameter_mm * 0.82;

/**
 * Diâmetro externo típico do cabo (mm), pela quantidade de fibras. É uma estimativa para calcular a
 * ocupação; cabos reais variam por fabricante e construção (AS, AS80, subterrâneo com proteção...).
 */
export function cableDiameter(c: Pick<Cable, 'category' | 'fiber_count'>): number {
  if (c.category === 'drop') return 5;
  if (c.fiber_count <= 12) return 8;
  if (c.fiber_count <= 36) return 10;
  if (c.fiber_count <= 72) return 12;
  if (c.fiber_count <= 144) return 14;
  return 17;
}

/**
 * Taxa máxima de ocupação recomendada da seção do duto (mesma referência usada em telecom/NBR para
 * eletrodutos): 1 cabo 53%, 2 cabos 31%, 3 ou mais 40%.
 */
export const fillLimit = (cables: number) => (cables <= 1 ? 53 : cables === 2 ? 31 : 40);

export interface DuctOccupancy {
  cables: Cable[];
  /** Ocupação da seção interna, em % (duto simples). */
  fill: number;
  limit: number;
  /** Subdutos usados / total (0 = duto simples). */
  subducts: { total: number; used: number };
  level: 'free' | 'ok' | 'warn' | 'full';
  message: string;
}

/** Cabos do duto que ainda existem no projeto. */
export const ductCables = (d: Duct, cables: Cable[]) => (d.cable_ids ?? []).map((id) => cables.find((c) => c.id === id)).filter((c): c is Cable => !!c);

export function occupancy(d: Duct, cables: Cable[]): DuctOccupancy {
  const inside = ductCables(d, cables);
  const n = inside.length;
  const r = innerDiameter(d) / 2;
  const area = Math.PI * r * r;
  const used = inside.reduce((a, c) => a + Math.PI * (cableDiameter(c) / 2) ** 2, 0);
  const fill = area ? Math.round((used / area) * 100) : 0;
  const limit = fillLimit(n);
  const total = d.subducts;
  if (total > 0) {
    const level = n === 0 ? 'free' : n > total ? 'full' : n === total ? 'warn' : 'ok';
    const message =
      n > total
        ? `${n} cabos para ${total} subdutos: mais de um cabo por subduto.`
        : n === total
          ? 'Todos os subdutos ocupados.'
          : `${total - n} subduto${total - n > 1 ? 's' : ''} livre${total - n > 1 ? 's' : ''}.`;
    return { cables: inside, fill, limit, subducts: { total, used: Math.min(n, total) }, level, message };
  }
  const level = n === 0 ? 'free' : fill > limit ? 'full' : fill > limit * 0.8 ? 'warn' : 'ok';
  const message =
    n === 0
      ? 'Duto vazio.'
      : fill > limit
        ? `Acima da ocupação recomendada (${limit}% para ${n} cabo${n > 1 ? 's' : ''}).`
        : `Dentro do recomendado (até ${limit}% para ${n} cabo${n > 1 ? 's' : ''}).`;
  return { cables: inside, fill, limit, subducts: { total: 0, used: 0 }, level, message };
}

export const OCCUPANCY_COLORS: Record<DuctOccupancy['level'], string> = { free: '#64748b', ok: '#22c55e', warn: '#f59e0b', full: '#ef4444' };

/** Pontos a cada ~`step` metros ao longo do traçado (inclui os vértices). */
export function samplePath(path: LatLng[], step = 10): LatLng[] {
  const out: LatLng[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const n = Math.max(1, Math.ceil(distance(a, b) / step));
    for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  if (path.length) out.push(path[path.length - 1]);
  return out;
}

/** Tolerância (m) entre o traçado do cabo e o do duto para considerar que o cabo passa por ele. */
export const DUCT_TOLERANCE_M = 8;

/**
 * Parte do duto percorrida pelo cabo (0..1): fração dos pontos do duto a até `tol` metros do cabo.
 * Também vale o contrário (cabo curto todo dentro de um duto comprido).
 */
export function sharedFraction(duct: LatLng[], cable: LatLng[], tol = DUCT_TOLERANCE_M): number {
  if (duct.length < 2 || cable.length < 2) return 0;
  const near = (pts: LatLng[], path: LatLng[]) => pts.filter((p) => nearestOnPath(path, p).dist <= tol).length / pts.length;
  return Math.max(near(samplePath(duct), cable), near(samplePath(cable), duct));
}

/** Cabos que correm pelo traçado do duto (pelo menos metade dele, ou o cabo inteiro dentro dele). */
export function cablesAlong(d: Duct, cables: Cable[], tol = DUCT_TOLERANCE_M): Cable[] {
  return cables.filter((c) => sharedFraction(d.path, c.path, tol) >= 0.5);
}

/** Dutos por onde o cabo passa. */
export const ductsOfCable = (c: Cable, ducts: Duct[]) => ducts.filter((d) => d.cable_ids?.includes(c.id));

/** Metragem total e por material, para relatórios. */
export function ductTotals(ducts: Duct[], lengthOf: (d: Duct) => number = (d) => pathLength(d.path)) {
  const byMaterial: Record<string, number> = {};
  let total = 0;
  for (const d of ducts) {
    const m = lengthOf(d);
    if (m <= 0) continue;
    total += m;
    const key = `${DUCT_MATERIALS[d.material]?.label ?? d.material} ${d.diameter_mm} mm${d.subducts ? ` (${d.subducts} subdutos)` : ''}`;
    byMaterial[key] = (byMaterial[key] ?? 0) + m;
  }
  return { total, byMaterial };
}
