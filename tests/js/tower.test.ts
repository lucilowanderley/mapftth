import { describe, expect, it } from 'vitest';
import { distance } from '../../resources/js/lib/geo';
import { bearing, destination, fresnelClearance, radioBeam, radioLinks, radioSummary, sectorPolygon } from '../../resources/js/lib/tower';
import type { NetNode, TowerRadio } from '../../resources/js/lib/types';

const node = (id: number, type: NetNode['type'], lat: number, lng: number, radios: TowerRadio[] = []): NetNode => ({
  id, project_id: 1, type, name: `N${id}`, lat, lng, status: 'planned', notes: null, attributes: { radios }, diagram: null,
});

describe('torre e wireless', () => {
  it('azimute: norte 0°, leste 90°', () => {
    expect(bearing([0, 0], [1, 0])).toBeCloseTo(0, 5);
    expect(bearing([0, 0], [0, 1])).toBeCloseTo(90, 5);
    expect(bearing([0, 0], [-1, 0])).toBeCloseTo(180, 5);
  });

  it('destino a 1 km volta a mesma distância e direção', () => {
    const a: [number, number] = [-2.44, -54.71];
    const b = destination(a, 45, 1000);
    expect(distance(a, b)).toBeCloseTo(1000, 0);
    expect(bearing(a, b)).toBeCloseTo(45, 1);
  });

  it('setor começa e termina no objeto; omni é um círculo', () => {
    const c: [number, number] = [0, 0];
    const s = sectorPolygon(c, 90, 60, 500);
    expect(s[0]).toEqual(c);
    expect(s[s.length - 1]).toEqual(c);
    const o = sectorPolygon(c, 0, 360, 500);
    expect(o.every((p) => Math.abs(distance(c, p) - 500) < 1)).toBe(true);
  });

  it('enlaces PtP: par de rádios vira um enlace só e marca mútuo', () => {
    const a = node(1, 'tower', 0, 0, [{ id: 'r1', kind: 'ptp', link: 2, freq_ghz: 5.8 }]);
    const b = node(2, 'pop', 0, 0.01, [{ id: 'r2', kind: 'ptp', link: 1 }]);
    const c = node(3, 'tower', 0.01, 0, [{ id: 'r3', kind: 'ptp', link: 1 }, { id: 'x', kind: 'ptp', link: 99 }]);
    const links = radioLinks([a, b, c], distance);
    expect(links).toHaveLength(2);
    expect(links.find((l) => l.key === '1-2')?.mutual).toBe(true);
    expect(links.find((l) => l.key === '1-3')?.mutual).toBe(false);
  });

  it('feixe padrão do tipo, Fresnel e resumo', () => {
    expect(radioBeam({ id: 'a', kind: 'sector' })).toBe(60);
    expect(radioBeam({ id: 'a', kind: 'sector', beam: 120 })).toBe(120);
    // 10 km em 5,8 GHz: raio ≈ 11,37 m; 60% ≈ 6,8 m
    expect(fresnelClearance(10000, 5.8)).toBeCloseTo(6.82, 1);
    expect(radioSummary({ id: 'a', kind: 'ap', name: 'Setor Norte', freq_ghz: 5.8, height_m: 30, azimuth: 0 })).toBe('Setor Norte · 5,8 GHz · 30 m · 0°');
  });
});

describe('estilo do enlace wireless', () => {
  it('cor própria (rosa mútuo, âmbar uma ponta) e ponto do meio', async () => {
    const { LINK_STYLE, linkColor, linkMidpoint } = await import('../../resources/js/lib/tower');
    expect(linkColor(true)).toBe(LINK_STYLE.color);
    expect(linkColor(false)).toBe(LINK_STYLE.pending);
    expect(linkMidpoint([0, 0], [2, 4])).toEqual([1, 2]);
  });
});
