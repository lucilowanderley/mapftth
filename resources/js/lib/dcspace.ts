import { normalizeRow, rackCode, rowIndex, uid, type Rack } from './pop';
import type { DcSpace, DcSpaceKind, Diagram, RackLocation } from './types';

/**
 * Estrutura do datacenter no editor de POP (ANSI/TIA-606): Prédio/site → Andar → Sala → Fileira → Racks.
 * Cada nível vira um cartão que expande e recolhe; os racks entram só na fileira e o endereço deles
 * (DC1.1A-AJ05) vem dos níveis de cima. Níveis podem ser pulados (ex.: fileira direto no andar).
 */

export const SPACE_KINDS: Record<DcSpaceKind, { label: string; plural: string; level: number; color: string }> = {
  site: { label: 'Prédio', plural: 'prédios', level: 0, color: '#a78bfa' },
  floor: { label: 'Andar', plural: 'andares', level: 1, color: '#38bdf8' },
  room: { label: 'Sala', plural: 'salas', level: 2, color: '#34d399' },
  row: { label: 'Fileira', plural: 'fileiras', level: 3, color: '#fbbf24' },
};

export const SPACE_ORDER: DcSpaceKind[] = ['site', 'floor', 'room', 'row'];

/** Tipos de andar: código TIA-606 sugerido e ordem (level). */
export const FLOOR_TYPES = {
  ground: { label: 'Térreo', numbered: false },
  basement: { label: 'Subsolo', numbered: true },
  floor: { label: 'Piso', numbered: true },
  mezzanine: { label: 'Mezanino', numbered: false },
  roof: { label: 'Cobertura', numbered: false },
} as const;
export type FloorType = keyof typeof FLOOR_TYPES;

/** Código, nome e ordem de um andar pelo tipo e número: Subsolo 2 → S2; Piso 1 → 1; Térreo → T. */
export function floorInfo(type: FloorType, n: number): { code: string; name: string; level: number } {
  switch (type) {
    case 'ground':
      return { code: 'T', name: 'Térreo', level: 0 };
    case 'basement':
      return { code: `S${n}`, name: `Subsolo ${n}`, level: -n };
    case 'mezzanine':
      return { code: 'M', name: 'Mezanino', level: 0.5 };
    case 'roof':
      return { code: 'C', name: 'Cobertura', level: 999 };
    default:
      return { code: String(n), name: `Piso ${String(n).padStart(2, '0')}`, level: n };
  }
}

/** Tipo e número do andar a partir do código (para editar andares já criados ou vindos do endereço antigo). */
export function floorFromCode(code: string): { type: FloorType; n: number } {
  const c = code.trim().toUpperCase();
  if (c === 'T' || c === '0') return { type: 'ground', n: 0 };
  if (c === 'M') return { type: 'mezzanine', n: 0 };
  if (c === 'C') return { type: 'roof', n: 0 };
  const s = /^S(\d+)$/.exec(c);
  if (s) return { type: 'basement', n: Number(s[1]) };
  const n = parseInt(c, 10);
  return { type: 'floor', n: Number.isFinite(n) && n > 0 ? n : 1 };
}

const cleanCode = (k: DcSpaceKind, v: string) => (k === 'row' ? normalizeRow(v) : v.trim().toUpperCase().replace(/\s+/g, ''));
export const tidyCode = cleanCode;

/** Nome curto do espaço: "DC1 · Empresa X", "Piso 01", "Sala A", "Fileira AJ". */
export function spaceTitle(s: DcSpace): string {
  switch (s.kind) {
    case 'site':
      return s.name?.trim() || s.code || 'Prédio';
    case 'floor':
      return s.name?.trim() || (s.code ? `Andar ${s.code}` : 'Andar');
    case 'room':
      return `Sala ${s.code || '?'}${s.name?.trim() ? ` · ${s.name.trim()}` : ''}`;
    case 'row':
      return `Fileira ${s.code || '?'}${s.name?.trim() ? ` · ${s.name.trim()}` : ''}`;
  }
}

const byId = (spaces: DcSpace[]) => new Map(spaces.map((s) => [s.id, s]));

/** Espaço e os de cima, do prédio até ele. */
export function spacePath(spaces: DcSpace[], id?: string | null): DcSpace[] {
  const m = byId(spaces);
  const out: DcSpace[] = [];
  const seen = new Set<string>();
  let cur = id ? m.get(id) : undefined;
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    out.unshift(cur);
    cur = cur.parent ? m.get(cur.parent) : undefined;
  }
  return out;
}

