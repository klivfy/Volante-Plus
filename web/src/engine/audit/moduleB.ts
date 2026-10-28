import { Draw, Lottery } from '../../types/domain';
import { analyzeBacktest } from '../backtestAnalyzer';
import { bonferroniCorrection } from '../multipleComparisons';
import { classifyHits, lotteryRules } from '../prizeRules';
import { createSeededRandom, RandomSource } from '../random';
import { StrategyName, generateForStrategy, runStrategyBenchmark } from '../strategyBenchmark';
import { binomialExactTest } from '../statisticalTests';
import { anyPrizeProbability } from '../powerAnalysis';
import { DrawDataset, assertAuditable } from './provenance';

/**
 * Módulo B — método de teste de previsibilidade, pré-registrado.
 *
 * ## Por que isto é um arquivo, não uma escolha feita na hora de rodar
 *
 * A Regra 5 do protocolo veda qualquer alegação preditiva sem aprovação do
 * Módulo B. Uma "aprovação" decidida depois de olhar o resultado não é
 * aprovação — é justificar o que já se queria concluir. Este módulo fixa
 * ANTES de rodar sobre qualquer histórico real: qual estratégia é testada,
 * qual recorte é reservado para confirmação, e qual critério numérico conta
 * como "aprovado". A data disto é verificável pelo git, exatamente como
 * `preregistration.ts` (Módulo A).
 *
 * ## O método, em uma frase
 *
 * Separar cronologicamente uma fatia final do histórico (confirmação) nunca
 * usada para escolher estratégia; escolher a melhor estratégia só na fatia
 * restante (seleção), com correção de múltiplas comparações entre as 5
 * estratégias de `strategyBenchmark.ts`; e só declarar previsibilidade se a
 * vantagem da estratégia escolhida **replicar** na fatia de confirmação —
 * o mesmo desenho de A5 (replicação independente), aplicado a previsão em
 * vez de anomalia.
 *
 * `random-uniform` participa do benchmark como mais uma estratégia — é o
 * baseline que a Regra 5 exige comparação contra. Se nenhuma estratégia bate
 * `random-uniform` de forma significativa e replicada, o resultado esperado
 * ("nenhum método prevê nada") se confirma, e é reportado com o mesmo peso
 * de um resultado positivo.
 */

export const MODULE_B_VERSION = '1.0.0';

/** Fração final do histórico reservada para confirmação, nunca usada na seleção. */
export const CONFIRMATION_HOLDOUT_FRACTION = 0.2;

/** Dentro da fatia de seleção, fração usada como treino do benchmark. */
export const SELECTION_TRAINING_FRACTION = 0.7;

/** Cortes sucessivos rodados na fatia de confirmação (walk-forward). */
export const CONFIRMATION_STEP_MONTHS = 3;
export const CONFIRMATION_MIN_VALIDATION = 20;

/** Jogos simulados por concurso de validação, nas duas fases. */
export const GAMES_PER_CONTEST = 2;

/** Consistência mínima de sinal entre cortes de confirmação para aprovar. */
export const APPROVAL_MIN_CONSISTENCY = 0.8;

/** Semente do RNG — reprodutibilidade, igual ao Módulo A. */
export const MODULE_B_SEED = 91827;

export interface ModuleBReport {
  readonly moduleBVersion: string;
  readonly lottery: Lottery;
  readonly sourceLabel: string;
  readonly candidateStrategy: StrategyName | null;
  readonly candidateReason: string;
  readonly selection: {
    readonly contests: number;
    readonly correctedAlpha: number;
    readonly totalStrategiesCompared: number;
  };
  readonly confirmation: {
    readonly contests: number;
    readonly cuts: number;
    readonly significantAdvantageCuts: number;
    readonly consistency: number;
  } | null;
  /**
   * `true` somente quando a Regra 5 está satisfeita: candidato emergiu na
   * seleção, sobreviveu à correção de múltiplas comparações, E replicou na
   * confirmação com consistência >= `APPROVAL_MIN_CONSISTENCY`.
   */
  readonly approved: boolean;
  readonly conclusion: string;
}

