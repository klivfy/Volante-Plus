import { Lottery } from '../types/domain';
import { binomial, prizeProbabilities } from './hypergeometric';
import { isPrized, lotteryRules } from './prizeRules';

/**
 * Probabilidade de prêmio na escala do LOTE, não do jogo isolado.
 *
 * `prizeProbabilities` (hypergeometric.ts) responde "qual a chance de UM jogo
 * simples premiar". O app, porém, gera LOTES de 2 a 4 jogos com deduplicação
 * absoluta de dezenas — e a chance de AO MENOS UM jogo premiar não é
 * `1 - (1-p)^G`: os eventos compartilham o mesmo sorteio e são dependentes.
 * Este módulo calcula o valor EXATO, por enumeração de partições do sorteio.
 *
 * MÉTODO (células de Venn): cada dezena do universo pertence a um subconjunto
 * específico de jogos (máscara). O sorteio de K dezenas vira uma distribuição
 * de contagens `x_c` pelas células — hipergeométrica multivariada — e os
 * acertos de cada jogo são somas das células que o contêm. Enumerar todas as
 * partições possíveis com peso Π C(tamanho_c, x_c) / C(N, K) é exato e barato
 * (K ≤ 6, G ≤ 4, ≤ 2^G células). Na +Milionária o lado dos trevos entra como
 * fator condicional: o sorteio extrai 1 dupla de trevos entre C(6,2) = 15
 * possibilidades, todas enumeráveis.
 *
 * HONESTIDADE (a mesma de sempre): essas probabilidades são o TETO do que
 * qualquer estratégia alcança — o gerador entrega exatamente o teto (verificado
 * por Monte Carlo em `assertiveness/cli.ts`), e nenhuma seleção de dezenas
 * sobe o teto. O que a estrutura do lote controla é a variância: jogos sem
 * sobreposição maximizam P(pelo menos um prêmio) para um orçamento fixo.
 */

/** Número máximo de jogos por lote, espelhado de `domain.ts` (MAX_GAMES). */
const MAX_BATCH_GAMES = 4;

/** Célula de Venn: dezenas contidas exatamente nos jogos da máscara. */
interface VennCell {
  mask: number;
  size: number;
}

/** Distribui as dezenas 1..N pelas células de Venn dos jogos. */
function vennCells(
  games: readonly (readonly number[])[],
  universeSize: number,
): VennCell[] {
  const sizeByMask = new Map<number, number>();
  for (let number = 1; number <= universeSize; number++) {
    let mask = 0;
    for (let gameIndex = 0; gameIndex < games.length; gameIndex++) {
      if (games[gameIndex].includes(number)) mask |= 1 << gameIndex;
    }
    sizeByMask.set(mask, (sizeByMask.get(mask) ?? 0) + 1);
  }
  return [...sizeByMask.entries()].map(([mask, size]) => ({ mask, size }));
}

/** Partições exatas de K dezenas sorteadas pelas células, com peso exato. */
function enumerateSplits(
  cells: readonly VennCell[],
  drawn: number,
  gamesCount: number,
  visit: (gameHits: number[], weight: number) => void,
): void {
  const suffixCapacity = new Array<number>(cells.length + 1).fill(0);
  for (let i = cells.length - 1; i >= 0; i--) {
    suffixCapacity[i] = suffixCapacity[i + 1] + cells[i].size;
  }

  const hits = new Array<number>(gamesCount).fill(0);

  const recurse = (cellIndex: number, remaining: number, weight: number): void => {
    if (cellIndex === cells.length) {
      if (remaining === 0) visit(hits, weight);
      return;
    }
    const { mask, size } = cells[cellIndex];
    const maxTake = Math.min(size, remaining);
    const minTake = Math.max(0, remaining - suffixCapacity[cellIndex + 1]);
    for (let take = minTake; take <= maxTake; take++) {
      for (let i = 0; i < gamesCount; i++) {
        if (mask & (1 << i)) hits[i] += take;
      }
      recurse(cellIndex + 1, remaining - take, weight * binomial(size, take));
      for (let i = 0; i < gamesCount; i++) {
        if (mask & (1 << i)) hits[i] -= take;
      }
    }
  };

  recurse(0, drawn, 1);
}

/**
 * Fator do lado dos trevos: P(nenhum jogo do conjunto S acerta trevo), dado
 * que cada jogo de S precisa de trevo para premiar (ex.: faixa 10 = 2+1).
 * Enumera as C(6,2) = 15 duplas que o sorteio pode extrair — exato por
 * construção, independente de como as duplas dos jogos se sobrepõem.
 */
