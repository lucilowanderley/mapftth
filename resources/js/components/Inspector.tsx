import { Anchor, Building2, Layers, Layers2, Copy, Crosshair, History, Home, Link2, Network, Radar, Store, Trash2, UtilityPole, X } from 'lucide-react';
import type { SignalAnalysis } from '../lib/signal';
import { ClientSignalCard } from './SignalHealthBox';
import { CLIENT_SEGMENTS, clientDataOf, normalizeSerial, type ClientSegment } from '../lib/client';
import { useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../lib/api';
import { powerLevel, type BudgetResult } from '../lib/budget';
import { BOX_TYPES, CABLE_CATEGORIES, CABLE_MODELS, CONDO_KINDS, LINE_STYLES, NODE_TYPES, SLACK_KINDS, STATUSES, effectiveLineStyle, lineDash } from '../lib/catalog';
import type { BoxAttributes, FixAttributes, CameraAttributes, Cable, CableCategory, CondoAttributes, CondoKind, LatLng, LineStyle, NetNode, Slack, SlackKind, PoleAttributes, Settings, Status, TowerAttributes, TowerKind, TowerRadio } from '../lib/types';
import { RADIO_HOST_TYPES, TOWER_KINDS, radiosOf } from '../lib/tower';
import RadiosEditor from './RadiosEditor';
import { CameraDevice, CameraFields } from './CameraEditor';
import { CAMERA_KINDS, cameraOf } from '../lib/camera';
import { POLE_MATERIALS } from './PolesModal';
import { BoxFields, FixationFields } from './FixationEditor';
import { FIXABLE_TYPES, boxNeedsAddress, fixationIssue, fixedOn } from '../lib/fixation';
import { ANCHOR_HOST_TYPES, UNANCHOR_OFFSET_M, anchorHost, attachedTo } from '../lib/anchor';
import { roundLatLng } from '../lib/move';
import { destination } from '../lib/tower';
import { cablesNear } from '../lib/analysis';
import CableLossField, { lossRateText, parseLossRate } from './CableLossField';
import { Field, formatLength } from './ui';
import { formatCoord, parseLatLng, parsePair } from '../lib/coords';

const SWATCHES = ['#0ea5e9', '#2563eb', '#22c55e', '#ef4444', '#f97316', '#eab308', '#a855f7', '#ec4899', '#ffffff', '#0f172a'];

interface Props {
  node?: NetNode;
  cable?: Cable;
  nodes: NetNode[];
  budget?: BudgetResult;
  /** Cliente: sinal medido × estimado, saúde e trecho provável do problema. */
  signal?: SignalAnalysis;
  settings: Settings;
  onClose: () => void;
  onNodeSaved: (n: NetNode, cables: Cable[]) => void;
  onCableSaved: (c: Cable, nodes: NetNode[]) => void;
  onDeleted: (kind: 'node' | 'cable', id: number, touched?: NetNode[]) => void;
  onOpenDiagram: (n: NetNode) => void;
  onShowBudget: (n: NetNode) => void;
  onConnectClient: (n: NetNode) => void;
  onError: (message: string) => void;
  readOnly?: boolean;
  cables?: Cable[];
  onHistory?: (kind: 'node' | 'cable', id: number, name: string) => void;
  onOtdr?: (n: NetNode) => void;
  /** Muda a cada duplo clique no objeto: coloca o cursor no primeiro campo. */
  focusKey?: number;
  onLocate?: (at: LatLng) => void;
  /** Salva a lista de reservas técnicas do cabo (na hora, fora do "Salvar alterações"). */
  onSlacksChange?: (cable: Cable, slacks: Slack[]) => void;
  /** Liga a ferramenta Reserva para posicionar uma reserva neste cabo. */
  onPlaceSlack?: (cable: Cable) => void;
  /** Agrupamento no mapa do objeto selecionado: ativo e quantos objetos ele esconde. */
  group?: { active: boolean; count: number };
  /** Agrupa (esconde o que está à frente) ou desagrupa o objeto. */
  onToggleGroup?: (n: NetNode) => void;
  /** Seleciona outro objeto do mapa (ex.: câmera de um canal do DVR). */
  onSelectNode?: (n: NetNode) => void;
  /** Lança uma CTO/CEO dentro da caixa. */
  onAddInBox?: (box: NetNode, type: 'cto' | 'ceo') => void;
  /** Abre o editor do poste/caixa (objetos fixados e barra de ferramentas). */
  onOpenHost?: (host: NetNode) => void;
}

/** Foca e seleciona o campo quando focusKey muda (duplo clique no mapa). */
function useFocusOn(focusKey?: number) {
  const ref = useRef<HTMLInputElement>(null);
  const initial = useRef(focusKey);
  useEffect(() => {
    if (focusKey && focusKey !== initial.current) {
      ref.current?.focus();
      ref.current?.select();
    }
  }, [focusKey]);
  return ref;
}

export default function Inspector(props: Props) {
  return (
    // inspector: campos mais compactos (app.css); cabeçalho e botões de salvar ficam fixos enquanto o meio rola.
    <div className="inspector absolute top-3 left-3 z-[1000] panel w-80 max-h-[calc(100%-1.5rem)] overflow-y-auto overscroll-contain">
      {props.node ? <NodeForm {...props} node={props.node} /> : props.cable ? <CableForm {...props} cable={props.cable} /> : null}
    </div>
  );
}

function Header({ title, subtitle, onClose }: { title: string; subtitle: string; onClose: () => void }) {
  return (
    <div className="sticky top-0 z-10 flex items-start justify-between px-4 py-2.5 border-b border-slate-800 bg-slate-900 rounded-t-xl">
      <div className="min-w-0">
        <div className="font-semibold truncate">{title}</div>
        <div className="text-xs text-slate-400">{subtitle}</div>
      </div>
      <button onClick={onClose} className="text-slate-400 hover:text-white cursor-pointer" aria-label="Fechar">
        <X size={18} />
      </button>
    </div>
  );
}

function StatusSelect({ value, onChange }: { value: Status; onChange: (s: Status) => void }) {
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value as Status)}>
      {(Object.keys(STATUSES) as Status[]).map((s) => (
        <option key={s} value={s}>
          {STATUSES[s].label}
        </option>
      ))}
    </select>
  );
}

