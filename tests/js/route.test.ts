import { describe, expect, it } from 'vitest';
import { routeMembers, routeName, routeStart, splitCrossings, type RouteEnv } from '../../resources/js/lib/route';
import type { Connection } from '../../resources/js/lib/types';

const conn = (id: string, a: string, b: string): Connection => {
  const [ac, ap] = a.split('/');
  const [bc, bp] = b.split('/');
  return { id, a: { c: ac, p: ap }, b: { c: bc, p: bp } };
};

// c1 = cabo que chega; s1 (1:2) e s2 (1:8) splitters; k1/k2 clientes; c9 = drop até cliente do mapa; c5 = cabo que sai.
const kinds: Record<string, ReturnType<RouteEnv['kindOf']>> = { c1: 'cable', c5: 'cable', c9: 'drop', s1: 'splitter', s2: 'splitter', s3: 'splitter', k1: 'client', k2: 'client' };
const env: RouteEnv = { kindOf: (k) => kinds[k], outputs: (k) => ({ s1: 2, s2: 8, s3: 4 })[k] ?? 0 };

const connections = [
  conn('a', 'c1/f1', 's1/in'),
  conn('b', 's1/o1', 's2/in'),
  conn('c', 's2/o1', 'k1/in'),
  conn('d', 's2/o2', 'c9/f1'),
  conn('e', 's1/o2', 'c5/f1'),
  conn('f', 'c1/f2', 's3/in'),
  conn('g', 's3/o1', 'k2/in'),
];

describe('rota (objetos à frente de um cabo)', () => {
  it('segue a fibra pelos splitters até clientes e drops, parando nos cabos que saem', () => {
    expect(routeMembers({ connections }, { cable: 'c1', fiber: 'f1' }, env)).toEqual(['s1', 's2', 'k1', 'c9']);
  });

  it('sem fibra escolhida, pega tudo o que sai de todas as fibras do cabo', () => {
    expect(routeMembers({ connections }, { cable: 'c1' }, env).sort()).toEqual(['c9', 'k1', 'k2', 's1', 's2', 's3']);
    expect(routeStart(connections, 'c1').map((e) => e.p)).toEqual(['f1', 'f2']);
  });

  it('não volta contra o sentido da luz (saída de splitter não leva à entrada)', () => {
    // Partindo do cabo que sai (c5), chega na saída o2 de s1: não entra no splitter.
    expect(routeMembers({ connections }, { cable: 'c5' }, env)).toEqual([]);
  });

  it('separa ligações internas das que cruzam a borda do grupo', () => {
    const { crossing, internal } = splitCrossings(connections, new Set(['s1', 's2', 'k1', 'c9']));
    expect(crossing.map((c) => c.id).sort()).toEqual(['a', 'e']);
    expect(internal.map((c) => c.id).sort()).toEqual(['b', 'c', 'd']);
  });

  it('nome padrão', () => {
    expect(routeName('Cabo 12FO')).toBe('Rota Cabo 12FO');
    expect(routeName('Cabo 12FO', 'f3')).toBe('Rota Cabo 12FO · FO 3');
  });
});
