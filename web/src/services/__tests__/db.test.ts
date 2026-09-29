import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Draw, Lottery } from '../../types/domain';
import {
  clearPerformances,
  db,
  getDraws,
  getDrawsAfter,
  getDrawsUpTo,
  getPerformances,
  getLastContest,
  getStoredContests,
  MANUAL_CACHE_TTL_MS,
  markHistorySeeded,
  saveDraws,
  savePerformances,
  seedIfEmpty,
} from '../db';

function draw(contestNumber: number, date: string, lottery: Lottery = Lottery.MEGA_SENA): Draw {
  return { lottery, contestNumber, date, numbers: [1, 2, 3, 4, 5, 6] };
}

beforeEach(async () => {
  await db.draws.clear();
  await db.performances.clear();
  // getDraws/getDrawsUpTo/getDrawsAfter chamam seedIfEmpty() sozinhos (ver
  // "seed offline" abaixo); marcar como já aplicado aqui mantém estes testes
  // de CRUD puro isolados desse comportamento.
  await markHistorySeeded();
});

afterEach(async () => {
  await db.draws.clear();
  await db.performances.clear();
  await db.config.clear();
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

  it('não deixa a análise auto expirar (sem expiresAt)', async () => {
    await savePerformances(
      Lottery.MEGA_SENA,
      [{ number: 1, hitCount: 1, simulatedHitRate: 0.1, weight: 1, tier: 'top' }],
      [],
      { source: 'auto' },
    );

    const record = await getPerformances(Lottery.MEGA_SENA);
    expect(record?.expiresAt).toBeUndefined();
  });

  it('dá validade padrão (MANUAL_CACHE_TTL_MS) a um backtest manual', async () => {
    const before = Date.now();
    await savePerformances(
      Lottery.MEGA_SENA,
      [{ number: 1, hitCount: 1, simulatedHitRate: 0.1, weight: 1, tier: 'top' }],
      [],
      { source: 'manual', force: true },
    );

    const record = await getPerformances(Lottery.MEGA_SENA);
    expect(record?.expiresAt).toBeDefined();
    const expiry = Date.parse(record!.expiresAt!);
    expect(expiry).toBeGreaterThanOrEqual(before + MANUAL_CACHE_TTL_MS - 1000);
  });

  it('descarta e devolve undefined quando o cache já expirou', async () => {
    await db.performances.put({
      lottery: Lottery.MEGA_SENA,
      performances: [{ number: 1, hitCount: 1, simulatedHitRate: 0.1, weight: 1, tier: 'top' }],
      trevoPerformances: [],
      source: 'manual',
      updatedAt: new Date(Date.now() - 2 * MANUAL_CACHE_TTL_MS).toISOString(),
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });

    expect(await getPerformances(Lottery.MEGA_SENA)).toBeUndefined();
    // O registro expirado é removido, não só ignorado na leitura.
    expect(await db.performances.get(Lottery.MEGA_SENA)).toBeUndefined();
  });

  it('clearPerformances remove o cache da loteria', async () => {
    await savePerformances(Lottery.MEGA_SENA, [
      { number: 1, hitCount: 1, simulatedHitRate: 0.1, weight: 1, tier: 'top' },
    ]);

    await clearPerformances(Lottery.MEGA_SENA);

    expect(await getPerformances(Lottery.MEGA_SENA)).toBeUndefined();
  });
});

describe('seed do histórico real (primeiro uso)', () => {
  // Aqui a flag do seed precisa começar limpa — é exatamente o que este bloco testa.
  beforeEach(async () => {
    await db.config.clear();
  });

  it('popula o banco com o histórico COMPLETO de ambas as loterias, desde o concurso 1', async () => {
    await seedIfEmpty();

    for (const lottery of [Lottery.MEGA_SENA, Lottery.MAIS_MILIONARIA]) {
      const draws = await getDraws(lottery);
      expect(draws[0].contestNumber).toBe(1);
      expect(draws.map((d) => d.contestNumber)).toEqual(draws.map((_, i) => i + 1));
      expect(draws.length).toBeGreaterThan(300);
    }
    expect((await getDraws(Lottery.MEGA_SENA)).length).toBeGreaterThan(3000);
  });

  it('getDraws aciona o seed sozinho na primeira leitura', async () => {
    expect((await getDraws(Lottery.MEGA_SENA)).length).toBeGreaterThan(3000);
  });

  it('não reaplica o seed depois da primeira vez, mesmo se o histórico for apagado', async () => {
    await seedIfEmpty();
    await db.draws.clear();

    await seedIfEmpty();

    expect(await getDraws(Lottery.MEGA_SENA)).toHaveLength(0);
  });

  it('só PREENCHE o que falta: nunca sobrescreve um concurso já sincronizado', async () => {
    await saveDraws([{ ...draw(100, '2099-01-01'), numbers: [7, 8, 9, 10, 11, 12] }, draw(999999, '2099-02-02')]);

    await seedIfEmpty();

    const result = await getDraws(Lottery.MEGA_SENA);
    const kept = result.find((d) => d.contestNumber === 100);
    expect(kept?.date).toBe('2099-01-01');
    expect(kept?.numbers).toEqual([7, 8, 9, 10, 11, 12]);
    expect(result.some((d) => d.contestNumber === 999999)).toBe(true);
    expect(result.some((d) => d.contestNumber === 1)).toBe(true);
  });

  it('remove o seed SINTÉTICO que versões antigas gravaram, e só ele', async () => {
    const { getSyntheticFixture } = await import('../../data/syntheticFixture');
    const fake = getSyntheticFixture(Lottery.MEGA_SENA)[0];
    await db.draws.put(fake);
    // Uma linha real com o mesmo número de concurso mas conteúdo diferente NÃO pode ser apagada.
    const fakeMais = getSyntheticFixture(Lottery.MAIS_MILIONARIA)[0];
    await db.draws.put({ ...fakeMais, numbers: [1, 2, 3, 4, 5, 6] });

    await seedIfEmpty();

    const mega = await getDraws(Lottery.MEGA_SENA);
    expect(mega.find((d) => d.contestNumber === fake.contestNumber)?.numbers).not.toEqual(fake.numbers);
    const mais = await getDraws(Lottery.MAIS_MILIONARIA);
    expect(mais.find((d) => d.contestNumber === fakeMais.contestNumber)?.numbers).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('chamadas simultâneas não duplicam nem quebram', async () => {
    await Promise.all([seedIfEmpty(), seedIfEmpty(), seedIfEmpty()]);
    const draws = await getDraws(Lottery.MAIS_MILIONARIA);
    expect(new Set(draws.map((d) => d.contestNumber)).size).toBe(draws.length);
  });
});

describe('getLastContest / getStoredContests', () => {
  it('devolvem o maior concurso e o conjunto salvo, por loteria', async () => {
    await saveDraws([draw(5, '2024-01-01'), draw(9, '2024-02-01'), draw(2, '2024-03-01', Lottery.MAIS_MILIONARIA)]);

    expect(await getLastContest(Lottery.MEGA_SENA)).toBe(9);
    expect(await getLastContest(Lottery.MAIS_MILIONARIA)).toBe(2);
    expect([...(await getStoredContests(Lottery.MEGA_SENA))].sort()).toEqual([5, 9]);
  });

  it('null quando não há nada', async () => {
    expect(await getLastContest(Lottery.MEGA_SENA)).toBeNull();
  });
});
