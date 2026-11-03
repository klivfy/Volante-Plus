'use client';

import { useEffect } from 'react';
import { CONSENT_CHANGED_EVENT, ConsentState, readConsent } from '@/services/consent';

/**
 * Métricas de acesso (Plausible) sob consentimento — LGPD Art. 7º, I.
 *
 * Antes: o `<script>` do Plausible era injetado no `<head>` do layout sempre
 * que `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` estava definido — analytics rodava sem
 * perguntar. Agora o script só entra no DOM quando o titular concede a
 * categoria `analiticos` (opt-in; "não decidido" também bloqueia), e é
 * REMOVIDO no ato quando o consentimento é revogado.
 *
 * Plausible é cookieless e agrega dados, mas continua sendo um script
 * terceiro que observa a navegação: a diretriz de conformidade manda
 * desativar analíticos por padrão — e é o que este componente faz.
 *
 * Sem `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` no build, nada é injetado nunca
 * (comportamento igual ao anterior — o script nem existia).
 */

const SCRIPT_ID = 'plausible-script';

function plausibleDomain(): string | undefined {
  return process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN || undefined;
}

function injectScript(domain: string): void {
  if (document.getElementById(SCRIPT_ID)) return;
  const script = document.createElement('script');
  script.id = SCRIPT_ID;
  script.defer = true;
  script.dataset.domain = domain;
  script.src =
    process.env.NEXT_PUBLIC_PLAUSIBLE_API_HOST || 'https://plausible.io/js/script.js';
  document.head.appendChild(script);
}

function removeScript(): void {
  document.getElementById(SCRIPT_ID)?.remove();
}

function syncScript() {
  const domain = plausibleDomain();
  if (!domain) return; // Sem integração configurada no build: nunca injeta.
  const consent = readConsent(window.localStorage);
  if (consent?.analiticos === true) {
    injectScript(domain);
  } else {
    removeScript();
  }
}

/**
 * Componente invisível: renderiza `null` e opera só no DOM. Escuta
 * `volante:consent-changed` para injetar/remover no ato da decisão.
 */
export default function PlausibleScript() {
  useEffect(() => {
    syncScript();
    const onConsentChanged = (event: Event) => {
      // Reage a qualquer decisão (CustomEvent<ConsentState>): o estado
      // fresco vem do localStorage — mesma fonte do banner.
      void (event as CustomEvent<ConsentState>).detail;
      syncScript();
    };
    window.addEventListener(CONSENT_CHANGED_EVENT, onConsentChanged);
    return () => {
      window.removeEventListener(CONSENT_CHANGED_EVENT, onConsentChanged);
      // Desmontagem (navegação RSC não desmonta o layout, mas por higiene):
      // sem consentimento não há motivo para manter o script no DOM.
      const consent = readConsent(window.localStorage);
      if (consent?.analiticos !== true) removeScript();
    };
  }, []);

  return null;
}
