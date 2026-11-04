import { describe, expect, it } from 'vitest';
import { corners, orderByNearest, planFromPoles, planFromRoute, planSlacks, polesAlong } from '../../resources/js/lib/launch';
import { distance } from '../../resources/js/lib/geo';
import type { LatLng, NetNode } from '../../resources/js/lib/types';

const pole = (id: number, lat: number, lng: number): NetNode => ({
  id,
  project_id: 1,
  type: 'pole',
  name: `P-${id}`,
  lat,
  lng,
  status: 'planned',
  notes: null,
  attributes: null,
  diagram: null,
});

// metros → graus (esfera do haversine)
const M = 1 / 111195;
const north = (m: number): LatLng => [m * M, 0];

describe('lançamento de cabo', () => {
  it('reta de 1 km com postes a cada 100 m: 11 postes, reservas em 500 e 1000 m', () => {
    const plan = planFromRoute([north(0), north(1000)], { poles: [], useExisting: true, addPoles: true, spacing: 100, slackEvery: 500 });
    expect(plan.created).toBe(11);
    expect(plan.existing).toBe(0);
    expect(Math.round(plan.length)).toBe(1000);
    expect(plan.slacks.map((i) => Math.round(plan.points[i].along))).toEqual([500, 1000]);
  });

  it('usa os postes que já existem perto da rua e completa os vãos', () => {
    const existing = [pole(1, north(300)[0], 10 * M), pole(2, north(302)[0], 15 * M), pole(3, north(600)[0], 50 * M)];
    expect(polesAlong([north(0), north(1000)], existing).map((x) => x.pole.id)).toEqual([1]);
    const plan = planFromRoute([north(0), north(1000)], { poles: existing, useExisting: true, addPoles: true, spacing: 100, slackEvery: 0 });
    expect(plan.existing).toBe(1);
    expect(plan.points.some((p) => p.pole_id === 1)).toBe(true);
    for (let i = 1; i < plan.points.length; i++) expect(distance(plan.points[i - 1].at, plan.points[i].at)).toBeLessThanOrEqual(102);
  });

  it('põe poste na esquina', () => {
    const route: LatLng[] = [north(0), north(130), [130 * M, 130 * M]];
    expect(corners(route)).toHaveLength(1);
    const plan = planFromRoute(route, { poles: [], useExisting: false, addPoles: true, spacing: 100, slackEvery: 0 });
    expect(plan.points.some((p) => distance(p.at, route[1]) < 0.5)).toBe(true);
  });

  it('sem postes novos o cabo segue a rua e passa pelos existentes', () => {
    const plan = planFromRoute([north(0), north(500)], { poles: [pole(1, north(250)[0], 5 * M)], useExisting: true, addPoles: false, spacing: 40, slackEvery: 0 });
    expect(plan.points.map((p) => p.pole_id ?? null)).toEqual([null, 1, null]);
    expect(plan.created).toBe(0);
  });

  it('pelos postes: ordem escolhida, ordenar pelo mais perto e reservas', () => {
    const ps = [pole(1, ...north(0)), pole(3, ...north(200)), pole(2, ...north(100))];
    expect(orderByNearest(ps).map((p) => p.id)).toEqual([1, 2, 3]);
    const plan = planFromPoles(orderByNearest(ps), 100);
    expect(plan.points.map((p) => p.pole_id)).toEqual([1, 2, 3]);
    expect(plan.slacks).toEqual([1, 2]);
    expect(planSlacks(plan.points, 0)).toEqual([]);
  });
});
