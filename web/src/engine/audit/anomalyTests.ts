import { Draw, Lottery } from '../../types/domain';
import { lotteryRules } from '../prizeRules';
import { createSeededRandom, RandomSource } from '../random';
import { approxNormalCDF } from '../statUtils';
import {
  BaselineDistribution,
  nullMoments,
  twoTailedPValue,
  upperTailPValue,
} from './baseline';
import {
  ALTERNATIVE_RELATIVE_BIAS,
  ALTERNATIVE_SUM_SHIFT_SD,
  AuditModule,
  POWER_REPLICATIONS,
  POWER_SEED,
  TARGET_POWER,
  expectedRepetition,
  expectedSum,
  sumStdDeviation,
} from './preregistration';

/**
 * Os testes de anomalia do Módulo A, sobre o histórico observado.
 *
 * Cada função aqui devolve estatística, p-valor **bruto** e poder. A decisão
 * de significância não é tomada neste módulo: ela depende do alpha corrigido,
 * que por sua vez depende de quantos testes foram executados no total — e
 * isso só o orquestrador sabe. Separar as duas coisas impede o erro clássico
 * de decidir teste a teste e corrigir depois.
 */

/**
 * Dados de rateio de um concurso, necessários só para A4.
 *
 * Não fazem parte de `Draw` porque o histórico de dezenas e o de ganhadores
 * vêm de exportações diferentes da Caixa e costumam existir separados.
 */
export interface ContestOutcome {
  readonly contestNumber: number;
  /** Ganhadores da faixa principal (todas as dezenas). */
  readonly topTierWinners: number;
  /** Apostas simples equivalentes vendidas no concurso. */
  readonly simpleBets: number;
}

export interface TestOutcome {
  readonly id: string;
  readonly module: AuditModule;
  readonly label: string;
  /** `false` quando faltou dado; ver `skipReason`. */
  readonly executed: boolean;
  readonly skipReason?: string;
  /** Estatística do teste (qui-quadrado, média observada, contagem…). */
  readonly statistic?: number;
  /** Valor teórico do parâmetro sob H0, quando existe um. */
  readonly expected?: number;
  /** p-valor bruto, antes da correção de múltiplas comparações. */
  readonly pValue?: number;
  /** Poder estimado contra a alternativa pré-registrada. */
  readonly power?: number;
  /**
   * Efeito mínimo detectável a 80% de poder: o menor desvio que este teste
   * pegaria de forma confiável. É o que converte "nenhuma anomalia" em
   * "viés maior que isto está descartado".
   */
  readonly minimumDetectableEffect?: number;
  /** Unidade legível do EMD (ex.: '% de viés numa dezena'). */
  readonly effectUnit?: string;
  /** Ressalvas que devem acompanhar a leitura deste teste. */
  readonly caveats?: readonly string[];
}

/** Inversa da normal padrão (Acklam), erro relativo < 1e-9 na faixa útil. */
export function normalQuantile(p: number): number {
  if (p <= 0 || p >= 1) throw new RangeError(`Quantil fora de (0,1): ${p}`);

  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.383577518672690e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
    3.754408661907416];

  const low = 0.02425;
  if (p < low) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - low) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const q = p - 0.5;
  const r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/**
 * Poder de um teste bilateral sobre uma estatística aproximadamente normal,
 * deslocada de `shift` sob a alternativa. `nullSd` é o desvio-padrão da
 * estatística sob H0 — vindo da linha de base simulada, não de fórmula.
 */
export function normalTwoSidedPower(shift: number, nullSd: number, alpha: number): number {
  if (nullSd <= 0) return alpha;
  const critical = normalQuantile(1 - alpha / 2);
  const delta = Math.abs(shift) / nullSd;
  return approxNormalCDF(delta - critical) + approxNormalCDF(-delta - critical);
}

/**
 * Parâmetro de não-centralidade do qui-quadrado sob a alternativa "uma
 * categoria com peso `1 + bias`".
 *
 * `λ = M · Σ (p_i − p_i0)² / p_i0`, com `M` o total de bolas sorteadas
 * (`concursos × sorteadas por concurso`) e `p_i0 = 1/universo`.
 */
export function noncentralityFor(
  universe: number,
  drawn: number,
  contests: number,
  bias: number,
): number {
  const slots = contests * drawn;
  const p0 = 1 / universe;
  const weightTotal = universe - 1 + (1 + bias);
  const pBiased = (1 + bias) / weightTotal;
  const pOther = 1 / weightTotal;

  let sum = ((pBiased - p0) * (pBiased - p0)) / p0;
  sum += (universe - 1) * (((pOther - p0) * (pOther - p0)) / p0);
  return slots * sum;
}

