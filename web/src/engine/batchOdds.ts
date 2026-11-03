import { Lottery, MAX_GAMES } from '../types/domain';
import { binomial, hypergeometricAtLeast, hypergeometricProbability } from './hypergeometric';
import { anyPrizeProbability } from './powerAnalysis';
import { classifyHits, hasTrevos, lotteryRules, prizeTiers } from './prizeRules';

/**
 * Chances exatas de um lote de jogos — o teto matemático do que o lote pode
 * dar, sem simulação.
 *
 * Dois escopos, duas perguntas:
 *
 * - **Modelo** (`modelBatchOdds`): um lote hipotético de `gamesCount` jogos
 *   SIMPLES e DISJUNTOS — a deduplicação absoluta do gerador garante disjunção
 *   nos jogos avulsos (`gameGenerator.ts`). A resposta é exata: a partição
 *   multivariada dos acertos por jogo é enumerada por completo.
 * - **Lote concreto** (`concreteBatchOdds`): os jogos que estão na tela, que
 *   podem COMPARTILHAR dezenas (fechamento). Também exata: o diagrama de Venn
 *   dos jogos é decomposto em átomos (regiões de interseção, somadas por
 *   assinatura via Vandermonde) e os acertos por jogo são somados sobre todas
 *   as alocações das dezenas sorteadas entre os átomos.
 *
 * HONESTIDADE MATEMÁTICA: os sorteios são independentes e uniformes — nenhum
 * histórico altera essas chances. O que este módulo mede é a ESTRUTURA do
 * lote (quantidade, sobreposição de dezenas, duplas de trevo), que muda a
 * variância e a cobertura do lote, não a probabilidade de cada combinação. Os
 * pisos de premiação vêm das faixas oficiais (`prizeRules.ts`): Quadra (4) na
 * Mega-Sena, “2 dezenas + 1 trevo” (faixa 10) na +Milionária, Duque (2) na
 * Quina.
 */

/** Teto de jogos avaliáveis no escopo concreto (guarda de computabilidade). */
export const MAX_BATCH_GAMES = 128;

export interface BatchOdds {
  /** Quantidade de jogos avaliados. */
  readonly gamesCount: number;
  /** P(nenhum jogo do lote premiar num concurso). */
  readonly noPrizeProbability: number;
  /** P(pelo menos um jogo premiar num concurso) = 1 − `noPrizeProbability`. */
  readonly anyPrizeProbability: number;
  /**
   * Número esperado de apostas premiadas no concurso. Cada jogo (ou jogo ×
   * dupla, na +Milionária) é uma aposta; com sobreposição de dezenas a soma
   * das marginais exatas continua exata.
   */
  readonly expectedPrizedGames: number;
}

function assertIntegerInRange(value: number, min: number, max: number, label: string): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`${label} deve estar em ${min}..${max} (recebido: ${value})`);
  }
}

/** Faixa mais baixa da modalidade: piso de acertos que paga prêmio. */
function minimumNumberHits(lottery: Lottery): number {
  const tiers = prizeTiers(lottery);
  return tiers[tiers.length - 1].numberHits;
}

/**
 * Fábrica dos critérios de vitória por nível de acertos, derivados SEMPRE de
 * `classifyHits` — nenhum piso fixo no código:
 * - `winsOnNumbers(h)`: a aposta premia independentemente dos trevos.
 * - `canWinWithTrevo(h)`: a aposta premia se alcançar pelo menos 1 trevo.
 * - `needsTrevo(h)`: premia só com trevo — no modelo de dupla aleatória,
 *   contribui com `trevoMissProbability` para o “nenhum prêmio”.
 */
function winCriteria(lottery: Lottery) {
  const minHits = minimumNumberHits(lottery);
  return {
    minHits,
    winsOnNumbers: (hits: number): boolean => classifyHits(lottery, hits, 0) !== null,
    canWinWithTrevo: (hits: number): boolean =>
      classifyHits(lottery, hits, 1) !== null || classifyHits(lottery, hits, 2) !== null,
  };
}

/**
 * Chances de um lote HIPOTÉTICO de `gamesCount` jogos simples disjuntos.
 *
 * Partição exata: (x1..xG) acertos por jogo com Σxi ≤ K pesa
 * `Π C(n, xi) · C(N − G·n, K − Σxi) / C(N, K)`.
 *
 * Na +Milionária cada jogo traz uma dupla de trevo aleatória (estratégia
 * `ECONOMICO`): duplas são independentes do sorteio de dezenas e entre si, e
 * P(dupla aleatória não alcança nenhum dos 2 trevos sorteados) =
 * C(4,2)/C(6,2) = 2/5 — fator exato por jogo que precise de trevo. Com
 * `COBERTURA_TOTAL` as 15 duplas cobrem qualquer par: o escopo concreto
 * (`concreteBatchOdds`) avalia as duplas reais do lote.
 *
 * @throws RangeError quando `gamesCount` está fora de `1..MAX_GAMES`.
 *   WHY 1: o caso de um único jogo é a âncora de consistência — tem que
 *   reproduzir exatamente a chance de qualquer prêmio da aposta simples.
 */
