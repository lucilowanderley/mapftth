import { describe, expect, it } from 'vitest';
import { cardPorts, portBox, rowLabels } from '../../resources/js/components/pop/geometry';
import {
  activeCapacity,
  activeGroups,
  activePortLabel,
  lagIssues,
  mgmtLabel,
  portGroupOf,
  portsCapacity,
  pruneLags,
  speedLabel,
  validMgmtHost,
} from '../../resources/js/lib/pop';
import type { DiagramComponent } from '../../resources/js/lib/types';

type Active = Extract<DiagramComponent, { kind: 'active' }>;
const sw: Active = {
  id: 'a', kind: 'active', name: 'SW', type: 'Switch', ports: 28, x: 0, y: 0,
  groups: [{ type: 'RJ45', count: 24, speed: 1 }, { type: 'SFP+', count: 4, speed: 10 }],
};

describe('grupos de portas do ativo', () => {
  it('sem grupos vira um grupo ETH', () => {
    expect(activeGroups({ ports: 8 })).toEqual([{ type: 'ETH', count: 8, speed: null }]);
    expect(activePortLabel({ ports: 8 }, 'e3')).toBe('porta 3');
  });

  it('acha o grupo e o índice da porta', () => {
    expect(portGroupOf(sw, 'e24')).toMatchObject({ gi: 0, index: 24 });
    expect(portGroupOf(sw, 'e25')).toMatchObject({ gi: 1, index: 1 });
    expect(portGroupOf(sw, 'e29')).toBeNull();
    expect(activePortLabel(sw, 'e26')).toBe('SFP+ 2 (10G)');
  });

  it('capacidade total e rótulos de velocidade', () => {
    expect(activeCapacity(sw)).toBe(64);
    expect(speedLabel(0.1)).toBe('100M');
    expect(speedLabel(2.5)).toBe('2,5G');
  });

  it('cada grupo começa numa linha nova do card', () => {
    expect(cardPorts(sw)).toHaveLength(28);
    const rj = portBox(sw, 'e13');
    const sfp = portBox(sw, 'e25');
    expect(sfp.y).toBeGreaterThan(portBox(sw, 'e24').y);
    expect(sfp.x).toBe(portBox(sw, 'e1').x);
    expect(rj.y).toBeGreaterThan(portBox(sw, 'e1').y);
    expect(rowLabels(sw).map((r) => r.label)).toEqual(['RJ45', 'SFP+']);
  });
});

describe('agregação (LAG)', () => {
  it('soma a capacidade e aponta problemas', () => {
    const lag = { id: 'l1', name: 'LAG1', mode: 'lacp' as const, ports: ['e25', 'e26'] };
    expect(portsCapacity(sw, lag.ports)).toBe(20);
    expect(lagIssues({ ...sw, lags: [lag] }, lag)).toEqual([]);
    const mixed = { ...lag, ports: ['e1', 'e25'] };
    expect(lagIssues({ ...sw, lags: [mixed] }, mixed)).toContain('As portas têm capacidades diferentes.');
    const other = { id: 'l2', name: 'LAG2', mode: 'static' as const, ports: ['e26'] };
    expect(lagIssues({ ...sw, lags: [lag, other] }, other).join(' ')).toMatch(/outra agregação: 26/);
  });

  it('remove portas que deixaram de existir', () => {
    expect(pruneLags([{ id: 'l', name: 'L', mode: 'lacp', ports: ['e3', 'e9'] }], 4)).toEqual([{ id: 'l', name: 'L', mode: 'lacp', ports: ['e3'] }]);
    expect(pruneLags([{ id: 'l', name: 'L', mode: 'lacp', ports: ['e9'] }], 4)).toBeUndefined();
  });
});

describe('gerência', () => {
  it('valida IP e monta o endereço', () => {
    expect(validMgmtHost('10.0.0.1')).toBe(true);
    expect(validMgmtHost('192.168.1.10/24')).toBe(true);
    expect(validMgmtHost('2001:db8::1')).toBe(true);
    expect(validMgmtHost('olt-centro.isp.local')).toBe(true);
    expect(validMgmtHost('300.1.1.1')).toBe(false);
    expect(validMgmtHost('10.0.0')).toBe(false);
    expect(mgmtLabel({ ip: '10.0.0.1', port: 22, proto: 'SSH' })).toBe('SSH 10.0.0.1:22');
    expect(mgmtLabel({ ip: '2001:db8::1', port: 443 })).toBe('[2001:db8::1]:443');
    expect(mgmtLabel({})).toBe('');
  });
});

describe('tipos de porta', () => {
  it('lista completa por categoria, com capacidade sugerida', async () => {
    const { PORT_TYPES, PORT_TYPE_SPEED, PORT_TYPE_GROUPS } = await import('../../resources/js/lib/catalog');
    for (const t of ['RJ45', 'ETH 10/100', 'SFP', 'SFP+', 'SFP28', 'QSFP+', 'QSFP28', 'GPON', 'XGS-PON', 'Console', 'Gerência (MGMT)', 'Canal DWDM']) expect(PORT_TYPES).toContain(t);
    expect(new Set(PORT_TYPES).size).toBe(PORT_TYPES.length);
    expect(PORT_TYPE_GROUPS.map((g) => g.label)).toContain('PON');
    expect(PORT_TYPE_SPEED['SFP+']).toBe(10);
    expect(PORT_TYPE_SPEED.GPON).toBe(2.5);
    expect(PORT_TYPE_SPEED['ETH 10/100']).toBe(0.1);
    expect(PORT_TYPE_SPEED.Console).toBeNull();
  });
});