function Actions({
  readOnly,
  onRemove,
  onSave,
  saving,
  onHistory,
}: {
  readOnly?: boolean;
  onRemove: () => void;
  onSave: () => void;
  saving: boolean;
  onHistory?: () => void;
}) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 -mb-3 flex gap-2 border-t border-slate-800 bg-slate-900 px-4 py-2.5 rounded-b-xl">
      {!readOnly && (
        <button className="btn-danger" onClick={onRemove} title="Excluir">
          <Trash2 size={16} />
        </button>
      )}
      {onHistory && (
        <button type="button" className="btn-ghost" onClick={onHistory} title="Histórico de alterações">
          <History size={16} />
        </button>
      )}
      {!readOnly && (
        <button className="btn-primary flex-1" onClick={onSave} disabled={saving}>
          Salvar alterações
        </button>
      )}
    </div>
  );
}

function NodeForm({
  node,
  nodes,
  budget,
  signal,
  settings,
  readOnly,
  cables,
  onClose,
  onNodeSaved,
  onDeleted,
  onOpenDiagram,
  onShowBudget,
  group,
  onToggleGroup,
  onConnectClient,
  onError,
  onHistory,
  onOtdr,
  focusKey,
  onLocate,
  onSelectNode,
  onAddInBox,
  onOpenHost,
}: Props & { node: NetNode }) {
  const nameRef = useFocusOn(focusKey);
  const [lat, setLat] = useState(formatCoord(node.lat));
  const [lng, setLng] = useState(formatCoord(node.lng));
  // Se o objeto for arrastado no mapa com o painel aberto, os campos acompanham.
  useEffect(() => {
    setLat(formatCoord(node.lat));
    setLng(formatCoord(node.lng));
  }, [node.lat, node.lng]);
  const [name, setName] = useState(node.name);
  const [status, setStatus] = useState<Status>(node.status);
  const [notes, setNotes] = useState(node.notes ?? '');
  const [address, setAddress] = useState((node.attributes?.address as string) ?? '');
  // Cliente: dados para integração (ID no sistema de gestão, serial da ONU/ONT e tipo).
  const initialClient = clientDataOf(node.attributes);
  const [clientCode, setClientCode] = useState(initialClient.client_code ?? '');
  const [onuSerial, setOnuSerial] = useState(initialClient.onu_serial ?? '');
  const [segment, setSegment] = useState<ClientSegment | null>(initialClient.segment ?? null);
  const [rx, setRx] = useState(initialClient.rx_dbm != null ? String(initialClient.rx_dbm) : '');
  const rxNum = rx.trim() === '' ? null : Number(rx.replace(',', '.'));
  const rxBad = rxNum !== null && (Number.isNaN(rxNum) || rxNum < -60 || rxNum > 10);
  const [pole, setPole] = useState<PoleAttributes>((node.attributes as PoleAttributes) ?? {});
  const setP = (patch: PoleAttributes) => setPole((p) => ({ ...p, ...patch }));
  const [condo, setCondo] = useState<CondoAttributes>(() => ({ condo_kind: 'buildings', ...((node.attributes as CondoAttributes) ?? {}) }));
  const setC = (patch: CondoAttributes) => setCondo((c) => ({ ...c, ...patch }));
  const [tower, setTower] = useState<TowerAttributes>(() => ({ ...((node.attributes as TowerAttributes) ?? {}) }));
  const setT = (patch: TowerAttributes) => setTower((t) => ({ ...t, ...patch }));
  const [radios, setRadios] = useState<TowerRadio[]>(() => radiosOf(node));
  const hasRadios = RADIO_HOST_TYPES.includes(node.type);
  // Câmera / DVR: atributos editáveis (sem a situação do último teste, que vem do servidor) e senha nova.
  const [camera, setCamera] = useState<CameraAttributes>(() => {
    const { cam_status: _s, ...rest } = cameraOf(node);
    return { cam_kind: 'ip', ...rest };
  });
  const setCam = (patch: CameraAttributes) => setCamera((c) => ({ ...c, ...patch }));
  // CTO/CEO: onde está fixada (poste, parede ou caixa). Caixa: tipo, local e endereço.
  const fixable = FIXABLE_TYPES.includes(node.type);
  const [fix, setFix] = useState<FixAttributes>(() => {
    const a = (node.attributes ?? {}) as FixAttributes;
    return { fixed_kind: a.fixed_kind, fixed_id: a.fixed_id, address: a.address };
  });
  const setFx = (patch: FixAttributes) => setFix((f) => ({ ...f, ...patch }));
  const [box, setBox] = useState<BoxAttributes>(() => ({ box_kind: 'underground', box_place: 'external', ...((node.attributes as BoxAttributes) ?? {}) }));
  const setBx = (patch: BoxAttributes) => setBox((b) => ({ ...b, ...patch }));
  const [camPassword, setCamPassword] = useState('');
  const [camClear, setCamClear] = useState(false);
  const dec = (v: string) => (v.trim() === '' ? undefined : Math.max(0, Number(v.replace(',', '.')) || 0));
  const num = (v: string) => (v === '' ? undefined : Math.max(0, Math.round(Number(v)) || 0));
  const cablesHere = cablesNear([node.lat, node.lng], cables ?? []);
  const [saving, setSaving] = useState(false);
  const hasDiagram = BOX_TYPES.includes(node.type);
  // Fixado num poste/caixa: não se move sozinho (mesma posição do poste/caixa).
  const host = anchorHost(node, nodes);
  const anchored = !!host;
  const isHost = ANCHOR_HOST_TYPES.includes(node.type);
  const level = budget ? powerLevel(budget.power, settings) : null;

  async function save() {
    const pos = parseLatLng(lat, lng);
    if (typeof pos === 'string') return onError(pos);
    // Fixado num poste/caixa: a posição é sempre a do poste/caixa (se mudou de poste/caixa, vai para o novo).
    // Se deixou de estar num poste/caixa (ex.: parede), sai um pouco para o lado e ganha ícone próprio.
    const nextAttrs = { ...(node.attributes ?? {}), ...(fixable ? fix : {}), ...(node.type === 'camera' ? { mount_id: camera.mount_id } : {}) };
    const nextHost = anchorHost({ ...node, attributes: nextAttrs }, nodes);
    if (nextHost) {
      pos[0] = nextHost.lat;
      pos[1] = nextHost.lng;
    } else if (host && Math.abs(pos[0] - host.lat) < 1e-9 && Math.abs(pos[1] - host.lng) < 1e-9) {
      [pos[0], pos[1]] = roundLatLng(destination([host.lat, host.lng], 150, UNANCHOR_OFFSET_M));
    }
    const endsOnly = !!(host || nextHost);
    const moved = Math.abs(pos[0] - node.lat) > 1e-9 || Math.abs(pos[1] - node.lng) > 1e-9;
    // Toda CTO/CEO precisa estar fixada (poste, parede ou caixa); parede/caixa em imóvel pede o endereço.
    if (fixable) {
      const issue = fixationIssue({ ...node, attributes: { ...(node.attributes ?? {}), ...fix } }, nodes);
      if (issue) return onError(issue);
    }
    if (node.type === 'box' && boxNeedsAddress(box) && !(box.address ?? '').trim()) return onError('Caixa de parede ou interna: informe o endereço do imóvel.');
    setSaving(true);
    try {
      const r = await api.updateNode(node.id, {
        ...(moved ? { lat: pos[0], lng: pos[1], ...(endsOnly ? { ends_only: true } : {}) } : {}),
        name,
        status,
        notes: notes || null,
        attributes: {
          ...(node.attributes ?? {}),
          ...(node.type === 'client'
            ? {
                address,
                client_code: clientCode.trim() || null,
                onu_serial: normalizeSerial(onuSerial) || null,
                segment,
                rx_dbm: rxNum === null || rxBad ? null : Math.round(rxNum * 100) / 100,
                // A data da medição só muda quando o valor muda.
                rx_at: rxNum === null || rxBad ? null : rxNum === initialClient.rx_dbm ? (initialClient.rx_at ?? null) : new Date().toISOString(),
              }
            : {}),
          ...(node.type === 'pole' ? pole : {}),
          ...(fixable ? { fixed_kind: fix.fixed_kind ?? null, fixed_id: fix.fixed_kind === 'wall' ? null : (fix.fixed_id ?? null), address: (fix.address ?? '').trim() || null } : {}),
          ...(node.type === 'box' ? { ...box, address: (box.address ?? '').trim() || null } : {}),
          ...(node.type === 'condo' ? condo : {}),
          ...(node.type === 'tower' ? tower : {}),
          ...(hasRadios ? { radios } : {}),
          ...(node.type === 'camera'
            ? {
                ...camera,
                cam_status: cameraOf(node).cam_status,
                ...(camPassword ? { password: camPassword } : {}),
                ...(camClear && !camPassword ? { password_clear: true } : {}),
              }
            : {}),
          anchored: undefined,
        },
      });
      onNodeSaved(r.node, r.cables);
      if (node.type === 'camera') {
        setCamPassword('');
        setCamClear(false);
        setCam({ cam_has_password: !!cameraOf(r.node).cam_has_password });
      }
      if (moved) onLocate?.([r.node.lat, r.node.lng]);
    } catch (e) {
      onError(errorMessage(e));
    }
    setSaving(false);
  }

  async function remove() {
    if (!confirm(`Excluir ${node.name}?`)) return;
    try {
      await api.deleteNode(node.id);
      onDeleted('node', node.id);
    } catch (e) {
      onError(errorMessage(e));
    }
  }

  return (
    <>
      <Header title={node.name} subtitle={`${node.type === 'camera' ? CAMERA_KINDS[cameraOf(node).cam_kind ?? 'ip'].label : NODE_TYPES[node.type].label} · ${node.lat.toFixed(6)}, ${node.lng.toFixed(6)}`} onClose={onClose} />
      <div className="px-4 pt-3 pb-3 space-y-2.5">
        {hasDiagram && (
          <button className="btn-primary w-full" onClick={() => onOpenDiagram(node)}>
            <Network size={16} /> {node.type === 'pop' ? 'Editor do POP' : node.type === 'dc' ? 'Editor do Datacenter' : node.type === 'tower' ? 'Shelter da torre (racks)' : 'Diagrama de fusão'}
          </button>
        )}
        {isHost && onOpenHost && (
          <button className={node.type === 'pole' ? 'btn-primary w-full' : 'btn-ghost w-full'} onClick={() => onOpenHost(node)} title="Objetos fixados e barra de ferramentas para implantar CTO, CEO, câmera e reserva">
            {node.type === 'pole' ? <UtilityPole size={16} /> : <Anchor size={16} />} {node.type === 'pole' ? 'Editor do poste' : 'Editor da caixa'}
            {attachedTo(node, nodes).length ? ` (${attachedTo(node, nodes).length})` : ''}
          </button>
        )}
        {node.type !== 'client' && node.type !== 'camera' && onToggleGroup && (
          <button
            type="button"
            className={group?.active ? 'btn-primary w-full' : 'btn-ghost w-full'}
            onClick={() => onToggleGroup(node)}
            title={group?.active ? 'Mostra de novo os objetos à frente' : 'Esconde os objetos à frente pelos cabos de saída e derivações'}
          >
            {group?.active ? <Layers2 size={16} /> : <Layers size={16} />}
            {group?.active ? `Desagrupar (${group.count} ${group.count === 1 ? 'oculto' : 'ocultos'})` : 'Agrupar objetos à frente'}
          </button>
        )}
        {node.type === 'client' && <ClientSignalCard budget={budget} level={level} signal={signal} onOpen={budget ? () => onShowBudget(node) : undefined} />}
        {node.type === 'camera' && (
          <CameraDevice
            node={node}
            nodes={nodes}
            readOnly={readOnly}
            onNodeSaved={(n) => onNodeSaved(n, [])}
            onError={onError}
            onUseInfo={setCam}
            onSelect={onSelectNode}
          />
        )}
        {node.type === 'client' && budget && budget.power !== null && onOtdr && (
          <button type="button" className="btn-ghost w-full" onClick={() => onOtdr(node)}>
            <Radar size={16} /> Simular OTDR / localizar evento
          </button>
        )}
        {node.type === 'client' && !budget?.steps.length && !readOnly && (
          <button className="btn-ghost w-full" onClick={() => onConnectClient(node)}>
            <Link2 size={16} /> Ligar drop à CTO mais próxima
          </button>
        )}
        {/* fieldset desabilitado: quem tem acesso de leitura só visualiza os campos */}
        <fieldset disabled={readOnly} className="min-w-0 space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Nome">
              <input ref={nameRef} className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Status">
              <StatusSelect value={status} onChange={setStatus} />
            </Field>
          </div>
          <div>
            <div className="label flex items-center justify-between">
              <span title="Graus decimais (-6.4825918) ou GMS (6°28'57&quot;S)">Posição (decimal ou GMS)</span>
              <span className="flex gap-2 normal-case">
                {onLocate && (
                  <button type="button" className="text-slate-400 hover:text-white cursor-pointer" title="Centralizar no mapa" onClick={() => onLocate([node.lat, node.lng])}>
                    <Crosshair size={13} />
                  </button>
                )}
                <button
                  type="button"
                  className="text-slate-400 hover:text-white cursor-pointer"
                  title="Copiar coordenadas"
                  onClick={() => navigator.clipboard?.writeText(`${formatCoord(node.lat)}, ${formatCoord(node.lng)}`)}
                >
                  <Copy size={13} />
                </button>
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                className="input font-mono text-xs"
                aria-label="Latitude"
                placeholder="Latitude"
                disabled={anchored}
                title={anchored ? 'Fixada no poste/caixa: a posição é a dele (move junto com ele)' : undefined}
                value={lat}
                onChange={(e) => {
                  // Colar "lat, lng" no campo de latitude preenche os dois.
                  const pair = parsePair(e.target.value);
                  if (pair) {
                    setLat(formatCoord(pair[0]));
                    setLng(formatCoord(pair[1]));
                  } else setLat(e.target.value);
                }}
              />
              <input className="input font-mono text-xs" aria-label="Longitude" placeholder="Longitude" disabled={anchored} title={anchored ? 'Fixada no poste/caixa: a posição é a dele (move junto com ele)' : undefined} value={lng} onChange={(e) => setLng(e.target.value)} />
            </div>
          </div>
          {node.type === 'client' && (
            <Field label="Endereço">
              <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} />
            </Field>
          )}
          {node.type === 'client' && (
            <>
              <Field label="Tipo de cliente">
                <div className="grid grid-cols-3 gap-1.5">
                  {(Object.keys(CLIENT_SEGMENTS) as ClientSegment[]).map((k) => {
                    const Icon = k === 'residential' ? Home : k === 'business' ? Store : Building2;
                    const on = segment === k;
                    return (
                      <button
                        key={k}
                        type="button"
                        aria-pressed={on}
                        disabled={readOnly}
                        onClick={() => setSegment(on ? null : k)}
                        className={`flex items-center justify-center gap-1 rounded-md border py-1 text-[11px] cursor-pointer ${on ? 'border-emerald-500 bg-emerald-600/20 text-emerald-300' : 'border-slate-700 text-slate-300 hover:bg-slate-800'}`}
                      >
                        <Icon size={13} className="shrink-0" />
                        {CLIENT_SEGMENTS[k]}
                      </button>
                    );
                  })}
                </div>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="ID do cliente">
                  <input className="input" maxLength={64} value={clientCode} onChange={(e) => setClientCode(e.target.value)} />
                </Field>
                <Field label="Sinal medido (dBm)">
                  <input className="input font-mono" inputMode="decimal" placeholder="ex.: -21,4" title="Sinal medido na ONU/ONT, em dBm" value={rx} onChange={(e) => setRx(e.target.value)} />
                </Field>
              </div>
              <Field label="Serial ONU/ONT">
                <input
                  className="input font-mono uppercase"
                  maxLength={64}
                  placeholder="HWTC1A2B3C4D"
                  value={onuSerial}
                  onChange={(e) => setOnuSerial(e.target.value)}
                  onBlur={() => setOnuSerial(normalizeSerial(onuSerial))}
                />
              </Field>
              {rxBad && <p className="text-xs text-red-400">Informe um valor entre -60 e 10 dBm.</p>}
            </>
          )}
          {node.type === 'tower' && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Tipo de torre">
                  <select className="input" value={tower.tower_kind ?? ''} onChange={(e) => setT({ tower_kind: (e.target.value || undefined) as TowerKind | undefined })}>
                    <option value="">—</option>
                    {(Object.keys(TOWER_KINDS) as TowerKind[]).map((k) => (
                      <option key={k} value={k}>
                        {TOWER_KINDS[k]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Altura (m)">
                  <input className="input" inputMode="decimal" value={tower.height_m ?? ''} onChange={(e) => setT({ height_m: dec(e.target.value) })} />
                </Field>
                <Field label="Código do site">
                  <input className="input" placeholder="SP-STM-001" value={tower.site_code ?? ''} onChange={(e) => setT({ site_code: e.target.value || undefined })} />
                </Field>
                <Field label="Detentora / proprietário">
                  <input className="input" value={tower.owner ?? ''} onChange={(e) => setT({ owner: e.target.value || undefined })} />
                </Field>
              </div>
              <Field label="Endereço">
                <input className="input" value={tower.address ?? ''} onChange={(e) => setT({ address: e.target.value || undefined })} />
              </Field>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={!!tower.shelter} onChange={(e) => setT({ shelter: e.target.checked || undefined })} />
                Tem shelter / abrigo com racks
              </label>
            </>
          )}
          {node.type === 'camera' && (
            <CameraFields
              node={node}
              nodes={nodes}
              value={camera}
              onChange={setCam}
              password={camPassword}
              onPassword={setCamPassword}
              clearPassword={camClear}
              onClearPassword={setCamClear}
            />
          )}
          {fixable && <FixationFields node={node} nodes={nodes} value={fix} onChange={setFx} />}
          {node.type === 'box' && <BoxFields node={node} nodes={nodes} value={box} onChange={setBx} onSelect={onSelectNode} onAdd={!readOnly && onAddInBox ? (t) => onAddInBox(node, t) : undefined} />}
          {hasRadios && <RadiosEditor node={node} nodes={nodes} radios={radios} onChange={setRadios} readOnly={readOnly} />}
          {node.type === 'condo' && (
            <>
              <div>
                <div className="label">Tipo de condomínio</div>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(CONDO_KINDS) as CondoKind[]).map((k) => (
                    <button
                      type="button"
                      key={k}
                      onClick={() => setC({ condo_kind: k, ...(k === 'houses' ? { floors: undefined } : {}) })}
                      className={`rounded-md border px-2 py-1.5 text-sm cursor-pointer ${condo.condo_kind === k ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 hover:border-slate-500'}`}
                    >
                      {CONDO_KINDS[k].label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label={CONDO_KINDS[condo.condo_kind ?? 'buildings'].units}>
                  <input type="number" min={0} className="input" value={condo.units ?? ''} onChange={(e) => setC({ units: num(e.target.value) })} />
                </Field>
                <Field label={CONDO_KINDS[condo.condo_kind ?? 'buildings'].block}>
                  <input type="number" min={0} className="input" value={condo.blocks ?? ''} onChange={(e) => setC({ blocks: num(e.target.value) })} />
                </Field>
                {condo.condo_kind !== 'houses' && (
                  <Field label="Andares">
                    <input type="number" min={0} className="input" value={condo.floors ?? ''} onChange={(e) => setC({ floors: num(e.target.value) })} />
                  </Field>
                )}
              </div>
              <Field label="Endereço">
                <input className="input" value={condo.address ?? ''} onChange={(e) => setC({ address: e.target.value })} />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Síndico / contato">
                  <input className="input" value={condo.manager ?? ''} onChange={(e) => setC({ manager: e.target.value })} />
                </Field>
                <Field label="Telefone">
                  <input className="input" value={condo.phone ?? ''} onChange={(e) => setC({ phone: e.target.value })} />
                </Field>
              </div>
            </>
          )}
          {node.type === 'pole' && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Código / plaqueta">
                  <input className="input" value={pole.code ?? ''} onChange={(e) => setP({ code: e.target.value })} />
                </Field>
                <Field label="Material">
                  <select className="input" value={pole.material ?? ''} onChange={(e) => setP({ material: e.target.value })}>
                    <option value="">—</option>
                    {POLE_MATERIALS.map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Altura (m)">
                  <input
                    type="number"
                    className="input"
                    value={pole.height_m ?? ''}
                    onChange={(e) =>
                      setP({
                        height_m: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                  />
                </Field>
                <Field label="Esforço (daN)">
                  <input
                    type="number"
                    className="input"
                    value={pole.load_dan ?? ''}
                    onChange={(e) =>
                      setP({
                        load_dan: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                  />
                </Field>
              </div>
              <Field label="Distribuidora / proprietário">
                <input className="input" value={pole.owner ?? ''} onChange={(e) => setP({ owner: e.target.value })} />
              </Field>
              {fixedOn(node, nodes).length > 0 && (
                <div className="text-xs text-slate-400">
                  Fixadas neste poste:{' '}
                  {fixedOn(node, nodes).map((n, i) => (
                    <span key={n.id}>
                      {i > 0 && ', '}
                      <button type="button" className="text-sky-400 hover:underline cursor-pointer" onClick={() => onSelectNode?.(n)}>
                        {n.name}
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="text-xs text-slate-400">Cabos neste poste: {cablesHere.length ? cablesHere.map((c) => c.name).join(', ') : 'nenhum'}</div>
            </>
          )}
          <Field label="Observações">
            <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </fieldset>
        <Actions readOnly={readOnly} onRemove={remove} onSave={save} saving={saving} onHistory={onHistory && (() => onHistory('node', node.id, node.name))} />
      </div>
    </>
  );
}

function CableForm({ cable, nodes, settings, readOnly, onClose, onCableSaved, onDeleted, onError, onHistory, focusKey, onSlacksChange, onPlaceSlack, onLocate }: Props & { cable: Cable }) {
  const nameRef = useFocusOn(focusKey);
  const [form, setForm] = useState({
    name: cable.name,
    model: cable.model ?? '',
    fiber_count: cable.fiber_count,
    fibers_per_tube: cable.fibers_per_tube,
    category: cable.category,
    status: cable.status,
    color: cable.color,
    width: cable.width,
    line_style: cable.line_style,
    notes: cable.notes ?? '',
  });
  const [lossText, setLossText] = useState(lossRateText(cable.loss_db_km));
  const [saving, setSaving] = useState(false);
  const from = nodes.find((n) => n.id === cable.from_node_id);
  const to = nodes.find((n) => n.id === cable.to_node_id);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  function pickModel(id: string) {
    const m = CABLE_MODELS.find((x) => x.id === id);
    if (!m) return set({ model: '' });
    set({
      model: m.id,
      name: m.name,
      fiber_count: m.fibers,
      fibers_per_tube: m.perTube,
      category: m.category,
      color: CABLE_CATEGORIES[m.category].color,
    });
  }

  async function save() {
    if (lossText.trim() && parseLossRate(lossText) === null) return onError('Atenuação do cabo: informe um valor entre 0 e 10 dB/km.');
    if (form.fiber_count < cable.fiber_count && !confirm('Reduzir o número de fibras remove as fusões das fibras excedentes. Continuar?')) return;
    setSaving(true);
    try {
      const r = await api.updateCable(cable.id, {
        ...form,
        model: form.model || null,
        notes: form.notes || null,
        loss_db_km: parseLossRate(lossText),
      });
      onCableSaved(r.cable, r.nodes);
    } catch (e) {
      onError(errorMessage(e));
    }
    setSaving(false);
  }

  async function remove() {
    if (!confirm(`Excluir ${cable.name}? As fusões deste cabo nas caixas também serão removidas.`)) return;
    try {
      const r = await api.deleteCable(cable.id);
      onDeleted('cable', cable.id, r.nodes);
    } catch (e) {
      onError(errorMessage(e));
    }
  }

  return (
    <>
      <Header title={cable.name} subtitle={`${from?.name ?? 'Ponta solta'} → ${to?.name ?? 'Ponta solta'}`} onClose={onClose} />
      <div className="px-4 pt-3 pb-3 space-y-2.5">
        <fieldset disabled={readOnly} className="space-y-2.5">
          <Field label="Modelo do catálogo">
            <select className="input" value={form.model} onChange={(e) => pickModel(e.target.value)}>
              <option value="">Personalizado</option>
              {CABLE_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Nome do cabo">
            <input ref={nameRef} className="input" value={form.name} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Fibras">
              <input
                type="number"
                min={1}
                max={288}
                className="input"
                value={form.fiber_count}
                onChange={(e) =>
                  set({
                    fiber_count: Number(e.target.value),
                    model: '',
                  })
                }
              />
            </Field>
            <Field label="Fibras/tubo">
              <input
                type="number"
                min={1}
                max={24}
                className="input"
                value={form.fibers_per_tube}
                onChange={(e) =>
                  set({
                    fibers_per_tube: Number(e.target.value),
                  })
                }
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Tipo">
              <select
                className="input"
                value={form.category}
                onChange={(e) =>
                  set({
                    category: e.target.value as CableCategory,
                  })
                }
              >
                {(Object.keys(CABLE_CATEGORIES) as CableCategory[]).map((c) => (
                  <option key={c} value={c}>
                    {CABLE_CATEGORIES[c].label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              <StatusSelect value={form.status} onChange={(status) => set({ status })} />
            </Field>
          </div>
          <CableLossField value={lossText} onChange={setLossText} projectRate={settings.fiber_loss_db_km} meters={cable.length_m + cable.slack_m} disabled={readOnly} />
          <div className="rounded-md bg-slate-950 p-3 text-xs space-y-1">
            <div className="flex justify-between text-slate-400">
              <span>Padrão de cores</span>
              <span>ABNT</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Comprimento geométrico</span>
              <span>{formatLength(cable.length_m)}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Reserva técnica ({cable.slacks?.length ?? 0})</span>
              <span>{formatLength(cable.slack_m)}</span>
            </div>
            <div className="flex justify-between font-semibold text-emerald-400 pt-1 border-t border-slate-800">
              <span>Total</span>
              <span>{formatLength(cable.length_m + cable.slack_m)}</span>
            </div>
          </div>
          <SlackList cable={cable} readOnly={readOnly} onChange={(list) => onSlacksChange?.(cable, list)} onPlace={() => onPlaceSlack?.(cable)} onLocate={onLocate} />
          <Field label="Cor no mapa">
            <div className="flex flex-wrap gap-1.5 items-center">
              {SWATCHES.map((c) => (
                <button
                  key={c}
                  onClick={() => set({ color: c })}
                  className={`w-5 h-5 rounded-full border-2 cursor-pointer ${form.color === c ? 'border-yellow-400' : 'border-slate-700'}`}
                  style={{ background: c }}
                  aria-label={c}
                />
              ))}
              <input type="color" value={form.color} onChange={(e) => set({ color: e.target.value })} className="w-6 h-6 bg-transparent cursor-pointer" />
            </div>
          </Field>
          <Field label={`Espessura: ${form.width}px`}>
            <input
              type="range"
              min={1}
              max={12}
              value={form.width}
              onChange={(e) => set({ width: Number(e.target.value) })}
              className="w-full accent-emerald-500"
            />
          </Field>
          <Field label="Estilo da linha">
            <div className="grid grid-cols-4 gap-1">
              {([null, 'solid', 'dashed', 'dotted'] as (LineStyle | null)[]).map((st) => {
                const shown = st ?? effectiveLineStyle({ line_style: null, status: form.status });
                const w = Math.min(form.width, 5);
                return (
                  <button
                    key={st ?? 'auto'}
                    type="button"
                    onClick={() => set({ line_style: st })}
                    title={st ? LINE_STYLES[st].label : 'Automático: tracejado quando Em projeto, contínuo nos demais'}
                    className={`rounded-md border px-1 pt-1.5 pb-1 text-[10px] cursor-pointer ${
                      form.line_style === st ? 'border-emerald-500 bg-emerald-950/40 text-emerald-200' : 'border-slate-700 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    <svg viewBox="0 0 48 8" className="w-full h-2">
                      <line x1={w / 2 + 1} y1={4} x2={47 - w / 2} y2={4} stroke={form.color} strokeWidth={w} strokeLinecap="round" strokeDasharray={lineDash(shown, w)} />
                    </svg>
                    {st ? LINE_STYLES[st].label : 'Automático'}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label="Observações">
            <textarea className="input" rows={2} value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
          </Field>
        </fieldset>
        <Actions
          readOnly={readOnly}
          onRemove={remove}
          onSave={save}
          saving={saving}
          onHistory={onHistory && (() => onHistory('cable', cable.id, cable.name))}
        />
      </div>
    </>
  );
}

/** Reservas técnicas do cabo: tipo, metragem e local de cada uma. Alterações são salvas na hora. */
function SlackList({
  cable,
  readOnly,
  onChange,
  onPlace,
  onLocate,
}: {
  cable: Cable;
  readOnly?: boolean;
  onChange: (list: Slack[]) => void;
  onPlace: () => void;
  onLocate?: (at: LatLng) => void;
}) {
  const list = cable.slacks ?? [];
  const update = (id: string, patch: Partial<Slack>) => onChange(list.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  return (
    <Field label="Reservas técnicas no mapa">
      <div className="space-y-1.5">
        {list.length === 0 && (
          <div className="text-xs text-slate-500">
            {cable.slack_m > 0 ? `${cable.slack_m} m de reserva sem local definido.` : 'Nenhuma reserva posicionada.'}
          </div>
        )}
        {list.map((r, i) => (
          <div key={r.id} className="rounded-md border border-slate-800 bg-slate-950/60 p-1.5 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 shrink-0" style={{ background: SLACK_KINDS[r.kind].color, borderRadius: r.kind === 'aerial' ? '50%' : 2 }} />
              <span className="text-slate-300 font-medium">R{i + 1}</span>
              <select
                className="input !py-0.5 !px-1 text-xs flex-1"
                value={r.kind}
                disabled={readOnly}
                onChange={(e) => update(r.id, { kind: e.target.value as SlackKind })}
              >
                {(Object.keys(SLACK_KINDS) as SlackKind[]).map((k) => (
                  <option key={k} value={k}>
                    {SLACK_KINDS[k].label}
                  </option>
                ))}
              </select>
              <input
                key={`${r.id}-${r.length_m}`}
                type="number"
                min={0}
                defaultValue={r.length_m}
                disabled={readOnly}
                className="input !w-16 !py-0.5 text-right text-xs"
                onBlur={(e) => {
                  const v = Math.max(0, Math.round(Number(e.target.value) || 0));
                  if (v !== r.length_m) update(r.id, { length_m: v });
                }}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              />
              <span className="text-slate-500">m</span>
              <button className="text-slate-400 hover:text-emerald-400 cursor-pointer p-0.5" title="Mostrar no mapa" onClick={() => onLocate?.([r.lat, r.lng])}>
                <Crosshair size={13} />
              </button>
              {!readOnly && (
                <button className="text-slate-400 hover:text-red-400 cursor-pointer p-0.5" title="Remover reserva" onClick={() => onChange(list.filter((x) => x.id !== r.id))}>
                  <X size={13} />
                </button>
              )}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5 pl-4">
              {r.lat.toFixed(6)}, {r.lng.toFixed(6)}
              {r.notes ? ` · ${r.notes}` : ''}
            </div>
          </div>
        ))}
        {!readOnly && (
          <button className="btn-ghost w-full !py-1 text-xs" onClick={onPlace}>
            + Posicionar reserva no mapa
          </button>
        )}
      </div>
    </Field>
  );
}
