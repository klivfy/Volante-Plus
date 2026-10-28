import { describe, expect, it } from 'vitest';
import { cutoffBounds, todayUtcIso, validateCutoffDate } from '../backtestCutoff';
import { Lottery } from '../../types/domain';

const TODAY = '2026-10-28';
const ALL_LOTTERIES = [Lottery.MEGA_SENA, Lottery.MAIS_MILIONARIA, Lottery.QUINA];

describe('cutoffBounds', () => {
  it('piso = primeiro sorteio oficial de cada modalidade (concurso 1)', () => {
    // Pin dos registros oficiais: Mega-Sena 11/03/1996, +Milionária 28/05/2022,
    // Quina 13/03/1994 — conferidos contra o seed versionado (data/history).
    expect(cutoffBounds(Lottery.MEGA_SENA, TODAY).min).toBe('1996-03-11');
    expect(cutoffBounds(Lottery.MAIS_MILIONARIA, TODAY).min).toBe('2022-05-28');
    expect(cutoffBounds(Lottery.QUINA, TODAY).min).toBe('1994-03-13');
  });

  it('teto = dia atual informado, para as três modalidades', () => {
    for (const lottery of ALL_LOTTERIES) {
      expect(cutoffBounds(lottery, TODAY).max).toBe(TODAY);
    }
  });
});

describe('todayUtcIso', () => {
  it('deriva a data UTC de um instante (yyyy-MM-dd), não a data local', () => {
    expect(todayUtcIso(new Date('2026-10-28T23:45:00Z'))).toBe('2026-10-28');
    expect(todayUtcIso(new Date('2026-01-01T00:15:00Z'))).toBe('2026-01-01');
  });
});

describe('validateCutoffDate', () => {
  it('aceita o próprio primeiro sorteio e o próprio dia atual (limites inclusivos)', () => {
    expect(validateCutoffDate('1996-03-11', Lottery.MEGA_SENA, TODAY)).toEqual({
      ok: true,
      value: '1996-03-11',
    });
    expect(validateCutoffDate(TODAY, Lottery.QUINA, TODAY)).toEqual({ ok: true, value: TODAY });
  });

  it('rejeita data anterior ao primeiro sorteio da modalidade — por modalidade', () => {
    expect(validateCutoffDate('1996-03-10', Lottery.MEGA_SENA, TODAY)).toEqual({
      ok: false,
      reason: 'before-first-draw',
    });
    // O valor antigo (errôneo) da Mega no código, 1995-03-11, agora é rejeitado.
    expect(validateCutoffDate('1995-03-11', Lottery.MEGA_SENA, TODAY)).toEqual({
      ok: false,
      reason: 'before-first-draw',
    });
    expect(validateCutoffDate('2022-05-27', Lottery.MAIS_MILIONARIA, TODAY)).toEqual({
      ok: false,
      reason: 'before-first-draw',
    });
    expect(validateCutoffDate('1994-03-12', Lottery.QUINA, TODAY)).toEqual({
      ok: false,
      reason: 'before-first-draw',
    });
  });

  it('rejeita data futura — nada posterior ao dia atual', () => {
    expect(validateCutoffDate('2026-10-29', Lottery.MEGA_SENA, TODAY)).toEqual({
      ok: false,
      reason: 'future',
    });
    expect(validateCutoffDate('2027-01-01', Lottery.QUINA, TODAY)).toEqual({
      ok: false,
      reason: 'future',
    });
  });

  it('rejeita formato fora de yyyy-MM-dd', () => {
    expect(validateCutoffDate('11/03/1996', Lottery.MEGA_SENA, TODAY)).toEqual({
      ok: false,
      reason: 'invalid-format',
    });
    expect(validateCutoffDate('', Lottery.QUINA, TODAY)).toEqual({
      ok: false,
      reason: 'invalid-format',
    });
  });
});
