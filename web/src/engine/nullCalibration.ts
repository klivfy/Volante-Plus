import {
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
import { simulateValidation, statisticsOf } from './backtestEngine';
import { expectedNumberHits } from './hypergeometric';
import { createSeededRandom, defaultRandom, RandomSource } from './random';
import { shuffleArray } from './statUtils';

/**
 * Calibração nula por permutação do backtesting (teste de randomização).
 *
 * ## O problema que fecha
 * O relatório do backtest compara `stats.mean` contra `expectedMeanHits`
 * hipergeométrico e o `binomialExactTest` trata cada aposta como Bernoulli
 * independente. Nenhuma das duas referências modela a ESTRUTURA do gerador:
 * tiers 70/20/10, pesos normalizados, deduplicação absoluta entre jogos do
 * lote (que os correlaciona negativamente) e o ruído Monte Carlo do próprio
 * `analyzeBacktest`. A consequência prática: um p-value paramétrico não diz
 * o que acontece COM este gerador — diz o que aconteceria com apostas
 * independentes ideais.
 *
 * ## O teste de permutação (padrão-ouro da estatística para este caso)
 * Sob H0 — "o mapeamento peso→dezena não carrega informação preditiva" — a
 * atribuição das performances às dezenas é permutável: baralhar QUAL dezena
 * recebe qual peso/tier produz réplicas tão informativas quanto a observada.
 * Repetimos o pipeline COMPLETO (geração + pontuação sobre a MESMA janela de
 * validação) R vezes com rótulos permutados e comparamos a estatística
 * observada com a distribuição nula empírica:
 *
 *   p̂ = (1 + #{|μ_r − μ̄_null| ≥ |μ_obs − μ̄_null|}) / (R + 1)
 *
 * O "+1" é o estimador conservador padrão (Phipson & Smyth 2010): a cópia
 * observada conta como uma réplica implícita da permutação.
 *
 * ## Por que isto é a ampliação honesta do backtesting
 * O teste captura TODA a estrutura do gerador por construção (é o próprio
 * gerador rodando) — correlação por deduplicação, tiers, tudo. Um método que
 * não tem sinal real cai no centro da nuvem de permutações; um que tivesse,
 * cairia na cauda. É a varredura da literatura aplicada com rigor: teste de
 * permutação > aproximação paramétrica quando a estatística tem estrutura
 * complexa — e é NEUTRO por desenho: mede vantagem, não a inventa.
 */

/** Réplicas de permutação por padrão. */
export const DEFAULT_PERMUTATION_REPLICATES = 200;

/** Alpha do veredito (bicaudal sobre a distribuição empírica). */
export const CALIBRATION_ALPHA = 0.05;

export interface NullCalibrationOptions {
  /** Réplicas de permutação; padrão `DEFAULT_PERMUTATION_REPLICATES`. */
  replicates?: number;
  /** Jogos gerados por concurso da janela de validação; padrão `MIN_GAMES`. */
  gamesPerContest?: number;
  /** Estratégia de trevos na +Milionária; padrão `ECONOMICO`. */
  trevoStrategy?: TrevoStrategy;
  /** Rodadas de Monte Carlo por dezena em `analyzeBacktest`. */
  simulationRounds?: number;
  /** Semente para reprodutibilidade; ausente usa `defaultRandom`. */
  seed?: number;
}

export interface NullCalibrationResult {
  replicates: number;
  gamesPerContest: number;
  /** Média de acertos por concurso observada com as performances reais. */
  observedMeanHits: number;
  /** Referência absoluta hipergeométrica (a mesma do relatório do backtest). */
  expectedMeanHits: number;
  /** Média e desvio-padrão POPULACIONAIS da estatística sob H0 (permutações). */
  nullMeanHits: { mean: number; stdDeviation: number };
  /** Taxa de prêmio observada com as performances reais. */
  observedPrizeRate: number;
  /** Média e desvio-padrão da taxa de prêmio sob H0. */
  nullPrizeRate: { mean: number; stdDeviation: number };
  /** P-valor empírico bicaudal da média de acertos. */
  empiricalPValueMeanHits: number;
  /** P-valor empírico bicaudal da taxa de prêmio. */
  empiricalPValuePrizeRate: number;
  /**
   * Veredito pelo teste da média de acertos (a estatística contínua com mais
   * poder; a taxa de prêmio empata em degraus e é reportada à parte):
   * `acima-do-nulo`/`abaixo-do-nulo` exigem p < 0,05.
   */
  verdict: 'consistente-com-o-acaso' | 'acima-do-nulo' | 'abaixo-do-nulo';
}

/**
 * Permuta os RÓTULOS das dezenas mantendo o multiconjunto de performances.
 *
 * Cada linha (peso, tier, hitCount, simulatedHitRate) continua existindo —
 * o que muda é QUAL dezena a recebe. Sob H0 todas as atribuições são
 * intercambiáveis, então as réplicas permutadas têm a mesma distribuição da
 * observada. A lista de dezenas originais é preservada (mesmo universo).
 */
export function permutePerformances(
  performances: readonly NumberPerformance[],
  random: RandomSource,
): NumberPerformance[] {
  const shuffled = shuffleArray(performances, random);
  const numbers = performances.map((row) => row.number).sort((a, b) => a - b);
  return shuffled.map((row, index) => ({ ...row, number: numbers[index] }));
}

/**
 * P-valor empírico bicaudal com o estimador aditivo conservador:
 * `(1 + #{réplicas tão extremas quanto a observada}) / (R + 1)`.
 *
 * O centro é a MÉDIA DAS RÉPLICAS (não o valor teórico): o teste compara a
 * cópia real com o que o próprio pipeline produz sob H0 — inclusive o ruído
 * Monte Carlo da análise — e não com um modelo idealizado.
 */
export function empiricalTwoSidedPValue(
  observed: number,
  nullValues: readonly number[],
): number {
  if (nullValues.length === 0) return 1;
  const center = nullValues.reduce((sum, value) => sum + value, 0) / nullValues.length;
  const deviation = Math.abs(observed - center);
  const extremes = nullValues.filter(
    (value) => Math.abs(value - center) >= deviation,
  ).length;
  return (1 + extremes) / (nullValues.length + 1);
}

/**
 * Executa a calibração: análise uma vez com os dados reais, depois R
 * réplicas do pipeline completo com rótulos permutados sobre a MESMA janela
 * de validação.
 *
 * @throws RangeError quando a janela de validação está vazia ou as réplicas
 *   não são inteiro ≥ 1.
 */
export function runNullCalibration(
  lottery: Lottery,
  trainingDraws: Draw[],
  validationDraws: Draw[],
  options: NullCalibrationOptions = {},
): NullCalibrationResult {
  if (validationDraws.length === 0) {
    throw new RangeError('Sem concursos após a data de corte — nada a calibrar');
  }
  const replicates = options.replicates ?? DEFAULT_PERMUTATION_REPLICATES;
  if (!Number.isInteger(replicates) || replicates < 1) {
    throw new RangeError(`Réplicas deve ser inteiro >= 1 (recebido: ${replicates})`);
  }

  const gamesPerContest = options.gamesPerContest ?? MIN_GAMES;
  const trevoStrategy = options.trevoStrategy ?? TrevoStrategy.ECONOMICO;
  const simulationRounds = options.simulationRounds ?? DEFAULT_SIMULATIONS_PER_NUMBER;
  const random: RandomSource =
    options.seed === undefined ? defaultRandom : createSeededRandom(options.seed);

  const performances = analyzeBacktest(trainingDraws, lottery, simulationRounds, { random });
  const trevoPerformances = analyzeTrevoBacktest(trainingDraws, lottery, simulationRounds, {
    random,
  });

  const observed = simulateValidation(
    lottery,
    performances,
    trevoPerformances,
    validationDraws,
    gamesPerContest,
    trevoStrategy,
    random,
  );
  const observedMeanHits = statisticsOf(observed.meanHitsPerContest).mean;
  const observedPrizeRate =
    observed.totalBets === 0 ? 0 : observed.prizeCount / observed.totalBets;

  const nullMeanHits: number[] = [];
  const nullPrizeRates: number[] = [];
  for (let replicate = 0; replicate < replicates; replicate++) {
    const permuted = permutePerformances(performances, random);
    // Trevos não têm rótulo a permutar quando a loteria não os tem — e o
    // gerador ignora a lista vazia com o fallback de pesos iguais.
    const permutedTrevos =
      trevoPerformances.length > 0 ? permutePerformances(trevoPerformances, random) : trevoPerformances;

    const replicateSimulation = simulateValidation(
      lottery,
      permuted,
      permutedTrevos,
      validationDraws,
      gamesPerContest,
      trevoStrategy,
      random,
    );
    nullMeanHits.push(statisticsOf(replicateSimulation.meanHitsPerContest).mean);
    nullPrizeRates.push(
      replicateSimulation.totalBets === 0
        ? 0
        : replicateSimulation.prizeCount / replicateSimulation.totalBets,
    );
  }

  const empiricalPValueMeanHits = empiricalTwoSidedPValue(observedMeanHits, nullMeanHits);
  const empiricalPValuePrizeRate = empiricalTwoSidedPValue(observedPrizeRate, nullPrizeRates);

  const nullMeanHitsSummary = statisticsOf(nullMeanHits);
  const nullPrizeRateSummary = statisticsOf(nullPrizeRates);

  const verdict: NullCalibrationResult['verdict'] =
    empiricalPValueMeanHits < CALIBRATION_ALPHA
      ? observedMeanHits > nullMeanHitsSummary.mean
        ? 'acima-do-nulo'
        : 'abaixo-do-nulo'
      : 'consistente-com-o-acaso';

  return {
    replicates,
    gamesPerContest,
    observedMeanHits,
    expectedMeanHits: expectedNumberHits(lottery),
    nullMeanHits: {
      mean: nullMeanHitsSummary.mean,
      stdDeviation: nullMeanHitsSummary.stdDeviation,
    },
    observedPrizeRate,
    nullPrizeRate: {
      mean: nullPrizeRateSummary.mean,
      stdDeviation: nullPrizeRateSummary.stdDeviation,
    },
    empiricalPValueMeanHits,
    empiricalPValuePrizeRate,
    verdict,
  };
}
