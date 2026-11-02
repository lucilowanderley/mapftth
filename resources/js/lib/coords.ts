import type { LatLng } from './types';

/**
 * Converte um valor digitado em graus decimais. Aceita:
 *  - decimal com ponto ou vírgula: "-8.0476", "-8,0476"
 *  - graus/minutos/segundos: 8°03'12.5"S, 34 52 30 W, 8°3.21'S
 * Retorna null quando não é possível interpretar.
 */
export function parseDegrees(input: string): number | null {
  let s = input.trim().toUpperCase();
  if (!s) return null;
  let sign = 1;
  const hemi = s.match(/[NSLEWO]/g);
  if (hemi) {
    const h = hemi[hemi.length - 1];
    if (h === 'S' || h === 'W' || h === 'O') sign = -1;
    s = s.replace(/[NSLEWO]/g, ' ');
  }
  s = s.trim();
  if (s.startsWith('-')) {
    sign = -sign;
    s = s.slice(1);
  } else if (s.startsWith('+')) {
    s = s.slice(1);
  }
  // Só um número: decimal (aceita vírgula como separador decimal)
  if (/^\d+([.,]\d+)?$/.test(s)) return sign * Number(s.replace(',', '.'));
  const parts = s
    .replace(/[°º'’′"”″]/g, ' ')
    .trim()
    .split(/\s+/)
    .map((p) => p.replace(',', '.'));
  if (parts.length < 1 || parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return null;
  const [d, m = '0', sec = '0'] = parts;
  const mm = Number(m);
  const ss = Number(sec);
  if (mm >= 60 || ss >= 60) return null;
  return sign * (Number(d) + mm / 60 + ss / 3600);
}

/** Valida uma latitude/longitude digitada. Devolve o par ou uma mensagem de erro. */
export function parseLatLng(lat: string, lng: string): LatLng | string {
  const a = parseDegrees(lat);
  const b = parseDegrees(lng);
  if (a === null) return 'Latitude inválida';
  if (b === null) return 'Longitude inválida';
  if (a < -90 || a > 90) return 'Latitude deve estar entre -90 e 90';
  if (b < -180 || b > 180) return 'Longitude deve estar entre -180 e 180';
  return [a, b];
}

/**
 * Interpreta um par colado num campo só, como "-8.0476, -34.8770"
 * (formato do Google Maps) ou "8°03'S 34°52'W". Retorna null se não for um par.
 */
export function parsePair(input: string): LatLng | null {
  const s = input.trim();
  if (!s) return null;
  let parts: string[] | null = null;
  // Decimal com ponto separado por vírgula/ponto e vírgula/espaço
  const dec = s.match(/^([-+]?\d+(?:\.\d+)?)\s*[,;\s]\s*([-+]?\d+(?:\.\d+)?)$/);
  if (dec) parts = [dec[1], dec[2]];
  // Decimal com vírgula separado por ponto e vírgula: "-8,04; -34,87"
  if (!parts) {
    const semi = s.split(';');
    if (semi.length === 2) parts = semi;
  }
  // GMS: separa após o primeiro hemisfério
  if (!parts) {
    const m = s.toUpperCase().match(/^(.+?[NS])\s*,?\s*(.+[LEWO])$/);
    if (m) parts = [m[1], m[2]];
  }
  if (!parts) return null;
  const r = parseLatLng(parts[0], parts[1]);
  return typeof r === 'string' ? null : r;
}

export function formatCoord(v: number): string {
  return v.toFixed(7).replace(/0+$/, '').replace(/\.$/, '');
}
