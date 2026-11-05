import { describe, expect, it } from 'vitest';
import { corners, ductBetween, orderByNearest, planFromPoles, planFromRoute, planFromStops, planSlacks, polesAlong, subPath } from '../../resources/js/lib/launch';
import { distance } from '../../resources/js/lib/geo';
import type { Duct, LatLng, NetNode } from '../../resources/js/lib/types';

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

  describe('por caixas e dutos', () => {
    const box = (id: number, at: LatLng): NetNode => ({ ...pole(id, at[0], at[1]), type: 'box', name: `CX-${id}` });
    const east = (n: number, e: number): LatLng => [n * M, e * M];
    // Duto em L: sobe 100 m e vira 100 m para leste, passando pela CX-2 na esquina.
    const duct = (over: Partial<Duct> = {}): Duct => ({
      id: 7,
      project_id: 1,
      name: 'DT-1',
      material: 'pead',
      diameter_mm: 40,
      subducts: 3,
      placement: 'buried',
      depth_m: null,
      status: 'planned',
      color: '#a16207',
      path: [east(0, 0), east(50, 3), east(100, 0), east(100, 100)],
      from_node_id: 1,
      to_node_id: 3,
      length_m: 200,
      cable_ids: [],
      notes: null,
      ...over,
    });
    const cx1 = box(1, east(0, 0));
    const cx2 = box(2, east(100, 0));
    const cx3 = box(3, east(100, 100));

    it('trecho do caminho entre duas distâncias, nos dois sentidos', () => {
      const p: LatLng[] = [north(0), north(100), north(200)];
      expect(subPath(p, 50, 150).map((x) => Math.round(x[0] / M))).toEqual([50, 100, 150]);
      expect(subPath(p, 150, 50).map((x) => Math.round(x[0] / M))).toEqual([150, 100, 50]);
    });

    it('entre duas caixas do duto o cabo segue o traçado do duto', () => {
      const plan = planFromStops([cx1, cx3], 0, [duct()]);
      expect(plan.points.map((p) => [p.box_id, p.duct_id])).toEqual([
        [1, undefined],
        [undefined, 7],
        [undefined, 7],
        [3, undefined],
      ]);
      expect(plan.ducts).toEqual([{ id: 7, meters: expect.any(Number) }]);
      expect(Math.round(plan.length)).toBe(200);
      expect(plan.boxes).toBe(2);
    });

    it('caixa no meio do duto (CX-1, CX-2, CX-3): o duto conta uma vez só, com a metragem somada', () => {
      const plan = planFromStops([cx1, cx2, cx3], 0, [duct()]);
      expect(plan.points.filter((p) => p.box_id != null).map((p) => p.box_id)).toEqual([1, 2, 3]);
      expect(plan.ducts).toHaveLength(1);
      expect(Math.round(plan.ducts[0].meters)).toBe(200);
    });

    it('sentido contrário: do fim para o início do duto', () => {
      const plan = planFromStops([cx3, cx1], 0, [duct()]);
      expect(plan.points[1].at).toEqual(east(100, 0));
      expect(plan.points[2].at).toEqual(east(50, 3));
    });

    it('mistura postes e caixas: poste → caixa vai reto, caixa → caixa pelo duto, e a reserva pode ficar na caixa', () => {
      const p = pole(9, -100 * M, 0);
      const plan = planFromStops([p, cx1, cx3], 300, [duct()]);
      expect(plan.points[0].pole_id).toBe(9);
      expect(plan.points[1].box_id).toBe(1);
      expect(plan.existing).toBe(1);
      expect(plan.slacks.map((i) => plan.points[i].box_id)).toEqual([3]);
    });

    it('poste perto do duto não entra nele (cabo aéreo da mesma rua)', () => {
      const p1 = pole(10, ...east(0, 2));
      const p2 = pole(11, ...east(100, 2));
      expect(ductBetween(p1, p2, [duct({ from_node_id: null, to_node_id: null })])).toBeNull();
      expect(planFromStops([p1, p2], 0, [duct()]).ducts).toEqual([]);
    });

    it('caixa longe do duto não usa o duto', () => {
      const far = box(5, east(0, 60));
      expect(ductBetween(far, cx3, [duct({ from_node_id: null })])).toBeNull();
    });

    it('com dois dutos possíveis, usa o trecho mais curto', () => {
      const long = duct({ id: 8, name: 'DT-2', path: [east(0, 0), east(0, 200), east(100, 200), east(100, 100)] });
      expect(ductBetween(cx1, cx3, [long, duct()])?.duct.id).toBe(7);
    });
  });
});
