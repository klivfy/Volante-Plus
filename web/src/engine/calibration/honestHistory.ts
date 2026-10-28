import { Draw, Lottery } from '../../types/domain';
import { createSeededRandom } from '../random';

/**
 * Gerador de históricos honestos para o harness de calibração.
 *
 * Um histórico honesto é uma sequência de concursos sintéticos gerados sob o
 * modelo nulo que os métodos estatísticos assumem: sorteio uniforme e
 * independente, sem reposição dentro do concurso. Rodar um método sobre
 * muitos históricos honestos mede seu falso-positivo real — a fração de
 * sequências em que ele grita "anomalia" quando não há nada de anômalo.
 *
 * A semente é pública e fixa (mulberry32, via `createSeededRandom`): dois
 * executivos do mesmo commit produzem exatamente os mesmos históricos, e o
 * veredito de calibração é determinístico. As datas são construídas em UTC
 * (mesma disciplina da Onda 5) para o histórico ser idêntico em qualquer fuso.
 */

/** Parâmetros de sorteio de cada modalidade suportada. */
export interface LotterySpec {
  universe: number;
  drawn: number;
  trevos: { universe: number; drawn: number } | null;
}

export function lotterySpec(lottery: Lottery): LotterySpec {
  switch (lottery) {
    case Lottery.MEGA_SENA:
      return { universe: 60, drawn: 6, trevos: null };
    case Lottery.MAIS_MILIONARIA:
      return { universe: 50, drawn: 6, trevos: { universe: 6, drawn: 2 } };
    case Lottery.QUINA:
      return { universe: 80, drawn: 5, trevos: null };
    default: {
      const exhaustive: never = lottery;
      throw new Error(`loteria sem spec de calibração: ${String(exhaustive)}`);
    }
  }
}

function sampleWithoutReplacement(
  rng: ReturnType<typeof createSeededRandom>,
  universe: number,
  drawn: number,
): number[] {
  const set = new Set<number>();
  while (set.size < drawn) {
    set.add(1 + rng.nextInt(universe));
  }
  return [...set].sort((a, b) => a - b);
}

/**
 * Gera `count` concursos honestos da modalidade a partir da semente.
 * Determinístico: mesma (lottery, count, seed) → mesmo histórico, sempre.
 */
export function honestHistory(
  lottery: Lottery,
  count: number,
  seed: number,
): Draw[] {
  if (!Number.isInteger(count) || count <= 0) {
    throw new RangeError(`count deve ser inteiro positivo (recebido: ${count})`);
  }
  const spec = lotterySpec(lottery);
  const rng = createSeededRandom(seed);
  const firstDate = Date.UTC(2000, 0, 1);

  const draws: Draw[] = [];
  for (let i = 0; i < count; i++) {
    const date = new Date(firstDate + i * 3 * 24 * 60 * 60 * 1000);
    draws.push({
      lottery,
      contestNumber: i + 1,
      date: date.toISOString().slice(0, 10),
      numbers: sampleWithoutReplacement(rng, spec.universe, spec.drawn),
      ...(spec.trevos
        ? {
            trevos: sampleWithoutReplacement(
              rng,
              spec.trevos.universe,
              spec.trevos.drawn,
            ),
          }
        : {}),
    });
  }
  return draws;
}