export function modelBatchOdds(lottery: Lottery, gamesCount: number): BatchOdds {
  assertIntegerInRange(gamesCount, 1, MAX_GAMES, 'Quantidade de jogos');

  const rules = lotteryRules(lottery);
  const { numberUniverse: N, numbersDrawn: K, numbersPerBet: n } = rules;
  const { winsOnNumbers, canWinWithTrevo } = winCriteria(lottery);

  // P(dupla aleatória não contém trevo sorteado), 0 em loterias sem trevo.
  const trevoMissProbability = hasTrevos(lottery)
    ? binomial(rules.trevoUniverse - rules.trevosDrawn, rules.trevosDrawn) /
      binomial(rules.trevoUniverse, rules.trevosDrawn)
    : 0;

  // Acertos por jogo da composição corrente — necessário na folha para saber
  // se algum jogo já venceu por dezenas (independe dos trevos).
  const counts = new Array<number>(gamesCount).fill(0);
  let noPrize = 0;

  const walk = (game: number, remaining: number, weight: number, needingTrevo: number): void => {
    if (game === gamesCount) {
      // O lote só perde se NENHUM jogo vence por dezenas e todo jogo que
      // depende de trevo erra a dupla — composições com jogo já premiado por
      // dezenas não contribuem para o “nenhum prêmio”.
      for (let i = 0; i < gamesCount; i++) {
        if (winsOnNumbers(counts[i])) return;
      }
      const tail = binomial(N - gamesCount * n, remaining);
      if (tail === 0 && remaining > 0) return;
      const probability = (weight * tail) / binomial(N, K);
      noPrize += probability * Math.pow(trevoMissProbability, needingTrevo);
      return;
    }
    const maxHits = Math.min(n, remaining);
    for (let hits = 0; hits <= maxHits; hits++) {
      const c = binomial(n, hits);
      if (c === 0) continue;
      counts[game] = hits;
      // Jogo que premia só com trevo (2–3 dezenas na +Milionária) adiciona o
      // fator de falha da dupla aleatória; os demais não alteram o fator.
      const needsTrevo =
        canWinWithTrevo(hits) && !winsOnNumbers(hits) ? needingTrevo + 1 : needingTrevo;
      walk(game + 1, remaining - hits, weight * c, needsTrevo);
    }
  };
  walk(0, K, 1, 0);

  return {
    gamesCount,
    noPrizeProbability: noPrize,
    anyPrizeProbability: 1 - noPrize,
    expectedPrizedGames: gamesCount * anyPrizeProbability(lottery),
  };
}

/**
 * Chances do lote CONCRETO da tela (jogos podem compartilhar dezenas).
 *
 * Método exato, sem simulação:
 * 1. Cada dezena da união cai em exatamente um átomo do diagrama de Venn dos
 *    jogos; átomos com a mesma assinatura de interseção são somados
 *    (Vandermonde), então restam no máximo `min(união, 2^G)` regiões — ≤ 15
 *    num fechamento.
 * 2. As K dezenas sorteadas são alocadas entre os átomos; somar
 *    `Π C(tamanho, alocação) · C(for a, K − Σ)` sobre TODAS as alocações
 *    reconstrói a distribuição exata dos acertos por jogo.
 * 3. Na +Milionária os trevos saem de urna própria: o par sorteado é
 *    enumerado (C(6,2) = 15 pares equiprováveis) e combinado com as duplas
 *    REAIS de cada jogo — o “alguma dupla premia” vira o máximo de trevos
 *    alcançado por dupla em cada par.
 *
 * @param games jogos do lote; cada um com `numbersPerBet` dezenas distintas.
 * @param trevoDuplas duplas reais de cada jogo; obrigatório na +Milionária —
 *   sem as duplas as faixas 7 a 10 não são avaliáveis, e estimá-las seria
 *   fabricar um número.
 * @throws RangeError para lote vazio, acima de `MAX_BATCH_GAMES`, jogo
 *   malformado ou +Milionária sem duplas.
 */
