import { Lottery } from '../../types/domain';
import { binomial, prizeProbabilities } from '../hypergeometric';
import { designClosure, verifyClosure } from '../closureDesigner';
import { lotteryRules, prizeTiers } from '../prizeRules';

/**
 * Recomputação independente dos métodos exatos do contrato de calibração.
 *
 * WHY "independente": para um método exato, o risco não é overfitting
 * estatístico, é implementação errada. A recomputação usa OUTRA via
 * matemática (aritmética inteira exata com BigInt, varredura própria de
 * subconjuntos) e exige que a via do motor e a via da auditoria concordem.
 * Os parâmetros das regras (N, K, n) vêm do motor, mas a matemática é
 * refeita de fora — nenhum resultado do catálogo é duplicado ou confiante.
 */

/** Tolerância relativa para comparar ponto flutuante do motor com o exato. */
const RELATIVE_TOLERANCE = 1e-9;

export interface ExactCheck {
  /** Identificador do método no catálogo. */
  method: string;
  /** Cenário verificado (legível no relatório). */
  scenario: string;
  /** `true` quando motor e recomputação independente concordam. */
  pass: boolean;
  /** Evidência mensurável do resultado. */
  detail: string;
}

/**
 * C(n, k) exato em aritmética inteira — via independente da `binomial()` do
 * motor (que usa exp/log com arredondamento). A divisão passo a passo é
 * exata: cada prefixo é um coeficiente binomial intermediário.
 */
function bigBinomial(n: number, k: number): bigint {
  if (k < 0 || n < 0 || k > n) return BigInt(0);
  let result = BigInt(1);
  for (let i = 1; i <= k; i++) {
    result = (result * BigInt(n - k + i)) / BigInt(i);
  }
  return result;
}

/**
 * Fração exata do modelo hipergeométrico:
 * num = C(K, k)·C(N−K, n−k), den = C(N, n). Todos os binomiais envolvidos
 * cabem em double (C(80,5) ≈ 2,4×10⁷), então a divisão final em ponto
 * flutuante é precisa o bastante para a comparação relativa.
 */
function exactHypergeometricRatio(
  N: number,
  K: number,
  n: number,
  k: number,
): { num: bigint; den: bigint } {
  return {
    num: bigBinomial(K, k) * bigBinomial(N - K, n - k),
    den: bigBinomial(N, n),
  };
}

/** Subconjuntos de tamanho `size` de `pool` (ordem lexicográfica). */
function* combinations(
  pool: readonly number[],
  size: number,
): Generator<number[]> {
  const indices = Array.from({ length: size }, (_, i) => i);
  const n = pool.length;
  while (true) {
    yield indices.map((i) => pool[i]);
    let i = size - 1;
    while (i >= 0 && indices[i] === n - size + i) i--;
    if (i < 0) return;
    indices[i]++;
    for (let j = i + 1; j < size; j++) indices[j] = indices[j - 1] + 1;
  }
}

/**
 * Verificação própria da garantia C(v, k, t): todo subconjunto de `t`
 * dezenas do pool está contido em algum jogo do fechamento. Implementação
 * deliberadamente separada de `verifyClosure` — é a via independente.
 */
function closureCoverageIndependent(
  games: readonly (readonly number[])[],
  pool: readonly number[],
  guarantee: number,
): { covered: number; total: number; ok: boolean } {
  let covered = 0;
  let total = 0;
  for (const subset of combinations(pool, guarantee)) {
    total++;
    const hit = games.some((game) => subset.every((n) => game.includes(n)));
    if (hit) covered++;
  }
  return { covered, total, ok: covered === total };
}

