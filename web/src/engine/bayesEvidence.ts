import { Draw, Lottery, NumberPerformance } from '../types/domain';
import { lotteryRules } from './prizeRules';

/**
 * Evidência bayesiana sobre a uniformidade das dezenas.
 *
 * ## Por que além do teste de hipótese
 * `numberEvidence.ts` responde "há desvio significativo?". Um p-valor grande,
 * porém, **não** é evidência a favor do acaso — só ausência de evidência
 * contra. O fator de Bayes resolve isso: `BF10` mede quantas vezes os dados
 * são mais prováveis sob "as dezenas têm probabilidades diferentes" do que sob
 * "todas iguais". `BF10 << 1` é evidência positiva de uniformidade, coisa que
 * o teste frequentista não consegue dizer.
 *
 * ## O modelo
 * Contagens `c_i` das `m` dezenas em `n` sorteios individuais.
 * - H0: todas as probabilidades iguais a `1/m`.
 * - H1: probabilidades ~ Dirichlet simétrica de concentração `α`.
 *
 * A verossimilhança marginal de H1 tem forma fechada (Good, 1967;
 * multinomial–Dirichlet), e o coeficiente multinomial cancela na razão:
 *
 *     BF10 = Γ(mα)/Γ(n+mα) · Π Γ(c_i+α)/Γ(α) · m^n
 *
 * ## A correção de amostragem sem reposição
 * As 6 dezenas de um concurso saem SEM reposição, o que subdispersa as
 * contagens em relação a uma multinomial por fator `deff = (N−K)/(N−1)`
 * (0,915 na Mega-Sena). Sem corrigir, os dados pareceriam "uniformes demais" e
 * o fator de Bayes exageraria a evidência pró-acaso. As contagens são
 * reescaladas por `1/deff`, o que casa a variância com a da multinomial.
 * A aproximação é validada por simulação em `bayesEvidence.test.ts`.
 *
 * ## Dois alternativos, porque a pergunta tem duas formas
 * A Dirichlet simétrica acima presume que TODAS as dezenas se desviam um
 * pouco. Contra uma dezena isolada viciada ela dilui o sinal: com uma dezena a
 * +40% (10 desvios-padrão), o BF10 ainda sai pró-acaso. Por isso há também o
 * alternativo **esparso**: "exatamente uma dezena tem probabilidade diferente".
 * Para cada dezena `i`, a inclusão em cada concurso é Bernoulli(`p0 = K/N`)
 * sob H0 — exatamente, sem correção de amostragem —, e com prior
 * Beta(κ·p0, κ·(1−p0)) sob H1_i o fator tem forma fechada:
 *
 *     BF_i = B(c+κp0, n−c+κ(1−p0)) / B(κp0, κ(1−p0)) / (p0^c (1−p0)^(n−c))
 *
 * O esparso é a média dos `BF_i` (prior uniforme sobre qual dezena é viciada),
 * e a média de martingales de teste é martingale de teste. O fator reportado
 * mistura 50/50 omnibus e esparso: custa no máximo 0,3 em `log10` frente ao
 * melhor dos dois, e cobre os dois tipos de desvio.
 *
 * ## Validade sequencial
 * Com prior fixado antes dos dados, `BF10` calculado após cada concurso é um
 * martingale de teste sob H0. Pela desigualdade de Ville, `P(sup_t BF10 ≥ 1/a)
 * ≤ a`: pode-se olhar a cada novo concurso sem inflar o falso-positivo — o
 * que o p-valor fixo não permite. `anytimeP = min(1, 1/max_t BF10)` é o
 * p-valor "sempre válido" (Ramdas et al.; Grünwald, de Heide e Koolen).
 */

/** Concentração de referência, fixada antes de olhar qualquer histórico. */
export const DEFAULT_ALPHA = 20;

