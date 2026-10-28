import { Lottery } from '../types/domain';
import { hypergeometricMean, hypergeometricProbability } from './hypergeometric';
import { hasTrevos, isPrized, lotteryRules } from './prizeRules';
import { approxNormalCDF } from './statUtils';

/**
 * Análise de poder estatístico (power analysis).
 *
 * O backtesting mede se `stats.mean` (acertos/jogo observados) difere do
 * baseline hipergeométrico, mas uma amostra pequena pode simplesmente não ter
 * poder para detectar uma diferença real, mesmo que ela exista — "não
 * rejeitamos H0" não é o mesmo que "H0 é verdadeira". Este módulo responde:
 * dado o tamanho de amostra disponível, que efeito conseguimos enxergar?
 */

/** Desvio padrão da hipergeométrica: sqrt(n·(K/N)·(1-K/N)·(N-n)/(N-1)). */
export function hypergeometricStdDev(lottery: Lottery): number {
  const rules = lotteryRules(lottery);
  const { numberUniverse: N, numbersDrawn: K, numbersPerBet: n } = rules;
  const p = K / N;
  const variance = n * p * (1 - p) * ((N - n) / (N - 1));
  return Math.sqrt(Math.max(0, variance));
}

export interface SampleSizeResult {
  /** Quantidade mínima de jogos de validação para o poder desejado. */
  requiredGames: number;
  /** Concursos de validação equivalentes, assumindo `gamesPerContest`. */
  requiredContests: number;
  gamesPerContest: number;
}

/**
 * Tamanho de amostra necessário para detectar `effectSize` acertos/jogo de
 * diferença sobre o baseline, com significância `alpha` e poder `power`.
 * Aproximação por comparação de médias sob o Teorema Central do Limite —
 * adequada aqui porque `hitsPerGame` é a soma de indicadores independentes
 * por vaga (ver `WHY` em `backtestAnalyzer.ts`).
 */
export function requiredSampleSize(
  baselineStd: number,
  effectSize: number,
  alpha: number = 0.05,
  power: number = 0.8,
  gamesPerContest: number = 2,
): SampleSizeResult {
  if (effectSize <= 0) {
    return { requiredGames: Infinity, requiredContests: Infinity, gamesPerContest };
  }

  const zAlpha = zFromTwoSidedAlpha(alpha);
  const zBeta = zFromPower(power);

  const requiredGames = Math.ceil(Math.pow(((zAlpha + zBeta) * baselineStd) / effectSize, 2));

  return {
    requiredGames,
    requiredContests: Math.ceil(requiredGames / gamesPerContest),
    gamesPerContest,
  };
}

/** Poder estatístico atual: probabilidade de detectar `effectSize` com a amostra disponível. */
export function currentPower(
  baselineStd: number,
  effectSize: number,
  sampleSize: number,
  alpha: number = 0.05,
): number {
  if (sampleSize <= 0) return 0;
  const zAlpha = zFromTwoSidedAlpha(alpha);
  const standardError = baselineStd / Math.sqrt(sampleSize);
  if (standardError === 0) return effectSize > 0 ? 1 : 0;
  const z = effectSize / standardError - zAlpha;
  return approxNormalCDF(z);
}

function zFromTwoSidedAlpha(alpha: number): number {
  // z tal que P(|Z| > z) = alpha, ou seja, Φ(z) = 1 - alpha/2.
  return inverseNormalCDF(1 - alpha / 2);
}

function zFromPower(power: number): number {
  return inverseNormalCDF(power);
}

/**
 * Inversa da CDF normal padrão via método de Newton sobre `approxNormalCDF`.
 * Poucas iterações bastam: a função é suave e o chute inicial (aproximação
 * racional de Acklam simplificada) já fica perto da raiz.
 */
function inverseNormalCDF(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;

  // Chute inicial via aproximação de Beasley-Springer-Moro simplificada.
  let z = p < 0.5 ? -rationalApprox(Math.sqrt(-2 * Math.log(p))) : rationalApprox(Math.sqrt(-2 * Math.log(1 - p)));

  for (let i = 0; i < 4; i++) {
    const diff = approxNormalCDF(z) - p;
    const derivative = Math.exp((-z * z) / 2) / Math.sqrt(2 * Math.PI);
    if (derivative === 0) break;
    z -= diff / derivative;
  }
  return z;
}

function rationalApprox(t: number): number {
  const c0 = 2.515517;
  const c1 = 0.802853;
  const c2 = 0.010328;
  const d1 = 1.432788;
  const d2 = 0.189269;
  const d3 = 0.001308;
  return t - (c0 + c1 * t + c2 * t * t) / (1 + d1 * t + d2 * t * t + d3 * t * t * t);
}

/** Uma linha da tabela de poder: efeito x tamanho de amostra x poder resultante. */
export interface PowerTableRow {
  effectSize: number;
  powerBySampleSize: { sampleSize: number; power: number }[];
}

