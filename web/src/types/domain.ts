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
  /**
   * O último concurso acumulou (ninguém acertou a faixa principal), segundo a
   * própria API (`acumulou` na de terceiros, `acumulado` na oficial). Ausente
   * quando a API não informa — e então a tela não afirma nada.
   */
  accumulated?: boolean;
}

/**
 * Faixa de desempenho de uma dezena, por percentil do peso:
 * 40% superiores `top`, 30% seguintes `mid`, 30% restantes `low`.
 */
export type PerformanceTier = 'top' | 'mid' | 'low';

/**
 * Desempenho de uma dezena (1..60 ou 1..50).
 * Resultado da análise de backtesting: combina frequência real com simulação Monte Carlo.
 * weight: normalizado 0..1 — o melhor da janela vale 1,0 e o resto é proporcional.
 * tier: classificação percentual após normalização (top 40%, mid 30%, low 30%)
 */
export interface NumberPerformance {
  number: number;
  hitCount: number;
  simulatedHitRate: number;
  weight: number;
  tier: PerformanceTier;
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
  /** Contrato do fechamento por cobertura, quando o lote veio de `generateClosure`. */
  closure?: {
    /** Acertos garantidos em algum jogo se o sorteio trouxer tantas dezenas do pool. */
    guarantee: number;
    poolSize: number;
    /** Custo total em reais, ao preço de referência da aposta simples. */
    cost: number;
  };
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
export const MAX_GAMES = 4;

/**
 * Estratégia de cobertura dos trevos (exclusivo da +Milionária).
 * - `ECONOMICO`: 1 dupla de trevos por jogo
 * - `COBERTURA_TOTAL`: as 15 duplas possíveis, C(6,2)
 */
export enum TrevoStrategy {
  ECONOMICO = 'economico',
  COBERTURA_TOTAL = 'cobertura_total',
}

/**
 * Modo de geração de jogos.
 * - `JOGOS_AVULSOS`: sorteio sobre todo o universo da loteria
 * - `FECHAMENTO`: sorteio restrito às dezenas marcadas no volante
 */
export enum GameMode {
  JOGOS_AVULSOS = 'jogos_avulsos',
  FECHAMENTO = 'fechamento',
}
