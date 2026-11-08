import { describe, expect, it } from 'vitest';
import { buildBudget, builtinPrices, mergePrices, networkQuantities } from '../../resources/js/lib/pricing';
import type { Cable, Duct, LatLng, NetNode, Network, PriceItem } from '../../resources/js/lib/types';

const settings = { olt_tx_dbm: 5, fusion_loss_db: 0.1, connector_loss_db: 0.5, fiber_loss_db_km: 0.35, onu_min_dbm: -27, onu_warn_dbm: -25, onu_max_dbm: -8 };
const node = (id: number, type: NetNode['type'], lat: number, lng: number, diagram: NetNode['diagram'] = null, status: NetNode['status'] = 'planned'): NetNode => ({
  id, project_id: 1, type, name: `${type}-${id}`, lat, lng, status, notes: null, attributes: null, diagram,
});
const cable = (id: number, path: LatLng[], length: number, fibers = 12, slack = 0, status: Cable['status'] = 'planned'): Cable => ({
  id, project_id: 1, name: `C${id}`, category: fibers === 1 ? 'drop' : 'distribution', model: null, fiber_count: fibers, fibers_per_tube: 12,
  status, color: '#000000', width: 3, line_style: null, path, from_node_id: null, to_node_id: null, slack_m: slack, length_m: length, notes: null,
});

function net(): Network {
  return {
    settings,
    nodes: [
      node(1, 'pop', 0, 0, {
        components: [
          { id: 'kolt', kind: 'olt', name: 'OLT 1', model: 'zte-c320', vendor: 'ZTE', modelName: 'C320', slots: 2, ports: 16, tx_dbm: 5, x: 0, y: 0 },
          { id: 'kdio', kind: 'dio', name: 'DIO', ports: 24, x: 0, y: 0 },
          { id: 'kr', kind: 'rack', name: 'Rack', mount: 'floor', units: 44, x: 0, y: 0 },
        ],
        cablePos: {},
        connections: [{ id: 'a', a: { c: 'kdio', p: 'a1' }, b: { c: 'c10', p: 'f1' } }],
      }),
      node(2, 'cto', 0.01, 0, {
        components: [{ id: 'ks', kind: 'splitter', model: '1x8-rf', x: 0, y: 0 }],
        cablePos: {},
        connections: [
          { id: 'b', a: { c: 'c10', p: 'f1' }, b: { c: 'ks', p: 'in' } },
          { id: 'c', a: { c: 'ks', p: 'o1' }, b: { c: 'c20', p: 'f1' } },
        ],
      }),
      node(3, 'client', 0.01, 0.001),
      node(4, 'pole', 0.005, 0),
      node(5, 'pole', 0.02, 0.02, null, 'deployed'),
    ],
    cables: [cable(10, [[0, 0], [0.01, 0]], 1000, 12, 100), cable(20, [[0.01, 0], [0.01, 0.001]], 110, 1), cable(30, [[0.03, 0], [0.04, 0]], 500, 12, 0, 'deployed')],
  };
}

const duct: Duct = {
  id: 1, project_id: 1, name: 'D1', material: 'pead', diameter_mm: 40, subducts: 0, placement: 'buried', depth_m: null, status: 'planned', color: '#a16207',
  path: [[0, 0], [0.002, 0]], from_node_id: null, to_node_id: null, length_m: 220, cable_ids: [10], notes: null,
};

const qmap = (lines: ReturnType<typeof networkQuantities>) => Object.fromEntries(lines.map((l) => [l.key, l.qty]));

describe('quantitativos da rede', () => {
  it('conta cabos com reserva, lançamento, caixas, postes, dutos, equipamentos e fusões', () => {
    const q = qmap(networkQuantities(net(), [duct]));
    expect(q['cable:12']).toBe(1600);
    expect(q['cable:drop:1']).toBe(110);
    expect(q['launch:drop']).toBe(110);
    expect(q['launch:underground']).toBe(220);
    // 1000 − 220 em duto + 100 de reserva + 500 do cabo implantado.
    expect(q['launch:aerial']).toBe(1380);
    expect(q['node:cto']).toBe(1);
    expect(q['labor:install:cto']).toBe(1);
    expect(q['node:pole']).toBe(2);
    expect(q['labor:client']).toBe(1);
    expect(q['splitter:1x8-rf']).toBe(1);
    expect(q['equip:zte-c320']).toBe(1);
    expect(q['equip:generic:dio']).toBe(1);
    expect(q['rack:44']).toBe(1);
    expect(q['labor:equipment']).toBe(2);
    expect(q['labor:fusion']).toBe(3);
    expect(q['duct:pead:40:0']).toBe(220);
    expect(q['launch:duct:buried']).toBe(220);
  });

  it('só o que falta implantar deixa de fora o que já está implantado', () => {
    const q = qmap(networkQuantities(net(), [duct], 'pending'));
    expect(q['node:pole']).toBe(1);
    expect(q['cable:12']).toBe(1100);
  });
});

describe('orçamento', () => {
  const prices: PriceItem[] = [
    { id: 1, key: 'cable:12', category: 'cable', name: 'Cabo 12FO', unit: 'm', price: 2 },
    { id: 2, key: 'node:cto', category: 'box', name: 'CTO', unit: 'un', price: 150 },
    { id: 3, key: null, category: 'labor', name: 'Projeto executivo', unit: 'vb', price: 1000 },
  ];

  it('multiplica quantidade × preço, aplica ajustes, extras, BDI e desconto', () => {
    const q = networkQuantities(net(), [duct]);
    const b = buildBudget(q, prices, {
      bdi_pct: 10, discount_pct: 5, scope: 'all', notes: null,
      overrides: { 'cable:12': 1000 }, hidden: ['node:pole'],
      extras: [{ id: 'x', item_id: 3, category: 'labor', name: 'Projeto executivo', unit: 'vb', price: null, qty: 2 }],
    });
    const cab = b.lines.find((l) => l.key === 'cable:12')!;
    expect(cab).toMatchObject({ qty: 1000, auto: 1600, total: 2000, overridden: true });
    expect(b.lines.find((l) => l.key === 'node:pole')).toBeUndefined();
    expect(b.hidden.map((h) => h.key)).toEqual(['node:pole']);
    expect(b.subtotal).toBe(2000 + 150 + 2000);
    expect(b.bdi).toBeCloseTo(415);
    expect(b.discount).toBeCloseTo((4150 + 415) * 0.05);
    expect(b.total).toBeCloseTo(4565 * 0.95);
    expect(b.missing).toBeGreaterThan(0);
    expect(b.byCategory.map((g) => g.category)).toContain('labor');
  });

  it('o cadastro junta os padrões com os preços gravados e os avulsos', () => {
    const rows = mergePrices(builtinPrices([]), prices);
    expect(rows.find((r) => r.key === 'cable:12')?.price).toBe(2);
    expect(rows.find((r) => r.key === 'labor:fusion')?.price).toBe(0);
    expect(rows.find((r) => r.name === 'Projeto executivo')).toMatchObject({ builtin: false, price: 1000 });
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
  });
});
