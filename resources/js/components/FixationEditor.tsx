import { AlertTriangle, Archive, BrickWall, Home, Trees, UtilityPole } from 'lucide-react';
import { NODE_TYPES } from '../lib/catalog';
import { BOX_KINDS, BOX_MODELS, BOX_PLACES, FIX_HOST_TYPE, FIX_KINDS, boxNeedsAddress, boxOf, fixationIssue, fixedOn } from '../lib/fixation';
import { distance } from '../lib/geo';
import type { BoxAttributes, BoxKind, BoxPlace, FixAttributes, FixKind, NetNode } from '../lib/types';
import { Field, formatLength } from './ui';

const FIX_ICONS: Record<FixKind, React.ReactNode> = {
  pole: <UtilityPole size={16} />,
  wall: <BrickWall size={16} />,
  box: <Archive size={16} />,
};

const segBtn = (on: boolean) =>
  `flex flex-col items-center gap-1 rounded-md border py-1.5 text-[11px] cursor-pointer ${on ? 'border-emerald-500 bg-emerald-600/20 text-emerald-300' : 'border-slate-700 text-slate-300 hover:bg-slate-800'}`;

/** Campos "Fixada em" da CTO/CEO: poste, parede (com endereço) ou caixa. */
export function FixationFields({ node, nodes, value: a, onChange: set }: { node: NetNode; nodes: NetNode[]; value: FixAttributes; onChange: (p: FixAttributes) => void }) {
  const hostType = a.fixed_kind ? FIX_HOST_TYPE[a.fixed_kind] : undefined;
  const hosts = hostType
    ? nodes
        .filter((n) => n.type === hostType)
        .map((n) => ({ n, d: distance([node.lat, node.lng], [n.lat, n.lng]) }))
        .sort((x, y) => x.d - y.d)
        .slice(0, 60)
    : [];
  const host = hostType ? nodes.find((n) => n.id === a.fixed_id && n.type === hostType) : undefined;
  const hostBox = host?.type === 'box' ? boxOf(host) : undefined;
  const askAddress = a.fixed_kind === 'wall' || (hostBox && boxNeedsAddress(hostBox));
  // Aviso calculado com os valores do formulário (antes de salvar).
  const issue = fixationIssue({ ...node, attributes: { ...(node.attributes ?? {}), ...a } }, nodes);

  return (
    <div className="space-y-2">
      <div>
        <div className="label">Fixada em</div>
        <div className="grid grid-cols-3 gap-1.5">
          {(Object.keys(FIX_KINDS) as FixKind[]).map((k) => (
            <button
              key={k}
              type="button"
              title={FIX_KINDS[k].hint}
              aria-pressed={a.fixed_kind === k}
              onClick={() => set({ fixed_kind: k, fixed_id: k === a.fixed_kind ? a.fixed_id : undefined })}
              className={segBtn(a.fixed_kind === k)}
            >
              {FIX_ICONS[k]}
              {FIX_KINDS[k].label}
            </button>
          ))}
        </div>
      </div>
      {hostType && (
        <Field label={a.fixed_kind === 'pole' ? 'Poste' : 'Caixa'}>
          <select className="input" value={host ? host.id : ''} onChange={(e) => set({ fixed_id: e.target.value ? Number(e.target.value) : undefined })}>
            <option value="">{hosts.length ? '— escolha' : `— nenhum(a) ${NODE_TYPES[hostType].label.toLowerCase()} no projeto`}</option>
            {hosts.map(({ n, d }) => (
              <option key={n.id} value={n.id}>
                {n.name}
                {n.type === 'box' ? ` (${BOX_KINDS[boxOf(n).box_kind ?? 'underground'].label.toLowerCase()}, ${BOX_PLACES[boxOf(n).box_place ?? 'external'].label.toLowerCase()})` : ''} · {formatLength(d)}
              </option>
            ))}
          </select>
        </Field>
      )}
      {host && (
        <div className="text-xs text-slate-400">
          Fica junto ao ícone {host.type === 'box' ? 'da caixa' : 'do poste'} {host.name} no mapa e se move com {host.type === 'box' ? 'ela' : 'ele'}. Para soltar, escolha Parede.
        </div>
      )}
      {askAddress && (
        <Field label="Endereço do imóvel">
          <input className="input" placeholder={hostBox?.address || 'Rua, número, bairro'} value={a.address ?? ''} onChange={(e) => set({ address: e.target.value || undefined })} />
        </Field>
      )}
      {hostBox?.address && !a.address && <div className="text-xs text-slate-400">Endereço da caixa: {hostBox.address}</div>}
      {issue && (
        <div className="flex items-start gap-1.5 rounded-md border border-amber-500/50 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-300">
          <AlertTriangle size={14} className="mt-px shrink-0" /> {issue}
        </div>
      )}
    </div>
  );
}

