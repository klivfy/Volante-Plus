import { Draw, Lottery, NumberPerformance } from '../types/domain';
import { classifyHits } from './prizeRules';
import { createSeededRandom, defaultRandom, RandomSource } from './random';
import { StrategyName, generateForStrategy } from './strategyBenchmark';

/**
 * Simulação de gestão de banca (Monte Carlo de cenários).
 *
 * O engine responde "essa estratégia bate o acaso?" (backtesting) e "isso é
 * significativo?" (`statisticalTests.ts`). Esta pergunta é diferente e mais
 * prática: "se eu apostar `gamesPerWeek` jogos por `weeks` semanas com banca
 * inicial `initialBankroll`, o que normalmente acontece com meu dinheiro?" —
 * puramente educativo, não é EV nem recomendação (ver `expectedValue.ts`
 * para EV).
 */

export interface BankrollScenario {
  initialBankroll: number;
  ticketCost: number;
  gamesPerWeek: number;
  weeks: number;
  strategy: StrategyName;
}

export interface ScenarioResult {
  finalBankroll: number;
  totalSpent: number;
  totalWon: number;
  /** Maior queda percentual da banca em relação ao pico observado (0..1). */
  maxDrawdown: number;
  /** Contagem de prêmios por faixa (`PrizeTier.key`). */
  hitCount: Record<string, number>;
  bankrupt: boolean;
}

/**
 * Roda um cenário sobre uma sequência real de sorteios (`draws`, já
 * ordenados cronologicamente e restritos a `scenario.weeks` concursos).
 * `prizeTable` mapeia `PrizeTier.key -> valor pago` (dado externo — o engine
 * não conhece valores de prêmio, só probabilidades).
 */
export function simulateBankroll(
  scenario: BankrollScenario,
  draws: Draw[],
  lottery: Lottery,
  performances: NumberPerformance[],
  prizeTable: Record<string, number>,
  random: RandomSource = defaultRandom,
): ScenarioResult {
  let bankroll = scenario.initialBankroll;
  let totalSpent = 0;
  let totalWon = 0;
  let maxBankroll = bankroll;
  let maxDrawdown = 0;
  const hitCount: Record<string, number> = {};

  const weeklyDraws = draws.slice(0, scenario.weeks);

  for (let week = 0; week < scenario.weeks; week++) {
    const weeklyCost = scenario.ticketCost * scenario.gamesPerWeek;

    if (bankroll < weeklyCost) {
      return { finalBankroll: 0, totalSpent, totalWon, maxDrawdown: 1, hitCount, bankrupt: true };
    }

    bankroll -= weeklyCost;
    totalSpent += weeklyCost;

    const draw = weeklyDraws[week];
    if (draw) {
      const games = generateForStrategy(
        scenario.strategy,
        lottery,
        performances,
        scenario.gamesPerWeek,
        random,
      );

      for (const numbers of games) {
        const hits = numbers.filter((n) => draw.numbers.includes(n)).length;
        const tier = classifyHits(lottery, hits);
        if (tier && prizeTable[tier.key]) {
          const prize = prizeTable[tier.key];
          bankroll += prize;
          totalWon += prize;
          hitCount[tier.key] = (hitCount[tier.key] ?? 0) + 1;
        }
      }
    }

    maxBankroll = Math.max(maxBankroll, bankroll);
    if (maxBankroll > 0) {
      maxDrawdown = Math.max(maxDrawdown, (maxBankroll - bankroll) / maxBankroll);
    }
  }

  return {
    finalBankroll: bankroll,
    totalSpent,
    totalWon,
    maxDrawdown,
    hitCount,
    bankrupt: bankroll <= 0,
  };
}

export interface MonteCarloBankrollResult {
  bankruptcyRate: number;
  meanFinalBankroll: number;
  medianFinalBankroll: number;
  probProfit: number;
  probAnyPrize: number;
}

/**
 * Roda `simulations` execuções independentes de `simulateBankroll` — cada
 * uma resorteia os jogos gerados (aleatoriedade da estratégia), mas contra a
 * mesma sequência real de sorteios. Resume a distribuição de desfechos.
 */
export function monteCarloBankroll(
  scenario: BankrollScenario,
  draws: Draw[],
  lottery: Lottery,
  performances: NumberPerformance[],
  prizeTable: Record<string, number>,
  simulations: number = 300,
  seed?: number,
): MonteCarloBankrollResult {
  let bankruptcies = 0;
  let profits = 0;
  let anyPrize = 0;
  const finals: number[] = [];

  for (let i = 0; i < simulations; i++) {
    const random = seed === undefined ? defaultRandom : createSeededRandom(seed + i);
    const result = simulateBankroll(scenario, draws, lottery, performances, prizeTable, random);

    if (result.bankrupt) bankruptcies++;
    if (result.finalBankroll > scenario.initialBankroll) profits++;
    if (Object.values(result.hitCount).some((c) => c > 0)) anyPrize++;
    finals.push(result.finalBankroll);
  }

  finals.sort((a, b) => a - b);
  const mean = simulations === 0 ? 0 : finals.reduce((a, b) => a + b, 0) / simulations;

  return {
    bankruptcyRate: simulations === 0 ? 0 : bankruptcies / simulations,
    meanFinalBankroll: mean,
    medianFinalBankroll: simulations === 0 ? 0 : finals[Math.floor(simulations / 2)],
    probProfit: simulations === 0 ? 0 : profits / simulations,
    probAnyPrize: simulations === 0 ? 0 : anyPrize / simulations,
  };
}
