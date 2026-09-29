import { afterEach, describe, expect, it, vi } from 'vitest';
import { Draw, Lottery } from '../../types/domain';
import { caixaSource, communitySource, guidiSource, isValidDraw } from '../drawSources';

afterEach(() => vi.unstubAllGlobals());

function stubFetch(routes: Record<string, unknown>): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async (url: string) => {
    const hit = Object.entries(routes).find(([suffix]) => url.endsWith(suffix));
    return hit
      ? ({ ok: true, json: async () => hit[1] } as Response)
      : ({ ok: false, json: async () => ({}) } as Response);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

const mega: Draw = { lottery: Lottery.MEGA_SENA, contestNumber: 10, date: '2024-01-01', numbers: [1, 2, 3, 4, 5, 6] };
const mais: Draw = { lottery: Lottery.MAIS_MILIONARIA, contestNumber: 10, date: '2024-01-01', numbers: [1, 2, 3, 4, 5, 6], trevos: [1, 6] };

describe('isValidDraw — regras de cada modalidade', () => {
  it('aceita concursos íntegros das duas modalidades', () => {
    expect(isValidDraw(Lottery.MEGA_SENA, mega)).toBe(true);
    expect(isValidDraw(Lottery.MAIS_MILIONARIA, mais)).toBe(true);
  });
  it('recusa dezenas repetidas, fora do universo ou em quantidade errada', () => {
    expect(isValidDraw(Lottery.MEGA_SENA, { ...mega, numbers: [1, 1, 3, 4, 5, 6] })).toBe(false);
    expect(isValidDraw(Lottery.MEGA_SENA, { ...mega, numbers: [1, 2, 3, 4, 5, 61] })).toBe(false);
    expect(isValidDraw(Lottery.MEGA_SENA, { ...mega, numbers: [1, 2, 3, 4, 5] })).toBe(false);
    expect(isValidDraw(Lottery.MAIS_MILIONARIA, { ...mais, numbers: [1, 2, 3, 4, 5, 51] })).toBe(false);
  });
  it('+Milionária exige 2 trevos distintos em 1..6', () => {
    expect(isValidDraw(Lottery.MAIS_MILIONARIA, { ...mais, trevos: undefined })).toBe(false);
    expect(isValidDraw(Lottery.MAIS_MILIONARIA, { ...mais, trevos: [2, 2] })).toBe(false);
    expect(isValidDraw(Lottery.MAIS_MILIONARIA, { ...mais, trevos: [1, 7] })).toBe(false);
  });
  it('recusa data inválida e concurso não positivo, e loteria trocada', () => {
    expect(isValidDraw(Lottery.MEGA_SENA, { ...mega, date: 'ontem' })).toBe(false);
    expect(isValidDraw(Lottery.MEGA_SENA, { ...mega, contestNumber: 0 })).toBe(false);
    expect(isValidDraw(Lottery.MEGA_SENA, { ...mega, lottery: Lottery.MAIS_MILIONARIA })).toBe(false);
  });
});

describe('fontes', () => {
  it('comunidade: /latest, /{n} e histórico inteiro — descartando itens inválidos', async () => {
    stubFetch({
      '/megasena/latest': { concurso: 10, data: '01/01/2024', dezenas: ['01', '02', '03', '04', '05', '06'] },
      '/megasena/7': { concurso: 7, data: '01/01/2024', dezenas: ['01', '02', '03', '04', '05', '06'] },
      '/megasena': [
        { concurso: 1, data: '11/03/1996', dezenas: ['01', '02', '03', '04', '05', '06'] },
        { concurso: 2, data: '18/03/1996', dezenas: ['01', '01', '03', '04', '05', '06'] }, // dezena repetida
      ],
    });
    const source = communitySource('https://x.test/api');
    expect((await source.latest(Lottery.MEGA_SENA))?.contestNumber).toBe(10);
    expect((await source.byContest(Lottery.MEGA_SENA, 7))?.date).toBe('2024-01-01');
    expect((await source.all!(Lottery.MEGA_SENA))?.map((d) => d.contestNumber)).toEqual([1]);
  });

  it('+Milionária traz os trevos', async () => {
    stubFetch({
      '/maismilionaria/latest': { concurso: 393, data: '27/09/2026', dezenas: ['02', '15', '17', '26', '29', '32'], trevos: ['4', '5'] },
    });
    const d = await communitySource('https://x.test/api').latest(Lottery.MAIS_MILIONARIA);
    expect(d).toMatchObject({ contestNumber: 393, trevos: [4, 5] });
  });

  it('guidi e Caixa: nomes de campo do serviço (numero/dataApuracao/listaDezenas)', async () => {
    const payload = { numero: 3000, dataApuracao: '01/06/2026', listaDezenas: ['05', '10', '15', '20', '25', '30'] };
    stubFetch({ '/megasena/ultimo': payload, '/megasena': payload, '/megasena/3000': payload });
    expect((await guidiSource('https://g.test').latest(Lottery.MEGA_SENA))?.contestNumber).toBe(3000);
    expect((await caixaSource('https://c.test').latest(Lottery.MEGA_SENA))?.numbers).toEqual([5, 10, 15, 20, 25, 30]);
    expect((await caixaSource('https://c.test').byContest(Lottery.MEGA_SENA, 3000))?.date).toBe('2026-06-01');
  });

  it('HTTP de erro, JSON quebrado e rede caída viram null, sem lançar', async () => {
    stubFetch({});
    expect(await communitySource('https://x.test').latest(Lottery.MEGA_SENA)).toBeNull();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await communitySource('https://x.test').latest(Lottery.MEGA_SENA)).toBeNull();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => { throw new Error('json'); } }));
    expect(await guidiSource('https://x.test').byContest(Lottery.MEGA_SENA, 1)).toBeNull();
  });
});
