import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPermission, isPushSupported, urlBase64ToUint8Array } from '../pushService';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('urlBase64ToUint8Array', () => {
  it('decodifica base64url (com - e _) para bytes', () => {
    // "AQID" em base64 padrão = bytes [1, 2, 3].
    const bytes = urlBase64ToUint8Array('AQID');
    expect(Array.from(bytes)).toEqual([1, 2, 3]);
  });

  it('aplica padding quando o comprimento não é múltiplo de 4', () => {
    // "AQI" (sem padding) → "AQI=" → bytes [1, 2].
    const bytes = urlBase64ToUint8Array('AQI');
    expect(Array.from(bytes)).toEqual([1, 2]);
  });

  it('traduz o alfabeto url-safe (- → +, _ → /)', () => {
    // Bytes [251, 255] em base64 padrão = "+/8="; em base64url = "-_8".
    const bytes = urlBase64ToUint8Array('-_8');
    expect(Array.from(bytes)).toEqual([251, 255]);
  });
});

describe('suporte / permissão sem APIs de navegador', () => {
  it('isPushSupported é false fora de um navegador (sem window)', () => {
    expect(isPushSupported()).toBe(false);
  });

  it('getPermission reporta "unsupported" quando não há Notification', () => {
    expect(getPermission()).toBe('unsupported');
  });

  it('getPermission repassa Notification.permission quando existe', () => {
    vi.stubGlobal('Notification', { permission: 'granted' });
    expect(getPermission()).toBe('granted');
  });
});
