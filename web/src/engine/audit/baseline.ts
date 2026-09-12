import { Lottery } from '../../types/domain';
import { lotteryRules } from '../prizeRules';
import { createSeededRandom, RandomSource } from '../random';
import { BASELINE_HISTORIES, BASELINE_SEED } from './preregistration';

/**
 * A linha de base da Regra 3: milhares de históricos de sorteios honestos,
 * simulados com o mesmo número de concursos do histórico observado.
 *
 * ## Por que simular, se existe fórmula
 *
 * As estatísticas de A1–A3 têm distribuições assintóticas conhecidas, mas
 * "assintótica" quer dizer *no limite*, e a pergunta que importa é se a
 * aproximação vale **neste** tamanho de amostra. A linha de base responde
 * isso sem depender da resposta: ela é a distribuição empírica exata da
 * estatística sob sorteio honesto, no tamanho real do histórico. O p-valor
 * empírico daí não herda erro de aproximação nenhum.
 *
 * Serve a dois usos distintos no relatório:
 * 1. p-valor empírico de cada teste, comparando o observado contra o nulo;
 * 2. desvio-padrão nulo de cada estatística, que alimenta o cálculo de poder.
 *
 * ## Determinismo
 *
 * Semente fixa (`BASELINE_SEED`). Uma auditoria que devolve números
 * diferentes a cada execução não pode ser conferida por terceiros — e
 * conferência por terceiros é o ponto inteiro de auditar.
 */

/** Estatísticas de um histórico simulado, uma entrada por réplica. */
export interface BaselineDistribution {
  readonly lottery: Lottery;
  /** Concursos por histórico simulado — igual ao histórico observado. */
  readonly contests: number;
  readonly histories: number;
  /** Qui-quadrado das frequências das dezenas. */
  readonly numbersChi2: readonly number[];
  /** Idem para trevos; `null` quando a modalidade não tem. */
  readonly trevosChi2: readonly number[] | null;
  /** Repetição média de dezenas entre concursos consecutivos. */
  readonly meanRepetition: readonly number[];
  /** Soma média das dezenas por concurso. */
  readonly meanSum: readonly number[];
}

/**
 * Sorteio uniforme sem reposição por Fisher-Yates parcial.
 *
 * `scratch` sai permutado e é reaproveitado na chamada seguinte: continua
 * sendo uma permutação de `1..N`, então o próximo sorteio permanece uniforme
 * sem precisar restaurar o vetor. Evita realocar 30 milhões de vezes.
 */
function drawInto(
  scratch: number[],
  count: number,
  random: RandomSource,
  out: number[],
): void {
  const size = scratch.length;
  for (let i = 0; i < count; i += 1) {
    const j = i + random.nextInt(size - i);
    const swap = scratch[i];
    scratch[i] = scratch[j];
    scratch[j] = swap;
    out[i] = scratch[i];
  }
}

/**
 * Sorteio com uma dezena enviesada, para as simulações de poder.
 *
 * Amostragem ponderada sem reposição pelo método de Efraimidis-Spirakis:
 * a chave `U^(1/w)` de cada elemento e os `k` maiores. É exato, não uma
 * aproximação — a ordem induzida pelas chaves tem exatamente a distribuição
 * da amostragem sequencial proporcional ao peso.
 */
function drawBiasedInto(
  universe: number,
  count: number,
  biasedNumber: number,
  weight: number,
  random: RandomSource,
  out: number[],
): void {
  // Seleção parcial: mantém só os `count` maiores, sem ordenar tudo.
  const bestValues = out;
  const bestKeys: number[] = new Array(count).fill(-Infinity);
  let filled = 0;

  for (let value = 1; value <= universe; value += 1) {
    const w = value === biasedNumber ? weight : 1;
    // U^(1/w); U em (0,1]. `nextFloat` pode devolver 0, que zeraria a chave.
    const u = Math.max(random.nextFloat(), Number.MIN_VALUE);
    const key = Math.pow(u, 1 / w);

    if (filled < count) {
      bestKeys[filled] = key;
      bestValues[filled] = value;
      filled += 1;
      continue;
    }
    let weakest = 0;
    for (let i = 1; i < count; i += 1) {
      if (bestKeys[i] < bestKeys[weakest]) weakest = i;
    }
    if (key > bestKeys[weakest]) {
      bestKeys[weakest] = key;
      bestValues[weakest] = value;
    }
  }
}

