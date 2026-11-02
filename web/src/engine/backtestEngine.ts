import {
  BacktestReport,
  Draw,
  Lottery,
  MIN_GAMES,
  NumberPerformance,
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

/**
 * Data mínima de corte por modalidade (piso histórico absoluto): o primeiro
 * sorteio oficial de cada modalidade — Mega-Sena 11/03/1996, +Milionária
 * 28/05/2022 e Quina 13/03/1994 (concurso 1 de cada; conferido contra o seed
 * versionado em `data/history`). A Mega constava como `1995-03-11` — errônea:
 * o concurso 1 foi em 1996. Ver `backtestCutoff.ts`, que expõe estes pisos
 * como limites do seletor de data na tela de backtesting.
 */
export const MIN_CUTOFF_DATES: Record<Lottery, string> = {
  [Lottery.MEGA_SENA]: '1996-03-11',
  [Lottery.MAIS_MILIONARIA]: '2022-05-28',
  [Lottery.QUINA]: '1994-03-13',
};

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
export function statisticsOf(values: number[]): Statistics {
  if (values.length === 0) {
    return { mean: 0, variance: 0, stdDeviation: 0 };
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return { mean, variance, stdDeviation: Math.sqrt(variance) };
}

/** Agregados da simulação da janela de validação (sem o enfeite do relatório). */
export interface ValidationSimulation {
  /** Acertos de cada jogo gerado, na ordem dos concursos. */
  hitsPerGame: number[];
  /** Média de acertos do lote de cada concurso (unidade do `stats` do relatório). */
  meanHitsPerContest: number[];
  /** Apostas efetuadas (1 por jogo simples; 1 por dupla de trevo na +Milionária). */
  totalBets: number;
  /** Apostas premiadas segundo `classifyHits`. */
  prizeCount: number;
}

/**
 * Gera e pontua os jogos de cada concurso da janela de validação.
 *
 * Extraída de `runBacktest` para reuso pela calibração nula por permutação
 * (`nullCalibration.ts`): o nulo precisa repetir EXATAMENTE este pipeline
 * (mesma geração, mesma pontuação, mesma ordem de consumo do RNG), só
 * trocando as performances por versões com rótulos permutados.
 *
 * WHY (estratégia fixa `FREQUENCY_TIERS`): o backtest mede o método por
 * frequência pura — tiers sem o desempate de popularidade — para isolar o
 * mecanismo e tornar o relatório interpretável contra o baseline.
 */
export function simulateValidation(
  lottery: Lottery,
  performances: NumberPerformance[],
  trevoPerformances: NumberPerformance[],
  validationDraws: Draw[],
  gamesPerContest: number,
  trevoStrategy: TrevoStrategy,
  random: RandomSource,
): ValidationSimulation {
  const hitsPerGame: number[] = [];
  const meanHitsPerContest: number[] = [];
  let totalBets = 0;
  let prizeCount = 0;

  for (const draw of validationDraws) {
    const batch = generateGames(lottery, gamesPerContest, performances, {
      trevoPerformances,
      trevoStrategy,
      random,
      strategy: 'FREQUENCY_TIERS',
    });

    let contestHits = 0;
    for (const game of batch.games) {
      const numberHits = game.numbers.filter((number) => draw.numbers.includes(number)).length;
      contestHits += numberHits;
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

    // Estatística por CONCURSO (média dos jogos do lote), como o Kotlin
    // (`BacktestEngine.kt`): jogos do mesmo concurso são disjuntos e por isso
    // negativamente correlacionados — agregá-los como i.i.d. produz variância
    // e desvio-padrão inválidos (a média coincide, os erros não).
    meanHitsPerContest.push(batch.games.length > 0 ? contestHits / batch.games.length : 0);
  }

  return { hitsPerGame, meanHitsPerContest, totalBets, prizeCount };
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

  const simulation = simulateValidation(
    lottery,
    performances,
    trevoPerformances,
    validationDraws,
    gamesPerContest,
    trevoStrategy,
    random,
  );

  const hitDistribution: Record<number, number> = {};
  for (const hits of simulation.hitsPerGame) {
    hitDistribution[hits] = (hitDistribution[hits] ?? 0) + 1;
  }

  return {
    trainingDraws: trainingDraws.length,
    validationDraws: validationDraws.length,
    totalGames: simulation.hitsPerGame.length,
    totalBets: simulation.totalBets,
    stats: statisticsOf(simulation.meanHitsPerContest),
    expectedMeanHits: expectedNumberHits(lottery),
    prizeRate: simulation.totalBets === 0 ? 0 : simulation.prizeCount / simulation.totalBets,
    prizeCount: simulation.prizeCount,
    hitDistribution,
    performances,
    trevoPerformances,
  };
}
