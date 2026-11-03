import { describe, expect, it } from 'vitest';
import { childrenOf, dcLayout, floorFromCode, floorInfo, rackLocIn, rackTargets, spaceCode, spaceStats, spacesFromLoc, syncRackLocs } from '../../resources/js/lib/dcspace';
import type { DcSpace, Diagram } from '../../resources/js/lib/types';

const rack = (id: string, extra: Record<string, unknown> = {}) => ({ id, kind: 'rack' as const, name: id, mount: 'floor' as const, units: 44, x: 0, y: 0, ...extra });
const size = () => ({ w: 100, h: 200 });

const tree: DcSpace[] = [
  { id: 's', kind: 'site', code: 'DC1', company: 'ACME', open: true, x: 10, y: 20 },
  { id: 'f1', kind: 'floor', parent: 's', code: '1', level: 1, open: true, x: 0, y: 0 },
  { id: 'f0', kind: 'floor', parent: 's', code: 'T', level: 0, open: false, x: 0, y: 0 },
  { id: 'r', kind: 'room', parent: 'f1', code: 'A', open: true, x: 0, y: 0 },
  { id: 'aj', kind: 'row', parent: 'r', code: 'AJ', open: true, x: 0, y: 0 },
  { id: 'b', kind: 'row', parent: 'f0', code: 'B', open: true, x: 0, y: 0 },
];

describe('estrutura do datacenter', () => {
  it('código TIA-606 vem dos níveis de cima', () => {
    expect(spaceCode(tree, 'aj')).toBe('DC1.1A-AJ');
    expect(spaceCode(tree, 'b')).toBe('DC1.T-B');
    expect(rackTargets(tree).map((t) => t.code)).toEqual(['DC1.1A-AJ', 'DC1.T-B']);
  });

  it('andares de cima para baixo e códigos por tipo', () => {
    expect(childrenOf(tree, 's').map((s) => s.id)).toEqual(['f1', 'f0']);
    expect(floorInfo('basement', 2)).toEqual({ code: 'S2', name: 'Subsolo 2', level: -2 });
    expect(floorInfo('floor', 1).name).toBe('Piso 01');
    expect(floorFromCode('S3')).toEqual({ type: 'basement', n: 3 });
  });

  it('sincroniza o endereço dos racks e renomeia quem usava o código', () => {
    const d: Diagram = {
      components: [rack('DC1.1A-AJ05', { space: 'aj', loc: { site: 'DC1', floor: '1', room: 'A', row: 'AJ', pos: 5 } })],
      cablePos: {},
      connections: [],
      spaces: tree.map((s) => (s.id === 's' ? { ...s, code: 'DC9' } : s)),
    };
    const out = syncRackLocs(d).components[0];
    expect(out.kind === 'rack' && out.name).toBe('DC9.1A-AJ05');
    expect(out.kind === 'rack' && out.loc?.site).toBe('DC9');
  });

  it('migra racks com endereço digitado para a estrutura', () => {
    const d: Diagram = {
      components: [
        rack('a', { loc: { site: 'DC1', floor: '1', room: 'A', row: 'AJ', pos: 1 } }),
        rack('b', { loc: { site: 'DC1', floor: '1', room: 'A', row: 'AJ', pos: 2 } }),
        rack('c', { loc: { row: 'C', pos: 1 } }),
        rack('d'),
      ],
      cablePos: {},
      connections: [],
    };
    const m = spacesFromLoc(d);
    expect(m.spaces!.map((s) => s.kind).sort()).toEqual(['floor', 'room', 'row', 'row', 'site']);
    const racks = m.components.filter((c) => c.kind === 'rack');
    expect(racks.find((r) => r.id === 'a')!.space).toBe(racks.find((r) => r.id === 'b')!.space);
    expect(racks.find((r) => r.id === 'd')!.space).toBeUndefined();
  });

  it('layout: recolhido esconde racks e aberto arruma lado a lado', () => {
    const d: Diagram = { components: [rack('x', { space: 'aj', loc: { pos: 2 } }), rack('y', { space: 'aj', loc: { pos: 1 } }), rack('z', { space: 'b' })], cablePos: {}, connections: [], spaces: tree };
    const l = dcLayout(d, size);
    expect(l.hiddenIn.get('z')).toBe('f0');
    expect(l.rackPos.get('y')!.x).toBeLessThan(l.rackPos.get('x')!.x);
    expect(l.boxes.get('s')!.x).toBe(10);
    expect(l.boxes.has('b')).toBe(false);
    expect(spaceStats(d, 's').racks).toBe(3);
    expect(rackLocIn(d, 'aj').pos).toBe(3);
  });
});