function trevoAvoidanceProbability(
  unionsByGame: readonly (readonly number[])[],
  constrainedMask: number,
): number {
  const universe = 6;
  const allPairs: number[][] = [];
  for (let a = 1; a <= universe; a++) {
    for (let b = a + 1; b <= universe; b++) allPairs.push([a, b]);
  }
  let satisfied = 0;
  for (const pair of allPairs) {
    let ok = true;
    for (let i = 0; i < unionsByGame.length && ok; i++) {
      if (!(constrainedMask & (1 << i))) continue;
      const union = unionsByGame[i];
      if (union.some((trevo) => trevo === pair[0] || trevo === pair[1])) ok = false;
    }
    if (ok) satisfied++;
  }
  return satisfied / allPairs.length;
}

/** Média de `trevoAvoidanceProbability` sobre configurações de duplas por jogo. */
function marginalTrevoAvoidance(
  constrainedCount: number,
  distinctDuplas: boolean,
): number {
  if (constrainedCount === 0) return 1;
  const allPairs: number[][] = [];
  for (let a = 1; a <= 6; a++) {
    for (let b = a + 1; b <= 6; b++) allPairs.push([a, b]);
  }
  let total = 0;
  let configs = 0;

  const evaluate = (chosen: number[][]): void => {
    const covered = new Set<number>();
    for (const dupla of chosen) dupla.forEach((trevo) => covered.add(trevo));
    const free = 6 - covered.size;
    total += (free >= 2 ? binomial(free, 2) : 0) / binomial(6, 2);
    configs++;
  };

  if (distinctDuplas) {
    const combo: number[][] = [];
    const walk = (start: number): void => {
      if (combo.length === constrainedCount) {
        evaluate(combo);
        return;
      }
      for (let i = start; i < allPairs.length; i++) {
        combo.push(allPairs[i]);
        walk(i + 1);
        combo.pop();
      }
    };
    walk(0);
  } else {
    const indices = new Array<number>(constrainedCount).fill(0);
    while (true) {
      evaluate(indices.map((i) => allPairs[i]));
      let cursor = constrainedCount - 1;
      while (cursor >= 0 && indices[cursor] === allPairs.length - 1) cursor--;
      if (cursor < 0) break;
      indices[cursor]++;
      for (let i = cursor + 1; i < constrainedCount; i++) indices[i] = 0;
    }
  }
  return total / configs;
}

/**
 * P(nenhum jogo premiado) para um lote CONCRETO de jogos.
 *
 * @param games jogos do lote (podem se sobrepor — células de Venn tratam
 *   qualquer sobreposição; lotes do gerador são disjuntos por deduplicação).
 * @param trevoDuplas duplas de trevo de cada jogo (só +Milionária; cada jogo
 *   carrega 1 dupla no ECONÔMICO ou as 15 da cobertura total).
 */
export function batchNoPrizeProbability(
  lottery: Lottery,
  games: readonly (readonly number[])[],
  trevoDuplas?: ReadonlyArray<readonly (readonly [number, number])[]>,
): number {
  if (games.length === 0) {
    throw new RangeError('O lote precisa de pelo menos 1 jogo');
  }
  const rules = lotteryRules(lottery);
  const usesTrevos = rules.trevoUniverse > 0;
  if (usesTrevos && trevoDuplas === undefined) {
    throw new RangeError(
      'Lotes da +Milionária exigem as duplas de trevo de cada jogo',
    );
  }
  if (!usesTrevos && trevoDuplas !== undefined) {
    throw new RangeError('Esta modalidade não usa trevos');
  }
  if (trevoDuplas !== undefined && trevoDuplas.length !== games.length) {
    throw new RangeError('Cada jogo precisa da sua lista de duplas de trevo');
  }

  const unionsByGame: number[][] = games.map((_, gameIndex) => {
    const duplas = (trevoDuplas ?? [])[gameIndex] ?? [];
    const union = new Set<number>();
    for (const [a, b] of duplas) {
      if (!Number.isInteger(a) || !Number.isInteger(b) || a < 1 || a > rules.trevoUniverse || b < 1 || b > rules.trevoUniverse || a === b) {
        throw new RangeError(
          `Dupla de trevo inválida no jogo ${gameIndex + 1} (universo 1..${rules.trevoUniverse})`,
        );
      }
      union.add(a);
      union.add(b);
    }
    return [...union];
  });

  const cells = vennCells(games, rules.numberUniverse);
  const denom = binomial(rules.numberUniverse, rules.numbersDrawn);
  let noPrize = 0;

  enumerateSplits(cells, rules.numbersDrawn, games.length, (gameHits, weight) => {
    let constrainedMask = 0;
    for (let i = 0; i < games.length; i++) {
      if (isPrized(lottery, gameHits[i], 0)) return; // prêmio certo, independe do trevo
      if (isPrized(lottery, gameHits[i], 1)) constrainedMask |= 1 << i;
    }
    const trevoFactor =
      constrainedMask === 0
        ? 1
        : trevoAvoidanceProbability(unionsByGame, constrainedMask);
    noPrize += (weight / denom) * trevoFactor;
  });

  return Math.min(1, Math.max(0, noPrize));
}

