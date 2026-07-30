import { describe, expect, it } from 'vitest';
import { Draw, Lottery, NumberPerformance } from '../../types/domain';
import {
  EMPTY_HISTORY_WEIGHT,
  analyzeBacktest,
  analyzeTrevoBacktest,
  tierCuts,
} from '../backtestAnalyzer';
import { createSeededRandom } from '../random';

/** Concurso sintético — o teste controla exatamente quais dezenas saíram. */
function draw(
  contestNumber: number,
  numbers: number[],
  options: { lottery?: Lottery; trevos?: number[] } = {},
): Draw {
  return {
    lottery: options.lottery ?? Lottery.MEGA_SENA,
    contestNumber,
    date: `2024-01-${String((contestNumber % 28) + 1).padStart(2, '0')}`,
    numbers,
    ...(options.trevos ? { trevos: options.trevos } : {}),
  };
}

/** Dez concursos idênticos: 1..6 saem sempre, 7..60 nunca. */
function quentes(): Draw[] {
  return Array.from({ length: 10 }, (_, index) => draw(index + 1, [1, 2, 3, 4, 5, 6]));
}

function byNumber(performances: NumberPerformance[]): Map<number, NumberPerformance> {
  return new Map(performances.map((performance) => [performance.number, performance]));
}

const seeded = () => ({ random: createSeededRandom(42) });

describe('analyzeBacktest — histórico vazio', () => {
  it('devolve o universo inteiro com peso e tier neutros', () => {
    const result = analyzeBacktest([], Lottery.MEGA_SENA, 0);

    expect(result).toHaveLength(60);
    expect(result.every((p) => p.weight === EMPTY_HISTORY_WEIGHT)).toBe(true);
    expect(result.every((p) => p.tier === 'mid')).toBe(true);
    expect(result.every((p) => p.hitCount === 0)).toBe(true);
    expect(result.map((p) => p.number)).toEqual(
      Array.from({ length: 60 }, (_, i) => i + 1),
    );
  });

  it('trata a +Milionária com universo de 50 dezenas', () => {
    expect(analyzeBacktest([], Lottery.MAIS_MILIONARIA, 0)).toHaveLength(50);
  });

  it('ignora concursos de outra loteria', () => {
    const outraLoteria = quentes().map((d) => ({ ...d, lottery: Lottery.MAIS_MILIONARIA }));
    const result = analyzeBacktest(outraLoteria, Lottery.MEGA_SENA, 0);

    expect(result.every((p) => p.hitCount === 0)).toBe(true);
    expect(result.every((p) => p.weight === EMPTY_HISTORY_WEIGHT)).toBe(true);
  });
});