/**
 * Tabela de poder estatístico para uma loteria, sobre um conjunto de
 * tamanhos de amostra e efeitos candidatos. Usada pela tela de análise
 * avançada para mostrar, lado a lado, "com N jogos, que vantagem eu
 * conseguiria detectar?".
 */
export function powerTable(
  lottery: Lottery,
  effects: number[] = [0.05, 0.1, 0.15, 0.2],
  sampleSizes: number[] = [40, 100, 500, 1000, 5000, 10000],
): PowerTableRow[] {
  const baselineStd = hypergeometricStdDev(lottery);
  return effects.map((effectSize) => ({
    effectSize,
    powerBySampleSize: sampleSizes.map((sampleSize) => ({
      sampleSize,
      power: currentPower(baselineStd, effectSize, sampleSize),
    })),
  }));
}

/**
 * Probabilidade teórica de "qualquer prêmio" numa aposta simples — usada como
 * referência de poder para a taxa de eficácia (`prizeRate`), em vez de
 * acertos médios.
 *
 * WHY (faixas oficiais, não um corte fixo de acertos): cada modalidade tem
 * faixas próprias — Mega-Sena premia a partir de 4 acertos, a Quina a partir
 * de 2 (duque!), e a +Milionária cruza dezenas (4..6) com trevos (0..2) em
 * nove faixas. Um corte fixo `hits >= 4` era correto só para a Mega-Sena:
 * na Quina subestimava o baseline em ~3 ordens de grandeza (0,00005 contra
 * ~0,0428) e INVERTIA o veredito do teste binomial — um método na média do
 * acaso parecia "muito acima" do baseline falso. A soma segue exatamente as
 * faixas de `prizeRules.ts` (`isPrized`), a mesma fonte que classifica os
 * prêmios do backtest — baseline e contagem sempre casam.
 *
 * Na +Milionária dezenas e trevos são espaços independentes: a probabilidade
 * conjunta fatoriza (P(dezenas) × P(trevos)) e a soma percorre todas as
 * faixas oficiais — incluindo as 4 de prêmio fixo (3+2/3+1/2+2/2+1), que
 * dependem do trevo. O resultado é o baseline para contagens que classificam
 * a aposta INTEIRA (com trevos, como `runBacktest`/`walkForwardMulti`).
 * Para contagens só-de-dezenas (benchmark/auditoria), use
 * `prizeProbabilityByNumbersAlone`.
 */
export function anyPrizeProbability(lottery: Lottery): number {
  const rules = lotteryRules(lottery);

  if (hasTrevos(lottery)) {
    let total = 0;
    for (let hits = 0; hits <= rules.numbersDrawn; hits++) {
      const pHits = hypergeometricProbability(
        rules.numberUniverse,
        rules.numbersDrawn,
        rules.numbersPerBet,
        hits,
      );
      if (pHits === 0) continue;
      for (let trevoHits = 0; trevoHits <= Math.min(rules.trevosDrawn, rules.trevosPerBet); trevoHits++) {
        if (!isPrized(lottery, hits, trevoHits)) continue;
        total +=
          pHits *
          hypergeometricProbability(
            rules.trevoUniverse,
            rules.trevosDrawn,
            rules.trevosPerBet,
            trevoHits,
          );
      }
    }
    return total;
  }

  let total = 0;
  for (let hits = 0; hits <= rules.numbersDrawn; hits++) {
    if (!isPrized(lottery, hits)) continue;
    total += hypergeometricProbability(
      rules.numberUniverse,
      rules.numbersDrawn,
      rules.numbersPerBet,
      hits,
    );
  }
  return total;
}

/**
 * Probabilidade de "algum prêmio" contando SOMA as dezenas — o baseline
 * consistente com as contagens do benchmark e do Módulo B, que classificam
 * `classifyHits(lottery, hits)` sem observar trevos.
 *
 * Para as loterias sem trevo coincide com `anyPrizeProbability`. Na
 * +Milionária é MENOR: exclui as faixas fixas 2+1/2+2/3+1 (exigem ≥1 trevo)
 * — somá-las aqui compararia a taxa medida (só dezenas) contra um baseline
 * 96× maior e produziria z absurdamente negativo para qualquer estratégia.
 */
export function prizeProbabilityByNumbersAlone(lottery: Lottery): number {
  const rules = lotteryRules(lottery);
  let total = 0;
  // `isPrized(lottery, hits)` usa `trevoHits = 0`: captura exatamente os
  // acertos de dezenas que premiam INDEPENDENTE do trevo (na +Milionária,
  // as variantes ?+0 das faixas 1–6).
  for (let hits = 0; hits <= rules.numbersPerBet; hits++) {
    if (!isPrized(lottery, hits)) continue;
    total += hypergeometricProbability(
      rules.numberUniverse,
      rules.numbersDrawn,
      rules.numbersPerBet,
      hits,
    );
  }
  return total;
}

/** Acertos esperados por jogo — atalho para exibição junto da tabela de poder. */
export function expectedHitsFor(lottery: Lottery): number {
  const rules = lotteryRules(lottery);
  return hypergeometricMean(rules.numberUniverse, rules.numbersDrawn, rules.numbersPerBet);
}
