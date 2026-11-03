import { describe, expect, it } from 'vitest';
import { mergeModels } from '../../resources/js/components/pop/EquipmentCatalog';
import { modelKey } from '../../resources/js/components/pop/dialogs';
import { BUILTIN_EQUIPMENT } from '../../resources/js/lib/catalog';
import {
  carries,
  cleanMgmt,
  formatVlanList,
  ifaceLabel,
  interfacesOf,
  lagPortSets,
  mgmtPath,
  parseVlanList,
  prunePortVlans,
  undeclaredVlans,
  vlanIssues,
  vlanMembers,
  vlanSummary,
  type NetHost,
} from '../../resources/js/lib/netcfg';
import { activePortLabel, lagIssues, portSpeedOf, portsCapacity } from '../../resources/js/lib/pop';
import type { EquipmentModel } from '../../resources/js/lib/types';

const sw: NetHost = {
  kind: 'active',
  ports: 28,
  groups: [{ type: 'RJ45', count: 24, speed: 1 }, { type: 'SFP+', count: 4, speed: 10 }],
  lags: [{ id: 'l1', name: 'Po1', mode: 'lacp', ports: ['e25', 'e26'] }],
};
const olt: NetHost = { kind: 'olt', ports: 16, uplinks: 4, uplink_speed: 10 };

describe('agregação na OLT', () => {
  it('usa os uplinks como portas agregáveis', () => {
    const sets = lagPortSets(olt);
    expect(sets).toHaveLength(1);
    expect(sets[0].label).toBe('Uplinks');
    expect(sets[0].ports.map((p) => p.id)).toEqual(['u1', 'u2', 'u3', 'u4']);
    expect(activePortLabel(olt, 'u2')).toBe('Uplink 2 (10G)');
  });
  it('soma a capacidade dos uplinks e valida velocidades', () => {
    const lag = { id: 'x', name: 'LAG1', mode: 'lacp' as const, ports: ['u1', 'u2'] };
    expect(portsCapacity(olt, lag.ports)).toBe(20);
    expect(lagIssues({ ...olt, lags: [lag] }, lag)).toEqual([]);
    expect(portSpeedOf({ ...olt, uplink_speed: 100 }, 'u1')).toBe(100);
    expect(lagPortSets({ ...olt, uplinks: 0 })).toEqual([]);
  });
});

describe('listas de VLAN', () => {
  it('lê faixas e repetidas', () => {
    expect(parseVlanList('10, 20,100-103; 20 abc 5000 0')).toEqual([10, 20, 100, 101, 102, 103]);
    expect(parseVlanList('30-28')).toEqual([28, 29, 30]);
  });
  it('compacta em faixas', () => {
    expect(formatVlanList([30, 10, 20, 21, 22, 11])).toBe('10, 11, 20-22, 30');
    expect(formatVlanList([])).toBe('');
  });
});

describe('VLAN por interface', () => {
  const host: NetHost = {
    ...sw,
    vlans: [{ id: 10, name: 'CLIENTES' }, { id: 20 }, { id: 99, name: 'GERENCIA' }],
    portVlans: {
      e1: { mode: 'access', pvid: 10 },
      'lag:l1': { mode: 'trunk', pvid: 1, tagged: [10, 20, 99] },
      e2: { mode: 'hybrid', pvid: 20, tagged: [99] },
    },
    mgmt: { ip: '10.0.0.2', iface: 'lag:l1', vlan: 99 },
  };
  it('lista agregações e portas fora delas', () => {
    const keys = interfacesOf(host).map((i) => i.key);
    expect(keys[0]).toBe('lag:l1');
    expect(keys).not.toContain('e25');
    expect(keys).toContain('e27');
    expect(keys).toHaveLength(1 + 26);
    expect(ifaceLabel(host, 'lag:l1')).toBe('Po1');
    expect(ifaceLabel(host, 'mgmt')).toBe('porta MGMT dedicada');
  });
  it('resume e encontra membros', () => {
    expect(vlanSummary(host.portVlans!.e1)).toBe('access 10');
    expect(vlanSummary(host.portVlans!['lag:l1'])).toBe('trunk 10, 20, 99 · nativa 1');
    expect(vlanSummary({ mode: 'trunk', all: true })).toBe('trunk todas');
    expect(carries(host.portVlans!.e2, 20)).toBe('untagged');
    expect(carries(host.portVlans!.e2, 99)).toBe('tagged');
    expect(carries(host.portVlans!.e1, 99)).toBeNull();
    expect(vlanMembers(host, 99).map((m) => m.key).sort()).toEqual(['e2', 'lag:l1']);
  });
  it('avisa VLAN sem cadastro e gerência fora da VLAN', () => {
    expect(undeclaredVlans(host)).toEqual([1]);
    expect(vlanIssues(host)).toEqual(['VLAN usada sem cadastro no equipamento: 1.']);
    const bad = { ...host, mgmt: { ...host.mgmt, iface: 'e1' } };
    expect(vlanIssues(bad).some((m) => m.startsWith('Gerência: a VLAN 99 não passa'))).toBe(true);
    expect(vlanIssues({ ...host, portVlans: { e3: { mode: 'access' } } })).toContain('RJ45 3 (1G): access sem VLAN.');
  });
  it('limpa interfaces que deixaram de existir', () => {
    const pv = prunePortVlans({ ...host, lags: [], portVlans: { ...host.portVlans, e25: { mode: 'access', pvid: 10 }, e40: { mode: 'access', pvid: 10 } } });
    expect(Object.keys(pv!).sort()).toEqual(['e1', 'e2', 'e25']);
    expect(prunePortVlans({ ...sw, portVlans: { 'lag:zz': { mode: 'access', pvid: 1 } } })).toBeUndefined();
  });
  it('gerência: interface, VLAN e texto', () => {
    expect(cleanMgmt(host, { ip: '', iface: 'lag:l1', vlan: 99 })).toEqual({ iface: 'lag:l1', vlan: 99 });
    expect(cleanMgmt(host, { iface: 'lag:sumiu', vlan: 5000 })).toBeUndefined();
    expect(cleanMgmt(host, { iface: 'mgmt' })).toEqual({ iface: 'mgmt' });
    expect(mgmtPath(host)).toBe('via Po1 · VLAN 99');
  });
});

describe('cadastro: padrões editados e excluídos', () => {
  const b = BUILTIN_EQUIPMENT.find((m) => m.kind === 'active')!;
  const b2 = BUILTIN_EQUIPMENT.find((m) => m.kind === 'olt')!;
  const saved: EquipmentModel[] = [
    { ...b, id: 7, builtin: undefined, own: true, model: 'Meu switch', replaces: String(b.id) },
    { ...b2, id: 8, builtin: undefined, own: true, replaces: String(b2.id), hidden: true },
    { id: 9, kind: 'dio', vendor: null, model: 'DIO X', ports: 24, height_u: 1, own: true },
  ];
  it('troca o padrão pela versão editada e oculta o excluído', () => {
    const { models, hidden } = mergeModels(saved);
    expect(models.some((m) => m.builtin && m.id === b.id)).toBe(false);
    expect(models.some((m) => m.builtin && m.id === b2.id)).toBe(false);
    expect(models.find((m) => m.id === 7)?.model).toBe('Meu switch');
    expect(models.some((m) => m.id === 8)).toBe(false);
    expect(hidden.map((m) => m.id)).toEqual([8]);
  });
  it('padrão editado mantém a chave do padrão', () => {
    expect(modelKey(saved[0])).toBe(String(b.id));
    expect(modelKey(saved[2])).toBe('db:9');
  });
});
