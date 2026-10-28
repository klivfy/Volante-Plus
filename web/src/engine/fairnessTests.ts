import { Draw, Lottery } from '../types/domain';
import { lotteryRules } from './prizeRules';
import { approxChi2Survival, normalUpperTail } from './statUtils';

/**
 * Testes de aleatoriedade do próprio sorteio (fairness tests).
 *
 * Todo o resto do engine assume que a loteria é justa (sorteio uniforme sem
 * reposição) — é essa suposição que fundamenta o baseline hipergeométrico.
 * Este módulo não gera jogos nem mede desempenho de estratégia: audita a
 * própria premissa, sobre o histórico observado.
 */

export interface FrequencyFairnessResult {
  chi2: number;
  df: number;
  pValue: number;
  /** `true` quando não há evidência de desvio da uniformidade (`pValue > 0.05`). */
  isFair: boolean;
}

/**
 * Testa se cada dezena aparece com frequência consistente com sorteio
 * uniforme (goodness-of-fit Chi-quadrado sobre as contagens por número).
 */
export function frequencyFairnessTest(
  draws: Draw[],
  lottery: Lottery,
): FrequencyFairnessResult {
  const rules = lotteryRules(lottery);
  const relevant = draws.filter((draw) => draw.lottery === lottery);
  const counts = new Array(rules.numberUniverse + 1).fill(0);

  for (const draw of relevant) {
    for (const n of draw.numbers) {
      if (n >= 1 && n <= rules.numberUniverse) counts[n]++;
    }
  }

  const totalDraws = relevant.length;
  if (totalDraws === 0) {
    return { chi2: 0, df: 0, pValue: 1, isFair: true };
  }

  const expectedPerNumber = (totalDraws * rules.numbersDrawn) / rules.numberUniverse;
  let chi2 = 0;
  for (let n = 1; n <= rules.numberUniverse; n++) {
    chi2 += Math.pow(counts[n] - expectedPerNumber, 2) / expectedPerNumber;
  }

  // CORREÇÃO (população finita): sob H0 com sorteio SEM reposição, o Pearson
  // bruto vale ≈ deff·χ²(N−1) — esperança N(1−K/N) = 54 na Mega, contra df 59.
  // Sem dividir, o teste rejeitava 5% nominal só ~1,45% das vezes (conservador
  // ~3,4×): um viés real de frequência passava por "isFair". Dividir por
  // deff = (N−K)/(N−1) restaura E[chi2] ≈ df (Monte Carlo: rejeição 4,98%
  // sob H0, e mais poder para detectar urna viciada).
  const deff =
    (rules.numberUniverse - rules.numbersDrawn) / (rules.numberUniverse - 1);
  chi2 /= deff;

  const df = rules.numberUniverse - 1;
  // Cauda direta: `1 - approxChi2CDF` cancelava algarismos e devolvia 0
  // para χ² grande (mesma classe do M-1 corrigido na Onda 3).
  const pValue = approxChi2Survival(chi2, df);

  return { chi2, df, pValue, isFair: pValue > 0.05 };
}

export interface GapTestRow {
  number: number;
  meanGap: number;
  expectedGap: number;
  zScore: number;
}

/**
 * Testa o intervalo (em concursos) entre aparições sucessivas de cada
 * dezena. Sob sorteio i.i.d., o gap segue aproximadamente uma geométrica de
 * parâmetro `p = numbersDrawn / numberUniverse`; desvios grandes de
 * `expectedGap` (|zScore| alto) sinalizam possível não-aleatoriedade.
 */
export function gapTest(draws: Draw[], lottery: Lottery): GapTestRow[] {
  const rules = lotteryRules(lottery);
  const relevant = draws
    .filter((draw) => draw.lottery === lottery)
    .sort((a, b) => a.date.localeCompare(b.date));

  const results: GapTestRow[] = [];
  const p = rules.numbersDrawn / rules.numberUniverse;
  const expectedGap = 1 / p;
  const stdGap = Math.sqrt((1 - p) / (p * p));

  for (let num = 1; num <= rules.numberUniverse; num++) {
    const gaps: number[] = [];
    let lastIndex = -1;

    for (let i = 0; i < relevant.length; i++) {
      if (relevant[i].numbers.includes(num)) {
        if (lastIndex >= 0) gaps.push(i - lastIndex);
        lastIndex = i;
      }
    }

    if (gaps.length > 1) {
      const meanGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      const standardError = stdGap / Math.sqrt(gaps.length);
      const zScore = standardError === 0 ? 0 : (meanGap - expectedGap) / standardError;
      results.push({ number: num, meanGap, expectedGap, zScore });
    }
  }

  return results;
}

export interface SerialCorrelationResult {
  lag1Correlation: number;
  pValue: number;
  /** `true` quando não há evidência de autocorrelação (`pValue > 0.05`). */
  isRandom: boolean;
}

/**
 * Autocorrelação de lag 1 sobre a soma das dezenas de cada concurso — testa
 * se o resultado de um sorteio "influencia" estatisticamente o seguinte
 * (o que não deveria acontecer em sorteios independentes).
 */
export function serialCorrelationTest(
  draws: Draw[],
  lottery: Lottery,
): SerialCorrelationResult {
  const relevant = draws
    .filter((draw) => draw.lottery === lottery)
    .sort((a, b) => a.date.localeCompare(b.date));

  const sums = relevant.map((d) => d.numbers.reduce((a, b) => a + b, 0));
  const n = sums.length - 1;

  if (n < 2) {
    return { lag1Correlation: 0, pValue: 1, isRandom: true };
  }

  const xs = sums.slice(0, n);
  const ys = sums.slice(1);
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  const denominator = Math.sqrt(denX * denY);
  const r = denominator === 0 ? 0 : num / denominator;

  // Teste t para correlação (aproximado via normal para n grande).
  const tStat = Math.abs(r) >= 1 ? Infinity : (r * Math.sqrt(n - 2)) / Math.sqrt(1 - r * r);
  // Cauda bicaudal estável — `2 · (1 − CDF(|t|))` zerava para |t| grande.
  const pValue = tStat === Infinity ? 0 : 2 * normalUpperTail(tStat);

  return { lag1Correlation: r, pValue, isRandom: pValue > 0.05 };
}
