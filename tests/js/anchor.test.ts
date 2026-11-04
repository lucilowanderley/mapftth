import { describe, expect, it } from 'vitest';
import { anchorHost, anchorIndex, anchoredOn, attachedTo, cableTargets, cablesAtHost, isAnchored, offsetOnPath, onCableNear, slackFixation, slacksAtHost, withAnchor } from '../../resources/js/lib/anchor';
import { distance } from '../../resources/js/lib/geo';
import { movePath } from '../../resources/js/lib/move';
import type { Cable, NetNode } from '../../resources/js/lib/types';

const node = (id: number, type: NetNode['type'], attributes: Record<string, unknown> = {}, lat = 0, lng = 0): NetNode => ({
  id, project_id: 1, type, name: `N${id}`, lat, lng, status: 'planned', notes: null, attributes, diagram: null,
});
const cable = (id: number, path: [number, number][], from: number | null = null, to: number | null = null, extra: Partial<Cable> = {}): Cable =>
  ({ id, project_id: 1, name: `C${id}`, path, from_node_id: from, to_node_id: to, category: 'distribution', fiber_count: 12, color: '#0ea5e9', slacks: [], ...extra }) as Cable;

describe('objetos fixados (ancorados) no poste/caixa', () => {
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
    // Fixar = ancorar: o antigo attributes.anchored não importa.
    expect(isAnchored(ceo, nodes)).toBe(true);
    expect(isAnchored(cto, nodes)).toBe(true);
  });

  it('poste segura vários objetos, todos fundidos ao ícone dele', () => {
    expect(attachedTo(pole, nodes).map((n) => n.id)).toEqual([10, 11, 12]);
    expect(anchoredOn(pole, nodes).map((n) => n.id)).toEqual([10, 11, 12]);
    expect(anchoredOn(box, nodes).map((n) => n.id)).toEqual([13]);
    expect(attachedTo(cto, nodes)).toEqual([]);
  });

  it('índice para o mapa: quem some e quem aparece fundido em cada poste/caixa', () => {
    const idx = anchorIndex(nodes);
    expect([...idx.anchored].sort()).toEqual([10, 11, 12, 13]);
    expect(idx.byHost.get(1)?.map((n) => n.id)).toEqual([10, 11, 12]);
    expect(idx.hostOf.get(13)?.id).toBe(2);
    // Poste apagado: o objeto volta a ter ícone próprio.
    expect(anchorIndex(nodes.filter((n) => n.id !== 1)).anchored.has(10)).toBe(false);
  });

  it('cabo clicado no poste liga na CTO/CEO fixada (câmera não conta)', () => {
    expect(cableTargets(pole, nodes).map((n) => n.id)).toEqual([10, 11]);
    expect(cableTargets(node(3, 'pole'), nodes)).toEqual([]);
  });

  it('soltar tira a fixação; fixar aponta para o poste/caixa (sem attributes.anchored)', () => {
    expect(withAnchor(cto, false)).toEqual({ fixed_kind: null, fixed_id: null });
    expect(withAnchor(node(15, 'cto', { address: 'x' }), true, box)).toEqual({ address: 'x', fixed_kind: 'box', fixed_id: 2 });
    expect(withAnchor(cam, false)).toEqual({ mount_kind: null, mount_id: null });
    expect(withAnchor(node(16, 'camera'), true, pole)).toEqual({ mount_kind: 'pole', mount_id: 1 });
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

describe('fixação no cabo e reservas fixadas', () => {
  const p = node(1, 'pole', {}, -10, -40);
  const line = cable(5, [[-9.999, -40], [-10, -40], [-10.001, -40]]);

  it('reserva antiga perto do poste conta como do poste; explícita respeita o tipo', () => {
    const legacy = { id: 'a', lat: -10, lng: -40, length_m: 10, kind: 'aerial' as const };
    const onSpan = { ...legacy, id: 'b', fixed_kind: 'cable' as const };
    const otherPole = { ...legacy, id: 'c', fixed_kind: 'pole' as const, fixed_id: 99 };
    expect(slackFixation(legacy, [p]).host?.id).toBe(1);
    expect(slackFixation(onSpan, [p])).toEqual({ kind: 'cable' });
    expect(slacksAtHost(p, [{ ...line, slacks: [legacy, onSpan, otherPole] }], [p]).map((x) => x.slack.id)).toEqual(['a']);
  });

  it('CTO e reserva no cabo aparecem do lado certo do poste', () => {
    const before = node(20, 'cto', { fixed_kind: 'cable', fixed_id: 5 }, -9.9997, -40);
    const after = node(21, 'ceo', { fixed_kind: 'cable', fixed_id: 5 }, -10.0002, -40);
    const far = node(22, 'cto', { fixed_kind: 'cable', fixed_id: 5 }, -9.9991, -40);
    const span = { id: 's', lat: -10.0001, lng: -40, length_m: 15, kind: 'aerial' as const, fixed_kind: 'cable' as const };
    const items = onCableNear(p, [{ ...line, slacks: [span] }], [p, before, after, far]);
    expect(items.map((i) => (i.kind === 'node' ? i.node.id : i.slack.id))).toEqual(['s', 21, 20]);
    expect(items.find((i) => i.kind === 'node' && i.node.id === 20)?.side).toBe('left');
    expect(items.find((i) => i.kind === 'node' && i.node.id === 21)?.side).toBe('right');
  });

  it('offsetOnPath anda pelo cabo (e volta se não couber)', () => {
    const q = offsetOnPath(line.path, [-10, -40], 8);
    expect(distance(q, [-10, -40])).toBeCloseTo(8, 0);
    expect(q[0]).toBeLessThan(-10);
    const back = offsetOnPath(line.path, [-10.001, -40], 8);
    expect(back[0]).toBeGreaterThan(-10.001);
  });

  it('câmera na parede não se funde ao poste', () => {
    const wallCam = node(30, 'camera', { mount_kind: 'wall', mount_id: 1 });
    expect(anchorHost(wallCam, [p])).toBeUndefined();
    expect(anchorIndex([p, wallCam]).anchored.has(30)).toBe(false);
  });
});
