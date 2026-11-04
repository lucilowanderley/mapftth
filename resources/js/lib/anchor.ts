import { cameraOf } from './camera';
import { fixHost, fixationOf } from './fixation';
import { distance } from './geo';
import type { Cable, LatLng, NetNode, NodeType, Slack } from './types';

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
    const id = cameraOf(n).mount_id;
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
      const h = cameraOf(n).mount_id ? byId.get(cameraOf(n).mount_id!) : undefined;
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
  if (n.type === 'camera') return { ...rest, mount_id: on && host ? host.id : null };
  if (on && host) return { ...rest, fixed_kind: host.type === 'box' ? 'box' : 'pole', fixed_id: host.id };
  return { ...rest, fixed_kind: null, fixed_id: null };
}

/** Cabos com ponta no objeto ou que passam pelo poste/caixa. */
export function cablesAtHost(host: NetNode, cables: Cable[], ids: number[] = []): Cable[] {
  const at: LatLng = [host.lat, host.lng];
  const own = new Set([host.id, ...ids]);
  return cables.filter((c) => own.has(c.from_node_id ?? -1) || own.has(c.to_node_id ?? -1) || c.path.some((p) => distance(p, at) <= CABLE_ON_HOST_M));
}

/** Reservas técnicas guardadas no poste/caixa. */
export function slacksAtHost(host: NetNode, cables: Cable[]): { cable: Cable; slack: Slack }[] {
  const at: LatLng = [host.lat, host.lng];
  const out: { cable: Cable; slack: Slack }[] = [];
  for (const c of cables) for (const r of c.slacks ?? []) if (distance([r.lat, r.lng], at) <= SLACK_ON_HOST_M) out.push({ cable: c, slack: r });
  return out;
}

/**
 * Ponta de cabo ao clicar (ou soltar) num poste/caixa com objetos fixados: se houver uma única CTO/CEO
 * fixada, o cabo liga nela (é o que se quer quase sempre); com várias, quem chama pergunta qual.
 */
export function cableTargets(host: NetNode, nodes: NetNode[]): NetNode[] {
  return anchoredOn(host, nodes).filter((n) => n.type === 'cto' || n.type === 'ceo');
}
