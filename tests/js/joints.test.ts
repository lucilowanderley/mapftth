import { describe, expect, it } from 'vitest';
import { clientBudget } from '../../resources/js/lib/budget';
import { defaultJointLoss, jointLoss, jointLossSource, jointName } from '../../resources/js/lib/joints';
import type { Cable, Connection, NetNode, Network, Settings } from '../../resources/js/lib/types';

const s = { fusion_loss_db: 0.1, connector_loss_db: 0.5 };
const conn = (extra: Partial<Connection> = {}): Connection => ({ id: 'k', a: { c: 'a', p: '1' }, b: { c: 'b', p: '1' }, ...extra });

describe('perda das emendas', () => {
  it('usa o padrão do projeto sem tipo nem valor', () => {
    expect(jointLoss(conn(), s)).toBe(0.1);
    expect(jointLoss(conn({ joint: 'connector' }), s)).toBe(0.5);
    expect(jointLossSource(conn())).toBe('project');
  });

  it('usa a perda típica do tipo escolhido', () => {
    expect(jointLoss(conn({ joint: 'connector', spec: 'LC/UPC' }), s)).toBe(0.2);
    expect(jointLoss(conn({ spec: 'core' }), s)).toBe(0.03);
    expect(jointLoss(conn({ spec: 'mechanical' }), s)).toBe(0.2);
    expect(jointLossSource(conn({ spec: 'core' }))).toBe('type');
    expect(jointName(conn({ joint: 'connector', spec: 'SC/APC' }))).toBe('Conector SC/APC');
    expect(jointName(conn({ spec: 'mechanical' }))).toBe('Emenda mecânica');
  });

  it('o valor informado vence o tipo; passagem não tem perda', () => {
    expect(jointLoss(conn({ joint: 'connector', spec: 'SC/APC', loss_db: 0.12 }), s)).toBe(0.12);
    expect(jointLoss(conn({ loss_db: 0 }), s)).toBe(0);
    expect(jointLossSource(conn({ loss_db: 0 }))).toBe('manual');
    expect(jointLoss(conn({ pass: true, loss_db: 3 }), s)).toBe(0);
  });

  it('tipo de conector numa fusão é ignorado', () => {
    expect(defaultJointLoss(conn({ spec: 'SC/APC' }), s)).toBe(0.1);
  });
});

describe('orçamento com perdas por emenda', () => {
  const settings: Settings = { olt_tx_dbm: 5, fusion_loss_db: 0.1, connector_loss_db: 0.5, fiber_loss_db_km: 0, onu_min_dbm: -27, onu_warn_dbm: -25, onu_max_dbm: -8 };
  const node = (id: number, type: NetNode['type'], diagram: NetNode['diagram'] = null): NetNode => ({
    id, project_id: 1, type, name: `${type.toUpperCase()}-${id}`, lat: 0, lng: 0, status: 'planned', notes: null, attributes: null, diagram,
  });
  const cable = (id: number, from: number, to: number): Cable => ({
    id, project_id: 1, name: `Cabo ${id}`, category: 'distribution', model: null, fiber_count: 12, fibers_per_tube: 12,
    status: 'planned', color: '#000000', width: 3, line_style: null, path: [[0, 0], [0, 0]], from_node_id: from, to_node_id: to, slack_m: 0,
    length_m: 0, notes: null,
  });

  it('cada emenda soma a própria perda no caminho até o cliente', () => {
    const pop = node(1, 'pop', {
      components: [{ id: 'olt', kind: 'olt', name: 'OLT', model: 'custom', slots: 1, ports: 8, tx_dbm: 5, x: 0, y: 0 }],
      cablePos: {},
      connections: [{ id: 'k1', a: { c: 'olt', p: 'p1' }, b: { c: 'c10', p: 'f1' } }],
    });
    const cto = node(2, 'cto', {
      components: [
        { id: 's1', kind: 'splitter', model: '1x8-rf', x: 0, y: 0 },
        { id: 'kc', kind: 'client', name: 'Casa', node_id: 3, x: 0, y: 0 },
      ],
      cablePos: {},
      connections: [
        { id: 'k2', a: { c: 'c10', p: 'f1' }, b: { c: 's1', p: 'in' }, joint: 'connector', spec: 'SC/APC' },
        { id: 'k3', a: { c: 's1', p: 'o1' }, b: { c: 'kc', p: 'in' }, joint: 'connector', loss_db: 0.9 },
      ],
    });
    const net: Network = { nodes: [pop, cto, node(3, 'client')], cables: [cable(10, 1, 2)], settings };
    const r = clientBudget(net, net.nodes[2]);
    expect(r.ok).toBe(true);
    // (ligação OLT → cabo no POP é cordão, sem perda) SC/APC 0,30 + splitter 1x8 10,5 + conector informado 0,90
    expect(r.totalLoss).toBeCloseTo(0.3 + 10.5 + 0.9, 2);
    expect(r.steps.some((st) => st.detail.startsWith('Conector SC/APC'))).toBe(true);
    // Fusão medida no lugar do conector: 0,04 dB.
    cto.diagram!.connections[1] = { id: 'k3', a: { c: 's1', p: 'o1' }, b: { c: 'kc', p: 'in' }, loss_db: 0.04 };
    expect(clientBudget(net, net.nodes[2]).totalLoss).toBeCloseTo(0.3 + 10.5 + 0.04, 2);
  });
});
