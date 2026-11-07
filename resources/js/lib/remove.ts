import type { Cable, NetNode, NodeType } from './types';
import { NODE_TYPES } from './catalog';
import { countLabel, joinCounts } from './marquee';
import { slackOnHost } from './anchor';

/**
 * Quantos objetos estão fixados no objeto (CTO/CEO/câmera no poste/caixa, reservas no
 * poste/caixa, CTO/CEO no cabo). Ao excluí-lo eles NÃO são excluídos: ficam sem fixação.
 */
export function fixedChildren(target: { kind: 'node'; node: NetNode } | { kind: 'cable'; cable: Cable }, nodes: NetNode[], cables: Cable[]): { nodes: NetNode[]; slacks: number } {
  if (target.kind === 'cable') {
    const id = target.cable.id;
    return { nodes: nodes.filter((n) => (n.attributes as { fixed_kind?: string; fixed_id?: number } | null)?.fixed_kind === 'cable' && (n.attributes as { fixed_id?: number }).fixed_id === id), slacks: 0 };
  }
  const host = target.node;
  const kids = nodes.filter((n) => {
    if (n.id === host.id) return false;
    const a = (n.attributes ?? {}) as { fixed_kind?: string | null; fixed_id?: number | null; mount_kind?: string | null; mount_id?: number | null };
    return (a.fixed_id === host.id && a.fixed_kind !== 'cable') || a.mount_id === host.id;
  });
  let slacks = 0;
  for (const c of cables) for (const r of c.slacks ?? []) if ((r.fixed_kind === 'pole' || r.fixed_kind === 'box') && slackOnHost(r, host, nodes)) slacks++;
  return { nodes: kids, slacks };
}

/** Frase que avisa o que acontece com os objetos fixados (vazia quando não há nenhum). */
export function orphanNote(kids: { nodes: NetNode[]; slacks: number }): string {
  const parts: string[] = [];
  if (kids.nodes.length) parts.push(kids.nodes.length === 1 ? kids.nodes[0].name : `${kids.nodes.length} objetos`);
  if (kids.slacks) parts.push(kids.slacks === 1 ? '1 reserva' : `${kids.slacks} reservas`);
  if (!parts.length) return '';
  const many = kids.nodes.length + kids.slacks > 1;
  return `${parts.join(' e ')} fixad${many ? 'os' : kids.nodes.length ? 'o' : 'a'} nele não ${many ? 'serão excluídos' : 'será excluído'}: fica${many ? 'm' : ''} sem fixação.`;
}

/** Pergunta de confirmação para excluir um objeto do mapa (com o aviso dos compartilhados). */
export function nodeDeleteQuestion(node: NetNode, projectId: number | undefined, nodes: NetNode[], cables: Cable[]): string {
  const others = node.share?.projects.length ?? 0;
  const shareHome = node.share && projectId !== undefined && node.share.home_id === projectId;
  if (node.share && !shareHome) return `Tirar ${node.name} deste projeto? Ele continua no projeto de origem (${node.share.home_name}).`;
  const base = shareHome && others ? `Excluir ${node.name}? Ele também está em ${others} outro(s) projeto(s) e será excluído de todos.` : `Excluir ${node.name}?`;
  const note = orphanNote(fixedChildren({ kind: 'node', node }, nodes, cables));
  return note ? `${base} ${note}` : base;
}

export function cableDeleteQuestion(cable: Cable, nodes: NetNode[], cables: Cable[]): string {
  const base = `Excluir ${cable.name}? As fusões deste cabo nas caixas também serão removidas.`;
  const note = orphanNote(fixedChildren({ kind: 'cable', cable }, nodes, cables));
  return note ? `${base} ${note}` : base;
}

/** Vários objetos marcados no mapa (seleção por retângulo). */
export interface MultiSelection {
  nodes: number[];
  cables: number[];
  ducts: number[];
  areas: number[];
}

export const multiCount = (m: MultiSelection) => m.nodes.length + m.cables.length + m.ducts.length + m.areas.length;

/** "3 CTO, 2 postes, 4 cabos e 1 duto". */
export function multiSummary(m: MultiSelection, nodes: NetNode[]): string {
  const byType = new Map<NodeType, number>();
  for (const id of m.nodes) {
    const n = nodes.find((x) => x.id === id);
    if (n) byType.set(n.type, (byType.get(n.type) ?? 0) + 1);
  }
  const parts = [...byType.entries()].map(([t, k]) => countLabel(k, NODE_TYPES[t].label, NODE_TYPES[t].plural));
  if (m.cables.length) parts.push(countLabel(m.cables.length, 'cabo', 'cabos'));
  if (m.ducts.length) parts.push(countLabel(m.ducts.length, 'duto', 'dutos'));
  if (m.areas.length) parts.push(countLabel(m.areas.length, 'área', 'áreas'));
  return joinCounts(parts);
}

/**
 * Pergunta única para excluir tudo o que foi marcado. Como no Delete de um objeto só, o que está fixado
 * num poste/caixa/cabo excluído e NÃO foi marcado fica sem fixação (não é excluído).
 */
export function bulkDeleteQuestion(m: MultiSelection, projectId: number | undefined, nodes: NetNode[], cables: Cable[]): string {
  const total = multiCount(m);
  const picked = new Set(m.nodes);
  const orphans = new Map<number, NetNode>();
  let slacks = 0;
  const pickedCables = new Set(m.cables);
  for (const id of m.nodes) {
    const n = nodes.find((x) => x.id === id);
    if (!n) continue;
    const kids = fixedChildren({ kind: 'node', node: n }, nodes, cables);
    kids.nodes.filter((k) => !picked.has(k.id)).forEach((k) => orphans.set(k.id, k));
    // Reservas de cabos que também serão excluídos somem junto com o cabo.
    for (const c of cables) if (!pickedCables.has(c.id)) for (const r of c.slacks ?? []) if ((r.fixed_kind === 'pole' || r.fixed_kind === 'box') && slackOnHost(r, n, nodes)) slacks++;
  }
  for (const id of m.cables) {
    const c = cables.find((x) => x.id === id);
    if (c) fixedChildren({ kind: 'cable', cable: c }, nodes, cables).nodes.filter((k) => !picked.has(k.id)).forEach((k) => orphans.set(k.id, k));
  }
  const shared = m.nodes.map((id) => nodes.find((x) => x.id === id)).filter((n): n is NetNode => !!n?.share);
  const away = shared.filter((n) => projectId === undefined || n.share!.home_id !== projectId).length;
  const home = shared.length - away;
  const lines = [`Excluir ${total === 1 ? 'o objeto selecionado' : `os ${total} objetos selecionados`} (${multiSummary(m, nodes)})?`];
  if (m.cables.length) lines.push('As fusões dos cabos nas caixas também serão removidas.');
  if (away) lines.push(`${away === 1 ? '1 compartilhado sai' : `${away} compartilhados saem`} só deste projeto.`);
  if (home) lines.push(`${home === 1 ? '1 compartilhado será excluído' : `${home} compartilhados serão excluídos`} de todos os projetos.`);
  const note = orphanNote({ nodes: [...orphans.values()], slacks });
  if (note) lines.push(note.replace(/ nele /, ' neles '));
  return lines.join(' ');
}
