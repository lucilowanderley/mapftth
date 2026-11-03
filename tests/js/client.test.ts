import { describe, expect, it } from 'vitest';
import { clientDataOf, looksLikeGponSerial, normalizeSerial } from '../../resources/js/lib/client';

describe('dados do cliente para integração', () => {
  it('lê ID, serial e tipo dos atributos, ignorando valores inválidos', () => {
    expect(clientDataOf({ client_code: '104523', onu_serial: 'HWTC1A2B3C4D', segment: 'corporate', address: 'x' })).toEqual({
      client_code: '104523',
      onu_serial: 'HWTC1A2B3C4D',
      segment: 'corporate',
    });
    expect(clientDataOf({ segment: 'vip', client_code: '' })).toEqual({ client_code: null, onu_serial: null, segment: null });
    expect(clientDataOf(null).segment).toBeNull();
  });

  it('normaliza o serial e reconhece o formato GPON usual', () => {
    expect(normalizeSerial(' hwtc 1a2b3c4d ')).toBe('HWTC1A2B3C4D');
    expect(looksLikeGponSerial('HWTC1A2B3C4D')).toBe(true);
    expect(looksLikeGponSerial('ZTEGC0FFEE01')).toBe(true);
    expect(looksLikeGponSerial('12345')).toBe(false);
  });
});
