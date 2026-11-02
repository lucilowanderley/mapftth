import { describe, expect, it } from 'vitest';
import { traceUpstream } from '../../resources/js/lib/budget';
import {
  autoFuseDio,
  autoPatch,
  canMount,
  compareRacks,
  defaultRackHeight,
  duplicateRackCodes,
  nextRackPos,
  nextRow,
  rackCode,
  rackLabel,
  searchRacks,
  firstFreeU,
  fusionSource,
  linkedCables,
  pruneConnections,
  rackConflicts,
  rackItems,
  rackUsed,
  unmount,
  vflTrace,
} from '../../resources/js/lib/pop';
import type { Rack } from '../../resources/js/lib/pop';
import type { Cable, Diagram, NetNode, Network, RackLocation, Settings } from '../../resources/js/lib/types';

const settings: Settings = {
  olt_tx_dbm: 5, fusion_loss_db: 0.1, connector_loss_db: 0.5, fiber_loss_db_km: 0.35, onu_min_dbm: -27, onu_warn_dbm: -25, onu_max_dbm: -8,
};

const base = (): Diagram => ({
  components: [
    { id: 'olt', kind: 'olt', name: 'OLT 1', model: 'custom', slots: 1, ports: 4, uplinks: 2, tx_dbm: 5, x: 0, y: 0 },
    { id: 'dio', kind: 'dio', name: 'DIO 1', ports: 12, cables: ['c10'], x: 0, y: 0 },
  ],
  cablePos: {},
  connections: [],
  popLayout: true,
});

