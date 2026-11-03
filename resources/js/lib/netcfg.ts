import { activeGroups, activePortLabel, lagOf, type PortHost } from './pop';
import type { MgmtAccess, NetConfig, PortLag, PortVlan, VlanMode } from './types';

/** Configuração de rede de OLTs e ativos: agregações (LAG), VLANs por interface e gerência. */
export type NetHost = PortHost & NetConfig & { mgmt?: MgmtAccess };

export const VLAN_MODES: Record<VlanMode, { label: string; hint: string }> = {
  access: { label: 'Access', hint: 'uma VLAN, sem tag (porta de cliente, servidor, câmera)' },
  trunk: { label: 'Trunk', hint: 'várias VLANs com tag (802.1Q) + VLAN nativa opcional' },
  hybrid: { label: 'Híbrida', hint: 'VLAN sem tag (PVID) e outras com tag na mesma porta' },
};

export const VLAN_MIN = 1;
export const VLAN_MAX = 4094;
export const validVlan = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= VLAN_MIN && (n as number) <= VLAN_MAX;

/** Chave de interface de uma agregação. */
export const lagKey = (l: PortLag) => `lag:${l.id}`;

export interface PortSet {
  label: string;
  ports: { id: string; label: string; index: number }[];
}

/** Portas agregáveis em conjuntos: no ativo, um por grupo de portas; na OLT, os uplinks. */
export function lagPortSets(c: NetHost): PortSet[] {
  if (c.kind === 'olt') {
    const n = c.uplinks ?? 0;
    return n ? [{ label: 'Uplinks', ports: Array.from({ length: n }, (_, i) => ({ id: `u${i + 1}`, label: activePortLabel(c, `u${i + 1}`), index: i + 1 })) }] : [];
  }
  let start = 0;
  return activeGroups(c).map((g) => {
    const ports = Array.from({ length: g.count }, (_, i) => {
      const id = `e${start + i + 1}`;
      return { id, label: activePortLabel(c, id), index: i + 1 };
    });
    start += g.count;
    return { label: c.groups?.length ? g.type : 'Portas', ports };
  });
}

/** Interfaces configuráveis: as agregações e as portas que não estão em agregação. */
export function interfacesOf(c: NetHost): { key: string; label: string; set: string; lag?: PortLag }[] {
  const lags = (c.lags ?? []).map((l) => ({ key: lagKey(l), label: l.name, set: 'Agregações', lag: l }));
  const ports = lagPortSets(c).flatMap((s) => s.ports.filter((p) => !lagOf(c, p.id)).map((p) => ({ key: p.id, label: p.label, set: s.label })));
  return [...lags, ...ports];
}

/** Nome legível de uma interface. */
export function ifaceLabel(c: NetHost, key?: string): string {
  if (!key) return '';
  if (key === 'mgmt') return 'porta MGMT dedicada';
  if (key.startsWith('lag:')) return c.lags?.find((l) => lagKey(l) === key)?.name ?? 'agregação removida';
  return activePortLabel(c, key);
}

/** "10, 20, 100-103" → [10, 20, 100, 101, 102, 103]. Ignora o que for inválido; ordena e tira repetidas. */
export function parseVlanList(s: string): number[] {
  const out = new Set<number>();
  for (const part of s.split(/[,;\s]+/)) {
    const m = part.trim().match(/^(\d+)(?:-(\d+))?$/);
    if (!m) continue;
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    if (!validVlan(a) || !validVlan(b)) continue;
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    if (hi - lo > VLAN_MAX) continue;
    for (let v = lo; v <= hi; v++) out.add(v);
  }
  return [...out].sort((x, y) => x - y);
}

/** [10, 20, 21, 22, 30] → "10, 20-22, 30". */
export function formatVlanList(ids: number[]): string {
  const v = [...new Set(ids)].sort((a, b) => a - b);
  const out: string[] = [];
  for (let i = 0; i < v.length; i++) {
    let j = i;
    while (j + 1 < v.length && v[j + 1] === v[j] + 1) j++;
    out.push(j > i + 1 ? `${v[i]}-${v[j]}` : j === i + 1 ? `${v[i]}, ${v[j]}` : String(v[i]));
    i = j;
  }
  return out.join(', ');
}

/** Resumo da configuração de VLAN de uma interface: "access 10", "trunk 10, 20-22 · nativa 1". */
export function vlanSummary(v?: PortVlan): string {
  if (!v) return '';
  if (v.mode === 'access') return `access ${v.pvid ?? '?'}`;
  const t = v.all ? 'todas' : formatVlanList(v.tagged ?? []) || 'nenhuma';
  return `${v.mode === 'trunk' ? 'trunk' : 'híbrida'} ${t}${v.pvid ? ` · nativa ${v.pvid}` : ''}`;
}

