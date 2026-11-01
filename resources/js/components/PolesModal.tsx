import { Download, MapPin, Upload } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { api, errorMessage } from '../lib/api';
import { cablesNear, downloadText, num, parseCsv, toCsv } from '../lib/analysis';
import { STATUSES } from '../lib/catalog';
import type { Cable, NetNode, PoleAttributes } from '../lib/types';
import { Modal } from './ui';

export const POLE_MATERIALS = ['Concreto', 'Madeira', 'Metálico', 'Fibra de vidro'];

const pick = (row: Record<string, string>, ...keys: string[]) => keys.map((k) => row[k]).find((v) => v !== undefined && v !== '');

interface Props {
  projectId: number;
  poles: NetNode[];
  cables: Cable[];
  readOnly: boolean;
  onClose: () => void;
  onSaved: (n: NetNode) => void;
  onImported: (nodes: NetNode[]) => void;
  onFocus: (n: NetNode) => void;
}

export default function PolesModal({ projectId, poles, cables, readOnly, onClose, onSaved, onImported, onFocus }: Props) {
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const rows = useMemo(
    () =>
      poles
        .map((p) => ({ p, a: (p.attributes ?? {}) as PoleAttributes, cables: cablesNear([p.lat, p.lng], cables) }))
        .filter(({ p, a }) => `${p.name} ${a.code ?? ''} ${a.owner ?? ''}`.toLowerCase().includes(query.toLowerCase())),
    [poles, cables, query],
  );

  async function save(p: NetNode, patch: Partial<PoleAttributes>) {
    try {
      const r = await api.updateNode(p.id, { attributes: { ...(p.attributes ?? {}), ...patch } });
      onSaved(r.node);
    } catch (e) {
      setMessage(errorMessage(e));
    }
  }

  function exportCsv() {
    downloadText(
      'postes.csv',
      toCsv([
        ['nome', 'codigo', 'latitude', 'longitude', 'material', 'altura_m', 'esforco_dan', 'proprietario', 'estrutura', 'status', 'cabos'],
        ...rows.map(({ p, a, cables: cs }) => [p.name, a.code ?? '', p.lat, p.lng, a.material ?? '', a.height_m ?? '', a.load_dan ?? '', a.owner ?? '', a.structure ?? '', STATUSES[p.status].label, cs.map((c) => c.name).join(', ')]),
      ]),
    );
  }

  async function importCsv(file: File) {
    setMessage('');
    const data = parseCsv(await file.text());
    const nodes = data
      .map((row) => {
        const lat = num(pick(row, 'latitude', 'lat', 'y'));
        const lng = num(pick(row, 'longitude', 'lng', 'lon', 'long', 'x'));
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        const attributes: PoleAttributes = {
          code: pick(row, 'codigo', 'código', 'cod_id', 'cod', 'id'),
          material: pick(row, 'material', 'tip_mat'),
          height_m: num(pick(row, 'altura_m', 'altura', 'alt')) || undefined,
          load_dan: num(pick(row, 'esforco_dan', 'esforço', 'esforco', 'esf')) || undefined,
          owner: pick(row, 'proprietario', 'proprietário', 'distribuidora', 'dist'),
          structure: pick(row, 'estrutura', 'estr'),
        };
        return { type: 'pole' as const, name: pick(row, 'nome', 'name') ?? '', lat, lng, attributes };
      })
      .filter((n): n is NonNullable<typeof n> => n !== null);
    if (!nodes.length) {
      setMessage('Nenhuma linha com latitude e longitude válidas encontrada.');
      return;
    }
    try {
      const created: NetNode[] = [];
      for (let i = 0; i < nodes.length; i += 1000) {
        created.push(...(await api.bulkNodes(projectId, nodes.slice(i, i + 1000))).created);
      }
      onImported(created);
      setMessage(`${created.length} postes importados.`);
    } catch (e) {
      setMessage(errorMessage(e));
    }
  }

  return (
    <Modal title={`Tabela de postes (${poles.length})`} onClose={onClose} width="max-w-6xl">
      <div className="flex flex-wrap gap-2 items-center mb-3">
        <input className="input !w-64" placeholder="Buscar por nome, código ou proprietário" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button className="btn-ghost" onClick={exportCsv}>
          <Download size={16} /> Exportar CSV
        </button>
        {!readOnly && (
          <>
            <button className="btn-ghost" onClick={() => fileRef.current?.click()}>
              <Upload size={16} /> Importar planilha
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importCsv(f);
                e.target.value = '';
              }}
            />
          </>
        )}
        {message && <span className="text-sm text-emerald-400">{message}</span>}
      </div>
      {!readOnly && (
        <p className="text-xs text-slate-500 mb-3">
          A planilha precisa das colunas <b>latitude</b> e <b>longitude</b>; opcionais: nome, codigo, material, altura_m, esforco_dan, proprietario, estrutura.
          Serve para trazer os postes da distribuidora (por exemplo, exportados da BDGD da ANEEL em CSV).
        </p>
      )}
      <div className="overflow-x-auto max-h-[60vh]">
        <table className="w-full text-sm">
          <thead className="text-xs text-slate-400 text-left sticky top-0 bg-slate-900">
            <tr>
              <th className="py-1 pr-2">Poste</th>
              <th className="pr-2">Código</th>
              <th className="pr-2">Material</th>
              <th className="pr-2">Altura (m)</th>
              <th className="pr-2">Esforço (daN)</th>
              <th className="pr-2">Proprietário</th>
              <th className="pr-2">Estrutura</th>
              <th className="pr-2">Cabos</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ p, a, cables: cs }) => (
              <tr key={p.id} className="border-t border-slate-800 align-middle">
                <td className="py-1 pr-2 whitespace-nowrap">{p.name}</td>
                <Cell value={a.code} readOnly={readOnly} onSave={(v) => save(p, { code: v })} />
                <td className="pr-2">
                  <select className="input !py-0.5 !w-32" disabled={readOnly} value={a.material ?? ''} onChange={(e) => save(p, { material: e.target.value })}>
                    <option value="">—</option>
                    {POLE_MATERIALS.map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                </td>
                <Cell value={a.height_m} type="number" readOnly={readOnly} onSave={(v) => save(p, { height_m: v ? Number(v) : undefined })} />
                <Cell value={a.load_dan} type="number" readOnly={readOnly} onSave={(v) => save(p, { load_dan: v ? Number(v) : undefined })} />
                <Cell value={a.owner} readOnly={readOnly} onSave={(v) => save(p, { owner: v })} />
                <Cell value={a.structure} readOnly={readOnly} onSave={(v) => save(p, { structure: v })} />
                <td className="pr-2 text-xs text-slate-400 max-w-48 truncate" title={cs.map((c) => c.name).join(', ')}>
                  {cs.length ? `${cs.length} · ${cs.map((c) => c.name).join(', ')}` : '—'}
                </td>
                <td>
                  <button onClick={() => onFocus(p)} className="text-slate-400 hover:text-emerald-400 cursor-pointer" title="Ver no mapa">
                    <MapPin size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="text-sm text-slate-500 py-4">Nenhum poste. Use a ferramenta Poste no mapa ou importe uma planilha.</p>}
      </div>
    </Modal>
  );
}

function Cell({ value, onSave, type = 'text', readOnly }: { value: string | number | undefined; onSave: (v: string) => void; type?: string; readOnly: boolean }) {
  const [v, setV] = useState(value === undefined ? '' : String(value));
  return (
    <td className="pr-2">
      <input
        className="input !py-0.5 !w-28"
        type={type}
        value={v}
        disabled={readOnly}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => v !== (value === undefined ? '' : String(value)) && onSave(v)}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
    </td>
  );
}
