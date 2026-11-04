import type { Cable, LatLng } from './types';

const same = (a: LatLng, b: LatLng) => Math.abs(a[0] - b[0]) < 1e-8 && Math.abs(a[1] - b[1]) < 1e-8;

/**
 * Traçado de um cabo depois de mover o objeto `nodeId` de `from` para `to`.
 * Acompanham o movimento: as pontas ligadas ao objeto e os vértices que passam
 * exatamente por ele (ex.: cabo apoiado num poste). Pontas ligadas a outro objeto
 * nunca se movem. endsOnly: só as pontas ligadas (objeto ancorado num poste/caixa; os cabos que passam
 * pelo poste ficam nele). Mesma regra do servidor (NodeController@update).
 */
export function movePath(cable: Cable, nodeId: number, from: LatLng, to: LatLng, endsOnly = false): LatLng[] {
  const last = cable.path.length - 1;
  let changed = false;
  const path = cable.path.map((p, i) => {
    const attached = (i === 0 && cable.from_node_id === nodeId) || (i === last && cable.to_node_id === nodeId);
    const otherEnd = (i === 0 && !!cable.from_node_id && cable.from_node_id !== nodeId) || (i === last && !!cable.to_node_id && cable.to_node_id !== nodeId);
    if (attached || (!endsOnly && !otherEnd && same(p, from))) {
      changed = true;
      return to;
    }
    return p;
  });
  return changed ? path : cable.path;
}

/** Arredonda para 7 casas decimais (≈ 1 cm), a precisão gravada no banco. */
export const roundLatLng = (p: LatLng): LatLng => [Math.round(p[0] * 1e7) / 1e7, Math.round(p[1] * 1e7) / 1e7];