/** Endereço (sem posição) de um espaço, pelos níveis de cima. */
export function spaceLoc(spaces: DcSpace[], id?: string | null): RackLocation {
  const loc: RackLocation = {};
  spacePath(spaces, id).forEach((s) => {
    const k = s.kind === 'site' ? 'site' : s.kind;
    if (s.code) loc[k] = s.code;
  });
  return loc;
}

/** Código do espaço no padrão TIA-606: "DC1", "DC1.1", "DC1.1A", "DC1.1A-AJ". */
export const spaceCode = (spaces: DcSpace[], id: string) => rackCode(spaceLoc(spaces, id));

/** Quem pode ficar dentro de quem: só níveis abaixo (prédio > andar > sala > fileira). */
export const canContain = (parent: DcSpaceKind, child: DcSpaceKind) => SPACE_KINDS[parent].level < SPACE_KINDS[child].level;

/** Filhos diretos, em ordem: andares de cima para baixo, salas e fileiras em ordem alfanumérica. */
export function childrenOf(spaces: DcSpace[], id: string | null): DcSpace[] {
  const natural = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });
  return spaces
    .filter((s) => (s.parent ?? null) === id || (id === null && s.parent && !spaces.some((p) => p.id === s.parent)))
    .sort(
      (a, b) =>
        SPACE_KINDS[a.kind].level - SPACE_KINDS[b.kind].level ||
        (a.kind === 'floor' ? (b.level ?? 0) - (a.level ?? 0) : 0) ||
        (a.kind === 'row' ? rowIndex(a.code) - rowIndex(b.code) : 0) ||
        natural.compare(a.code, b.code) ||
        natural.compare(a.name ?? '', b.name ?? ''),
    );
}

/** Ids do espaço e de tudo que está dentro dele. */
export function descendants(spaces: DcSpace[], id: string): Set<string> {
  const out = new Set<string>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    spaces.forEach((s) => {
      if (s.parent && out.has(s.parent) && !out.has(s.id)) {
        out.add(s.id);
        grew = true;
      }
    });
  }
  return out;
}

const isRack = (c: { kind: string }): c is Rack => c.kind === 'rack';

/** Racks em ordem de posição na fileira. */
export function racksIn(d: Diagram, spaceId: string): Rack[] {
  return d.components
    .filter(isRack)
    .filter((r) => r.space === spaceId)
    .sort((a, b) => (a.loc?.pos ?? 0) - (b.loc?.pos ?? 0) || a.name.localeCompare(b.name, 'pt-BR', { numeric: true }));
}

/** Contagem do que está dentro do espaço (para o cartão recolhido). */
export function spaceStats(d: Diagram, id: string): Record<DcSpaceKind, number> & { racks: number; units: number } {
  const spaces = d.spaces ?? [];
  const ids = descendants(spaces, id);
  const out = { site: 0, floor: 0, room: 0, row: 0, racks: 0, units: 0 };
  spaces.forEach((s) => {
    if (s.id !== id && ids.has(s.id)) out[s.kind]++;
  });
  d.components.filter(isRack).forEach((r) => {
    if (r.space && ids.has(r.space)) {
      out.racks++;
      out.units += r.units;
    }
  });
  return out;
}

/**
 * Atualiza o endereço (loc) dos racks que estão em espaços, a partir dos códigos dos níveis de cima.
 * O rack que usava o código antigo como nome passa a usar o novo. Rack em espaço que não existe mais fica solto.
 */
export function syncRackLocs(d: Diagram): Diagram {
  const spaces = d.spaces ?? [];
  const ids = new Set(spaces.map((s) => s.id));
  return {
    ...d,
    components: d.components.map((c) => {
      if (!isRack(c) || !c.space) return c;
      if (!ids.has(c.space)) {
        const { space: _s, ...rest } = c;
        return rest;
      }
      const loc: RackLocation = { ...spaceLoc(spaces, c.space), pos: c.loc?.pos };
      if (!loc.pos) delete loc.pos;
      const oldCode = rackCode(c.loc);
      const newCode = rackCode(loc);
      return { ...c, loc, name: oldCode && c.name === oldCode && newCode ? newCode : c.name };
    }),
  };
}

/**
 * Racks antigos (endereço digitado) viram a estrutura: cria prédio/andar/sala/fileira pelos códigos
 * e coloca cada rack na sua fileira. Só roda quando o diagrama ainda não tem estrutura.
 */
