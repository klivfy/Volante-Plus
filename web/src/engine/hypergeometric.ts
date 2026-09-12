import { Lottery } from '../types/domain';
import { lotteryRules, prizeTiers } from './prizeRules';

/**
 * Distribuição hipergeométrica — o modelo exato de um sorteio de loteria:
 * amostragem **sem reposição** de `n` itens de uma população de `N`, da qual
 * `K` são "sucessos".
 *
 * Matemática pura, sem dependências: roda em página, Service Worker e teste.
 */

/**
 * Cache incremental de `ln(n!)`.
 *
 * WHY (logaritmos): C(60,6) cabe num `double`, mas o produto de três binomiais
 * no numerador/denominador estoura antes de a divisão acontecer. Somar
 * logaritmos e exponenciar no fim mantém a precisão para qualquer N.
 */
const logFactorialCache: number[] = [0, 0];

function logFactorial(n: number): number {
  for (let i = logFactorialCache.length; i <= n; i++) {
    logFactorialCache[i] = logFactorialCache[i - 1] + Math.log(i);
  }
  return logFactorialCache[n];
}

/** `ln(C(n, k))`. Assume `0 <= k <= n`. */
function logChoose(n: number, k: number): number {
  return logFactorial(n) - logFactorial(k) - logFactorial(n - k);
}

/** Coeficiente binomial C(n, k); 0 fora do domínio. */
export function binomial(n: number, k: number): number {
  if (!Number.isInteger(n) || !Number.isInteger(k) || n < 0 || k < 0 || k > n) {
    return 0;
  }
  return Math.round(Math.exp(logChoose(n, k)));
}

/**
 * P(X = k) numa distribuição hipergeométrica.
 *
 * @param N tamanho da população (universo de dezenas).
 * @param K sucessos na população (dezenas sorteadas no concurso).
 * @param n tamanho da amostra (dezenas da aposta).
 * @param k sucessos observados na amostra (acertos).
 * @returns probabilidade em [0, 1]; 0 para um `k` impossível.
 * @throws RangeError se os parâmetros não descreverem uma população válida.
 */
export function hypergeometricProbability(
  N: number,
  K: number,
  n: number,
  k: number,
): number {
  if (![N, K, n, k].every(Number.isInteger)) {
    throw new RangeError('N, K, n e k devem ser inteiros');
  }
  if (N < 0 || K < 0 || n < 0) {
    throw new RangeError('N, K e n não podem ser negativos');
  }
  if (K > N || n > N) {
    throw new RangeError(`K e n não podem exceder N (N=${N}, K=${K}, n=${n})`);
  }
  // Fora do suporte da distribuição: probabilidade zero, não é erro de uso.
  if (k < 0 || k > K || k > n || n - k > N - K) {
    return 0;
  }
  const probability = Math.exp(
    logChoose(K, k) + logChoose(N - K, n - k) - logChoose(N, n),
  );
  return Math.min(1, Math.max(0, probability));
}

/** P(X >= k) — probabilidade de acertar `k` ou mais. */
export function hypergeometricAtLeast(
  N: number,
  K: number,
  n: number,
  k: number,
): number {
  let total = 0;
  for (let hits = Math.max(0, k); hits <= Math.min(K, n); hits++) {
    total += hypergeometricProbability(N, K, n, hits);
  }
  return Math.min(1, total);
}

/** Média da distribuição: `n * K / N`. Acertos esperados numa aposta simples. */
export function hypergeometricMean(N: number, K: number, n: number): number {
  if (N <= 0) {
    throw new RangeError('N deve ser positivo');
  }
  return (n * K) / N;
}

/**
 * Probabilidade de uma aposta simples cair em cada faixa de premiação.
 *
 * Nas loterias com trevo as duas amostragens são independentes (dezenas e
 * trevos saem de urnas separadas), então a probabilidade da faixa é o produto.
 *
 * @returns mapa `chave da faixa -> probabilidade`, ex.: `{ '6': 1/50063860 }`.
 */
export function prizeProbabilities(lottery: Lottery): Record<string, number> {
  const rules = lotteryRules(lottery);
  const result: Record<string, number> = {};

  for (const tier of prizeTiers(lottery)) {
    const numbers = hypergeometricProbability(
      rules.numberUniverse,
      rules.numbersDrawn,
      rules.numbersPerBet,
      tier.numberHits,
    );
    const trevos =
      tier.trevoHits === undefined
        ? 1
        : hypergeometricProbability(
            rules.trevoUniverse,
            rules.trevosDrawn,
            rules.trevosPerBet,
            tier.trevoHits,
          );
    result[tier.key] = numbers * trevos;
  }

  return result;
}

/**
 * Prêmios esperados por faixa para um lote de apostas simples.
 *
 * O valor é a esperança matemática — `apostas x probabilidade da faixa` — e
 * portanto fracionário e minúsculo: `expectedPrizes(5, MEGA_SENA)['6']` fica
 * na casa de 1e-7. É esse o número que o backtesting usa como linha de base
 * para julgar se um método "funciona" ou apenas empatou com o acaso.
 *
 * @param gamesCount quantidade de apostas simples (não negativo).
 * @returns mapa `chave da faixa -> prêmios esperados`.
 */
export function expectedPrizes(
  gamesCount: number,
  lottery: Lottery,
): Record<string, number> {
  if (!Number.isInteger(gamesCount) || gamesCount < 0) {
    throw new RangeError(`gamesCount deve ser inteiro não negativo (recebido: ${gamesCount})`);
  }
  const probabilities = prizeProbabilities(lottery);
  const result: Record<string, number> = {};
  for (const [key, probability] of Object.entries(probabilities)) {
    result[key] = gamesCount * probability;
  }
  return result;
}

/** Acertos esperados de dezenas numa aposta simples — o baseline do acaso. */
export function expectedNumberHits(lottery: Lottery): number {
  const rules = lotteryRules(lottery);
  return hypergeometricMean(rules.numberUniverse, rules.numbersDrawn, rules.numbersPerBet);
}
