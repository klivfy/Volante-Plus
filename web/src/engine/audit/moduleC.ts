import { GeneratedGame, Lottery, MAX_GAMES, MIN_GAMES } from '../../types/domain';
import { NumberPerformance } from '../../types/domain';
import { defaultRandom, RandomSource } from '../random';
import { generateForStrategy, StrategyName } from '../strategyBenchmark';
import { ModuleBReport } from './moduleB';

/**
 * Módulo C — sugestão de jogos, condicionada à aprovação do Módulo B.
 *
 * ## Por que o orçamento vem daqui, não do usuário
 *
 * A especificação original ("C2. Respeitar o orçamento informado") previa
 * receber um valor em reais do usuário — mas esse valor nunca chegou, e
 * orçamento em dinheiro depende do preço da aposta, que muda por modalidade
 * e no tempo. Fixar o orçamento em **quantidade de jogos simples**, dentro
 * dos limites que o próprio app já usa (`MIN_GAMES`..`MAX_GAMES`), evita essa
 * dependência e mantém o método determinado agora, não deixado em aberto.
 * `DEFAULT_BUDGET_GAMES` é o piso do app (o mesmo de um lote comum) — quem
 * chama pode pedir mais, até `MAX_GAMES`.
 *
 * ## O que a Regra 5 exige daqui
 *
 * Nenhuma sugestão pode se apresentar como "melhor que aleatório" sem que
 * `ModuleBReport.approved` seja `true` para a mesma loteria. Isso não é uma
 * checagem de UI — é a assinatura de `suggestGames`, que recebe o relatório
 * do Módulo B como argumento obrigatório e decide a estratégia e o texto a
 * partir dele. Não há caminho de código que gere uma sugestão "premium" sem
 * ter passado por ali.
 */

export const MODULE_C_VERSION = '1.0.0';

/** Jogos por lote quando o chamador não pede uma quantidade específica. */
export const DEFAULT_BUDGET_GAMES = MIN_GAMES;

export const NO_CLAIM_DISCLAIMER =
  'Sugestão sem alegação preditiva: nenhuma estratégia testada superou o ' +
  'sorteio uniforme de forma significativa e replicada (Módulo B). Os jogos ' +
  'abaixo usam o mesmo motor do app (peso por desempenho histórico), que a ' +
  'teoria e os testes deste laboratório preveem ser estatisticamente ' +
  'equivalente a um sorteio aleatório — não superior a ele.';

function approvedDisclaimer(strategy: StrategyName, consistency: number): string {
  return (
    `Sugestão sob método aprovado pelo Módulo B (${strategy}): vantagem sobre ` +
    `sorteio uniforme replicou em ${(consistency * 100).toFixed(0)}% dos cortes ` +
    `de confirmação, sobre o histórico auditado. Isto reporta uma vantagem ` +
    `relativa medida no passado — não uma garantia de resultado futuro, e não ` +
    `dispensa a leitura do Módulo A (auditoria de honestidade do sorteio).`
  );
}

export interface SuggestionOptions {
  /** Quantidade de jogos, `MIN_GAMES`..`MAX_GAMES`. Padrão `DEFAULT_BUDGET_GAMES`. */
  budgetGames?: number;
  random?: RandomSource;
}

export interface ModuleCSuggestion {
  readonly moduleCVersion: string;
  readonly lottery: Lottery;
  readonly budgetGames: number;
  readonly strategyUsed: StrategyName;
  readonly predictiveClaim: boolean;
  readonly disclaimer: string;
  readonly games: readonly GeneratedGame[];
}

/**
 * Sugere um lote de jogos dentro do orçamento (Regra C2, redefinida acima), a
 * partir do desempenho histórico e do veredito do Módulo B para a mesma
 * loteria.
 *
 * @throws RangeError quando `budgetGames` está fora de `MIN_GAMES`..`MAX_GAMES`
 * ou `moduleB.lottery` não bate com `lottery`.
 */
export function suggestGames(
  lottery: Lottery,
  performances: NumberPerformance[],
  moduleB: ModuleBReport,
  options: SuggestionOptions = {},
): ModuleCSuggestion {
  if (moduleB.lottery !== lottery) {
    throw new RangeError(
      `Relatório do Módulo B é de ${moduleB.lottery}, sugestão pedida para ${lottery}.`,
    );
  }

  const budgetGames = options.budgetGames ?? DEFAULT_BUDGET_GAMES;
  if (!Number.isInteger(budgetGames) || budgetGames < MIN_GAMES || budgetGames > MAX_GAMES) {
    throw new RangeError(
      `Orçamento deve estar em ${MIN_GAMES}..${MAX_GAMES} jogos (recebido: ${budgetGames})`,
    );
  }

  const random = options.random ?? defaultRandom;
  const predictiveClaim = moduleB.approved && moduleB.candidateStrategy !== null;
  const strategyUsed: StrategyName = predictiveClaim
    ? (moduleB.candidateStrategy as StrategyName)
    : 'tier-weighted';

  const numbers = generateForStrategy(strategyUsed, lottery, performances, budgetGames, random);
  const games: GeneratedGame[] = numbers.map((n) => ({ numbers: n }));

  const disclaimer = predictiveClaim
    ? approvedDisclaimer(strategyUsed, moduleB.confirmation?.consistency ?? 0)
    : NO_CLAIM_DISCLAIMER;

  return {
    moduleCVersion: MODULE_C_VERSION,
    lottery,
    budgetGames,
    strategyUsed,
    predictiveClaim,
    disclaimer,
    games,
  };
}
