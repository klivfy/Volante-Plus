import { describe, expect, it } from 'vitest';
import { Draw, Lottery } from '../../types/domain';
import { DrawSource } from '../drawSources';
import { analyzeHistory, BULK_THRESHOLD, missingContests, syncLottery } from '../historySync';

const L = Lottery.MEGA_SENA;
const draw = (n: number): Draw => ({ lottery: L, contestNumber: n, date: '2030-01-01', numbers: [1, 2, 3, 4, 5, 6] });

function memory(initial: number[] = []) {
  const store = new Map<number, Draw>(initial.map((n) => [n, draw(n)]));
  return {
    store,
    deps: (sources: DrawSource[], concurrency?: number) => ({
      sources,
      concurrency,
      storedContests: async () => new Set(store.keys()),
      save: async (draws: Draw[]) => draws.forEach((d) => store.set(d.contestNumber, d)),
    }),
  };
}

function source(latest: number, overrides: Partial<DrawSource> = {}): DrawSource & { fetched: number[]; bulk: number } {
  const state = { fetched: [] as number[], bulk: 0 };
  return {
    name: 's',
    latest: async () => draw(latest),
    byContest: async (_l, n) => (state.fetched.push(n), n <= latest ? draw(n) : null),
    ...overrides,
    get fetched() {
      return state.fetched;
    },
    get bulk() {
      return state.bulk;
    },
  } as DrawSource & { fetched: number[]; bulk: number };
}

describe('analyzeHistory / missingContests', () => {
  it('histórico contíguo desde o 1 e no último conhecido está completo', () => {
    const s = analyzeHistory(L, [1, 2, 3, 4, 5], 5);
    expect(s).toMatchObject({ count: 5, firstContest: 1, lastContest: 5, complete: true, missing: [] });
  });
  it('acha lacunas no meio, no começo e no fim', () => {
    expect(analyzeHistory(L, [2, 3, 6], 8).missing).toEqual([1, 4, 5, 7, 8]);
    expect(analyzeHistory(L, [1, 2, 3], 5).complete).toBe(false);
  });
  it('sem nenhum concurso nunca é "completo"', () => {
    expect(analyzeHistory(L, [], null).complete).toBe(false);
  });
  it('missingContests em ordem crescente', () => {
    expect(missingContests(new Set([2, 4]), 5)).toEqual([1, 3, 5]);
  });
});

describe('syncLottery', () => {
  it('em dia: só pergunta o último, não baixa nenhum concurso individual', async () => {
    const mem = memory([1, 2, 3]);
    const s = source(3);
    const report = await syncLottery(L, mem.deps([s]));
    expect(report).toMatchObject({ reachable: true, latest: 3, added: 0, missingAfter: [] });
    expect(s.fetched).toEqual([]);
  });

  it('concursos novos: busca exatamente os que faltam depois do último salvo', async () => {
    const mem = memory([1, 2, 3]);
    const s = source(6);
    const report = await syncLottery(L, mem.deps([s]));
    expect(report.added).toBe(3);
    expect(s.fetched.sort()).toEqual([4, 5]); // o 6 já veio do "latest"
    expect([...mem.store.keys()].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('lacuna antiga no meio do histórico é preenchida', async () => {
    const mem = memory([1, 2, 5, 6]);
    await syncLottery(L, mem.deps([source(6)]));
    expect([...mem.store.keys()].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('muitos ausentes: usa o histórico inteiro de uma vez em vez de N chamadas', async () => {
    const mem = memory([]);
    const latest = BULK_THRESHOLD + 40;
    let bulkCalls = 0;
    const s = source(latest, {
      all: async () => (bulkCalls++, Array.from({ length: latest }, (_, i) => draw(i + 1))),
    });
    const report = await syncLottery(L, mem.deps([s]));
    expect(bulkCalls).toBe(1);
    expect(s.fetched).toEqual([]);
    expect(report.missingAfter).toEqual([]);
    expect(mem.store.size).toBe(latest);
  });

  it('fallback entre fontes: a primeira cai, a segunda entrega', async () => {
    const mem = memory([1, 2]);
    const dead: DrawSource = { name: 'dead', latest: async () => null, byContest: async () => null };
    const report = await syncLottery(L, mem.deps([dead, source(4)]));
    expect(report.source).toBe('s');
    expect([...mem.store.keys()].sort()).toEqual([1, 2, 3, 4]);
  });

  it('uma fonte que LANÇA é tratada como indisponível', async () => {
    const mem = memory([1]);
    const boom: DrawSource = {
      name: 'boom',
      latest: async () => {
        throw new Error('rede');
      },
      byContest: async () => {
        throw new Error('rede');
      },
    };
    const report = await syncLottery(L, mem.deps([boom, source(2)]));
    expect(report.reachable).toBe(true);
    expect(mem.store.has(2)).toBe(true);
  });

  it('todas as fontes fora do ar: relatório reachable=false, nada apagado, sem lançar', async () => {
    const mem = memory([1, 2, 3]);
    const dead: DrawSource = { name: 'dead', latest: async () => null, byContest: async () => null };
    const report = await syncLottery(L, mem.deps([dead]));
    expect(report).toMatchObject({ reachable: false, latest: null, added: 0 });
    expect(mem.store.size).toBe(3);
  });

  it('descarta resposta com o número de concurso errado (não grava o 4 no lugar do 3)', async () => {
    const mem = memory([1, 2]);
    const liar = source(4, { byContest: async () => draw(99) });
    const report = await syncLottery(L, mem.deps([liar]));
    expect(mem.store.has(99)).toBe(false);
    expect(report.missingAfter).toEqual([3]);
  });

  it('não trava se um concurso individual não existe na fonte: relata o que ficou faltando', async () => {
    const mem = memory([1]);
    const s = source(4, { byContest: async (_l, n) => (n === 3 ? null : draw(n)) });
    const report = await syncLottery(L, mem.deps([s]));
    expect(report.missingAfter).toEqual([3]);
    expect(report.added).toBe(2);
  });

  it('respeita a concorrência máxima', async () => {
    const mem = memory([]);
    let inFlight = 0;
    let peak = 0;
    const s = source(20, {
      byContest: async (_l, n) => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 2));
        inFlight--;
        return draw(n);
      },
    });
    await syncLottery(L, mem.deps([s], 3));
    expect(peak).toBeLessThanOrEqual(3);
    expect(mem.store.size).toBe(20);
  });
});
