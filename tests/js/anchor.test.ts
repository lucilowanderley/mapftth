import { describe, expect, it } from 'vitest';
import { anchorHost, anchorIndex, anchoredOn, attachedTo, cableTargets, cablesAtHost, isAnchored, slacksAtHost, withAnchor } from '../../resources/js/lib/anchor';
import { movePath } from '../../resources/js/lib/move';
import type { Cable, NetNode } from '../../resources/js/lib/types';

const node = (id: number, type: NetNode['type'], attributes: Record<string, unknown> = {}, lat = 0, lng = 0): NetNode => ({
  id, project_id: 1, type, name: `N${id}`, lat, lng, status: 'planned', notes: null, attributes, diagram: null,
});
const cable = (id: number, path: [number, number][], from: number | null = null, to: number | null = null, extra: Partial<Cable> = {}): Cable =>
  ({ id, project_id: 1, name: `C${id}`, path, from_node_id: from, to_node_id: to, category: 'distribution', fiber_count: 12, color: '#0ea5e9', slacks: [], ...extra }) as Cable;

describe('objetos ancorados no poste/caixa', () => {
  const pole = node(1, 'pole', {}, -10, -40);
  const box = node(2, 'box', {}, -10.001, -40);
  const cto = node(10, 'cto', { fixed_kind: 'pole', fixed_id: 1, anchored: true }, -10, -40);
  const ceo = node(11, 'ceo', { fixed_kind: 'pole', fixed_id: 1 }, -10.00005, -40);
  const cam = node(12, 'camera', { mount_id: 1, anchored: true }, -10, -40);
  const inBox = node(13, 'cto', { fixed_kind: 'box', fixed_id: 2, anchored: true }, -10.001, -40);
  const camOnClient = node(14, 'camera', { mount_id: 20, anchored: true });
  const client = node(20, 'client');
  const nodes = [pole, box, cto, ceo, cam, inBox, camOnClient, client];

  it('acha o poste/caixa de CTO/CEO e de câmera (só câmera em poste ancora)', () => {
    expect(anchorHost(cto, nodes)?.id).toBe(1);
    expect(anchorHost(cam, nodes)?.id).toBe(1);
    expect(anchorHost(inBox, nodes)?.id).toBe(2);
    expect(anchorHost(camOnClient, nodes)).toBeUndefined();
    expect(isAnchored(camOnClient, nodes)).toBe(false);
    expect(isAnchored(ceo, nodes)).toBe(false);
    expect(isAnchored(cto, nodes)).toBe(true);
  });

  it('poste segura vários objetos; separa ancorados e soltos', () => {
    expect(attachedTo(pole, nodes).map((n) => n.id)).toEqual([10, 11, 12]);
    expect(anchoredOn(pole, nodes).map((n) => n.id)).toEqual([10, 12]);
    expect(anchoredOn(box, nodes).map((n) => n.id)).toEqual([13]);
    expect(attachedTo(cto, nodes)).toEqual([]);
  });

  it('índice para o mapa: quem some e quem aparece fundido em cada poste/caixa', () => {
    const idx = anchorIndex(nodes);
    expect([...idx.anchored].sort()).toEqual([10, 12, 13]);
    expect(idx.byHost.get(1)?.map((n) => n.id)).toEqual([10, 12]);
    expect(idx.hostOf.get(13)?.id).toBe(2);
    // Poste apagado: o objeto volta a ter ícone próprio.
    expect(anchorIndex(nodes.filter((n) => n.id !== 1)).anchored.has(10)).toBe(false);
  });

  it('cabo clicado no poste liga na CTO/CEO ancorada (câmera não conta)', () => {
    expect(cableTargets(pole, nodes).map((n) => n.id)).toEqual([10]);
    expect(cableTargets(node(3, 'pole'), nodes)).toEqual([]);
  });

  it('desancorar/ancorar só mexe em attributes.anchored', () => {
    expect(withAnchor(cto, false)).toEqual({ fixed_kind: 'pole', fixed_id: 1, anchored: false });
  });

  it('cabos e reservas no poste', () => {
    const through = cable(1, [[-9.99, -40], [-10, -40], [-10.01, -40]]);
    const toCto = cable(2, [[-9.99, -40.01], [-10, -40]], null, 10);
    const far = cable(3, [[-9, -40], [-9.1, -40]], null, null, { slacks: [{ id: 'r1', lat: -10, lng: -40, length_m: 20, kind: 'aerial' }] });
    expect(cablesAtHost(pole, [through, toCto, far], [10]).map((c) => c.id)).toEqual([1, 2]);
    expect(slacksAtHost(pole, [through, far]).map((s) => s.slack.id)).toEqual(['r1']);
  });
});

describe('mover objeto ancorado (só as pontas)', () => {
  it('ends_only não arrasta os cabos que passam pelo poste', () => {
    const through = cable(1, [[0, 1], [0, 0], [0, -1]]);
    const drop = cable(2, [[0, 0], [1, 1]], 10, null);
    expect(movePath(through, 10, [0, 0], [5, 5], true)).toBe(through.path);
    expect(movePath(through, 10, [0, 0], [5, 5])[1]).toEqual([5, 5]);
    expect(movePath(drop, 10, [0, 0], [5, 5], true)[0]).toEqual([5, 5]);
  });
});
