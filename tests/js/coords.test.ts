import { describe, expect, it } from 'vitest';
import { formatCoord, parseDegrees, parseLatLng, parsePair } from '../../resources/js/lib/coords';

describe('coordenadas', () => {
  it('lê graus decimais com ponto ou vírgula', () => {
    expect(parseDegrees('-8.0476')).toBeCloseTo(-8.0476);
    expect(parseDegrees('-34,877')).toBeCloseTo(-34.877);
    expect(parseDegrees('+2.5')).toBe(2.5);
  });

  it('lê graus, minutos e segundos com hemisfério', () => {
    expect(parseDegrees(`8°03'12.5"S`)).toBeCloseTo(-(8 + 3 / 60 + 12.5 / 3600), 6);
    expect(parseDegrees('34 52 30 W')).toBeCloseTo(-34.875, 6);
    expect(parseDegrees('34°52\'30" O')).toBeCloseTo(-34.875, 6);
    expect(parseDegrees('10°30\' L')).toBeCloseTo(10.5, 6);
    expect(parseDegrees('8°61\'S')).toBeNull();
    expect(parseDegrees('abc')).toBeNull();
  });

  it('valida limites', () => {
    expect(parseLatLng('-8.05', '-34.9')).toEqual([-8.05, -34.9]);
    expect(parseLatLng('95', '0')).toBe('Latitude deve estar entre -90 e 90');
    expect(parseLatLng('0', 'x')).toBe('Longitude inválida');
  });

  it('interpreta um par colado do Google Maps', () => {
    expect(parsePair('-8.0476, -34.8770')).toEqual([-8.0476, -34.877]);
    expect(parsePair('-8,0476; -34,8770')).toEqual([-8.0476, -34.877]);
    const gms = parsePair(`8°03'12.5"S 34°52'30"W`)!;
    expect(gms[0]).toBeCloseTo(-8.0535, 3);
    expect(gms[1]).toBeCloseTo(-34.875, 3);
    expect(parsePair('-8.0476')).toBeNull();
  });

  it('formata sem zeros à direita', () => {
    expect(formatCoord(-8.05)).toBe('-8.05');
    expect(formatCoord(-34.123456789)).toBe('-34.1234568');
  });
});

import { movePath } from '../../resources/js/lib/move';
import type { Cable, LatLng } from '../../resources/js/lib/types';

const cab = (path: LatLng[], from: number | null, to: number | null): Cable => ({
  id: 1, project_id: 1, name: 'C', category: 'distribution', model: null, fiber_count: 12, fibers_per_tube: 12,
  status: 'planned', color: '#000', width: 3, line_style: null, path, from_node_id: from, to_node_id: to, slack_m: 0, length_m: 0, notes: null,
});

describe('mover objeto', () => {
  it('leva junto as pontas ligadas e os vértices que passam pelo objeto', () => {
    const c = cab([[0, 0], [1, 1], [2, 2]], 5, 6);
    expect(movePath(c, 6, [2, 2], [3, 3])).toEqual([[0, 0], [1, 1], [3, 3]]);
    expect(movePath(c, 9, [1, 1], [1.5, 1])).toEqual([[0, 0], [1.5, 1], [2, 2]]);
  });

  it('não mexe em pontas ligadas a outro objeto nem em cabos sem relação', () => {
    const c = cab([[0, 0], [2, 2]], 5, null);
    expect(movePath(c, 9, [0, 0], [1, 1])).toBe(c.path);
    expect(movePath(c, 9, [7, 7], [1, 1])).toBe(c.path);
  });
});
