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
import {
  STRATEGY_LABEL,
  UNPOPULAR_STRATEGY_LABEL,
  allTrevoPairs,
  generateGames,
} from '../gameGenerator';
import { unpopularityPenalty } from '../unpopularity';
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

const seeded = (seed = 42) => ({
  random: createSeededRandom(seed),
  strategy: 'FREQUENCY_TIERS' as const,
});

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
      MAX_GAMES,
      megaPerformances(),
      seeded(),
    );
    expect(batch.performancesSnapshot).toHaveLength(50);
    expect(allNumbers(batch.games).every((n) => n >= 1 && n <= 50)).toBe(true);
  });
});

describe('generateGames — forma do jogo', () => {
  it('produz 6 dezenas distintas e em ordem crescente', () => {
    const batch = generateGames(Lottery.MEGA_SENA, MAX_GAMES, megaPerformances(), seeded());

    for (const game of batch.games) {
      expect(game.numbers).toHaveLength(6);
      expect(new Set(game.numbers).size).toBe(6);
      expect([...game.numbers].sort((a, b) => a - b)).toEqual(game.numbers);
      expect(game.numbers.every((n) => n >= 1 && n <= 60)).toBe(true);
    }
  });

  it('não repete nenhuma dezena entre os jogos do lote', () => {
    // A garantia central da v2.1: 4 jogos × 6 dezenas = 24 dezenas distintas.
    for (let seed = 1; seed <= 30; seed++) {
      const batch = generateGames(Lottery.MEGA_SENA, MAX_GAMES, megaPerformances(), seeded(seed));
      const todas = allNumbers(batch.games);

      expect(todas).toHaveLength(MAX_GAMES * 6);
      expect(new Set(todas).size).toBe(MAX_GAMES * 6);
    }
  });

  it('limita o lote às dezenas disponíveis em vez de devolver jogo incompleto', () => {
    // 15 dezenas elegíveis sustentam 2 jogos (15 / 6); o 3º sairia com 3
    // dezenas se o teto não existisse.
    const source = performances(60).slice(0, 15);
    const batch = generateGames(Lottery.MEGA_SENA, MAX_GAMES, source, seeded());

    expect(batch.games).toHaveLength(2);
    for (const game of batch.games) {
      expect(game.numbers).toHaveLength(6);
    }
    expect(new Set(allNumbers(batch.games)).size).toBe(12);
  });

  it('rotula o lote como Backtest-Driven e guarda o snapshot', () => {
    const batch = generateGames(Lottery.MEGA_SENA, 2, megaPerformances(), seeded());

    expect(batch.strategyLabel).toBe(STRATEGY_LABEL);
    expect(batch.lottery).toBe(Lottery.MEGA_SENA);
    expect(batch.performancesSnapshot).toHaveLength(60);
    expect(batch.sourcePool).toBeUndefined();
  });

  it('é reprodutível com a mesma semente', () => {
    const a = generateGames(Lottery.MEGA_SENA, MAX_GAMES, megaPerformances(), seeded(7));
    const b = generateGames(Lottery.MEGA_SENA, MAX_GAMES, megaPerformances(), seeded(7));
    const c = generateGames(Lottery.MEGA_SENA, MAX_GAMES, megaPerformances(), seeded(8));

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
      const batch = generateGames(Lottery.MEGA_SENA, MAX_GAMES, megaPerformances(), seeded(seed));
      const signatures = batch.games.map((game) => game.numbers.join('-'));
      expect(new Set(signatures).size).toBe(MAX_GAMES);
    }
  });

  it('entrega um único jogo quando o pool só dá para uma combinação', () => {
    // Exatamente 6 dezenas elegíveis: só existe uma combinação possível. Antes
    // da v2.1 o lote repetia essa combinação `count` vezes; com deduplicação
    // absoluta repetir seria justamente o que a regra proíbe, então o lote sai
    // com um jogo só.
    const batch = generateGames(Lottery.MEGA_SENA, 3, megaPerformances(), {
      ...seeded(),
      pool: [1, 2, 3, 4, 5, 6],
    });

    expect(batch.games).toHaveLength(1);
    expect(batch.games[0].numbers).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe('generateGames — distribuição por tiers', () => {
  it('tira ~70% das dezenas do tier top, ~20% do mid e ~10% do low', () => {
    const source = megaPerformances();
    const tierOf = new Map(source.map((p) => [p.number, p.tier]));
    const tally: Record<PerformanceTier, number> = { top: 0, mid: 0, low: 0 };

    for (let seed = 0; seed < 300; seed++) {
      const batch = generateGames(Lottery.MEGA_SENA, MAX_GAMES, source, seeded(seed));
      for (const number of allNumbers(batch.games)) {
        tally[tierOf.get(number)!]++;
      }
    }

    const total = tally.top + tally.mid + tally.low;
    expect(total).toBe(300 * MAX_GAMES * 6);
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
    const lotes = 200;

    for (let seed = 0; seed < lotes; seed++) {
      const batch = generateGames(Lottery.MEGA_SENA, MAX_GAMES, source, seeded(seed));
      for (const number of allNumbers(batch.games)) {
        counts.set(number, (counts.get(number) ?? 0) + 1);
      }
    }

    // Sob deduplicação absoluta uma dezena entra no máximo uma vez por lote, de
    // modo que o peso não se converte em repetição — converte-se em presença.
    // A dezena dominante comparece em praticamente todo lote; uma dezena comum
    // do mesmo tier disputa as vagas restantes com as outras 23.
    expect(counts.get(1)!).toBeGreaterThan(lotes * 0.95);
    expect(counts.get(1)!).toBeGreaterThan(counts.get(2) ?? 0);
  });

  it('degenera em sorteio uniforme quando todos os pesos são zero', () => {
    const source = performances(60, () => 0);
    const batch = generateGames(Lottery.MEGA_SENA, MAX_GAMES, source, seeded());

    expect(batch.games).toHaveLength(MAX_GAMES);
    for (const game of batch.games) {
      expect(new Set(game.numbers).size).toBe(6);
    }
  });
});

describe('generateGames — fechamento', () => {
  it('restringe os jogos às dezenas do volante', () => {
    const pool = [3, 9, 14, 21, 27, 33, 41, 52, 58, 60];
    const batch = generateGames(Lottery.MEGA_SENA, MAX_GAMES, megaPerformances(), {
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
    const batch = generateGames(Lottery.MEGA_SENA, MAX_GAMES, source, { ...seeded(), pool });

    // 8 dezenas no fechamento só sustentam 1 jogo sem repetição (8 / 6).
    expect(batch.games).toHaveLength(1);
    expect(allNumbers(batch.games).every((n) => pool.includes(n))).toBe(true);
  });
});

describe('generateGames — trevos', () => {
  it('não gera trevos na Mega-Sena', () => {
    const batch = generateGames(Lottery.MEGA_SENA, 3, megaPerformances(), seeded());
    expect(batch.games.every((game) => game.trevoDuplas === undefined)).toBe(true);
  });

  it('gera uma dupla ordenada por jogo no modo econômico', () => {
    const batch = generateGames(Lottery.MAIS_MILIONARIA, MAX_GAMES, milionariaPerformances(), {
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
    const batch = generateGames(Lottery.MAIS_MILIONARIA, MAX_GAMES, milionariaPerformances(), {
      ...seeded(),
      trevoPerformances: trevoPerformances().slice(0, 3),
    });

    expect(batch.games.every((game) => game.trevoDuplas?.length === 1)).toBe(true);
  });

  it('favorece o trevo de maior peso', () => {
    const counts = new Map<number, number>();
    for (let seed = 0; seed < 200; seed++) {
      const batch = generateGames(Lottery.MAIS_MILIONARIA, MAX_GAMES, milionariaPerformances(), {
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

describe('generateGames — estratégia UNPOPULAR (padrão)', () => {
  const unpopularPenalty = (games: GeneratedGame[]) =>
    games.reduce((sum, g) => sum + unpopularityPenalty(Lottery.MEGA_SENA, g.numbers), 0) / games.length;

  it('é o padrão e rotula o lote', () => {
    const batch = generateGames(Lottery.MEGA_SENA, 3, megaPerformances(), {
      random: createSeededRandom(1),
    });
    expect(batch.strategyLabel).toBe(UNPOPULAR_STRATEGY_LABEL);
  });

  it('mantém os invariantes: 6 dezenas distintas, dezenas sem repetição entre jogos', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const batch = generateGames(Lottery.MEGA_SENA, 4, megaPerformances(), {
        random: createSeededRandom(seed),
      });
      const all = allNumbers(batch.games);
      expect(batch.games).toHaveLength(4);
      expect(new Set(all).size).toBe(24);
      for (const game of batch.games) {
        expect(game.numbers).toHaveLength(6);
        expect(game.numbers.every((n) => n >= 1 && n <= 60)).toBe(true);
      }
    }
  });

  it('é bem menos popular que o sorteio uniforme', () => {
    const rnd = createSeededRandom(2);
    const unpopular: GeneratedGame[] = [];
    const uniform: GeneratedGame[] = [];
    for (let i = 0; i < 300; i++) {
      unpopular.push(
        ...generateGames(Lottery.MEGA_SENA, 2, megaPerformances(), { random: rnd }).games,
      );
      const s = new Set<number>();
      while (s.size < 6) s.add(1 + rnd.nextInt(60));
      uniform.push({ numbers: [...s] });
    }
    expect(unpopularPenalty(unpopular)).toBeLessThan(unpopularPenalty(uniform) * 0.85);
  });

  it('ignora os pesos do histórico (nenhuma dezena é favorecida por frequência)', () => {
    // Pesos extremamente enviesados para 1..10 não podem mudar a frequência de escolha.
    const skewed = performances(60, (n) => (n <= 10 ? 100 : 1));
    const flat = megaPerformances();
    const share = (perf: NumberPerformance[]) => {
      const rnd = createSeededRandom(9);
      let low = 0;
      let total = 0;
      for (let i = 0; i < 1500; i++) {
        for (const g of generateGames(Lottery.MEGA_SENA, 2, perf, { random: rnd }).games) {
          low += g.numbers.filter((n) => n <= 10).length;
          total += 6;
        }
      }
      return low / total;
    };
    expect(Math.abs(share(skewed) - share(flat))).toBeLessThan(0.02);
  });

  it('+Milionária: trevos uniformes entre 1..6', () => {
    const rnd = createSeededRandom(4);
    const counts = new Map<number, number>();
    for (let i = 0; i < 3000; i++) {
      const [game] = generateGames(Lottery.MAIS_MILIONARIA, 2, milionariaPerformances(), {
        random: rnd,
      }).games;
      for (const t of game.trevoDuplas![0]) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    const expected = (3000 * 2) / 6;
    for (let t = 1; t <= 6; t++) {
      expect(Math.abs((counts.get(t) ?? 0) - expected) / expected).toBeLessThan(0.12);
    }
  });
});

describe('generateGames — disjunção entre jogos (achado §4.2)', () => {
  it('modo "máximo valor" permite compartilhar dezenas e nunca repete o jogo exato', () => {
    let shared = false;
    for (let seed = 1; seed <= 50; seed++) {
      const batch = generateGames(Lottery.MEGA_SENA, MAX_GAMES, megaPerformances(), {
        random: createSeededRandom(seed),
        disjointNumbers: false,
      });
      expect(batch.games).toHaveLength(MAX_GAMES);
      const all = allNumbers(batch.games);
      if (new Set(all).size < all.length) shared = true;
      // Mesmo relaxado, o jogo exato nunca se repete dentro do lote.
      expect(new Set(batch.games.map((g) => g.numbers.join('-'))).size).toBe(MAX_GAMES);
      for (const game of batch.games) {
        expect(game.numbers).toHaveLength(6);
        expect(new Set(game.numbers).size).toBe(6);
      }
    }
    expect(shared).toBe(true);
  });

  it('padrão (disjunto) mantém dezenas distintas entre jogos', () => {
    const batch = generateGames(Lottery.MEGA_SENA, MAX_GAMES, megaPerformances(), {
      random: createSeededRandom(3),
    });
    expect(new Set(allNumbers(batch.games)).size).toBe(MAX_GAMES * 6);
  });
});

describe('generateGames — trevos complementares (estratégia padrão)', () => {  it('+Milionária: 3 jogos recebem duplas disjuntas que cobrem os 6 trevos', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const batch = generateGames(Lottery.MAIS_MILIONARIA, 3, milionariaPerformances(), {
        random: createSeededRandom(seed),
        trevoStrategy: TrevoStrategy.ECONOMICO,
      });
      const duplas = batch.games.map((game) => game.trevoDuplas![0]);
      expect(new Set(duplas.map(([a, b]) => `${a}-${b}`)).size).toBe(3);
      expect(new Set(duplas.flat()).size).toBe(6);
    }
  });

  it('+Milionária: 4 jogos recebem 4 duplas distintas cobrindo os 6 trevos', () => {
    const batch = generateGames(Lottery.MAIS_MILIONARIA, MAX_GAMES, milionariaPerformances(), {
      random: createSeededRandom(7),
      trevoStrategy: TrevoStrategy.ECONOMICO,
    });
    const duplas = batch.games.map((game) => game.trevoDuplas![0]);
    expect(new Set(duplas.map(([a, b]) => `${a}-${b}`)).size).toBe(MAX_GAMES);
    expect(new Set(duplas.flat()).size).toBe(6);
  });

  it('nunca repete dupla dentro do lote, em nenhum tamanho de lote', () => {
    for (let seed = 1; seed <= 50; seed++) {
      for (const count of [2, 3, MAX_GAMES]) {
        const batch = generateGames(Lottery.MAIS_MILIONARIA, count, milionariaPerformances(), {
          random: createSeededRandom(seed * 10 + count),
          trevoStrategy: TrevoStrategy.ECONOMICO,
        });
        const signatures = batch.games.map((game) => game.trevoDuplas![0].join('-'));
        expect(new Set(signatures).size).toBe(count);
      }
    }
  });
});