export function concreteBatchOdds(
  lottery: Lottery,
  games: readonly number[][],
  trevoDuplas?: readonly (readonly [number, number][])[],
): BatchOdds {
  if (!Array.isArray(games) || games.length === 0) {
    throw new RangeError('O lote deve ter ao menos um jogo');
  }
  assertIntegerInRange(games.length, 1, MAX_BATCH_GAMES, 'Quantidade de jogos');

  const rules = lotteryRules(lottery);
  const { numberUniverse: N, numbersDrawn: K, numbersPerBet: n } = rules;
  const { minHits, winsOnNumbers } = winCriteria(lottery);
  const usesTrevos = hasTrevos(lottery);

  for (const game of games) {
    if (game.length !== n) {
      throw new RangeError(`Cada jogo deve ter ${n} dezenas (recebido: ${game.length})`);
    }
    if (new Set(game).size !== n) {
      throw new RangeError('Dezenas repetidas num jogo do lote');
    }
    const invalid = game.find(
      (number: number) => !Number.isInteger(number) || number < 1 || number > N,
    );
    if (invalid !== undefined) {
      throw new RangeError(`Dezena ${invalid} fora do intervalo 1..${N}`);
    }
  }

  let duplas: readonly (readonly [number, number][])[] = [];
  if (usesTrevos) {
    if (trevoDuplas === undefined || trevoDuplas.length !== games.length) {
      throw new RangeError('Cada jogo precisa da sua lista de duplas de trevo');
    }
    for (const gameDuplas of trevoDuplas) {
      if (gameDuplas.length === 0) {
        throw new RangeError('Jogo da +Milionária sem dupla de trevo');
      }
      for (const [a, b] of gameDuplas) {
        if (
          !Number.isInteger(a) ||
          !Number.isInteger(b) ||
          a === b ||
          a < 1 ||
          b < 1 ||
          a > rules.trevoUniverse ||
          b > rules.trevoUniverse
        ) {
          throw new RangeError(`Dupla de trevo inválida: (${a}, ${b})`);
        }
      }
    }
    duplas = trevoDuplas;
  }

  // 1. Átomos do diagrama de Venn, somados por assinatura de interseção.
  const atomSizes = new Map<number, number>();
  let unionSize = 0;
  const seen = new Set<number>();
  for (const game of games) {
    for (const number of game) {
      if (seen.has(number)) continue;
      seen.add(number);
      unionSize++;
      let mask = 0;
      for (let i = 0; i < games.length; i++) {
        if (games[i].includes(number)) mask |= 1 << i;
      }
      atomSizes.set(mask, (atomSizes.get(mask) ?? 0) + 1);
    }
  }
  const masks = [...atomSizes.keys()];
  const sizes = masks.map((mask) => atomSizes.get(mask) as number);
  const outside = N - unionSize;

  // 2. Trevos: pares sorteados enumerados; para cada jogo, o máximo de trevos
  // que ALGUMA das suas duplas alcança em cada par sorteado.
  const trevoPairs: [number, number][] = [];
  if (usesTrevos) {
    for (let a = 1; a <= rules.trevoUniverse; a++) {
      for (let b = a + 1; b <= rules.trevoUniverse; b++) trevoPairs.push([a, b]);
    }
  }
  const maxTrevoHits = usesTrevos
    ? games.map((_, gameIndex) =>
        trevoPairs.map(([a, b]) =>
          Math.max(
            ...duplas[gameIndex].map(
              (dupla) => (dupla.includes(a) ? 1 : 0) + (dupla.includes(b) ? 1 : 0),
            ),
          ),
        ),
      )
    : [];

  /** Jogo premia com `hits` dezenas dado o melhor trevo alcançado. */
  const gameWins = (hits: number, maxTrevo: number): boolean => {
    if (winsOnNumbers(hits)) return true;
    if (maxTrevo >= 1 && classifyHits(lottery, hits, 1) !== null) return true;
    if (maxTrevo >= 2 && classifyHits(lottery, hits, 2) !== null) return true;
    return false;
  };

  // 3. Soma exata sobre todas as alocações das K dezenas pelos átomos, com
  // acertos por jogo incrementados/decrementados ao entrar/sair da recursão.
  const hits = new Array<number>(games.length).fill(0);
  let noPrize = 0;

  const walk = (atomIndex: number, remaining: number, weight: number): void => {
    if (atomIndex === masks.length) {
      const tail = binomial(outside, remaining);
      if (tail === 0 && remaining > 0) return;
      const allocationProbability = (weight * tail) / binomial(N, K);
      if (allocationProbability === 0) return;
      if (!usesTrevos) {
        let allLose = true;
        for (let gameIndex = 0; gameIndex < games.length; gameIndex++) {
          if (hits[gameIndex] >= minHits) {
            allLose = false;
            break;
          }
        }
        if (allLose) noPrize += allocationProbability;
        return;
      }
      // Cada par sorteado de trevos pesa 1/C(6,2) e é independente das
      // dezenas — a média sobre os 15 pares é o fator exato.
      let losingPairs = 0;
      for (let pairIndex = 0; pairIndex < trevoPairs.length; pairIndex++) {
        let allLose = true;
        for (let gameIndex = 0; gameIndex < games.length; gameIndex++) {
          if (gameWins(hits[gameIndex], maxTrevoHits[gameIndex][pairIndex])) {
            allLose = false;
            break;
          }
        }
        if (allLose) losingPairs++;
      }
      noPrize += allocationProbability * (losingPairs / trevoPairs.length);
      return;
    }
    const size = sizes[atomIndex];
    const limit = Math.min(size, remaining);
    const mask = masks[atomIndex];
    for (let take = 0; take <= limit; take++) {
      const c = binomial(size, take);
      if (c === 0) continue;
      if (take > 0) {
        for (let gameIndex = 0; gameIndex < games.length; gameIndex++) {
          if ((mask & (1 << gameIndex)) !== 0) hits[gameIndex] += take;
        }
      }
      walk(atomIndex + 1, remaining - take, weight * c);
      if (take > 0) {
        for (let gameIndex = 0; gameIndex < games.length; gameIndex++) {
          if ((mask & (1 << gameIndex)) !== 0) hits[gameIndex] -= take;
        }
      }
    }
  };
  walk(0, K, 1);

  // Jogos (apostas) premiados esperados: marginais exatas — a marginal de um
  // conjunto de dezenas é hipergeométrica mesmo com sobreposição, e na
  // +Milionária cada dupla é uma aposta com urna de trevo própria.
  let expectedPrizedGames = 0;
  if (!usesTrevos) {
    expectedPrizedGames =
      games.length * hypergeometricAtLeast(N, K, n, minHits);
  } else {
    // Uma aposta = dezenas do jogo × uma dupla. P(prêmio) por dupla:
    // Σ_h P(h) · Σ_t P(t) · [faixa existe].
    let perBet = 0;
    for (let numberHits = 0; numberHits <= Math.min(K, n); numberHits++) {
      const pNumbers = hypergeometricProbability(N, K, n, numberHits);
      if (pNumbers === 0) continue;
      for (let trevoHits = 0; trevoHits <= rules.trevosDrawn; trevoHits++) {
        if (classifyHits(lottery, numberHits, trevoHits) === null) continue;
        perBet +=
          pNumbers *
          hypergeometricProbability(
            rules.trevoUniverse,
            rules.trevosDrawn,
            rules.trevosPerBet,
            trevoHits,
          );
      }
    }
    const totalBets = duplas.reduce((total, gameDuplas) => total + gameDuplas.length, 0);
    expectedPrizedGames = totalBets * perBet;
  }

  return {
    gamesCount: games.length,
    noPrizeProbability: noPrize,
    anyPrizeProbability: 1 - noPrize,
    expectedPrizedGames,
  };
}

