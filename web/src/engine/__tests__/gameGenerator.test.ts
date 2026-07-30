import { describe, expect, it } from 'vitest';
import {
  GeneratedGame,
  Lottery,
  MAX_GAMES,
  MIN_GAMES,
  NumberPerformance,
  PerformanceTier,
  TrevoStrategy,
} from '../../types/domain';
import { STRATEGY_LABEL, allTrevoPairs, generateGames } from '../gameGenerator';
import { createSeededRandom } from '../random';

/**
 * Desempenho sintético: o teste dita o peso de cada dezena, então a
 * distribuição esperada é conhecida de antemão.
 */
function performances(
  universe: number,
  weightOf: (n: number) => number = () => 1,
): NumberPerformance[] {
  const rows = Array.from({ length: universe }, (_, index) => {
    const number = index + 1;
    return { number, weight: weightOf(number) };
  }).sort((a, b) => b.weight - a.weight || a.number - b.number);

  const topCut = Math.ceil(rows.length * 0.4);
  const midCut = topCut + Math.ceil(rows.length * 0.3);

  return rows.map((row, index) => ({
    number: row.number,
    hitCount: 0,
    simulatedHitRate: 0,
    weight: row.weight,
    tier: (index < topCut ? 'top' : index < midCut ? 'mid' : 'low') as PerformanceTier,
  }));
}

const megaPerformances = () => performances(60);
const milionariaPerformances = () => performances(50);

function trevoPerformances(weightOf: (n: number) => number = () => 1): NumberPerformance[] {
  return performances(6, weightOf);
}

const seeded = (seed = 42) => ({ random: createSeededRandom(seed) });

function allNumbers(games: GeneratedGame[]): number[] {
  return games.flatMap((game) => game.numbers);
}

describe('generateGames — validação de limites', () => {
  it('aceita a faixa MIN_GAMES..MAX_GAMES', () => {
    for (let count = MIN_GAMES; count <= MAX_GAMES; count++) {
      const batch = generateGames(Lottery.MEGA_SENA, count, megaPerformances(), seeded());
      expect(batch.games).toHaveLength(count);
    }
  });

  it('rejeita contagem fora da faixa', () => {
    for (const count of [MIN_GAMES - 1, MAX_GAMES + 1, 0, -3]) {
      expect(() =>
        generateGames(Lottery.MEGA_SENA, count, megaPerformances(), seeded()),
      ).toThrow(RangeError);
    }
  });

  it('rejeita contagem não inteira', () => {
    expect(() =>
      generateGames(Lottery.MEGA_SENA, 2.5, megaPerformances(), seeded()),
    ).toThrow(RangeError);
  });

  it('rejeita desempenho vazio', () => {
    expect(() => generateGames(Lottery.MEGA_SENA, 3, [], seeded())).toThrow(RangeError);
  });

  it('rejeita desempenho insuficiente para formar um jogo', () => {
    const cinco = megaPerformances().slice(0, 5);
    expect(() => generateGames(Lottery.MEGA_SENA, 2, cinco, seeded())).toThrow(RangeError);
  });

  it('descarta dezenas fora do universo da loteria', () => {
    // 60 dezenas analisadas, mas a +Milionária só vai até 50.
    const batch = generateGames(
      Lottery.MAIS_MILIONARIA,
      5,
      megaPerformances(),
      seeded(),
    );
    expect(batch.performancesSnapshot).toHaveLength(50);
    expect(allNumbers(batch.games).every((n) => n >= 1 && n <= 50)).toBe(true);
  });
});