describe('editor de POP', () => {
  it('Auto Fusão funde as fibras do cabo vinculado nas portas livres, pulando as ocupadas', () => {
    const d = base();
    d.connections.push({ id: 'x', a: { c: 'c10', p: 'f2' }, b: { c: 'dio', p: 'a1' } });
    const created = autoFuseDio(d, 'dio', [{ key: 'c10', fibers: 4 }]);
    expect(created.map((c) => `${c.a.p}>${c.b.p}`)).toEqual(['f1>a2', 'f3>a3', 'f4>a4']);
  });

  it('Auto-Patch liga as portas fundidas do DIO às PON livres, em ordem', () => {
    const d = base();
    d.connections.push(
      ...autoFuseDio(d, 'dio', [{ key: 'c10', fibers: 6 }]),
      { id: 'p', a: { c: 'olt', p: 'p1' }, b: { c: 'dio', p: 'b1' } },
    );
    const created = autoPatch(d);
    // 4 PON, uma já usada: sobram 3 para as portas 2, 3 e 4.
    expect(created.map((c) => `${c.a.p}>${c.b.p}`)).toEqual(['p2>b2', 'p3>b3', 'p4>b4']);
  });

  it('identifica a fibra de cada porta, direta ou via splitter', () => {
    const d = base();
    d.components.push({ id: 's', kind: 'splitter', model: '1x2-rf', dio: 'dio', x: 0, y: 0 });
    d.connections.push(
      { id: '1', a: { c: 'c10', p: 'f3' }, b: { c: 'dio', p: 'a1' } },
      { id: '2', a: { c: 'c10', p: 'f5' }, b: { c: 's', p: 'in' } },
      { id: '3', a: { c: 's', p: 'o2' }, b: { c: 'dio', p: 'a7' } },
    );
    expect(fusionSource(d, 'dio', 1)).toEqual({ cable: 'c10', fiber: 3 });
    expect(fusionSource(d, 'dio', 7)).toEqual({ cable: 'c10', fiber: 5, splitter: { id: 's', out: 2 } });
    expect(fusionSource(d, 'dio', 2)).toBeNull();
  });

  it('infere os cabos vinculados de diagramas antigos pelas fusões', () => {
    const d = base();
    const dio = { ...d.components[1], cables: undefined } as Extract<Diagram['components'][number], { kind: 'dio' }>;
    d.connections.push({ id: '1', a: { c: 'c10', p: 'f1' }, b: { c: 'dio', p: 'a1' } });
    expect(linkedCables(d, dio)).toEqual(['c10']);
  });

  it('Traço VFL segue cordão, DIO e fusão até a fibra que sai do POP', () => {
    const d = base();
    d.connections.push(
      { id: 'f', a: { c: 'c10', p: 'f4' }, b: { c: 'dio', p: 'a4' } },
      { id: 'p', a: { c: 'olt', p: 'p2' }, b: { c: 'dio', p: 'b4' } },
    );
    const r = vflTrace(d, { c: 'olt', p: 'p2' });
    expect([...r.connections].sort()).toEqual(['f', 'p']);
    expect(r.exits).toEqual([{ cable: 'c10', fiber: 4 }]);
  });

  it('remove conexões de portas que deixaram de existir', () => {
    const d = base();
    d.connections.push(
      { id: 'ok', a: { c: 'c10', p: 'f1' }, b: { c: 'dio', p: 'a12' } },
      { id: 'up', a: { c: 'olt', p: 'u3' }, b: { c: 'dio', p: 'b1' } },
      { id: 'gone', a: { c: 'c99', p: 'f1' }, b: { c: 'dio', p: 'a2' } },
    );
    expect(pruneConnections(d, new Set(['c10'])).map((c) => c.id)).toEqual(['ok']);
  });

  it('orçamento óptico não trata uplink nem equipamento ativo como fonte PON', () => {
    const d = base();
    d.components.push({ id: 'sw', kind: 'active', name: 'Switch 1', type: 'Switch', ports: 8, x: 0, y: 0 });
    d.connections.push(
      { id: 'f', a: { c: 'c10', p: 'f1' }, b: { c: 'dio', p: 'a1' } },
      { id: 'p', a: { c: 'sw', p: 'e1' }, b: { c: 'dio', p: 'b1' } },
    );
    const pop: NetNode = { id: 1, project_id: 1, type: 'pop', name: 'POP', lat: 0, lng: 0, status: 'planned', notes: null, attributes: null, diagram: d };
    const cable = { id: 10, from_node_id: 1, to_node_id: 2, length_m: 100, slack_m: 0, name: 'Cabo', fiber_count: 12, fibers_per_tube: 12 } as Cable;
    const net: Network = { nodes: [pop], cables: [cable], settings };
    const r = traceUpstream(net, 1, { c: 'dio', p: 'a1' });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('equipamento ativo');
  });
});

describe('rack do POP', () => {
  const withRack = (): Diagram => {
    const d = base();
    d.components.push({ id: 'r1', kind: 'rack', name: 'Rack 1', mount: 'floor', units: 12, x: 0, y: 0 });
    return d;
  };

  it('calcula a altura padrão pelo tamanho do equipamento', () => {
    expect(defaultRackHeight({ id: 'a', kind: 'dio', name: 'D', ports: 24, x: 0, y: 0 })).toBe(1);
    expect(defaultRackHeight({ id: 'a', kind: 'dio', name: 'D', ports: 144, x: 0, y: 0 })).toBe(4);
    expect(defaultRackHeight({ id: 'a', kind: 'olt', name: 'O', model: 'x', slots: 2, ports: 16, tx_dbm: 5, x: 0, y: 0 })).toBe(2);
    expect(defaultRackHeight({ id: 'a', kind: 'active', name: 'S', type: 'Switch', ports: 24, x: 0, y: 0 })).toBe(1);
  });

  it('preenche o rack de cima para baixo e não deixa sobrepor', () => {
    const d = withRack();
    expect(firstFreeU(d, 'r1', 1)).toBe(12);
    d.components = d.components.map((c) => (c.id === 'dio' ? { ...c, rack: 'r1', u: 12 } : c));
    expect(firstFreeU(d, 'r1', 2)).toBe(10);
    expect(canMount(d, 'r1', 11, 2)).toBe(false);
    expect(canMount(d, 'r1', 10, 2)).toBe(true);
    expect(canMount(d, 'r1', 12, 1, 'dio')).toBe(true);
    expect(canMount(d, 'r1', 0, 1)).toBe(false);
    expect(rackUsed(d, 'r1')).toBe(1);
    expect(rackItems(d, 'r1').map((c) => c.id)).toEqual(['dio']);
  });

  it('aponta conflito quando o rack fica menor que os equipamentos', () => {
    const d = withRack();
    d.components = d.components.map((c) => (c.id === 'olt' ? { ...c, rack: 'r1', u: 11, h: 2 } : c.kind === 'rack' ? { ...c, units: 8 } : c));
    expect([...rackConflicts(d)]).toEqual(['olt']);
    expect(unmount(d.components.find((c) => c.id === 'olt')!)).not.toHaveProperty('rack');
  });

  it('rack não tem portas: conexões nele são descartadas', () => {
    const d = withRack();
    d.connections.push({ id: 'z', a: { c: 'r1', p: 'p1' }, b: { c: 'dio', p: 'b1' } });
    expect(pruneConnections(d, new Set(['c10']))).toEqual([]);
  });
});

