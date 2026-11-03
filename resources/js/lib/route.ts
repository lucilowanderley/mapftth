import type { Connection, Diagram, DiagramComponent, End } from './types';

/**
 * Rota do diagrama da CTO/CEO: agrupa tudo o que vem à frente (a jusante) de um cabo — ou de uma fibra dele —
 * num objeto só, recolhido como um cartão (como os ativos num rack) e expandido ao clicar.
 * Os membros não ficam gravados: são calculados pelas ligações, então o que for ligado depois entra sozinho.
 */
export type RouteComp = Extract<DiagramComponent, { kind: 'route' }>;

/** O que é cada elemento do diagrama, para decidir até onde a rota vai. */
export type RouteKind = 'splitter' | 'client' | 'drop' | 'cable' | 'other';

export interface RouteEnv {
  kindOf: (key: string) => RouteKind | undefined;
  /** Número de saídas do splitter. */
  outputs: (key: string) => number;
}

const endKey = (e: End) => `${e.c}:${e.p}`;

/** Fibras de partida da rota: a fibra escolhida ou todas as fibras do cabo que têm ligação. */
export function routeStart(connections: Connection[], cable: string, fiber?: string | null): End[] {
  if (fiber) return [{ c: cable, p: fiber }];
  const seen = new Map<string, End>();
  connections.forEach((c) =>
    [c.a, c.b].forEach((e) => {
      if (e.c === cable && e.p.startsWith('f')) seen.set(endKey(e), e);
    }),
  );
  return [...seen.values()].sort((a, b) => Number(a.p.slice(1)) - Number(b.p.slice(1)));
}

/**
 * Membros da rota, na ordem em que aparecem seguindo a fibra: splitters (entrando pela entrada, segue pelas saídas),
 * clientes do diagrama e drops até clientes do mapa. Cabos comuns (que saem da caixa) são o limite: ficam fora.
 */
export function routeMembers(d: Pick<Diagram, 'connections'>, root: { cable: string; fiber?: string | null }, env: RouteEnv): string[] {
  const members: string[] = [];
  const inRoute = new Set<string>();
  const seen = new Set<string>();
  const queue = routeStart(d.connections, root.cable, root.fiber);
  queue.forEach((e) => seen.add(endKey(e)));
  while (queue.length) {
    const e = queue.shift()!;
    for (const c of d.connections) {
      const o = c.a.c === e.c && c.a.p === e.p ? c.b : c.b.c === e.c && c.b.p === e.p ? c.a : null;
      if (!o || o.c === root.cable || seen.has(endKey(o))) continue;
      seen.add(endKey(o));
      const kind = env.kindOf(o.c);
      if (kind === 'splitter') {
        // Só segue o sentido da luz: entra pela entrada e sai pelas derivações.
        if (o.p !== 'in' || inRoute.has(o.c)) continue;
        inRoute.add(o.c);
        members.push(o.c);
        for (let i = 1; i <= env.outputs(o.c); i++) {
          const out = { c: o.c, p: `o${i}` };
          if (!seen.has(endKey(out))) {
            seen.add(endKey(out));
            queue.push(out);
          }
        }
      } else if ((kind === 'client' || kind === 'drop') && !inRoute.has(o.c)) {
        inRoute.add(o.c);
        members.push(o.c);
      }
    }
  }
  return members;
}

/** Ligações que cruzam a borda de um grupo (uma ponta dentro, outra fora) e as que ficam todas dentro. */
export function splitCrossings(connections: Connection[], members: Set<string>) {
  const crossing: Connection[] = [];
  const internal: Connection[] = [];
  connections.forEach((c) => {
    const a = members.has(c.a.c);
    const b = members.has(c.b.c);
    if (a && b) internal.push(c);
    else if (a || b) crossing.push(c);
  });
  return { crossing, internal };
}

/** Nome padrão: "Rota Cabo 12FO" ou "Rota Cabo 12FO · FO 1". */
export function routeName(cableName: string, fiber?: string | null) {
  return `Rota ${cableName}${fiber ? ` · FO ${fiber.slice(1)}` : ''}`;
}
