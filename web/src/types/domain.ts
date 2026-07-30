/**
 * Enum das loterias suportadas pela aplicação.
 * Espelha com Lottery.kt do Android.
 */
export enum Lottery {
  MEGA_SENA = 'megasena',
  MAIS_MILIONARIA = 'maismilionaria',
}

/**
 * Concurso (sorteio) de uma loteria.
 * Inclui data, número do concurso, dezenas sorteadas e trevos (se aplicável).
 */
export interface Draw {
  lottery: Lottery;
  contestNumber: number;
  date: string;
  numbers: number[];
  trevos?: number[];
}

/**
 * Informações do próximo concurso.
 * Usadas para exibir data estimada e prêmio estimado na UI.
 */
export interface NextDrawInfo {
  lottery: Lottery;
  contestNumber: number;
  drawDate: string;
  estimatedPrize: number;
}

/**
 * Desempenho de uma dezena (1..60 ou 1..50).
 * Resultado da análise de backtesting: combina frequência real com simulação Monte Carlo.
 * weight: normalizado 0..1, TOP recebe ~0.6-1.0, MID ~0.3-0.6, LOW ~0.1-0.3
 * tier: classificação percentual após normalização (top 40%, mid 30%, low 30%)
 */
export interface NumberPerformance {
  number: number;
  hitCount: number;
  simulatedHitRate: number;
  weight: number;
  tier: 'top' | 'mid' | 'low';
}

/**
 * Jogo individual (6 números + 2 trevos opcionais).
 * Gerado pelo GameGenerator via seleção ponderada por NumberPerformance.
 */
export interface GeneratedGame {
  numbers: number[];
  trevoDuplas?: [number, number][];
}

/**
 * Lote de jogos gerados.
 * Agrupa N jogos com metadados: estratégia usada, snapshot das performances, pool de fechamento.
 */
export interface GameBatch {
  games: GeneratedGame[];
  lottery: Lottery;
  strategyLabel: string;
  performancesSnapshot?: NumberPerformance[];
  sourcePool?: number[];
}

/**
 * Configuração de um análise de backtesting.
 * Define: loteria, corte treino/validação, rounds de simulação Monte Carlo.
 */
export interface BacktestConfig {
  lottery: Lottery;
  cutoffDate?: string;
  simulationRounds: number;
}

/**
 * Relatório de backtesting.
 * Resultado completo da análise: estatísticas, distribuição de acertos, performances calculadas.
 */
export interface BacktestReport {
  trainingDraws: number;
  validationDraws: number;
  totalGames: number;
  totalBets: number;
  stats: {
    mean: number;
    variance: number;
    stdDeviation: number;
  };
  expectedMeanHits: number;
  prizeRate: number;
  prizeCount: number;
  hitDistribution: Record<number, number>;
  performances: NumberPerformance[];
  trevoPerformances: NumberPerformance[];
}

/**
 * Constante: mínimo de jogos por análise.
 * Limite inferior para controlar variância de Monte Carlo.
 */
export const MIN_GAMES = 2;

/**
 * Constante: máximo de jogos por análise.
 * Limite superior por praticidade na UI e computação.
 */
export const MAX_GAMES = 5;

/**
 * Estratégias de seleção de trevos (Mais Milionária).
 * - "EQUAL": peso uniforme (peso 1.0 para todos)
 * - "FREQUENCY": rankear por frequência histórica
 * - "BACKTEST_DRIVEN": usar desempenho de backtesting (padrão)
 */
export enum TrevoStrategy {
  EQUAL = 'equal',
  FREQUENCY = 'frequency',
  BACKTEST_DRIVEN = 'backtest_driven',
}

/**
 * Modo de geração de jogos.
 * - "MANUAL": usuário seleciona manualmente as dezenas
 * - "FECHAMENTO": gera todas as combinações de N dezenas (piscina)
 */
export enum GameMode {
  MANUAL = 'manual',
  FECHAMENTO = 'fechamento',
}
