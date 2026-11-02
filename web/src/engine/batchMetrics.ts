import { Lottery } from '../types/domain';
import { lotteryRules } from './prizeRules';

/**
 * Métricas de estrutura de um lote de jogos.
 *
 * A rodada de ampliação do motor trouxe a varredura da literatura de
 * *wheeling systems* / *balanced wheels* (cobertura, balanceamento e
 * sobreposição como propriedades mensuráveis do CONJUNTO de bilhetes — ver,
 * por todos, a taxonomia full/reduced/balanced de sistemas de roda). Este
 * módulo torna essas propriedades números exatos e verificáveis no motor:
 *
 * - **Cobertura**: quantas dezenas distintas o lote usa e, quando o lote vem
 *   de um pool (fechamento), qual fração dos pares do pool está contida em
 *   algum jogo do lote.
 * - **Balanceamento**: reutilização de dezenas e espalhamento por décadas.
 * - **Sobreposição**: interseção média/máxima entre jogos — a grandeza que a
 *   deduplicação absoluta do gerador zera e que os fechamentos por design
 *   NÃO zeram (coberturas C(v,k,t) compartilham dezenas de propósito).
 * - **Perfil de estrutura**: soma, paridade e dezenas consecutivas — os três
 *   filtros mais repetidos pela cultura popular de loteria, agora medíveis
 *   no lote real que o app gera.
 *
 * O QUE NÃO É: nenhuma destas métricas altera ou prevê a probabilidade de
 * premiação — cada jogo do universo continua equiprovável (teorema da
 * invariância). Elas medem a CONSTRUÇÃO do lote, não o futuro.
 */

/** Perfil estrutural completo de um lote. */
export interface BatchStructure {
  /** Jogos no lote. */
  gamesCount: number;
  /** Dezenas por jogo (todos os jogos têm o mesmo tamanho; senão lança). */
  numbersPerGame: number;
  /** Dezenas distintas usadas no lote inteiro. */
  distinctNumbers: number;
  /** Dezenas usadas mais de uma vez (0 em lotes com deduplicação absoluta). */
  reusedNumbers: number;
  /** Máximo de vezes que uma mesma dezena aparece no lote. */
  maxReuse: number;
  /** |A∩B| médio entre todos os pares de jogos distintos (0 se só há 1 jogo). */
  meanPairwiseOverlap: number;
  /** Maior |A∩B| entre pares de jogos (0 se só há 1 jogo). */
  maxPairwiseOverlap: number;
  /** Menor soma de dezena de um jogo do lote. */
  sumMin: number;
  /** Maior soma de dezena de um jogo do lote. */
  sumMax: number;
  /** Soma média dos jogos do lote. */
  sumMean: number;
  /** `parityProfile[o]` = nº de jogos com exatamente `o` dezenas ímpares. */
  parityProfile: number[];
  /** Jogos que contêm pelo menos um par de dezenas consecutivas. */
  gamesWithConsecutive: number;
  /** Distintas faixas de década (1-10, 11-20, ...) usadas, em média, por jogo. */
  meanDistinctDecades: number;
  /**
   * Fração dos pares C(pool,2) do pool fechado que está contida em algum jogo
   * do lote — só definida quando o chamador informa o pool (fechamento).
   */
  pairCoverageOfPool?: number;
}

/** Opções de `batchStructure`. */
export interface BatchStructureOptions {
  /**
   * Pool do fechamento, quando o lote veio de `generateClosure`: habilita
   * `pairCoverageOfPool`. Exige ≥ 2 dezenas — com menos que isso não existe
   * par a cobrir e a métrica seria vazia por construção.
   */
  pool?: readonly number[];
}

/**
 * Calcula o perfil estrutural exato de um lote de jogos.
 *
 * @param games jogos do lote, cada um com dezenas distintas e ordenadas (ou
 *   não — a função não exige ordem, mas exige dezenas distintas DENTRO de cada
 *   jogo e tamanhos iguais entre os jogos do lote).
 * @throws RangeError quando o lote está vazio, um jogo contém dezena repetida
 *   ou os jogos têm tamanhos diferentes (o motor nunca produz nenhum dos dois;
 *   se aparecer, é defeito a monte antes de medir).
 */