function auditHypergeometricChances(): ExactCheck {
  let tiersChecked = 0;
  let maxRelativeError = 0;
  let pass = true;

  for (const lottery of [Lottery.MEGA_SENA, Lottery.MAIS_MILIONARIA, Lottery.QUINA]) {
    const rules = lotteryRules(lottery);
    const engine = prizeProbabilities(lottery);
    for (const tier of prizeTiers(lottery)) {
      const ratio = exactHypergeometricRatio(
        rules.numberUniverse,
        rules.numbersDrawn,
        rules.numbersPerBet,
        tier.numberHits,
      );
      let num = ratio.num;
      let den = ratio.den;
      if (tier.trevoHits !== undefined) {
        // Dezenas e trevos saem de urnas independentes: probabilidade da
        // faixa é o produto das duas frações exatas.
        const trevo = exactHypergeometricRatio(
          rules.trevoUniverse,
          rules.trevosDrawn,
          rules.trevosPerBet,
          tier.trevoHits,
        );
        num *= trevo.num;
        den *= trevo.den;
      }
      const exactP = Number(num) / Number(den);
      const engineP = engine[tier.key];
      const relativeError = Math.abs(engineP - exactP) / exactP;
      maxRelativeError = Math.max(maxRelativeError, relativeError);
      if (!(relativeError <= RELATIVE_TOLERANCE)) pass = false;
      tiersChecked++;
    }
  }

  // Spot-check da `binomial()` pública contra a via BigInt (valores exatos).
  const binomialMatrix: Array<[number, number]> = [
    [60, 6], [50, 6], [80, 5], [6, 2], [60, 5], [80, 4], [15, 6],
  ];
  for (const [n, k] of binomialMatrix) {
    if (BigInt(binomial(n, k)) !== bigBinomial(n, k)) pass = false;
  }

  return {
    method: 'hypergeometricChances',
    scenario:
      'prizeProbabilities das 3 loterias recomputadas com aritmética BigInt exata + spot-check de binomial()',
    pass,
    detail:
      `${tiersChecked} faixas verificadas; erro relativo máximo ` +
      `${maxRelativeError.toExponential(1)} (tolerância ` +
      `${RELATIVE_TOLERANCE.toExponential(0)}); ${binomialMatrix.length} ` +
      'coeficientes exatos conferidos',
  };
}

function auditClosureDesigner(): ExactCheck {
  const pool = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const gameSize = 6;
  const guarantee = 3;

  const design = designClosure(pool, gameSize, guarantee);
  const engineOk = verifyClosure(design, pool);
  const independent = closureCoverageIndependent(design.games, pool, guarantee);

  // Controle negativo: um fechamento quebrado TEM de ser rejeitado pelos
  // dois verificadores — prova de que eles medem, não que apenas aprovam.
  // Remoções de jogo são tentadas em ordem determinística; se nenhuma
  // quebrar a cobertura (design com redundância), cai para design vazio.
  let broken: number[][] = design.games.slice(1);
  for (let i = 0; i < design.games.length; i++) {
    const candidate = design.games.filter((_, index) => index !== i);
    if (!verifyClosure({ ...design, games: candidate }, pool)) {
      broken = candidate;
      break;
    }
  }
  if (verifyClosure({ ...design, games: broken }, pool)) broken = [];
  const engineRejects = !verifyClosure({ ...design, games: broken }, pool);
  const independentRejects = !closureCoverageIndependent(broken, pool, guarantee).ok;

  const pass = engineOk && independent.ok && engineRejects && independentRejects;
  return {
    method: 'closureDesigner',
    scenario:
      `fechamento C(${pool.length}, ${gameSize}, ${guarantee}) projetado e ` +
      'verificado por duas vias + controle negativo',
    pass,
    detail:
      `${design.games.length} jogos; ${independent.covered}/` +
      `${independent.total} subconjuntos cobertos (motor: ` +
      `${engineOk ? 'confirma' : 'NEGA'}); controle negativo rejeitado ` +
      `(${engineRejects ? 'motor' : 'motor NÃO'}, ` +
      `${independentRejects ? 'independente' : 'independente NÃO'})`,
  };
}

/** Roda todas as recomputações independentes dos métodos exatos do catálogo. */
export function auditExactMethods(): ExactCheck[] {
  return [auditHypergeometricChances(), auditClosureDesigner()];
}
