import { describe, expect, it } from 'vitest';
import { TUBE_ROW, cableRows, parseTubeKey, pruneTrays, rowsHeight, trayPorts, toggleTube, trayOfConnection, trayUsage, tubeCount, tubeFibers, tubeKey, tubeOfFiber } from '../../resources/js/lib/tray';
import type { Connection, SpliceTray } from '../../resources/js/lib/types';

const cables = [
  { id: 1, fiber_count: 36, fibers_per_tube: 12 },
  { id: 2, fiber_count: 12, fibers_per_tube: 12 },
];
const tray = (id: string, tubes: string[] = []): SpliceTray => ({ id, name: id, capacity: 24, tubes, x: 0, y: 0 });
const conn = (id: string, a: string, b: string, pass = false): Connection => {
  const [ac, ap] = a.split('/');
  const [bc, bp] = b.split('/');
  return { id, a: { c: ac, p: ap }, b: { c: bc, p: bp }, ...(pass ? { pass } : {}) };
};

describe('bandejas e tubos loose', () => {
  it('conta tubos e fibras de cada tubo', () => {
    expect(tubeCount(cables[0])).toBe(3);
    expect(tubeCount(cables[1])).toBe(1);
    expect(tubeOfFiber(13, 12)).toBe(2);
    expect(tubeOfFiber(12, 12)).toBe(1);
    expect(tubeFibers(2, cables[0])).toEqual([13, 24]);
    expect(parseTubeKey(tubeKey('c1', 3))).toEqual({ cable: 'c1', tube: 3 });
  });

  it('um tubo fica em uma bandeja só', () => {
    let trays = [tray('b1'), tray('b2')];
    trays = toggleTube(trays, 'b1', 'c1:t1');
    trays = toggleTube(trays, 'b2', 'c1:t1');
    expect(trays[0].tubes).toEqual([]);
    expect(trays[1].tubes).toEqual(['c1:t1']);
    trays = toggleTube(trays, 'b2', 'c1:t1');
    expect(trays[1].tubes).toEqual([]);
  });

  it('ocupação conta emendas dos tubos vinculados, sem as passagens', () => {
    const d = {
      trays: [tray('b1', ['c1:t2']), tray('b2', ['c2:t1'])],
      connections: [
        conn('x1', 'c1/f13', 'ks/in'),
        conn('x2', 'c1/f14', 'c2/f2'),
        conn('x3', 'c1/f1', 'c2/f1'),
        conn('x4', 'c1/f15', 'c2/f3', true),
      ],
    };
    const u = trayUsage(d, cables);
    expect(u.get('b1')).toBe(2);
    expect(u.get('b2')).toBe(1);
    expect(trayOfConnection(d, cables, d.connections[2])?.id).toBe('b2');
  });

  it('remove vínculos de cabos que saíram da caixa', () => {
    expect(pruneTrays([tray('b1', ['c1:t3', 'c9:t1', 'c2:t2'])], cables)[0].tubes).toEqual(['c1:t3']);
  });
});

describe('bandeja aberta: linhas do cabo e portas da bandeja', () => {
  it('tubo vinculado vira uma linha só no cartão do cabo', () => {
    const t = tray('b1', ['c1:t2']);
    const rows = cableRows('c1', cables[0], [t], 14);
    expect(rows.filter((r) => r.kind === 'fiber')).toHaveLength(24);
    const tube = rows.find((r) => r.kind === 'tube')!;
    expect(tube).toMatchObject({ kind: 'tube', tube: 2, y: 12 * 14, h: TUBE_ROW });
    expect(rowsHeight(rows)).toBe(24 * 14 + TUBE_ROW);
    const f13 = rows.find((r) => r.kind === 'fiber' && r.fiber === 25)!;
    expect(f13.y).toBe(12 * 14 + TUBE_ROW);
  });

  it('portas: cabos da esquerda de um lado, da direita do outro', () => {
    const t = tray('b1', ['c1:t1', 'c2:t1']);
    const p = trayPorts(t, [
      { key: 'c1', side: 'left', cable: cables[0] },
      { key: 'c2', side: 'right', cable: cables[1] },
    ]);
    expect(p.left).toHaveLength(12);
    expect(p.right).toHaveLength(12);
    expect(p.left[0]).toEqual({ c: 'c1', p: 'f1' });
    expect(p.right[11]).toEqual({ c: 'c2', p: 'f12' });
  });
});
