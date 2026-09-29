import { describe, expect, it } from 'vitest';
import maisMirror from '../../mirrorSnapshot/maismilionaria.json';
import megaMirror from '../../mirrorSnapshot/megasena.json';
import { Draw, Lottery } from '../../../types/domain';
import { isValidDraw } from '../../../services/drawSources';
import { HISTORY_SEED_META, historySeedVersion, loadHistorySeed } from '..';

describe.each([
  [Lottery.MEGA_SENA, megaMirror as Draw[]],
  [Lottery.MAIS_MILIONARIA, maisMirror as Draw[]],
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

it('a versão do seed identifica os dois últimos concursos', () => {
  expect(historySeedVersion()).toBe(
    `${HISTORY_SEED_META[Lottery.MEGA_SENA].lastContest}-${HISTORY_SEED_META[Lottery.MAIS_MILIONARIA].lastContest}`,
  );
});
