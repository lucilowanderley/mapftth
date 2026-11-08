import { BOX_TYPES, CABLE_MODELS, SPLITTER_MODELS, equipmentLabel, splitterModel } from './catalog';
import { DUCT_MATERIALS, DUCT_PLACEMENTS, ductsOfCable } from './duct';
import { cablesNear } from './analysis';
import { isPatchEnd } from './pop';
import type { Duct, DuctPlacement, EquipmentModel, Network, NodeType, PriceCategory, PriceItem, ProjectBudget, Status } from './types';

/** Categorias do cadastro de preços e do orçamento, na ordem em que aparecem. */
export const PRICE_CATEGORIES: Record<PriceCategory, { label: string; hint: string }> = {
  active: { label: 'Ativos', hint: 'OLT, switches, roteadores, câmeras e outros equipamentos ativos' },
  passive: { label: 'Passivos', hint: 'DIO, splitters, racks e outros componentes passivos' },
  cable: { label: 'Cabos', hint: 'Cabos ópticos e drop, por metro' },
  box: { label: 'Caixas', hint: 'CTO, CEO e caixas de passagem/parede' },
  pole: { label: 'Postes e ferragens', hint: 'Postes, kits de fixação e suportes de reserva' },
  duct: { label: 'Dutos', hint: 'Dutos e subdutos, por metro' },
  launch: { label: 'Lançamento', hint: 'Lançamento de cabos e instalação de dutos, por metro' },
  labor: { label: 'Mão de obra', hint: 'Fusões, instalações e serviços' },
  other: { label: 'Outros', hint: 'Itens avulsos e despesas gerais' },
};
export const PRICE_CATEGORY_LIST = Object.keys(PRICE_CATEGORIES) as PriceCategory[];

/** Unidades sugeridas ao cadastrar um item. */
export const PRICE_UNITS = ['un', 'm', 'km', 'h', 'dia', 'mês', 'kit', 'cj', 'vb', 'kg'];

