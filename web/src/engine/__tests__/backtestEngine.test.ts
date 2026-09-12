import { describe, expect, it } from 'vitest';
import { Draw, Lottery, MAX_GAMES, TrevoStrategy } from '../../types/domain';
import { runBacktest } from '../backtestEngine';

function draw(
  contestNumber: number,
  date: string,
  numbers: number[],
  options: { lottery?: Lottery; trevos?: number[] } = {},
): Draw {
  return {
    lottery: options.lottery ?? Lottery.MEGA_SENA,
    contestNumber,
    date,
    numbers,
    ...(options.trevos ? { trevos: options.trevos } : {}),
  };
}

function trainingWindow(count: number, lottery: Lottery = Lottery.MEGA_SENA): Draw[] {
  return Array.from({ length: count }, (_, index) =>
    draw(index + 1, `2024-01-${String((index % 28) + 1).padStart(2, '0')}`, [1, 2, 3, 4, 5, 6], {
      lottery,
    }),
  );
}

function validationWindow(count: number, lottery: Lottery = Lottery.MEGA_SENA): Draw[] {
  return Array.from({ length: count }, (_, index) =>
    draw(
      1000 + index,
      `2024-06-${String((index % 28) + 1).padStart(2, '0')}`,
      [7, 8, 9, 10, 11, 12],
      { lottery },
    ),
  );
}

describe('runBacktest — validação', () => {
  it('rejeita janela de validação vazia', () => {
    expect(() => runBacktest(Lottery.MEGA_SENA, trainingWindow(10), [])).toThrow(RangeError);
  });

  it('funciona com janela de treino vazia (fallback neutro do analyzer)', () => {
    const report = runBacktest(Lottery.MEGA_SENA, [], validationWindow(3), { seed: 1 });

    expect(report.trainingDraws).toBe(0);
    expect(report.performances).toHaveLength(60);
  });
});

describe('runBacktest — contagens', () => {
  it('registra o tamanho das janelas de treino e validação', () => {
    const training = trainingWindow(20);
    const validation = validationWindow(5);
    const report = runBacktest(Lottery.MEGA_SENA, training, validation, { seed: 7 });

    expect(report.trainingDraws).toBe(20);
    expect(report.validationDraws).toBe(5);
  });

  it('conta um jogo por concurso de validação x gamesPerContest', () => {
    const report = runBacktest(Lottery.MEGA_SENA, trainingWindow(10), validationWindow(4), {
      seed: 7,
      gamesPerContest: 3,
    });

    expect(report.totalGames).toBe(4 * 3);
  });

  it('na Mega-Sena, totalBets == totalGames (sem trevos)', () => {
    const report = runBacktest(Lottery.MEGA_SENA, trainingWindow(10), validationWindow(4), {
      seed: 7,
      gamesPerContest: MAX_GAMES,
    });

    expect(report.totalBets).toBe(report.totalGames);
  });

  it('na +Milionária econômica, totalBets == totalGames (1 dupla por jogo)', () => {
    const report = runBacktest(
      Lottery.MAIS_MILIONARIA,
      trainingWindow(10, Lottery.MAIS_MILIONARIA),
      validationWindow(4, Lottery.MAIS_MILIONARIA),
      { seed: 7, gamesPerContest: 3, trevoStrategy: TrevoStrategy.ECONOMICO },
    );

    expect(report.totalBets).toBe(report.totalGames);
  });

  it('na +Milionária de cobertura total, totalBets == totalGames x 15', () => {
    const report = runBacktest(
      Lottery.MAIS_MILIONARIA,
      trainingWindow(10, Lottery.MAIS_MILIONARIA),
      validationWindow(4, Lottery.MAIS_MILIONARIA),
      { seed: 7, gamesPerContest: 3, trevoStrategy: TrevoStrategy.COBERTURA_TOTAL },
    );

    expect(report.totalBets).toBe(report.totalGames * 15);
  });

  it('a distribuição de acertos soma o total de jogos', () => {
    const report = runBacktest(Lottery.MEGA_SENA, trainingWindow(10), validationWindow(6), {
      seed: 7,
      gamesPerContest: 4,
    });
    const distributed = Object.values(report.hitDistribution).reduce((a, b) => a + b, 0);

    expect(distributed).toBe(report.totalGames);
  });
});

describe('runBacktest — baseline hipergeométrico', () => {
  it('usa 0,60 como média esperada na Mega-Sena', () => {
    const report = runBacktest(Lottery.MEGA_SENA, trainingWindow(5), validationWindow(3), {
      seed: 1,
    });

    expect(report.expectedMeanHits).toBeCloseTo(0.6, 12);
  });

  it('usa 0,72 como média esperada na +Milionária', () => {
    const report = runBacktest(
      Lottery.MAIS_MILIONARIA,
      trainingWindow(5, Lottery.MAIS_MILIONARIA),
      validationWindow(3, Lottery.MAIS_MILIONARIA),
      { seed: 1 },
    );

    expect(report.expectedMeanHits).toBeCloseTo(0.72, 12);
  });
});

describe('runBacktest — taxa de eficácia', () => {
  it('mantém prizeRate em [0, 1]', () => {
    const report = runBacktest(Lottery.MEGA_SENA, trainingWindow(15), validationWindow(20), {
      seed: 3,
      gamesPerContest: MAX_GAMES,
    });

    expect(report.prizeRate).toBeGreaterThanOrEqual(0);
    expect(report.prizeRate).toBeLessThanOrEqual(1);
    expect(report.prizeRate).toBeCloseTo(report.prizeCount / report.totalBets, 12);
  });
});

describe('runBacktest — reprodutibilidade', () => {
  it('é determinístico com a mesma semente', () => {
    const a = runBacktest(Lottery.MEGA_SENA, trainingWindow(10), validationWindow(5), {
      seed: 42,
    });
    const b = runBacktest(Lottery.MEGA_SENA, trainingWindow(10), validationWindow(5), {
      seed: 42,
    });

    expect(a).toEqual(b);
  });

  it('varia entre sementes diferentes', () => {
    const a = runBacktest(Lottery.MEGA_SENA, trainingWindow(10), validationWindow(5), {
      seed: 1,
    });
    const b = runBacktest(Lottery.MEGA_SENA, trainingWindow(10), validationWindow(5), {
      seed: 2,
    });

    expect(a.hitDistribution).not.toEqual(b.hitDistribution);
  });
});
