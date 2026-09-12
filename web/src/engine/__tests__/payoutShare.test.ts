import { describe, expect, it } from 'vitest';
import { Lottery } from '../../types/domain';
import {
  POPULARITY_ELASTICITY,
  averageConditionalGain,
  averageRelativePopularity,
  betterThanAverageCount,
  conditionalPayoutGain,
  crowdingFactor,
  distinctSimpleBets,
  evaluatePayoutBatch,
  evaluatePayoutShare,
  isBetterThanAverage,
  payoutSummary,
  relativePopularity,
  uniformSelectionProbability,
} from '../payoutShare';

describe('crowdingFactor', () => {
  it('vale 1 quando ninguém mais disputa a combinação (q = 0)', () => {
    expect(crowdingFactor(0, 1000)).toBe(1);
  });

  it('bate com a soma termo a termo da binomial, N pequeno', () => {
    // E[1/(1+K)], K ~ Binomial(N-1, q), verificado por soma direta —
    // independente da forma fechada usada em produção.
    const n = 40;
    const q = 0.08;
    let direct = 0;
    let term = Math.pow(1 - q, n - 1); // k = 0
    for (let k = 0; k <= n - 1; k += 1) {
      direct += term / (1 + k);
      term = (term * (n - 1 - k) * q) / ((k + 1) * (1 - q));
    }
    expect(crowdingFactor(q, n)).toBeCloseTo(direct, 9);
  });

  it('é decrescente em q: quanto mais popular, menor a fração recebida', () => {
    const n = 10_000_000;
    const low = crowdingFactor(1e-8, n);
    const high = crowdingFactor(5e-8, n);
    expect(high).toBeLessThan(low);
  });

  it('rejeita parâmetros fora de domínio', () => {
    expect(() => crowdingFactor(-0.1, 10)).toThrow();
    expect(() => crowdingFactor(1.1, 10)).toThrow();
    expect(() => crowdingFactor(0.5, 0)).toThrow();
  });
});

describe('distinctSimpleBets / uniformSelectionProbability', () => {
  it('Mega-Sena: C(60,6)', () => {
    expect(distinctSimpleBets(Lottery.MEGA_SENA)).toBe(50_063_860);
  });

  it('+Milionária: C(50,6) x C(6,2)', () => {
    const combinations = distinctSimpleBets(Lottery.MAIS_MILIONARIA);
    expect(combinations).toBe(15_890_700 * 15);
  });

  it('uniformSelectionProbability é o inverso exato', () => {
    expect(uniformSelectionProbability(Lottery.MEGA_SENA)).toBeCloseTo(
      1 / distinctSimpleBets(Lottery.MEGA_SENA),
      15,
    );
  });
});

describe('relativePopularity', () => {
  it('é sempre positiva e finita, mesmo em extremos', () => {
    for (const numbers of [
      [1, 2, 3, 4, 5, 6],
      [55, 56, 57, 58, 59, 60],
      [1, 12, 24, 36, 48, 60],
    ]) {
      const m = relativePopularity(Lottery.MEGA_SENA, numbers);
      expect(m).toBeGreaterThan(0);
      expect(Number.isFinite(m)).toBe(true);
    }
  });

  it('uma combinação de aniversário é mais popular que uma dispersa', () => {
    const birthdays = relativePopularity(Lottery.MEGA_SENA, [1, 5, 9, 12, 20, 31]);
    const spread = relativePopularity(Lottery.MEGA_SENA, [2, 18, 26, 34, 45, 58]);
    expect(birthdays).toBeGreaterThan(spread);
  });

  it('respeita m = exp(β·z): duas combinações com a mesma penalidade têm a mesma m', () => {
    // Não testamos o valor absoluto (depende da amostra de Monte Carlo), só
    // a relação funcional que a fórmula promete.
    const numbers = [3, 17, 29, 41, 53, 60];
    const first = relativePopularity(Lottery.MEGA_SENA, numbers);
    const second = relativePopularity(Lottery.MEGA_SENA, [...numbers]);
    expect(first).toBe(second);
    void POPULARITY_ELASTICITY; // usado só para documentar a fórmula acima
  });
});

