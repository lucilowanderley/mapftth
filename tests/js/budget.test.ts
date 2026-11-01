import { describe, expect, it } from 'vitest';
import { clientBudget, powerLevel, traceUpstream } from '../../resources/js/lib/budget';
import type { Cable, NetNode, Network, Settings } from '../../resources/js/lib/types';

const settings: Settings = {
  olt_tx_dbm: 5,
  fusion_loss_db: 0.1,
  connector_loss_db: 0.5,
  fiber_loss_db_km: 0.35,
  onu_min_dbm: -27,
  onu_warn_dbm: -25,
  onu_max_dbm: -8,
};

const node = (id: number, type: NetNode['type'], diagram: NetNode['diagram'] = null): NetNode => ({
  id, project_id: 1, type, name: `${type.toUpperCase()}-${id}`, lat: 0, lng: 0, status: 'planned', notes: null, attributes: null, diagram,
});

const cable = (id: number, from: number, to: number, length: number, fibers = 12): Cable => ({
  id, project_id: 1, name: `Cabo ${id}`, category: 'distribution', model: null, fiber_count: fibers, fibers_per_tube: 12,
  status: 'planned', color: '#000000', width: 3, path: [[0, 0], [0, 0]], from_node_id: from, to_node_id: to, slack_m: 0,
  length_m: length, notes: null,
});

// POP(1) --cabo 10 (1000 m)--> CTO(2) --drop 20 (100 m)--> Cliente(3)
function network(): Network {
  const pop = node(1, 'pop', {
    components: [
      { id: 'olt', kind: 'olt', name: 'OLT 1', model: 'custom', slots: 1, ports: 8, tx_dbm: 5, x: 0, y: 0 },
      { id: 'dio', kind: 'dio', name: 'DIO 1', ports: 12, x: 0, y: 0 },
    ],
    cablePos: {},
    connections: [
      { id: 'k1', a: { c: 'olt', p: 'p1' }, b: { c: 'dio', p: 'b1' } },
      { id: 'k2', a: { c: 'dio', p: 'a1' }, b: { c: 'c10', p: 'f1' } },
    ],
  });
  const cto = node(2, 'cto', {
    components: [{ id: 's1', kind: 'splitter', model: '1x8-rf', x: 0, y: 0 }],
    cablePos: {},
    connections: [
      { id: 'k3', a: { c: 'c10', p: 'f1' }, b: { c: 's1', p: 'in' } },
      { id: 'k4', a: { c: 's1', p: 'o3' }, b: { c: 'c20', p: 'f1' } },
    ],
  });
  return { nodes: [pop, cto, node(3, 'client')], cables: [cable(10, 1, 2, 1000), cable(20, 2, 3, 100, 1)], settings };
}

describe('orçamento óptico', () => {
  it('soma OLT, DIO, cabos, fusões e splitter até o cliente', () => {
    const net = network();
    const r = clientBudget(net, net.nodes[2]);
    expect(r.ok).toBe(true);
    // DIO 0.5 + fusão 0.1 + cabo 0.35 + fusão 0.1 + splitter 10.5 + fusão 0.1 + drop 0.035→0.03
    expect(r.totalLoss).toBeCloseTo(11.68, 2);
    expect(r.power).toBeCloseTo(5 - 11.68, 2);
    expect(r.steps[0].kind).toBe('source');
    expect(r.source).toContain('PON 1');
    expect(powerLevel(r.power, settings)).toBe('high') // -6,68 dBm está acima do máximo da ONU;
  });

  it('calcula a potência numa saída de splitter', () => {
    const r = traceUpstream(network(), 2, { c: 's1', p: 'o5' });
    expect(r.ok).toBe(true);
    expect(r.power).toBeCloseTo(5 - 0.5 - 0.1 - 0.35 - 0.1 - 10.5, 2);
  });

  it('aponta a porta sem fusão quando o caminho é interrompido', () => {
    const net = network();
    net.nodes[1].diagram!.connections = net.nodes[1].diagram!.connections.filter((c) => c.id !== 'k3');
    const r = clientBudget(net, net.nodes[2]);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('CTO-2');
  });

  it('classifica níveis de potência', () => {
    expect(powerLevel(-26, settings)).toBe('warn');
    expect(powerLevel(-28, settings)).toBe('critical');
    expect(powerLevel(-5, settings)).toBe('high');
    expect(powerLevel(null, settings)).toBe('none');
  });
});
