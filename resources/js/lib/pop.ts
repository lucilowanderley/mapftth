import { DIO_TRAY, splitterModel } from './catalog';
import type { Connection, Diagram, DiagramComponent, End, PortGroup, PortLag, RackLocation } from './types';

/** Funções puras do editor de POP (sem React), usadas também nos testes. */

export const endKey = (e: End) => `${e.c}:${e.p}`;
export const sameEnd = (a: End, b: End) => a.c === b.c && a.p === b.p;
export const isCableKey = (c: string) => /^c\d+$/.test(c);
export const uid = () => `k${Math.random().toString(36).slice(2, 9)}`;

type Comp = DiagramComponent | undefined;

/**
 * Ponta de cordão/patch (conector): porta PON ou uplink de OLT, frente do DIO e portas de equipamento ativo.
 * Ligações entre pontas de cordão não somam perda de fusão.
 */
export function isPatchEnd(comp: Comp, port: string): boolean {
  if (!comp) return false;
  return comp.kind === 'olt' || comp.kind === 'active' || (comp.kind === 'dio' && port.startsWith('b'));
}

export function partner(d: Diagram, e: End): { conn: Connection; other: End } | undefined {
  for (const conn of d.connections) {
    if (sameEnd(conn.a, e)) return { conn, other: conn.b };
    if (sameEnd(conn.b, e)) return { conn, other: conn.a };
  }
  return undefined;
}

export const trays = (ports: number) => Math.max(1, Math.ceil(ports / DIO_TRAY));

/** Rótulo de uma porta de OLT: "S1/P3" ou "UP2". */
export function oltPortLabel(olt: Extract<DiagramComponent, { kind: 'olt' }>, port: string): string {
  const n = Number(port.slice(1));
  if (port.startsWith('u')) return `UP${n}`;
  return `S${Math.floor((n - 1) / olt.ports) + 1}/P${((n - 1) % olt.ports) + 1}`;
}

/** Cabos vinculados ao DIO: lista explícita ou, em diagramas antigos, os cabos já fundidos nele. */
export function linkedCables(d: Diagram, dio: Extract<DiagramComponent, { kind: 'dio' }>): string[] {
  if (dio.cables) return dio.cables;
  const found = new Set<string>();
  for (let n = 1; n <= dio.ports; n++) {
    const src = fusionSource(d, dio.id, n);
    if (src) found.add(src.cable);
  }
  return [...found];
}

export interface FusionSource {
  cable: string;
  fiber: number;
  /** Quando a porta recebe a saída de um splitter. */
  splitter?: { id: string; out: number };
}

/** De onde vem a luz da porta n (lado de fusão) do DIO: fibra de cabo direta ou via splitter. */
export function fusionSource(d: Diagram, dioId: string, n: number): FusionSource | null {
  const link = partner(d, { c: dioId, p: `a${n}` });
  if (!link) return null;
  const o = link.other;
  if (isCableKey(o.c) && o.p.startsWith('f')) return { cable: o.c, fiber: Number(o.p.slice(1)) };
  const comp = d.components.find((c) => c.id === o.c);
  if (comp?.kind === 'splitter' && o.p.startsWith('o')) {
    const input = partner(d, { c: comp.id, p: 'in' });
    if (input && isCableKey(input.other.c)) {
      return { cable: input.other.c, fiber: Number(input.other.p.slice(1)), splitter: { id: comp.id, out: Number(o.p.slice(1)) } };
    }
  }
  return null;
}

/**
 * Auto Fusão do DIO: funde as fibras livres dos cabos vinculados (na ordem) nas portas livres do DIO.
 * Fibras já usadas em qualquer conexão do POP são puladas.
 */
export function autoFuseDio(d: Diagram, dioId: string, cables: { key: string; fibers: number }[]): Connection[] {
  const dio = d.components.find((c) => c.id === dioId);
  if (!dio || dio.kind !== 'dio') return [];
  const used = new Set(d.connections.flatMap((c) => [endKey(c.a), endKey(c.b)]));
  const free: number[] = [];
  for (let n = 1; n <= dio.ports; n++) if (!used.has(`${dioId}:a${n}`)) free.push(n);
  const created: Connection[] = [];
  for (const cable of cables) {
    for (let f = 1; f <= cable.fibers && free.length; f++) {
      if (used.has(`${cable.key}:f${f}`)) continue;
      const n = free.shift()!;
      created.push({ id: uid(), a: { c: cable.key, p: `f${f}` }, b: { c: dioId, p: `a${n}` } });
    }
  }
  return created;
}