/** P(pelo menos um jogo do lote premiar) para um lote concreto. */
export function batchAnyPrizeProbability(
  lottery: Lottery,
  games: readonly (readonly number[])[],
  trevoDuplas?: ReadonlyArray<readonly (readonly [number, number])[]>,
): number {
  return 1 - batchNoPrizeProbability(lottery, games, trevoDuplas);
}

/**
 * Chances EXATAS de um lote CONCRETO — os jogos que estão em tela, um a um.
 *
 * É o complemento necessário do `disjointBatchOdds`: o modelo marginal descreve
 * o lote-pattern do gerador (jogos disjuntos canônicos), mas a UI precisa medir
 * o lote REAL, inclusive lotes de fechamento, cujos jogos se SOBREPÕEM dentro
 * do pool — e sobreposição reduz P(pelo menos um prêmio) em relação ao lote
 * disjunto. As células de Venn de `batchNoPrizeProbability` tratam qualquer
 * configuração, então o número aqui é o valor exato do lote exibido, não uma
 * aproximação.
 *
 * Na +Milionária o contrafactual de duplas repetidas (campo
 * `anyPrizeProbabilityRepeatedDuplas`) fica `undefined`: ele é uma marginal
 * sobre configurações de duplas e não tem análogo exato para duplas concretas —
 * inventá-lo violaria o padrão de honestidade do módulo.
 */
export function concreteBatchOdds(
  lottery: Lottery,
  games: readonly (readonly number[])[],
  trevoDuplas?: ReadonlyArray<readonly (readonly [number, number])[]>,
): BatchOdds {
  if (games.length < 1 || games.length > MAX_BATCH_GAMES) {
    throw new RangeError(
      `O lote precisa de 1..${MAX_BATCH_GAMES} jogos (recebido: ${games.length})`,
    );
  }
  const anyPrize = batchAnyPrizeProbability(lottery, games, trevoDuplas);
  return {
    gamesCount: games.length,
    noPrizeProbability: 1 - anyPrize,
    anyPrizeProbability: anyPrize,
    // Linearidade da esperança: vale exatamente, com ou sem sobreposição.
    expectedPrizedGames: games.length * singleBetAnyPrizeProbability(lottery),
  };
}

/** Chances do lote-modelo do app: G jogos disjuntos (+ duplas distintas na +Mili). */
export interface BatchOdds {
  gamesCount: number;
  /** P(pelo menos um prêmio no lote). */
  anyPrizeProbability: number;
  /** P(nenhum prêmio no lote). */
  noPrizeProbability: number;
  /** Número esperado de jogos premiados = G × p(jogo simples) — exato por linearidade. */
  expectedPrizedGames: number;
  /**
   * +Milionária: o mesmo `anyPrizeProbability` sob o modelo antigo (duplas
   * podem repetir entre jogos) — quantifica o ganho da deduplicação de duplas.
   * `undefined` nas modalidades sem trevo.
   */
  anyPrizeProbabilityRepeatedDuplas?: number;
}

/** P(um jogo simples qualquer premiar) — soma das faixas, todas exclusivas. */
export function singleBetAnyPrizeProbability(lottery: Lottery): number {
  const probabilities = prizeProbabilities(lottery);
  return Object.values(probabilities).reduce((sum, p) => sum + p, 0);
}

/**
 * Chances exatas do lote-modelo do gerador: `gamesCount` jogos SEM sobreposição
 * de dezenas (a deduplicação absoluta do `gameGenerator`) e, na +Milionária,
 * duplas de trevo distintas entre jogos (marginal sobre as C(15,G) configurações).
 */
