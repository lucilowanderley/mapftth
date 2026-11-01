import { useMemo, useState } from 'react';
import { POWER_COLORS, POWER_LABEL, powerLevel, type BudgetResult, type PowerLevel } from '../lib/budget';
import { NODE_TYPES, splitterModel } from '../lib/catalog';
import type { Cable, NetNode, Settings } from '../lib/types';
import { Modal, formatLength } from './ui';

export default function NetworkAnalysis({
  nodes,
  cables,
  power,
  settings,
  onClose,
  onFocus,
}: {
  nodes: NetNode[];
  cables: Cable[];
  power: Map<number, BudgetResult>;
  settings: Settings;
  onClose: () => void;
  onFocus: (n: NetNode) => void;
}) {
  const [filter, setFilter] = useState<PowerLevel | 'all'>('all');
  const clients = useMemo(
    () =>
      nodes
        .filter((n) => n.type === 'client')
        .map((n) => ({ node: n, result: power.get(n.id)!, level: powerLevel(power.get(n.id)?.power ?? null, settings) }))
        .sort((a, b) => (a.result.power ?? -99) - (b.result.power ?? -99)),
    [nodes, power, settings],
  );
  const counts = clients.reduce<Record<string, number>>((acc, c) => ({ ...acc, [c.level]: (acc[c.level] ?? 0) + 1 }), {});

  const boxes = nodes.filter((n) => n.type === 'cto');
  const ports = boxes.map((b) => {
    const splitters = (b.diagram?.components ?? []).filter((c) => c.kind === 'splitter');
    const conns = b.diagram?.connections ?? [];
    let total = 0;
    let used = 0;
    splitters.forEach((s) => {
      const outs = conns.filter((c) => [c.a, c.b].some((e) => e.c === s.id && e.p !== 'in')).length;
      total += s.kind === 'splitter' ? splitterModel(s.model).outputs : 0;
      used += outs;
    });
    return { box: b, total, used };
  });

  return (
    <Modal title="Análise de rede" onClose={onClose} width="max-w-3xl">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
        {[
          ['Clientes', clients.length],
          ['CTOs', boxes.length],
          ['Portas livres', ports.reduce((a, p) => a + Math.max(0, p.total - p.used), 0)],
          ['Cabos', formatLength(cables.reduce((a, c) => a + c.length_m + c.slack_m, 0))],
        ].map(([l, v]) => (
          <div key={l as string} className="rounded-md bg-slate-950 p-3">
            <div className="text-xl font-semibold">{v}</div>
            <div className="text-xs text-slate-400">{l}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5 mt-5">
        {(['all', 'ok', 'warn', 'critical', 'high', 'none'] as const).map((l) => (
          <button
            key={l}
            onClick={() => setFilter(l)}
            className={`rounded-full px-3 py-1 text-xs border cursor-pointer ${filter === l ? 'bg-slate-700 border-slate-500' : 'border-slate-700'}`}
          >
            {l === 'all' ? `Todos (${clients.length})` : `${POWER_LABEL[l]} (${counts[l] ?? 0})`}
          </button>
        ))}
      </div>
      <table className="w-full text-sm mt-3">
        <thead className="text-xs text-slate-400 text-left">
          <tr>
            <th className="py-1">Cliente</th>
            <th>Potência</th>
            <th>Perda</th>
            <th>Situação</th>
          </tr>
        </thead>
        <tbody>
          {clients
            .filter((c) => filter === 'all' || c.level === filter)
            .map(({ node, result, level }) => (
              <tr key={node.id} className="border-t border-slate-800 hover:bg-slate-800/50 cursor-pointer" onClick={() => onFocus(node)}>
                <td className="py-1.5">{node.name}</td>
                <td className="font-mono">{result.power !== null ? `${result.power.toFixed(2)} dBm` : '—'}</td>
                <td className="font-mono">{result.ok ? `${result.totalLoss.toFixed(2)} dB` : '—'}</td>
                <td>
                  <span style={{ color: POWER_COLORS[level] }}>{POWER_LABEL[level]}</span>
                  {result.error && <span className="text-xs text-slate-500"> · {result.error}</span>}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
      {clients.length === 0 && <p className="text-sm text-slate-500 mt-3">Nenhum cliente cadastrado.</p>}

      <div className="label mt-6">Ocupação das {NODE_TYPES.cto.plural}</div>
      <div className="grid sm:grid-cols-2 gap-2">
        {ports.map(({ box, total, used }) => (
          <button key={box.id} onClick={() => onFocus(box)} className="rounded-md bg-slate-950 p-2 text-left text-sm cursor-pointer hover:bg-slate-800">
            <div className="flex justify-between">
              <span>{box.name}</span>
              <span className="text-slate-400">
                {used}/{total} portas
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-800 mt-1">
              <div className="h-full rounded-full bg-orange-500" style={{ width: `${total ? (used / total) * 100 : 0}%` }} />
            </div>
          </button>
        ))}
      </div>
    </Modal>
  );
}
