import { useMemo } from 'react';
import { buildReport, portUsage } from '../lib/analysis';
import { POWER_COLORS, POWER_LABEL, type PowerLevel } from '../lib/budget';
import { CABLE_CATEGORIES, NODE_TYPES, NODE_TYPE_LIST, STATUSES } from '../lib/catalog';
import type { Activity, Network, NodeType, Status } from '../lib/types';
import { ACTIONS, TYPES } from './HistoryModal';
import { Modal, formatLength } from './ui';

export default function DashboardModal({ network, projectName, recent, onClose }: { network: Network; projectName: string; recent: Activity[] | null; onClose: () => void }) {
  const r = useMemo(() => buildReport(network), [network]);
  const total = network.nodes.length;
  const deployed = network.nodes.filter((n) => n.status === 'deployed' || n.status === 'certified').length;
  const pct = total ? Math.round((deployed / total) * 100) : 0;
  const clients = r.clients.reduce((a, c) => a + c.count, 0);
  const occupation = r.ports.total ? Math.round((r.ports.used / r.ports.total) * 100) : 0;
  const byCategory = (Object.keys(CABLE_CATEGORIES) as (keyof typeof CABLE_CATEGORIES)[]).map((cat) => ({
    cat,
    meters: network.cables.filter((c) => c.category === cat).reduce((a, c) => a + c.length_m + c.slack_m, 0),
  }));
  const maxCat = Math.max(1, ...byCategory.map((c) => c.meters));
  const ctoUsage = network.nodes
    .filter((n) => n.type === 'cto')
    .map((n) => ({ n, ...portUsage(n) }))
    .filter((u) => u.total > 0)
    .sort((a, b) => b.used / b.total - a.used / a.total)
    .slice(0, 8);
  const types: NodeType[] = NODE_TYPE_LIST;
  const statuses = Object.keys(STATUSES) as Status[];

  return (
    <Modal title={`Dashboard · ${projectName}`} onClose={onClose} width="max-w-5xl">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile label="Infraestrutura" value={String(r.nodes.cto + r.nodes.ceo + r.nodes.pop)} sub={`${r.nodes.cto} CTOs · ${r.nodes.ceo} CEOs · ${r.nodes.pop} POPs`} />
        <Tile label="Clientes" value={String(clients)} sub={`${r.ports.total - r.ports.used} portas livres`} />
        <Tile label="Cabos" value={formatLength(r.cableTotal)} sub={`${network.cables.length} cabos · ${r.fusions} fusões`} />
        <Tile label="Implantação" value={`${pct}%`} sub={`${deployed} de ${total} elementos`} />
      </div>

      <div className="grid md:grid-cols-2 gap-4 mt-4">
        <Card title="Infraestrutura por status">
          <div className="flex flex-wrap gap-3 text-xs text-slate-400 mb-3">
            {statuses.map((s) => (
              <span key={s} className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: STATUSES[s].color }} />
                {STATUSES[s].label}
              </span>
            ))}
          </div>
          <div className="space-y-2.5">
            {types.map((t) => {
              const count = r.nodes[t];
              return (
                <div key={t} className="text-sm">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-300">{NODE_TYPES[t].plural}</span>
                    <span className="text-slate-400">{count}</span>
                  </div>
                  <div className="flex h-2.5 gap-[2px] rounded bg-slate-800 overflow-hidden">
                    {count > 0 &&
                      statuses.map((s) =>
                        r.byStatus[t][s] ? (
                          <div
                            key={s}
                            title={`${NODE_TYPES[t].plural} · ${STATUSES[s].label}: ${r.byStatus[t][s]}`}
                            style={{ width: `${(r.byStatus[t][s] / count) * 100}%`, background: STATUSES[s].color }}
                          />
                        ) : null,
                      )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card title="Sinal nos clientes">
          {clients === 0 ? (
            <p className="text-sm text-slate-500">Nenhum cliente cadastrado.</p>
          ) : (
            <div className="space-y-2">
              {(['ok', 'warn', 'critical', 'high', 'none'] as PowerLevel[]).map((lvl) => {
                const count = r.clients.find((c) => c.level === lvl)?.count ?? 0;
                return (
                  <div key={lvl} className="flex items-center gap-3 text-sm" title={`${POWER_LABEL[lvl]}: ${count}`}>
                    <span className="w-24 text-xs text-slate-300">{POWER_LABEL[lvl]}</span>
                    <div className="flex-1 h-2.5 rounded bg-slate-800">
                      <div className="h-full rounded" style={{ width: `${(count / clients) * 100}%`, background: POWER_COLORS[lvl] }} />
                    </div>
                    <span className="w-14 text-right text-xs text-slate-400">
                      {count} · {Math.round((count / clients) * 100)}%
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card title="Metragem de cabos por tipo">
          <div className="space-y-2">
            {byCategory.map(({ cat, meters }) => (
              <div key={cat} className="flex items-center gap-3" title={`${CABLE_CATEGORIES[cat].label}: ${formatLength(meters)}`}>
                <span className="w-24 text-xs text-slate-300">{CABLE_CATEGORIES[cat].label}</span>
                <div className="flex-1 h-2.5 rounded bg-slate-800">
                  <div className="h-full rounded" style={{ width: `${(meters / maxCat) * 100}%`, background: CABLE_CATEGORIES[cat].color }} />
                </div>
                <span className="w-20 text-right text-xs text-slate-400">{formatLength(meters)}</span>
              </div>
            ))}
          </div>
          {Object.keys(r.splitters).length > 0 && (
            <div className="mt-4 text-xs text-slate-400">
              Splitters: {Object.entries(r.splitters).map(([k, v]) => `${v}× ${k}`).join(' · ')}
            </div>
          )}
        </Card>

        <Card title={`Ocupação das CTOs · ${occupation}% das portas em uso`}>
          {ctoUsage.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhuma CTO com splitter ainda.</p>
          ) : (
            <div className="space-y-2">
              {ctoUsage.map(({ n, used, total: t }) => (
                <div key={n.id} className="flex items-center gap-3" title={`${n.name}: ${used}/${t} portas`}>
                  <span className="w-24 text-xs text-slate-300 truncate">{n.name}</span>
                  <div className="flex-1 h-2.5 rounded bg-slate-800">
                    <div className="h-full rounded bg-orange-500" style={{ width: `${(used / t) * 100}%` }} />
                  </div>
                  <span className="w-14 text-right text-xs text-slate-400">
                    {used}/{t}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card title="Últimas alterações" className="mt-4">
        {!recent ? (
          <p className="text-sm text-slate-500">Carregando...</p>
        ) : recent.length === 0 ? (
          <p className="text-sm text-slate-500">Nada registrado ainda.</p>
        ) : (
          <ul className="text-sm divide-y divide-slate-800">
            {recent.slice(0, 8).map((a) => (
              <li key={a.id} className="py-1.5 flex justify-between gap-3">
                <span className="truncate">
                  <b>{a.user?.name ?? 'Alguém'}</b> · {ACTIONS[a.action] ?? a.action} {TYPES[a.subject_type] ?? ''} {a.subject_name}
                </span>
                <span className="text-xs text-slate-500 shrink-0">{new Date(a.created_at).toLocaleString('pt-BR')}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </Modal>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg bg-slate-950 border border-slate-800 p-4">
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
      <div className="text-xs text-slate-500 mt-0.5">{sub}</div>
    </div>
  );
}

function Card({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg bg-slate-950 border border-slate-800 p-4 ${className}`}>
      <div className="text-sm font-semibold mb-3">{title}</div>
      {children}
    </div>
  );
}