export function disjointBatchOdds(lottery: Lottery, gamesCount: number): BatchOdds {
  if (!Number.isInteger(gamesCount) || gamesCount < 1 || gamesCount > MAX_BATCH_GAMES) {
    throw new RangeError(
      `gamesCount deve estar em 1..${MAX_BATCH_GAMES} (recebido: ${gamesCount})`,
    );
  }
  const rules = lotteryRules(lottery);
  if (gamesCount * rules.numbersPerBet > rules.numberUniverse) {
    throw new RangeError(
      `${gamesCount} jogos de ${rules.numbersPerBet} dezenas não cabem no universo de ${rules.numberUniverse}`,
    );
  }

  const canonical: number[][] = Array.from({ length: gamesCount }, (_, i) =>
    Array.from({ length: rules.numbersPerBet }, (_, j) => i * rules.numbersPerBet + j + 1),
  );
  const cells = vennCells(canonical, rules.numberUniverse);
  const denom = binomial(rules.numberUniverse, rules.numbersDrawn);
  const usesTrevos = rules.trevoUniverse > 0;

  // Marginal do lado dos trevos por quantidade de jogos dependentes de trevo.
  const marginalDistinct = new Map<number, number>();
  const marginalRepeated = new Map<number, number>();
  if (usesTrevos) {
    for (let m = 0; m <= gamesCount; m++) {
      marginalDistinct.set(m, marginalTrevoAvoidance(m, true));
      marginalRepeated.set(m, marginalTrevoAvoidance(m, false));
    }
  }

  let noPrize = 0;
  let noPrizeRepeated = 0;
  enumerateSplits(cells, rules.numbersDrawn, gamesCount, (gameHits, weight) => {
    let constrainedMask = 0;
    for (let i = 0; i < gamesCount; i++) {
      if (isPrized(lottery, gameHits[i], 0)) return;
      if (isPrized(lottery, gameHits[i], 1)) constrainedMask |= 1 << i;
    }
    const constrainedCount = constrainedMask === 0 ? 0 : popcount(constrainedMask);
    noPrize += (weight / denom) * (marginalDistinct.get(constrainedCount) ?? 1);
    noPrizeRepeated += (weight / denom) * (marginalRepeated.get(constrainedCount) ?? 1);
  });

  const single = singleBetAnyPrizeProbability(lottery);
  return {
    gamesCount,
    noPrizeProbability: noPrize,
    anyPrizeProbability: 1 - noPrize,
    expectedPrizedGames: gamesCount * single,
    ...(usesTrevos ? { anyPrizeProbabilityRepeatedDuplas: 1 - noPrizeRepeated } : {}),
  };
}

function popcount(mask: number): number {
  let count = 0;
  while (mask) {
    mask &= mask - 1;
    count++;
  }
  return count;
}

/**
 * Núcleo geométrico da função acima, exposto para lotes CONCRETOS: dado o
 * P(nenhum prêmio) de qualquer lote (ex.: `concreteBatchOdds` de um lote em
 * tela), quantos concursos independentes — repetindo o mesmo lote — atingem o
 * alvo de "pelo menos um prêmio mínimo". Fórmula exata: n = ⌈log(1-alvo) / log(P-sem-prêmio)⌉.
 */
export function concursosForNoPrize(
  noPrizeProbability: number,
  targetProbability: number,
): number {
  if (!Number.isFinite(noPrizeProbability) || noPrizeProbability <= 0 || noPrizeProbability >= 1) {
    throw new RangeError('noPrizeProbability deve estar estritamente entre 0 e 1');
  }
  if (!Number.isFinite(targetProbability) || targetProbability <= 0 || targetProbability >= 1) {
    throw new RangeError('targetProbability deve estar estritamente entre 0 e 1');
  }
  return Math.max(
    1,
    Math.ceil(Math.log(1 - targetProbability) / Math.log(noPrizeProbability)),
  );
}

/**
 * Quantos CONCURSOS independentes são necessários para atingir a probabilidade
 * alvo de "pelo menos um prêmio mínimo", jogando o lote-modelo de `gamesCount`
 * jogos em cada concurso. Delegação direta ao núcleo `concursosForNoPrize`.
 */
export function concursosNeededForTarget(
  lottery: Lottery,
  gamesCount: number,
  targetProbability: number,
): number {
  const { noPrizeProbability } = disjointBatchOdds(lottery, gamesCount);
  return concursosForNoPrize(noPrizeProbability, targetProbability);
}
