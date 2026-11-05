import { describe, expect, it } from 'vitest';
import { cablesAlong, cableDiameter, occupancy, sharedFraction } from '../../resources/js/lib/duct';
import type { Cable, Duct, LatLng } from '../../resources/js/lib/types';

const duct = (over: Partial<Duct> = {}): Duct => ({
  id: 1,
  project_id: 1,
  name: 'Duto 1',
  material: 'pead',
  diameter_mm: 40,
  subducts: 0,
  placement: 'buried',
  depth_m: null,
  status: 'planned',
  color: '#a16207',
  path: [
    [-6.48, -35.43],
    [-6.482, -35.43],
  ],
  from_node_id: null,
  to_node_id: null,
  length_m: 221,
  cable_ids: [],
  notes: null,
  ...over,
});

const cable = (id: number, path: LatLng[], fibers = 12): Cable => ({
  id,
  project_id: 1,
  name: `Cabo ${id}`,
  category: fibers <= 2 ? 'drop' : 'distribution',
  model: null,
  fiber_count: fibers,
  fibers_per_tube: 12,
  status: 'planned',
  color: '#0ea5e9',
  width: 4,
  line_style: null,
  path,
  from_node_id: null,
  to_node_id: null,
  slack_m: 0,
  length_m: 0,
  notes: null,
});

describe('duto', () => {
  it('acha os cabos que correm pelo traçado', () => {
    const inside = cable(1, [
      [-6.48, -35.43001],
      [-6.482, -35.43001],
    ]);
    const short = cable(2, [
      [-6.4805, -35.43],
      [-6.481, -35.43],
    ]);
    const crossing = cable(3, [
      [-6.481, -35.432],
      [-6.481, -35.428],
    ]);
    expect(sharedFraction(duct().path, inside.path)).toBe(1);
    expect(cablesAlong(duct(), [inside, short, crossing]).map((c) => c.id)).toEqual([1, 2]);
  });

  it('calcula a ocupação do duto simples', () => {
    const cs = [cable(1, duct().path, 12), cable(2, duct().path, 144)];
    const o = occupancy(duct({ cable_ids: [1, 2, 99] }), cs);
    expect(o.cables).toHaveLength(2);
    // 8 mm + 14 mm num duto de 40 mm (interno ≈ 32,8 mm): (64 + 196) / 1076 ≈ 24%
    expect(o.fill).toBe(24);
    expect(o.limit).toBe(31);
    expect(o.level).toBe('ok');
    expect(cableDiameter(cs[1])).toBe(14);
  });

  it('conta subdutos livres', () => {
    const cs = [cable(1, duct().path), cable(2, duct().path)];
    expect(occupancy(duct({ subducts: 3, cable_ids: [1, 2] }), cs)).toMatchObject({ subducts: { total: 3, used: 2 }, level: 'ok' });
    expect(occupancy(duct({ subducts: 1, cable_ids: [1, 2] }), cs).level).toBe('full');
  });
});
