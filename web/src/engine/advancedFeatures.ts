import { Draw, Lottery } from '../types/domain';
import { lotteryRules } from './prizeRules';

/**
 * Feature engineering avançado.
 *
 * `backtestAnalyzer.ts` deriva `weight` de só duas evidências: frequência
 * bruta e simulação Monte Carlo. Este módulo calcula features adicionais
 * (atraso, paridade, correlação com vizinhos, sequências, variância dos
 * gaps) para exploração — **não substitui** o `NumberPerformance` usado pelo
 * gerador real; é uma lente auxiliar para investigar se algum desses sinais
 * teria poder preditivo (a expectativa, dada a hipótese nula, é que não).
 */

export interface NumberFeatures {
  number: number;
  /** Vezes que a dezena apareceu no histórico analisado. */
  frequency: number;
  /** Concursos desde a última aparição (0 = apareceu no último concurso). */
  recency: number;
  /** `recency` normalizado por `histórico / universo` — comparável entre dezenas. */
  recencyScore: number;
  parity: 'even' | 'odd';
  /** Década da dezena: 1 para 1-10, 2 para 11-20, etc. */
  decade: number;
  /** Média da soma de todas as dezenas dos concursos em que esta apareceu. */
  sumContribution: number;
  /** Fração das vezes em que um vizinho imediato (n-1 ou n+1) saiu junto. */
  neighborCorrelation: number;
  /** Maior sequência de aparições em concursos consecutivos. */
  hotStreak: number;
  /** Variância dos gaps entre aparições sucessivas. */
  gapVariance: number;
}

/** Extrai as features acima para cada dezena do universo da loteria. */
export function extractAdvancedFeatures(draws: Draw[], lottery: Lottery): NumberFeatures[] {
  const rules = lotteryRules(lottery);
  const relevant = draws
    .filter((draw) => draw.lottery === lottery)
    .sort((a, b) => a.date.localeCompare(b.date));

  const features: NumberFeatures[] = [];

  for (let num = 1; num <= rules.numberUniverse; num++) {
    const appearances: number[] = [];
    let lastAppearance = -1;
    let maxStreak = 0;
    let currentStreak = 0;
    let sumContrib = 0;
    let neighborHits = 0;
    let neighborOpportunities = 0;

    for (let i = 0; i < relevant.length; i++) {
      const draw = relevant[i];
      const hasNum = draw.numbers.includes(num);

      if (hasNum) {
        appearances.push(i);
        sumContrib += draw.numbers.reduce((a, b) => a + b, 0);
        currentStreak++;
        maxStreak = Math.max(maxStreak, currentStreak);
        lastAppearance = i;

        if (num > 1 && draw.numbers.includes(num - 1)) neighborHits++;
        if (num < rules.numberUniverse && draw.numbers.includes(num + 1)) neighborHits++;
      } else {
        currentStreak = 0;
      }

      neighborOpportunities += (num > 1 ? 1 : 0) + (num < rules.numberUniverse ? 1 : 0);
    }

    const frequency = appearances.length;
    const recency = relevant.length === 0 ? 0 : relevant.length - 1 - lastAppearance;
    const gaps = appearances.slice(1).map((v, i) => v - appearances[i]);
    const meanGap = gaps.length > 0 ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
    const gapVariance =
      gaps.length > 1
        ? gaps.reduce((sum, g) => sum + Math.pow(g - meanGap, 2), 0) / gaps.length
        : 0;

    const expectedGap = relevant.length > 0 && frequency > 0 ? relevant.length / frequency : 0;

    features.push({
      number: num,
      frequency,
      recency,
      recencyScore:
        expectedGap > 0 ? Math.min(1, recency / expectedGap) : 0,
      parity: num % 2 === 0 ? 'even' : 'odd',
      decade: Math.ceil(num / 10),
      sumContribution: frequency > 0 ? sumContrib / frequency : 0,
      neighborCorrelation: neighborOpportunities > 0 ? neighborHits / neighborOpportunities : 0,
      hotStreak: maxStreak,
      gapVariance,
    });
  }

  return features;
}

export interface CompositeScoreWeights {
  frequency: number;
  recency: number;
  neighbor: number;
  streak: number;
}

export interface CompositeScoreRow {
  number: number;
  score: number;
}

/**
 * Score composto sobre o conjunto inteiro de features (não uma dezena
 * isolada — os máximos usados para normalizar cada componente vêm de todo o
 * universo). Puramente exploratório: não é usado por `gameGenerator.ts`.
 */
export function compositeScore(
  features: NumberFeatures[],
  weights: CompositeScoreWeights,
): CompositeScoreRow[] {
  if (features.length === 0) return [];

  const maxFreq = Math.max(1, ...features.map((f) => f.frequency));
  const maxRecency = Math.max(1, ...features.map((f) => f.recency));
  const maxStreak = Math.max(1, ...features.map((f) => f.hotStreak));

  return features
    .map((f) => ({
      number: f.number,
      score:
        weights.frequency * (f.frequency / maxFreq) +
        weights.recency * (1 - f.recency / maxRecency) + // menor recência = melhor
        weights.neighbor * f.neighborCorrelation +
        weights.streak * (f.hotStreak / maxStreak),
    }))
    .sort((a, b) => b.score - a.score || a.number - b.number);
}
