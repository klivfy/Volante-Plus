import { describe, expect, it } from 'vitest';
import { Draw, Lottery } from '../../types/domain';
import { createSeededRandom } from '../random';
import {
  addMonthsUTC,
  multiCutWalkForward,
  stabilityAnalysis,
  toUTCDateString,
} from '../walkForwardMulti';
import { generateSyntheticHistory } from './fixtures';


describe('addMonthsUTC / toUTCDateString', () => {
  it('avança meses sem derrapar para o mês seguinte (clamp no último dia)', () => {
    // 31/Jan + 1 mês = 29/Fev (2020 é bissexto) — setMonth local viraria 1º/Mar.
    expect(toUTCDateString(addMonthsUTC(new Date('2020-01-31'), 1))).toBe('2020-02-29');
    expect(toUTCDateString(addMonthsUTC(new Date('2021-01-31'), 1))).toBe('2021-02-28');
  });

  it('mantém o dia do mês nos casos regulares e cruza anos', () => {
    expect(toUTCDateString(addMonthsUTC(new Date('2014-03-01'), 48))).toBe('2018-03-01');
    expect(toUTCDateString(addMonthsUTC(new Date('2015-11-15'), 3))).toBe('2016-02-15');
  });

  it('a aritmética é toda UTC: o resultado não depende do fuso do processo', () => {
    // Datas 'YYYY-MM-DD' parseiam como UTC meia-noite e addMonthsUTC só toca
    // componentes UTC — o assert vale em TZ -3 (São Paulo), UTC e +5 igualmente.
    const d = addMonthsUTC(new Date('2014-03-01'), 4);
    expect(d.toISOString()).toBe('2014-07-01T00:00:00.000Z');
  });
});

/** Histórico sintético da Quina com as regras reais: 5 dezenas de 1..80. */
function quinaHistory(count: number, seed: number): Draw[] {
  const random = createSeededRandom(seed);
  const draws: Draw[] = [];
  const start = new Date('2000-01-01');
  for (let i = 0; i < count; i++) {
    const numbers = new Set<number>();
    while (numbers.size < 5) numbers.add(1 + random.nextInt(80));
    const date = new Date(start.getTime() + i * 3 * 24 * 60 * 60 * 1000);
    draws.push({
      lottery: Lottery.QUINA,
      contestNumber: i + 1,
      date: date.toISOString().slice(0, 10),
      numbers: [...numbers].sort((a, b) => a - b),
    });
  }
  return draws;
}

describe('multiCutWalkForward', () => {
  it('devolve vazio para histórico vazio', () => {
    expect(multiCutWalkForward([], Lottery.MEGA_SENA)).toEqual([]);
  });

  it('gera pelo menos um corte com histórico suficiente (~6 anos, ~3/semana)', () => {
    const history = generateSyntheticHistory(Lottery.MEGA_SENA, 900, { seed: 1 });
    const results = multiCutWalkForward(
      history,
      Lottery.MEGA_SENA,
      { simulationRounds: 5 },
      { stepMonths: 6, minValidation: 20, firstCutoffYears: 4 },
    );
    expect(results.length).toBeGreaterThan(0);
    for (const cut of results) {
      expect(cut.validationDraws).toBeGreaterThanOrEqual(20);
      expect(cut.pValue).toBeGreaterThanOrEqual(0);
      expect(cut.pValue).toBeLessThanOrEqual(1);
    }
  });

  it('não gera cortes quando o histórico é curto demais para a primeira janela', () => {
    const history = generateSyntheticHistory(Lottery.MEGA_SENA, 50, { seed: 2 });
    const results = multiCutWalkForward(history, Lottery.MEGA_SENA, {}, { firstCutoffYears: 4 });
    expect(results).toEqual([]);
  });

  it('regressão: cortes da Quina com p0 pelas faixas não acusam significância extrema', () => {
    // O p0 correto (piso 2, duque) deixa os p-values da Quina na faixa
    // ordinária do ruído; um baseline errado (piso 4, ~1870x menor) forçaria
    // p praticamente 0 em TODOS os cortes — "vantagem" espúria.
    const results = multiCutWalkForward(
      quinaHistory(900, 7),
      Lottery.QUINA,
      { simulationRounds: 5 },
      { stepMonths: 12, minValidation: 20 },
    );
    expect(results.length).toBeGreaterThan(0);
    for (const cut of results) {
      expect(cut.pValue).toBeGreaterThan(1e-6);
    }
  });
});

describe('stabilityAnalysis', () => {
  it('devolve zeros para lista vazia', () => {
    const result = stabilityAnalysis([]);
    expect(result.totalCuts).toBe(0);
    expect(result.consistency).toBe(0);
  });

  it('consistência é 1 quando todos os cortes têm o mesmo sinal', () => {
    const result = stabilityAnalysis([
      {
        cutoff: '2020-01-01',
        trainingDraws: 100,
        validationDraws: 20,
        meanHits: 0.7,
        expectedMeanHits: 0.6,
        prizeRate: 0.1,
        pValue: 0.5,
        significant: false,
      },
      {
        cutoff: '2020-06-01',
        trainingDraws: 130,
        validationDraws: 20,
        meanHits: 0.65,
        expectedMeanHits: 0.6,
        prizeRate: 0.1,
        pValue: 0.5,
        significant: false,
      },
    ]);
    expect(result.consistency).toBe(1);
    expect(result.meanAdvantage).toBeCloseTo(0.075, 10);
  });

  it('Bonferroni: p significativo cru pode não sobreviver à correção', () => {
    // 10 cortes -> alfa corrigido 0.005. Um corte com p = 0.01 é "significativo"
    // cru (p < 0.05) mas NÃO sobrevive à correção (p >= 0.005).
    const results = Array.from({ length: 10 }, (_, i) => ({
      cutoff: `2020-01-${String(i + 1).padStart(2, '0')}`,
      trainingDraws: 100,
      validationDraws: 20,
      meanHits: i === 0 ? 0.8 : 0.55,
      expectedMeanHits: 0.6,
      prizeRate: 0.1,
      pValue: i === 0 ? 0.01 : 0.5,
      significant: i === 0,
    }));

    const s = stabilityAnalysis(results);
    expect(s.totalCuts).toBe(10);
    expect(s.correctedAlpha).toBeCloseTo(0.005, 12);
    expect(s.significantAdvantage).toBe(1);
    expect(s.significantAdvantageCorrected).toBe(0);
    expect(s.significantDisadvantageCorrected).toBe(0);
  });

  it('Bonferroni: corte com p abaixo do alfa corrigido sobrevive nas duas contagens', () => {
    const results = Array.from({ length: 10 }, (_, i) => ({
      cutoff: `2020-01-${String(i + 1).padStart(2, '0')}`,
      trainingDraws: 100,
      validationDraws: 20,
      meanHits: i === 0 ? 0.9 : 0.55,
      expectedMeanHits: 0.6,
      prizeRate: 0.1,
      pValue: i === 0 ? 0.0001 : 0.5,
      significant: i === 0,
    }));

    const s = stabilityAnalysis(results);
    expect(s.significantAdvantage).toBe(1);
    expect(s.significantAdvantageCorrected).toBe(1);
  });
});
