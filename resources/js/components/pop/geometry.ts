import { DIO_TRAY } from '../../lib/catalog';
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
export const RACK = { RU: 16, NUM: 26, INNER: 210, POST: 10, HEADER: 40, FOOT: 22, PAD: 8 };

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
    case 'active':
      return { cols: Math.max(4, Math.min(c.ports, 12)), rows: Math.max(1, Math.ceil(c.ports / 12)), top: G.HEADER + G.PAD };
  }
}

export function cardSize(c: PopComp): { w: number; h: number } {
  const g = grid(c);
  return { w: G.PAD * 2 + G.LABEL + rowW(g.cols), h: g.top + rowsH(g.rows) + G.PAD + G.FOOT };
}

/** Canto superior esquerdo de uma porta, relativo ao card. */
export function portBox(c: PopComp, port: string): { x: number; y: number } {
  const g = grid(c);
  const n = Number(port.slice(1));
  let row = 0;
  let col = 0;
  if (c.kind === 'dio' || c.kind === 'active') {
    const per = c.kind === 'dio' ? DIO_TRAY : 12;
    row = Math.floor((n - 1) / per);
    col = (n - 1) % per;
  } else if (port.startsWith('u')) {
    row = c.slots;
    col = n - 1;
  } else {
    row = Math.floor((n - 1) / c.ports);
    col = (n - 1) % c.ports;
  }
  return { x: G.PAD + G.LABEL + col * (G.PORT + G.GAP), y: g.top + row * (G.PORT + G.ROWGAP) };
}

/** Rótulo de cada linha (bandeja, slot, uplink). */
export function rowLabels(c: PopComp): { y: number; label: string }[] {
  const g = grid(c);
  const y = (r: number) => g.top + r * (G.PORT + G.ROWGAP);
  if (c.kind === 'dio') return Array.from({ length: g.rows }, (_, r) => ({ y: y(r), label: `T${r + 1}` }));
  if (c.kind === 'active') return Array.from({ length: g.rows }, (_, r) => ({ y: y(r), label: r === 0 ? 'ETH' : '' }));
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
