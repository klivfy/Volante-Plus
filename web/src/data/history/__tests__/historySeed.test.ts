import { describe, expect, it } from 'vitest';
import maisMirror from '../../mirrorSnapshot/maismilionaria.json';
import megaMirror from '../../mirrorSnapshot/megasena.json';
import quinaMirror from '../../mirrorSnapshot/quina.json';
import { Draw, Lottery } from '../../../types/domain';
import { isValidDraw } from '../../../services/drawSources';
import { HISTORY_SEED_META, historySeedVersion, loadHistorySeed } from '..';

describe.each([
  [Lottery.MEGA_SENA, megaMirror as Draw[]],
  [Lottery.MAIS_MILIONARIA, maisMirror as Draw[]],
  [Lottery.QUINA, quinaMirror as Draw[]],
])('seed embutido — %s', (lottery, mirror) => {
  it('é COMPLETO: contíguo do concurso 1 ao último declarado no meta', async () => {
    const draws = await loadHistorySeed(lottery);
    const meta = HISTORY_SEED_META[lottery];
    expect(draws).toHaveLength(meta.count);
    expect(draws[0].contestNumber).toBe(meta.firstContest);
    expect(draws[draws.length - 1].contestNumber).toBe(meta.lastContest);
    draws.forEach((d, i) => expect(d.contestNumber).toBe(i + 1));
  });

  it('todo concurso respeita as regras da modalidade', async () => {
    const invalid = (await loadHistorySeed(lottery)).filter((d) => !isValidDraw(lottery, d));
    expect(invalid).toEqual([]);
  });

  it('coincide 100% com o espelho independente nos concursos em comum', async () => {
    const seed = new Map((await loadHistorySeed(lottery)).map((d) => [d.contestNumber, d]));
    for (const m of mirror) {
      const s = seed.get(m.contestNumber)!;
      expect(s.numbers, `concurso ${m.contestNumber}`).toEqual([...m.numbers].sort((a, b) => a - b));
      if (lottery === Lottery.QUINA) {
        // Espelho coletado do portal da Caixa: traz datas reais.
        expect(s.date, `data do concurso ${m.contestNumber}`).toBe(m.date);
      }
      if (lottery === Lottery.MAIS_MILIONARIA) {
        expect(s.trevos).toEqual([...(m.trevos ?? [])].sort((a, b) => a - b));
      }
    }
  });

  it('a data do último concurso bate com o meta', async () => {
    const draws = await loadHistorySeed(lottery);
    expect(draws[draws.length - 1].date).toBe(HISTORY_SEED_META[lottery].lastDate);
  });
});

it('a versão do seed identifica o último concurso de cada modalidade', () => {
  expect(historySeedVersion()).toBe(
    `${HISTORY_SEED_META[Lottery.MEGA_SENA].lastContest}-${HISTORY_SEED_META[Lottery.MAIS_MILIONARIA].lastContest}-${HISTORY_SEED_META[Lottery.QUINA].lastContest}`,
  );
});

describe('controle positivo: histórico corrompido da Quina é rejeitado', () => {
  const ok: Draw = { lottery: Lottery.QUINA, contestNumber: 1, date: '1994-03-13', numbers: [5, 20, 33, 61, 80] };

  it('aceita um concurso válido', () => {
    expect(isValidDraw(Lottery.QUINA, ok)).toBe(true);
  });

  it.each([
    ['6 dezenas', { ...ok, numbers: [1, 2, 3, 4, 5, 6] }],
    ['dezena 81', { ...ok, numbers: [5, 20, 33, 61, 81] }],
    ['dezena 0', { ...ok, numbers: [0, 20, 33, 61, 80] }],
    ['dezenas repetidas', { ...ok, numbers: [5, 5, 33, 61, 80] }],
    ['trevo presente', { ...ok, trevos: [1, 2] }],
  ])('rejeita %s', (_, draw) => {
    expect(isValidDraw(Lottery.QUINA, draw as Draw)).toBe(false);
  });

  it('o seed não tem lacuna nem duplicata', async () => {
    const draws = await loadHistorySeed(Lottery.QUINA);
    expect(new Set(draws.map((d) => d.contestNumber)).size).toBe(draws.length);
  });
});
