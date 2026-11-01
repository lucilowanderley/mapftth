import { describe, expect, it } from 'vitest';
import {
  buildReport, cablesNear, freePorts, lengthInside, otdrRoute, parseCsv, pointAtDistance, pointInPolygon, polygonArea, toCsv, viability,
} from '../../resources/js/lib/analysis';
import { clientBudget } from '../../resources/js/lib/budget';
import type { Cable, LatLng, NetNode, Network } from '../../resources/js/lib/types';

const settings = { olt_tx_dbm: 5, fusion_loss_db: 0.1, connector_loss_db: 0.5, fiber_loss_db_km: 0.35, onu_min_dbm: -27, onu_warn_dbm: -25, onu_max_dbm: -8 };
const node = (id: number, type: NetNode['type'], lat: number, lng: number, diagram: NetNode['diagram'] = null): NetNode => ({
  id, project_id: 1, type, name: `${type}-${id}`, lat, lng, status: 'planned', notes: null, attributes: null, diagram,
});
const cable = (id: number, from: number, to: number, path: LatLng[], length: number, fibers = 12, slack = 0): Cable => ({
  id, project_id: 1, name: `C${id}`, category: fibers === 1 ? 'drop' : 'distribution', model: null, fiber_count: fibers, fibers_per_tube: 12,
  status: 'planned', color: '#000000', width: 3, path, from_node_id: from, to_node_id: to, slack_m: slack, length_m: length, notes: null,
});

// POP (0,0) → CTO (0.01,0) [~1112 m] → Cliente (0.01,0.001)
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
        ],
      }),
      node(3, 'client', 0.01, 0.001),
      node(4, 'pole', 0.005, 0),
    ],
    cables: [cable(10, 1, 2, [[0, 0], [0.01, 0]], 1111.95, 12, 100), cable(20, 2, 3, [[0.01, 0], [0.01, 0.001]], 111.19, 1)],
  };
}

const square: LatLng[] = [[-0.001, -0.001], [-0.001, 0.002], [0.006, 0.002], [0.006, -0.001]];

describe('geometria', () => {
  it('ponto em polígono e área', () => {
    expect(pointInPolygon([0, 0], square)).toBe(true);
    expect(pointInPolygon([0.01, 0], square)).toBe(false);
    expect(polygonArea([[0, 0], [0, 0.001], [0.001, 0.001], [0.001, 0]])).toBeCloseTo(12364, -1);
  });

  it('mede só a parte do cabo dentro da área', () => {
    // Cabo de 0 a 0.01 de latitude; o quadrado vai até 0.006 → ~667 m dentro.
    expect(lengthInside([[0, 0], [0.01, 0]], square)).toBeCloseTo(667, -1);
  });

  it('encontra cabos que passam pelo poste', () => {
    expect(cablesNear([0.005, 0], net().cables).map((c) => c.id)).toEqual([10]);
    expect(cablesNear([0.005, 0.001], net().cables)).toEqual([]);
  });
});

describe('portas e viabilidade', () => {
  it('lista saídas livres com potência', () => {
    const n = net();
    const free = freePorts(n, n.nodes[1]);
    expect(free).toHaveLength(7);
    expect(free[0].output).toBe(2);
    expect(free[0].budget.ok).toBe(true);
  });

  it('ordena CTOs por distância dentro do raio', () => {
    const n = net();
    expect(viability(n, [0.0101, 0], 100)).toHaveLength(1);
    expect(viability(n, [0.02, 0], 100)).toHaveLength(0);
    expect(viability(n, [0.0101, 0], 100)[0].best?.output).toBe(2);
  });
});

describe('relatório', () => {
  it('conta elementos e materiais na área', () => {
    const r = buildReport(net(), square);
    expect(r.nodes.pop).toBe(1);
    expect(r.nodes.pole).toBe(1);
    expect(r.nodes.cto).toBe(0);
    expect(r.cables).toHaveLength(1);
    expect(r.cables[0].meters).toBeCloseTo(667, -1);
  });

  it('relatório da rede inteira', () => {
    const r = buildReport(net());
    expect(r.nodes.cto).toBe(1);
    expect(r.splitters['1:8 RF']).toBe(1);
    expect(r.fusions).toBe(2); // OLT↔cabo é cordão, não fusão
    expect(r.ports).toEqual({ total: 8, used: 1 });
    expect(r.cableTotal).toBeCloseTo(1111.95 + 100 + 111.19, 1);
  });
});

describe('CSV', () => {
  it('ida e volta com ; e vírgula decimal', () => {
    const csv = toCsv([['codigo', 'lat', 'obs'], ['P-1', -2.5, 'tem "aspas"; e ponto']]);
    const rows = parseCsv(csv);
    expect(rows[0]).toEqual({ codigo: 'P-1', lat: '-2,5', obs: 'tem "aspas"; e ponto' });
  });
});

describe('OTDR virtual', () => {
  it('monta o percurso e localiza um ponto pela distância', () => {
    const n = net();
    const route = otdrRoute(n, clientBudget(n, n.nodes[2]))!;
    expect(route.total).toBeCloseTo(1211.95 + 111.19, 0);
    expect(route.events.map((e) => e.kind)).toEqual(['source', 'fusion', 'splitter', 'fusion']);
    const half = pointAtDistance(route, 606)!;
    expect(half[0]).toBeCloseTo(0.005, 3);
    expect(half[1]).toBeCloseTo(0, 5);
    expect(pointAtDistance(route, 99999)).toBeNull();
  });
});