/** Campos da Caixa: parede/subterrânea, interna/externa, modelo, endereço e o que está dentro. */
export function BoxFields({
  node,
  nodes,
  value: b,
  onChange: set,
  onSelect,
  onAdd,
}: {
  node: NetNode;
  nodes: NetNode[];
  value: BoxAttributes;
  onChange: (p: BoxAttributes) => void;
  onSelect?: (n: NetNode) => void;
  onAdd?: (type: 'cto' | 'ceo') => void;
}) {
  const inside = fixedOn(node, nodes);
  const needsAddress = boxNeedsAddress(b);
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="label">Tipo</div>
          <div className="grid grid-cols-2 gap-1">
            {(Object.keys(BOX_KINDS) as BoxKind[]).map((k) => (
              <button key={k} type="button" title={BOX_KINDS[k].hint} aria-pressed={(b.box_kind ?? 'underground') === k} onClick={() => set({ box_kind: k })} className={segBtn((b.box_kind ?? 'underground') === k)}>
                {k === 'wall' ? <BrickWall size={15} /> : <Archive size={15} />}
                {BOX_KINDS[k].label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="label">Local</div>
          <div className="grid grid-cols-2 gap-1">
            {(Object.keys(BOX_PLACES) as BoxPlace[]).map((k) => (
              <button key={k} type="button" title={BOX_PLACES[k].hint} aria-pressed={(b.box_place ?? 'external') === k} onClick={() => set({ box_place: k })} className={segBtn((b.box_place ?? 'external') === k)}>
                {k === 'internal' ? <Home size={15} /> : <Trees size={15} />}
                {BOX_PLACES[k].label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <Field label="Modelo / tamanho">
        <input className="input" list="box-models" placeholder="R1, R2, quadro 40x40..." value={b.model ?? ''} onChange={(e) => set({ model: e.target.value || undefined })} />
        <datalist id="box-models">
          {BOX_MODELS.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      </Field>
      <Field label={needsAddress ? 'Endereço do imóvel (obrigatório)' : 'Endereço / referência'}>
        <input className="input" placeholder="Rua, número, bairro" value={b.address ?? ''} onChange={(e) => set({ address: e.target.value || undefined })} />
      </Field>
      {needsAddress && !(b.address ?? '').trim() && (
        <div className="flex items-start gap-1.5 rounded-md border border-amber-500/50 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-300">
          <AlertTriangle size={14} className="mt-px shrink-0" /> {(b.box_kind ?? 'underground') === 'wall' ? 'Caixa de parede' : 'Caixa interna'}: informe o endereço do imóvel.
        </div>
      )}
      <div>
        <div className="label">CTO / CEO dentro da caixa</div>
        {inside.length ? (
          <ul className="space-y-1">
            {inside.map((n) => (
              <li key={n.id}>
                <button type="button" className="w-full rounded-md border border-slate-700 px-2 py-1 text-left text-sm hover:bg-slate-800 cursor-pointer" onClick={() => onSelect?.(n)}>
                  <span className="text-xs text-slate-400">{NODE_TYPES[n.type].label}</span> {n.name}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-xs text-slate-400">Nenhuma. A caixa também tem o próprio diagrama de fusão (emendas, splitters e cabos).</div>
        )}
        {onAdd && (
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            <button type="button" className="btn-ghost !py-1 text-xs" onClick={() => onAdd('cto')}>
              + CTO na caixa
            </button>
            <button type="button" className="btn-ghost !py-1 text-xs" onClick={() => onAdd('ceo')}>
              + CEO na caixa
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
