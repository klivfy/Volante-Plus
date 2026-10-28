import { describe, expect, it } from 'vitest';
import { Lottery } from '../../types/domain';
import {
  anyPrizeProbability,
  currentPower,
  expectedHitsFor,
  hypergeometricStdDev,
  powerTable,
  requiredSampleSize,
} from '../powerAnalysis';
import { hypergeometricProbability } from '../hypergeometric';
import { lotteryRules } from '../prizeRules';

describe('hypergeometricStdDev', () => {
  it('é positivo e finito para ambas as loterias', () => {
    expect(hypergeometricStdDev(Lottery.MEGA_SENA)).toBeGreaterThan(0);
    expect(hypergeometricStdDev(Lottery.MAIS_MILIONARIA)).toBeGreaterThan(0);
  });
});

describe('expectedHitsFor', () => {
  it('bate com os valores conhecidos de cada loteria', () => {
    expect(expectedHitsFor(Lottery.MEGA_SENA)).toBeCloseTo(0.6, 10);
    expect(expectedHitsFor(Lottery.MAIS_MILIONARIA)).toBeCloseTo(0.72, 10);
  });
});

describe('currentPower', () => {
  it('cresce com o tamanho da amostra', () => {
    const std = hypergeometricStdDev(Lottery.MEGA_SENA);
    const powerSmall = currentPower(std, 0.1, 40);
    const powerLarge = currentPower(std, 0.1, 5000);
    expect(powerLarge).toBeGreaterThan(powerSmall);
  });

  it('poder com 40 jogos é baixo para um efeito pequeno (confirma a advertência do documento)', () => {
    const std = hypergeometricStdDev(Lottery.MEGA_SENA);
    const power = currentPower(std, 0.1, 40);
    expect(power).toBeLessThan(0.3);
  });

  it('poder converge para perto de 1 com amostra muito grande', () => {
    const std = hypergeometricStdDev(Lottery.MEGA_SENA);
    const power = currentPower(std, 0.2, 100_000);
    expect(power).toBeGreaterThan(0.99);
  });

  it('devolve 0 para amostra vazia', () => {
    expect(currentPower(1, 0.1, 0)).toBe(0);
  });
});

describe('requiredSampleSize', () => {
  it('exige mais jogos para detectar efeitos menores', () => {
    const std = hypergeometricStdDev(Lottery.MEGA_SENA);
    const small = requiredSampleSize(std, 0.05);
    const large = requiredSampleSize(std, 0.2);
    expect(small.requiredGames).toBeGreaterThan(large.requiredGames);
  });

  it('o poder no tamanho de amostra recomendado atinge o alvo', () => {
    const std = hypergeometricStdDev(Lottery.MEGA_SENA);
    const { requiredGames } = requiredSampleSize(std, 0.1, 0.05, 0.8);
    const achievedPower = currentPower(std, 0.1, requiredGames);
    expect(achievedPower).toBeGreaterThanOrEqual(0.78); // tolerância pela aproximação numérica
  });
});

describe('powerTable', () => {
  it('gera uma linha por efeito e uma coluna por tamanho de amostra', () => {
    const table = powerTable(Lottery.MEGA_SENA, [0.1, 0.2], [100, 1000]);
    expect(table).toHaveLength(2);
    expect(table[0].powerBySampleSize).toHaveLength(2);
  });
});

describe('anyPrizeProbability — baseline pelas faixas oficiais (H-1)', () => {
  const pOf = (lottery: Lottery, hits: number) => {
    const rules = lotteryRules(lottery);
    return hypergeometricProbability(
      rules.numberUniverse,
      rules.numbersDrawn,
      rules.numbersPerBet,
      hits,
    );
  };

  it('Mega-Sena: soma quadra + quina + sena (o corte antigo hits>=4 já era certo aqui)', () => {
    const expected = pOf(Lottery.MEGA_SENA, 4) + pOf(Lottery.MEGA_SENA, 5) + pOf(Lottery.MEGA_SENA, 6);
    expect(anyPrizeProbability(Lottery.MEGA_SENA)).toBeCloseTo(expected, 15);
  });

  it('Quina: inclui duque e terno — o corte hits>=4 subestimava ~3 ordens de grandeza', () => {
    const expected =
      pOf(Lottery.QUINA, 2) + pOf(Lottery.QUINA, 3) + pOf(Lottery.QUINA, 4) + pOf(Lottery.QUINA, 5);
    const baseline = anyPrizeProbability(Lottery.QUINA);
    expect(baseline).toBeCloseTo(expected, 15);
    // P(≥2 de 5 em 6/80) ≈ 0,0293 — ~1 prêmio a cada 34 apostas simples.
    expect(baseline).toBeGreaterThan(0.02);
    expect(baseline).toBeLessThan(0.04);
    // O baseline antigo (hits>=4) era ~1,6e-5 (~1.870× menor): um método
    // honesto parecia "milhares de vezes acima" do baseline e o veredito
    // do teste binomial invertia.
    const oldBroken = pOf(Lottery.QUINA, 4) + pOf(Lottery.QUINA, 5);
    expect(baseline).toBeGreaterThan(oldBroken * 1000);
  });

  it('+Milionária: soma as nove faixas oficiais cruzando dezenas e trevos', () => {
    // Direto das faixas: 4..6 dezenas × 0..2 trevos, com P(trevos=t) =
    // hipergeométrica(6, 2, 2, t).
    let expected = 0;
    for (let hits = 4; hits <= 6; hits++) {
      for (let trevoHits = 0; trevoHits <= 2; trevoHits++) {
        expected +=
          pOf(Lottery.MAIS_MILIONARIA, hits) *
          hypergeometricProbability(6, 2, 2, trevoHits);
      }
    }
    expect(anyPrizeProbability(Lottery.MAIS_MILIONARIA)).toBeCloseTo(expected, 15);
  });

  it('+Milionária: as faixas cobrem todos os trevos — o baseline coincide com a soma por dezenas', () => {
    // Para dezenas premiadas (4..6), as faixas 4/5/6 × trevos 0/1/2 cobrem
    // TODO o espaço de trevos, então Σ P(h)·Σ P(t) = Σ P(h). O baseline é
    // válido tanto para contagens com trevos (runBacktest) quanto sem
    // (benchmark/auditoria).
    const sumDezenas = pOf(Lottery.MAIS_MILIONARIA, 4) + pOf(Lottery.MAIS_MILIONARIA, 5) + pOf(Lottery.MAIS_MILIONARIA, 6);
    expect(anyPrizeProbability(Lottery.MAIS_MILIONARIA)).toBeCloseTo(sumDezenas, 12);
  });
});
