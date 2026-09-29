import { Draw, Lottery } from '../types/domain';
import { hypergeometricProbability } from './hypergeometric';
import { hasTrevos, lotteryRules } from './prizeRules';
import { defaultRandom, RandomSource } from './random';

/**
 * Testes de dependência ENTRE concursos, sobre todos os pares — o que os
 * testes por dezena (`numberEvidence`, `bayesEvidence`) não enxergam.
 *
 * ## 1. Colisão (problema do aniversário)
 * Com `n` concursos e `C` combinações equiprováveis, o número de pares de
 * concursos idênticos é ~Poisson(`λ = n(n−1)/(2C)`). `C = C(N,K)` na Mega-Sena
 * e `C(50,6)·C(6,2)` na +Milionária (dezenas E trevos). Na Mega-Sena, com
 * ~3.000 concursos, `λ ≈ 0,09`: uma repetição seria surpreendente, e sobretudo
 * é o sinal clássico de **dado duplicado ou corrompido** na fonte.
 *
 * ## 2. Espectro de sobreposição
 * Para cada par de concursos, quantas dezenas em comum (0..K). Sob sorteio
 * honesto a contagem de pares por nível segue exatamente a hipergeométrica
 * (a sobreposição de dois sorteios independentes é hipergeométrica). O
 * qui-quadrado sobre o espectro detecta sorteios "grudentos" (memória entre
 * concursos) ou "repelentes" (o sistema evita repetir), e também dado
 * corrompido — coisas que a repetição consecutiva de A2 só vê entre vizinhos.
 *
 * ## Por que p-valor por simulação
 * Os indicadores de par são independentes dois a dois, mas o espectro é uma
 * estatística-U degenerada: sua distribuição limite NÃO é qui-quadrado (as
 * sobreposições carregam a informação de frequência por dezena e têm variância
 * própria). Em vez de uma aproximação errada, o p-valor vem de `baselineRuns`
 * históricos honestos simulados do mesmo tamanho — a mesma linha de base que a
 * auditoria de anomalias (`audit/`) usa.
 */

function choose(n: number, k: number): number {
  let c = 1;
  for (let i = 1; i <= k; i++) c = (c * (n - k + i)) / i;
  return Math.round(c);
}

/**
 * Concursos distintos possíveis: `C(N,K)` dezenas e, na +Milionária, vezes
 * `C(6,2) = 15` duplas de trevos. Um concurso "idêntico" a outro repete as
 * dezenas E os trevos.
 */
function combinationsCount(lottery: Lottery): number {
  const rules = lotteryRules(lottery);
  const numbers = choose(rules.numberUniverse, rules.numbersDrawn);
  return hasTrevos(lottery) ? numbers * choose(rules.trevoUniverse, rules.trevosDrawn) : numbers;
}

/** P(X ≥ r) para X ~ Poisson(λ), somando a cauda inferior. */
export function poissonUpperTail(lambda: number, r: number): number {
  if (r <= 0) return 1;
  let term = Math.exp(-lambda);
  let cdf = term;
  for (let k = 1; k < r; k++) {
    term *= lambda / k;
    cdf += term;
  }
  return Math.max(0, Math.min(1, 1 - cdf));
}

export interface CollisionResult {
  draws: number;
  pairs: number;
  /** λ: pares idênticos esperados sob sorteio honesto. */
  expected: number;
  observed: number;
  /** P(≥ observado repetições | honesto). */
  pValue: number;
  /** Concursos que repetem combinação de outro (números dos concursos). */
  repeated: [number, number][];
}

export function collisionTest(lottery: Lottery, draws: readonly Draw[]): CollisionResult {
  const own = draws.filter((d) => d.lottery === lottery);
  const n = own.length;
  const pairs = (n * (n - 1)) / 2;
  const expected = pairs / combinationsCount(lottery);
  const seen = new Map<string, number[]>();
  const repeated: [number, number][] = [];
  for (const draw of own) {
    const numbersKey = [...draw.numbers].sort((a, b) => a - b).join('-');
    const key = hasTrevos(lottery)
      ? `${numbersKey}+${[...(draw.trevos ?? [])].sort((a, b) => a - b).join('-')}`
      : numbersKey;
    const prior = seen.get(key);
    if (prior) for (const earlier of prior) repeated.push([earlier, draw.contestNumber]);
    seen.set(key, [...(prior ?? []), draw.contestNumber]);
  }
  return {
    draws: n,
    pairs,
    expected,
    observed: repeated.length,
    pValue: poissonUpperTail(expected, repeated.length),
    repeated,
  };
}

