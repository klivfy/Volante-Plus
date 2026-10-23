import { loadHistorySeed } from '../../web/src/data/history';
import { defaultSources, DrawSource } from '../../web/src/services/drawSources';
import { syncLottery } from '../../web/src/services/historySync';
import { Lottery } from '../../web/src/types/domain';
import { getDraws, saveDraws, setLastSyncAt } from './storage';

/** Intervalo do `chrome.alarms` de sincronização — o histórico é conferido de 6 em 6 horas. */
export const SYNC_PERIOD_MINUTES = 6 * 60;

const ALL_LOTTERIES = Object.values(Lottery);

/**
 * Completa o histórico de todas as loterias até o ÚLTIMO concurso e faz upsert
 * em `chrome.storage.local`. Mesmo algoritmo do app web (`historySync`): parte
 * do seed real embutido (concursos 1..N), descobre o último concurso e busca só o
 * que falta — concursos novos e lacunas antigas. Nunca lança; cada loteria é
 * independente. Devolve quantos concursos novos entraram (o service worker usa
 * isso para o badge; o preenchimento do seed não conta como "novo").
 */
export async function syncAndCountNew(sources: DrawSource[] = defaultSources()): Promise<number> {
  let added = 0;
  for (const lottery of ALL_LOTTERIES) {
    try {
      const stored = await getDraws(lottery);
      const have = new Set(stored.map((d) => d.contestNumber));
      const missingFromSeed = (await loadHistorySeed(lottery)).filter((d) => !have.has(d.contestNumber));
      if (missingFromSeed.length > 0) await saveDraws(lottery, missingFromSeed);

      const report = await syncLottery(lottery, {
        sources,
        storedContests: async () => new Set((await getDraws(lottery)).map((d) => d.contestNumber)),
        save: async (draws) => {
          await saveDraws(lottery, draws);
        },
      });
      added += report.added;
    } catch {
      // Uma loteria com problema não impede a outra.
    }
  }
  await setLastSyncAt(Date.now());
  return added;
}
