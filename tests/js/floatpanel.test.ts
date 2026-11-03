import { describe, expect, it } from 'vitest';
import { clampPos } from '../../resources/js/lib/floatpanel';

describe('clampPos', () => {
  it('mantém a caixa dentro da área', () => {
    expect(clampPos(100, 50, 200, 100, 1000, 600)).toEqual({ x: 100, y: 50 });
    expect(clampPos(-50, -20, 200, 100, 1000, 600)).toEqual({ x: 8, y: 8 });
    expect(clampPos(950, 590, 200, 100, 1000, 600)).toEqual({ x: 792, y: 492 });
  });
});
