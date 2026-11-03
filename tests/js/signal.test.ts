import { describe, expect, it } from 'vitest';
import { clientBudget } from '../../resources/js/lib/budget';
import { analyzeSignal, measuredClients } from '../../resources/js/lib/signal';
import type { Cable, NetNode, Network, Settings } from '../../resources/js/lib/types';

const settings: Settings = { olt_tx_dbm: 5, fusion_loss_db: 0.1, connector_loss_db: 0.5, fiber_loss_db_km: 0.35, onu_min_dbm: -27, onu_warn_dbm: -25, onu_max_dbm: -8 };
const node = (id: number, type: NetNode['type'], diagram: NetNode['diagram'] = null, attributes: NetNode['attributes'] = null): NetNode => ({
  id, project_id: 1, type, name: `${type.toUpperCase()}-${id}`, lat: 0, lng: 0, status: 'planned', notes: null, attributes, diagram,
});
const cable = (id: number, from: number, to: number, length: number, fibers = 12): Cable => ({
  id, project_id: 1, name: `Cabo ${id}`, category: 'distribution', model: null, fiber_count: fibers, fibers_per_tube: 12,
  status: 'planned', color: '#000000', width: 3, line_style: null, path: [[0, 0], [0, 0]], from_node_id: from, to_node_id: to, slack_m: 0,
  length_m: length, notes: null,
});

// OLT no POP(1) → CTO(2) com splitter 1:8 → clientes 3 e 4 (drops 20 e 21); cliente 5 desenhado só no diagrama.
function network(rx: Record<number, number>): Network {
  const pop = node(1, 'pop', {
    components: [{ id: 'olt', kind: 'olt', name: 'OLT 1', model: 'custom', slots: 1, ports: 8, tx_dbm: -3, x: 0, y: 0 }],
    cablePos: {},
    connections: [{ id: 'k1', a: { c: 'olt', p: 'p1' }, b: { c: 'c10', p: 'f1' } }],
  });
  const cto = node(2, 'cto', {
    components: [
      { id: 's1', kind: 'splitter', model: '1x8-rf', x: 0, y: 0 },
      { id: 'kc', kind: 'client', name: 'Padaria', x: 0, y: 0, ...(rx[5] !== undefined ? { rx_dbm: rx[5] } : {}) },
    ],
    cablePos: {},
    connections: [
      { id: 'k2', a: { c: 'c10', p: 'f1' }, b: { c: 's1', p: 'in' } },
      { id: 'k3', a: { c: 's1', p: 'o1' }, b: { c: 'c20', p: 'f1' } },
      { id: 'k4', a: { c: 's1', p: 'o2' }, b: { c: 'c21', p: 'f1' } },
      { id: 'k5', a: { c: 's1', p: 'o3' }, b: { c: 'kc', p: 'in' } },
    ],
  });
  const attrs = (id: number) => (rx[id] !== undefined ? { rx_dbm: rx[id] } : null);
  return {
    nodes: [pop, cto, node(3, 'client', null, attrs(3)), node(4, 'client', null, attrs(4))],
    cables: [cable(10, 1, 2, 1000), cable(20, 2, 3, 100, 1), cable(21, 2, 4, 100, 1)],
    settings,
  };
}

const target = (net: Network, id: number) => {
  const n = net.nodes.find((x) => x.id === id)!;
  return { key: `n${id}`, measured: n.attributes?.rx_dbm as number | undefined, budget: clientBudget(net, n) };
};

describe('saúde do sinal do cliente', () => {
  it('sem medição: só mostra o estimado', () => {
    const net = network({});
    const a = analyzeSignal(net, target(net, 3));
    expect(a.health).toBe('none');
    expect(a.estimated).not.toBeNull();
  });

  it('dentro do estimado: saudável', () => {
    const net = network({});
    const est = clientBudget(net, net.nodes[2]).power!;
    const net2 = network({ 3: est - 0.8 });
    const a = analyzeSignal(net2, target(net2, 3));
    expect(a.health).toBe('ok');
    expect(a.delta).toBeCloseTo(-0.8, 2);
    expect(a.fault).toBeUndefined();
  });

  it('perda alta só neste cliente: problema no trecho que só ele usa (saída do splitter em diante)', () => {
    const est = clientBudget(network({}), network({}).nodes[2]).power!;
    const net = network({ 3: est - 6, 4: est - 0.5, 5: est });
    const a = analyzeSignal(net, target(net, 3));
    expect(a.health).toBe('bad');
    // Os vizinhos saudáveis compartilham o cabo e a emenda de entrada do splitter; a saída 1 já é só deste cliente.
    expect(a.fault!.after?.kind).toBe('fusion');
    expect(a.fault!.suspects.map((s) => s.kind)).toEqual(['splitter', 'fusion', 'cable']);
    expect(a.fault!.suspects[0].detail).toContain('saída 1');
    expect(a.fault!.degradedPeers).toEqual([]);
    expect(measuredClients(net)).toHaveLength(3);
  });

  it('todos abaixo do esperado e nenhum saudável: suspeita em todo o percurso', () => {
    const est = clientBudget(network({}), network({}).nodes[2]).power!;
    const net = network({ 3: est - 5, 4: est - 5 });
    const a = analyzeSignal(net, target(net, 3));
    expect(a.fault!.after).toBeNull();
    expect(a.fault!.healthyPeers).toBe(0);
    expect(a.fault!.suspects[0].kind).toBe('cable');
  });

  it('abaixo da sensibilidade da ONU é problema mesmo perto do estimado', () => {
    const net = network({ 3: -28 });
    const a = analyzeSignal(net, target(net, 3));
    expect(a.health).toBe('bad');
    expect(a.summary).toContain('sensibilidade');
  });
});