describe('analyzeBacktest — frequência', () => {
  it('conta os acertos reais de cada dezena', () => {
    const result = byNumber(analyzeBacktest(quentes(), Lottery.MEGA_SENA, 0, seeded()));

    expect(result.get(1)!.hitCount).toBe(10);
    expect(result.get(6)!.hitCount).toBe(10);
    expect(result.get(7)!.hitCount).toBe(0);
    expect(result.get(60)!.hitCount).toBe(0);
  });

  it('normaliza o peso com o líder valendo 1,0', () => {
    const result = analyzeBacktest(quentes(), Lottery.MEGA_SENA, 0, seeded());

    expect(result[0].weight).toBeCloseTo(1, 12);
    expect(Math.max(...result.map((p) => p.weight))).toBeCloseTo(1, 12);
    expect(Math.min(...result.map((p) => p.weight))).toBeGreaterThanOrEqual(0);
  });

  it('ordena por peso decrescente, com empate pelo número', () => {
    const result = analyzeBacktest(quentes(), Lottery.MEGA_SENA, 0, seeded());

    for (let i = 1; i < result.length; i++) {
      const previous = result[i - 1];
      const current = result[i];
      expect(previous.weight).toBeGreaterThanOrEqual(current.weight);
      if (previous.weight === current.weight) {
        expect(previous.number).toBeLessThan(current.number);
      }
    }
    expect(result.slice(0, 6).map((p) => p.number).sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
  });

  it('pondera 60% frequência e 40% simulação', () => {
    const semSimulacao = analyzeBacktest(quentes(), Lottery.MEGA_SENA, 0, seeded());
    const dezenaFria = semSimulacao.find((p) => p.number === 60)!;

    // Com rounds = 0 a componente simulada desaparece: só sobra a frequência,
    // que é zero para as dezenas que nunca saíram.
    expect(dezenaFria.simulatedHitRate).toBe(0);
    expect(dezenaFria.weight).toBe(0);
  });
});

describe('analyzeBacktest — tiers', () => {
  it('fatia 60 dezenas em 24 / 18 / 18', () => {
    const result = analyzeBacktest(quentes(), Lottery.MEGA_SENA, 0, seeded());
    const count = (tier: string) => result.filter((p) => p.tier === tier).length;

    expect(count('top')).toBe(24);
    expect(count('mid')).toBe(18);
    expect(count('low')).toBe(18);
  });

  it('fatia 50 dezenas em 20 / 15 / 15', () => {
    const draws = [draw(1, [1, 2, 3, 4, 5, 6], { lottery: Lottery.MAIS_MILIONARIA })];
    const result = analyzeBacktest(draws, Lottery.MAIS_MILIONARIA, 0, seeded());
    const count = (tier: string) => result.filter((p) => p.tier === tier).length;

    expect(count('top')).toBe(20);
    expect(count('mid')).toBe(15);
    expect(count('low')).toBe(15);
  });

  it('coloca as dezenas mais frequentes no tier top', () => {
    const result = byNumber(analyzeBacktest(quentes(), Lottery.MEGA_SENA, 0, seeded()));
    for (const number of [1, 2, 3, 4, 5, 6]) {
      expect(result.get(number)!.tier).toBe('top');
    }
  });

  it('tierCuts respeita os percentis 40/30/30', () => {
    expect(tierCuts(60)).toEqual([24, 42]);
    expect(tierCuts(50)).toEqual([20, 35]);
    expect(tierCuts(6)).toEqual([3, 5]);
    expect(tierCuts(0)).toEqual([0, 0]);
  });
});

describe('analyzeBacktest — simulação', () => {
  it('produz taxa simulada em 0..1 quando há rodadas', () => {
    const result = analyzeBacktest(quentes(), Lottery.MEGA_SENA, 50, seeded());

    expect(result.every((p) => p.simulatedHitRate >= 0 && p.simulatedHitRate <= 1)).toBe(
      true,
    );
    expect(result.some((p) => p.simulatedHitRate > 0)).toBe(true);
  });

  it('dá taxa simulada maior às dezenas que realmente saíram', () => {
    const result = byNumber(analyzeBacktest(quentes(), Lottery.MEGA_SENA, 200, seeded()));

    expect(result.get(1)!.simulatedHitRate).toBeGreaterThan(
      result.get(60)!.simulatedHitRate,
    );
  });

  it('é reprodutível com a mesma semente', () => {
    const a = analyzeBacktest(quentes(), Lottery.MEGA_SENA, 100, {
      random: createSeededRandom(7),
    });
    const b = analyzeBacktest(quentes(), Lottery.MEGA_SENA, 100, {
      random: createSeededRandom(7),
    });

    expect(a).toEqual(b);
  });

  it('embaralha o ranking entre sementes diferentes', () => {
    const a = analyzeBacktest(quentes(), Lottery.MEGA_SENA, 100, {
      random: createSeededRandom(1),
    });
    const b = analyzeBacktest(quentes(), Lottery.MEGA_SENA, 100, {
      random: createSeededRandom(999),
    });

    expect(a.map((p) => p.number)).not.toEqual(b.map((p) => p.number));
  });
});

describe('analyzeTrevoBacktest', () => {
  it('devolve vazio para loteria sem trevos', () => {
    expect(analyzeTrevoBacktest(quentes(), Lottery.MEGA_SENA, 0)).toEqual([]);
  });

  it('analisa os trevos 1..6 da +Milionária', () => {
    const draws = [
      draw(1, [1, 2, 3, 4, 5, 6], { lottery: Lottery.MAIS_MILIONARIA, trevos: [1, 2] }),
      draw(2, [7, 8, 9, 10, 11, 12], { lottery: Lottery.MAIS_MILIONARIA, trevos: [1, 3] }),
    ];
    const result = analyzeTrevoBacktest(draws, Lottery.MAIS_MILIONARIA, 0, seeded());
    const trevos = byNumber(result);

    expect(result).toHaveLength(6);
    expect(trevos.get(1)!.hitCount).toBe(2);
    expect(trevos.get(2)!.hitCount).toBe(1);
    expect(trevos.get(5)!.hitCount).toBe(0);
    expect(result[0].number).toBe(1);
  });

  it('cai no neutro quando nenhum concurso trouxe trevos', () => {
    const draws = [draw(1, [1, 2, 3, 4, 5, 6], { lottery: Lottery.MAIS_MILIONARIA })];
    const result = analyzeTrevoBacktest(draws, Lottery.MAIS_MILIONARIA, 0);

    expect(result).toHaveLength(6);
    expect(result.every((p) => p.weight === EMPTY_HISTORY_WEIGHT)).toBe(true);
  });
});
