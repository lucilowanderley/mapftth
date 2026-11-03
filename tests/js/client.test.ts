import { describe, expect, it } from 'vitest';
import { clientDataOf, looksLikeGponSerial, normalizeSerial } from '../../resources/js/lib/client';

describe('dados do cliente para integração', () => {
  it('lê ID, serial e tipo dos atributos, ignorando valores inválidos', () => {
    expect(clientDataOf({ client_code: '104523', onu_serial: 'HWTC1A2B3C4D', segment: 'corporate', address: 'x', rx_dbm: -21.5, rx_at: '2026-11-03T10:00:00Z' })).toEqual({
      client_code: '104523',
      onu_serial: 'HWTC1A2B3C4D',
      segment: 'corporate',
      rx_dbm: -21.5,
      rx_at: '2026-11-03T10:00:00Z',
    });
    expect(clientDataOf({ segment: 'vip', client_code: '', rx_dbm: 'x' })).toEqual({ client_code: null, onu_serial: null, segment: null, rx_dbm: null, rx_at: null });
    expect(clientDataOf(null).segment).toBeNull();
  });

  it('normaliza o serial e reconhece o formato GPON usual', () => {
    expect(normalizeSerial(' hwtc 1a2b3c4d ')).toBe('HWTC1A2B3C4D');
    expect(looksLikeGponSerial('HWTC1A2B3C4D')).toBe(true);
    expect(looksLikeGponSerial('ZTEGC0FFEE01')).toBe(true);
    expect(looksLikeGponSerial('12345')).toBe(false);
  });
});
