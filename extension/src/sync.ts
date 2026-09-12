import { fetchDrawHistory } from '../../web/src/services/caixaApi';
import { Lottery } from '../../web/src/types/domain';
import { saveDraws, setLastSyncAt } from './storage';

/** Intervalo do `chrome.alarms` de sincronização — mesmo valor usado pelo PWA (`SYNC_INTERVAL_MS`). */
export const SYNC_PERIOD_MINUTES = 24 * 60;

const ALL_LOTTERIES = [Lottery.MEGA_SENA, Lottery.MAIS_MILIONARIA];

/**
 * Busca o histórico de todas as loterias e faz upsert em `chrome.storage.local`.
 * Nunca lança: `fetchDrawHistory` já devolve `null` em falha de rede, e cada
 * loteria é tratada independente uma da outra. Devolve quantos concursos
 * novos entraram no total — o service worker usa isso para o badge.
 */
export async function syncAndCountNew(): Promise<number> {
  let added = 0;
  for (const lottery of ALL_LOTTERIES) {
    const history = await fetchDrawHistory(lottery);
    if (history && history.length > 0) {
      added += await saveDraws(lottery, history);
    }
  }
  await setLastSyncAt(Date.now());
  return added;
}