export function spacesFromLoc(d: Diagram): Diagram {
  if (d.spaces?.length) return d;
  const racks = d.components.filter(isRack).filter((r) => normalizeRow(r.loc?.row));
  if (!racks.length) return d;
  const spaces: DcSpace[] = [];
  const keyed = new Map<string, DcSpace>();
  const x0 = Math.min(...racks.map((r) => r.x));
  const y0 = Math.min(...racks.map((r) => r.y));
  const make = (key: string, kind: DcSpaceKind, code: string, parent: DcSpace | undefined): DcSpace => {
    const hit = keyed.get(key);
    if (hit) return hit;
    const s: DcSpace = { id: uid(), kind, code, parent: parent?.id ?? null, open: !parent, x: x0 + spaces.filter((o) => !o.parent).length * 360, y: y0 };
    if (kind === 'floor') {
      const f = floorFromCode(code);
      const info = floorInfo(f.type, f.n);
      s.level = info.level;
      if (info.code === code) s.name = info.name;
    }
    keyed.set(key, s);
    spaces.push(s);
    return s;
  };
  const where = new Map<string, string>();
  racks.forEach((r) => {
    const l = r.loc!;
    const site = (l.site ?? '').trim().toUpperCase();
    const floor = (l.floor ?? '').trim().toUpperCase();
    const room = (l.room ?? '').trim().toUpperCase();
    let parent: DcSpace | undefined;
    let key = '';
    if (site) parent = make((key = `s:${site}`), 'site', site, parent);
    if (floor) parent = make((key += `|f:${floor}`), 'floor', floor, parent);
    if (room) parent = make((key += `|r:${room}`), 'room', room, parent);
    const row = make(`${key}|w:${normalizeRow(l.row)}`, 'row', normalizeRow(l.row), parent);
    where.set(r.id, row.id);
  });
  return { ...d, spaces, components: d.components.map((c) => (isRack(c) && where.has(c.id) ? { ...c, space: where.get(c.id) } : c)) };
}

/** Rack novo na fileira: endereço dela e a primeira posição livre. */
export function rackLocIn(d: Diagram, spaceId: string): RackLocation {
  const spaces = d.spaces ?? [];
  const base = spaceLoc(spaces, spaceId);
  const used = new Set(d.components.filter(isRack).filter((r) => r.space === spaceId).map((r) => r.loc?.pos ?? 0));
  let pos = 1;
  while (used.has(pos)) pos++;
  return { ...base, pos };
}

/** Lista de fileiras (e outros espaços que aceitam rack) com o caminho, para escolher no diálogo. */
export function rackTargets(spaces: DcSpace[]): { id: string; label: string; code: string }[] {
  return spaces
    .filter((s) => s.kind === 'row')
    .map((s) => ({
      id: s.id,
      code: spaceCode(spaces, s.id),
      label: spacePath(spaces, s.id)
        .map((p) => (p.kind === 'site' ? p.code || spaceTitle(p) : spaceTitle(p)))
        .join(' › '),
    }))
    .sort((a, b) => a.code.localeCompare(b.code, 'pt-BR', { numeric: true }));
}

// ---------- Layout no canvas ----------

/** Medidas dos cartões de espaço (unidades do canvas). */
export const SP = { HEAD: 44, PAD: 18, GAP: 28, CW: 300, CH: 112, EMPTY_H: 70 };

/** Direção em que cada nível expandido arruma o que tem dentro. */
const FLOW: Record<DcSpaceKind, 'down' | 'right'> = { site: 'down', floor: 'right', room: 'down', row: 'right' };

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DcLayout {
  /** Caixa de cada espaço visível (expandido = moldura; recolhido = cartão). */
  boxes: Map<string, Box & { open: boolean }>;
  /** Posição dos racks visíveis dentro das fileiras. */
  rackPos: Map<string, { x: number; y: number }>;
  /** Rack escondido → cartão recolhido que o contém (onde os cabos e cordões dele chegam). */
  hiddenIn: Map<string, string>;
  /** Espaços desenhados, de fora para dentro (molduras atrás). */
  order: string[];
}

/**
 * Calcula a posição de tudo: os espaços soltos ficam em x/y; dentro de um espaço expandido os filhos
 * se arrumam sozinhos (andares um embaixo do outro, salas lado a lado, fileiras empilhadas, racks lado a lado).
 */