/**
 * Auto-Patch: liga cada porta do DIO que já tem fusão (e frente livre) na próxima porta PON livre das OLTs.
 */
export function autoPatch(d: Diagram): Connection[] {
  const used = new Set(d.connections.flatMap((c) => [endKey(c.a), endKey(c.b)]));
  const pons: End[] = [];
  d.components.forEach((c) => {
    if (c.kind !== 'olt') return;
    for (let i = 1; i <= c.slots * c.ports; i++) if (!used.has(`${c.id}:p${i}`)) pons.push({ c: c.id, p: `p${i}` });
  });
  const created: Connection[] = [];
  d.components.forEach((c) => {
    if (c.kind !== 'dio') return;
    for (let n = 1; n <= c.ports && pons.length; n++) {
      if (!used.has(`${c.id}:a${n}`) || used.has(`${c.id}:b${n}`)) continue;
      created.push({ id: uid(), a: pons.shift()!, b: { c: c.id, p: `b${n}` } });
    }
  });
  return created;
}

export interface VflResult {
  ends: Set<string>;
  connections: Set<string>;
  /** Fibras que saem do POP pelo cabo (seguem na rede). */
  exits: { cable: string; fiber: number }[];
}

/**
 * Traço VFL: acende a partir de uma porta e segue fusões, cordões e a passagem interna dos componentes
 * (DIO frente↔fundo, splitter entrada↔saídas, as duas linhas de uma mesma porta de OLT/ativo não se ligam).
 */
export function vflTrace(d: Diagram, start: End): VflResult {
  const comps = new Map(d.components.map((c) => [c.id, c]));
  const ends = new Set<string>();
  const connections = new Set<string>();
  const exits: VflResult['exits'] = [];
  const queue: End[] = [start];
  while (queue.length) {
    const e = queue.shift()!;
    const k = endKey(e);
    if (ends.has(k)) continue;
    ends.add(k);
    const link = partner(d, e);
    if (link) {
      connections.add(link.conn.id);
      queue.push(link.other);
    }
    // Passagem interna do componente.
    if (isCableKey(e.c)) {
      if (!exits.some((x) => x.cable === e.c && `f${x.fiber}` === e.p)) exits.push({ cable: e.c, fiber: Number(e.p.slice(1)) });
      continue;
    }
    const comp = comps.get(e.c);
    if (comp?.kind === 'dio') queue.push({ c: e.c, p: (e.p.startsWith('a') ? 'b' : 'a') + e.p.slice(1) });
    if (comp?.kind === 'splitter') {
      if (e.p === 'in') {
        const n = splitterModel(comp.model).outputs;
        for (let i = 1; i <= n; i++) queue.push({ c: e.c, p: `o${i}` });
      } else queue.push({ c: e.c, p: 'in' });
    }
  }
  return { ends, connections, exits };
}

/** Remove conexões de portas que deixaram de existir (DIO/OLT reduzidos ou excluídos). */
export function pruneConnections(d: Diagram, validCables: Set<string>): Connection[] {
  const comps = new Map(d.components.map((c) => [c.id, c]));
  const valid = (e: End) => {
    if (isCableKey(e.c)) return validCables.has(e.c);
    const c = comps.get(e.c);
    if (!c) return false;
    const n = Number(e.p.slice(1));
    switch (c.kind) {
      case 'dio':
        return n >= 1 && n <= c.ports;
      case 'olt':
        return e.p.startsWith('u') ? n >= 1 && n <= (c.uplinks ?? 0) : n >= 1 && n <= c.slots * c.ports;
      case 'active':
        return n >= 1 && n <= c.ports;
      case 'splitter':
        return e.p === 'in' || (n >= 1 && n <= splitterModel(c.model).outputs);
      case 'rack':
        return false;
    }
  };
  return d.connections.filter((c) => valid(c.a) && valid(c.b));
}

// ---------- Rack ----------

export type Rack = Extract<DiagramComponent, { kind: 'rack' }>;
/** Equipamentos que podem ser instalados em rack. */
export type Rackable = Extract<DiagramComponent, { kind: 'olt' | 'dio' | 'active' }>;

export const isRackable = (c: DiagramComponent): c is Rackable => c.kind === 'olt' || c.kind === 'dio' || c.kind === 'active';

/** Altura típica (em U) de cada equipamento, usada quando o usuário não define outra. */
export function defaultRackHeight(c: Rackable): number {
  switch (c.kind) {
    case 'dio':
      return c.ports <= 24 ? 1 : c.ports <= 48 ? 2 : c.ports <= 72 ? 3 : 4;
    case 'olt':
      return c.slots <= 2 ? Math.max(1, c.slots) : c.slots <= 8 ? 6 : 11;
    case 'active':
      return c.ports <= 52 ? 1 : 2;
  }
}

