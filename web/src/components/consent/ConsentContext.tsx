'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  ReactNode,
  useSyncExternalStore,
} from 'react';
import {
  CONSENT_CHANGED_EVENT,
  CONSENT_STORAGE_KEY,
  ConsentGrants,
  ConsentState,
  defaultGrants,
  readConsent,
  revokeAllConsent,
  writeConsent,
} from '@/services/consent';
import { loadDiagnosticsNow } from '@/services/diagnostics';

/**
 * Contexto React do consentimento LGPD — única fonte da verdade para banner,
 * diálogo de preferências, página de privacidade e portões de script.
 *
 * O estado vive no localStorage (persistência do titular) e chega ao React
 * via `useSyncExternalStore` — a API pensada exatamente para stores externos:
 * sem setState em efeito (render em cascata), com snapshot estável e snapshot
 * de servidor (`null` = não decidido) para não divergir na hidratação.
 *
 * Falha silenciosa de storage (modo privado restritivo): o titular continua
 * usando o app com tudo desligado — nunca bloqueamos a navegação por
 * consentimento.
 */

/**
 * Store externo em nível de módulo. `cachedState === undefined` significa
 * "ainda não lido do localStorage" — o snapshot lê com preguiça e mantém a
 * MESMA referência entre renders enquanto nada muda (exigência do
 * useSyncExternalStore para não entrar em loop de renders).
 */
let cachedState: ConsentState | null | undefined;
const listeners = new Set<() => void>();

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  // Outra aba mudou o consentimento: esta aba acompanha (mesma origem, mesma
  // decisão — sem a bizarrice de um banner reaparecer num estado que a
  // própria pessoa já resolveu em outra aba).
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== CONSENT_STORAGE_KEY) return;
    cachedState = undefined; // invalida o cache — próximo snapshot relê
    onStoreChange();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(onStoreChange);
    window.removeEventListener('storage', onStorage);
  };
}

function getSnapshot(): ConsentState | null {
  if (cachedState === undefined) {
    cachedState = readConsent(window.localStorage);
  }
  return cachedState;
}

/** SSR: storage não existe no servidor — "não decidido" até hidratar. */
function getServerSnapshot(): ConsentState | null {
  return null;
}

/** "Estou no cliente?" — banner e UI dependem de storage: só pós-hidratação. */
const noopSubscribe = () => () => {};
const isClientSnapshot = () => true;
const isServerSnapshot = () => false;

function emitChange(next: ConsentState | null): void {
  cachedState = next;
  for (const listener of listeners) listener();
}

interface ConsentContextValue {
  /** Estado persistido; `null` = titular ainda não decidiu. */
  state: ConsentState | null;
  /** `true` após a hidratação — habilita banner/UI sem mismatch de SSR. */
  ready: boolean;
  /** Atalho: decisão tomada. */
  decided: boolean;
  /** Banner de primeira visita visível? */
  bannerVisible: boolean;
  /** Persiste as concessões (opt-in granular) com efeito imediato. */
  saveGrants: (grants: ConsentGrants) => void;
  /** Revoga tudo (todas as categorias `false`) com efeito imediato. */
  revokeAll: () => void;
  /** Diálogo de preferências (banner e página /privacidade o abrem). */
  preferencesOpen: boolean;
  openPreferences: () => void;
  closePreferences: () => void;
}

const ConsentContext = createContext<ConsentContextValue | null>(null);

export function ConsentProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const ready = useSyncExternalStore(noopSubscribe, isClientSnapshot, isServerSnapshot);
  const [preferencesOpen, setPreferencesOpen] = useState(false);

  const saveGrants = useCallback((grants: ConsentGrants) => {
    let saved: ConsentState;
    try {
      saved = writeConsent(grants, window.localStorage);
    } catch {
      // Storage indisponível: aplica em memória (nada não essencial roda de
      // qualquer forma sem persistência — e o banner voltaria na próxima
      // visita, que é o comportamento seguro).
      saved = { version: 1, decidedAt: new Date().toISOString(), ...grants };
    }
    emitChange(saved);
    // PlausibleScript escuta este evento para injetar/remover o script de
    // métricas no ato da decisão.
    window.dispatchEvent(new CustomEvent<ConsentState>(CONSENT_CHANGED_EVENT, { detail: saved }));
    // Opt-in tardio para diagnósticos: o init idle (instrumentation-client)
    // já passou — carrega o SDK agora. Sem DSN no build, o módulo não faz
    // nada (e o SDK não existe no bundle).
    if (grants.diagnosticos) loadDiagnosticsNow();
  }, []);

  const revokeAll = useCallback(() => {
    let revoked: ConsentState;
    try {
      revoked = revokeAllConsent(window.localStorage);
    } catch {
      revoked = { version: 1, decidedAt: new Date().toISOString(), ...defaultGrants() };
    }
    emitChange(revoked);
    window.dispatchEvent(new CustomEvent<ConsentState>(CONSENT_CHANGED_EVENT, { detail: revoked }));
  }, []);

  const value = useMemo<ConsentContextValue>(
    () => ({
      state,
      ready,
      decided: ready && state !== null,
      bannerVisible: ready && state === null,
      saveGrants,
      revokeAll,
      preferencesOpen,
      openPreferences: () => setPreferencesOpen(true),
      closePreferences: () => setPreferencesOpen(false),
    }),
    [state, ready, saveGrants, revokeAll, preferencesOpen],
  );

  return <ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>;
}

export function useConsent(): ConsentContextValue {
  const context = useContext(ConsentContext);
  if (!context) {
    throw new Error('useConsent deve ser usado dentro de <ConsentProvider>');
  }
  return context;
}