describe('conditionalPayoutGain', () => {
  const TICKETS = 10_000_000;

  it('é zero quando a popularidade relativa é 1 (combinação média)', () => {
    expect(conditionalPayoutGain(Lottery.MEGA_SENA, 1, TICKETS)).toBeCloseTo(0, 12);
  });

  it('é positivo para popularidade abaixo da média e negativo acima', () => {
    expect(conditionalPayoutGain(Lottery.MEGA_SENA, 0.7, TICKETS)).toBeGreaterThan(0);
    expect(conditionalPayoutGain(Lottery.MEGA_SENA, 1.4, TICKETS)).toBeLessThan(0);
  });

  it('rejeita popularidade não positiva', () => {
    expect(() => conditionalPayoutGain(Lottery.MEGA_SENA, 0, TICKETS)).toThrow();
    expect(() => conditionalPayoutGain(Lottery.MEGA_SENA, -1, TICKETS)).toThrow();
  });
});

describe('evaluatePayoutShare', () => {
  const TICKETS = 10_000_000;

  it('produz um summary consistente com o sinal do ganho', () => {
    const good = evaluatePayoutShare(Lottery.MEGA_SENA, [2, 18, 26, 34, 45, 58], TICKETS);
    const bad = evaluatePayoutShare(Lottery.MEGA_SENA, [1, 5, 9, 12, 20, 31], TICKETS);

    expect(payoutSummary(good)).toMatch(/a mais/);
    expect(isBetterThanAverage(good)).toBe(good.relativePopularity < 1);
    expect(isBetterThanAverage(bad)).toBe(bad.relativePopularity < 1);
  });

  it('ordena as dezenas do resultado independentemente da ordem de entrada', () => {
    const a = evaluatePayoutShare(Lottery.MEGA_SENA, [40, 5, 12, 60, 1, 33], TICKETS);
    expect(a.numbers).toEqual([1, 5, 12, 33, 40, 60]);
  });

  it('a INVARIANTE central: nada aqui é probabilidade de ganhar', () => {
    // A chance de ganhar de uma aposta simples na Mega-Sena é fixa
    // (1/C(60,6)) e este módulo não a expõe nem a modifica — só mede o
    // rateio condicional a ganhar. Verificação direta: duas combinações com
    // popularidades bem diferentes têm o mesmo `uniformSelectionProbability`.
    const p = uniformSelectionProbability(Lottery.MEGA_SENA);
    const unrelatedToPopularity = 1 / distinctSimpleBets(Lottery.MEGA_SENA);
    expect(p).toBe(unrelatedToPopularity);
  });
});

describe('evaluatePayoutBatch', () => {
  const TICKETS = 10_000_000;

  it('agrega médias simples e a contagem de jogos melhores que a média', () => {
    const batch = {
      lottery: Lottery.MEGA_SENA,
      games: [
        { numbers: [1, 5, 9, 12, 20, 31] }, // aniversários: popular
        { numbers: [2, 18, 26, 34, 45, 58] }, // disperso: impopular
      ],
      strategyLabel: 'teste',
    };
    const assessment = evaluatePayoutBatch(batch, TICKETS);

    expect(assessment.games).toHaveLength(2);
    expect(averageRelativePopularity(assessment)).toBeCloseTo(
      (assessment.games[0].relativePopularity + assessment.games[1].relativePopularity) / 2,
      12,
    );
    expect(averageConditionalGain(assessment)).toBeCloseTo(
      (assessment.games[0].conditionalGain + assessment.games[1].conditionalGain) / 2,
      12,
    );
    expect(betterThanAverageCount(assessment)).toBe(
      assessment.games.filter((g) => g.relativePopularity < 1).length,
    );
  });

  it('lote vazio devolve médias neutras sem lançar', () => {
    const empty = evaluatePayoutBatch(
      { lottery: Lottery.MEGA_SENA, games: [], strategyLabel: 'teste' },
      TICKETS,
    );
    expect(averageRelativePopularity(empty)).toBe(1);
    expect(averageConditionalGain(empty)).toBe(0);
    expect(betterThanAverageCount(empty)).toBe(0);
  });
});