/** A interface leva a VLAN? (sem tag = access/nativa; com tag = trunk/híbrida). */
export function carries(v: PortVlan | undefined, vlan: number): 'untagged' | 'tagged' | null {
  if (!v) return null;
  if (v.pvid === vlan) return 'untagged';
  if (v.mode !== 'access' && (v.all || v.tagged?.includes(vlan))) return 'tagged';
  return null;
}

/** Interfaces por onde passa a VLAN. */
export function vlanMembers(c: NetHost, vlan: number): { key: string; tagged: boolean }[] {
  return Object.entries(c.portVlans ?? {})
    .map(([key, v]) => ({ key, how: carries(v, vlan) }))
    .filter((x) => x.how)
    .map((x) => ({ key: x.key, tagged: x.how === 'tagged' }));
}

/** VLANs usadas nas interfaces (e na gerência) que não foram declaradas no equipamento. */
export function undeclaredVlans(c: NetHost): number[] {
  const declared = new Set((c.vlans ?? []).map((v) => v.id));
  const used = new Set<number>();
  for (const v of Object.values(c.portVlans ?? {})) {
    if (v.pvid) used.add(v.pvid);
    if (v.mode !== 'access' && !v.all) v.tagged?.forEach((t) => used.add(t));
  }
  if (c.mgmt?.vlan) used.add(c.mgmt.vlan);
  return [...used].filter((v) => !declared.has(v)).sort((a, b) => a - b);
}

/** Avisos da configuração de VLAN e gerência. */
export function vlanIssues(c: NetHost): string[] {
  const out: string[] = [];
  const ids = (c.vlans ?? []).map((v) => v.id);
  const dup = ids.filter((v, i) => ids.indexOf(v) !== i);
  if (dup.length) out.push(`VLAN repetida: ${formatVlanList(dup)}.`);
  const und = undeclaredVlans(c);
  if (und.length) out.push(`VLAN usada sem cadastro no equipamento: ${formatVlanList(und)}.`);
  for (const [key, v] of Object.entries(c.portVlans ?? {})) {
    if (v.mode === 'access' && !v.pvid) out.push(`${ifaceLabel(c, key)}: access sem VLAN.`);
    if (v.mode !== 'access' && !v.all && !v.tagged?.length && !v.pvid) out.push(`${ifaceLabel(c, key)}: ${v.mode === 'trunk' ? 'trunk' : 'híbrida'} sem VLANs.`);
  }
  const m = c.mgmt;
  if (m?.iface && m.iface !== 'mgmt' && m.vlan) {
    if (!carries(c.portVlans?.[m.iface], m.vlan)) out.push(`Gerência: a VLAN ${m.vlan} não passa pela interface ${ifaceLabel(c, m.iface)}.`);
  }
  return out;
}

/**
 * Remove VLANs de interfaces que não existem mais (porta além do total, agregação removida,
 * porta que entrou numa agregação: a agregação passa a ter a configuração).
 */
export function prunePortVlans(c: NetHost): Record<string, PortVlan> | undefined {
  const keys = new Set(interfacesOf(c).map((i) => i.key));
  const out: Record<string, PortVlan> = {};
  for (const [k, v] of Object.entries(c.portVlans ?? {})) {
    if (!keys.has(k)) continue;
    const tagged = v.mode === 'access' || v.all ? undefined : (v.tagged ?? []).filter(validVlan);
    out[k] = {
      mode: v.mode,
      ...(validVlan(v.pvid) ? { pvid: v.pvid } : {}),
      ...(tagged?.length ? { tagged } : {}),
      ...(v.mode === 'trunk' && v.all ? { all: true } : {}),
    };
  }
  return Object.keys(out).length ? out : undefined;
}

/** Gerência limpa: sem campos vazios e sem interface que não existe mais. */
export function cleanMgmt(c: NetHost, m: MgmtAccess): MgmtAccess | undefined {
  const keys = new Set(['mgmt', ...interfacesOf(c).map((i) => i.key)]);
  const out: MgmtAccess = {
    ...(m.ip ? { ip: m.ip } : {}),
    ...(m.port ? { port: m.port } : {}),
    ...(m.proto ? { proto: m.proto } : {}),
    ...(m.iface && keys.has(m.iface) ? { iface: m.iface } : {}),
    ...(validVlan(m.vlan) ? { vlan: m.vlan } : {}),
  };
  return Object.keys(out).length ? out : undefined;
}

/** Interface e VLAN de gerência em texto: "via LAG1 · VLAN 99". */
export function mgmtPath(c: NetHost): string {
  const m = c.mgmt;
  if (!m) return '';
  return [m.iface ? `via ${ifaceLabel(c, m.iface)}` : '', m.vlan ? `VLAN ${m.vlan}` : ''].filter(Boolean).join(' · ');
}
