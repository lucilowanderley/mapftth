import type { Cable, Connection, Diagram, SpliceTray } from './types';

/**
 * Bandejas de emenda da CEO/CTO: cada tubo loose de um cabo (12 FO por tubo, ou o que o cabo definir) pode ser
 * vinculado a uma bandeja. As fusões das fibras desse tubo contam na ocupação da bandeja.
 * Sem React, usado também nos testes.
 */

/** Capacidades comuns de bandeja (fusões). */
export const TRAY_CAPACITIES = [12, 16, 24, 36, 48, 72];

/** Chave do tubo: "c12:t2" = cabo 12, tubo 2. */
export const tubeKey = (cableKey: string, tube: number) => `${cableKey}:t${tube}`;

export function parseTubeKey(key: string): { cable: string; tube: number } | null {
  const m = /^(.+):t(\d+)$/.exec(key);
  return m ? { cable: m[1], tube: Number(m[2]) } : null;
}

export const tubeCount = (c: Pick<Cable, 'fiber_count' | 'fibers_per_tube'>) => Math.max(1, Math.ceil(c.fiber_count / Math.max(1, c.fibers_per_tube || 12)));

/** Tubo (1, 2, ...) da fibra "f13" num cabo. */
export const tubeOfFiber = (fiber: number, perTube: number) => Math.floor((fiber - 1) / Math.max(1, perTube || 12)) + 1;

/** Primeira e última fibra do tubo. */
export function tubeFibers(tube: number, c: Pick<Cable, 'fiber_count' | 'fibers_per_tube'>): [number, number] {
  const per = Math.max(1, c.fibers_per_tube || 12);
  return [(tube - 1) * per + 1, Math.min(c.fiber_count, tube * per)];
}

/** Bandeja onde o tubo está vinculado (cada tubo fica em uma bandeja só). */
export const trayOfTube = (trays: SpliceTray[] | undefined, key: string) => trays?.find((t) => t.tubes.includes(key));

/** Vincula o tubo à bandeja (tirando-o de qualquer outra) ou desvincula, se já estava nela. */
export function toggleTube(trays: SpliceTray[], trayId: string, key: string): SpliceTray[] {
  const current = trayOfTube(trays, key);
  return trays.map((t) => {
    if (t.id === trayId) return { ...t, tubes: current?.id === trayId ? t.tubes.filter((k) => k !== key) : [...t.tubes.filter((k) => k !== key), key] };
    return { ...t, tubes: t.tubes.filter((k) => k !== key) };
  });
}

/** Remove vínculos de tubos de cabos que não chegam mais na caixa. */
export function pruneTrays(trays: SpliceTray[] | undefined, cables: Pick<Cable, 'id' | 'fiber_count' | 'fibers_per_tube'>[]): SpliceTray[] {
  const valid = new Set(cables.flatMap((c) => Array.from({ length: tubeCount(c) }, (_, i) => tubeKey(`c${c.id}`, i + 1))));
  return (trays ?? []).map((t) => ({ ...t, tubes: t.tubes.filter((k) => valid.has(k)) }));
}

/** Bandeja da fibra de cabo ("c12" / "f13"), pelo tubo dela. */
export function trayOfFiber(diagram: Pick<Diagram, 'trays'>, cables: Pick<Cable, 'id' | 'fibers_per_tube'>[], c: string, p: string): SpliceTray | undefined {
  if (!p.startsWith('f')) return undefined;
  const cable = cables.find((x) => `c${x.id}` === c);
  if (!cable) return undefined;
  return trayOfTube(diagram.trays, tubeKey(c, tubeOfFiber(Number(p.slice(1)), cable.fibers_per_tube)));
}

/** Bandeja de uma emenda: a da primeira ponta que for fibra de cabo com tubo vinculado. */
export function trayOfConnection(diagram: Pick<Diagram, 'trays'>, cables: Pick<Cable, 'id' | 'fibers_per_tube'>[], conn: Connection): SpliceTray | undefined {
  return trayOfFiber(diagram, cables, conn.a.c, conn.a.p) ?? trayOfFiber(diagram, cables, conn.b.c, conn.b.p);
}

/** Ocupação de cada bandeja: emendas (fusão ou conector; passagens não ocupam) das fibras dos tubos vinculados. */
export function trayUsage(diagram: Pick<Diagram, 'trays' | 'connections'>, cables: Pick<Cable, 'id' | 'fibers_per_tube'>[]): Map<string, number> {
  const usage = new Map<string, number>((diagram.trays ?? []).map((t) => [t.id, 0]));
  for (const conn of diagram.connections) {
    if (conn.pass) continue;
    const t = trayOfConnection(diagram, cables, conn);
    if (t) usage.set(t.id, (usage.get(t.id) ?? 0) + 1);
  }
  return usage;
}

/** Altura da linha de um tubo vinculado no cartão do cabo (a derivação do tubo loose). */
export const TUBE_ROW = 26;

/** Linhas do cartão do cabo: fibras soltas (uma por linha) ou tubo vinculado a bandeja (uma linha só). */
export type CableRow = { kind: 'fiber'; fiber: number; y: number; h: number } | { kind: 'tube'; tube: number; tray: SpliceTray; y: number; h: number };

export function cableRows(cableKey: string, cable: Pick<Cable, 'fiber_count' | 'fibers_per_tube'>, trays: SpliceTray[] | undefined, row = 14): CableRow[] {
  const rows: CableRow[] = [];
  let y = 0;
  for (let t = 1; t <= tubeCount(cable); t++) {
    const tray = trayOfTube(trays, tubeKey(cableKey, t));
    const [f1, f2] = tubeFibers(t, cable);
    if (tray) {
      rows.push({ kind: 'tube', tube: t, tray, y, h: TUBE_ROW });
      y += TUBE_ROW;
    } else {
      for (let f = f1; f <= f2; f++) {
        rows.push({ kind: 'fiber', fiber: f, y, h: row });
        y += row;
      }
    }
  }
  return rows;
}

export const rowsHeight = (rows: CableRow[]) => rows.reduce((a, r) => a + r.h, 0);

/** Portas da bandeja: fibras dos tubos vinculados, à esquerda as dos cabos do lado esquerdo, à direita as demais. */
export function trayPorts(
  tray: SpliceTray,
  cables: { key: string; side: 'left' | 'right'; cable: Pick<Cable, 'fiber_count' | 'fibers_per_tube'> }[],
): { left: { c: string; p: string }[]; right: { c: string; p: string }[] } {
  const left: { c: string; p: string }[] = [];
  const right: { c: string; p: string }[] = [];
  for (const cb of cables) {
    for (let t = 1; t <= tubeCount(cb.cable); t++) {
      if (!tray.tubes.includes(tubeKey(cb.key, t))) continue;
      const [f1, f2] = tubeFibers(t, cb.cable);
      for (let f = f1; f <= f2; f++) (cb.side === 'left' ? left : right).push({ c: cb.key, p: `f${f}` });
    }
  }
  return { left, right };
}
