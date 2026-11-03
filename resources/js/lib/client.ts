/**
 * Dados do cliente (assinante) usados na integração com outros sistemas: código (ID), serial da ONU/ONT e tipo.
 * Ficam em `attributes` do cliente do mapa e no cliente desenhado no diagrama da CTO/CEO (sincronizados ao salvar).
 */

export type ClientSegment = 'residential' | 'business' | 'corporate';

export const CLIENT_SEGMENTS: Record<ClientSegment, string> = {
  residential: 'Residencial',
  business: 'Empresarial',
  corporate: 'Corporativo',
};

export interface ClientData {
  /** ID do cliente no sistema de gestão (ERP/CRM). */
  client_code?: string | null;
  /** Serial da ONU/ONT (ex.: HWTC1A2B3C4D). */
  onu_serial?: string | null;
  segment?: ClientSegment | null;
}

export const isSegment = (v: unknown): v is ClientSegment => v === 'residential' || v === 'business' || v === 'corporate';

/** Serial da ONU/ONT normalizado: sem espaços, em maiúsculas. */
export const normalizeSerial = (s: string) => s.replace(/\s+/g, '').toUpperCase();

/**
 * Serial no formato GPON usual: 4 letras do fabricante + 8 dígitos hexadecimais (ex.: HWTC1A2B3C4D, ZTEGC0FFEE01).
 * Só um aviso: há equipamentos com outros formatos.
 */
export const looksLikeGponSerial = (s: string) => /^[A-Z]{4}[0-9A-F]{8}$/.test(s);

/** Lê os dados do cliente de um `attributes` qualquer. */
export function clientDataOf(attrs: Record<string, unknown> | null | undefined): ClientData {
  const a = attrs ?? {};
  return {
    client_code: typeof a.client_code === 'string' && a.client_code ? a.client_code : null,
    onu_serial: typeof a.onu_serial === 'string' && a.onu_serial ? a.onu_serial : null,
    segment: isSegment(a.segment) ? a.segment : null,
  };
}

/** Desenho (SVG 24×24, traço) do ícone de cada tipo: casa, loja e prédio. */
export const SEGMENT_GLYPH: Record<ClientSegment, string> = {
  residential: 'M3 11 L12 3 L21 11 M5 9.5 V21 H19 V9.5 M10 21 V15 H14 V21',
  business: 'M3 9 L4.5 4 H19.5 L21 9 M3 9 H21 M3 9 C3 11 7 11 7 9 C7 11 12 11 12 9 C12 11 17 11 17 9 C17 11 21 11 21 9 M5 11 V21 H19 V11 M10 21 V15 H14 V21',
  corporate: 'M4 21 V3 H14 V21 M14 9 H20 V21 M2 21 H22 M7 7 H8 M10 7 H11 M7 11 H8 M10 11 H11 M7 15 H8 M10 15 H11 M17 13 H17.5 M17 17 H17.5',
};
