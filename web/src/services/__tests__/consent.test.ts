import { describe, expect, it } from 'vitest';
import {
  CONSENT_CATEGORIES,
  CONSENT_CHANGED_EVENT,
  CONSENT_STORAGE_KEY,
  ConsentGrants,
  defaultGrants,
  isGranted,
  readConsent,
  revokeAllConsent,
  writeConsent,
} from '../consent';

/**
 * Testes do núcleo de consentimento LGPD. Ambiente `node`: o Storage é
 * stubado em memória (o contrato usado pelo módulo é só
 * getItem/setItem/removeItem).
 */

function stubStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    /** Acesso de inspeção para os testes. */
    dump: () => Object.fromEntries(map),
  };
}

const fixedNow = () => new Date('2026-11-04T12:00:00Z');

describe('defaultGrants (Privacy by Default)', () => {
  it('nasce com TODAS as categorias desligadas — opt-in', () => {
    expect(defaultGrants()).toEqual({ analiticos: false, diagnosticos: false, marketing: false });
  });

  it('expõe as três categorias não essenciais da diretriz', () => {
    expect(CONSENT_CATEGORIES).toEqual(['analiticos', 'diagnosticos', 'marketing']);
  });
});

describe('readConsent', () => {
  it('devolve null quando o titular nunca decidiu', () => {
    expect(readConsent(stubStorage())).toBeNull();
    expect(readConsent(null)).toBeNull();
    expect(readConsent(undefined)).toBeNull();
  });

  it('devolve null para JSON corrompido (fallback seguro: sem consentimento)', () => {
    const storage = stubStorage({ [CONSENT_STORAGE_KEY]: '{não é json' });
    expect(readConsent(storage)).toBeNull();
  });

  it('devolve null para versão desconhecida (migração futura re-pergunta)', () => {
    const storage = stubStorage({
      [CONSENT_STORAGE_KEY]: JSON.stringify({ version: 99, analiticos: true, decidedAt: 'x' }),
    });
    expect(readConsent(storage)).toBeNull();
  });

  it('devolve null se qualquer categoria estiver ausente — não presume consentimento', () => {
    const storage = stubStorage({
      [CONSENT_STORAGE_KEY]: JSON.stringify({ version: 1, analiticos: true, decidedAt: 'x' }),
    });
    expect(readConsent(storage)).toBeNull();
  });

  it('lê uma decisão válida com todas as categorias', () => {
    const storage = stubStorage({
      [CONSENT_STORAGE_KEY]: JSON.stringify({
        version: 1,
        analiticos: true,
        diagnosticos: false,
        marketing: false,
        decidedAt: '2026-11-04T10:00:00.000Z',
      }),
    });
    const state = readConsent(storage);
    expect(state).not.toBeNull();
    expect(state?.analiticos).toBe(true);
    expect(state?.diagnosticos).toBe(false);
    expect(state?.marketing).toBe(false);
  });
});

describe('writeConsent / revokeAllConsent', () => {
  it('persiste a decisão e registra decidedAt ISO', () => {
    const storage = stubStorage();
    const grants: ConsentGrants = { analiticos: true, diagnosticos: false, marketing: false };
    const state = writeConsent(grants, storage, fixedNow);
    expect(state.decidedAt).toBe('2026-11-04T12:00:00.000Z');
    expect(JSON.parse(storage.dump()[CONSENT_STORAGE_KEY])).toEqual(state);
    // Roundtrip: o que foi escrito é lido igual.
    expect(readConsent(storage)).toEqual(state);
  });

  it('revogação deixa todas as categorias desligadas (Art. 18, § 5º)', () => {
    const storage = stubStorage();
    writeConsent({ analiticos: true, diagnosticos: true, marketing: true }, storage, fixedNow);
    const revoked = revokeAllConsent(storage, fixedNow);
    expect(revoked).toEqual({ version: 1, decidedAt: '2026-11-04T12:00:00.000Z', ...defaultGrants() });
    expect(readConsent(storage)).toEqual(revoked);
  });
});

describe('isGranted', () => {
  it('"não decidido" NUNCA concede categoria (nada roda sem decisão)', () => {
    expect(isGranted(null, 'analiticos')).toBe(false);
    expect(isGranted(null, 'diagnosticos')).toBe(false);
  });

  it('concede apenas a categoria marcada como true', () => {
    const state = { ...defaultGrants(), version: 1 as const, decidedAt: 'x', analiticos: true };
    expect(isGranted(state, 'analiticos')).toBe(true);
    expect(isGranted(state, 'diagnosticos')).toBe(false);
  });
});

describe('contratos de integração', () => {
  it('o evento de mudança tem nome estável (PlausibleScript/Contexto escutam)', () => {
    expect(CONSENT_CHANGED_EVENT).toBe('volante:consent-changed');
  });

  it('a chave de storage é estável entre versões do app', () => {
    expect(CONSENT_STORAGE_KEY).toBe('volante_consent_v1');
  });
});
