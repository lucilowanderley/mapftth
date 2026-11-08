import { Download, FileUp, Plus, RotateCcw, Search, Tags, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { downloadText, num, parseCsv, toCsv } from '../lib/analysis';
import { api, errorMessage } from '../lib/api';
import { PRICE_CATEGORIES, PRICE_CATEGORY_LIST, PRICE_UNITS, builtinPrices, formatBRL, formatQty, mergePrices, type PriceRow, type QtyLine } from '../lib/pricing';
import type { EquipmentModel, PriceCategory, PriceItem } from '../lib/types';
import { Field, Modal } from './ui';

/** Tabela de preços do usuário (ou do dono do projeto) carregada da API. */
export function usePriceItems(projectId?: number) {
  const [prices, setPrices] = useState<PriceItem[]>([]);
  const reload = useCallback(() => {
    api
      .priceItems(projectId)
      .then(setPrices)
      .catch(() => setPrices([]));
  }, [projectId]);
  useEffect(reload, [reload]);
  return { prices, reload };
}

/**
 * Cadastro de preços e quantitativos: valor de mercado de equipamentos ativos e passivos, cabos,
 * caixas, postes, dutos, lançamento e mão de obra. Com `quantities`, mostra quanto o projeto usa de cada item.
 */
export default function PriceCatalog({
  prices,
  models,
  quantities,
  readOnly,
  onChanged,
  onClose,
}: {
  prices: PriceItem[];
  models: EquipmentModel[];
  quantities?: QtyLine[];
  readOnly?: boolean;
  onChanged: () => void;
  onClose: () => void;
}) {
  const [cat, setCat] = useState<PriceCategory | 'all'>('all');
  const [q, setQ] = useState('');
  const [onlyProject, setOnlyProject] = useState(false);
  const [adding, setAdding] = useState<{ name: string; unit: string; price: string; category: PriceCategory } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const qtyOf = useMemo(() => new Map((quantities ?? []).map((l) => [l.key, l])), [quantities]);
  const rows = useMemo(() => mergePrices([...builtinPrices(models), ...(quantities ?? [])], prices), [models, quantities, prices]);
  const visible = rows.filter(
    (r) =>
      (cat === 'all' || r.category === cat) &&
      (!onlyProject || qtyOf.has(r.key)) &&
      (!q || r.name.toLowerCase().includes(q.toLowerCase())),
  );
  const missing = quantities ? quantities.filter((l) => !(rows.find((r) => r.key === l.key)?.price ?? 0)).length : 0;

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  function savePrice(r: PriceRow, price: number) {
    if (price === r.price) return;
    if (r.saved && !r.saved.key) return run(() => api.updatePriceItem(r.saved!.id, { category: r.category, name: r.name, unit: r.unit, price, notes: r.saved!.notes ?? null }));
    return run(() => api.savePriceItem({ key: r.key, category: r.category, name: r.name, unit: r.unit, price, notes: r.saved?.notes ?? null }));
  }

  function remove(r: PriceRow) {
    if (!r.saved) return;
    if (!r.builtin && !confirm(`Excluir "${r.name}" do cadastro de preços?`)) return;
    run(() => api.deletePriceItem(r.saved!.id));
  }

  function exportCsv() {
    downloadText(
      'precos-e-quantitativos.csv',
      toCsv([
        ['chave', 'categoria', 'item', 'unidade', 'preco', ...(quantities ? ['quantidade_no_projeto'] : [])],
        ...rows.map((r) => [r.saved?.key === null ? '' : r.key, PRICE_CATEGORIES[r.category].label, r.name, r.unit, r.price, ...(quantities ? [qtyOf.get(r.key)?.qty ?? 0] : [])]),
      ]),
    );
  }

  async function importCsv(file: File) {
    setError(null);
    setInfo(null);
    const data = parseCsv(await file.text());
    const catByLabel = new Map(PRICE_CATEGORY_LIST.flatMap((c) => [[PRICE_CATEGORIES[c].label.toLowerCase(), c] as const, [c, c] as const]));
    const items: Omit<PriceItem, 'id' | 'own'>[] = [];
    data.forEach((d) => {
      const price = num(d.preco ?? d['preço'] ?? d.valor);
      const key = (d.chave ?? '').trim() || null;
      const known = key ? rows.find((r) => r.key === key) : undefined;
      const category = known?.category ?? catByLabel.get((d.categoria ?? '').trim().toLowerCase()) ?? 'other';
      const name = known?.name ?? (d.item ?? d.nome ?? '').trim();
      if (!name || !Number.isFinite(price) || price < 0) return;
      items.push({ key, category, name, unit: (known?.unit ?? (d.unidade || 'un')).slice(0, 12), price, notes: null });
    });
    if (!items.length) return setError('Nenhum preço encontrado. Use as colunas chave, categoria, item, unidade e preco (exporte a planilha para ver o modelo).');
    try {
      const r = await api.savePriceItems(items);
      setInfo(`${r.saved} preço(s) importado(s).`);
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <Modal
      title={
        <span className="flex items-center gap-2">
          <Tags size={18} className="text-emerald-400" /> Preços e quantitativos
        </span>
      }
      onClose={onClose}
      width="max-w-4xl"
    >
      <p className="text-xs text-slate-400 mb-3">
        Valor de mercado de cada item (ativos, passivos, cabos, caixas, postes, dutos, lançamento e mão de obra). O orçamento do projeto multiplica as quantidades da rede por estes preços.
        {readOnly && ' Esta é a tabela do dono do projeto: só ele pode alterar.'}
      </p>
      <div className="flex flex-wrap gap-1 mb-3">
        {(['all', ...PRICE_CATEGORY_LIST] as const).map((c) => (
          <button
            key={c}
            title={c === 'all' ? undefined : PRICE_CATEGORIES[c].hint}
            onClick={() => setCat(c)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium cursor-pointer border ${cat === c ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-700 text-slate-300 hover:bg-slate-800'}`}
          >
            {c === 'all' ? 'Todos' : PRICE_CATEGORIES[c].label} ({rows.filter((r) => c === 'all' || r.category === c).length})
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input className="input !pl-8" placeholder="Buscar item" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {quantities && (
          <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
            <input type="checkbox" checked={onlyProject} onChange={(e) => setOnlyProject(e.target.checked)} /> Só os usados no projeto
          </label>
        )}
        <button className="btn-ghost !py-1.5 text-xs" onClick={exportCsv} title="Baixar a tabela de preços em CSV (modelo para importar)">
          <Download size={14} /> Planilha
        </button>
        {!readOnly && (
          <button className="btn-ghost !py-1.5 text-xs" onClick={() => fileRef.current?.click()} title="Importar preços de uma planilha CSV">
            <FileUp size={14} /> Importar
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) importCsv(f);
          }}
        />
      </div>
      {quantities && missing > 0 && <div className="mb-2 text-xs text-amber-300">{missing} item(ns) usados no projeto ainda sem preço.</div>}

      <div className="max-h-[50vh] overflow-y-auto rounded-md border border-slate-800">
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase tracking-wide text-slate-500 text-left bg-slate-950 sticky top-0 z-10">
            <tr>
              <th className="px-3 py-2">Item</th>
              {cat === 'all' && <th>Categoria</th>}
              <th className="text-center">Unid.</th>
              {quantities && <th className="text-right">No projeto</th>}
              <th className="text-right pr-2">Valor de mercado</th>
              <th className="w-16" />
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const used = qtyOf.get(r.key);
              return (
                <tr key={r.key} className="border-t border-slate-800">
                  <td className="px-3 py-1">
                    {r.name}
                    {!r.builtin && <span className="ml-1.5 text-[10px] uppercase text-slate-500">avulso</span>}
                  </td>
                  {cat === 'all' && <td className="text-xs text-slate-400">{PRICE_CATEGORIES[r.category].label}</td>}
                  <td className="text-center text-xs text-slate-400">{r.unit}</td>
                  {quantities && <td className="text-right font-mono text-xs">{used ? formatQty(used.qty) : <span className="text-slate-600">—</span>}</td>}
                  <td className="text-right pr-2 py-1">
                    {readOnly ? (
                      <span className={r.price ? '' : 'text-slate-600'}>{r.price ? formatBRL(r.price) : '—'}</span>
                    ) : (
                      <PriceInput value={r.price} warn={!!used && !r.price} onSave={(v) => savePrice(r, v)} />
                    )}
                  </td>
                  <td className="pr-2 text-right whitespace-nowrap">
                    {!readOnly && r.saved && (
                      <button
                        title={r.builtin ? 'Limpar o preço' : 'Excluir item'}
                        className="p-1.5 text-slate-400 hover:text-red-400 cursor-pointer"
                        onClick={() => remove(r)}
                      >
                        {r.builtin ? <RotateCcw size={13} /> : <Trash2 size={13} />}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {!visible.length && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-slate-500 text-sm">
                  Nenhum item.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!readOnly && !adding && (
        <button className="btn-ghost mt-3" onClick={() => setAdding({ name: '', unit: 'un', price: '', category: cat === 'all' ? 'other' : cat })}>
          <Plus size={15} /> Cadastrar item avulso
        </button>
      )}
      {adding && (
        <div className="mt-3 rounded-lg border border-slate-700 p-3 space-y-3">
          <div className="text-xs font-semibold text-slate-300">Novo item (material, serviço ou despesa que não vem do mapa)</div>
          <div className="grid grid-cols-2 sm:grid-cols-[1fr_2fr_90px_130px] gap-2">
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
              <input autoFocus className="input" placeholder="Alça preformada, ONU, veículo/dia..." value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })} />
            </Field>
            <Field label="Unidade">
              <input className="input px-2" list="price-units" value={adding.unit} onChange={(e) => setAdding({ ...adding, unit: e.target.value.slice(0, 12) })} />
              <datalist id="price-units">
                {PRICE_UNITS.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
            </Field>
            <Field label="Valor (R$)">
              <input className="input px-2" inputMode="decimal" placeholder="0,00" value={adding.price} onChange={(e) => setAdding({ ...adding, price: e.target.value })} />
            </Field>
          </div>
          <div className="flex gap-2 justify-end">
            <button className="btn-ghost" onClick={() => setAdding(null)}>
              Cancelar
            </button>
            <button
              className="btn-primary"
              disabled={!adding.name.trim() || !adding.unit.trim()}
              onClick={() =>
                run(async () => {
                  await api.savePriceItem({ key: null, category: adding.category, name: adding.name.trim(), unit: adding.unit.trim(), price: Math.max(0, parseMoney(adding.price)), notes: null });
                  setAdding(null);
                })
              }
            >
              Salvar item
            </button>
          </div>
        </div>
      )}
      {error && <div className="text-xs text-red-400 mt-2">{error}</div>}
      {info && <div className="text-xs text-emerald-400 mt-2">{info}</div>}
      <p className="text-[11px] text-slate-500 mt-3">
        Os preços valem para todos os seus projetos (a equipe usa a tabela do dono do projeto). O valor de mercado dos equipamentos também aparece no cadastro de equipamentos do POP.
      </p>
    </Modal>
  );
}

/** "1.234,56" ou "1234.56" → número. */
export function parseMoney(v: string): number {
  const s = v.replace(/[R$\s]/g, '');
  const n = s.includes(',') ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** Campo de preço: grava ao sair do campo ou com Enter. */
export function PriceInput({ value, onSave, warn, className = '' }: { value: number; onSave: (v: number) => void; warn?: boolean; className?: string }) {
  const fmt = (v: number) => (v ? v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '');
  const [text, setText] = useState(fmt(value));
  useEffect(() => setText(fmt(value)), [value]);
  const commit = () => {
    const v = Math.max(0, Math.round(parseMoney(text) * 100) / 100);
    setText(fmt(v));
    if (v !== value) onSave(v);
  };
  return (
    <div className={`relative inline-block ${className}`}>
      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-slate-500">R$</span>
      <input
        className={`input !py-1 !pl-7 text-right w-32 font-mono text-xs ${warn ? '!border-amber-500/60' : ''}`}
        inputMode="decimal"
        placeholder="0,00"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
    </div>
  );
}
