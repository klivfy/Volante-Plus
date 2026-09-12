import browser from 'webextension-polyfill';
import { SYNC_PERIOD_MINUTES, syncAndCountNew } from './sync';

/**
 * Service worker MV3 da extensão: sincroniza o histórico em segundo plano via
 * `chrome.alarms` (funciona com o worker suspenso entre disparos — diferente
 * de `setInterval`, que morreria junto com o worker) e atualiza o badge do
 * ícone quando há concursos novos.
 */

const ALARM_NAME = 'volante-plus-sync';
const BADGE_COLOR = '#6750A4';

async function runSyncAndBadge(): Promise<void> {
  try {
    const added = await syncAndCountNew();
    if (added > 0) {
      await browser.action.setBadgeBackgroundColor({ color: BADGE_COLOR });
      await browser.action.setBadgeText({ text: String(added) });
    }
  } catch {
    // Best-effort: falha de rede/API fora do ar não deve derrubar o worker
    // nem impedir o próximo alarme de disparar.
  }
}

function ensureAlarm(): void {
  browser.alarms.get(ALARM_NAME).then((existing) => {
    if (!existing) {
      browser.alarms.create(ALARM_NAME, { periodInMinutes: SYNC_PERIOD_MINUTES });
    }
  });
}

// Instalação/atualização da extensão e reinício do navegador: garante o alarme
// recorrente e roda uma sincronização inicial imediata (não espera o primeiro
// disparo, que só viria em até 24h).
browser.runtime.onInstalled.addListener(() => {
  ensureAlarm();
  void runSyncAndBadge();
});

browser.runtime.onStartup.addListener(() => {
  ensureAlarm();
});

browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    void runSyncAndBadge();
  }
});

// O popup avisa quando abre (ver popup-app) — o usuário "viu" os sorteios
// novos, então o badge pode ser limpo.
browser.runtime.onMessage.addListener((message: unknown) => {
  if ((message as { type?: string } | undefined)?.type === 'popup-opened') {
    void browser.action.setBadgeText({ text: '' });
  }
});
