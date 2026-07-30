import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Draw, Lottery } from '../../types/domain';
import {
  db,
  getDraws,
  getDrawsAfter,
  getDrawsUpTo,
  getPerformances,
  saveDraws,
  savePerformances,
} from '../db';

function draw(contestNumber: number, date: string, lottery: Lottery = Lottery.MEGA_SENA): Draw {
  return { lottery, contestNumber, date, numbers: [1, 2, 3, 4, 5, 6] };
}

beforeEach(async () => {
  await db.draws.clear();
  await db.performances.clear();
});

afterEach(async () => {
  await db.draws.clear();
  await db.performances.clear();
});

describe('draws — saveDraws / getDraws', () => {
  it('grava e devolve o histórico ordenado por concurso', async () => {
    await saveDraws([
      draw(3, '2024-03-01'),
      draw(1, '2024-01-01'),
      draw(2, '2024-02-01'),
    ]);

    const result = await getDraws(Lottery.MEGA_SENA);

    expect(result.map((d) => d.contestNumber)).toEqual([1, 2, 3]);
  });

  it('faz upsert pela chave composta [lottery+contestNumber]', async () => {
    await saveDraws([draw(1, '2024-01-01')]);
    await saveDraws([{ ...draw(1, '2024-01-02'), numbers: [10, 20, 30, 40, 50, 60] }]);

    const result = await getDraws(Lottery.MEGA_SENA);

    expect(result).toHaveLength(1);
    expect(result[0].date).toBe('2024-01-02');
    expect(result[0].numbers).toEqual([10, 20, 30, 40, 50, 60]);
  });

  it('separa o histórico por loteria', async () => {
    await saveDraws([
      draw(1, '2024-01-01', Lottery.MEGA_SENA),
      draw(1, '2024-01-01', Lottery.MAIS_MILIONARIA),
    ]);

    expect(await getDraws(Lottery.MEGA_SENA)).toHaveLength(1);
    expect(await getDraws(Lottery.MAIS_MILIONARIA)).toHaveLength(1);
  });

  it('devolve vazio quando não há histórico', async () => {
    expect(await getDraws(Lottery.MEGA_SENA)).toEqual([]);
  });
});

describe('draws — corte treino/validação', () => {
  beforeEach(async () => {
    await saveDraws([
      draw(1, '2024-01-01'),
      draw(2, '2024-03-01'),
      draw(3, '2024-06-30'),
      draw(4, '2024-07-01'),
      draw(5, '2024-12-31'),
    ]);
  });

  it('getDrawsUpTo inclui o próprio dia de corte', async () => {
    const training = await getDrawsUpTo(Lottery.MEGA_SENA, '2024-06-30');

    expect(training.map((d) => d.contestNumber)).toEqual([1, 2, 3]);
  });

  it('getDrawsAfter exclui o próprio dia de corte', async () => {
    const validation = await getDrawsAfter(Lottery.MEGA_SENA, '2024-06-30');

    expect(validation.map((d) => d.contestNumber)).toEqual([4, 5]);
  });

  it('treino e validação são complementares e não se sobrepõem', async () => {
    const training = await getDrawsUpTo(Lottery.MEGA_SENA, '2024-06-30');
    const validation = await getDrawsAfter(Lottery.MEGA_SENA, '2024-06-30');

    expect(training.length + validation.length).toBe(5);
  });

  it('não mistura loterias diferentes no corte', async () => {
    await saveDraws([draw(1, '2024-02-01', Lottery.MAIS_MILIONARIA)]);

    const training = await getDrawsUpTo(Lottery.MAIS_MILIONARIA, '2024-06-30');

    expect(training).toHaveLength(1);
  });
});

describe('performances — savePerformances / getPerformances', () => {
  it('devolve undefined quando nunca foi salvo', async () => {
    expect(await getPerformances(Lottery.MEGA_SENA)).toBeUndefined();
  });

  it('grava e recupera o desempenho cacheado', async () => {
    const performances = [
      { number: 1, hitCount: 5, simulatedHitRate: 0.5, weight: 1, tier: 'top' as const },
    ];

    await savePerformances(Lottery.MEGA_SENA, performances);
    const record = await getPerformances(Lottery.MEGA_SENA);

    expect(record?.performances).toEqual(performances);
    expect(record?.trevoPerformances).toEqual([]);
    expect(record?.updatedAt).toBeDefined();
  });

  it('sobrescreve o cache anterior da mesma loteria', async () => {
    await savePerformances(Lottery.MEGA_SENA, [
      { number: 1, hitCount: 1, simulatedHitRate: 0.1, weight: 0.5, tier: 'mid' },
    ]);
    await savePerformances(Lottery.MEGA_SENA, [
      { number: 2, hitCount: 2, simulatedHitRate: 0.2, weight: 1, tier: 'top' },
    ]);

    const record = await getPerformances(Lottery.MEGA_SENA);

    expect(record?.performances).toHaveLength(1);
    expect(record?.performances[0].number).toBe(2);
  });

  it('mantém o cache de cada loteria isolado', async () => {
    await savePerformances(Lottery.MEGA_SENA, [
      { number: 1, hitCount: 1, simulatedHitRate: 0.1, weight: 1, tier: 'top' },
    ]);

    expect(await getPerformances(Lottery.MAIS_MILIONARIA)).toBeUndefined();
  });
});
