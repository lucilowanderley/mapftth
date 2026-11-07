/**
 * Seleção por retângulo (arrastar o mouse): contas comuns ao mapa e aos editores.
 * Retângulos sempre normalizados (x/y no canto superior esquerdo, w/h positivos).
 */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Retângulo entre dois pontos (em qualquer ordem). */
export function rectFrom(a: { x: number; y: number }, b: { x: number; y: number }): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

/** Arraste pequeno demais é clique, não retângulo. */
export const MARQUEE_MIN = 5;
export const isMarquee = (r: Rect) => r.w + r.h >= MARQUEE_MIN;

export const pointIn = (r: Rect, p: { x: number; y: number }) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

/** O objeto encosta no retângulo (basta uma parte dele dentro). */
export const intersects = (r: Rect, b: Rect) => b.x <= r.x + r.w && b.x + b.w >= r.x && b.y <= r.y + r.h && b.y + b.h >= r.y;

/** Todos os pontos dentro (linhas: cabo, duto, área). */
export const allIn = (r: Rect, pts: { x: number; y: number }[]) => pts.length > 0 && pts.every((p) => pointIn(r, p));

/** Contagem com plural simples em português ("1 CTO", "3 cabos"). */
export function countLabel(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "3 CTO, 2 cabos e 1 duto" (ignora zeros). */
export function joinCounts(parts: string[]): string {
  const list = parts.filter(Boolean);
  if (list.length <= 1) return list.join('');
  return `${list.slice(0, -1).join(', ')} e ${list[list.length - 1]}`;
}
