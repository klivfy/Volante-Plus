import { describe, expect, it } from 'vitest';
import {
  MAX_BODY_BYTES,
  clampNotificationText,
  clientIp,
  hasValidKeys,
  isValidPushEndpoint,
  readJsonBody,
  sameOriginPath,
  secretMatches,
} from '../pushSecurity';

function jsonRequest(body: string, headers: Record<string, string> = {}): Request {
  return new Request('https://volante.plus/api/push/send', {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

describe('secretMatches', () => {
  it('aceita o segredo correto e rejeita variações', () => {
    expect(secretMatches('s3gr3d0', 's3gr3d0')).toBe(true);
    expect(secretMatches('s3gr3d0x', 's3gr3d0')).toBe(false);
    expect(secretMatches('', 's3gr3d0')).toBe(false);
    expect(secretMatches('S3GR3D0', 's3gr3d0')).toBe(false);
  });

  it('não estoura com tamanhos diferentes', () => {
    expect(() => secretMatches('a', 'aaaaaaaaaaaaaaaa')).not.toThrow();
  });
});

describe('isValidPushEndpoint', () => {
  it('aceita os serviços de push dos navegadores', () => {
    expect(isValidPushEndpoint('https://fcm.googleapis.com/fcm/send/abc')).toBe(true);
    expect(isValidPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x')).toBe(true);
    expect(isValidPushEndpoint('https://web.push.apple.com/QABC')).toBe(true);
    expect(isValidPushEndpoint('https://wns2-par02p.notify.windows.com/w/?token=x')).toBe(true);
  });

  it('recusa hosts arbitrários — o vetor de SSRF', () => {
    expect(isValidPushEndpoint('https://atacante.example/coleta')).toBe(false);
    expect(isValidPushEndpoint('http://fcm.googleapis.com/fcm/send/abc')).toBe(false);
    expect(isValidPushEndpoint('https://169.254.169.254/latest/meta-data/')).toBe(false);
    expect(isValidPushEndpoint('https://fcm.googleapis.com.atacante.example/x')).toBe(false);
    expect(isValidPushEndpoint('file:///etc/passwd')).toBe(false);
    expect(isValidPushEndpoint('')).toBe(false);
    expect(isValidPushEndpoint(null)).toBe(false);
  });

  it('recusa portas não padrão — varredura de portas por procuração (pentest 2026-11)', () => {
    expect(isValidPushEndpoint('https://fcm.googleapis.com:8443/fcm/send/x')).toBe(false);
    expect(isValidPushEndpoint('https://fcm.googleapis.com:8080/x')).toBe(false);
    expect(isValidPushEndpoint('https://fcm.googleapis.com:443/fcm/send/x')).toBe(true);
    expect(isValidPushEndpoint('https://fcm.googleapis.com/fcm/send/x')).toBe(true);
  });
});

describe('hasValidKeys', () => {
  const p256dh = 'B'.repeat(87);
  const auth = 'A'.repeat(22);

  it('aceita chaves no formato base64url do web-push', () => {
    expect(hasValidKeys({ p256dh, auth })).toBe(true);
  });

  it('recusa chaves ausentes, curtas ou com caracteres inválidos', () => {
    expect(hasValidKeys(null)).toBe(false);
    expect(hasValidKeys({ p256dh })).toBe(false);
    expect(hasValidKeys({ p256dh: 'curta', auth })).toBe(false);
    expect(hasValidKeys({ p256dh: `${'B'.repeat(80)}/+=`, auth })).toBe(false);
    expect(hasValidKeys({ p256dh, auth: 'X'.repeat(200) })).toBe(false);
  });
});

describe('sameOriginPath', () => {
  it('preserva caminhos internos', () => {
    expect(sameOriginPath('/backtesting')).toBe('/backtesting');
    expect(sameOriginPath('/sobre?x=1#y')).toBe('/sobre?x=1#y');
  });

  it('neutraliza destinos externos — o vetor de phishing', () => {
    expect(sameOriginPath('https://atacante.example/premio')).toBe('/');
    expect(sameOriginPath('//atacante.example/premio')).toBe('/');
    expect(sameOriginPath('javascript:alert(1)')).toBe('/');
    expect(sameOriginPath(undefined)).toBe('/');
    expect(sameOriginPath(42)).toBe('/');
  });

  it('neutraliza escapes do parser de URL (pentest 2026-11)', () => {
    // O parser do navegador trata \\ como / e remove \n \r \t — formas que
    // virariam protocol-relative e escapariam da origem no openWindow.
    expect(sameOriginPath('/\\atacante.example')).toBe('/');
    expect(sameOriginPath('/\n//atacante.example')).toBe('/');
    expect(sameOriginPath('/\r//atacante.example')).toBe('/');
    expect(sameOriginPath('/\t//atacante.example')).toBe('/');
    expect(sameOriginPath('/\\/\\atacante.example')).toBe('/');
    expect(sameOriginPath('/caminho\u0000ok')).toBe('/');
  });
});

describe('readJsonBody', () => {
  it('lê JSON dentro do limite', async () => {
    const body = await readJsonBody<{ a: number }>(jsonRequest('{"a":1}'));
    expect(body).toEqual({ a: 1 });
  });

  it('recusa JSON inválido', async () => {
    expect(await readJsonBody(jsonRequest('{'))).toBeNull();
  });

  it('recusa corpo acima do teto mesmo com content-length mentindo', async () => {
    const huge = JSON.stringify({ a: 'x'.repeat(MAX_BODY_BYTES + 1000) });
    const request = jsonRequest(huge, { 'content-length': '10' });
    expect(await readJsonBody(request)).toBeNull();
  });
});

describe('clampNotificationText', () => {
  it('corta textos longos preservando os curtos', () => {
    expect(clampNotificationText('  Novo sorteio  ', 40)).toBe('Novo sorteio');
    expect(clampNotificationText('x'.repeat(50), 10)).toHaveLength(10);
    expect(clampNotificationText('x'.repeat(50), 10).endsWith('…')).toBe(true);
  });
});

describe('clientIp', () => {
  function req(headers: Record<string, string>): Request {
    return new Request('https://volante.plus/api/push/subscribe', { headers });
  }

  it('prefere o IP definido pela plataforma (inunsigned pelo cliente)', () => {
    expect(
      clientIp(
        req({
          'x-forwarded-for': '6.6.6.6', // spoofado pelo cliente
          'x-real-ip': '203.0.113.7', // definido pela plataforma
        }),
      ),
    ).toBe('203.0.113.7');
    expect(
      clientIp(req({ 'x-forwarded-for': '6.6.6.6', 'x-nf-client-connection-ip': '198.51.100.9' })),
    ).toBe('198.51.100.9');
  });

  it('cai para XFF só quando não há cabeçalho de plataforma', () => {
    expect(clientIp(req({ 'x-forwarded-for': '203.0.113.5, 10.0.0.1' }))).toBe('203.0.113.5');
    expect(clientIp(req({}))).toBe('unknown');
  });
});

describe('rateLimited', () => {
  it('bloqueia depois do teto e libera na janela seguinte', async () => {
    const { rateLimited } = await import('../pushSecurity');
    const t0 = 1_000_000;
    for (let i = 0; i < 20; i++) expect(rateLimited('ip-a', t0)).toBe(false);
    expect(rateLimited('ip-a', t0)).toBe(true);
    expect(rateLimited('ip-b', t0)).toBe(false);
    expect(rateLimited('ip-a', t0 + 60 * 60 * 1000 + 1)).toBe(false);
  });
});
