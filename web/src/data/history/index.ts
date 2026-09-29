import { Draw, Lottery } from '../../types/domain';
import meta from './meta.json';

/**
 * Histórico REAL embutido: todos os concursos do 1º até o último da geração
 * (`meta.json`), para o app nascer completo mesmo sem rede.
 *
 * Fonte: API pública de loterias (`loteriascaixa-api`, de terceiros — não é a
 * Caixa), validada por `scripts/update-history-seed.mjs` (contíguo desde o
 * concurso 1, regras da modalidade, e 100% coincidente com um segundo espelho
 * independente nos concursos em comum). A sincronização em runtime
 * (`services/historySync.ts`) completa o que faltar até o último concurso.
 *
 * Os arquivos são carregados sob demanda (`import()`), para não pesar no bundle
 * inicial de quem já tem o histórico no banco.
 */

export interface HistorySeedMeta {
  count: number;
  firstContest: number;
  lastContest: number;
  lastDate: string;
}

export const HISTORY_SEED_META: Record<Lottery, HistorySeedMeta> = {
  [Lottery.MEGA_SENA]: meta.lotteries.megasena,
  [Lottery.MAIS_MILIONARIA]: meta.lotteries.maismilionaria,
};

/** Identifica a versão do seed embutido; muda quando `meta.json` é regenerado. */
export function historySeedVersion(): string {
  return `${HISTORY_SEED_META[Lottery.MEGA_SENA].lastContest}-${HISTORY_SEED_META[Lottery.MAIS_MILIONARIA].lastContest}`;
}

type Tuple = [number, string, number[]] | [number, string, number[], number[]];

function expand(lottery: Lottery, tuples: readonly Tuple[]): Draw[] {
  return tuples.map(([contestNumber, date, numbers, trevos]) => ({
    lottery,
    contestNumber,
    date,
    numbers,
    ...(trevos ? { trevos } : {}),
  }));
}

/** Histórico completo embutido de uma loteria, em ordem de concurso. */
export async function loadHistorySeed(lottery: Lottery): Promise<Draw[]> {
  switch (lottery) {
    case Lottery.MEGA_SENA:
      return expand(lottery, (await import('./megasena.json')).default as unknown as Tuple[]);
    case Lottery.MAIS_MILIONARIA:
      return expand(lottery, (await import('./maismilionaria.json')).default as unknown as Tuple[]);
    default:
      return [];
  }
}