/**
 * Quantos concursos consecutivos (um lote novo por concurso) são necessários
 * para a chance acumulada de pelo menos um prêmio atingir
 * `targetProbability` — núcleo da geométrica:
 * `n = ⌈log(1 − alvo) / log(P(sem prêmio))⌉`.
 *
 * Sorteios são independentes: o histórico não muda `noPrizeProbability` de um
 * concurso para o outro.
 *
 * @returns 1 quando o lote já premia com certeza (P(sem prêmio) = 0) e
 *   `Infinity` quando ele nunca premia (= 1).
 * @throws RangeError para probabilidades fora de [0, 1] ou alvo fora de (0, 1).
 */
export function concursosForNoPrize(
  noPrizeProbability: number,
  targetProbability: number,
): number {
  if (!Number.isFinite(noPrizeProbability) || noPrizeProbability < 0 || noPrizeProbability > 1) {
    throw new RangeError(
      `noPrizeProbability deve estar em [0, 1] (recebido: ${noPrizeProbability})`,
    );
  }
  if (!Number.isFinite(targetProbability) || targetProbability <= 0 || targetProbability >= 1) {
    throw new RangeError(
      `targetProbability deve estar em (0, 1) (recebido: ${targetProbability})`,
    );
  }
  if (noPrizeProbability === 0) return 1;
  if (noPrizeProbability === 1) return Infinity;
  return Math.ceil(Math.log(1 - targetProbability) / Math.log(noPrizeProbability));
}
