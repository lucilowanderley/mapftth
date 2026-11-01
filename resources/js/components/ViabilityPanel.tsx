import { CheckCircle2, Search, X, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { ViabilityOption } from '../lib/analysis';
import { POWER_COLORS, POWER_LABEL } from '../lib/budget';
import { searchPlaces, type Place } from '../lib/geocode';
import type { LatLng, NetNode } from '../lib/types';
import { formatLength } from './ui';

interface Props {
  point: LatLng | null;
  radius: number;
  options: ViabilityOption[];
  onRadius: (r: number) => void;
  onPoint: (p: LatLng) => void;
  onFocus: (n: NetNode) => void;
  onClose: () => void;
}

export default function ViabilityPanel({ point, radius, options, onRadius, onPoint, onFocus, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[]>([]);

  useEffect(() => {
    const t = setTimeout(() => searchPlaces(query).then(setResults).catch(() => setResults([])), 400);
    return () => clearTimeout(t);
  }, [query]);

  const viable = useMemo(() => options.filter((o) => o.free.length > 0), [options]);

  return (
    <div className="absolute top-3 left-3 z-[1000] panel w-72 max-h-[calc(100%-1.5rem)] overflow-y-auto">
      <div className="flex items-start justify-between px-4 py-3 border-b border-slate-800">
        <div>
          <div className="font-semibold">Viabilidade</div>
          <div className="text-xs text-slate-400">Busque o endereço ou clique no mapa</div>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-white cursor-pointer" aria-label="Fechar">
          <X size={18} />
        </button>
      </div>
      <div className="p-4 space-y-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-2.5 text-slate-500" />
          <input className="input pl-8" placeholder="Endereço do cliente" value={query} onChange={(e) => setQuery(e.target.value)} />
          {results.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full rounded-md border border-slate-700 bg-slate-900 text-sm shadow-xl">
              {results.map((r) => (
                <li key={r.label}>
                  <button
                    className="w-full text-left px-3 py-1.5 hover:bg-slate-800 truncate cursor-pointer"
                    onClick={() => {
                      onPoint([r.lat, r.lng]);
                      setResults([]);
                      setQuery(r.label.split(',').slice(0, 2).join(','));
                    }}
                  >
                    {r.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <label className="block">
          <span className="label">Raio de atendimento: {radius} m</span>
          <input type="range" min={50} max={1000} step={50} value={radius} onChange={(e) => onRadius(Number(e.target.value))} className="w-full accent-emerald-500" />
        </label>

        {point && (
          <div
            className={`rounded-lg border p-3 flex items-center gap-2 text-sm ${viable.length ? 'border-emerald-600 bg-emerald-600/10' : 'border-red-600 bg-red-600/10'}`}
          >
            {viable.length ? <CheckCircle2 className="text-emerald-400" size={18} /> : <XCircle className="text-red-400" size={18} />}
            {viable.length
              ? `Viável: ${viable.length} CTO(s) com porta livre a até ${radius} m`
              : options.length
                ? 'Inviável: as CTOs próximas estão sem porta livre'
                : `Inviável: nenhuma CTO a até ${radius} m`}
          </div>
        )}

        <ul className="space-y-2">
          {options.map((o) => (
            <li key={o.box.id}>
              <button onClick={() => onFocus(o.box)} className="w-full rounded-md bg-slate-950 p-2 text-left text-sm hover:bg-slate-800 cursor-pointer">
                <div className="flex justify-between">
                  <span className="font-medium">{o.box.name}</span>
                  <span className="text-slate-400">{formatLength(o.distance)}</span>
                </div>
                <div className="flex justify-between text-xs mt-0.5">
                  <span className={o.free.length ? 'text-slate-400' : 'text-red-400'}>{o.free.length} porta(s) livre(s)</span>
                  {o.best && (
                    <span style={{ color: POWER_COLORS[o.level] }}>
                      {o.best.budget.ok ? `${o.best.budget.power!.toFixed(1)} dBm na saída ${o.best.output}` : POWER_LABEL.none}
                    </span>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
        <p className="text-xs text-slate-500">Distância em linha reta. A potência mostrada é na saída do splitter, sem o drop.</p>
      </div>
    </div>
  );
}
