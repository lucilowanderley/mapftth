import { cameraOf } from './camera';
import { nearestOnPath } from './connect';
import { FIXABLE_TYPES, fixHost, fixationOf } from './fixation';
import { distance } from './geo';
import type { Cable, FixKind, LatLng, NetNode, NodeType, Slack } from './types';

/**
 * Objetos fixados num poste ou numa caixa (sem React, usado também nos testes).
 *
 * Fixar e ancorar são a mesma coisa: CTO/CEO com "Fixada em" um poste/caixa e câmera "Instalada em" um poste
 * ficam na mesma posição do poste/caixa, o ícone aparece fundido ao dele e só se movem junto com ele.
 * Para mover sozinho é preciso soltar (CTO/CEO: Parede ou sem fixação; câmera: sem poste).
 * O antigo `attributes.anchored` não é mais usado.
 */

/** Objetos que recebem outros ancorados. */
export const ANCHOR_HOST_TYPES: NodeType[] = ['pole', 'box'];

/** O que pode ser implantado em cada tipo de suporte (barra de ferramentas do editor do poste/caixa). */
export const ANCHOR_CHILD_TYPES: Record<'pole' | 'box', NodeType[]> = {
  pole: ['cto', 'ceo', 'camera'],
  box: ['cto', 'ceo'],
};

/** Afastamento (m) do objeto solto do poste/caixa, para o ícone sair de cima do poste/caixa (para baixo/oeste: a faixa dos ancorados fica à direita). */
export const UNANCHOR_OFFSET_M = 12;
/** Reservas técnicas até essa distância (m) contam como "no poste/caixa". */
export const SLACK_ON_HOST_M = 3;
/** Cabos que passam até essa distância (m) contam como "passando no poste/caixa". */
export const CABLE_ON_HOST_M = 1.5;

/** Poste/caixa onde o objeto está preso (CTO/CEO: "Fixada em"; câmera: "Instalada em" um poste). */
export function anchorHost(n: NetNode, nodes: NetNode[]): NetNode | undefined {
  if (n.type === 'cto' || n.type === 'ceo') return fixHost(n, nodes);
  if (n.type === 'camera') {
    const { mount_id: id, mount_kind } = cameraOf(n);
    if (mount_kind === 'wall') return undefined;
    const host = id ? nodes.find((x) => x.id === id) : undefined;
    return host && host.type === 'pole' ? host : undefined;
  }
  return undefined;
}

/** O objeto está fixado num poste/caixa que ainda existe (ícone fundido ao dele). */
export function isAnchored(n: NetNode, nodes: NetNode[]): boolean {
  return !!anchorHost(n, nodes);
}

/** Tudo o que está fixado no poste/caixa, na ordem de criação. */
export function attachedTo(host: NetNode, nodes: NetNode[]): NetNode[] {
  if (!ANCHOR_HOST_TYPES.includes(host.type)) return [];
  return nodes.filter((n) => n.id !== host.id && anchorHost(n, nodes)?.id === host.id).sort((a, b) => a.id - b.id);
}

/** Os fixados no poste/caixa (todos se fundem ao ícone dele). */
export const anchoredOn = attachedTo;

/** Mapa poste/caixa → objetos fixados, e o conjunto de ids fixados (que não ganham ícone próprio). */
export function anchorIndex(nodes: NetNode[]): { byHost: Map<number, NetNode[]>; anchored: Set<number>; hostOf: Map<number, NetNode> } {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const byHost = new Map<number, NetNode[]>();
  const anchored = new Set<number>();
  const hostOf = new Map<number, NetNode>();
  for (const n of nodes) {
    let host: NetNode | undefined;
    if (n.type === 'cto' || n.type === 'ceo') {
      const a = fixationOf(n);
      const h = a.fixed_id ? byId.get(a.fixed_id) : undefined;
      host = h && ((a.fixed_kind === 'pole' && h.type === 'pole') || (a.fixed_kind === 'box' && h.type === 'box')) ? h : undefined;
    } else if (n.type === 'camera') {
      const a = cameraOf(n);
      const h = a.mount_id && a.mount_kind !== 'wall' ? byId.get(a.mount_id) : undefined;
      host = h?.type === 'pole' ? h : undefined;
    }
    if (!host) continue;
    anchored.add(n.id);
    hostOf.set(n.id, host);
    byHost.set(host.id, [...(byHost.get(host.id) ?? []), n]);
  }
  for (const list of byHost.values()) list.sort((a, b) => a.id - b.id);
  return { byHost, anchored, hostOf };
}

/**
 * Atributos ao fixar no poste/caixa `host` (on) ou soltar (o resto de `attributes` continua igual).
 * CTO/CEO solta fica sem fixação (aviso âmbar até escolher parede, poste ou caixa); câmera fica sem poste.
 */
export function withAnchor(n: NetNode, on: boolean, host?: NetNode): Record<string, unknown> {
  const { anchored: _old, ...rest } = (n.attributes ?? {}) as Record<string, unknown>;
  if (n.type === 'camera') return { ...rest, mount_kind: on && host ? 'pole' : null, mount_id: on && host ? host.id : null };
  if (on && host) return { ...rest, fixed_kind: host.type === 'box' ? 'box' : 'pole', fixed_id: host.id };
  return { ...rest, fixed_kind: null, fixed_id: null };
}

/** Cabos com ponta no objeto ou que passam pelo poste/caixa. */
export function cablesAtHost(host: NetNode, cables: Cable[], ids: number[] = []): Cable[] {
  const at: LatLng = [host.lat, host.lng];
  const own = new Set([host.id, ...ids]);
  return cables.filter((c) => own.has(c.from_node_id ?? -1) || own.has(c.to_node_id ?? -1) || c.path.some((p) => distance(p, at) <= CABLE_ON_HOST_M));
}