/** Item padrão do cadastro: ligado às quantidades calculadas da rede pela chave. */
export interface PriceDef {
  key: string;
  category: PriceCategory;
  name: string;
  unit: string;
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const formatBRL = (v: number) => brl.format(Number.isFinite(v) ? v : 0);
/** Quantidade com até 2 casas (metros) ou inteira. */
export const formatQty = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

const STATIC_CABLE_FIBERS = [...new Set(CABLE_MODELS.filter((m) => m.category !== 'drop').map((m) => m.fibers))];
const STATIC_DROP_FIBERS = [...new Set(CABLE_MODELS.filter((m) => m.category === 'drop').map((m) => m.fibers))];
const STATIC_DUCTS: [Duct['material'], number, number][] = [
  ['pead', 40, 0],
  ['pead', 50, 0],
  ['pead', 40, 3],
  ['corrugated', 40, 0],
  ['pvc', 100, 0],
];
const STATIC_RACKS = [12, 24, 44];

export const cableDef = (fibers: number, drop: boolean): PriceDef =>
  drop
    ? { key: `cable:drop:${fibers}`, category: 'cable', name: `Cabo drop ${fibers}FO`, unit: 'm' }
    : { key: `cable:${fibers}`, category: 'cable', name: `Cabo óptico ${fibers}FO`, unit: 'm' };

export const ductDef = (material: Duct['material'], diameter: number, subducts: number): PriceDef => ({
  key: `duct:${material}:${diameter}:${subducts}`,
  category: 'duct',
  name: `Duto ${DUCT_MATERIALS[material]?.label ?? material} ${diameter} mm${subducts ? ` com ${subducts} subdutos` : ''}`,
  unit: 'm',
});

export const rackDef = (units: number): PriceDef => ({ key: `rack:${units}`, category: 'passive', name: `Rack ${units}U`, unit: 'un' });

/** Chave do modelo de equipamento (mesma usada nos equipamentos do POP). */
export const equipmentKey = (m: EquipmentModel) => `equip:${m.builtin ? String(m.id) : m.replaces ? m.replaces : `db:${m.id}`}`;

export const equipmentDef = (m: EquipmentModel): PriceDef => ({
  key: equipmentKey(m),
  category: m.kind === 'dio' ? 'passive' : 'active',
  name: `${m.kind === 'olt' ? 'OLT ' : ''}${equipmentLabel(m)}`,
  unit: 'un',
});

const GENERIC_EQUIPMENT: Record<'olt' | 'dio' | 'active', PriceDef> = {
  olt: { key: 'equip:generic:olt', category: 'active', name: 'OLT sem modelo do cadastro', unit: 'un' },
  dio: { key: 'equip:generic:dio', category: 'passive', name: 'DIO sem modelo do cadastro', unit: 'un' },
  active: { key: 'equip:generic:active', category: 'active', name: 'Ativo sem modelo do cadastro', unit: 'un' },
};

const DUCT_INSTALL: Record<DuctPlacement, string> = {
  buried: 'Abertura de vala e instalação de duto',
  directional: 'Perfuração direcional (MND) com duto',
  surface: 'Instalação de duto aparente',
};

/** Itens fixos: caixas, postes, lançamento e mão de obra. */
export const FIXED_PRICES: PriceDef[] = [
  { key: 'node:camera', category: 'active', name: 'Câmera', unit: 'un' },
  { key: 'node:cto', category: 'box', name: 'CTO (caixa de terminação óptica)', unit: 'un' },
  { key: 'node:ceo', category: 'box', name: 'CEO (caixa de emenda óptica)', unit: 'un' },
  { key: 'node:box', category: 'box', name: 'Caixa de passagem / parede', unit: 'un' },
  { key: 'node:pole', category: 'pole', name: 'Poste', unit: 'un' },
  { key: 'material:pole_hardware', category: 'pole', name: 'Kit de ferragens de fixação (poste com cabo)', unit: 'kit' },
  { key: 'material:slack_support', category: 'pole', name: 'Suporte de reserva técnica', unit: 'un' },
  { key: 'launch:aerial', category: 'launch', name: 'Lançamento de cabo aéreo', unit: 'm' },
  { key: 'launch:underground', category: 'launch', name: 'Lançamento de cabo subterrâneo (em duto)', unit: 'm' },
  { key: 'launch:drop', category: 'launch', name: 'Lançamento de cabo drop', unit: 'm' },
  ...(Object.keys(DUCT_INSTALL) as DuctPlacement[]).map((p): PriceDef => ({ key: `launch:duct:${p}`, category: 'launch', name: DUCT_INSTALL[p], unit: 'm' })),
  { key: 'labor:fusion', category: 'labor', name: 'Fusão de fibra', unit: 'un' },
  { key: 'labor:install:cto', category: 'labor', name: 'Instalação de CTO', unit: 'un' },
  { key: 'labor:install:ceo', category: 'labor', name: 'Instalação de CEO', unit: 'un' },
  { key: 'labor:install:box', category: 'labor', name: 'Instalação de caixa de passagem / parede', unit: 'un' },
  { key: 'labor:install:pole', category: 'labor', name: 'Implantação de poste', unit: 'un' },
  { key: 'labor:equipment', category: 'labor', name: 'Instalação de equipamento em rack', unit: 'un' },
  { key: 'labor:client', category: 'labor', name: 'Instalação e ativação de cliente', unit: 'un' },
  { key: 'labor:hour', category: 'labor', name: 'Hora técnica', unit: 'h' },
  { key: 'other:pop', category: 'other', name: 'Estrutura de POP (abrigo / armário)', unit: 'un' },
  { key: 'other:tower', category: 'other', name: 'Torre', unit: 'un' },
];

/** Todos os itens padrão do cadastro (com os modelos de equipamento cadastrados). */
export function builtinPrices(models: EquipmentModel[] = []): PriceDef[] {
  return [
    ...models.filter((m) => m.kind !== 'dio').map(equipmentDef),
    GENERIC_EQUIPMENT.olt,
    GENERIC_EQUIPMENT.active,
    ...models.filter((m) => m.kind === 'dio').map(equipmentDef),
    GENERIC_EQUIPMENT.dio,
    ...SPLITTER_MODELS.map((s): PriceDef => ({ key: `splitter:${s.id}`, category: 'passive', name: `Splitter ${s.name}`, unit: 'un' })),
    ...STATIC_RACKS.map(rackDef),
    ...STATIC_CABLE_FIBERS.map((f) => cableDef(f, false)),
    ...STATIC_DROP_FIBERS.map((f) => cableDef(f, true)),
    ...STATIC_DUCTS.map(([m, d, s]) => ductDef(m, d, s)),
    ...FIXED_PRICES,
  ];
}

/** Linha do cadastro na tela: item padrão e/ou preço gravado. */
export interface PriceRow extends PriceDef {
  price: number;
  /** Item gravado (preço do padrão ou item avulso). */
  saved?: PriceItem;
  builtin: boolean;
}

/** Junta os itens padrão (e os que aparecem na rede) com os preços gravados. */
export function mergePrices(defs: PriceDef[], saved: PriceItem[]): PriceRow[] {
  const byKey = new Map(saved.filter((s) => s.key).map((s) => [s.key as string, s]));
  const seen = new Set<string>();
  const rows: PriceRow[] = [];
  defs.forEach((d) => {
    if (seen.has(d.key)) return;
    seen.add(d.key);
    const s = byKey.get(d.key);
    rows.push({ ...d, price: s?.price ?? 0, saved: s, builtin: true });
  });
  // Preços de itens padrão que não estão na lista atual (modelo excluído, cabo de outro projeto...).
  saved.forEach((s) => {
    if (s.key && seen.has(s.key)) return;
    if (s.key) seen.add(s.key);
    rows.push({ key: s.key ?? `item:${s.id}`, category: s.category, name: s.name, unit: s.unit, price: s.price, saved: s, builtin: !!s.key });
  });
  return rows;
}

// ---------------- Quantitativos ----------------

/** Quantidade calculada da rede para um item do cadastro. */
export interface QtyLine extends PriceDef {
  qty: number;
}

const PENDING: Status[] = ['planned', 'not_deployed'];

/** Quantitativos da rede (tudo, ou só o que falta implantar: em projeto e não implantado). */
export function networkQuantities(net: Network, ducts: Duct[] = [], scope: ProjectBudget['scope'] = 'all'): QtyLine[] {
  const take = (s: Status) => scope !== 'pending' || PENDING.includes(s);
  const lines = new Map<string, QtyLine>();
  const add = (def: PriceDef, qty: number) => {
    if (!(qty > 0)) return;
    const l = lines.get(def.key) ?? { ...def, qty: 0 };
    l.qty += qty;
    lines.set(def.key, l);
  };
  const fixed = (key: string) => FIXED_PRICES.find((f) => f.key === key)!;

  const nodes = net.nodes.filter((n) => take(n.status));
  const byType = (t: NodeType) => nodes.filter((n) => n.type === t).length;
  (['cto', 'ceo', 'box', 'pole', 'camera'] as NodeType[]).forEach((t) => add(fixed(`node:${t}`), byType(t)));
  (['cto', 'ceo', 'box', 'pole'] as NodeType[]).forEach((t) => add(fixed(`labor:install:${t}`), byType(t)));
  add(fixed('labor:client'), byType('client'));
  add(fixed('other:pop'), byType('pop'));
  add(fixed('other:tower'), byType('tower'));

  let equipment = 0;
  nodes.forEach((n) => {
    const comps = n.diagram?.components ?? [];
    const byId = new Map(comps.map((c) => [c.id, c]));
    comps.forEach((c) => {
      if (c.kind === 'splitter') {
        const s = splitterModel(c.model);
        add({ key: `splitter:${s.id}`, category: 'passive', name: `Splitter ${s.name}`, unit: 'un' }, 1);
      } else if (c.kind === 'olt' || c.kind === 'dio' || c.kind === 'active') {
        equipment++;
        if (c.model && c.model !== 'custom') {
          const name = [c.vendor, c.modelName].filter(Boolean).join(' ') || c.name;
          add({ key: `equip:${c.model}`, category: c.kind === 'dio' ? 'passive' : 'active', name: `${c.kind === 'olt' ? 'OLT ' : ''}${name}`, unit: 'un' }, 1);
        } else add(GENERIC_EQUIPMENT[c.kind], 1);
      } else if (c.kind === 'rack') add(rackDef(c.units), 1);
    });
    if (BOX_TYPES.includes(n.type)) {
      const isPatch = (e: { c: string; p: string }) => isPatchEnd(byId.get(e.c), e.p);
      add(fixed('labor:fusion'), (n.diagram?.connections ?? []).filter((k) => !k.pass && !isPatch(k.a) && !isPatch(k.b)).length);
    }
  });
  add(fixed('labor:equipment'), equipment);

  const cables = net.cables.filter((c) => take(c.status));
  cables.forEach((c) => {
    const drop = c.category === 'drop';
    const slacks = c.slacks ?? [];
    const slackAerial = slacks.length ? slacks.filter((s) => s.kind === 'aerial').reduce((a, s) => a + s.length_m, 0) : c.slack_m;
    const slackUnder = slacks.filter((s) => s.kind === 'underground').reduce((a, s) => a + s.length_m, 0);
    add(cableDef(c.fiber_count, drop), c.length_m + slackAerial + slackUnder);
    if (drop) return add(fixed('launch:drop'), c.length_m + slackAerial + slackUnder);
    // Trecho em duto: até a soma dos dutos por onde o cabo passa (o resto é aéreo).
    const under = Math.min(c.length_m, ductsOfCable(c, ducts).reduce((a, d) => a + d.length_m, 0));
    add(fixed('launch:underground'), under + slackUnder);
    add(fixed('launch:aerial'), c.length_m - under + slackAerial);
  });
  add(fixed('material:slack_support'), cables.reduce((a, c) => a + (c.slacks ?? []).filter((s) => s.kind === 'aerial').length, 0));
  // Ferragens: postes com pelo menos um cabo apoiado (a até 3 m), mesmo os postes já existentes.
  const aerial = cables.filter((c) => !ductsOfCable(c, ducts).length);
  add(fixed('material:pole_hardware'), aerial.length ? net.nodes.filter((n) => n.type === 'pole' && cablesNear([n.lat, n.lng], aerial).length).length : 0);

  ducts
    .filter((d) => take(d.status))
    .forEach((d) => {
      add(ductDef(d.material, d.diameter_mm, d.subducts), d.length_m);
      add(fixed(`launch:duct:${DUCT_PLACEMENTS[d.placement] ? d.placement : 'buried'}`), d.length_m);
    });

  // Metros com até 1 casa (evita 1234,5678 m).
  return [...lines.values()].map((l) => ({ ...l, qty: l.unit === 'm' ? Math.round(l.qty * 10) / 10 : l.qty }));
}

// ---------------- Orçamento ----------------

export const EMPTY_BUDGET: ProjectBudget = { bdi_pct: 0, discount_pct: 0, scope: 'all', notes: null, overrides: {}, hidden: [], extras: [] };

export interface BudgetLine extends PriceDef {
  /** Quantidade calculada da rede (null = item extra, digitado). */
  auto: number | null;
  qty: number;
  price: number;
  total: number;
  /** Id do item extra (para editar/remover). */
  extraId?: string;
  /** Item com quantidade ajustada à mão. */
  overridden: boolean;
}

export interface BudgetSummary {
  lines: BudgetLine[];
  byCategory: { category: PriceCategory; total: number; lines: BudgetLine[] }[];
  subtotal: number;
  bdi: number;
  discount: number;
  total: number;
  /** Linhas com quantidade e sem preço cadastrado. */
  missing: number;
  /** Linhas ocultas pelo usuário. */
  hidden: QtyLine[];
}

/** Orçamento: quantidades da rede (ou ajustadas) × preços do cadastro, mais itens extras, BDI e desconto. */
export function buildBudget(quantities: QtyLine[], prices: PriceItem[], cfg: ProjectBudget = EMPTY_BUDGET): BudgetSummary {
  const priceOf = new Map(prices.filter((p) => p.key).map((p) => [p.key as string, p.price]));
  const itemById = new Map(prices.map((p) => [p.id, p]));
  const hiddenKeys = new Set(cfg.hidden ?? []);
  const overrides = cfg.overrides ?? {};
  const lines: BudgetLine[] = [];
  quantities.forEach((q) => {
    if (hiddenKeys.has(q.key)) return;
    const qty = overrides[q.key] ?? q.qty;
    const price = priceOf.get(q.key) ?? 0;
    lines.push({ ...q, auto: q.qty, qty, price, total: qty * price, overridden: overrides[q.key] !== undefined });
  });
  // Itens com quantidade digitada sem aparecer na rede (ex.: ajustado e depois apagado do mapa) ficam de fora.
  (cfg.extras ?? []).forEach((e) => {
    const item = e.item_id ? itemById.get(e.item_id) : undefined;
    const price = item ? item.price : (e.price ?? 0);
    lines.push({ key: `extra:${e.id}`, category: e.category, name: e.name, unit: e.unit || 'un', auto: null, qty: e.qty, price, total: e.qty * price, extraId: e.id, overridden: false });
  });
  const byCategory = PRICE_CATEGORY_LIST.map((category) => {
    const ls = lines.filter((l) => l.category === category).sort((a, b) => (a.auto === null ? 1 : 0) - (b.auto === null ? 1 : 0) || a.name.localeCompare(b.name, 'pt-BR', { numeric: true }));
    return { category, lines: ls, total: ls.reduce((a, l) => a + l.total, 0) };
  }).filter((g) => g.lines.length);
  const subtotal = lines.reduce((a, l) => a + l.total, 0);
  const bdi = (subtotal * (cfg.bdi_pct || 0)) / 100;
  const discount = ((subtotal + bdi) * (cfg.discount_pct || 0)) / 100;
  return {
    lines,
    byCategory,
    subtotal,
    bdi,
    discount,
    total: subtotal + bdi - discount,
    missing: lines.filter((l) => l.qty > 0 && !l.price).length,
    hidden: quantities.filter((q) => hiddenKeys.has(q.key)),
  };
}
