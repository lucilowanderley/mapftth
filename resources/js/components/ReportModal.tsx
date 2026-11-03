import { FileSpreadsheet, Printer } from 'lucide-react';
import { useMemo } from 'react';
import { buildReport, downloadText, portUsage, toCsv } from '../lib/analysis';
import { POWER_LABEL } from '../lib/budget';
import { CABLE_CATEGORIES, NODE_TYPES, NODE_TYPE_LIST, SLACK_KINDS, STATUSES } from '../lib/catalog';
import type { LatLng, Network, NodeType } from '../lib/types';
import { Modal, formatLength } from './ui';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const m = (v: number) => `${Math.round(v).toLocaleString('pt-BR')} m`;

export default function ReportModal({ network, projectName, title, polygon, onClose }: { network: Network; projectName: string; title: string; polygon?: LatLng[]; onClose: () => void }) {
  const r = useMemo(() => buildReport(network, polygon), [network, polygon]);
  const types: NodeType[] = NODE_TYPE_LIST;
  const boxes = r.boxes.map((b) => ({ b, ...portUsage(b) }));

  function exportCsv() {
    const rows: (string | number)[][] = [
      ['Relatório', `${projectName} · ${title}`],
      ['Gerado em', new Date().toLocaleString('pt-BR')],
      ...(r.areaM2 !== null ? [['Área (m²)', Math.round(r.areaM2)]] : []),
      [],
      ['Elementos', 'Quantidade', ...Object.values(STATUSES).map((s) => s.label)],
      ...types.map((t) => [NODE_TYPES[t].plural, r.nodes[t], ...Object.keys(STATUSES).map((s) => r.byStatus[t][s as keyof typeof STATUSES])]),
      [],
      ['Cabo', 'Tipo', 'Metragem (m)', 'Reserva técnica (m)', 'Total (m)'],
      ...r.cables.map((c) => [c.name, CABLE_CATEGORIES[c.category as keyof typeof CABLE_CATEGORIES].label, Math.round(c.meters), Math.round(c.slack), Math.round(c.meters + c.slack)]),
      [],
      ['Reserva técnica', 'Quantidade', 'Metragem (m)'],
      ...(['aerial', 'underground'] as const).map((k) => [SLACK_KINDS[k].label, r.slacks[k].count, r.slacks[k].meters]),
      [],
      ['Splitter', 'Quantidade'],
      ...Object.entries(r.splitters),
      ['Fusões', r.fusions],
      [],
      ['Condomínios', r.condos.count, 'Unidades (casas/apartamentos)', r.condos.units],
      [],
      ['Equipamento wireless', 'Quantidade'],
      ...Object.entries(r.wireless.radios),
      ['Enlaces PtP', r.wireless.links],
      [],
      ['Caixa', 'Tipo', 'Status', 'Portas usadas', 'Portas totais', 'Latitude', 'Longitude'],
      ...boxes.map(({ b, used, total }) => [b.name, NODE_TYPES[b.type].label, STATUSES[b.status].label, used, total, b.lat, b.lng]),
    ];
    downloadText(`relatorio-${title.toLowerCase().replace(/[^\w]+/g, '-')}.csv`, toCsv(rows));
  }

  function print() {
    const w = window.open('', '_blank');
    if (!w) return;
    const table = (head: string[], rows: (string | number)[][]) =>
      `<table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows
        .map((row) => `<tr>${row.map((c) => `<td>${esc(String(c))}</td>`).join('')}</tr>`)
        .join('')}</tbody></table>`;
    w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(title)}</title>
      <style>body{font-family:Arial,sans-serif;color:#0f172a;margin:32px}h1{font-size:20px;margin:0}h2{font-size:14px;margin:24px 0 6px;border-bottom:2px solid #10b981;padding-bottom:4px}
      .sub{color:#64748b;font-size:12px;margin-top:4px}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #cbd5e1;padding:4px 6px;text-align:left}th{background:#f1f5f9}
      .kpis{display:flex;gap:12px;margin-top:16px}.kpi{border:1px solid #cbd5e1;border-radius:6px;padding:8px 12px}.kpi b{display:block;font-size:18px}</style></head><body>
      <h1>${esc(projectName)} · ${esc(title)}</h1><div class="sub">MapFTTH · ${new Date().toLocaleString('pt-BR')}${r.areaM2 !== null ? ` · área de ${(r.areaM2 / 1e6).toFixed(3)} km²` : ''}</div>
      <div class="kpis"><div class="kpi">Cabos<b>${esc(formatLength(r.cableTotal))}</b></div><div class="kpi">CTOs<b>${r.nodes.cto}</b></div><div class="kpi">Clientes<b>${r.nodes.client}</b></div><div class="kpi">Portas livres<b>${r.ports.total - r.ports.used}</b></div><div class="kpi">Fusões<b>${r.fusions}</b></div>${r.condos.count ? `<div class="kpi">Unidades em condomínios<b>${r.condos.units}</b></div>` : ''}</div>
      <h2>Elementos</h2>${table(['Tipo', 'Total', ...Object.values(STATUSES).map((s) => s.label)], types.map((t) => [NODE_TYPES[t].plural, r.nodes[t], ...Object.keys(STATUSES).map((s) => r.byStatus[t][s as keyof typeof STATUSES])]))}
      <h2>Cabos</h2>${table(['Cabo', 'Tipo', 'Metragem', 'Reserva', 'Total'], r.cables.map((c) => [c.name, CABLE_CATEGORIES[c.category as keyof typeof CABLE_CATEGORIES].label, m(c.meters), m(c.slack), m(c.meters + c.slack)]))}
      <h2>Reservas técnicas</h2>${table(['Tipo', 'Quantidade', 'Metragem'], (['aerial', 'underground'] as const).map((k) => [SLACK_KINDS[k].label, String(r.slacks[k].count), m(r.slacks[k].meters)]))}
      <h2>Splitters</h2>${table(['Modelo', 'Quantidade'], Object.entries(r.splitters))}
      <h2>Caixas</h2>${table(['Caixa', 'Tipo', 'Status', 'Portas', 'Coordenadas'], boxes.map(({ b, used, total }) => [b.name, NODE_TYPES[b.type].label, STATUSES[b.status].label, total ? `${used}/${total}` : '—', `${b.lat.toFixed(6)}, ${b.lng.toFixed(6)}`]))}
      <script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  }

  return (
    <Modal title={`Relatório · ${title}`} onClose={onClose} width="max-w-4xl">
      <div className="flex flex-wrap gap-2 mb-4">
        <button className="btn-primary" onClick={exportCsv}>
          <FileSpreadsheet size={16} /> Planilha (CSV)
        </button>
        <button className="btn-ghost" onClick={print}>
          <Printer size={16} /> Imprimir / PDF
        </button>
        {r.areaM2 !== null && <span className="text-sm text-slate-400 self-center ml-auto">Área: {(r.areaM2 / 1e6).toFixed(3)} km²</span>}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
        {[
          ['Cabos', formatLength(r.cableTotal)],
          ['CTOs', r.nodes.cto],
          ['Clientes', r.nodes.client],
          ['Portas livres', r.ports.total - r.ports.used],
          ['Fusões', r.fusions],
        ].map(([l, v]) => (
          <div key={l as string} className="rounded-md bg-slate-950 p-3">
            <div className="text-lg font-semibold">{v}</div>
            <div className="text-xs text-slate-400">{l}</div>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4 mt-4">
        <Section title="Elementos">
          <table className="w-full text-sm">
            <tbody>
              {types.map((t) => (
                <tr key={t} className="border-t border-slate-800">
                  <td className="py-1">{NODE_TYPES[t].plural}</td>
                  <td className="text-right font-semibold">{r.nodes[t]}</td>
                  <td className="text-right text-xs text-slate-500 pl-2">
                    {r.byStatus[t].deployed + r.byStatus[t].certified} implantados
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
        <Section title="Lista de materiais">
          <table className="w-full text-sm">
            <tbody>
              {r.cables.map((c) => (
                <tr key={c.name + c.category} className="border-t border-slate-800">
                  <td className="py-1">
                    {c.name} <span className="text-xs text-slate-500">{CABLE_CATEGORIES[c.category as keyof typeof CABLE_CATEGORIES].label}</span>
                  </td>
                  <td className="text-right">{m(c.meters + c.slack)}</td>
                </tr>
              ))}
              {(['aerial', 'underground'] as const)
                .filter((k) => r.slacks[k].count)
                .map((k) => (
                  <tr key={k} className="border-t border-slate-800">
                    <td className="py-1">Reserva {SLACK_KINDS[k].label.toLowerCase()}</td>
                    <td className="text-right">
                      {r.slacks[k].count} un · {m(r.slacks[k].meters)}
                    </td>
                  </tr>
                ))}
              {Object.entries(r.splitters).map(([k, v]) => (
                <tr key={k} className="border-t border-slate-800">
                  <td className="py-1">Splitter {k}</td>
                  <td className="text-right">{v} un</td>
                </tr>
              ))}
              {(['cto', 'ceo', 'box'] as NodeType[]).map((t) => (
                <tr key={t} className="border-t border-slate-800">
                  <td className="py-1">{t === 'box' ? 'Caixa de parede / subterrânea' : `Caixa ${NODE_TYPES[t].label}`}</td>
                  <td className="text-right">{r.nodes[t]} un</td>
                </tr>
              ))}
              <tr className="border-t border-slate-800">
                <td className="py-1">Fusões</td>
                <td className="text-right">{r.fusions}</td>
              </tr>
            </tbody>
          </table>
        </Section>
      </div>

      {r.condos.count > 0 && (
        <p className="text-xs text-slate-400 mt-3">
          Condomínios: {r.condos.count} · {r.condos.units} unidade(s) (casas/apartamentos)
        </p>
      )}
      {(Object.keys(r.wireless.radios).length > 0 || r.wireless.links > 0) && (
        <p className="text-xs text-slate-400 mt-3">
          Wireless: {Object.entries(r.wireless.radios).map(([k, n]) => `${n} ${k}`).join(' · ')}
          {r.wireless.links > 0 ? ` · ${r.wireless.links} enlace(s) PtP` : ''}
        </p>
      )}
      {r.clients.length > 0 && (
        <p className="text-xs text-slate-400 mt-3">
          Clientes: {r.clients.map((c) => `${c.count} ${POWER_LABEL[c.level].toLowerCase()}`).join(' · ')}
        </p>
      )}

      <Section title={`Caixas (${boxes.length})`} className="mt-4">
        <div className="max-h-64 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-400 text-left">
              <tr>
                <th>Caixa</th>
                <th>Tipo</th>
                <th>Status</th>
                <th className="text-right">Portas</th>
              </tr>
            </thead>
            <tbody>
              {boxes.map(({ b, used, total }) => (
                <tr key={b.id} className="border-t border-slate-800">
                  <td className="py-1">{b.name}</td>
                  <td>{NODE_TYPES[b.type].label}</td>
                  <td style={{ color: STATUSES[b.status].color }}>{STATUSES[b.status].label}</td>
                  <td className="text-right">{total ? `${used}/${total}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </Modal>
  );
}

function Section({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg bg-slate-950 border border-slate-800 p-3 ${className}`}>
      <div className="label">{title}</div>
      {children}
    </div>
  );
}