describe('endereçamento de rack (TIA-606)', () => {
  const rk = (id: string, loc?: RackLocation, name = id): Rack => ({ id, kind: 'rack', name, mount: 'floor', units: 44, loc, x: 0, y: 0 });

  it('monta o código prédio.andarSala-FileiraPosição', () => {
    expect(rackCode({ site: 'dc1', floor: '1', room: 'a', row: 'aj', pos: 5 })).toBe('DC1.1A-AJ05');
    expect(rackCode({ row: 'B', pos: 12 })).toBe('B12');
    expect(rackCode({ floor: '2', room: 'DH1' })).toBe('2DH1');
    expect(rackCode({})).toBe('');
    expect(rackCode(undefined)).toBe('');
  });

  it('fileiras seguem a ordem de colunas de planilha', () => {
    expect(nextRow('A')).toBe('B');
    expect(nextRow('Z')).toBe('AA');
    expect(nextRow('AZ')).toBe('BA');
  });

  it('ordena por sala, fileira (A < Z < AA) e posição numérica', () => {
    const list = [rk('3', { room: 'A', row: 'AA', pos: 1 }), rk('x'), rk('2', { room: 'A', row: 'B', pos: 10 }), rk('1', { room: 'A', row: 'B', pos: 2 })];
    expect([...list].sort(compareRacks).map((r) => r.id)).toEqual(['1', '2', '3', 'x']);
  });

  it('sugere a próxima posição livre e acha duplicados', () => {
    const list = [rk('a', { room: 'A', row: 'C', pos: 1 }), rk('b', { room: 'A', row: 'C', pos: 2 }), rk('c', { room: 'A', row: 'C', pos: 4 }), rk('d', { room: 'B', row: 'C', pos: 3 })];
    expect(nextRackPos(list, { room: 'A', row: 'C' })).toBe(3);
    expect(nextRackPos(list, { room: 'B', row: 'C' })).toBe(1);
    expect(duplicateRackCodes([...list, rk('e', { room: 'A', row: 'C', pos: 4 })])).toEqual(new Set(['A-C04']));
  });

  it('busca por código sem pontuação e mostra rótulo sem repetir', () => {
    const list = [rk('a', { site: 'DC1', floor: '1', room: 'A', row: 'AJ', pos: 5 }, 'Core'), rk('b', { row: 'B', pos: 1 }, 'B01')];
    expect(searchRacks(list, 'aj05').map((r) => r.id)).toEqual(['a']);
    expect(searchRacks(list, 'dc1 1a').map((r) => r.id)).toEqual(['a']);
    expect(rackLabel(list[0])).toBe('DC1.1A-AJ05 · Core');
    expect(rackLabel(list[1])).toBe('B01');
  });
});
