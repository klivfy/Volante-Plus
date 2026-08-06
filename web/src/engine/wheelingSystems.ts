/**
 * Cobertura combinatória otimizada (wheeling systems).
 *
 * O modo Fechamento atual (`gameGenerator.ts`, opção `pool`) sorteia jogos
 * aleatórios dentro do pool marcado — sem garantia combinatória. Um wheeling
 * system troca aleatoriedade por uma garantia matemática: "se X das suas
 * dezenas marcadas saírem, pelo menos 1 jogo do lote acerta Y". Isso não
 * aumenta a probabilidade de ganhar (a matemática da loteria não muda) — só
 * reduz a variância de cobertura dentro do pool escolhido pelo usuário.
 */

/** Todas as combinações de `k` elementos de `items`, em ordem lexicográfica. */
function combinations<T>(items: readonly T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (items.length < k) return [];

  const result: T[][] = [];
  const current: T[] = [];

  function backtrack(start: number): void {
    if (current.length === k) {
      result.push([...current]);
      return;
    }
    for (let i = start; i < items.length; i++) {
      current.push(items[i]);
      backtrack(i + 1);
      current.pop();
    }
  }

  backtrack(0);
  return result;
}

/**
 * Gera um wheel guloso (heurística "greedy set cover", não ótimo) para um
 * pool de tamanho arbitrário: cobre todas as combinações de `guarantee`
 * dezenas do pool com o menor número de jogos de `gameSize` que a heurística
 * conseguir encontrar.
 *
 * WHY (guloso, não exato): set cover ótimo é NP-difícil; para pools de até
 * ~15 dezenas (o máximo do modo Fechamento, ver `Lottery.maxSelection`) o
 * guloso já produz coberturas próximas do mínimo teórico em tempo prático.
 */
export function generateWheelGreedy(
  pool: number[],
  gameSize: number,
  guarantee: number,
): number[][] {
  if (guarantee > gameSize || guarantee > pool.length) {
    throw new RangeError('Garantia inválida: não pode exceder o tamanho do jogo ou do pool');
  }
  // WHY (limite de pool): a heurística é O(|combos gameSize| × |combos guarantee|)
  // por iteração — em pools grandes (ex.: 15, o máximo do modo Fechamento)
  // isso explode para milhões de operações e trava a UI. 12 é o maior pool em
  // que o cálculo continua abaixo de ~1s em hardware modesto.
  if (pool.length > 12) {
    throw new RangeError(
      'Wheel guloso limitado a pools de até 12 dezenas — para pools maiores, reduza a seleção',
    );
  }

  const allGames = combinations(pool, gameSize);
  const targetCombos = combinations(pool, guarantee);
  const uncovered = new Set(targetCombos.map((combo) => combo.join(',')));

  const wheel: number[][] = [];

  while (uncovered.size > 0) {
    let bestGame: number[] | null = null;
    let bestCovers = 0;

    for (const game of allGames) {
      const gameSet = new Set(game);
      let covers = 0;
      for (const comboKey of uncovered) {
        const combo = comboKey.split(',').map(Number);
        if (combo.every((n) => gameSet.has(n))) covers++;
      }
      if (covers > bestCovers) {
        bestCovers = covers;
        bestGame = game;
      }
    }

    if (!bestGame || bestCovers === 0) break; // sem jogo cobrindo mais combinações — evita loop infinito

    wheel.push(bestGame);
    const gameSet = new Set(bestGame);
    for (const comboKey of Array.from(uncovered)) {
      const combo = comboKey.split(',').map(Number);
      if (combo.every((n) => gameSet.has(n))) {
        uncovered.delete(comboKey);
      }
    }
  }

  return wheel;
}

/**
 * Wheel C(10,6,4): 10 posições abstratas (1..10), garantia de quadra (4
 * acertos) se pelo menos 4 das 10 posições saírem no sorteio.
 *
 * WHY (computado, não copiado de tabela): uma tabela de wheel "clássica"
 * copiada de fora é fácil de transcrever errada e difícil de auditar a
 * olho — a garantia é uma afirmação matemática forte (deve cobrir as 210
 * combinações C(10,4)) que só vale a pena publicar se for *provada*, não
 * assumida. Construir via `generateWheelGreedy` (set cover guloso, mas
 * exaustivo sobre o universo alvo) garante a cobertura por construção; o
 * teste `wheelingSystems.test.ts` verifica exaustivamente as 210 combinações.
 */
export const WHEEL_10_6_4: readonly number[][] = generateWheelGreedy(
  Array.from({ length: 10 }, (_, i) => i + 1),
  6,
  4,
);

/** Mapeia as posições abstratas 1..10 do wheel para as dezenas reais escolhidas pelo usuário. */
export function applyWheel(wheel: readonly number[][], userNumbers: number[]): number[][] {
  if (userNumbers.length < 10) {
    throw new RangeError('O wheel C(10,6,4) requer pelo menos 10 dezenas marcadas');
  }
  const selected = [...userNumbers].sort((a, b) => a - b).slice(0, 10);
  return wheel.map((game) => game.map((position) => selected[position - 1]));
}

/**
 * Verifica se o wheel de fato cumpre a garantia contra um resultado real:
 * se `draw` acertou `guarantee` ou mais dezenas do `pool`, pelo menos um jogo
 * do `wheel` deve acertar `guarantee` ou mais.
 */
export function verifyWheelCoverage(
  wheel: readonly number[][],
  pool: number[],
  draw: number[],
  guarantee: number,
): boolean {
  const hitsInPool = draw.filter((n) => pool.includes(n)).length;
  if (hitsInPool < guarantee) return true; // garantia não se aplica a este sorteio

  return wheel.some((game) => game.filter((n) => draw.includes(n)).length >= guarantee);
}
