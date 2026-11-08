import { Calculator, Eye, EyeOff, FileSpreadsheet, Plus, Printer, RotateCcw, Save, Tags, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { downloadText, toCsv } from '../lib/analysis';
import { api, errorMessage } from '../lib/api';
import { EMPTY_BUDGET, PRICE_CATEGORIES, PRICE_CATEGORY_LIST, PRICE_UNITS, buildBudget, formatBRL, formatQty, networkQuantities, type BudgetLine, type PriceDef } from '../lib/pricing';
import type { Duct, Network, PriceCategory, PriceItem, ProjectBudget } from '../lib/types';
import { PriceInput, parseMoney } from './PriceCatalog';
import { Field, Modal } from './ui';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const uid = () => Math.random().toString(36).slice(2, 10);

/** Orçamento do projeto: quantidades da rede × preços do cadastro, itens extras, BDI e desconto. */
export default function ProjectBudgetModal({
  projectId,
  projectName,
  network,
  ducts,
  prices,
  budget,
  canEdit,
  canEditPrices,
  onSaved,
  onPricesChanged,
  onOpenPrices,
  draft,
  onDraft,
  onClose,
}: {
  projectId: number;
  projectName: string;
  network: Network;
  ducts: Duct[];
  prices: PriceItem[];
  budget: ProjectBudget | null | undefined;
  /** Pode alterar o orçamento (editor ou mais). */
  canEdit: boolean;
  /** Pode alterar os preços (a tabela é dele). */
  canEditPrices: boolean;
  onSaved: (b: ProjectBudget) => void;
  onPricesChanged: () => void;
  onOpenPrices: () => void;
  /** Alterações ainda não salvas (mantidas ao ir e voltar do cadastro de preços). */
  draft?: { cfg: ProjectBudget; dirty: boolean } | null;
  onDraft?: (d: { cfg: ProjectBudget; dirty: boolean }) => void;
  onClose: () => void;
}) {
  const [cfg, setCfg] = useState<ProjectBudget>(draft?.cfg ?? { ...EMPTY_BUDGET, ...(budget ?? {}) });
  const [dirty, setDirty] = useState(draft?.dirty ?? false);
  useEffect(() => onDraft?.({ cfg, dirty }), [cfg, dirty]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<{ category: PriceCategory; name: string; unit: string; price: string; qty: string } | null>(null);

  const quantities = useMemo(() => networkQuantities(network, ducts, cfg.scope), [network, ducts, cfg.scope]);
  const sum = useMemo(() => buildBudget(quantities, prices, cfg), [quantities, prices, cfg]);
  const custom = prices.filter((p) => !p.key);
  const change = (patch: Partial<ProjectBudget>) => {
    setCfg((c) => ({ ...c, ...patch }));
    setDirty(true);
  };

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const saved = await api.saveBudget(projectId, cfg);
      setCfg({ ...EMPTY_BUDGET, ...saved, overrides: { ...(saved.overrides ?? {}) } });
      setDirty(false);
      onSaved(saved);
    } catch (e) {
      setError(errorMessage(e));
    }
    setBusy(false);
  }

  function setQty(l: BudgetLine, v: number) {
    if (l.extraId) return change({ extras: cfg.extras.map((e) => (e.id === l.extraId ? { ...e, qty: v } : e)) });
    const overrides = { ...cfg.overrides };
    if (l.auto !== null && v === l.auto) delete overrides[l.key];
    else overrides[l.key] = v;
    change({ overrides });
  }

  async function savePrice(l: BudgetLine, price: number) {
    if (l.extraId) {
      const extra = cfg.extras.find((e) => e.id === l.extraId);
      const item = extra?.item_id ? prices.find((p) => p.id === extra.item_id) : undefined;
      if (!item) return change({ extras: cfg.extras.map((e) => (e.id === l.extraId ? { ...e, price } : e)) });
      if (!canEditPrices) return;
      await guard(() => api.updatePriceItem(item.id, { category: item.category, name: item.name, unit: item.unit, price, notes: item.notes ?? null }));
      return;
    }
    const def: PriceDef = { key: l.key, category: l.category, name: l.name, unit: l.unit };
    await guard(() => api.savePriceItem({ ...def, price, notes: null }));
  }

  async function guard(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      onPricesChanged();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  function addExtra() {
    if (!adding) return;
    const item = custom.find((p) => p.name.toLowerCase() === adding.name.trim().toLowerCase());
    change({
      extras: [
        ...cfg.extras,
        {
          id: uid(),
          item_id: item?.id ?? null,
          category: item?.category ?? adding.category,
          name: item?.name ?? adding.name.trim(),
          unit: item?.unit ?? (adding.unit.trim() || 'un'),
          price: item ? null : Math.max(0, parseMoney(adding.price)),
          qty: Math.max(0, parseMoney(adding.qty) || 1),
        },
      ],
    });
    setAdding(null);
  }

  const scopeLabel = cfg.scope === 'pending' ? 'Só o que falta implantar (em projeto e não implantado)' : 'Rede inteira';
  const fileBase = `orcamento-${projectName.toLowerCase().replace(/[^\w]+/g, '-')}`;

  function exportCsv() {
    const rows: (string | number)[][] = [
      ['Orçamento', projectName],
      ['Gerado em', new Date().toLocaleString('pt-BR')],
      ['Escopo', scopeLabel],
      [],
      ['Categoria', 'Item', 'Unidade', 'Quantidade', 'Preço unitário (R$)', 'Total (R$)'],
      ...sum.byCategory.flatMap((g) => [
        ...g.lines.map((l) => [PRICE_CATEGORIES[g.category].label, l.name, l.unit, l.qty, l.price, Math.round(l.total * 100) / 100]),
        ['', `Subtotal ${PRICE_CATEGORIES[g.category].label}`, '', '', '', Math.round(g.total * 100) / 100],
      ]),
      [],
      ['', 'Subtotal', '', '', '', Math.round(sum.subtotal * 100) / 100],
      ['', `BDI (${cfg.bdi_pct || 0}%)`, '', '', '', Math.round(sum.bdi * 100) / 100],
      ['', `Desconto (${cfg.discount_pct || 0}%)`, '', '', '', -Math.round(sum.discount * 100) / 100],
      ['', 'Total', '', '', '', Math.round(sum.total * 100) / 100],
      ...(cfg.notes ? [[], ['Observações', cfg.notes]] : []),
    ];
    downloadText(`${fileBase}.csv`, toCsv(rows));
  }

  function print() {
    const w = window.open('', '_blank');
    if (!w) return;
    const groups = sum.byCategory
      .map(
        (g) => `<h2>${esc(PRICE_CATEGORIES[g.category].label)}</h2><table><thead><tr><th>Item</th><th>Unid.</th><th class="r">Quantidade</th><th class="r">Preço unit.</th><th class="r">Total</th></tr></thead><tbody>${g.lines
          .map((l) => `<tr><td>${esc(l.name)}</td><td>${esc(l.unit)}</td><td class="r">${formatQty(l.qty)}</td><td class="r">${l.price ? formatBRL(l.price) : '—'}</td><td class="r">${formatBRL(l.total)}</td></tr>`)
          .join('')}<tr class="sub"><td colspan="4">Subtotal</td><td class="r">${formatBRL(g.total)}</td></tr></tbody></table>`,
      )
      .join('');
    w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(`Orçamento · ${projectName}`)}</title>
      <style>body{font-family:Arial,sans-serif;color:#0f172a;margin:32px}h1{font-size:20px;margin:0}h2{font-size:14px;margin:20px 0 6px;border-bottom:2px solid #10b981;padding-bottom:4px}
      .sub{color:#64748b;font-size:12px;margin-top:4px}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #cbd5e1;padding:4px 6px;text-align:left}th{background:#f1f5f9}
      .r{text-align:right}tr.sub td{font-weight:bold;background:#f8fafc;color:#0f172a}.tot{margin-top:20px;margin-left:auto;width:320px}.tot td{font-size:13px}.tot tr:last-child td{font-size:16px;font-weight:bold;background:#ecfdf5}
      .notes{margin-top:16px;font-size:12px;white-space:pre-wrap}</style></head><body>
      <h1>Orçamento · ${esc(projectName)}</h1><div class="sub">MapFTTH · ${new Date().toLocaleString('pt-BR')} · ${esc(scopeLabel)}</div>
      ${groups}
      <table class="tot"><tbody><tr><td>Subtotal</td><td class="r">${formatBRL(sum.subtotal)}</td></tr><tr><td>BDI (${cfg.bdi_pct || 0}%)</td><td class="r">${formatBRL(sum.bdi)}</td></tr>
      <tr><td>Desconto (${cfg.discount_pct || 0}%)</td><td class="r">− ${formatBRL(sum.discount)}</td></tr><tr><td>Total</td><td class="r">${formatBRL(sum.total)}</td></tr></tbody></table>
      ${cfg.notes ? `<div class="notes"><b>Observações</b><br>${esc(cfg.notes)}</div>` : ''}
      <script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  }

  const pct = (v: string) => Math.max(0, Math.min(300, Number(v.replace(',', '.')) || 0));

  return (
    <Modal
      title={
        <span className="flex items-center gap-2">
          <Calculator size={18} className="text-emerald-400" /> Orçamento do projeto <span className="text-slate-400 font-normal">· {projectName}</span>
        </span>
      }
      onClose={() => {
        if (dirty && !confirm('Fechar sem salvar as alterações do orçamento?')) return;
        onClose();
      }}
      width="max-w-5xl"
    >
      <div className="flex flex-wrap items-end gap-2 mb-3">
        <Field label="Considerar">
          <select className="input px-2 w-auto" value={cfg.scope} disabled={!canEdit} onChange={(e) => change({ scope: e.target.value as ProjectBudget['scope'] })}>
            <option value="all">Rede inteira</option>
            <option value="pending">Só o que falta implantar</option>
          </select>
        </Field>
        <Field label="BDI (%)">
          <input className="input px-2 w-20" inputMode="decimal" disabled={!canEdit} value={cfg.bdi_pct || ''} placeholder="0" onChange={(e) => change({ bdi_pct: pct(e.target.value) })} />
        </Field>
        <Field label="Desconto (%)">
          <input className="input px-2 w-20" inputMode="decimal" disabled={!canEdit} value={cfg.discount_pct || ''} placeholder="0" onChange={(e) => change({ discount_pct: Math.min(100, pct(e.target.value)) })} />
        </Field>
        <div className="flex flex-wrap gap-2 ml-auto">
          <button className="btn-ghost" onClick={onOpenPrices} title="Abrir o cadastro de preços e quantitativos">
            <Tags size={16} /> Preços
          </button>
          <button className="btn-ghost" onClick={exportCsv}>
            <FileSpreadsheet size={16} /> Planilha (CSV)
          </button>
          <button className="btn-ghost" onClick={print}>
            <Printer size={16} /> Imprimir / PDF
          </button>
          {canEdit && (
            <button className="btn-primary" disabled={!dirty || busy} onClick={save}>
              <Save size={16} /> Salvar
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
        {[
          ['Subtotal', sum.subtotal],
          [`BDI ${cfg.bdi_pct || 0}%`, sum.bdi],
          [`Desconto ${cfg.discount_pct || 0}%`, sum.discount ? -sum.discount : 0],
          ['Total', sum.total],
        ].map(([l, v], i) => (
          <div key={l as string} className={`rounded-md p-3 ${i === 3 ? 'bg-emerald-600/15 border border-emerald-600/50' : 'bg-slate-950'}`}>
            <div className={`font-semibold ${i === 3 ? 'text-xl text-emerald-300' : 'text-lg'}`}>{formatBRL(v as number)}</div>
            <div className="text-xs text-slate-400">{l}</div>
          </div>
        ))}
      </div>
      {sum.missing > 0 && (
        <div className="mt-3 text-xs text-amber-300">
          {sum.missing} item(ns) sem preço cadastrado (destacados).{' '}
          <button className="underline cursor-pointer" onClick={onOpenPrices}>
            Cadastrar preços
          </button>
        </div>
      )}
      {!sum.lines.length && <div className="mt-4 text-sm text-slate-400">Nenhuma quantidade na rede{cfg.scope === 'pending' ? ' a implantar' : ''}. Desenhe a rede ou adicione itens extras.</div>}

      <div className="mt-4 space-y-4">
        {sum.byCategory.map((g) => (
          <div key={g.category} className="rounded-lg bg-slate-950 border border-slate-800">
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800">
              <div className="label !mb-0">{PRICE_CATEGORIES[g.category].label}</div>
              <div className="text-sm font-semibold">{formatBRL(g.total)}</div>
            </div>
            <table className="w-full text-sm table-fixed">
              <colgroup>
                <col />
                <col className="w-16" />
                <col className="w-28" />
                <col className="w-40" />
                <col className="w-32" />
                <col className="w-16" />
              </colgroup>
              <thead className="text-[11px] uppercase tracking-wide text-slate-500 text-left">
                <tr>
                  <th className="px-3 py-1">Item</th>
                  <th className="text-center">Unid.</th>
                  <th className="text-right">Quantidade</th>
                  <th className="text-right">Preço unit.</th>
                  <th className="text-right pr-2">Total</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {g.lines.map((l) => {
                  const extra = l.extraId ? cfg.extras.find((e) => e.id === l.extraId) : undefined;
                  const priceEditable = l.extraId ? canEdit && (!extra?.item_id || canEditPrices) : canEditPrices;
                  return (
                    <tr key={l.key} className="border-t border-slate-800">
                      <td className="px-3 py-1">
                        {l.name}
                        {l.auto === null && <span className="ml-1.5 text-[10px] uppercase text-slate-500">extra</span>}
                        {l.overridden && (
                          <span className="ml-1.5 text-[10px] text-amber-300" title="Quantidade ajustada à mão">
                            ajustado (rede: {formatQty(l.auto ?? 0)})
                          </span>
                        )}
                      </td>
                      <td className="text-center text-xs text-slate-400">{l.unit}</td>
                      <td className="text-right">{canEdit ? <QtyInput value={l.qty} onSave={(v) => setQty(l, v)} /> : <span className="font-mono text-xs">{formatQty(l.qty)}</span>}</td>
                      <td className="text-right">
                        {priceEditable ? (
                          <PriceInput value={l.price} warn={l.qty > 0 && !l.price} onSave={(v) => savePrice(l, v)} />
                        ) : (
                          <span className={`font-mono text-xs ${l.price ? '' : 'text-amber-300'}`}>{l.price ? formatBRL(l.price) : 'sem preço'}</span>
                        )}
                      </td>
                      <td className="text-right pr-2 font-mono text-xs">{formatBRL(l.total)}</td>
                      <td className="pr-2 text-right whitespace-nowrap">
                        {canEdit && l.overridden && (
                          <button title="Voltar à quantidade da rede" className="p-1 text-slate-400 hover:text-white cursor-pointer" onClick={() => setQty(l, l.auto ?? 0)}>
                            <RotateCcw size={13} />
                          </button>
                        )}
                        {canEdit &&
                          (l.extraId ? (
                            <button title="Remover do orçamento" className="p-1 text-slate-400 hover:text-red-400 cursor-pointer" onClick={() => change({ extras: cfg.extras.filter((e) => e.id !== l.extraId) })}>
                              <Trash2 size={13} />
                            </button>
                          ) : (
                            <button title="Tirar do orçamento" className="p-1 text-slate-400 hover:text-red-400 cursor-pointer" onClick={() => change({ hidden: [...cfg.hidden, l.key] })}>
                              <EyeOff size={13} />
                            </button>
                          ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {sum.hidden.length > 0 && (
        <div className="mt-3 text-[11px] text-slate-500">
          Fora do orçamento:{' '}
          {sum.hidden.map((h, i) => (
            <span key={h.key}>
              {i > 0 && ', '}
              {h.name}
              {canEdit && (
                <button className="ml-1 text-emerald-400 hover:text-emerald-300 cursor-pointer inline-flex items-center gap-0.5" onClick={() => change({ hidden: cfg.hidden.filter((k) => k !== h.key) })}>
                  <Eye size={11} /> voltar
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {canEdit && !adding && (
        <button className="btn-ghost mt-3" onClick={() => setAdding({ category: 'labor', name: '', unit: 'un', price: '', qty: '1' })}>
          <Plus size={15} /> Adicionar item extra
        </button>
      )}
      {adding && (
        <div className="mt-3 rounded-lg border border-slate-700 p-3 space-y-3">
          <div className="text-xs font-semibold text-slate-300">Item extra (escolha um item avulso do cadastro ou digite um novo)</div>
          <div className="grid grid-cols-2 sm:grid-cols-[1fr_2fr_80px_120px_90px] gap-2">
            <Field label="Categoria">
              <select className="input px-2" value={adding.category} onChange={(e) => setAdding({ ...adding, category: e.target.value as PriceCategory })}>
                {PRICE_CATEGORY_LIST.map((c) => (
                  <option key={c} value={c}>
                    {PRICE_CATEGORIES[c].label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Item">
              <input
                autoFocus
                className="input"
                list="budget-custom-items"
                placeholder="Projeto executivo, aluguel de veículo..."
                value={adding.name}
                onChange={(e) => {
                  const item = custom.find((p) => p.name.toLowerCase() === e.target.value.trim().toLowerCase());
                  setAdding({ ...adding, name: e.target.value, ...(item ? { category: item.category, unit: item.unit, price: String(item.price).replace('.', ',') } : {}) });
                }}
              />
              <datalist id="budget-custom-items">
                {custom.map((p) => (
                  <option key={p.id} value={p.name} />
                ))}
              </datalist>
            </Field>
            <Field label="Unidade">
              <input className="input px-2" list="budget-units" value={adding.unit} onChange={(e) => setAdding({ ...adding, unit: e.target.value.slice(0, 12) })} />
              <datalist id="budget-units">
                {PRICE_UNITS.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
            </Field>
            <Field label="Preço (R$)">
              <input className="input px-2" inputMode="decimal" placeholder="0,00" value={adding.price} onChange={(e) => setAdding({ ...adding, price: e.target.value })} />
            </Field>
            <Field label="Quantidade">
              <input className="input px-2" inputMode="decimal" value={adding.qty} onChange={(e) => setAdding({ ...adding, qty: e.target.value })} />
            </Field>
          </div>
          <div className="flex gap-2 justify-end">
            <button className="btn-ghost" onClick={() => setAdding(null)}>
              Cancelar
            </button>
            <button className="btn-primary" disabled={!adding.name.trim()} onClick={addExtra}>
              Adicionar
            </button>
          </div>
        </div>
      )}

      <div className="mt-4">
        <Field label="Observações (saem no PDF)">
          <textarea className="input min-h-16" disabled={!canEdit} value={cfg.notes ?? ''} placeholder="Validade da proposta, condições de pagamento, prazo de execução..." onChange={(e) => change({ notes: e.target.value || null })} />
        </Field>
      </div>
      {error && <div className="text-xs text-red-400 mt-2">{error}</div>}
      <p className="text-[11px] text-slate-500 mt-3">
        Quantidades calculadas do mapa: cabos com as reservas técnicas, lançamento aéreo/subterrâneo (pelo duto), caixas, postes, dutos, splitters, equipamentos dos POPs, fusões e
        instalações. Ajuste uma quantidade digitando outro valor; o BDI incide sobre o subtotal e o desconto sobre o valor com BDI.
      </p>
    </Modal>
  );
}

/** Quantidade: grava ao sair do campo ou com Enter. */
function QtyInput({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  const [text, setText] = useState<string | null>(null);
  const commit = () => {
    if (text === null) return;
    const v = Math.max(0, parseMoney(text));
    setText(null);
    if (v !== value) onSave(v);
  };
  return (
    <input
      className="input !py-1 text-right w-24 font-mono text-xs"
      inputMode="decimal"
      value={text ?? formatQty(value)}
      onFocus={() => setText(formatQty(value).replace(/\./g, ''))}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}
