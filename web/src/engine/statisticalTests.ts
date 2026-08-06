import { Lottery } from '../types/domain';
import { hypergeometricProbability } from './hypergeometric';
import { lotteryRules } from './prizeRules';
import { approxChi2CDF, approxNormalCDF, binomialCDF } from './statUtils';

/**
 * Testes de significância estatística para o backtesting.
 *
 * O `BacktestReport` (`backtestEngine.ts`) já calcula `prizeRate` e
 * `expectedMeanHits`, mas não diz se a diferença observada é estatisticamente
 * distinguível do acaso. Este módulo fecha essa lacuna sem alterar o motor de
 * backtesting existente — consome o mesmo relatório e devolve um veredito
 * inferencial (p-value, intervalo de confiança, significância).
 */

export interface BinomialTestResult {
  /** P-value bilateral: P(observar um resultado tão extremo ou mais | H0). */
  pValue: number;
  /** Limite inferior do intervalo de confiança 95% (aproximação de Wilson). */
  ciLower: number;
  /** Limite superior do intervalo de confiança 95% (aproximação de Wilson). */
  ciUpper: number;
  /** `true` quando `pValue < 0.05` — rejeita H0 (método = acaso). */
  significant: boolean;
}

/**
 * Teste binomial exato bilateral: `successes` em `trials` tentativas contra
 * a probabilidade teórica `p0` (o baseline hipergeométrico).
 *
 * H0: p = p0 (o método não é diferente do acaso).
 * H1: p != p0.
 *
 * WHY (Wilson, não Clopper-Pearson): o documento de origem propunha o
 * intervalo exato de Clopper-Pearson via `jStat`, uma dependência externa que
 * o engine não tem (e não deveria ganhar, ver `random.ts`). O intervalo de
 * Wilson é a aproximação padrão sem essa dependência e converge para o exato
 * conforme `trials` cresce — o mesmo regime em que o teste é útil aqui.
 */
export function binomialExactTest(
  successes: number,
  trials: number,
  p0: number,
): BinomialTestResult {
  if (trials <= 0 || p0 <= 0 || p0 >= 1) {
    return { pValue: 1, ciLower: 0, ciUpper: 1, significant: false };
  }

  const upperTail = 1 - binomialCDF(successes - 1, trials, p0);
  const lowerTail = binomialCDF(successes, trials, p0);
  const pValue = Math.min(1, 2 * Math.min(lowerTail, upperTail));

  const [ciLower, ciUpper] = wilsonInterval(successes, trials);

  return { pValue, ciLower, ciUpper, significant: pValue < 0.05 };
}

/** Intervalo de confiança 95% (Wilson score interval) para uma proporção. */
function wilsonInterval(successes: number, trials: number, z = 1.96): [number, number] {
  const n = trials;
  const phat = successes / n;
  const z2 = z * z;
  const denominator = 1 + z2 / n;
  const center = phat + z2 / (2 * n);
  const margin = z * Math.sqrt((phat * (1 - phat)) / n + z2 / (4 * n * n));

  return [
    Math.max(0, (center - margin) / denominator),
    Math.min(1, (center + margin) / denominator),
  ];
}

export interface ChiSquareResult {
  chi2: number;
  df: number;
  pValue: number;
  significant: boolean;
}

/**
 * Teste de goodness-of-fit Chi-quadrado: compara a distribuição observada de
 * acertos por jogo (`BacktestReport.hitDistribution`) contra a distribuição
 * hipergeométrica esperada.
 *
 * H0: a distribuição observada segue a hipergeométrica (método = acaso).
 */
export function chiSquareGoodnessOfFit(
  observedCounts: Record<number, number>,
  lottery: Lottery,
): ChiSquareResult {
  const rules = lotteryRules(lottery);
  const total = Object.values(observedCounts).reduce((a, b) => a + b, 0);

  if (total === 0) {
    return { chi2: 0, df: 0, pValue: 1, significant: false };
  }

  let chi2 = 0;
  let df = -1; // -1: o total é estimado a partir dos próprios dados

  for (let k = 0; k <= rules.numbersDrawn; k++) {
    const observed = observedCounts[k] ?? 0;
    const expected =
      total *
      hypergeometricProbability(rules.numberUniverse, rules.numbersDrawn, rules.numbersPerBet, k);

    if (expected > 0) {
      chi2 += Math.pow(observed - expected, 2) / expected;
      df++;
    }
  }

  df = Math.max(df, 0);
  const pValue = df === 0 ? 1 : 1 - approxChi2CDF(chi2, df);

  return { chi2, df, pValue, significant: pValue < 0.05 };
}

// Reexportado para quem precisar montar testes customizados (ex.: fairness).
export { approxChi2CDF, approxNormalCDF, binomialCDF };