/**
 * Força do prior Beta por dezena no alternativo esparso, fixada antes dos
 * dados: sob H1 a probabilidade de inclusão varia ~30% em torno de `K/N`
 * (desvio relativo `1/sqrt(κ+1)` · `sqrt((1−p0)/p0)` ≈ 0,3 com κ = 100).
 */
export const DEFAULT_KAPPA = 100;

/** log Γ(x) por Lanczos (g = 7, n = 9); erro relativo ~1e-15 para x > 0. */
export function logGamma(x: number): number {
  if (x < 0.5) {
    // Reflexão: Γ(x)Γ(1−x) = π / sin(πx)
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  }
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  const z = x - 1;
  let a = c[0];
  const t = z + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (z + i);
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

/** log B(a, b) = lnΓ(a) + lnΓ(b) − lnΓ(a+b). */
function logBeta(a: number, b: number): number {
  return logGamma(a) + logGamma(b) - logGamma(a + b);
}

/** ln(Σ exp(x_i)), estável. */
function logSumExp(values: readonly number[]): number {
  const max = Math.max(...values);
  if (!Number.isFinite(max)) return max;
  return max + Math.log(values.reduce((sum, v) => sum + Math.exp(v - max), 0));
}

/**
 * `ln BF_i` de uma dezena: `c` concursos com a dezena em `n`, `p0 = K/N`.
 * Exato — cada concurso inclui a dezena com probabilidade exatamente `p0`.
 */
export function logBayesFactorNumber(c: number, n: number, p0: number, kappa: number): number {
  const a = kappa * p0;
  const b = kappa * (1 - p0);
  return logBeta(c + a, n - c + b) - logBeta(a, b) - c * Math.log(p0) - (n - c) * Math.log(1 - p0);
}

/** `ln BF` esparso: média dos `BF_i` (uma dezena viciada, qual não se sabe). */
export function logBayesFactorSparse(
  inclusions: readonly number[],
  draws: number,
  p0: number,
  kappa: number,
): number {
  return (
    logSumExp(inclusions.map((c) => logBayesFactorNumber(c, draws, p0, kappa))) -
    Math.log(inclusions.length)
  );
}

/** Fator de desenho da amostragem sem reposição: `(N−K)/(N−1)`. */
export function designEffect(lottery: Lottery): number {
  const { numberUniverse: N, numbersDrawn: K } = lotteryRules(lottery);
  return (N - K) / (N - 1);
}

/**
 * `ln BF10` para contagens (já reescaladas se vier de sorteio sem reposição).
 * Aceita contagens fracionárias — `logGamma` é contínua.
 */
export function logBayesFactorUniform(counts: readonly number[], alpha: number): number {
  const m = counts.length;
  const n = counts.reduce((sum, c) => sum + c, 0);
  if (m < 2 || alpha <= 0) {
    throw new RangeError('Fator de Bayes exige >= 2 categorias e alpha > 0');
  }
  let log = logGamma(m * alpha) - logGamma(n + m * alpha) + n * Math.log(m);
  for (const c of counts) log += logGamma(c + alpha) - logGamma(alpha);
  return log;
}

export type BayesVerdict =
  | 'FORTE_PRO_ACASO'
  | 'MODERADA_PRO_ACASO'
  | 'INCONCLUSIVO'
  | 'MODERADA_CONTRA_ACASO'
  | 'FORTE_CONTRA_ACASO';

/**
 * Escala de Jeffreys/Kass–Raftery sobre `log10 BF10`:
 * `< −1` forte pró-H0 (BF01 > 10); `−1..−0,5` moderada; `−0,5..0,5`
 * inconclusivo; `0,5..1` moderada contra; `> 1` forte contra.
 */
export function bayesVerdict(log10Bf10: number): BayesVerdict {
  if (log10Bf10 < -1) return 'FORTE_PRO_ACASO';
  if (log10Bf10 < -0.5) return 'MODERADA_PRO_ACASO';
  if (log10Bf10 <= 0.5) return 'INCONCLUSIVO';
  if (log10Bf10 <= 1) return 'MODERADA_CONTRA_ACASO';
  return 'FORTE_CONTRA_ACASO';
}

export interface BayesEvidence {
  draws: number;
  alpha: number;
  kappa: number;
  /** `log10 BF10` combinado (50/50 omnibus e esparso): negativo favorece o acaso. */
  log10Bf10: number;
  /** Só o alternativo omnibus (todas as dezenas se desviam um pouco). */
  log10BfOmnibus: number;
  /** Só o alternativo esparso (uma dezena viciada). */
  log10BfSparse: number;
  verdict: BayesVerdict;
  /** p-valor sempre válido (Ville): `min(1, 1/BF10)`. */
  anytimeP: number;
  /** Força do prior estimada dos dados (Bayes empírico); `Infinity` = uniformidade total. */
  empiricalKappa: number;
  /**
   * Probabilidade de inclusão por dezena após encolhimento pelo Bayes
   * empírico, na ordem 1..universo. Sob sorteio honesto todas ficam ≈ `K/N`;
   * a soma é exatamente `K`.
   */
  shrunkProbabilities: number[];
}

const KAPPA_MIN = 0.5;
const KAPPA_MAX = 1e7;

/** Seção áurea em `ln κ` sobre a verossimilhança marginal conjunta das dezenas. */
function empiricalBayesKappa(inclusions: readonly number[], draws: number, p0: number): number {
  const f = (logKappa: number): number => {
    const kappa = Math.exp(logKappa);
    const a = kappa * p0;
    const b = kappa * (1 - p0);
    let total = 0;
    for (const c of inclusions) total += logBeta(c + a, draws - c + b) - logBeta(a, b);
    return total;
  };
  let lo = Math.log(KAPPA_MIN);
  let hi = Math.log(KAPPA_MAX);
  const phi = (Math.sqrt(5) - 1) / 2;
  let x1 = hi - phi * (hi - lo);
  let x2 = lo + phi * (hi - lo);
  let f1 = f(x1);
  let f2 = f(x2);
  for (let i = 0; i < 80; i++) {
    if (f1 < f2) {
      lo = x1;
      x1 = x2;
      f1 = f2;
      x2 = lo + phi * (hi - lo);
      f2 = f(x2);
    } else {
      hi = x2;
      x2 = x1;
      f2 = f1;
      x1 = hi - phi * (hi - lo);
      f1 = f(x1);
    }
  }
  const best = Math.exp((lo + hi) / 2);
  // No teto, os dados não se distinguem de uniformidade exata.
  return best > KAPPA_MAX * 0.5 ? Infinity : best;
}

function evidenceOf(
  lottery: Lottery,
  draws: number,
  inclusions: readonly number[],
  alpha: number,
  kappa: number,
): { log10Bf10: number; log10BfOmnibus: number; log10BfSparse: number } {
  const { numbersDrawn, numberUniverse } = lotteryRules(lottery);
  const p0 = numbersDrawn / numberUniverse;
  const deff = designEffect(lottery);
  const lnOmnibus = logBayesFactorUniform(
    inclusions.map((c) => c / deff),
    alpha,
  );
  const lnSparse = logBayesFactorSparse(inclusions, draws, p0, kappa);
  const lnCombined = logSumExp([lnOmnibus, lnSparse]) - Math.LN2;
  return {
    log10Bf10: lnCombined / Math.LN10,
    log10BfOmnibus: lnOmnibus / Math.LN10,
    log10BfSparse: lnSparse / Math.LN10,
  };
}

function summarize(
  lottery: Lottery,
  draws: number,
  inclusions: readonly number[],
  alpha: number,
  kappa: number,
): BayesEvidence {
  const { numbersDrawn, numberUniverse } = lotteryRules(lottery);
  const p0 = numbersDrawn / numberUniverse;
  const evidence = evidenceOf(lottery, draws, inclusions, alpha, kappa);
  const empiricalKappa = draws > 0 ? empiricalBayesKappa(inclusions, draws, p0) : Infinity;
  const shrunk = inclusions.map((c) =>
    Number.isFinite(empiricalKappa) ? (c + empiricalKappa * p0) / (draws + empiricalKappa) : p0,
  );
  return {
    draws,
    alpha,
    kappa,
    ...evidence,
    verdict: bayesVerdict(evidence.log10Bf10),
    anytimeP: Math.min(1, Math.pow(10, -evidence.log10Bf10)),
    empiricalKappa,
    shrunkProbabilities: shrunk,
  };
}

/** Inclusões por dezena (concursos em que cada dezena saiu), ordem 1..universo. */
function inclusionsOf(lottery: Lottery, hits: ReadonlyMap<number, number>): number[] {
  const { numberUniverse } = lotteryRules(lottery);
  return Array.from({ length: numberUniverse }, (_, i) => hits.get(i + 1) ?? 0);
}

/** Evidência a partir das frequências do ranking (`hitCount`), sem o histórico bruto. */
export function bayesEvidenceFromPerformances(
  lottery: Lottery,
  performances: readonly NumberPerformance[],
  alpha: number = DEFAULT_ALPHA,
  kappa: number = DEFAULT_KAPPA,
): BayesEvidence {
  const { numbersDrawn } = lotteryRules(lottery);
  const hits = new Map(performances.map((p) => [p.number, p.hitCount]));
  const totalHits = performances.reduce((sum, p) => sum + p.hitCount, 0);
  return summarize(
    lottery,
    Math.round(totalHits / numbersDrawn),
    inclusionsOf(lottery, hits),
    alpha,
    kappa,
  );
}

export interface BayesPoint {
  contestNumber: number;
  log10Bf10: number;
}

/**
 * Trajetória de `log10 BF10` concurso a concurso — o que se vê ao monitorar o
 * histórico conforme novos sorteios chegam. `maxLog10Bf10` alimenta o p-valor
 * sempre válido: `min(1, 10^(−max))`.
 */
export function bayesTrajectory(
  lottery: Lottery,
  draws: readonly Draw[],
  alpha: number = DEFAULT_ALPHA,
  kappa: number = DEFAULT_KAPPA,
): { points: BayesPoint[]; maxLog10Bf10: number; anytimeP: number } {
  const hits = new Map<number, number>();
  const points: BayesPoint[] = [];
  let seen = 0;
  let max = -Infinity;
  for (const draw of draws) {
    if (draw.lottery !== lottery) continue;
    seen++;
    for (const n of draw.numbers) hits.set(n, (hits.get(n) ?? 0) + 1);
    const { log10Bf10 } = evidenceOf(lottery, seen, inclusionsOf(lottery, hits), alpha, kappa);
    points.push({ contestNumber: draw.contestNumber, log10Bf10 });
    if (log10Bf10 > max) max = log10Bf10;
  }
  return {
    points,
    maxLog10Bf10: points.length === 0 ? 0 : max,
    anytimeP: points.length === 0 ? 1 : Math.min(1, Math.pow(10, -max)),
  };
}

/** Evidência sobre um histórico completo de concursos. */
export function bayesEvidenceFromDraws(
  lottery: Lottery,
  draws: readonly Draw[],
  alpha: number = DEFAULT_ALPHA,
  kappa: number = DEFAULT_KAPPA,
): BayesEvidence {
  const hits = new Map<number, number>();
  let count = 0;
  for (const draw of draws) {
    if (draw.lottery !== lottery) continue;
    count++;
    for (const n of draw.numbers) hits.set(n, (hits.get(n) ?? 0) + 1);
  }
  return summarize(lottery, count, inclusionsOf(lottery, hits), alpha, kappa);
}
