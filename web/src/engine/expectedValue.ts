import { Lottery } from '../types/domain';
import { prizeProbabilities } from './hypergeometric';

/**
 * Valor Esperado (EV) e Kelly Criterion.
 *
 * Em loterias o EV de uma aposta simples é, por desenho, negativo (o
 * arrecadado supera o distribuído). A exceção é a faixa acumulada
 * ("rollover"): o prêmio da faixa máxima cresce sem custo adicional do
 * bilhete, o que pode — em tese, e só para valores de acumulação muito altos
 * — aproximar ou até virar o EV positivo. Este módulo calcula isso
 * explicitamente, sem alterar a geração de jogos.
 */

export interface PrizeAverage {
  /** Chave da faixa, mesma convenção de `PrizeTier.key` (`prizeRules.ts`). */
  tier: string;
  /** Valor médio histórico pago nessa faixa (dado externo, não vem do engine). */
  averagePrize: number;
}

export interface EVResult {
  ev: number;
  evPercent: number;
  /**
   * Quanto precisaria estar acumulado na faixa máxima para o EV zerar,
   * assumindo tudo o mais constante. `Infinity` se a faixa máxima tem
   * probabilidade zero (não deveria ocorrer com `Lottery` válida).
   */
  breakEvenAccumulated: number;
}

/**
 * EV de uma aposta simples: `Σ P(faixa) × prêmio(faixa) − custo do bilhete`.
 * `accumulatedPrize`, se informado, soma-se ao prêmio médio da faixa mais
 * alta (a faixa com `numberHits` igual ao máximo sorteável).
 */
export function calculateEV(
  lottery: Lottery,
  prizeAverages: PrizeAverage[],
  ticketCost: number,
  accumulatedPrize?: number,
): EVResult {
  const probabilities = prizeProbabilities(lottery);
  const topTierKey = findTopTierKey(probabilities);

  let expectedPrize = 0;
  for (const { tier, averagePrize } of prizeAverages) {
    expectedPrize += (probabilities[tier] ?? 0) * averagePrize;
  }

  const topProbability = topTierKey ? (probabilities[topTierKey] ?? 0) : 0;
  if (accumulatedPrize && topTierKey) {
    expectedPrize += topProbability * accumulatedPrize;
  }

  const ev = expectedPrize - ticketCost;
  const evPercent = ticketCost === 0 ? 0 : (ev / ticketCost) * 100;

  const baseExpectedPrize = expectedPrize - (accumulatedPrize ? topProbability * accumulatedPrize : 0);
  const breakEvenAccumulated =
    topProbability > 0 ? (ticketCost - baseExpectedPrize) / topProbability : Infinity;

  return { ev, evPercent, breakEvenAccumulated };
}

/** A faixa com maior `numberHits` costuma ter a menor probabilidade — é a faixa que acumula. */
function findTopTierKey(probabilities: Record<string, number>): string | null {
  const entries = Object.entries(probabilities);
  if (entries.length === 0) return null;
  return entries.reduce((min, entry) => (entry[1] < min[1] ? entry : min))[0];
}

export interface KellyResult {
  /** Fração da banca recomendada; 0 quando o EV não é positivo. */
  fraction: number;
  isPositive: boolean;
}

/**
 * Kelly Criterion: `f* = (b·p − q) / b`, `b` = odds líquidas, `p` = prob. de
 * ganhar, `q = 1 − p`.
 *
 * ADVERTÊNCIA: Kelly assume apostas repetidas e independentes com a mesma
 * probabilidade — verdadeiro entre concursos de loteria, mas o critério foi
 * desenhado para apostas com _feedback rápido_ (permitindo reinvestir
 * ganhos). Aqui ele serve só como heurística de limite superior racional,
 * não como recomendação de gestão de banca real.
 */
export function kellyCriterion(probability: number, netOdds: number): KellyResult {
  if (netOdds <= 0) return { fraction: 0, isPositive: false };
  const q = 1 - probability;
  const fraction = (netOdds * probability - q) / netOdds;
  return { fraction: Math.max(0, fraction), isPositive: fraction > 0 };
}

export interface KellySimulationResult {
  recommendedBet: number;
  fraction: number;
  ev: number;
}

/**
 * Amarra `calculateEV` + `kellyCriterion`: se o EV não é positivo, a aposta
 * recomendada é sempre 0 — não há cenário em que Kelly recomenda apostar em
 * um jogo de EV negativo.
 */
export function kellySimulation(
  bankroll: number,
  lottery: Lottery,
  prizeAverages: PrizeAverage[],
  ticketCost: number,
  accumulatedPrize?: number,
): KellySimulationResult {
  const { ev } = calculateEV(lottery, prizeAverages, ticketCost, accumulatedPrize);
  if (ev <= 0 || ticketCost <= 0) {
    return { recommendedBet: 0, fraction: 0, ev };
  }

  const probabilities = prizeProbabilities(lottery);
  const pAnyPrize = prizeAverages.reduce((sum, { tier }) => sum + (probabilities[tier] ?? 0), 0);
  const netOdds = ev / ticketCost;

  const { fraction } = kellyCriterion(pAnyPrize, netOdds);
  return { recommendedBet: bankroll * fraction, fraction, ev };
}
