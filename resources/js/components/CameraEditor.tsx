import { Camera, Copy, ExternalLink, Image as ImageIcon, Loader2, PlugZap, Video } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, errorMessage } from '../lib/api';
import {
  CAMERA_KINDS,
  CAMERA_MOUNT_TYPES,
  CAMERA_POWER,
  CAMERA_PROTOS,
  CAMERA_RESOLUTIONS,
  CAMERA_UPLINK_TYPES,
  CAMERA_VENDORS,
  DEFAULT_FOV,
  DEFAULT_RANGE,
  DVR_CHANNELS,
  HEALTH_COLORS,
  HEALTH_LABEL,
  cameraHealth,
  cameraOf,
  dvrChannels,
  rtspUrl,
  streamSource,
  validHost,
  webUrl,
} from '../lib/camera';
import { NODE_TYPES } from '../lib/catalog';
import { distance } from '../lib/geo';
import type { CameraAttributes, CameraKind, CameraPower, CameraProto, NetNode, NodeType } from '../lib/types';
import { Field, formatLength } from './ui';

const int = (v: string) => (v.trim() === '' ? undefined : Math.max(0, Math.round(Number(v)) || 0));
const dec = (v: string) => (v.trim() === '' ? undefined : Math.max(0, Number(v.replace(',', '.')) || 0));

