import type { Cable, NetNode } from './types';
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
