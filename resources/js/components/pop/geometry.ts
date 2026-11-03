import { DIO_TRAY } from '../../lib/catalog';
import { activeGroups, portGroupOf } from '../../lib/pop';
import type { DiagramComponent } from '../../lib/types';

/** Medidas dos cards do editor de POP (unidades do canvas, antes do zoom). */
export const G = {
  HEADER: 40,
  CHIPS: 30,
  PAD: 8,
  LABEL: 34,
  PORT: 28,
  GAP: 4,
  ROWGAP: 6,
  FOOT: 22,
  CABLE_W: 184,
  CABLE_H: 104,
};

/** Equipamentos com portas desenhados em vista frontal (o rack tem card próprio). */
export type PopComp = Extract<DiagramComponent, { kind: 'olt' | 'dio' | 'active' }>;
export type RackComp = Extract<DiagramComponent, { kind: 'rack' }>;

/** Medidas do card de rack: altura de cada U e largura da área útil (19"). */
export const RACK = { RU: 22, NUM: 26, INNER: 280, POST: 10, HEADER: 40, FOOT: 22, PAD: 8 };

export function rackSize(r: RackComp): { w: number; h: number } {
  return {
    w: RACK.PAD * 2 + RACK.NUM + RACK.POST * 2 + RACK.INNER,
    h: RACK.HEADER + RACK.PAD * 2 + r.units * RACK.RU + RACK.FOOT + (r.mount === 'floor' ? 10 : 0),
  };
}

/** Topo (y relativo ao card) da U `u` (1 = base). */
export const rackUTop = (r: RackComp, u: number) => RACK.HEADER + RACK.PAD + (r.units - u) * RACK.RU;

/** Tamanho de qualquer card do canvas do POP. */
export const anySize = (c: PopComp | RackComp) => (c.kind === 'rack' ? rackSize(c) : cardSize(c));

const rowW = (cols: number) => cols * (G.PORT + G.GAP) - G.GAP;
const rowsH = (rows: number) => rows * (G.PORT + G.ROWGAP) - G.ROWGAP;

function grid(c: PopComp): { cols: number; rows: number; top: number } {
  switch (c.kind) {
    case 'dio':
      return { cols: DIO_TRAY, rows: Math.max(1, Math.ceil(c.ports / DIO_TRAY)), top: G.HEADER + G.CHIPS + G.PAD };
    case 'olt':
      return { cols: Math.max(c.ports, c.uplinks ?? 0, 8), rows: c.slots + ((c.uplinks ?? 0) > 0 ? 1 : 0), top: G.HEADER + G.PAD };
    case 'active': {
      // Cada grupo de portas começa numa linha nova (12 portas por linha).
      const groups = activeGroups(c);
      const rows = groups.reduce((a, g) => a + Math.max(1, Math.ceil(g.count / ACTIVE_PER_ROW)), 0);
      return { cols: Math.max(c.groups?.length ? 6 : 4, Math.min(Math.max(...groups.map((g) => g.count)), ACTIVE_PER_ROW)), rows: Math.max(1, rows), top: G.HEADER + G.PAD };
    }
  }
}

/** Portas por linha no card do ativo. */
const ACTIVE_PER_ROW = 12;

/** Largura da coluna de rótulos: o ativo com grupos usa rótulos maiores ("SFP+", "Canal DWDM"). */
export const labelW = (c: PopComp) => (c.kind === 'active' && c.groups?.length ? 62 : G.LABEL);

/** Linha inicial de cada grupo de portas do ativo. */
function groupRows(c: Extract<PopComp, { kind: 'active' }>): number[] {
  let r = 0;
  return activeGroups(c).map((g) => {
    const start = r;
    r += Math.max(1, Math.ceil(g.count / ACTIVE_PER_ROW));
    return start;
  });
}

export function cardSize(c: PopComp): { w: number; h: number } {
  const g = grid(c);
  return { w: G.PAD * 2 + labelW(c) + rowW(g.cols), h: g.top + rowsH(g.rows) + G.PAD + G.FOOT };
}

/** Canto superior esquerdo de uma porta, relativo ao card. */
export function portBox(c: PopComp, port: string): { x: number; y: number } {
  const g = grid(c);
  const n = Number(port.slice(1));
  let row = 0;
  let col = 0;
  if (c.kind === 'active') {
    const pg = portGroupOf(c, port);
    const i = (pg?.index ?? n) - 1;
    row = (pg ? groupRows(c)[pg.gi] : 0) + Math.floor(i / ACTIVE_PER_ROW);
    col = i % ACTIVE_PER_ROW;
  } else if (c.kind === 'dio') {
    row = Math.floor((n - 1) / DIO_TRAY);
    col = (n - 1) % DIO_TRAY;
  } else if (port.startsWith('u')) {
    row = c.slots;
    col = n - 1;
  } else {
    row = Math.floor((n - 1) / c.ports);
    col = (n - 1) % c.ports;
  }
  return { x: G.PAD + labelW(c) + col * (G.PORT + G.GAP), y: g.top + row * (G.PORT + G.ROWGAP) };
}

/** Rótulo de cada linha (bandeja, slot, uplink). */
export function rowLabels(c: PopComp): { y: number; label: string }[] {
  const g = grid(c);
  const y = (r: number) => g.top + r * (G.PORT + G.ROWGAP);
  if (c.kind === 'dio') return Array.from({ length: g.rows }, (_, r) => ({ y: y(r), label: `T${r + 1}` }));
  if (c.kind === 'active') {
    const groups = activeGroups(c);
    const starts = groupRows(c);
    return groups.map((gr, i) => ({ y: y(starts[i]), label: gr.type }));
  }
  const rows = Array.from({ length: c.slots }, (_, r) => ({ y: y(r), label: `S${r + 1}` }));
  if ((c.uplinks ?? 0) > 0) rows.push({ y: y(c.slots), label: 'UP' });
  return rows;
}

/** Todas as portas visíveis do card (DIO mostra a frente "b"). */
export function cardPorts(c: PopComp): string[] {
  switch (c.kind) {
    case 'dio':
      return Array.from({ length: c.ports }, (_, i) => `b${i + 1}`);
    case 'active':
      return Array.from({ length: c.ports }, (_, i) => `e${i + 1}`);
    case 'olt':
      return [...Array.from({ length: c.slots * c.ports }, (_, i) => `p${i + 1}`), ...Array.from({ length: c.uplinks ?? 0 }, (_, i) => `u${i + 1}`)];
  }
}

/** Texto legível sobre uma cor de fundo. */
export function textOn(hex: string): string {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#0f172a' : '#ffffff';
}

/** Faixa (no canvas) que um equipamento recolhido ocupa dentro do rack: x, y, largura e altura. */
export function rackStrip(r: RackComp, u: number, h: number): { x: number; y: number; w: number; h: number } {
  const top = Math.min(r.units, u + h - 1);
  const rows = Math.max(1, Math.min(h, top, r.units - u + 1));
  return { x: r.x + RACK.PAD + RACK.NUM + RACK.POST + 1, y: r.y + rackUTop(r, top) + 1, w: RACK.INNER - 2, h: rows * RACK.RU - 2 };
}
