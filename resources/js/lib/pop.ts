import { DIO_TRAY, splitterModel } from './catalog';
import type { Connection, Diagram, DiagramComponent, End } from './types';

/** Funções puras do editor de POP (sem React), usadas também nos testes. */

export const endKey = (e: End) => `${e.c}:${e.p}`;
export const sameEnd = (a: End, b: End) => a.c === b.c && a.p === b.p;
export const isCableKey = (c: string) => /^c\d+$/.test(c);
export const uid = () => `k${Math.random().toString(36).slice(2, 9)}`;

type Comp = DiagramComponent | undefined;

/**
 * Ponta de cordão/patch (conector): porta PON ou uplink de OLT, frente do DIO e portas de equipamento ativo.
 * Ligações entre pontas de cordão não somam perda de fusão.
 */
export function isPatchEnd(comp: Comp, port: string): boolean {
  if (!comp) return false;
  return comp.kind === 'olt' || comp.kind === 'active' || (comp.kind === 'dio' && port.startsWith('b'));
}

export function partner(d: Diagram, e: End): { conn: Connection; other: End } | undefined {
  for (const conn of d.connections) {
    if (sameEnd(conn.a, e)) return { conn, other: conn.b };
    if (sameEnd(conn.b, e)) return { conn, other: conn.a };
  }
  return undefined;
}

export const trays = (ports: number) => Math.max(1, Math.ceil(ports / DIO_TRAY));

/** Rótulo de uma porta de OLT: "S1/P3" ou "UP2". */
export function oltPortLabel(olt: Extract<DiagramComponent, { kind: 'olt' }>, port: string): string {
  const n = Number(port.slice(1));
  if (port.startsWith('u')) return `UP${n}`;
  return `S${Math.floor((n - 1) / olt.ports) + 1}/P${((n - 1) % olt.ports) + 1}`;
}

/** Cabos vinculados ao DIO: lista explícita ou, em diagramas antigos, os cabos já fundidos nele. */
export function linkedCables(d: Diagram, dio: Extract<DiagramComponent, { kind: 'dio' }>): string[] {
  if (dio.cables) return dio.cables;
  const found = new Set<string>();
  for (let n = 1; n <= dio.ports; n++) {
    const src = fusionSource(d, dio.id, n);
    if (src) found.add(src.cable);
  }
  return [...found];
}

export interface FusionSource {
  cable: string;
  fiber: number;
  /** Quando a porta recebe a saída de um splitter. */
  splitter?: { id: string; out: number };
}

/** De onde vem a luz da porta n (lado de fusão) do DIO: fibra de cabo direta ou via splitter. */
export function fusionSource(d: Diagram, dioId: string, n: number): FusionSource | null {
  const link = partner(d, { c: dioId, p: `a${n}` });
  if (!link) return null;
  const o = link.other;
  if (isCableKey(o.c) && o.p.startsWith('f')) return { cable: o.c, fiber: Number(o.p.slice(1)) };
  const comp = d.components.find((c) => c.id === o.c);
  if (comp?.kind === 'splitter' && o.p.startsWith('o')) {
    const input = partner(d, { c: comp.id, p: 'in' });
    if (input && isCableKey(input.other.c)) {
      return { cable: input.other.c, fiber: Number(input.other.p.slice(1)), splitter: { id: comp.id, out: Number(o.p.slice(1)) } };
    }
  }
  return null;
}

/**
 * Auto Fusão do DIO: funde as fibras livres dos cabos vinculados (na ordem) nas portas livres do DIO.
 * Fibras já usadas em qualquer conexão do POP são puladas.
 */
export function autoFuseDio(d: Diagram, dioId: string, cables: { key: string; fibers: number }[]): Connection[] {
  const dio = d.components.find((c) => c.id === dioId);
  if (!dio || dio.kind !== 'dio') return [];
  const used = new Set(d.connections.flatMap((c) => [endKey(c.a), endKey(c.b)]));
  const free: number[] = [];
  for (let n = 1; n <= dio.ports; n++) if (!used.has(`${dioId}:a${n}`)) free.push(n);
  const created: Connection[] = [];
  for (const cable of cables) {
    for (let f = 1; f <= cable.fibers && free.length; f++) {
      if (used.has(`${cable.key}:f${f}`)) continue;
      const n = free.shift()!;
      created.push({ id: uid(), a: { c: cable.key, p: `f${f}` }, b: { c: dioId, p: `a${n}` } });
    }
  }
  return created;
}