export function batchStructure(
  games: readonly number[][],
  options: BatchStructureOptions = {},
): BatchStructure {
  if (games.length === 0) {
    throw new RangeError('Lote vazio: não há estrutura a medir');
  }

  const numbersPerGame = games[0].length;
  if (numbersPerGame === 0) {
    throw new RangeError('Jogo sem dezenas: não há estrutura a medir');
  }
  for (const game of games) {
    if (game.length !== numbersPerGame) {
      throw new RangeError(
        `Jogos de tamanhos diferentes no lote (${numbersPerGame} e ${game.length})`,
      );
    }
    if (new Set(game).size !== game.length) {
      throw new RangeError('Dezena repetida dentro de um jogo');
    }
    const invalid = game.find((n) => !Number.isInteger(n) || n < 1);
    if (invalid !== undefined) {
      throw new RangeError(`Dezena inválida no lote: ${invalid}`);
    }
  }

  const usage = new Map<number, number>();
  for (const game of games) {
    for (const number of game) {
      usage.set(number, (usage.get(number) ?? 0) + 1);
    }
  }
  const uses = [...usage.values()];
  const distinctNumbers = usage.size;
  const reusedNumbers = uses.filter((count) => count > 1).length;
  const maxReuse = Math.max(...uses);

  const overlaps: number[] = [];
  for (let i = 0; i < games.length; i++) {
    for (let j = i + 1; j < games.length; j++) {
      overlaps.push(games[i].filter((n) => games[j].includes(n)).length);
    }
  }
  const meanPairwiseOverlap =
    overlaps.length === 0
      ? 0
      : overlaps.reduce((sum, overlap) => sum + overlap, 0) / overlaps.length;
  const maxPairwiseOverlap = overlaps.length === 0 ? 0 : Math.max(...overlaps);

  const sums = games.map((game) => game.reduce((sum, n) => sum + n, 0));
  const sumMin = Math.min(...sums);
  const sumMax = Math.max(...sums);
  const sumMean = sums.reduce((sum, s) => sum + s, 0) / sums.length;

  const parityProfile = Array.from({ length: numbersPerGame + 1 }, () => 0);
  let gamesWithConsecutive = 0;
  let decadeTotal = 0;
  for (const game of games) {
    const odds = game.filter((n) => n % 2 === 1).length;
    parityProfile[odds] += 1;
    if (hasConsecutivePair(game)) gamesWithConsecutive += 1;
    decadeTotal += new Set(game.map(decadeBucket)).size;
  }

  const structure: BatchStructure = {
    gamesCount: games.length,
    numbersPerGame,
    distinctNumbers,
    reusedNumbers,
    maxReuse,
    meanPairwiseOverlap,
    maxPairwiseOverlap,
    sumMin,
    sumMax,
    sumMean,
    parityProfile,
    gamesWithConsecutive,
    meanDistinctDecades: decadeTotal / games.length,
  };

  if (options.pool !== undefined) {
    structure.pairCoverageOfPool = poolPairCoverage(games, options.pool);
  }
  return structure;
}

/** Faixa de década de uma dezena: 1-10 → 1, 11-20 → 2, ... */
function decadeBucket(number: number): number {
  return Math.ceil(number / 10);
}

/** `true` quando o jogo contém duas dezenas consecutivas (ex.: 34 e 35). */
export function hasConsecutivePair(numbers: readonly number[]): boolean {
  const sorted = [...numbers].sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === sorted[i - 1] + 1) return true;
  }
  return false;
}

/**
 * Fração dos pares do pool contida em algum jogo do lote.
 *
 * Para um fechamento C(v, k, t) com t ≥ 2, cobrir todos os subconjuntos de
 * tamanho `t` implica cobrir TODOS os pares (todo par se estende a um t-subconjunto),
 * então a métrica satura em 1 quando t ≥ 2 — a leitura interessante fica para
 * lotes do gerador comum dentro de um pool, onde a cobertura de pares depende
 * de como o sorteio se espalhou.
 */
function poolPairCoverage(games: readonly number[][], pool: readonly number[]): number {
  if (pool.length < 2) {
    throw new RangeError('Pool precisa de ao menos 2 dezenas para cobertura de pares');
  }
  const poolSet = new Set(pool);
  const covered = new Set<string>();
  for (const game of games) {
    const inPool = game.filter((n) => poolSet.has(n));
    for (let i = 0; i < inPool.length; i++) {
      for (let j = i + 1; j < inPool.length; j++) {
        // Chave canônica min-max: o jogo não é obrigado a vir ordenado, e
        // "7-5" contando como par distinto de "5-7" inflaria a cobertura
        // acima de 1 (bug apanhado pelo teste de saturação do pool).
        const a = Math.min(inPool[i], inPool[j]);
        const b = Math.max(inPool[i], inPool[j]);
        covered.add(`${a}-${b}`);
      }
    }
  }
  const totalPairs = (pool.length * (pool.length - 1)) / 2;
  return covered.size / totalPairs;
}

/**
 * Faixa de soma central de um jogo uniforme: média ± 1 desvio-padrão da soma
 * de uma amostra simples sem reposição de tamanho k de 1..N.
 *
 * A soma de um jogo uniforme tem média k·(N+1)/2 e variância k·(N+1)·(N−k)/12
 * (variância da população discreta uniforme (N²−1)/12 com correção de
 * população finita (N−k)/(N−1); simplifica exatamente para esta forma).
 * É a formalização do filtro "jogue somas na faixa central" que a cultura
 * popular repete: a faixa onde ~68% dos jogos uniformes caem.
 */
export function gameSumWindow(lottery: Lottery): { min: number; max: number } {
  const rules = lotteryRules(lottery);
  const { numberUniverse: n, numbersPerBet: k } = rules;
  const mean = (k * (n + 1)) / 2;
  const sd = Math.sqrt((k * (n + 1) * (n - k)) / 12);
  return { min: Math.round(mean - sd), max: Math.round(mean + sd) };
}

/**
 * Faixa modal de paridade: contagens de ímpares que excluem apenas os extremos
 * — `[⌊k/2⌋−1, ⌈k/2⌉+1]`. Para k = 6 aceita 2..4 ímpares (exclui 0, 1, 5, 6);
 * para k = 5 aceita 1..4 (exclui 0 e 5). É a versão canônica do conselho
 * "equilibre pares e ímpares".
 */
export function parityWindow(lottery: Lottery): { min: number; max: number } {
  const k = lotteryRules(lottery).numbersPerBet;
  return { min: Math.floor(k / 2) - 1, max: Math.ceil(k / 2) + 1 };
}
