import { describe, expect, it } from 'vitest';
import { laserTo, locateDistance, otdrCurve, otdrTrace, type OtdrTrace } from '../../resources/js/lib/otdr';
import type { Cable, LatLng, NetNode, Network } from '../../resources/js/lib/types';

const settings = { olt_tx_dbm: 5, fusion_loss_db: 0.1, connector_loss_db: 0.5, fiber_loss_db_km: 0.35, onu_min_dbm: -27, onu_warn_dbm: -25, onu_max_dbm: -8 };
const node = (id: number, type: NetNode['type'], lat: number, lng: number, diagram: NetNode['diagram'] = null): NetNode => ({
  id, project_id: 1, type, name: `${type}-${id}`, lat, lng, status: 'planned', notes: null, attributes: null, diagram,
});
const cable = (id: number, from: number, to: number, path: LatLng[], length: number, fibers = 12, slack = 0): Cable => ({
  id, project_id: 1, name: `C${id}`, category: fibers === 1 ? 'drop' : 'distribution', model: null, fiber_count: fibers, fibers_per_tube: 12,
  status: 'planned', color: '#000000', width: 3, line_style: null, path, from_node_id: from, to_node_id: to, slack_m: slack, length_m: length, notes: null,
});

// POP (0,0) → CTO (0.01,0) [~1112 m + 100 m de reserva] → Cliente (0.01,0.001) e saída 2 do splitter → CTO 5
function net(): Network {
  return {
    settings,
    nodes: [
      node(1, 'pop', 0, 0, {
        components: [{ id: 'kolt', kind: 'olt', name: 'OLT', model: 'custom', slots: 1, ports: 8, tx_dbm: 5, x: 0, y: 0 }],
        cablePos: {},
        connections: [{ id: 'a', a: { c: 'kolt', p: 'p1' }, b: { c: 'c10', p: 'f1' } }],
      }),
      node(2, 'cto', 0.01, 0, {
        components: [{ id: 'ks', kind: 'splitter', model: '1x8-rf', x: 0, y: 0 }],
        cablePos: {},
        connections: [
          { id: 'b', a: { c: 'c10', p: 'f1' }, b: { c: 'ks', p: 'in' } },
          { id: 'c', a: { c: 'ks', p: 'o1' }, b: { c: 'c20', p: 'f1' } },
          { id: 'd', a: { c: 'ks', p: 'o2' }, b: { c: 'c30', p: 'f1' } },
        ],
      }),
      node(3, 'client', 0.01, 0.001),
      node(5, 'cto', 0.011, 0, { components: [], cablePos: {}, connections: [] }),
    ],
    cables: [
      cable(10, 1, 2, [[0, 0], [0.01, 0]], 1111.95, 12, 100),
      cable(20, 2, 3, [[0.01, 0], [0.01, 0.001]], 111.19, 1),
      cable(30, 2, 5, [[0.01, 0], [0.011, 0]], 111.19, 12),
    ],
  };
}

const ok = (t: ReturnType<typeof otdrTrace>) => {
  if ('error' in t) throw new Error(t.error);
  return t as OtdrTrace;
};

describe('OTDR da rede', () => {
  it('A → B: do POP segue a fibra até o cliente pela 1ª saída do splitter', () => {
    const t = ok(otdrTrace(net(), { nodeId: 1, cableId: 10, fiber: 1 }));
    expect(t.events.map((e) => e.kind)).toEqual(['launch', 'fusion', 'splitter', 'fusion', 'end']);
    expect(t.end.kind).toBe('onu');
    expect(t.total).toBeCloseTo(1211.95 + 111.19, 1);
    expect(t.branches[0]).toMatchObject({ key: '2:ks', outputs: [1, 2], chosen: 1 });
    expect(t.spans.map((s) => s.name)).toEqual(['C10', 'C20']);
  });

  it('escolhe outra saída do splitter', () => {
    const t = ok(otdrTrace(net(), { nodeId: 1, cableId: 10, fiber: 1, choices: { '2:ks': 2 } }));
    expect(t.end.kind).toBe('open');
    expect(t.end.reason).toContain('C30');
    expect(t.spans.at(-1)!.toNode).toBe('cto-5');
  });

  it('B → A: do cliente sobe até a OLT', () => {
    const t = ok(otdrTrace(net(), { nodeId: 3, cableId: 20, fiber: 1 }));
    expect(t.end.kind).toBe('olt');
    expect(t.start.toward?.id).toBe(2);
    expect(t.events.filter((e) => e.kind === 'splitter')).toHaveLength(1);
    expect(t.path[0]).toEqual([0.01, 0.001]);
    expect(t.path.at(-1)).toEqual([0, 0]);
  });

  it('fibra sem emenda termina na caixa seguinte', () => {
    const t = ok(otdrTrace(net(), { nodeId: 1, cableId: 10, fiber: 2 }));
    expect(t.end.kind).toBe('open');
    expect(t.total).toBeCloseTo(1211.95, 1);
    expect(t.totalLoss).toBeCloseTo(1.21195 * 0.35, 3);
  });

  it('recusa cabo que não chega no objeto', () => {
    expect('error' in otdrTrace(net(), { nodeId: 3, cableId: 10, fiber: 1 })).toBe(true);
  });

  it('laser até a distância medida e localização no trecho', () => {
    const t = ok(otdrTrace(net(), { nodeId: 1, cableId: 10, fiber: 1 }));
    const l = laserTo(t, 606)!;
    expect(l.point[0]).toBeCloseTo(0.005, 3);
    expect(l.path[0]).toEqual([0, 0]);
    expect(laserTo(t, 99999)).toBeNull();
    const where = locateDistance(t, 606);
    expect(where.span?.name).toBe('C10');
    expect(where.fromStart).toBeCloseTo(606);
    expect(where.before?.kind).toBe('launch');
    expect(where.after?.kind).toBe('fusion');
  });

  it('curva começa em 0 dB, cai e avança sempre para a frente', () => {
    const t = ok(otdrTrace(net(), { nodeId: 1, cableId: 10, fiber: 1 }));
    const c = otdrCurve(t);
    expect(c[0]).toEqual({ at: 0, db: 0 });
    c.forEach((p, i) => i && expect(p.at).toBeGreaterThanOrEqual(c[i - 1].at));
    expect(Math.min(...c.map((p) => p.db))).toBeLessThan(-t.totalLoss);
  });
});
