/**
 * Núcleo de consentimento LGPD (Lei nº 13.709/2018) — Privacy by Design.
 *
 * Regras implementadas (ver docs/CONFORMIDADE-LGPD.md):
 * - Privacy by Default: toda categoria NÃO essencial nasce DESLIGADA. Só há
 *   estado "concedido" após uma ação explícita do titular (opt-in).
 * - Estado "não decidido" (`readConsent() === null`) equivale a "sem
 *   consentimento": nenhum script não essencial roda enquanto o titular não
 *   escolhe — nem antes, nem depois do banner.
 * - Granularidade por finalidade: `analiticos` (métricas de acesso),
 *   `diagnosticos` (monitoramento de erros) e `marketing` (hoje sem nenhum
 *   script registrado — a categoria existe para o titular ver que nada roda
 *   nela e para acomodar integrações futuras com nova avaliação de base
 *   legal).
 * - Armazenamento essencial (sessão, preferências funcionais, IndexedDB do
 *   app) não depende de consentimento: é estritamente necessário para
 *   entregar o serviço que o titular pediu ao abrir o app.
 *
 * O módulo é TypeScript puro (sem DOM obrigatório): o storage é injetado,
 * o que permite testar em ambiente `node` e reusar a mesma lógica no
 * service worker futuro, se precisar.
 */

/** Categorias de consentimento não essenciais, na ordem exibida na UI. */
export const CONSENT_CATEGORIES = ['analiticos', 'diagnosticos', 'marketing'] as const;

export type ConsentCategory = (typeof CONSENT_CATEGORIES)[number];

/** Concessões por categoria — a fonte da verdade do que o titular escolheu. */
export type ConsentGrants = Record<ConsentCategory, boolean>;

export interface ConsentState extends ConsentGrants {
  /** Versão do esquema — migrar (ou descartar) se mudar a semântica. */
  version: 1;
  /** ISO 8601 do momento da decisão — prova de quando o consentimento foi dado. */
  decidedAt: string;
}

/** Chave do localStorage onde a decisão do titular persiste. */
export const CONSENT_STORAGE_KEY = 'volante_consent_v1';

/** Evento disparado em `window` a cada decisão salva (CustomEvent com detail `ConsentState`). */
export const CONSENT_CHANGED_EVENT = 'volante:consent-changed';

/** Storage mínimo usado pelo consentimento (subconjunto da interface `Storage`). */
export type ConsentStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/**
 * Concessões padrão: TUDO desligado. É o estado aplicado por "Rejeitar não
 * essenciais" e o ponto de partida das preferências — nenhum switch nasce
 * pré-marcado (LGPD exige opt-in; pré-seleção vicia o consentimento).
 */
export function defaultGrants(): ConsentGrants {
  return { analiticos: false, diagnosticos: false, marketing: false };
}

/**
 * Lê a decisão persistida. Devolve `null` quando o titular ainda não decidiu
 * ou quando o registro está corrompido/de versão desconhecida — nesse caso o
 * tratamento é o mesmo: nenhum script não essencial roda.
 */
export function readConsent(storage: ConsentStorage | null | undefined): ConsentState | null {
  if (!storage) return null;
  let raw: string | null;
  try {
    raw = storage.getItem(CONSENT_STORAGE_KEY);
  } catch {
    // Storage bloqueado (ex.: modo privado restritivo) — trata como não decidido.
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ConsentState> | null;
    if (!parsed || parsed.version !== 1) return null;
    const grants = defaultGrants();
    for (const category of CONSENT_CATEGORIES) {
      const value = parsed[category];
      // Qualquer campo ausente/inválido invalida o registro inteiro: é melhor
      // re-perguntar do que presumir um consentimento que não existe.
      if (typeof value !== 'boolean') return null;
      grants[category] = value;
    }
    if (typeof parsed.decidedAt !== 'string') return null;
    return { version: 1, decidedAt: parsed.decidedAt, ...grants };
  } catch {
    return null;
  }
}

/** Persiste a decisão do titular e devolve o estado normalizado. */
export function writeConsent(
  grants: ConsentGrants,
  storage: ConsentStorage,
  now: () => Date = () => new Date(),
): ConsentState {
  const state: ConsentState = { version: 1, decidedAt: now().toISOString(), ...grants };
  storage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(state));
  return state;
}

/** Revogação imediata de todos os consentimentos (Art. 18, § 5º da LGPD). */
export function revokeAllConsent(
  storage: ConsentStorage,
  now: () => Date = () => new Date(),
): ConsentState {
  return writeConsent(defaultGrants(), storage, now);
}

/** `true` somente quando o titular DECIDIU e CONCEDEU a categoria. */
export function isGranted(state: ConsentState | null, category: ConsentCategory): boolean {
  return state?.[category] === true;
}