/** Qui-quadrado de frequências contra uniformidade perfeita. */
function uniformityChi2(counts: Int32Array, universe: number, expected: number): number {
  let chi2 = 0;
  for (let n = 1; n <= universe; n += 1) {
    const diff = counts[n] - expected;
    chi2 += (diff * diff) / expected;
  }
  return chi2;
}

/** Quantas dezenas de `previous` reaparecem em `current`. */
function overlap(previous: readonly number[], current: readonly number[]): number {
  let repeated = 0;
  for (const value of current) {
    if (previous.includes(value)) repeated += 1;
  }
  return repeated;
}

export interface BaselineOptions {
  /** Réplicas. O protocolo fixa 10.000; testes usam menos por velocidade. */
  readonly histories?: number;
  readonly seed?: number;
}

/**
 * Gera a distribuição nula das estatísticas de A1–A3 para um histórico de
 * `contests` concursos. Custo linear em `histories × contests`.
 */
export function simulateBaseline(
  lottery: Lottery,
  contests: number,
  options: BaselineOptions = {},
): BaselineDistribution {
  const histories = options.histories ?? BASELINE_HISTORIES;
  const seed = options.seed ?? BASELINE_SEED;

  if (contests < 2) {
    throw new RangeError('A linha de base exige ao menos 2 concursos (A2 usa pares).');
  }
  if (histories < 1) {
    throw new RangeError('A linha de base exige ao menos 1 histórico simulado.');
  }

  const rules = lotteryRules(lottery);
  const hasTrevos = rules.trevosDrawn > 0;
  const random = createSeededRandom(seed);

  const numbersChi2 = new Array<number>(histories);
  const meanRepetition = new Array<number>(histories);
  const meanSum = new Array<number>(histories);
  const trevosChi2 = hasTrevos ? new Array<number>(histories) : null;

  const numberScratch = Array.from({ length: rules.numberUniverse }, (_, i) => i + 1);
  const trevoScratch = hasTrevos
    ? Array.from({ length: rules.trevoUniverse }, (_, i) => i + 1)
    : [];

  const numberCounts = new Int32Array(rules.numberUniverse + 1);
  const trevoCounts = new Int32Array(rules.trevoUniverse + 1);
  const current = new Array<number>(rules.numbersDrawn);
  const previous = new Array<number>(rules.numbersDrawn);
  const trevoDraw = new Array<number>(Math.max(rules.trevosDrawn, 0));

  const expectedNumber = (contests * rules.numbersDrawn) / rules.numberUniverse;
  const expectedTrevo = hasTrevos ? (contests * rules.trevosDrawn) / rules.trevoUniverse : 0;

  for (let h = 0; h < histories; h += 1) {
    numberCounts.fill(0);
    trevoCounts.fill(0);
    let sumTotal = 0;
    let repetitionTotal = 0;

    for (let c = 0; c < contests; c += 1) {
      drawInto(numberScratch, rules.numbersDrawn, random, current);

      for (const value of current) {
        numberCounts[value] += 1;
        sumTotal += value;
      }
      if (c > 0) repetitionTotal += overlap(previous, current);
      for (let i = 0; i < rules.numbersDrawn; i += 1) previous[i] = current[i];

      if (hasTrevos) {
        drawInto(trevoScratch, rules.trevosDrawn, random, trevoDraw);
        for (const value of trevoDraw) trevoCounts[value] += 1;
      }
    }

    numbersChi2[h] = uniformityChi2(numberCounts, rules.numberUniverse, expectedNumber);
    meanRepetition[h] = repetitionTotal / (contests - 1);
    meanSum[h] = sumTotal / contests;
    if (trevosChi2) {
      trevosChi2[h] = uniformityChi2(trevoCounts, rules.trevoUniverse, expectedTrevo);
    }
  }

  return { lottery, contests, histories, numbersChi2, trevosChi2, meanRepetition, meanSum };
}

/**
 * Distribuição do qui-quadrado das dezenas quando **uma** delas tem peso
 * `1 + bias`. Usada só para estimar poder — nunca entra em p-valor.
 */
