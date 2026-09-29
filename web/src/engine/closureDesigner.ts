import { Draw, GameBatch, GeneratedGame, Lottery } from '../types/domain';
import { hasTrevos, isPrized, lotteryRules } from './prizeRules';
import { defaultRandom, RandomSource } from './random';
import { unpopularityPenalty } from './unpopularity';

/**
 * Fechamento por cobertura combinatória (covering design C(v, k, t)).
 *
 * ## O contrato
 * Dado um pool de `v` dezenas marcadas, devolve jogos de `k` dezenas do pool
 * tais que **todo** subconjunto de `t` dezenas do pool está contido em pelo
 * menos um jogo. Logo: se o sorteio contiver `t` ou mais dezenas do pool, algum
 * jogo do fechamento acerta pelo menos `t`. É uma garantia matemática, e
 * `verifyClosure` a confere exaustivamente.
 *
 * ## O que ele NÃO faz
 * Não aumenta a chance de as dezenas do pool saírem — o teorema da
 * invariância continua valendo. Só converte acertos dentro do pool em prêmio
 * de forma garantida, ao custo de mais jogos. O sorteio aleatório dentro do
 * pool (o "fechamento" anterior) não dava garantia nenhuma.
 *
 * ## Construção
 * Guloso de set cover, exato sobre o universo alvo: a cada passo escolhe o
 * jogo que cobre mais subconjuntos ainda descobertos, `closureAttempts`
 * vezes com desempate aleatório (semente fixa pelo pool: resultado
 * reproduzível), seguido de poda de jogos redundantes. Fica com o menor
 * fechamento; entre iguais, o menos popular — mesma lógica da estratégia
 * `UNPOPULAR`, sem custo algum na garantia. Não é ótimo (o problema é
 * NP-difícil), mas a cobertura é completa por construção e verificada por
 * `verifyClosure`. A contagem de cobertura incremental deixa pools de 15
 * dezenas rápidos (o guloso de `wheelingSystems.ts` explodia acima de 12).
 */

/** Preço da aposta simples, em reais. Valor de referência; a Caixa pode reajustá-lo. */
export const SIMPLE_BET_PRICE_BRL = 6;

/** Pool máximo do desenho (bitmask de 15 posições). */
const MAX_POOL = 15;

export interface ClosureDesign {
  /** Jogos, cada um com dezenas reais do pool, em ordem crescente. */
  games: number[][];
  /** Garantia `t`: acertos mínimos assegurados em algum jogo. */
  guarantee: number;
  poolSize: number;
}

/** Máscaras de todos os subconjuntos de `k` posições entre `0..v-1`. */
function combinationMasks(v: number, k: number): number[] {
  const masks: number[] = [];
  const walk = (start: number, left: number, mask: number): void => {
    if (left === 0) {
      masks.push(mask);
      return;
    }
    for (let i = start; i <= v - left; i++) walk(i + 1, left - 1, mask | (1 << i));
  };
  walk(0, k, 0);
  return masks;
}

/** Subconjuntos de tamanho `t` de uma máscara (as posições marcadas). */
function subMasks(mask: number, t: number): number[] {
  const bits: number[] = [];
  for (let i = 0; i < MAX_POOL; i++) if (mask & (1 << i)) bits.push(i);
  const out: number[] = [];
  const walk = (start: number, left: number, acc: number): void => {
    if (left === 0) {
      out.push(acc);
      return;
    }
    for (let i = start; i <= bits.length - left; i++) walk(i + 1, left - 1, acc | (1 << bits[i]));
  };
  walk(0, t, 0);
  return out;
}

/**
 * Reinícios do guloso com desempate aleatório; o menor fechamento vence.
 * Pools pequenos custam microssegundos por tentativa, então recebem mais.
 */
export function closureAttempts(poolSize: number): number {
  return poolSize <= 10 ? 1000 : poolSize <= 12 ? 400 : 60;
}

