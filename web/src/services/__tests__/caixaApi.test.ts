import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Lottery } from '../../types/domain';
import { fetchNextDraw, parseDrawDate } from '../caixaApi';

const BASE_URL = 'https://example.test/api';

function mockFetchOnce(response: Partial<Response> & { json?: () => Promise<unknown> }): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
      ...response,
    } as Response),
  );
}

describe('parseDrawDate', () => {
  it('mantém datas ISO como estão', () => {
    expect(parseDrawDate('2026-08-06')).toBe('2026-08-06');
    expect(parseDrawDate('2026-08-06T20:00:00')).toBe('2026-08-06T20:00:00');
  });

  it('converte dd/MM/yyyy para yyyy-MM-dd', () => {
    expect(parseDrawDate('06/08/2026')).toBe('2026-08-06');
  });

  it('lança para formato desconhecido', () => {
    expect(() => parseDrawDate('agosto de 2026')).toThrow();
  });
});

describe('fetchNextDraw', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_CAIXA_API_BASE_URL', BASE_URL);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('usa a URL padrão quando a variável de ambiente não está configurada', async () => {
    vi.unstubAllEnvs();
    mockFetchOnce({
      json: async () => ({
        numero: 2750,
        dataProximoConcurso: '2026-08-06',
        valorEstimadoProximoConcurso: 65_000_000,
      }),
    });

    await fetchNextDraw(Lottery.MEGA_SENA);

    expect(fetch).toHaveBeenCalledWith(
      'https://loteriascaixa-api.herokuapp.com/api/megasena/latest',
      expect.objectContaining({ headers: expect.objectContaining({ Accept: 'application/json' }) }),
    );
  });

  it('monta a URL com o caminho correto por loteria', async () => {
    mockFetchOnce({
      json: async () => ({
        numero: 2750,
        dataProximoConcurso: '2026-08-06',
        valorEstimadoProximoConcurso: 65_000_000,
      }),
    });

    await fetchNextDraw(Lottery.MAIS_MILIONARIA);

    expect(fetch).toHaveBeenCalledWith(
      `${BASE_URL}/maismilionaria/latest`,
      expect.objectContaining({ headers: expect.objectContaining({ Accept: 'application/json' }) }),
    );
  });

  it('parseia data ISO corretamente', async () => {
    mockFetchOnce({
      json: async () => ({
        concurso: 2750,
        dataProximoConcurso: '2026-08-06',
        valorEstimadoProximoConcurso: 65_000_000,
      }),
    });

    const result = await fetchNextDraw(Lottery.MEGA_SENA);

    expect(result).toEqual({
      lottery: Lottery.MEGA_SENA,
      contestNumber: 2750,
      drawDate: '2026-08-06',
      estimatedPrize: 65_000_000,
    });
  });

  it('parseia data dd/MM/yyyy corretamente', async () => {
    mockFetchOnce({
      json: async () => ({
        numeroConcurso: 2750,
        dataProximoConcurso: '06/08/2026',
        valorEstimadoProximoConcurso: 65_000_000,
      }),
    });

    const result = await fetchNextDraw(Lottery.MEGA_SENA);

    expect(result?.drawDate).toBe('2026-08-06');
  });

  it('devolve null quando a resposta HTTP não é ok', async () => {
    mockFetchOnce({ ok: false });

    expect(await fetchNextDraw(Lottery.MEGA_SENA)).toBeNull();
  });

  it('devolve null quando o fetch lança (rede indisponível)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    expect(await fetchNextDraw(Lottery.MEGA_SENA)).toBeNull();
  });

  it('devolve null quando faltam campos obrigatórios', async () => {
    mockFetchOnce({ json: async () => ({ numero: 2750 }) });

    expect(await fetchNextDraw(Lottery.MEGA_SENA)).toBeNull();
  });

  it('devolve null quando o JSON é malformado', async () => {
    mockFetchOnce({
      json: async () => {
        throw new SyntaxError('unexpected token');
      },
    });

    expect(await fetchNextDraw(Lottery.MEGA_SENA)).toBeNull();
  });

  it('devolve null quando a data vem em formato desconhecido', async () => {
    mockFetchOnce({
      json: async () => ({
        numero: 2750,
        dataProximoConcurso: 'não é uma data',
        valorEstimadoProximoConcurso: 65_000_000,
      }),
    });

    expect(await fetchNextDraw(Lottery.MEGA_SENA)).toBeNull();
  });
});