export function simulateBiasedNumbersChi2(
  lottery: Lottery,
  contests: number,
  bias: number,
  options: BaselineOptions = {},
): number[] {
  const histories = options.histories ?? BASELINE_HISTORIES;
  const random = createSeededRandom(options.seed ?? BASELINE_SEED);
  const rules = lotteryRules(lottery);

  const counts = new Int32Array(rules.numberUniverse + 1);
  const current = new Array<number>(rules.numbersDrawn);
  const expected = (contests * rules.numbersDrawn) / rules.numberUniverse;
  // Uma dezena qualquer; por simetria do nulo, qual delas não altera o poder.
  const biasedNumber = 1;
  const weight = 1 + bias;

  const out = new Array<number>(histories);
  for (let h = 0; h < histories; h += 1) {
    counts.fill(0);
    for (let c = 0; c < contests; c += 1) {
      drawBiasedInto(rules.numberUniverse, rules.numbersDrawn, biasedNumber, weight, random, current);
      for (const value of current) counts[value] += 1;
    }
    out[h] = uniformityChi2(counts, rules.numberUniverse, expected);
  }
  return out;
}

/**
 * Distribuição do qui-quadrado dos trevos com um trevo de peso `1 + bias`.
 */
export function simulateBiasedTrevosChi2(
  lottery: Lottery,
  contests: number,
  bias: number,
  options: BaselineOptions = {},
): number[] {
  const histories = options.histories ?? BASELINE_HISTORIES;
  const random = createSeededRandom(options.seed ?? BASELINE_SEED);
  const rules = lotteryRules(lottery);
  if (rules.trevosDrawn <= 0) return [];

  const counts = new Int32Array(rules.trevoUniverse + 1);
  const current = new Array<number>(rules.trevosDrawn);
  const expected = (contests * rules.trevosDrawn) / rules.trevoUniverse;
  const weight = 1 + bias;

  const out = new Array<number>(histories);
  for (let h = 0; h < histories; h += 1) {
    counts.fill(0);
    for (let c = 0; c < contests; c += 1) {
      drawBiasedInto(rules.trevoUniverse, rules.trevosDrawn, 1, weight, random, current);
      for (const value of current) counts[value] += 1;
    }
    out[h] = uniformityChi2(counts, rules.trevoUniverse, expected);
  }
  return out;
}

/**
 * p-valor empírico de cauda superior, estimador `(r+1)/(B+1)`.
 *
 * WHY (o `+1`): o estimador ingênuo `r/B` devolve exatamente 0 quando nenhuma
 * réplica supera o observado, e p = 0 é uma afirmação que 10.000 simulações
 * não sustentam — o que elas sustentam é "menor que ~1/10.000". O estimador
 * com correção é o padrão em testes de Monte Carlo e nunca devolve 0.
 */
export function upperTailPValue(nullSamples: readonly number[], observed: number): number {
  let atLeast = 0;
  for (const value of nullSamples) {
    if (value >= observed) atLeast += 1;
  }
  return (atLeast + 1) / (nullSamples.length + 1);
}

/**
 * p-valor empírico bilateral por distância à média nula: conta réplicas tão
 * distantes do centro quanto a observação, em qualquer direção. Não assume
 * simetria da distribuição nula, ao contrário de dobrar a cauda menor.
 */
export function twoTailedPValue(nullSamples: readonly number[], observed: number): number {
  const n = nullSamples.length;
  if (n === 0) return 1;
  const mean = nullSamples.reduce((sum, x) => sum + x, 0) / n;
  const distance = Math.abs(observed - mean);

  let atLeast = 0;
  for (const value of nullSamples) {
    if (Math.abs(value - mean) >= distance) atLeast += 1;
  }
  return (atLeast + 1) / (n + 1);
}

/** Média e desvio-padrão amostral de uma distribuição nula simulada. */
export function nullMoments(samples: readonly number[]): { mean: number; stdDeviation: number } {
  const n = samples.length;
  if (n === 0) return { mean: 0, stdDeviation: 0 };
  const mean = samples.reduce((sum, x) => sum + x, 0) / n;
  if (n < 2) return { mean, stdDeviation: 0 };
  const variance = samples.reduce((sum, x) => sum + (x - mean) * (x - mean), 0) / (n - 1);
  return { mean, stdDeviation: Math.sqrt(variance) };
}