describe('generateGames — forma do jogo', () => {
  it('produz 6 dezenas distintas e em ordem crescente', () => {
    const batch = generateGames(Lottery.MEGA_SENA, 5, megaPerformances(), seeded());

    for (const game of batch.games) {
      expect(game.numbers).toHaveLength(6);
      expect(new Set(game.numbers).size).toBe(6);
      expect([...game.numbers].sort((a, b) => a - b)).toEqual(game.numbers);
      expect(game.numbers.every((n) => n >= 1 && n <= 60)).toBe(true);
    }
  });

  it('rotula o lote como Backtest-Driven e guarda o snapshot', () => {
    const batch = generateGames(Lottery.MEGA_SENA, 2, megaPerformances(), seeded());

    expect(batch.strategyLabel).toBe(STRATEGY_LABEL);
    expect(batch.lottery).toBe(Lottery.MEGA_SENA);
    expect(batch.performancesSnapshot).toHaveLength(60);
    expect(batch.sourcePool).toBeUndefined();
  });

  it('é reprodutível com a mesma semente', () => {
    const a = generateGames(Lottery.MEGA_SENA, 5, megaPerformances(), seeded(7));
    const b = generateGames(Lottery.MEGA_SENA, 5, megaPerformances(), seeded(7));
    const c = generateGames(Lottery.MEGA_SENA, 5, megaPerformances(), seeded(8));

    expect(a.games).toEqual(b.games);
    expect(a.games).not.toEqual(c.games);
  });

  it('funciona sem RNG injetado (crypto ou Math.random)', () => {
    const batch = generateGames(Lottery.MEGA_SENA, 3, megaPerformances());

    expect(batch.games).toHaveLength(3);
    expect(batch.games.every((game) => game.numbers.length === 6)).toBe(true);
  });

  it('não repete jogos num lote com universo cheio', () => {
    for (let seed = 0; seed < 30; seed++) {
      const batch = generateGames(Lottery.MEGA_SENA, 5, megaPerformances(), seeded(seed));
      const signatures = batch.games.map((game) => game.numbers.join('-'));
      expect(new Set(signatures).size).toBe(5);
    }
  });

  it('entrega o lote mesmo quando o pool não permite jogos distintos', () => {
    // Exatamente 6 dezenas elegíveis: só existe uma combinação possível.
    const batch = generateGames(Lottery.MEGA_SENA, 3, megaPerformances(), {
      ...seeded(),
      pool: [1, 2, 3, 4, 5, 6],
    });

    expect(batch.games).toHaveLength(3);
    expect(batch.games.every((game) => game.numbers.join('-') === '1-2-3-4-5-6')).toBe(
      true,
    );
  });
});

describe('generateGames — distribuição por tiers', () => {
  it('tira ~70% das dezenas do tier top, ~20% do mid e ~10% do low', () => {
    const source = megaPerformances();
    const tierOf = new Map(source.map((p) => [p.number, p.tier]));
    const tally: Record<PerformanceTier, number> = { top: 0, mid: 0, low: 0 };

    for (let seed = 0; seed < 300; seed++) {
      const batch = generateGames(Lottery.MEGA_SENA, 5, source, seeded(seed));
      for (const number of allNumbers(batch.games)) {
        tally[tierOf.get(number)!]++;
      }
    }

    const total = tally.top + tally.mid + tally.low;
    expect(total).toBe(300 * 5 * 6);
    expect(tally.top / total).toBeGreaterThan(0.62);
    expect(tally.top / total).toBeLessThan(0.78);
    expect(tally.mid / total).toBeGreaterThan(0.14);
    expect(tally.mid / total).toBeLessThan(0.26);
    expect(tally.low / total).toBeGreaterThan(0.05);
    expect(tally.low / total).toBeLessThan(0.16);
  });

  it('favorece as dezenas de maior peso dentro do mesmo tier', () => {
    // 1 domina o tier top; 2..24 dividem o resto do peso.
    const source = performances(60, (n) => (n === 1 ? 100 : n <= 24 ? 1 : 0.01));
    const counts = new Map<number, number>();

    for (let seed = 0; seed < 200; seed++) {
      const batch = generateGames(Lottery.MEGA_SENA, 5, source, seeded(seed));
      for (const number of allNumbers(batch.games)) {
        counts.set(number, (counts.get(number) ?? 0) + 1);
      }
    }

    expect(counts.get(1)!).toBeGreaterThan((counts.get(2) ?? 0) * 3);
  });

  it('degenera em sorteio uniforme quando todos os pesos são zero', () => {
    const source = performances(60, () => 0);
    const batch = generateGames(Lottery.MEGA_SENA, 5, source, seeded());

    expect(batch.games).toHaveLength(5);
    for (const game of batch.games) {
      expect(new Set(game.numbers).size).toBe(6);
    }
  });
});

