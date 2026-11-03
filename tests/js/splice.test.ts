import { describe, expect, it } from 'vitest';
import { cableLetter, laneSegment, routeOrthogonal, spliceAnchor, textOn } from '../../resources/js/lib/splice';

const isOrthogonal = (pts: { x: number; y: number }[]) =>
  pts.slice(1).every((p, i) => Math.abs(p.x - pts[i].x) < 0.01 || Math.abs(p.y - pts[i].y) < 0.01);

describe('diagrama de fusão: rotas em ângulo reto', () => {
  it('portas alinhadas frente a frente viram uma reta', () => {
    const r = routeOrthogonal([{ id: '1', a: { x: 0, y: 10, dir: 1 }, b: { x: 200, y: 10, dir: -1 } }]);
    expect(r.get('1')).toHaveLength(2);
  });

  it('cada fibra ganha sua pista vertical, sem sobrepor', () => {
    const reqs = Array.from({ length: 6 }, (_, i) => ({
      id: String(i),
      a: { x: 0, y: i * 14, dir: 1 as const },
      b: { x: 300, y: 200 + i * 14, dir: -1 as const },
    }));
    const r = routeOrthogonal(reqs, { gap: 6 });
    const xs = reqs.map((q) => r.get(q.id)![1].x);
    expect(new Set(xs).size).toBe(6);
    const sorted = [...xs].sort((p, q) => p - q);
    sorted.slice(1).forEach((x, i) => expect(x - sorted[i]).toBeGreaterThanOrEqual(6 - 1e-6));
    reqs.forEach((q) => expect(isOrthogonal(r.get(q.id)!)).toBe(true));
    xs.forEach((x) => {
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(300);
    });
  });

  it('portas do mesmo lado: a pista fica além da mais externa', () => {
    const r = routeOrthogonal([{ id: 'x', a: { x: 100, y: 0, dir: 1 }, b: { x: 150, y: 80, dir: 1 } }], { stub: 14 });
    const pts = r.get('x')!;
    expect(pts[1].x).toBeGreaterThanOrEqual(164);
    expect(isOrthogonal(pts)).toBe(true);
  });

  it('portas de costas: rota em 5 trechos, ortogonal', () => {
    const r = routeOrthogonal([{ id: 'y', a: { x: 300, y: 0, dir: 1 }, b: { x: 0, y: 100, dir: -1 } }]);
    const pts = r.get('y')!;
    expect(pts).toHaveLength(6);
    expect(isOrthogonal(pts)).toBe(true);
  });
});

describe('ícone de emenda e rótulos', () => {
  it('fica a distância fixa da porta no primeiro trecho', () => {
    const p = spliceAnchor([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }], 'a', 34);
    expect(p).toMatchObject({ x: 34, y: 0, vertical: false });
    const q = spliceAnchor([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 160, y: 50 }], 'b', 34);
    expect(q.x).toBeCloseTo(130); // trecho de 60: metade
    expect(q.y).toBe(50);
  });

  it('trecho curto: usa o meio do trecho mais longo', () => {
    const p = spliceAnchor([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 200 }, { x: 20, y: 200 }]);
    expect(p).toMatchObject({ x: 10, y: 100, vertical: true });
  });

  it('letras dos cabos e contraste do número', () => {
    expect([0, 1, 25, 26].map(cableLetter)).toEqual(['A', 'B', 'Z', 'AA']);
    expect(textOn('#ffffff')).toBe('#0f172a');
    expect(textOn('#000000')).toBe('#ffffff');
  });
});

describe('ajuste manual e portas giradas', () => {
  it('respeita a pista escolhida pelo usuário', () => {
    const r = routeOrthogonal([{ id: 'm', a: { x: 0, y: 0, dir: 1 }, b: { x: 300, y: 100, dir: -1 }, lane: 77 }]);
    const pts = r.get('m')!;
    expect(pts[1].x).toBe(77);
    expect(laneSegment(pts)).toMatchObject({ x: 77, y1: 0, y2: 100 });
  });

  it('porta virada para cima sai na vertical e continua em ângulo reto', () => {
    const r = routeOrthogonal([{ id: 'v', a: { x: 100, y: 100, dir: 1, vdir: -1 }, b: { x: 300, y: 20, dir: -1 } }], { stub: 14 });
    const pts = r.get('v')!;
    expect(pts[0]).toEqual({ x: 100, y: 100 });
    expect(pts[1]).toMatchObject({ x: 100, y: 86 });
    expect(isOrthogonal(pts)).toBe(true);
  });
});
