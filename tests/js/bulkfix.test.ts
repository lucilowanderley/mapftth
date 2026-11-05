import { describe, expect, it } from 'vitest';
import { BULK_WHAT, bulkPayload, bulkSummary, planBulkFix, undoPayload } from '../../resources/js/lib/bulkfix';
import type { Cable, NetNode } from '../../resources/js/lib/types';

const node = (id: number, type: NetNode['type'], lat: number, lng: number, attributes: Record<string, unknown> = {}): NetNode => ({
  id, project_id: 1, type, name: `N${id}`, lat, lng, status: 'planned', notes: null, attributes, diagram: null,
});
const cable = (id: number, path: [number, number][], from: number | null = null, to: number | null = null, extra: Partial<Cable> = {}): Cable =>
  ({ id, project_id: 1, name: `C${id}`, path, from_node_id: from, to_node_id: to, category: 'distribution', fiber_count: 12, color: '#0ea5e9', slacks: [], ...extra }) as Cable;

// 0.00001° de latitude ≈ 1,1 m
const M = 0.00001 / 1.11;

describe('fixar em massa', () => {
  const p1 = node(1, 'pole', -10, -40);
  const p2 = node(2, 'pole', -10 + 100 * M, -40);
  const box = node(3, 'box', -10 + 200 * M, -40);
  const client = node(4, 'client', -10 + 300 * M, -40);

  it('só oferece os alvos permitidos para cada objeto', () => {
    expect(BULK_WHAT.cto.targets).toEqual(['pole', 'box', 'cable']);
    expect(BULK_WHAT.camera.targets).toEqual(['pole', 'wall']);
    expect(BULK_WHAT.slack.targets).toEqual(['pole', 'box']);
    expect(planBulkFix({ what: 'camera', target: 'box', maxM: 10 }, [p1], []).items).toEqual([]);
  });

  it('CTO vai para o poste mais perto dentro da distância; as já fixadas ficam de fora', () => {
    const near = node(10, 'cto', -10 + 4 * M, -40);
    const far = node(11, 'cto', -10 + 50 * M, -40);
    const fixed = node(12, 'cto', -10 + 98 * M, -40, { fixed_kind: 'pole', fixed_id: 1 });
    const nodes = [p1, p2, box, near, far, fixed];
    const plan = planBulkFix({ what: 'cto', target: 'pole', maxM: 10 }, nodes, []);
    expect(plan.items.map((i) => [i.nodeId, i.fix?.fixed_id])).toEqual([[10, 1]]);
    expect(plan.items[0].to).toEqual([p1.lat, p1.lng]);
    expect(plan.items[0].dist).toBeCloseTo(4, 0);
    expect(plan.unmatched).toBe(1);
    expect(plan.skippedFixed).toBe(1);
    // Trocando também as fixadas: a 12 vai do poste 1 para o 2, que está a 2 m.
    const all = planBulkFix({ what: 'cto', target: 'pole', maxM: 10, includeFixed: true }, nodes, []);
    expect(all.items.find((i) => i.nodeId === 12)).toMatchObject({ refix: true, fix: { fixed_kind: 'pole', fixed_id: 2 } });
  });

  it('CTO na caixa e só os da área visível', () => {
    const a = node(10, 'cto', -10 + 205 * M, -40);
    const b = node(11, 'cto', -10 + 1, -40 + 1);
    const nodes = [box, a, b, node(12, 'box', -10 + 1, -40 + 1)];
    const plan = planBulkFix({ what: 'cto', target: 'box', maxM: 10, bounds: [[-10.01, -40.01], [-9.99, -39.99]] }, nodes, []);
    expect(plan.total).toBe(1);
    expect(plan.items.map((i) => i.fix)).toEqual([{ fixed_kind: 'box', fixed_id: 3 }]);
  });

  it('CTO/CEO no cabo vão para cima do traçado (sem cabo drop)', () => {
    const c = cable(20, [[-10, -40], [-10, -40 + 0.001]]);
    const drop = cable(21, [[-10 + 1 * M, -40], [-10 + 1 * M, -40 + 0.001]], null, null, { category: 'drop' });
    const ceo = node(10, 'ceo', -10 + 5 * M, -40 + 0.0005);
    const plan = planBulkFix({ what: 'ceo', target: 'cable', maxM: 10 }, [ceo], [c, drop]);
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0].fix).toEqual({ fixed_kind: 'cable', fixed_id: 20 });
    expect(plan.items[0].to![0]).toBeCloseTo(-10, 6);
  });

  it('câmera no poste vai para ele; na parede fica onde está e registra o imóvel', () => {
    const cam = node(10, 'camera', -10 + 3 * M, -40);
    expect(planBulkFix({ what: 'camera', target: 'pole', maxM: 10 }, [p1, cam], []).items[0]).toMatchObject({ to: [p1.lat, p1.lng], fix: { mount_kind: 'pole', mount_id: 1 } });
    const camWall = node(11, 'camera', -10 + 305 * M, -40);
    const wall = planBulkFix({ what: 'camera', target: 'wall', maxM: 10 }, [client, camWall], []).items[0];
    expect(wall).toMatchObject({ to: [camWall.lat, camWall.lng], fix: { mount_kind: 'wall', mount_id: 4 } });
  });

  it('reserva técnica sem fixação vai para o poste perto', () => {
    const c = cable(20, [[-10, -40], [-10 + 100 * M, -40]], null, null, {
      slacks: [
        { id: 'r1', lat: -10 + 6 * M, lng: -40, length_m: 15, kind: 'aerial' },
        { id: 'r2', lat: -10 + 50 * M, lng: -40, length_m: 15, kind: 'aerial' },
        { id: 'r3', lat: -10 + 97 * M, lng: -40, length_m: 15, kind: 'aerial', fixed_kind: 'cable' },
      ],
    });
    const plan = planBulkFix({ what: 'slack', target: 'pole', maxM: 10 }, [p1, p2], [c]);
    expect(plan.items.map((i) => i.slackId)).toEqual(['r1']);
    expect(plan.skippedFixed).toBe(1);
    const body = bulkPayload(plan.items);
    expect(body.cables).toEqual([{ id: 20, slacks: [{ id: 'r1', lat: p1.lat, lng: p1.lng, fixed_kind: 'pole', fixed_id: 1 }] }]);
    expect(undoPayload(plan.items, [p1, p2], [c]).cables[0].slacks![0]).toEqual({ id: 'r1', lat: -10 + 6 * M, lng: -40, fixed_kind: null, fixed_id: null });
  });

  it('cabo: vértices perto do poste vão para cima dele; pontas ligadas a caixas não mudam', () => {
    const cto = node(30, 'cto', -10 + 0.5 * M, -40 + 0.0001);
    const c = cable(20, [[cto.lat, cto.lng], [-10 + 3 * M, -40], [-10 + 50 * M, -40], [-10 + 102 * M, -40]], 30, null);
    const plan = planBulkFix({ what: 'cable', target: 'pole', maxM: 10 }, [p1, p2, cto], [c]);
    expect(plan.items).toHaveLength(1);
    const it0 = plan.items[0];
    expect(it0.moved).toBe(2);
    expect(it0.path).toEqual([[cto.lat, cto.lng], [p1.lat, p1.lng], [-10 + 50 * M, -40], [p2.lat, p2.lng]]);
  });

  it('cabo: com addOnPath o poste ao lado do traçado vira vértice', () => {
    const mid = node(5, 'pole', -10 + 50 * M, -40 + 4 * M);
    const c = cable(20, [[-10, -40], [-10 + 100 * M, -40]]);
    const plan = planBulkFix({ what: 'cable', target: 'pole', maxM: 10, addOnPath: true }, [p1, p2, mid], [c]);
    expect(plan.items[0].path).toEqual([[-10, -40], [mid.lat, mid.lng], [-10 + 100 * M, -40]]);
    expect(plan.items[0].added).toBe(1);
    // Sem a opção, nada muda (as pontas já estão nos postes).
    expect(planBulkFix({ what: 'cable', target: 'pole', maxM: 10 }, [p1, p2, mid], [c]).items).toEqual([]);
  });

  it('monta o pedido e o desfazer com a posição/fixação de antes', () => {
    const cto = node(10, 'cto', -10 + 4 * M, -40, { fixed_kind: 'wall', address: 'Rua A' });
    const plan = planBulkFix({ what: 'cto', target: 'pole', maxM: 10, includeFixed: true }, [p1, cto], []);
    expect(bulkPayload(plan.items).nodes).toEqual([{ id: 10, lat: p1.lat, lng: p1.lng, fix: { fixed_kind: 'pole', fixed_id: 1 } }]);
    expect(undoPayload(plan.items, [p1, cto], []).nodes).toEqual([{ id: 10, lat: cto.lat, lng: cto.lng, fix: { fixed_kind: 'wall', fixed_id: null } }]);
    expect(bulkSummary('cto', 'pole', 12, 10)).toBe('12 CTOs no poste mais perto (até 10 m)');
  });
});