export const rackHeight = (c: Rackable) => Math.max(1, Math.round(c.h ?? defaultRackHeight(c)));

/** Equipamentos instalados no rack, de cima para baixo. */
export function rackItems(d: Diagram, rackId: string): Rackable[] {
  return d.components
    .filter((c): c is Rackable => isRackable(c) && c.rack === rackId && typeof c.u === 'number')
    .sort((a, b) => b.u! - a.u!);
}

/** U ocupadas no rack. */
export const rackUsed = (d: Diagram, rackId: string) => rackItems(d, rackId).reduce((a, c) => a + rackHeight(c), 0);

/** O intervalo [u, u+h-1] cabe no rack sem sobrepor outro equipamento (ignorando `ignoreId`)? */
export function canMount(d: Diagram, rackId: string, u: number, h: number, ignoreId?: string): boolean {
  const rack = d.components.find((c): c is Rack => c.kind === 'rack' && c.id === rackId);
  if (!rack || !Number.isInteger(u) || u < 1 || h < 1 || u + h - 1 > rack.units) return false;
  return rackItems(d, rackId).every((c) => c.id === ignoreId || u + h - 1 < c.u! || u > c.u! + rackHeight(c) - 1);
}

/** Primeira posição livre para um equipamento de h U, preenchendo o rack de cima para baixo. */
export function firstFreeU(d: Diagram, rackId: string, h: number, ignoreId?: string): number | null {
  const rack = d.components.find((c): c is Rack => c.kind === 'rack' && c.id === rackId);
  if (!rack) return null;
  for (let u = rack.units - h + 1; u >= 1; u--) if (canMount(d, rackId, u, h, ignoreId)) return u;
  return null;
}

/** Equipamentos com posição inválida (fora do rack ou sobrepostos), por exemplo depois de reduzir o rack. */
export function rackConflicts(d: Diagram): Set<string> {
  const bad = new Set<string>();
  d.components.forEach((c) => {
    if (c.kind !== 'rack') return;
    const items = rackItems(d, c.id);
    items.forEach((it) => {
      const h = rackHeight(it);
      if (it.u! < 1 || it.u! + h - 1 > c.units) bad.add(it.id);
      items.forEach((o) => {
        if (o.id !== it.id && !(it.u! + h - 1 < o.u! || it.u! > o.u! + rackHeight(o) - 1)) bad.add(it.id);
      });
    });
  });
  // Equipamento apontando para um rack que não existe mais.
  d.components.forEach((c) => {
    if (isRackable(c) && c.rack && !d.components.some((r) => r.kind === 'rack' && r.id === c.rack)) bad.add(c.id);
  });
  return bad;
}

/** Tira o equipamento do rack (continua no POP, só fica sem posição). */
export function unmount<T extends DiagramComponent>(c: T): T {
  if (!isRackable(c)) return c;
  const { rack: _r, u: _u, ex: _x, ey: _y, ...rest } = c;
  return rest as T;
}

// ---------- Endereçamento de rack (datacenter) ----------

/** Máximo de racks criados de uma vez numa fileira. */
export const MAX_RACK_BATCH = 50;

const clean = (v?: string) => (v ?? '').trim().toUpperCase().replace(/\s+/g, '');

/** Fileira normalizada: só letras (A, B... Z, AA, AB...). */
export const normalizeRow = (v?: string) => clean(v).replace(/[^A-Z]/g, '');

/**
 * Código do rack no estilo ANSI/TIA-606: `site.andarSala-FileiraPosição`, com a posição em 2 dígitos.
 * Ex.: { site: 'DC1', floor: '1', room: 'A', row: 'AJ', pos: 5 } → "DC1.1A-AJ05". Partes vazias são omitidas.
 */
export function rackCode(loc?: RackLocation): string {
  if (!loc) return '';
  const site = clean(loc.site);
  const space = clean(loc.floor) + clean(loc.room);
  const row = normalizeRow(loc.row);
  const pos = loc.pos && loc.pos > 0 ? String(Math.round(loc.pos)).padStart(2, '0') : '';
  const grid = row + pos;
  const head = [site, space].filter(Boolean).join('.');
  return [head, grid].filter(Boolean).join('-');
}

/** Nome para exibir o rack: código de endereçamento (se houver) e o nome, sem repetir. */
export function rackLabel(r: Rack): string {
  const code = rackCode(r.loc);
  if (!code || code === r.name) return r.name;
  return `${code} · ${r.name}`;
}