/** Normal padrão por Box-Muller. */
function normalSample(random: RandomSource): number {
  const u1 = Math.max(random.nextFloat(), Number.MIN_VALUE);
  const u2 = random.nextFloat();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** Gamma(shape, 1) por Marsaglia-Tsang. Aceita `shape` não inteiro. */
function gammaSample(shape: number, random: RandomSource): number {
  if (shape < 1) {
    const u = Math.max(random.nextFloat(), Number.MIN_VALUE);
    return gammaSample(shape + 1, random) * Math.pow(u, 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let v: number;
    do {
      x = normalSample(random);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = Math.max(random.nextFloat(), Number.MIN_VALUE);
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

/**
 * Poder do qui-quadrado, calibrado contra a distribuição nula **real**.
 *
 * ## O erro que este cálculo evita
 *
 * A tentação é tratar a estatística como χ²(N−1) e simular a não-central
 * correspondente. Não funciona, e o teste de calibração deste módulo mostra
 * por quê: as dezenas de um concurso são sorteadas **sem reposição**, o que
 * correlaciona negativamente as contagens e estreita a distribuição nula
 * frente ao χ² teórico. Usar o χ² teórico como referência contra um valor
 * crítico vindo da distribuição real inflava o poder — com viés zero, onde a
 * resposta certa é o próprio alpha (5%), a versão ingênua devolvia 15%.
 *
 * A correção é casar os momentos: se a nula real tem média `μ₀` e variância
 * `σ₀²`, ela é aproximada por `c · χ²(ν)` com
 * `c = σ₀²/(2μ₀)` e `ν = 2μ₀²/σ₀²` (Patnaik/Satterthwaite). Sob a
 * alternativa de não-centralidade `λ` — medida na mesma escala da
 * estatística — simula-se `c · χ²_nc(ν, λ/c)`, cuja média fica em `μ₀ + λ`,
 * exatamente como se espera.
 *
 * O p-valor do relatório não depende disto: ele continua vindo direto da
 * linha de base empírica, sem aproximação. Só o poder passa por aqui.
 */
export function calibratedChi2Power(
  nullSamples: readonly number[],
  lambda: number,
  critical: number,
  replications: number,
  seed: number,
): number {
  if (nullSamples.length < 2 || replications <= 0) return 0;

  const moments = nullMoments(nullSamples);
  const mean0 = moments.mean;
  const variance0 = moments.stdDeviation * moments.stdDeviation;
  if (mean0 <= 0 || variance0 <= 0) return 0;

  const scale = variance0 / (2 * mean0);
  const df = (2 * mean0 * mean0) / variance0;
  const noncentral = Math.max(lambda, 0) / scale;

  const random = createSeededRandom(seed);
  let exceeded = 0;
  for (let r = 0; r < replications; r += 1) {
    // χ²_nc(ν, λ') = χ²(ν−1) + (Z + √λ')², válido para ν >= 1.
    const central = df > 1 ? 2 * gammaSample((df - 1) / 2, random) : 0;
    const shifted = normalSample(random) + Math.sqrt(noncentral);
    if (scale * (central + shifted * shifted) > critical) exceeded += 1;
  }
  return exceeded / replications;
}

/**
 * Menor deslocamento de uma estatística aproximadamente normal que o teste
 * detectaria com probabilidade `targetPower`.
 *
 * `Δ_min = σ₀ · (z_{1−α/2} + z_{poder})` — a forma fechada padrão, sem
 * simulação: para o poder atingir o alvo, o efeito precisa afastar a
 * distribuição alternativa do valor crítico exatamente por essa margem.
 */
export function normalMinimumDetectableShift(
  nullSd: number,
  alpha: number,
  targetPower: number = TARGET_POWER,
): number {
  if (nullSd <= 0) return 0;
  return nullSd * (normalQuantile(1 - alpha / 2) + normalQuantile(targetPower));
}

/**
 * Menor viés relativo numa única dezena que A1 detectaria com poder
 * `targetPower`. Busca binária sobre `calibratedChi2Power`, que é monótono
 * no viés — mais viés nunca reduz a chance de detectar.
 *
 * Devolve `Infinity` quando nem um viés absurdo (10×) alcança o alvo: é o
 * caso honesto de "este recorte não tem tamanho para afirmar nada".
 */
export function minimumDetectableBias(
  nullSamples: readonly number[],
  critical: number,
  universe: number,
  drawn: number,
  contests: number,
  targetPower: number = TARGET_POWER,
  replications: number = POWER_REPLICATIONS,
  seed: number = POWER_SEED,
): number {
  const powerAt = (bias: number): number =>
    calibratedChi2Power(
      nullSamples,
      noncentralityFor(universe, drawn, contests, bias),
      critical,
      replications,
      seed,
    );

  let low = 0;
  let high = 10;
  if (powerAt(high) < targetPower) return Infinity;

  for (let step = 0; step < 24; step += 1) {
    const middle = (low + high) / 2;
    if (powerAt(middle) < targetPower) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

/** Quantil empírico por interpolação linear; `samples` não precisa vir ordenado. */
export function sampleQuantile(samples: readonly number[], q: number): number {
  if (samples.length === 0) return NaN;
  const sorted = [...samples].sort((a, b) => a - b);
  const position = q * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (position - lower) * (sorted[upper] - sorted[lower]);
}

/** Concursos em ordem cronológica de concurso, sem alterar a entrada. */
export function chronological(draws: readonly Draw[]): Draw[] {
  return [...draws].sort((a, b) => a.contestNumber - b.contestNumber);
}

/** Qui-quadrado observado das frequências das dezenas. */
export function observedNumbersChi2(draws: readonly Draw[], lottery: Lottery): number {
  const rules = lotteryRules(lottery);
  const counts = new Int32Array(rules.numberUniverse + 1);
  for (const draw of draws) {
    for (const value of draw.numbers) counts[value] += 1;
  }
  const expected = (draws.length * rules.numbersDrawn) / rules.numberUniverse;
  let chi2 = 0;
  for (let n = 1; n <= rules.numberUniverse; n += 1) {
    const diff = counts[n] - expected;
    chi2 += (diff * diff) / expected;
  }
  return chi2;
}

/** Qui-quadrado observado das frequências dos trevos. */
export function observedTrevosChi2(draws: readonly Draw[], lottery: Lottery): number {
  const rules = lotteryRules(lottery);
  const counts = new Int32Array(rules.trevoUniverse + 1);
  let contests = 0;
  for (const draw of draws) {
    if (!draw.trevos) continue;
    contests += 1;
    for (const value of draw.trevos) counts[value] += 1;
  }
  const expected = (contests * rules.trevosDrawn) / rules.trevoUniverse;
  let chi2 = 0;
  for (let t = 1; t <= rules.trevoUniverse; t += 1) {
    const diff = counts[t] - expected;
    chi2 += (diff * diff) / expected;
  }
  return chi2;
}

/**
 * Repetição média entre concursos **realmente** consecutivos.
 *
 * Só conta pares cujos números de concurso diferem de 1. Num histórico
 * oficial completo isso é todo par; num recorte com buracos, tratar
 * concursos distantes como vizinhos mediria outra coisa que não a
 * dependência entre sorteios seguidos.
 */
export function observedRepetition(draws: readonly Draw[]): { mean: number; pairs: number } {
  const ordered = chronological(draws);
  let total = 0;
  let pairs = 0;
  for (let i = 1; i < ordered.length; i += 1) {
    if (ordered[i].contestNumber - ordered[i - 1].contestNumber !== 1) continue;
    const previous = ordered[i - 1].numbers;
    for (const value of ordered[i].numbers) {
      if (previous.includes(value)) total += 1;
    }
    pairs += 1;
  }
  return { mean: pairs === 0 ? 0 : total / pairs, pairs };
}

/** Soma média das dezenas por concurso. */
export function observedMeanSum(draws: readonly Draw[]): number {
  if (draws.length === 0) return 0;
  let total = 0;
  for (const draw of draws) {
    for (const value of draw.numbers) total += value;
  }
  return total / draws.length;
}

/** A1 — uniformidade das dezenas. */
export function testA1Numbers(
  draws: readonly Draw[],
  lottery: Lottery,
  baseline: BaselineDistribution,
  correctedAlpha: number,
): TestOutcome {
  const rules = lotteryRules(lottery);
  const chi2 = observedNumbersChi2(draws, lottery);
  const critical = sampleQuantile(baseline.numbersChi2, 1 - correctedAlpha);
  const lambda = noncentralityFor(
    rules.numberUniverse,
    rules.numbersDrawn,
    draws.length,
    ALTERNATIVE_RELATIVE_BIAS,
  );
  const power = calibratedChi2Power(
    baseline.numbersChi2,
    lambda,
    critical,
    POWER_REPLICATIONS,
    POWER_SEED,
  );
  const mde = minimumDetectableBias(
    baseline.numbersChi2,
    critical,
    rules.numberUniverse,
    rules.numbersDrawn,
    draws.length,
  );

  return {
    id: 'A1.numbers',
    module: 'A1',
    label: 'Uniformidade das dezenas (qui-quadrado)',
    executed: true,
    statistic: chi2,
    expected: rules.numberUniverse - 1, // E[qui-quadrado] = gl
    pValue: upperTailPValue(baseline.numbersChi2, chi2),
    power,
    minimumDetectableEffect: mde,
    effectUnit: 'viés relativo numa dezena',
  };
}

/** A1 — uniformidade dos trevos, testada em separado das dezenas. */
export function testA1Trevos(
  draws: readonly Draw[],
  lottery: Lottery,
  baseline: BaselineDistribution,
  correctedAlpha: number,
): TestOutcome {
  const base = {
    id: 'A1.trevos',
    module: 'A1' as const,
    label: 'Uniformidade dos trevos (qui-quadrado)',
  };
  if (!baseline.trevosChi2) {
    return { ...base, executed: false, skipReason: 'Modalidade sem trevos.' };
  }
  const withTrevos = draws.filter((draw) => draw.trevos && draw.trevos.length > 0);
  if (withTrevos.length < draws.length) {
    return {
      ...base,
      executed: false,
      skipReason: `Trevos ausentes em ${draws.length - withTrevos.length} concursos.`,
    };
  }

  const rules = lotteryRules(lottery);
  const chi2 = observedTrevosChi2(draws, lottery);
  const critical = sampleQuantile(baseline.trevosChi2, 1 - correctedAlpha);
  const lambda = noncentralityFor(
    rules.trevoUniverse,
    rules.trevosDrawn,
    draws.length,
    ALTERNATIVE_RELATIVE_BIAS,
  );
  const power = calibratedChi2Power(
    baseline.trevosChi2,
    lambda,
    critical,
    POWER_REPLICATIONS,
    POWER_SEED,
  );
  const mde = minimumDetectableBias(
    baseline.trevosChi2,
    critical,
    rules.trevoUniverse,
    rules.trevosDrawn,
    draws.length,
  );

  return {
    ...base,
    executed: true,
    statistic: chi2,
    expected: rules.trevoUniverse - 1,
    pValue: upperTailPValue(baseline.trevosChi2, chi2),
    power,
    minimumDetectableEffect: mde,
    effectUnit: 'viés relativo num trevo',
  };
}

/** A2 — independência entre concursos consecutivos. */
export function testA2Repetition(
  draws: readonly Draw[],
  lottery: Lottery,
  baseline: BaselineDistribution,
  correctedAlpha: number,
): TestOutcome {
  const base = {
    id: 'A2.repetition',
    module: 'A2' as const,
    label: 'Independência entre concursos consecutivos',
  };
  const { mean, pairs } = observedRepetition(draws);
  if (pairs < 2) {
    return { ...base, executed: false, skipReason: 'Menos de 2 pares de concursos vizinhos.' };
  }

  const theoretical = expectedRepetition(lottery);
  const moments = nullMoments(baseline.meanRepetition);
  // A linha de base usa `contests-1` pares; se o recorte observado tem
  // buracos, o desvio-padrão nulo da média escala com a raiz da contagem.
  const expectedPairs = baseline.contests - 1;
  const nullSd = moments.stdDeviation * Math.sqrt(expectedPairs / pairs);

  const caveats: string[] = [];
  if (pairs < expectedPairs) {
    caveats.push(
      `Histórico com lacunas: ${pairs} pares vizinhos de ${expectedPairs} possíveis. ` +
        `O desvio-padrão nulo foi reescalado por √(${expectedPairs}/${pairs}).`,
    );
  }

  return {
    ...base,
    executed: true,
    statistic: mean,
    expected: theoretical,
    pValue: twoTailedPValue(baseline.meanRepetition, mean),
    power: normalTwoSidedPower(ALTERNATIVE_RELATIVE_BIAS * theoretical, nullSd, correctedAlpha),
    minimumDetectableEffect: normalMinimumDetectableShift(nullSd, correctedAlpha) / theoretical,
    effectUnit: 'desvio relativo na repetição média',
    caveats: caveats.length > 0 ? caveats : undefined,
  };
}

/** A3 — distribuição da soma das dezenas. */
export function testA3Sum(
  draws: readonly Draw[],
  lottery: Lottery,
  baseline: BaselineDistribution,
  correctedAlpha: number,
): TestOutcome {
  const mean = observedMeanSum(draws);
  const moments = nullMoments(baseline.meanSum);
  const shift = ALTERNATIVE_SUM_SHIFT_SD * sumStdDeviation(lottery);

  return {
    id: 'A3.sum',
    module: 'A3',
    label: 'Distribuição da soma das dezenas',
    executed: true,
    statistic: mean,
    expected: expectedSum(lottery),
    pValue: twoTailedPValue(baseline.meanSum, mean),
    power: normalTwoSidedPower(shift, moments.stdDeviation, correctedAlpha),
    minimumDetectableEffect: normalMinimumDetectableShift(
      moments.stdDeviation,
      correctedAlpha,
    ),
    effectUnit: 'deslocamento da soma média (dezenas)',
  };
}

/**
 * A4 — ganhadores observados contra o modelo de Poisson.
 *
 * ## A limitação, declarada como o protocolo exige
 *
 * O modelo nulo é `ganhadores ~ Poisson(apostas × p)`, com `p = 1/C(N,K)`.
 * Ele supõe que **as apostas se distribuem uniformemente** entre as
 * combinações — e isso é comprovadamente falso: as pessoas escolhem datas,
 * padrões no volante e sequências (ver `unpopularity.ts`).
 *
 * A consequência é específica e vale entender antes de ler o resultado: a
 * concentração de apostas em combinações populares produz
 * **sobredispersão** — mais concursos sem nenhum ganhador e mais concursos
 * com vários ganhadores do que Poisson prevê — sem alterar a *média*. Por
 * isso este teste avalia o nível médio, onde a não-uniformidade não
 * enviesa, e não a dispersão, onde ela domina.
 *
 * E o corolário importa para a leitura do relatório: se a dispersão
 * observada exceder a de Poisson, isso é evidência sobre o comportamento dos
 * apostadores, não sobre a lisura do sorteio — é exatamente o efeito que
 * `payoutShare.ts` modela e explora.
 */
export function testA4Winners(
  outcomes: readonly ContestOutcome[] | undefined,
  lottery: Lottery,
  correctedAlpha: number,
): TestOutcome {
  const base = {
    id: 'A4.winners',
    module: 'A4' as const,
    label: 'Ganhadores observados versus modelo de Poisson',
  };

  if (!outcomes || outcomes.length === 0) {
    return {
      ...base,
      executed: false,
      skipReason:
        'Ganhadores e volume de apostas por concurso não fornecidos. A Caixa ' +
        'publica esses dados separadamente do histórico de dezenas.',
    };
  }

  const rules = lotteryRules(lottery);
  // p da faixa principal para uma aposta simples: 1/C(N,K).
  let combinations = 1;
  for (let i = 0; i < rules.numbersDrawn; i += 1) {
    combinations = (combinations * (rules.numberUniverse - i)) / (i + 1);
  }
  const p = 1 / Math.round(combinations);

  let observed = 0;
  let lambda = 0;
  for (const outcome of outcomes) {
    if (outcome.simpleBets < 0 || !Number.isFinite(outcome.simpleBets)) {
      return { ...base, executed: false, skipReason: `Apostas inválidas no concurso ${outcome.contestNumber}.` };
    }
    observed += outcome.topTierWinners;
    lambda += outcome.simpleBets * p;
  }

  if (lambda <= 0) {
    return { ...base, executed: false, skipReason: 'Volume de apostas informado é zero.' };
  }

  // Aproximação normal da Poisson com correção de continuidade. Válida com
  // folga para o lambda agregado de um histórico inteiro (dezenas a centenas).
  const z = (Math.abs(observed - lambda) - 0.5) / Math.sqrt(lambda);
  const pValue = Math.min(1, 2 * (1 - approxNormalCDF(Math.max(z, 0))));

  return {
    ...base,
    executed: true,
    statistic: observed,
    expected: lambda,
    pValue,
    power: normalTwoSidedPower(ALTERNATIVE_RELATIVE_BIAS * lambda, Math.sqrt(lambda), correctedAlpha),
    minimumDetectableEffect:
      normalMinimumDetectableShift(Math.sqrt(lambda), correctedAlpha) / lambda,
    effectUnit: 'desvio relativo na taxa de ganhadores',
    caveats: [
      'As apostas não são uniformes entre combinações. Isso não enviesa o ' +
        'nível médio testado aqui, mas produz sobredispersão — desvio na ' +
        'dispersão seria evidência sobre apostadores, não sobre o sorteio.',
      lambda < 10
        ? `Lambda agregado baixo (${lambda.toFixed(2)}): a aproximação normal ` +
          `da Poisson perde precisão; leia o p-valor como indicativo.`
        : '',
    ].filter((text) => text.length > 0),
  };
}