/** Gerador determinístico (mulberry32): o mesmo pool sempre produz o mesmo fechamento. */
function seededUnit(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Projeta o fechamento.
 *
 * @param pool dezenas marcadas (distintas), 7..15.
 * @param gameSize dezenas por jogo (k).
 * @param guarantee acertos garantidos (t), `2 <= t < gameSize`.
 * @param penalty desempate entre fechamentos igualmente pequenos (menor = preferido).
 */
export function designClosure(
  pool: readonly number[],
  gameSize: number,
  guarantee: number,
  penalty: (numbers: readonly number[]) => number = () => 0,
): ClosureDesign {
  const v = pool.length;
  if (new Set(pool).size !== v) throw new RangeError('Dezenas repetidas no fechamento');
  if (v > MAX_POOL) throw new RangeError(`Fechamento limitado a ${MAX_POOL} dezenas`);
  if (v <= gameSize) throw new RangeError('O fechamento exige mais dezenas que o tamanho do jogo');
  if (!Number.isInteger(guarantee) || guarantee < 2 || guarantee >= gameSize) {
    throw new RangeError(`Garantia deve estar em 2..${gameSize - 1} (recebido: ${guarantee})`);
  }

  const sorted = [...pool].sort((a, b) => a - b);
  const gameMasks = combinationMasks(v, gameSize);
  const targetMasks = combinationMasks(v, guarantee);
  const numbersOf = (mask: number): number[] => sorted.filter((_, i) => mask & (1 << i));
  const tieBreak = gameMasks.map((mask) => penalty(numbersOf(mask)));

  // Estruturas compartilhadas por todas as tentativas.
  const targetsOfGame = gameMasks.map((mask) => subMasks(mask, guarantee));
  const gamesOfTarget = new Map<number, number[]>(targetMasks.map((m) => [m, []]));
  targetsOfGame.forEach((targets, gameIndex) => {
    for (const target of targets) gamesOfTarget.get(target)!.push(gameIndex);
  });

  const attempt = (random: (() => number) | null): number[] => {
    const gain = targetsOfGame.map((targets) => targets.length);
    const covered = new Set<number>();
    const chosen: number[] = [];
    while (covered.size < targetMasks.length) {
      let best = -1;
      let ties = 0;
      for (let i = 0; i < gameMasks.length; i++) {
        if (gain[i] === 0) continue;
        if (best === -1 || gain[i] > gain[best]) {
          best = i;
          ties = 1;
        } else if (gain[i] === gain[best]) {
          if (random === null) {
            if (tieBreak[i] < tieBreak[best]) best = i;
          } else {
            ties++;
            if (random() * ties < 1) best = i; // sorteio uniforme entre empatados
          }
        }
      }
      chosen.push(best);
      for (const target of targetsOfGame[best]) {
        if (covered.has(target)) continue;
        covered.add(target);
        for (const g of gamesOfTarget.get(target)!) gain[g]--;
      }
    }

    // Poda: remove jogo cujos alvos todos já estão cobertos por outros.
    const count = new Map<number, number>();
    for (const g of chosen) for (const t of targetsOfGame[g]) count.set(t, (count.get(t) ?? 0) + 1);
    const kept: number[] = [];
    for (const g of [...chosen].reverse()) {
      if (targetsOfGame[g].every((t) => (count.get(t) ?? 0) > 1)) {
        for (const t of targetsOfGame[g]) count.set(t, count.get(t)! - 1);
      } else {
        kept.push(g);
      }
    }
    return kept;
  };

  const totalPenalty = (games: number[]): number => games.reduce((s, g) => s + tieBreak[g], 0);
  let best = attempt(null);
  const random = seededUnit(sorted.reduce((h, n) => (Math.imul(h, 31) + n) | 0, 17 + guarantee));
  for (let i = 1; i < closureAttempts(v); i++) {
    const candidate = attempt(random);
    if (
      candidate.length < best.length ||
      (candidate.length === best.length && totalPenalty(candidate) < totalPenalty(best))
    ) {
      best = candidate;
    }
  }

  return {
    games: best.map((g) => numbersOf(gameMasks[g])).sort(compareGames),
    guarantee,
    poolSize: v,
  };
}

function compareGames(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

/**
 * Prova exaustiva do contrato: todo subconjunto de `guarantee` dezenas do
 * pool está contido em algum jogo. `true` = garantia válida.
 */
export function verifyClosure(design: ClosureDesign, pool: readonly number[]): boolean {
  const sorted = [...pool].sort((a, b) => a - b);
  const index = new Map(sorted.map((n, i) => [n, i]));
  const gameMasks = design.games.map((game) =>
    game.reduce((mask, n) => mask | (1 << (index.get(n) ?? MAX_POOL)), 0),
  );
  return combinationMasks(sorted.length, design.guarantee).every((target) =>
    gameMasks.some((mask) => (mask & target) === target),
  );
}

/**
 * Garantias que fazem sentido oferecer numa loteria: só as que, ao se
 * concretizarem, ainda podem pagar prêmio. Na Mega-Sena 3 acertos não pagam
 * nada — garantir "terno" seria vender um contrato sem valor.
 */
export function offeredGuarantees(lottery: Lottery): number[] {
  const { numbersPerBet } = lotteryRules(lottery);
  const candidates = [3, 4].filter((t) => t < numbersPerBet);
  return candidates.filter((t) => isPrized(lottery, t, 0) || isPrized(lottery, t, 1));
}

/** Custo total do fechamento, em reais. */
export function closureCost(gamesCount: number): number {
  return gamesCount * SIMPLE_BET_PRICE_BRL;
}

export interface ClosureOptions {
  random?: RandomSource;
}

/**
 * Lote de fechamento para o app: valida o pool contra as regras da loteria,
 * projeta a cobertura e anexa os trevos (sorteados uniformemente) na
 * +Milionária. O resultado carrega o contrato em `closure`.
 */
export function generateClosure(
  lottery: Lottery,
  pool: readonly number[],
  guarantee: number,
  options: ClosureOptions = {},
): GameBatch {
  const rules = lotteryRules(lottery);
  const random = options.random ?? defaultRandom;

  const invalid = pool.find(
    (n) => !Number.isInteger(n) || n < 1 || n > rules.numberUniverse,
  );
  if (invalid !== undefined) {
    throw new RangeError(`Dezena ${invalid} fora do intervalo 1..${rules.numberUniverse}`);
  }
  if (pool.length < rules.numbersPerBet + 1 || pool.length > rules.maxSelection) {
    throw new RangeError(
      `Marque de ${rules.numbersPerBet + 1} a ${rules.maxSelection} dezenas (marcadas: ${pool.length})`,
    );
  }
  if (!offeredGuarantees(lottery).includes(guarantee)) {
    throw new RangeError(`Garantia de ${guarantee} acertos não é oferecida nesta loteria`);
  }

  const design = designClosure(pool, rules.numbersPerBet, guarantee, (numbers) =>
    unpopularityPenalty(lottery, numbers),
  );

  const games: GeneratedGame[] = design.games.map((numbers) => {
    if (!hasTrevos(lottery)) return { numbers };
    const universe = Array.from({ length: rules.trevoUniverse }, (_, i) => i + 1);
    const pair: number[] = [];
    while (pair.length < rules.trevosPerBet) {
      const pick = universe[random.nextInt(universe.length)];
      if (!pair.includes(pick)) pair.push(pick);
    }
    return { numbers, trevoDuplas: [[pair[0], pair[1]] as [number, number]] };
  });

  return {
    lottery,
    games,
    strategyLabel: 'Fechamento',
    sourcePool: [...pool].sort((a, b) => a - b),
    closure: { guarantee, poolSize: pool.length, cost: closureCost(games.length) },
  };
}

/**
 * Confere o contrato contra um sorteio real: se `draw` tem `guarantee` ou mais
 * dezenas do pool, algum jogo precisa acertar `guarantee` ou mais.
 */
export function closureHoldsFor(batch: GameBatch, draw: Draw): boolean {
  const closure = batch.closure;
  if (!closure || !batch.sourcePool) return true;
  const inPool = draw.numbers.filter((n) => batch.sourcePool!.includes(n)).length;
  if (inPool < closure.guarantee) return true;
  return batch.games.some(
    (game) => game.numbers.filter((n) => draw.numbers.includes(n)).length >= closure.guarantee,
  );
}
