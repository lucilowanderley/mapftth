import { describe, expect, it } from 'vitest';
import { nearestOnPath, planBoxesAlong } from '../../resources/js/lib/connect';
import type { Cable, NetNode } from '../../resources/js/lib/types';

const node = (id: number, type: NetNode['type'], lat: number, lng: number): NetNode => ({
  id,
  project_id: 1,
  type,
  name: `N${id}`,
  lat,
  lng,
  status: 'planned',
  notes: null,
  attributes: null,
  diagram: null,
});

const cable = (path: [number, number][], from: number | null = null, to: number | null = null): Cable => ({
  id: 9,
  project_id: 1,
  name: 'Lance',
  category: 'distribution',
  model: 'as-24',
  fiber_count: 24,
  fibers_per_tube: 12,
  status: 'planned',
  color: '#0ea5e9',
  width: 4,
  line_style: null,
  path,
  from_node_id: from,
  to_node_id: to,
  slack_m: 0,
  length_m: 0,
  notes: null,
});

// ~0.0001° de latitude ≈ 11 m
describe('caixas no traçado', () => {
  it('acha o ponto mais próximo do traçado', () => {
    const r = nearestOnPath(
      [
        [0, 0],
        [0, 0.002],
      ],
      [0.0001, 0.0005],
    );
    expect(r.seg).toBe(0);
    expect(r.t).toBeCloseTo(0.25, 2);
    expect(r.dist).toBeCloseTo(11, 0);
  });

  it('sangra as CTOs perto do meio do cabo, na ordem do traçado', () => {
    const c = cable([
      [0, 0],
      [0, 0.003],
    ]);
    const nodes = [node(2, 'cto', -0.0002, 0.002), node(1, 'cto', 0.0002, 0.001), node(3, 'cto', 0.002, 0.0015), node(4, 'pole', 0, 0.0025)];
    const plan = planBoxesAlong(c, nodes)!;
    expect(plan.nodes.map((n) => n.id)).toEqual([1, 2]);
    expect(plan.path).toEqual([
      [0, 0],
      [0.0002, 0.001],
      [-0.0002, 0.002],
      [0, 0.003],
    ]);
    expect(plan.cuts).toEqual([
      { index: 1, node_id: 1 },
      { index: 2, node_id: 2 },
    ]);
    expect(plan.from).toBeNull();
    expect(plan.to).toBeNull();
  });

  it('caixa sobre um vértice usa o próprio vértice', () => {
    const c = cable([
      [0, 0],
      [0, 0.001],
      [0, 0.002],
    ]);
    const plan = planBoxesAlong(c, [node(1, 'ceo', 0.000001, 0.001)])!;
    expect(plan.path).toHaveLength(3);
    expect(plan.cuts).toEqual([{ index: 1, node_id: 1 }]);
  });

  it('caixa perto de uma ponta solta vira a ponta; ponta já ligada é ignorada', () => {
    const c = cable(
      [
        [0, 0],
        [0, 0.002],
      ],
      null,
      7,
    );
    const plan = planBoxesAlong(c, [node(1, 'cto', 0.0001, -0.0001), node(2, 'cto', 0.0001, 0.0021), node(7, 'cto', 0, 0.002)])!;
    expect(plan.from).toBe(1);
    expect(plan.to).toBeNull();
    expect(plan.cuts).toEqual([]);
    expect(plan.path[0]).toEqual([0.0001, -0.0001]);
  });

  it('sem caixas por perto devolve null', () => {
    expect(
      planBoxesAlong(
        cable([
          [0, 0],
          [0, 0.002],
        ]),
        [node(1, 'cto', 0.01, 0.001)],
      ),
    ).toBeNull();
  });
});

describe('estilo da linha do cabo', () => {
  it('automático segue o status; escolhido prevalece', async () => {
    const { effectiveLineStyle, lineDash } = await import('../../resources/js/lib/catalog');
    expect(effectiveLineStyle({ line_style: null, status: 'planned' })).toBe('dashed');
    expect(effectiveLineStyle({ line_style: null, status: 'deployed' })).toBe('solid');
    expect(effectiveLineStyle({ line_style: 'dotted', status: 'planned' })).toBe('dotted');
    expect(lineDash('solid', 4)).toBeUndefined();
    expect(lineDash('dashed', 4)).toBe('14 9');
    expect(lineDash('dotted', 4)).toBe('0.1 11');
  });
});