/** Ordem da fileira: A < B < ... < Z < AA < AB (como colunas de planilha). */
export function rowIndex(row?: string): number {
  const r = normalizeRow(row);
  let n = 0;
  for (const ch of r) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

/** Fileira seguinte: A → B, Z → AA, AZ → BA. */
export function nextRow(row?: string): string {
  let n = rowIndex(row) + 1;
  let out = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    out = String.fromCharCode(65 + m) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

const natural = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });

/** Compara racks pelo endereço (site, andar, sala, fileira, posição) e depois pelo nome. Sem endereço vai para o fim. */
export function compareRacks(a: Rack, b: Rack): number {
  const ha = !!rackCode(a.loc);
  const hb = !!rackCode(b.loc);
  if (ha !== hb) return ha ? -1 : 1;
  const la = a.loc ?? {};
  const lb = b.loc ?? {};
  return (
    natural.compare(clean(la.site), clean(lb.site)) ||
    natural.compare(clean(la.floor), clean(lb.floor)) ||
    natural.compare(clean(la.room), clean(lb.room)) ||
    rowIndex(la.row) - rowIndex(lb.row) ||
    (la.pos ?? 0) - (lb.pos ?? 0) ||
    natural.compare(a.name, b.name)
  );
}

/** Grupo do rack para listas: "DC1 · Andar 1 · Sala A · Fileira AJ". */
export function rackGroup(r: Rack): string {
  const l = r.loc ?? {};
  const parts = [clean(l.site), l.floor?.trim() && `Andar ${clean(l.floor)}`, l.room?.trim() && `Sala ${clean(l.room)}`, normalizeRow(l.row) && `Fileira ${normalizeRow(l.row)}`].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Sem endereço';
}

/** Mesma sala e fileira (ignora a posição). */
const sameRow = (a?: RackLocation, b?: RackLocation) =>
  clean(a?.site) === clean(b?.site) && clean(a?.floor) === clean(b?.floor) && clean(a?.room) === clean(b?.room) && normalizeRow(a?.row) === normalizeRow(b?.row);

/** Primeira posição livre na fileira do endereço `loc` (para sugerir o próximo rack). */
export function nextRackPos(racks: Rack[], loc: RackLocation, ignoreId?: string): number {
  const used = new Set(racks.filter((r) => r.id !== ignoreId && sameRow(r.loc, loc)).map((r) => r.loc?.pos ?? 0));
  let p = 1;
  while (used.has(p)) p++;
  return p;
}

/** Racks que repetem o mesmo código de endereçamento (mesmo lugar no datacenter). */
export function duplicateRackCodes(racks: Rack[]): Set<string> {
  const seen = new Map<string, number>();
  racks.forEach((r) => {
    const c = rackCode(r.loc);
    if (c) seen.set(c, (seen.get(c) ?? 0) + 1);
  });
  return new Set([...seen].filter(([, n]) => n > 1).map(([c]) => c));
}

/** Procura racks por código ou nome (sem diferenciar maiúsculas, espaços e pontuação). */
export function searchRacks(racks: Rack[], q: string): Rack[] {
  const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const k = norm(q);
  if (!k) return [...racks].sort(compareRacks);
  return racks.filter((r) => norm(rackCode(r.loc)).includes(k) || norm(r.name).includes(k)).sort(compareRacks);
}

// ---------- Grupos de portas, agregação (LAG) e gerência dos ativos ----------

type Active = Extract<DiagramComponent, { kind: 'active' }>;

/** Grupos de portas do ativo; sem grupos cadastrados, todas as portas formam um grupo "ETH". */
export function activeGroups(c: Pick<Active, 'ports' | 'groups'>): PortGroup[] {
  const g = (c.groups ?? []).filter((x) => x.count > 0);
  return g.length ? g : [{ type: 'ETH', count: c.ports, speed: null }];
}

/** Total de portas dos grupos. */
export const groupsTotal = (groups: PortGroup[]) => groups.reduce((a, g) => a + Math.max(0, Math.round(g.count) || 0), 0);

/** Grupo da porta "eN" e a posição dela dentro do grupo (1..count). */
export function portGroupOf(c: Pick<Active, 'ports' | 'groups'>, port: string): { group: PortGroup; gi: number; index: number } | null {
  const n = Number(port.slice(1));
  if (!Number.isInteger(n) || n < 1) return null;
  let start = 0;
  const groups = activeGroups(c);
  for (let gi = 0; gi < groups.length; gi++) {
    if (n <= start + groups[gi].count) return { group: groups[gi], gi, index: n - start };
    start += groups[gi].count;
  }
  return null;
}

