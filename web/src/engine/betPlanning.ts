import { Lottery } from '../types/domain';
import { hypergeometricAtLeast } from './hypergeometric';
import { lotteryRules } from './prizeRules';

/**
 * Probabilidades de planejamento de aposta — números que o usuário deveria ver
 * ao lado de qualquer promessa de "garantia" ou "cobertura".
 */

/**
 * Chance de a garantia de um fechamento valer: o sorteio ter `guarantee` ou
 * mais das `poolSize` dezenas marcadas. É P(X ≥ t) com X hipergeométrica
 * (população = universo, marcadas = `poolSize`, amostra = dezenas sorteadas).
 *
 * WHY: o contrato do fechamento é condicional ("SE saírem t das suas
 * dezenas..."). Mostrar só a condicional vende garantia sem dizer quão raro é
 * o "se". Com 10 dezenas na Mega-Sena a quadra garantida vale em ~0,54% dos
 * concursos (1 em 185).
 */
export function guaranteeProbability(
  lottery: Lottery,
  poolSize: number,
  guarantee: number,
): number {
  const { numberUniverse, numbersDrawn } = lotteryRules(lottery);
  return hypergeometricAtLeast(numberUniverse, poolSize, numbersDrawn, guarantee);
}

/** Chance de pelo menos um sucesso em `bets` tentativas independentes de probabilidade `p`. */
export function chanceOfAtLeastOne(p: number, bets: number): number {
  if (p <= 0 || bets <= 0) return 0;
  if (p >= 1) return 1;
  return -Math.expm1(bets * Math.log1p(-p));
}

/** Menor número de tentativas independentes para chegar a `target` de chance de ≥ 1 sucesso. */
export function betsForChance(p: number, target: number): number {
  if (!(p > 0 && p < 1) || !(target > 0 && target < 1)) {
    throw new RangeError('p e target devem estar em (0, 1)');
  }
  return Math.ceil(Math.log1p(-target) / Math.log1p(-p));
}
