import { describe, expect, it } from 'vitest';
import { allIn, intersects, isMarquee, joinCounts, pointIn, rectFrom } from '../../resources/js/lib/marquee';
import { bulkDeleteQuestion, multiCount, multiSummary } from '../../resources/js/lib/remove';
import type { Cable, NetNode } from '../../resources/js/lib/types';

const node = (id: number, type: NetNode['type'], attributes: Record<string, unknown> = {}): NetNode => ({
  id, project_id: 1, type, name: `N${id}`, lat: 0, lng: 0, status: 'planned', notes: null, attributes, diagram: null,
});
const cable = (id: number): Cable =>
  ({ id, project_id: 1, name: `C${id}`, path: [[0, 0], [0, 1]], from_node_id: null, to_node_id: null, category: 'distribution', fiber_count: 12, color: '#0ea5e9', slacks: [] }) as unknown as Cable;

describe('retângulo de seleção', () => {
  it('normaliza o retângulo arrastado em qualquer direção', () => {
    expect(rectFrom({ x: 10, y: 20 }, { x: 4, y: 2 })).toEqual({ x: 4, y: 2, w: 6, h: 18 });
  });
  it('arraste curto é clique', () => {
    expect(isMarquee(rectFrom({ x: 0, y: 0 }, { x: 2, y: 1 }))).toBe(false);
    expect(isMarquee(rectFrom({ x: 0, y: 0 }, { x: 4, y: 3 }))).toBe(true);
  });
  it('ponto, interseção e "tudo dentro"', () => {
    const r = { x: 0, y: 0, w: 10, h: 10 };
    expect(pointIn(r, { x: 10, y: 5 })).toBe(true);
    expect(pointIn(r, { x: 11, y: 5 })).toBe(false);
    expect(intersects(r, { x: 8, y: 8, w: 20, h: 20 })).toBe(true);
    expect(intersects(r, { x: 11, y: 0, w: 2, h: 2 })).toBe(false);
    expect(allIn(r, [{ x: 1, y: 1 }, { x: 9, y: 9 }])).toBe(true);
    expect(allIn(r, [{ x: 1, y: 1 }, { x: 19, y: 9 }])).toBe(false);
    expect(allIn(r, [])).toBe(false);
  });
  it('junta as contagens em português', () => {
    expect(joinCounts(['1 CTO'])).toBe('1 CTO');
    expect(joinCounts(['1 CTO', '2 cabos', '1 duto'])).toBe('1 CTO, 2 cabos e 1 duto');
  });
});

describe('excluir vários do mapa', () => {
  const pole = node(1, 'pole');
  const cto = node(10, 'cto', { fixed_kind: 'pole', fixed_id: 1 });
  const ceo = node(11, 'ceo', { fixed_kind: 'pole', fixed_id: 1 });
  const nodes = [pole, cto, ceo, node(2, 'pole')];
  const cables = [cable(5)];

  it('resume por tipo', () => {
    const m = { nodes: [1, 2, 10], cables: [5], ducts: [], areas: [] };
    expect(multiCount(m)).toBe(4);
    expect(multiSummary(m, nodes)).toBe('2 Postes, 1 CTO e 1 cabo');
  });
  it('avisa que os fixados fora da seleção ficam sem fixação', () => {
    const q = bulkDeleteQuestion({ nodes: [1, 10], cables: [], ducts: [], areas: [] }, 1, nodes, cables);
    expect(q).toContain('Excluir os 2 objetos selecionados');
    expect(q).toContain('N11 fixado neles não será excluído');
  });
  it('fixados também marcados não geram aviso', () => {
    const q = bulkDeleteQuestion({ nodes: [1, 10, 11], cables: [], ducts: [], areas: [] }, 1, nodes, cables);
    expect(q).not.toContain('sem fixação');
  });
});