/** Objetos de certos tipos, do mais perto para o mais longe (para os seletores "Instalada em" e "Conectada via"). */
function nearby(node: NetNode, nodes: NetNode[], types: NodeType[], limit = 60) {
  return nodes
    .filter((n) => n.id !== node.id && types.includes(n.type))
    .map((n) => ({ n, d: distance([node.lat, node.lng], [n.lat, n.lng]) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, limit);
}

interface EditorProps {
  node: NetNode;
  nodes: NetNode[];
  value: CameraAttributes;
  onChange: (patch: CameraAttributes) => void;
  /** Senha nova digitada (vai criptografada para o servidor) e pedido para apagar a guardada. */
  password: string;
  onPassword: (v: string) => void;
  clearPassword: boolean;
  onClearPassword: (v: boolean) => void;
}

/** Campos da câmera / DVR no painel do objeto (dentro do fieldset do Inspector). */
export function CameraFields({ node, nodes, value: a, onChange: set, password, onPassword, clearPassword, onClearPassword }: EditorProps) {
  const kind: CameraKind = a.cam_kind ?? 'ip';
  const preset = a.vendor ? CAMERA_VENDORS[a.vendor] : undefined;
  const mounts = nearby(node, nodes, CAMERA_MOUNT_TYPES);
  const uplinks = nearby(node, nodes, CAMERA_UPLINK_TYPES);
  const dvrs = nodes.filter((n) => n.type === 'camera' && n.id !== node.id && cameraOf(n).cam_kind === 'dvr');
  const dvr = dvrs.find((n) => n.id === a.dvr_id);
  const channels = dvr ? dvrChannels(dvr, nodes) : [];
  const vendors = Object.keys(CAMERA_VENDORS);
  const hasNet = kind !== 'analog';
  const option = (x: { n: NetNode; d: number }) => (
    <option key={x.n.id} value={x.n.id}>
      {NODE_TYPES[x.n.type].label} {x.n.name} · {formatLength(x.d)}
    </option>
  );

  return (
    <>
      <div>
        <div className="label">Tipo</div>
        <div className="grid grid-cols-3 gap-1.5">
          {(Object.keys(CAMERA_KINDS) as CameraKind[]).map((k) => (
            <button
              key={k}
              type="button"
              title={CAMERA_KINDS[k].hint}
              aria-pressed={kind === k}
              onClick={() => set({ cam_kind: k })}
              className={`rounded-md border px-2 py-1.5 text-xs cursor-pointer ${kind === k ? 'border-emerald-500 bg-emerald-600/20 text-emerald-300' : 'border-slate-700 text-slate-300 hover:bg-slate-800'}`}
            >
              {k === 'dvr' ? 'DVR / NVR' : CAMERA_KINDS[k].short}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Fabricante">
          <select className="input" value={a.vendor && !vendors.includes(a.vendor) ? '__other' : (a.vendor ?? '')} onChange={(e) => set({ vendor: e.target.value === '__other' ? 'Outro' : e.target.value || undefined })}>
            <option value="">—</option>
            {vendors.map((v) => (
              <option key={v}>{v}</option>
            ))}
            <option value="__other">Outro</option>
          </select>
        </Field>
        <Field label="Modelo">
          <input className="input" placeholder={kind === 'dvr' ? 'MHDX 1108' : 'VIP 1230 B'} value={a.model ?? ''} onChange={(e) => set({ model: e.target.value || undefined })} />
        </Field>
        <Field label="Nº de série">
          <input className="input font-mono text-xs" value={a.serial ?? ''} onChange={(e) => set({ serial: e.target.value || undefined })} />
        </Field>
        <Field label="Alimentação">
          <select className="input" value={a.power ?? ''} onChange={(e) => set({ power: (e.target.value || undefined) as CameraPower | undefined })}>
            <option value="">—</option>
            {(Object.keys(CAMERA_POWER) as CameraPower[]).map((p) => (
              <option key={p} value={p}>
                {CAMERA_POWER[p]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-[1fr_5rem] gap-2">
        <Field label="Instalada em">
          <select className="input" value={a.mount_id ?? ''} onChange={(e) => set({ mount_id: int(e.target.value) })}>
            <option value="">— (poste, cliente, datacenter ou POP)</option>
            {mounts.map(option)}
          </select>
        </Field>
        <Field label="Altura (m)">
          <input className="input" inputMode="decimal" value={a.height_m ?? ''} onChange={(e) => set({ height_m: dec(e.target.value) })} />
        </Field>
      </div>
      <Field label="Conectada na rede por">
        <select className="input" value={a.uplink_id ?? ''} onChange={(e) => set({ uplink_id: int(e.target.value) })}>
          <option value="">—</option>
          {uplinks.map(option)}
        </select>
      </Field>

      {kind !== 'dvr' && (
        <div className="grid grid-cols-[1fr_5.5rem] gap-2">
          <Field label={kind === 'analog' ? 'Gravador (DVR)' : 'Grava em (NVR/DVR)'}>
            <select className="input" value={a.dvr_id ?? ''} onChange={(e) => set({ dvr_id: int(e.target.value), dvr_channel: e.target.value ? (a.dvr_channel ?? channels.find((c) => !c.camera)?.channel ?? 1) : undefined })}>
              <option value="">—</option>
              {dvrs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Canal">
            <select className="input" disabled={!dvr} value={a.dvr_channel ?? ''} onChange={(e) => set({ dvr_channel: int(e.target.value) })}>
              <option value="">—</option>
              {channels.map((c) => (
                <option key={c.channel} value={c.channel}>
                  {c.channel}
                  {c.camera && c.camera.id !== node.id ? ` (${c.camera.name})` : ''}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}
      {kind === 'analog' && !dvrs.length && <p className="text-xs text-amber-300">Lance um objeto Câmera do tipo DVR/NVR para ligar esta câmera a um canal.</p>}

      {kind === 'dvr' && (
        <div className="grid grid-cols-3 gap-2">
          <Field label="Canais">
            <select className="input" value={a.channels ?? 8} onChange={(e) => set({ channels: int(e.target.value) })}>
              {[...new Set([...DVR_CHANNELS, a.channels ?? 8])].sort((x, y) => x - y).map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="HD (TB)">
            <input className="input" inputMode="decimal" value={a.hdd_tb ?? ''} onChange={(e) => set({ hdd_tb: dec(e.target.value) })} />
          </Field>
          <Field label="Gravação (dias)">
            <input className="input" inputMode="numeric" value={a.retention_days ?? ''} onChange={(e) => set({ retention_days: int(e.target.value) })} />
          </Field>
        </div>
      )}

      {kind !== 'dvr' && (
        <>
          <div className="label !mb-0 pt-1 text-slate-300">Imagem e campo de visão</div>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Resolução">
              <select className="input" value={a.resolution ?? ''} onChange={(e) => set({ resolution: e.target.value || undefined })}>
                <option value="">—</option>
                {CAMERA_RESOLUTIONS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </Field>
            <Field label="Lente (mm)">
              <input className="input" inputMode="decimal" value={a.lens_mm ?? ''} onChange={(e) => set({ lens_mm: dec(e.target.value) })} />
            </Field>
            <Field label="IR (m)">
              <input className="input" inputMode="numeric" value={a.ir_m ?? ''} onChange={(e) => set({ ir_m: int(e.target.value) })} />
            </Field>
            <Field label="Direção (°)">
              <input className="input" inputMode="decimal" placeholder="0 = norte" value={a.azimuth ?? ''} onChange={(e) => set({ azimuth: e.target.value.trim() === '' ? undefined : ((Number(e.target.value.replace(',', '.')) % 360) + 360) % 360 })} />
            </Field>
            <Field label="Abertura (°)">
              <input className="input" inputMode="numeric" placeholder={String(DEFAULT_FOV)} value={a.fov ?? ''} onChange={(e) => set({ fov: int(e.target.value) })} />
            </Field>
            <Field label="Alcance (m)">
              <input className="input" inputMode="numeric" placeholder={String(DEFAULT_RANGE)} value={a.range_m ?? ''} onChange={(e) => set({ range_m: int(e.target.value) })} />
            </Field>
          </div>
          {typeof a.azimuth === 'number' && (
            <input type="range" min={0} max={359} value={Math.round(a.azimuth)} onChange={(e) => set({ azimuth: Number(e.target.value) })} className="w-full accent-amber-400" aria-label="Direção" />
          )}
          {typeof a.azimuth !== 'number' && <p className="text-xs text-slate-500">Informe a direção para desenhar o campo de visão no mapa.</p>}
        </>
      )}

      {hasNet && (
        <>
          <div className="label !mb-0 pt-1 text-slate-300">Rede e acesso</div>
          <div className="grid grid-cols-[1fr_5rem] gap-2">
            <Field label="IP ou DDNS">
              <input className={`input font-mono text-xs ${a.host && !validHost(a.host) ? '!border-red-500' : ''}`} placeholder="192.168.1.64" value={a.host ?? ''} onChange={(e) => set({ host: e.target.value.trim() || undefined })} />
            </Field>
            <Field label="Porta web">
              <input className="input" inputMode="numeric" placeholder={a.https ? '443' : '80'} value={a.http_port ?? ''} onChange={(e) => set({ http_port: int(e.target.value) || undefined })} />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Protocolo">
              <select className="input" value={a.protocol ?? ''} onChange={(e) => set({ protocol: (e.target.value || undefined) as CameraProto | undefined })}>
                <option value="">—</option>
                {(Object.keys(CAMERA_PROTOS) as CameraProto[]).map((p) => (
                  <option key={p} value={p}>
                    {CAMERA_PROTOS[p]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Porta RTSP">
              <input className="input" inputMode="numeric" placeholder="554" value={a.rtsp_port ?? ''} onChange={(e) => set({ rtsp_port: int(e.target.value) || undefined })} />
            </Field>
            <Field label="Porta ONVIF">
              <input className="input" inputMode="numeric" placeholder={String(preset?.onvif ?? 80)} value={a.onvif_port ?? ''} onChange={(e) => set({ onvif_port: int(e.target.value) || undefined })} />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={!!a.https} onChange={(e) => set({ https: e.target.checked || undefined })} />
            Interface web em HTTPS
          </label>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Usuário">
              <input className="input" autoComplete="off" value={a.username ?? ''} onChange={(e) => set({ username: e.target.value || undefined })} />
            </Field>
            <Field label="Senha">
              <input
                className="input"
                type="password"
                autoComplete="new-password"
                placeholder={a.cam_has_password && !clearPassword ? '•••••• (guardada)' : ''}
                value={password}
                onChange={(e) => {
                  onPassword(e.target.value);
                  if (e.target.value) onClearPassword(false);
                }}
              />
            </Field>
          </div>
          {a.cam_has_password && (
            <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
              <input type="checkbox" checked={clearPassword} onChange={(e) => onClearPassword(e.target.checked)} />
              Apagar a senha guardada
            </label>
          )}
          <p className="text-[11px] text-slate-500">A senha fica criptografada no servidor e não volta para o navegador.</p>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Caminho RTSP">
              <input className="input font-mono text-[11px]" placeholder={preset?.rtsp ?? '/'} value={a.rtsp_path ?? ''} onChange={(e) => set({ rtsp_path: e.target.value || undefined })} />
            </Field>
            <Field label="Caminho da foto">
              <input className="input font-mono text-[11px]" placeholder={preset?.snapshot || '/snapshot.jpg'} value={a.snapshot_path ?? ''} onChange={(e) => set({ snapshot_path: e.target.value || undefined })} />
            </Field>
          </div>
        </>
      )}
    </>
  );
}

interface DeviceProps {
  node: NetNode;
  nodes: NetNode[];
  readOnly?: boolean;
  onNodeSaved: (n: NetNode) => void;
  onError: (message: string) => void;
  /** Preenche fabricante/modelo/série com o que o equipamento informou (ONVIF). */
  onUseInfo: (patch: CameraAttributes) => void;
  onSelect?: (n: NetNode) => void;
}

/** Comunicação com o equipamento real: situação, teste, interface web, RTSP e foto. Fica fora do fieldset. */
export function CameraDevice({ node, nodes, readOnly, onNodeSaved, onError, onUseInfo, onSelect }: DeviceProps) {
  const a = cameraOf(node);
  const kind = a.cam_kind ?? 'ip';
  const src = streamSource(node, nodes);
  const srcA = cameraOf(src.node);
  const status = cameraOf(node).cam_status;
  const health = cameraHealth(status);
  const web = webUrl(srcA);
  const rtsp = rtspUrl(srcA, src.channel);
  const [checking, setChecking] = useState(false);
  const [photo, setPhoto] = useState<{ url: string; channel: number } | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => () => void (photo && URL.revokeObjectURL(photo.url)), [photo]);

  async function check() {
    setChecking(true);
    try {
      const r = await api.checkCamera(node.id);
      onNodeSaved(r.node);
    } catch (e) {
      onError(errorMessage(e));
    }
    setChecking(false);
  }

  async function snapshot(channel?: number) {
    setPhotoBusy(true);
    try {
      const blob = await api.cameraSnapshot(node.id, channel);
      setPhoto({ url: URL.createObjectURL(blob), channel: channel ?? src.channel });
    } catch (e) {
      onError(await blobError(e));
    }
    setPhotoBusy(false);
  }

  const info = status?.info;
  const infoNew = info && ((info.manufacturer && !a.vendor) || (info.model && info.model !== a.model) || (info.serial && info.serial !== a.serial));

  return (
    <div className="rounded-md border border-slate-700 p-2.5 space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-slate-300">
          <Video size={14} /> Equipamento
          {src.node.id !== node.id && <span className="text-slate-500">via {src.node.name} · canal {src.channel}</span>}
        </span>
        <span className="flex items-center gap-1" style={{ color: HEALTH_COLORS[health] }} title={status ? `Testado em ${new Date(status.at).toLocaleString('pt-BR')}` : undefined}>
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: HEALTH_COLORS[health] }} />
          {HEALTH_LABEL[health]}
        </span>
      </div>
      {status && (
        <ul className="text-[11px] space-y-0.5">
          {status.checks.map((c) => (
            <li key={c.name} className="flex justify-between gap-2">
              <span className={`shrink-0 whitespace-nowrap ${c.ok ? 'text-emerald-300' : 'text-red-300'}`}>
                {c.ok ? '✓' : '✗'} {c.name}
                {c.port ? `:${c.port}` : ''}
              </span>
              <span className="min-w-0 truncate text-slate-400" title={c.detail ?? undefined}>
                {c.detail}
                {c.ms != null ? ` · ${c.ms} ms` : ''}
              </span>
            </li>
          ))}
          <li className="text-slate-500">{new Date(status.at).toLocaleString('pt-BR')}</li>
        </ul>
      )}
      {info && (
        <div className="text-[11px] text-slate-300">
          {[info.manufacturer, info.model].filter(Boolean).join(' ')}
          {info.firmware ? ` · firmware ${info.firmware}` : ''}
          {info.serial ? ` · S/N ${info.serial}` : ''}
          {infoNew && !readOnly && (
            <button
              type="button"
              className="ml-1 text-emerald-300 hover:underline cursor-pointer"
              onClick={() => onUseInfo({ ...(info.manufacturer && !a.vendor ? { vendor: matchVendor(info.manufacturer) } : {}), ...(info.model ? { model: info.model } : {}), ...(info.serial ? { serial: info.serial } : {}) })}
            >
              usar no cadastro
            </button>
          )}
        </div>
      )}
      <div className="grid grid-cols-2 gap-1.5">
        {!readOnly && (
          <button type="button" className="btn-ghost !text-xs whitespace-nowrap !px-2" disabled={checking || !srcA.host} onClick={check} title={srcA.host ? 'O servidor testa as portas web, RTSP e ONVIF' : 'Cadastre o IP/DDNS'}>
            {checking ? <Loader2 size={14} className="animate-spin" /> : <PlugZap size={14} />} Testar conexão
          </button>
        )}
        <button type="button" className="btn-ghost !text-xs whitespace-nowrap !px-2" disabled={photoBusy || !srcA.host} onClick={() => snapshot()} title="Foto atual da câmera (buscada pelo servidor)">
          {photoBusy ? <Loader2 size={14} className="animate-spin" /> : <ImageIcon size={14} />} Ver foto
        </button>
        <a
          className={`btn-ghost !text-xs whitespace-nowrap !px-2 ${web ? '' : 'pointer-events-none opacity-50'}`}
          href={web ?? undefined}
          target="_blank"
          rel="noreferrer noopener"
          title="Abre a interface do equipamento no seu navegador (precisa estar na mesma rede ou com acesso liberado)"
        >
          <ExternalLink size={14} /> Interface web
        </a>
        <button
          type="button"
          className="btn-ghost !text-xs whitespace-nowrap !px-2"
          disabled={!rtsp}
          title={rtsp ?? undefined}
          onClick={() => {
            if (!rtsp) return;
            navigator.clipboard?.writeText(rtsp);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          <Copy size={14} /> {copied ? 'Copiado!' : 'Copiar RTSP'}
        </button>
      </div>
      {photo && (
        <figure className="space-y-1">
          <img src={photo.url} alt={`Foto de ${node.name}`} className="w-full rounded border border-slate-700" />
          <figcaption className="text-[10px] text-slate-500">
            Canal {photo.channel} · {new Date().toLocaleTimeString('pt-BR')}
          </figcaption>
        </figure>
      )}
      {kind === 'dvr' && <DvrChannels dvr={node} nodes={nodes} onSnapshot={(ch) => snapshot(ch)} onSelect={onSelect} disabled={!srcA.host || photoBusy} />}
      <p className="text-[10px] leading-snug text-slate-500">
        Teste e foto são feitos pelo servidor do MapFTTH: ele precisa alcançar a câmera (IP público com porta liberada, DDNS ou VPN). A interface web abre no seu computador.
      </p>
    </div>
  );
}

function DvrChannels({ dvr, nodes, onSnapshot, onSelect, disabled }: { dvr: NetNode; nodes: NetNode[]; onSnapshot: (ch: number) => void; onSelect?: (n: NetNode) => void; disabled: boolean }) {
  const list = dvrChannels(dvr, nodes);
  const used = list.filter((c) => c.camera).length;
  return (
    <div>
      <div className="label flex justify-between">
        <span>Canais</span>
        <span className="normal-case">
          {used}/{list.length} em uso
        </span>
      </div>
      <div className="max-h-52 overflow-auto rounded border border-slate-800">
        {list.map((c) => (
          <div key={c.channel} className="flex items-center gap-2 px-2 py-1 text-xs odd:bg-slate-900/60">
            <span className="w-6 text-right font-mono text-slate-500">{c.channel}</span>
            {c.camera ? (
              <button type="button" className="flex-1 truncate text-left text-slate-200 hover:underline cursor-pointer" onClick={() => onSelect?.(c.camera!)}>
                <Camera size={11} className="inline mr-1" />
                {c.camera.name}
                {c.extra.length ? <span className="text-amber-300"> +{c.extra.length} no mesmo canal</span> : null}
              </button>
            ) : (
              <span className="flex-1 text-slate-600">livre</span>
            )}
            <button type="button" disabled={disabled} className="text-slate-400 hover:text-white disabled:opacity-40 cursor-pointer" title="Ver foto do canal" onClick={() => onSnapshot(c.channel)}>
              <ImageIcon size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Fabricante informado pelo equipamento → nome da lista (ex.: "HIKVISION" → "Hikvision"). */
function matchVendor(name: string): string {
  const hit = Object.keys(CAMERA_VENDORS).find((v) => v.toLowerCase().split(' ')[0] === name.toLowerCase().trim());
  return hit ?? name.trim();
}

/** Erro de uma requisição com resposta em blob (a mensagem vem em JSON dentro do blob). */
async function blobError(e: unknown): Promise<string> {
  const data = (e as { response?: { data?: unknown } }).response?.data;
  if (data instanceof Blob) {
    try {
      const j = JSON.parse(await data.text()) as { message?: string };
      if (j.message) return j.message;
    } catch {
      /* resposta sem JSON */
    }
  }
  return errorMessage(e);
}
