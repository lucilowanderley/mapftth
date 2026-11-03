import { describe, expect, it } from 'vitest';
import { downstreamOf, groupContext, groupView } from '../../resources/js/lib/mapgroup';
import type { Cable, NetNode, NodeType } from '../../resources/js/lib/types';

const node = (id: number, type: NodeType): NetNode =>
  ({ id, project_id: 1, type, name: `N${id}`, lat: 0, lng: 0, status: 'planned', notes: null, attributes: null, diagram: null }) as NetNode;
const cable = (id: number, from: number | null, to: number | null, length_m = 100): Cable =>
  ({ id, from_node_id: from, to_node_id: to, length_m, path: [], category: 'distribution' }) as unknown as Cable;

// POP 1 → CEO 2 → CTO 3 → clientes 4 e 5; CEO 2 → CTO 6 (cabo desenhado ao contrário) → cliente 7.
const nodes = [node(1, 'pop'), node(2, 'ceo'), node(3, 'cto'), node(4, 'client'), node(5, 'client'), node(6, 'cto'), node(7, 'client')];
const cables = [cable(10, 1, 2), cable(11, 2, 3), cable(12, 3, 4, 30), cable(13, 3, 5, 30), cable(14, 6, 2), cable(15, 6, 7, 30)];

describe('agrupamento no mapa', () => {
  it('esconde só o que está a jusante, independente do sentido em que o cabo foi desenhado', () => {
    const ctx = groupContext(nodes, cables);
    const d = downstreamOf(2, ctx);
    expect([...d.nodes].sort()).toEqual([3, 4, 5, 6, 7]);
    expect(d.cables.has(10)).toBe(false);
    expect([...downstreamOf(3, ctx).nodes].sort()).toEqual([4, 5]);
    expect([...downstreamOf(6, ctx).nodes]).toEqual([7]);
    expect(downstreamOf(4, ctx).nodes.size).toBe(0);
  });

  it('em anel não volta para o lado de cima', () => {
    // POP 1 → 2 → 3 → 6 → POP 1 (anel). Agrupar 2 pega 3 (mais longe), mas não 6 (mais perto pelo outro lado).
    const ring = [cable(1, 1, 2), cable(2, 2, 3), cable(3, 3, 6, 150), cable(4, 6, 1, 50)];
    const d = downstreamOf(2, groupContext(nodes, ring));
    expect([...d.nodes]).toEqual([3]);
  });

  it('sem POP, usa o sentido do cabo de chegada', () => {
    const noPop = nodes.filter((n) => n.type !== 'pop');
    // Sem origem, o cabo 14 (desenhado de 6 para 2) conta como chegada em 2.
    const d = downstreamOf(2, groupContext(noPop, cables.filter((c) => c.id !== 10)));
    expect([...d.nodes].sort()).toEqual([3, 4, 5]);
    const d3 = downstreamOf(3, groupContext(noPop, cables.filter((c) => c.id !== 10)));
    expect([...d3.nodes].sort()).toEqual([4, 5]);
  });

  it('junta grupos e conta os ocultos de cada um', () => {
    const v = groupView([3, 6, 999], nodes, cables);
    expect(v.counts.get(3)).toBe(2);
    expect(v.counts.get(6)).toBe(1);
    expect(v.counts.has(999)).toBe(false);
    expect([...v.hiddenNodes].sort()).toEqual([4, 5, 7]);
  });
});
