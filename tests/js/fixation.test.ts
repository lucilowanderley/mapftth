import { describe, expect, it } from 'vitest';
import { boxNeedsAddress, fixLinks, fixTo, fixationIssue, fixedAddress, fixedOn, nearestHost } from '../../resources/js/lib/fixation';
import type { NetNode } from '../../resources/js/lib/types';

const node = (id: number, type: NetNode['type'], attributes: Record<string, unknown> = {}, lat = 0, lng = 0): NetNode => ({
  id, project_id: 1, type, name: `N${id}`, lat, lng, status: 'planned', notes: null, attributes, diagram: null,
});

describe('fixação de CTO/CEO', () => {
  const pole = node(1, 'pole');
  const street = node(2, 'box', { box_kind: 'underground', box_place: 'external' });
  const wallBox = node(3, 'box', { box_kind: 'wall', box_place: 'internal' });
  const nodes = [pole, street, wallBox];

  it('avisa CTO/CEO sem fixação, mas não outros objetos', () => {
    expect(fixationIssue(node(10, 'cto'), nodes)).toMatch(/Sem fixação/);
    expect(fixationIssue(node(10, 'ceo'), nodes)).toMatch(/Sem fixação/);
    expect(fixationIssue(node(10, 'client'), nodes)).toBeNull();
    expect(fixationIssue(node(10, 'box'), nodes)).toBeNull();
  });

  it('poste e caixa precisam existir no projeto', () => {
    expect(fixationIssue(node(10, 'cto', { fixed_kind: 'pole', fixed_id: 1 }), nodes)).toBeNull();
    expect(fixationIssue(node(10, 'cto', { fixed_kind: 'pole', fixed_id: 99 }), nodes)).toMatch(/poste/);
    expect(fixationIssue(node(10, 'cto', { fixed_kind: 'pole', fixed_id: 2 }), nodes)).toMatch(/poste/); // id de uma caixa
    expect(fixationIssue(node(10, 'cto', { fixed_kind: 'box', fixed_id: 2 }), nodes)).toBeNull();
  });

  it('parede e caixa em imóvel pedem endereço', () => {
    expect(fixationIssue(node(10, 'cto', { fixed_kind: 'wall' }), nodes)).toMatch(/endereço/);
    expect(fixationIssue(node(10, 'cto', { fixed_kind: 'wall', address: 'Rua A, 10' }), nodes)).toBeNull();
    expect(fixationIssue(node(10, 'cto', { fixed_kind: 'box', fixed_id: 3 }), nodes)).toMatch(/endereço/);
    expect(fixationIssue(node(10, 'cto', { fixed_kind: 'box', fixed_id: 3, address: 'Rua B, 5' }), nodes)).toBeNull();
    const withAddr = node(3, 'box', { box_kind: 'wall', address: 'Av. C, 1' });
    const cto = node(10, 'cto', { fixed_kind: 'box', fixed_id: 3 });
    expect(fixationIssue(cto, [withAddr])).toBeNull();
    expect(fixedAddress(cto, [withAddr])).toBe('Av. C, 1');
    expect(boxNeedsAddress({ box_kind: 'underground', box_place: 'external' })).toBe(false);
    expect(boxNeedsAddress({ box_kind: 'underground', box_place: 'internal' })).toBe(true);
    expect(boxNeedsAddress({ box_kind: 'wall' })).toBe(true);
  });

  it('conteúdo da caixa, poste mais próximo e linhas no mapa', () => {
    const a = node(10, 'cto', fixTo(street));
    const b = node(11, 'ceo', fixTo(street));
    const c = node(12, 'cto', fixTo(pole));
    const all = [...nodes, a, b, c];
    expect(fixedOn(street, all).map((n) => n.id)).toEqual([10, 11]);
    expect(fixedOn(pole, all).map((n) => n.id)).toEqual([12]);
    expect(fixLinks(all).map((l) => l.to.id)).toEqual([2, 2, 1]);
    const far = node(20, 'pole', {}, 0.001, 0); // ~110 m
    expect(nearestHost([0.00003, 0], [far, pole])?.id).toBe(1);
    expect(nearestHost([0.0005, 0], [far, pole])).toBeUndefined();
  });
});