/** Popcount de 32 bits. */
function popcount(x: number): number {
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return Math.imul((x + (x >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24;
}

/** Cada concurso vira duas palavras de 30 bits (dezena d → bit d−1). */
function toMasks(numbersList: readonly (readonly number[])[]): [Int32Array, Int32Array] {
  const lo = new Int32Array(numbersList.length);
  const hi = new Int32Array(numbersList.length);
  numbersList.forEach((numbers, i) => {
    for (const n of numbers) {
      if (n <= 30) lo[i] |= 1 << (n - 1);
      else hi[i] |= 1 << (n - 31);
    }
  });
  return [lo, hi];
}

/** Histograma de sobreposições (0..K) sobre todos os pares. */
function overlapHistogram(lo: Int32Array, hi: Int32Array, maxOverlap: number): number[] {
  const hist = new Array<number>(maxOverlap + 1).fill(0);
  const n = lo.length;
  for (let i = 0; i < n; i++) {
    const a = lo[i];
    const b = hi[i];
    for (let j = i + 1; j < n; j++) {
      hist[popcount(a & lo[j]) + popcount(b & hi[j])]++;
    }
  }
  return hist;
}

/** Cauda mínima de casas com esperado ≥ 5, fundindo os níveis altos. */
function mergedBins(expected: readonly number[]): number[][] {
  const bins: number[][] = expected.map((_, k) => [k]);
  while (bins.length > 2) {
    const last = bins[bins.length - 1];
    const sum = last.reduce((s, k) => s + expected[k], 0);
    if (sum >= 5) break;
    bins.pop();
    bins[bins.length - 1] = [...bins[bins.length - 1], ...last];
  }
  return bins;
}

function chiSquare(observed: readonly number[], expected: readonly number[], bins: number[][]) {
  let statistic = 0;
  for (const bin of bins) {
    const o = bin.reduce((s, k) => s + observed[k], 0);
    const e = bin.reduce((s, k) => s + expected[k], 0);
    if (e > 0) statistic += ((o - e) * (o - e)) / e;
  }
  return statistic;
}

export interface OverlapResult {
  draws: number;
  pairs: number;
  /** Pares por nível de sobreposição 0..K. */
  observed: number[];
  expected: number[];
  /** Níveis fundidos para manter esperado ≥ 5 por casela. */
  bins: number[][];
  statistic: number;
  baselineRuns: number;
  /** P(estatística ≥ observada | honesto), por simulação (com correção +1). */
  pValue: number;
}

/**
 * Espectro de sobreposição com p-valor simulado.
 *
 * @param baselineRuns históricos honestos simulados; 200 dá p-valor com passo
 *   de 0,5%. O custo é `O(baselineRuns · n²)`.
 */
export function overlapSpectrumTest(
  lottery: Lottery,
  draws: readonly Draw[],
  options: { baselineRuns?: number; random?: RandomSource } = {},
): OverlapResult {
  const { numberUniverse: N, numbersDrawn: K } = lotteryRules(lottery);
  const baselineRuns = options.baselineRuns ?? 200;
  const random = options.random ?? defaultRandom;
  const own = draws.filter((d) => d.lottery === lottery);
  const n = own.length;
  const pairs = (n * (n - 1)) / 2;
  const expected = Array.from(
    { length: K + 1 },
    (_, k) => pairs * hypergeometricProbability(N, K, K, k),
  );
  const bins = mergedBins(expected);

  const [lo, hi] = toMasks(own.map((d) => d.numbers));
  const observed = overlapHistogram(lo, hi, K);
  const statistic = chiSquare(observed, expected, bins);

  let atLeast = 0;
  const pool = Array.from({ length: N }, (_, i) => i + 1);
  for (let run = 0; run < baselineRuns; run++) {
    const simulated: number[][] = [];
    for (let i = 0; i < n; i++) {
      const copy = pool.slice();
      const numbers: number[] = [];
      for (let j = 0; j < K; j++) {
        const pick = j + random.nextInt(copy.length - j);
        [copy[j], copy[pick]] = [copy[pick], copy[j]];
        numbers.push(copy[j]);
      }
      simulated.push(numbers);
    }
    const [slo, shi] = toMasks(simulated);
    if (chiSquare(overlapHistogram(slo, shi, K), expected, bins) >= statistic) atLeast++;
  }

  return {
    draws: n,
    pairs,
    observed,
    expected,
    bins,
    statistic,
    baselineRuns,
    pValue: (atLeast + 1) / (baselineRuns + 1),
  };
}