export function dcLayout(d: Diagram, rackSize: (r: Rack) => { w: number; h: number }): DcLayout {
  const spaces = d.spaces ?? [];
  const boxes: DcLayout['boxes'] = new Map();
  const rackPos: DcLayout['rackPos'] = new Map();
  const hiddenIn: DcLayout['hiddenIn'] = new Map();
  const order: string[] = [];
  const sizes = new Map<string, { w: number; h: number }>();
  const kids = new Map<string, DcSpace[]>();
  const racks = new Map<string, Rack[]>();
  spaces.forEach((s) => {
    kids.set(s.id, childrenOf(spaces, s.id));
    racks.set(s.id, racksIn(d, s.id));
  });

  type Item = { t: 's'; s: DcSpace } | { t: 'r'; r: Rack };
  const items = (s: DcSpace): Item[] => [...(kids.get(s.id) ?? []).map((k) => ({ t: 's' as const, s: k })), ...(racks.get(s.id) ?? []).map((r) => ({ t: 'r' as const, r }))];
  const itemSize = (it: Item) => (it.t === 's' ? measure(it.s) : rackSize(it.r));

  function measure(s: DcSpace, seen = new Set<string>()): { w: number; h: number } {
    const hit = sizes.get(s.id);
    if (hit) return hit;
    let size = { w: SP.CW, h: SP.CH };
    if (s.open && !seen.has(s.id)) {
      seen.add(s.id);
      const list = items(s);
      const dims = list.map(itemSize);
      let cw = SP.CW - SP.PAD * 2;
      let ch = SP.EMPTY_H;
      if (dims.length) {
        if (FLOW[s.kind] === 'right') {
          cw = dims.reduce((a, b) => a + b.w, 0) + SP.GAP * (dims.length - 1);
          ch = Math.max(...dims.map((b) => b.h));
        } else {
          cw = Math.max(...dims.map((b) => b.w));
          ch = dims.reduce((a, b) => a + b.h, 0) + SP.GAP * (dims.length - 1);
        }
      }
      size = { w: Math.max(SP.CW, cw + SP.PAD * 2), h: SP.HEAD + SP.PAD + ch + SP.PAD };
    }
    sizes.set(s.id, size);
    return size;
  }

  function hide(s: DcSpace, card: string) {
    (racks.get(s.id) ?? []).forEach((r) => hiddenIn.set(r.id, card));
    (kids.get(s.id) ?? []).forEach((k) => hide(k, card));
  }

  function place(s: DcSpace, x: number, y: number) {
    const { w, h } = measure(s);
    boxes.set(s.id, { x, y, w, h, open: !!s.open });
    order.push(s.id);
    if (!s.open) {
      hide(s, s.id);
      return;
    }
    let cx = x + SP.PAD;
    let cy = y + SP.HEAD + SP.PAD;
    items(s).forEach((it) => {
      const sz = itemSize(it);
      if (it.t === 's') place(it.s, cx, cy);
      else rackPos.set(it.r.id, { x: cx, y: cy });
      if (FLOW[s.kind] === 'right') cx += sz.w + SP.GAP;
      else cy += sz.h + SP.GAP;
    });
  }

  childrenOf(spaces, null)
    .filter((s) => !s.parent || !spaces.some((p) => p.id === s.parent))
    .forEach((s) => place(s, s.x, s.y));
  return { boxes, rackPos, hiddenIn, order };
}

/** Novo espaço: código sugerido (próxima fileira/sala) dentro do pai. */
export function suggestCode(spaces: DcSpace[], kind: DcSpaceKind, parent: string | null): string {
  const sibs = spaces.filter((s) => s.kind === kind && (s.parent ?? null) === parent);
  if (kind === 'row') {
    const last = sibs.map((s) => s.code).sort((a, b) => rowIndex(a) - rowIndex(b)).pop();
    if (!last) return 'A';
    let n = rowIndex(last) + 1;
    let out = '';
    while (n > 0) {
      const m = (n - 1) % 26;
      out = String.fromCharCode(65 + m) + out;
      n = Math.floor((n - 1) / 26);
    }
    return out;
  }
  if (kind === 'room') {
    const used = new Set(sibs.map((s) => s.code));
    for (let i = 0; i < 26; i++) if (!used.has(String.fromCharCode(65 + i))) return String.fromCharCode(65 + i);
    return '';
  }
  if (kind === 'site') return `DC${sibs.length + 1}`;
  return '';
}