/** Capacidade em texto: 0.1 → "100M", 1 → "1G", 2.5 → "2,5G", 100 → "100G". */
export function speedLabel(gbps?: number | null): string {
  if (!gbps) return '';
  if (gbps < 1) return `${Math.round(gbps * 1000)}M`;
  return `${String(gbps).replace('.', ',')}G`;
}

/** Nome legível da porta: "SFP+ 3 (10G)" ou "porta 5" quando não há grupos. */
export function activePortLabel(c: PortHost, port: string): string {
  if (port.startsWith('u')) {
    const sp = speedLabel(portSpeedOf(c, port));
    return `Uplink ${port.slice(1)}${sp ? ` (${sp})` : ''}`;
  }
  const pg = portGroupOf(c, port);
  if (!pg || !c.groups?.length) return `porta ${port.slice(1)}`;
  const sp = speedLabel(pg.group.speed);
  return `${pg.group.type} ${pg.index}${sp ? ` (${sp})` : ''}`;
}

/** Capacidade total (Gbps) das portas informadas. */
export function portsCapacity(c: PortHost, ports: string[]): number {
  return ports.reduce((a, p) => a + (portSpeedOf(c, p) ?? 0), 0);
}

/** Equipamento com portas agregáveis: ativo (portas "eN") ou OLT (uplinks "uN"). */
export type PortHost = { kind?: 'olt' | 'active'; ports: number; groups?: PortGroup[]; uplinks?: number; uplink_speed?: number; lags?: PortLag[] };

/** Velocidade padrão dos uplinks da OLT (Gbps). */
export const OLT_UPLINK_SPEED = 10;

/** Capacidade (Gbps) de uma porta: uplink da OLT ou porta do ativo (pelo grupo). */
export function portSpeedOf(c: PortHost, port: string): number | null {
  if (port.startsWith('u')) return c.uplink_speed ?? OLT_UPLINK_SPEED;
  if (c.kind === 'olt') return 2.5;
  return portGroupOf(c, port)?.group.speed ?? null;
}

/** Capacidade total do ativo por soma das portas (Gbps). */
export const activeCapacity = (c: Pick<Active, 'ports' | 'groups'>) => activeGroups(c).reduce((a, g) => a + g.count * (g.speed ?? 0), 0);

/** LAG de que a porta faz parte (se houver). */
export const lagOf = (c: { lags?: PortLag[] }, port: string): PortLag | undefined => c.lags?.find((l) => l.ports.includes(port));

/**
 * Problemas de uma agregação: portas de capacidades diferentes ou de outro LAG.
 * Agregação de portas com velocidades diferentes não sobe na maioria dos equipamentos.
 */
export function lagIssues(c: PortHost, lag: PortLag): string[] {
  const out: string[] = [];
  if (lag.ports.length < 2) out.push('Escolha ao menos 2 portas.');
  const speeds = new Set(lag.ports.map((p) => portSpeedOf(c, p)));
  if (speeds.size > 1) out.push('As portas têm capacidades diferentes.');
  const taken = lag.ports.filter((p) => c.lags?.some((o) => o.id !== lag.id && o.ports.includes(p)));
  if (taken.length) out.push(`Porta(s) já em outra agregação: ${taken.map((p) => p.slice(1)).join(', ')}.`);
  return out;
}

/** Remove das agregações portas que não existem mais e agregações que ficaram vazias. */
export function pruneLags(lags: PortLag[] | undefined, ports: number): PortLag[] | undefined {
  if (!lags?.length) return undefined;
  const kept = lags.map((l) => ({ ...l, ports: l.ports.filter((p) => Number(p.slice(1)) <= ports) })).filter((l) => l.ports.length > 0);
  return kept.length ? kept : undefined;
}

/** IPv4 (com ou sem /máscara) ou IPv6 simples, ou nome de host. */
export function validMgmtHost(v: string): boolean {
  const s = v.trim();
  if (!s) return true;
  const v4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}(\/([0-9]|[12]\d|3[0-2]))?$/;
  const v6 = /^[0-9a-fA-F:]+(\/\d{1,3})?$/;
  const host = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/;
  return v4.test(s) || (s.includes(':') && v6.test(s)) || (!/^[\d.]+$/.test(s) && host.test(s));
}

/** Endereço de gerência em texto: "SSH 10.0.0.1:22". */
export function mgmtLabel(m?: { ip?: string; port?: number; proto?: string }): string {
  if (!m?.ip) return '';
  const host = m.ip.includes(':') && m.port ? `[${m.ip}]` : m.ip;
  return `${m.proto ? `${m.proto} ` : ''}${host}${m.port ? `:${m.port}` : ''}`;
}