/**
 * Auto-Patch: liga cada porta do DIO que já tem fusão (e frente livre) na próxima porta PON livre das OLTs.
 */
export function autoPatch(d: Diagram): Connection[] {
  const used = new Set(d.connections.flatMap((c) => [endKey(c.a), endKey(c.b)]));
  const pons: End[] = [];
  d.components.forEach((c) => {
    if (c.kind !== 'olt') return;
    for (let i = 1; i <= c.slots * c.ports; i++) if (!used.has(`${c.id}:p${i}`)) pons.push({ c: c.id, p: `p${i}` });
  });
  const created: Connection[] = [];
  d.components.forEach((c) => {
    if (c.kind !== 'dio') return;
    for (let n = 1; n <= c.ports && pons.length; n++) {
      if (!used.has(`${c.id}:a${n}`) || used.has(`${c.id}:b${n}`)) continue;
      created.push({ id: uid(), a: pons.shift()!, b: { c: c.id, p: `b${n}` } });
    }
  });
  return created;
}

export interface VflResult {
  ends: Set<string>;
  connections: Set<string>;
  /** Fibras que saem do POP pelo cabo (seguem na rede). */
  exits: { cable: string; fiber: number }[];
}

/**
 * Traço VFL: acende a partir de uma porta e segue fusões, cordões e a passagem interna dos componentes
 * (DIO frente↔fundo, splitter entrada↔saídas, as duas linhas de uma mesma porta de OLT/ativo não se ligam).
 */
export function vflTrace(d: Diagram, start: End): VflResult {
  const comps = new Map(d.components.map((c) => [c.id, c]));
  const ends = new Set<string>();
  const connections = new Set<string>();
  const exits: VflResult['exits'] = [];
  const queue: End[] = [start];
  while (queue.length) {
    const e = queue.shift()!;
    const k = endKey(e);
    if (ends.has(k)) continue;
    ends.add(k);
    const link = partner(d, e);
    if (link) {
      connections.add(link.conn.id);
      queue.push(link.other);
    }
    // Passagem interna do componente.
    if (isCableKey(e.c)) {
      if (!exits.some((x) => x.cable === e.c && `f${x.fiber}` === e.p)) exits.push({ cable: e.c, fiber: Number(e.p.slice(1)) });
      continue;
    }
    const comp = comps.get(e.c);
    if (comp?.kind === 'dio') queue.push({ c: e.c, p: (e.p.startsWith('a') ? 'b' : 'a') + e.p.slice(1) });
    if (comp?.kind === 'splitter') {
      if (e.p === 'in') {
        const n = splitterModel(comp.model).outputs;
        for (let i = 1; i <= n; i++) queue.push({ c: e.c, p: `o${i}` });
      } else queue.push({ c: e.c, p: 'in' });
    }
  }
  return { ends, connections, exits };
}

/** Remove conexões de portas que deixaram de existir (DIO/OLT reduzidos ou excluídos). */
export function pruneConnections(d: Diagram, validCables: Set<string>): Connection[] {
  const comps = new Map(d.components.map((c) => [c.id, c]));
  const valid = (e: End) => {
    if (isCableKey(e.c)) return validCables.has(e.c);
    const c = comps.get(e.c);
    if (!c) return false;
    const n = Number(e.p.slice(1));
    switch (c.kind) {
      case 'dio':
        return n >= 1 && n <= c.ports;
      case 'olt':
        return e.p.startsWith('u') ? n >= 1 && n <= (c.uplinks ?? 0) : n >= 1 && n <= c.slots * c.ports;
      case 'active':
        return n >= 1 && n <= c.ports;
      case 'splitter':
        return e.p === 'in' || (n >= 1 && n <= splitterModel(c.model).outputs);
    }
  };
  return d.connections.filter((c) => valid(c.a) && valid(c.b));
}
