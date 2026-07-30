import {
  BacktestReport,
  Draw,
  Lottery,
  MIN_GAMES,
  TrevoStrategy,
} from '../types/domain';
import {
  DEFAULT_SIMULATIONS_PER_NUMBER,
  analyzeBacktest,
  analyzeTrevoBacktest,
} from './backtestAnalyzer';
import { generateGames } from './gameGenerator';
import { expectedNumberHits } from './hypergeometric';
import { classifyHits, hasTrevos } from './prizeRules';
import { createSeededRandom, defaultRandom, RandomSource } from './random';

/**
 * Motor de backtesting: isola o histórico pela data de corte, mede o
 * desempenho das dezenas **apenas** na janela de treino, gera jogos com esse
 * desempenho e cruza com os resultados reais da janela de validação.
 *
 * Honestidade metodológica: `analyzeBacktest`/`analyzeTrevoBacktest` recebem
 * exclusivamente os concursos anteriores ao corte — nunca os posteriores, que
 * serão usados na validação. O relatório mede se o único método de geração do
 * app supera (ou não) o baseline hipergeométrico; a resposta esperada é que
 * não supere.
 *
 * Porta direta de `BacktestEngine.kt` + `Statistics.kt` do app Android.
 */

export interface BacktestOptions {
  /** Jogos gerados por concurso da janela de validação; padrão `MIN_GAMES`. */
  gamesPerContest?: number;
  trevoStrategy?: TrevoStrategy;
  /** Rodadas de Monte Carlo por dezena em `analyzeBacktest`. */
  simulationRounds?: number;
  /** Semente para reprodutibilidade do relatório; ausente usa `defaultRandom`. */
  seed?: number;
}

interface Statistics {
  mean: number;
  variance: number;
  stdDeviation: number;
}

/** Variância populacional: o backtest observa todos os jogos gerados, não uma amostra. */
function statisticsOf(values: number[]): Statistics {
  if (values.length === 0) {
    return { mean: 0, variance: 0, stdDeviation: 0 };
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return { mean, variance, stdDeviation: Math.sqrt(variance) };
}

/**
 * Executa o backtest completo.
 *
 * @param trainingDraws concursos com `date <= corte` (ver `getDrawsUpTo`).
 * @param validationDraws concursos com `date > corte`; não pode ser vazio.
 * @throws RangeError quando `validationDraws` está vazio — não há o que validar.
 */
export function runBacktest(
  lottery: Lottery,
  trainingDraws: Draw[],
  validationDraws: Draw[],
  options: BacktestOptions = {},
): BacktestReport {
  if (validationDraws.length === 0) {
    throw new RangeError('Sem concursos após a data de corte — nada a validar');
  }

  const gamesPerContest = options.gamesPerContest ?? MIN_GAMES;
  const trevoStrategy = options.trevoStrategy ?? TrevoStrategy.ECONOMICO;
  const simulationRounds = options.simulationRounds ?? DEFAULT_SIMULATIONS_PER_NUMBER;
  // WHY: um único RNG compartilhado entre análise e geração — é ele que torna
  // o relatório reproduzível quando `options.seed` está definida.
  const random: RandomSource =
    options.seed === undefined ? defaultRandom : createSeededRandom(options.seed);

  const performances = analyzeBacktest(trainingDraws, lottery, simulationRounds, { random });
  const trevoPerformances = analyzeTrevoBacktest(trainingDraws, lottery, simulationRounds, {
    random,
  });

  const hitsPerGame: number[] = [];
  let totalBets = 0;
  let prizeCount = 0;

  for (const draw of validationDraws) {
    const batch = generateGames(lottery, gamesPerContest, performances, {
      trevoPerformances,
      trevoStrategy,
      random,
    });

    for (const game of batch.games) {
      const numberHits = game.numbers.filter((number) => draw.numbers.includes(number)).length;
      hitsPerGame.push(numberHits);

      if (hasTrevos(lottery)) {
        for (const dupla of game.trevoDuplas ?? []) {
          totalBets++;
          const drawTrevos = draw.trevos ?? [];
          const trevoHits = dupla.filter((trevo) => drawTrevos.includes(trevo)).length;
          if (classifyHits(lottery, numberHits, trevoHits) !== null) {
            prizeCount++;
          }
        }
      } else {
        totalBets++;
        if (classifyHits(lottery, numberHits) !== null) {
          prizeCount++;
        }
      }
    }
  }

  const hitDistribution: Record<number, number> = {};
  for (const hits of hitsPerGame) {
    hitDistribution[hits] = (hitDistribution[hits] ?? 0) + 1;
  }

  return {
    trainingDraws: trainingDraws.length,
    validationDraws: validationDraws.length,
    totalGames: hitsPerGame.length,
    totalBets,
    stats: statisticsOf(hitsPerGame),
    expectedMeanHits: expectedNumberHits(lottery),
    prizeRate: totalBets === 0 ? 0 : prizeCount / totalBets,
    prizeCount,
    hitDistribution,
    performances,
    trevoPerformances,
  };
}
