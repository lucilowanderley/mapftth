import { distance } from './geo';
import type { BoxAttributes, BoxKind, BoxPlace, FixAttributes, FixKind, LatLng, NetNode, NodeType } from './types';

/**
 * Fixação de CTO/CEO (poste, parede ou caixa) e o objeto Caixa (sem React, usado também nos testes).
 * Tudo fica em `attributes`: fixed_kind / fixed_id / address na CTO/CEO; box_kind / box_place / address na caixa.
 */

/** Objetos que precisam estar fixados num poste, numa parede ou numa caixa. */
export const FIXABLE_TYPES: NodeType[] = ['cto', 'ceo'];

export const FIX_KINDS: Record<FixKind, { label: string; hint: string }> = {
  pole: { label: 'Poste', hint: 'Presa no poste (rede aérea)' },
  wall: { label: 'Parede', hint: 'Presa na parede de um imóvel (informe o endereço)' },
  box: { label: 'Caixa', hint: 'Dentro de uma caixa de parede ou subterrânea' },
};

/** Tipo do objeto que recebe a CTO/CEO em cada forma de fixação (parede não tem objeto no mapa). */
export const FIX_HOST_TYPE: Partial<Record<FixKind, NodeType>> = { pole: 'pole', box: 'box' };

export const BOX_KINDS: Record<BoxKind, { label: string; hint: string }> = {
  wall: { label: 'Parede', hint: 'Caixa / quadro preso na parede' },
  underground: { label: 'Subterrânea', hint: 'Caixa de passagem no piso (calçada, garagem...)' },
};

export const BOX_PLACES: Record<BoxPlace, { label: string; hint: string }> = {
  external: { label: 'Externa', hint: 'Fora do imóvel (calçada, fachada, via pública)' },
  internal: { label: 'Interna', hint: 'Dentro de um imóvel (prédio, loja, condomínio)' },
};

/** Tamanhos/modelos comuns de caixa (sugestões do campo Modelo). */
export const BOX_MODELS = ['R1 (35x60 cm)', 'R2 (60x60 cm)', 'R3 (107x52 cm)', 'Caixa de calçada 30x30', 'Quadro de parede 40x40', 'Quadro de parede 60x60', 'Caixa de passagem 4x4'];

/** Distância máxima (m) para uma CTO/CEO lançada no mapa ser fixada sozinha no poste/caixa mais próximo. */
export const AUTO_FIX_M = 8;
/** Afastamento (m) da CTO/CEO lançada sobre um poste/caixa, para os ícones não ficarem um sobre o outro. */
export const FIX_OFFSET_M = 8;

export const fixationOf = (n: NetNode | null | undefined): FixAttributes => ((n?.attributes as FixAttributes | null) ?? {}) as FixAttributes;
export const boxOf = (n: NetNode | null | undefined): BoxAttributes => ((n?.attributes as BoxAttributes | null) ?? {}) as BoxAttributes;

export const boxKind = (n: NetNode): BoxKind => boxOf(n).box_kind ?? 'underground';
export const boxPlace = (n: NetNode): BoxPlace => boxOf(n).box_place ?? 'external';

/** Caixa de parede (sempre num imóvel) ou caixa interna: precisa de endereço. */
export function boxNeedsAddress(box: BoxAttributes): boolean {
  return (box.box_kind ?? 'underground') === 'wall' || box.box_place === 'internal';
}

/** Poste ou caixa onde a CTO/CEO está fixada (undefined se for parede, não informado ou o objeto sumiu). */
export function fixHost(n: NetNode, nodes: NetNode[]): NetNode | undefined {
  const a = fixationOf(n);
  const type = a.fixed_kind ? FIX_HOST_TYPE[a.fixed_kind] : undefined;
  if (!type || !a.fixed_id) return undefined;
  return nodes.find((x) => x.id === a.fixed_id && x.type === type);
}

/** Endereço do imóvel onde a CTO/CEO está (parede: o dela; caixa: o dela ou o da caixa). */
export function fixedAddress(n: NetNode, nodes: NetNode[]): string {
  const a = fixationOf(n);
  const own = (a.address ?? '').trim();
  if (a.fixed_kind === 'box') return own || (boxOf(fixHost(n, nodes)).address ?? '').trim();
  return a.fixed_kind === 'wall' ? own : '';
}

/**
 * Problema na fixação da CTO/CEO (null = tudo certo). Objetos antigos sem fixação continuam
 * funcionando: o aviso aparece no mapa e no painel, sem impedir o uso.
 */
export function fixationIssue(n: NetNode, nodes: NetNode[]): string | null {
  if (!FIXABLE_TYPES.includes(n.type)) return null;
  const a = fixationOf(n);
  if (!a.fixed_kind) return 'Sem fixação: informe se está num poste, numa parede ou dentro de uma caixa.';
  if (a.fixed_kind === 'wall') return fixedAddress(n, nodes) ? null : 'Fixada na parede: informe o endereço do imóvel.';
  const host = fixHost(n, nodes);
  if (!host) return a.fixed_kind === 'pole' ? 'Escolha o poste onde está fixada.' : 'Escolha a caixa onde está instalada.';
  if (a.fixed_kind === 'box' && boxNeedsAddress(boxOf(host)) && !fixedAddress(n, nodes)) return `A caixa ${host.name} fica num imóvel: informe o endereço.`;
  return null;
}

/** CTO/CEO instaladas dentro da caixa (ou presas no poste). */
export function fixedOn(host: NetNode, nodes: NetNode[]): NetNode[] {
  const kind: FixKind | null = host.type === 'box' ? 'box' : host.type === 'pole' ? 'pole' : null;
  if (!kind) return [];
  return nodes.filter((n) => FIXABLE_TYPES.includes(n.type) && fixationOf(n).fixed_kind === kind && fixationOf(n).fixed_id === host.id);
}

/** Poste ou caixa mais perto do ponto (até maxM metros), para fixar sozinha a CTO/CEO lançada ali. */
export function nearestHost(at: LatLng, nodes: NetNode[], maxM = AUTO_FIX_M): NetNode | undefined {
  let best: NetNode | undefined;
  let bestD = maxM;
  for (const n of nodes) {
    if (n.type !== 'pole' && n.type !== 'box') continue;
    const d = distance(at, [n.lat, n.lng]);
    if (d <= bestD) {
      bestD = d;
      best = n;
    }
  }
  return best;
}

/** Atributos de fixação de uma CTO/CEO nova presa no poste/caixa `host`. */
export function fixTo(host: NetNode): FixAttributes {
  return { fixed_kind: host.type === 'box' ? 'box' : 'pole', fixed_id: host.id };
}

/** Linhas tracejadas no mapa: CTO/CEO → poste ou caixa onde está fixada. */
export function fixLinks(nodes: NetNode[]): { key: string; from: NetNode; to: NetNode }[] {
  const out: { key: string; from: NetNode; to: NetNode }[] = [];
  for (const n of nodes) {
    if (!FIXABLE_TYPES.includes(n.type)) continue;
    const host = fixHost(n, nodes);
    if (host) out.push({ key: `f${n.id}`, from: n, to: host });
  }
  return out;
}