/**
 * Onde a reserva técnica está fixada. Reservas antigas (sem fixed_kind) a até 3 m de um poste/caixa
 * contam como fixadas nele; as outras, no cabo.
 */
export function slackFixation(r: Slack, nodes: NetNode[]): { kind: FixKind; host?: NetNode } {
  if (r.fixed_kind === 'pole' || r.fixed_kind === 'box') {
    const host = nodes.find((n) => n.id === r.fixed_id && n.type === r.fixed_kind);
    return { kind: r.fixed_kind, host };
  }
  if (r.fixed_kind) return { kind: r.fixed_kind };
  const host = nodes.find((n) => ANCHOR_HOST_TYPES.includes(n.type) && distance([n.lat, n.lng], [r.lat, r.lng]) <= SLACK_ON_HOST_M);
  return host ? { kind: host.type === 'box' ? 'box' : 'pole', host } : { kind: 'cable' };
}

/** A reserva está no poste/caixa `host`. */
export function slackOnHost(r: Slack, host: NetNode, nodes?: NetNode[]): boolean {
  if (r.fixed_kind === 'pole' || r.fixed_kind === 'box') return r.fixed_id === host.id;
  if (r.fixed_kind) return false;
  return distance([r.lat, r.lng], [host.lat, host.lng]) <= SLACK_ON_HOST_M && (!nodes || slackFixation(r, nodes).host?.id === host.id);
}

/** Reservas técnicas guardadas no poste/caixa. */
export function slacksAtHost(host: NetNode, cables: Cable[], nodes?: NetNode[]): { cable: Cable; slack: Slack }[] {
  const out: { cable: Cable; slack: Slack }[] = [];
  for (const c of cables) for (const r of c.slacks ?? []) if (slackOnHost(r, host, nodes)) out.push({ cable: c, slack: r });
  return out;
}

/** Objetos fixados no cabo até essa distância (m) do poste/caixa aparecem sobre a linha do cabo no editor. */
export const ON_CABLE_NEAR_M = 40;

/** Objeto (CTO/CEO ou reserva) fixado num cabo que passa pelo poste/caixa, com o lado e a distância. */
export type OnCableItem =
  | { kind: 'node'; cable: Cable; node: NetNode; side: 'left' | 'right'; dist: number }
  | { kind: 'slack'; cable: Cable; slack: Slack; side: 'left' | 'right'; dist: number };

/**
 * CTO/CEO e reservas fixadas no cabo (vão), perto do poste/caixa, em cada cabo de `here`.
 * O lado é pelo sentido do traçado: antes do poste (esquerda) ou depois (direita).
 */
export function onCableNear(host: NetNode, here: Cable[], nodes: NetNode[], maxM = ON_CABLE_NEAR_M): OnCableItem[] {
  const out: OnCableItem[] = [];
  const at: LatLng = [host.lat, host.lng];
  for (const c of here) {
    if (c.path.length < 2) continue;
    const hostAlong = nearestOnPath(c.path, at).along;
    const place = (p: LatLng) => {
      const along = nearestOnPath(c.path, p).along;
      return { side: (along < hostAlong ? 'left' : 'right') as 'left' | 'right', dist: Math.abs(along - hostAlong) };
    };
    for (const n of nodes) {
      if (!FIXABLE_TYPES.includes(n.type)) continue;
      const a = fixationOf(n);
      if (a.fixed_kind !== 'cable' || a.fixed_id !== c.id) continue;
      const p = place([n.lat, n.lng]);
      if (p.dist <= maxM) out.push({ kind: 'node', cable: c, node: n, ...p });
    }
    for (const r of c.slacks ?? []) {
      if (r.fixed_kind !== 'cable') continue;
      const p = place([r.lat, r.lng]);
      if (p.dist <= maxM) out.push({ kind: 'slack', cable: c, slack: r, ...p });
    }
  }
  return out.sort((x, y) => x.dist - y.dist);
}

/** Ponto do cabo a `meters` do ponto `at` (para a frente no traçado; se não couber, para trás). */
export function offsetOnPath(path: LatLng[], at: LatLng, meters: number): LatLng {
  if (path.length < 2) return at;
  const lens: number[] = [];
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const l = distance(path[i], path[i + 1]);
    lens.push(l);
    total += l;
  }
  const near = nearestOnPath(path, at);
  const start = lens.slice(0, near.seg).reduce((a, l) => a + l, 0) + near.t * (lens[near.seg] ?? 0);
  let target = start + meters <= total ? start + meters : Math.max(0, start - meters);
  for (let i = 0; i < lens.length; i++) {
    if (target <= lens[i] || i === lens.length - 1) {
      const t = lens[i] ? Math.min(1, target / lens[i]) : 0;
      return [path[i][0] + (path[i + 1][0] - path[i][0]) * t, path[i][1] + (path[i + 1][1] - path[i][1]) * t];
    }
    target -= lens[i];
  }
  return at;
}

/**
 * Ponta de cabo ao clicar (ou soltar) num poste/caixa com objetos fixados: se houver uma única CTO/CEO
 * fixada, o cabo liga nela (é o que se quer quase sempre); com várias, quem chama pergunta qual.
 */
export function cableTargets(host: NetNode, nodes: NetNode[]): NetNode[] {
  return anchoredOn(host, nodes).filter((n) => n.type === 'cto' || n.type === 'ceo');
}
