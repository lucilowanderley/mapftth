import type { LatLng } from './types';

const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;

export function distance(a: LatLng, b: LatLng): number {
  const dLat = rad(b[0] - a[0]);
  const dLng = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function pathLength(path: LatLng[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += distance(path[i - 1], path[i]);
  return total;
}