function chronological(draws: readonly Draw[]): Draw[] {
  return [...draws].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Executa o Módulo B completo sobre um histórico oficial ou espelho.
 *
 * Reusa `runStrategyBenchmark` (seleção) e `generateForStrategy` (replay da
 * estratégia candidata na confirmação) sem reimplementar estatística nova —
 * o que muda aqui é só o desenho do split e o critério de aprovação.
 *
 * @throws NonAuditableDataError — mesma guarda de procedência do Módulo A;
 * previsibilidade não se testa sobre dado sintético ou não identificado.
 */
export function runModuleB(dataset: DrawDataset): ModuleBReport {
  assertAuditable(dataset);

  const { lottery } = dataset;
  const ordered = chronological(dataset.draws as Draw[]);
  const random: RandomSource = createSeededRandom(MODULE_B_SEED);

  const holdoutStart = Math.floor(ordered.length * (1 - CONFIRMATION_HOLDOUT_FRACTION));
  const selectionDraws = ordered.slice(0, holdoutStart);
  const confirmationDraws = ordered.slice(holdoutStart);

  const trainCut = Math.floor(selectionDraws.length * SELECTION_TRAINING_FRACTION);
  const selectionTraining = selectionDraws.slice(0, trainCut);
  const selectionValidation = selectionDraws.slice(trainCut);

  const benchmark = runStrategyBenchmark(selectionTraining, selectionValidation, lottery, {
    gamesPerContest: GAMES_PER_CONTEST,
    seed: MODULE_B_SEED,
  });

  // Candidato: estratégia com vantagem positiva (meanHits > esperado) e
  // significativa após Bonferroni na seleção. Se mais de uma, a de menor
  // p-valor — mas qualquer uma que passe já é o achado a confirmar.
  const advantaged = benchmark.results
    .map((result, index) => ({ result, significant: benchmark.bonferroni[index].significant }))
    .filter((entry) => entry.significant && entry.result.meanHits > entry.result.expectedMeanHits)
    .sort((a, b) => a.result.pValue - b.result.pValue);

  const totalStrategiesCompared = benchmark.results.length;
  const correctedAlpha = bonferroniCorrection(benchmark.results.map((r) => r.pValue)).correctedAlpha;

  if (advantaged.length === 0) {
    return {
      moduleBVersion: MODULE_B_VERSION,
      lottery,
      sourceLabel: dataset.sourceLabel,
      candidateStrategy: null,
      candidateReason:
        'Nenhuma estratégia superou random-uniform de forma significativa após ' +
        'Bonferroni na fatia de seleção — o resultado que a hipótese nula prevê.',
      selection: { contests: selectionDraws.length, correctedAlpha, totalStrategiesCompared },
      confirmation: null,
      approved: false,
      conclusion:
        'Nenhum candidato a método preditivo emergiu na seleção. Sob a Regra 5, ' +
        'nenhuma alegação preditiva é autorizada. O Módulo C deve rotular sua ' +
        'sugestão como aleatória, sem vantagem alegada.',
    };
  }

  const candidate = advantaged[0].result.strategy;

  // Confirmação: replay da estratégia candidata (só ela) em cortes sucessivos
  // da fatia reservada, cada corte com seu próprio teste binomial contra p0 —
  // o mesmo desenho de `multiCutWalkForward`, mas restrito à confirmação e a
  // uma única estratégia (a seleção já gastou o orçamento de comparações).
  // A auditoria conta prêmios só por dezenas, mas o baseline completo segue
  // valendo: as faixas da +Milionária cobrem todos os trevos para dezenas
  // premiadas, então P(algum prêmio) coincide com a soma só de dezenas.
  const p0 = anyPrizeProbability(lottery);
  const confirmationOrdered = chronological(confirmationDraws);
  const cuts: { pValue: number; advantageSign: number }[] = [];

  const stepMs = CONFIRMATION_STEP_MONTHS * 30 * 24 * 60 * 60 * 1000;
  const firstDate = confirmationOrdered[0]?.date;
  const lastDate = confirmationOrdered[confirmationOrdered.length - 1]?.date;

  if (firstDate && lastDate) {
    let cutoff = new Date(firstDate).getTime() + stepMs;
    const lastMs = new Date(lastDate).getTime();

    while (cutoff <= lastMs) {
      const cutoffStr = new Date(cutoff).toISOString().slice(0, 10);
      const trainingForPerf = [...selectionDraws, ...confirmationOrdered.filter((d) => d.date <= cutoffStr)];
      const validation = confirmationOrdered.filter(
        (d) => d.date > cutoffStr && d.date <= new Date(cutoff + stepMs).toISOString().slice(0, 10),
      );

      if (validation.length >= CONFIRMATION_MIN_VALIDATION) {
        const performances = analyzeBacktest(trainingForPerf, lottery, undefined, { random });
        let prizeCount = 0;
        let totalBets = 0;
        let hitsSum = 0;
        for (const draw of validation) {
          const games = generateForStrategy(
            candidate,
            lottery,
            performances,
            GAMES_PER_CONTEST,
            random,
          );
          for (const numbers of games) {
            const hits = numbers.filter((n) => draw.numbers.includes(n)).length;
            hitsSum += hits;
            totalBets++;
            if (classifyHits(lottery, hits) !== null) prizeCount++;
          }
        }
        if (totalBets > 0) {
          const { pValue } = binomialExactTest(prizeCount, totalBets, p0);
          const meanHits = hitsSum / totalBets;
          const expectedMeanHits = (lotteryRules(lottery).numbersDrawn * lotteryRules(lottery).numbersPerBet) / lotteryRules(lottery).numberUniverse;
          cuts.push({ pValue, advantageSign: meanHits > expectedMeanHits ? 1 : -1 });
        }
      }

      cutoff += stepMs;
    }
  }

  if (cuts.length === 0) {
    return {
      moduleBVersion: MODULE_B_VERSION,
      lottery,
      sourceLabel: dataset.sourceLabel,
      candidateStrategy: candidate,
      candidateReason:
        `${candidate} venceu na seleção, mas a fatia de confirmação é curta ` +
        `demais para nenhum corte de replicação válido.`,
      selection: { contests: selectionDraws.length, correctedAlpha, totalStrategiesCompared },
      confirmation: null,
      approved: false,
      conclusion:
        'Candidato sem confirmação possível — histórico insuficiente. Sob a ' +
        'Regra 5, nenhuma alegação preditiva é autorizada até haver dado ' +
        'suficiente para replicar.',
    };
  }

  const cutCorrectedAlpha = bonferroniCorrection(cuts.map((c) => c.pValue)).correctedAlpha;
  const significantCuts = cuts.filter((c) => c.pValue < cutCorrectedAlpha && c.advantageSign > 0);
  const consistency = significantCuts.length / cuts.length;
  const approved = consistency >= APPROVAL_MIN_CONSISTENCY;

  return {
    moduleBVersion: MODULE_B_VERSION,
    lottery,
    sourceLabel: dataset.sourceLabel,
    candidateStrategy: candidate,
    candidateReason: `${candidate} venceu random-uniform na seleção (Bonferroni sobre ${totalStrategiesCompared} estratégias).`,
    selection: { contests: selectionDraws.length, correctedAlpha, totalStrategiesCompared },
    confirmation: {
      contests: confirmationDraws.length,
      cuts: cuts.length,
      significantAdvantageCuts: significantCuts.length,
      consistency,
    },
    approved,
    conclusion: approved
      ? `Previsibilidade aprovada para ${candidate}: replicou em ${(consistency * 100).toFixed(0)}% ` +
        `dos cortes de confirmação (mínimo exigido: ${(APPROVAL_MIN_CONSISTENCY * 100).toFixed(0)}%). ` +
        `Isto autoriza o Módulo C a rotular sugestões com esse método — não autoriza ` +
        `nenhuma promessa de acerto: o teste mede vantagem relativa a random-uniform ` +
        `no histórico observado, não garantia futura.`
      : `Candidato ${candidate} não replicou na confirmação (consistência ` +
        `${(consistency * 100).toFixed(0)}%, abaixo do mínimo ${(APPROVAL_MIN_CONSISTENCY * 100).toFixed(0)}%). ` +
        `Sob a Regra 5, nenhuma alegação preditiva é autorizada.`,
  };
}