describe('generateGames — fechamento', () => {
  it('restringe os jogos às dezenas do volante', () => {
    const pool = [3, 9, 14, 21, 27, 33, 41, 52, 58, 60];
    const batch = generateGames(Lottery.MEGA_SENA, 5, megaPerformances(), {
      ...seeded(),
      pool,
    });

    expect(batch.sourcePool).toEqual([...pool].sort((a, b) => a - b));
    expect(batch.performancesSnapshot).toHaveLength(pool.length);
    expect(allNumbers(batch.games).every((n) => pool.includes(n))).toBe(true);
  });

  it('rejeita dezenas repetidas no fechamento', () => {
    expect(() =>
      generateGames(Lottery.MEGA_SENA, 2, megaPerformances(), {
        ...seeded(),
        pool: [1, 2, 3, 4, 5, 6, 6],
      }),
    ).toThrow(RangeError);
  });

  it('rejeita dezena fora do universo', () => {
    expect(() =>
      generateGames(Lottery.MEGA_SENA, 2, megaPerformances(), {
        ...seeded(),
        pool: [1, 2, 3, 4, 5, 61],
      }),
    ).toThrow(RangeError);
  });

  it('rejeita fechamento menor que um jogo', () => {
    expect(() =>
      generateGames(Lottery.MEGA_SENA, 2, megaPerformances(), {
        ...seeded(),
        pool: [1, 2, 3, 4, 5],
      }),
    ).toThrow(RangeError);
  });

  it('recalcula os tiers sobre o pool, não sobre o universo', () => {
    // Todas as dezenas do fechamento vêm do tier low do universo cheio.
    const source = performances(60, (n) => (n <= 40 ? 1 : 0.01));
    const pool = [45, 46, 47, 48, 49, 50, 51, 52];
    const batch = generateGames(Lottery.MEGA_SENA, 5, source, { ...seeded(), pool });

    expect(batch.games).toHaveLength(5);
    expect(allNumbers(batch.games).every((n) => pool.includes(n))).toBe(true);
  });
});

describe('generateGames — trevos', () => {
  it('não gera trevos na Mega-Sena', () => {
    const batch = generateGames(Lottery.MEGA_SENA, 3, megaPerformances(), seeded());
    expect(batch.games.every((game) => game.trevoDuplas === undefined)).toBe(true);
  });

  it('gera uma dupla ordenada por jogo no modo econômico', () => {
    const batch = generateGames(Lottery.MAIS_MILIONARIA, 5, milionariaPerformances(), {
      ...seeded(),
      trevoPerformances: trevoPerformances(),
      trevoStrategy: TrevoStrategy.ECONOMICO,
    });

    for (const game of batch.games) {
      expect(game.trevoDuplas).toHaveLength(1);
      const [a, b] = game.trevoDuplas![0];
      expect(a).toBeLessThan(b);
      expect([a, b].every((t) => t >= 1 && t <= 6)).toBe(true);
    }
  });

  it('gera as 15 duplas na cobertura total', () => {
    const batch = generateGames(Lottery.MAIS_MILIONARIA, 2, milionariaPerformances(), {
      ...seeded(),
      trevoPerformances: trevoPerformances(),
      trevoStrategy: TrevoStrategy.COBERTURA_TOTAL,
    });

    for (const game of batch.games) {
      expect(game.trevoDuplas).toHaveLength(15);
      expect(new Set(game.trevoDuplas!.map((pair) => pair.join('-'))).size).toBe(15);
    }
  });

  it('cai no fallback uniforme com desempenho de trevos incompleto', () => {
    const batch = generateGames(Lottery.MAIS_MILIONARIA, 5, milionariaPerformances(), {
      ...seeded(),
      trevoPerformances: trevoPerformances().slice(0, 3),
    });

    expect(batch.games.every((game) => game.trevoDuplas?.length === 1)).toBe(true);
  });

  it('favorece o trevo de maior peso', () => {
    const counts = new Map<number, number>();
    for (let seed = 0; seed < 200; seed++) {
      const batch = generateGames(Lottery.MAIS_MILIONARIA, 5, milionariaPerformances(), {
        ...seeded(seed),
        trevoPerformances: trevoPerformances((n) => (n === 1 ? 100 : 0.01)),
      });
      for (const game of batch.games) {
        for (const trevo of game.trevoDuplas![0]) {
          counts.set(trevo, (counts.get(trevo) ?? 0) + 1);
        }
      }
    }

    expect(counts.get(1)!).toBeGreaterThan(counts.get(6) ?? 0);
  });

  it('allTrevoPairs devolve C(6,2) = 15 duplas ordenadas', () => {
    const pairs = allTrevoPairs(Lottery.MAIS_MILIONARIA);

    expect(pairs).toHaveLength(15);
    expect(pairs.every(([a, b]) => a < b)).toBe(true);
    expect(allTrevoPairs(Lottery.MEGA_SENA)).toEqual([]);
  });
});
