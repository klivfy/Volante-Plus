import { describe, expect, it } from 'vitest';
import { Lottery } from '../../types/domain';
import {
  anyPrizeProbability,
  prizeProbabilityByNumbersAlone,
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


describe('prizeProbabilityByNumbersAlone — baseline só-de-dezenas (Onda 5)', () => {
  it('coincide com anyPrizeProbability nas loterias sem trevo', () => {
    expect(prizeProbabilityByNumbersAlone(Lottery.MEGA_SENA)).toBeCloseTo(
      anyPrizeProbability(Lottery.MEGA_SENA),
      15,
    );
    expect(prizeProbabilityByNumbersAlone(Lottery.QUINA)).toBeCloseTo(
      anyPrizeProbability(Lottery.QUINA),
      15,
    );
  });

  it('+Milionária: é a soma P(4)+P(5)+P(6) — MENOR que o baseline completo', () => {
    // As 4 faixas fixas (2+1/2+2/3+1/3+2) exigem trevo: não podem entrar no
    // baseline de contagens que ignoram trevos (benchmark/Módulo B).
    const sumDezenas =
      hypergeometricProbability(50, 6, 6, 4) +
      hypergeometricProbability(50, 6, 6, 5) +
      hypergeometricProbability(50, 6, 6, 6);
    expect(prizeProbabilityByNumbersAlone(Lottery.MAIS_MILIONARIA)).toBeCloseTo(sumDezenas, 15);
    expect(prizeProbabilityByNumbersAlone(Lottery.MAIS_MILIONARIA)).toBeLessThan(
      anyPrizeProbability(Lottery.MAIS_MILIONARIA),
    );
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

  it('+Milionária: soma as 10 faixas oficiais — dezenas×trevos mais os 4 prêmios fixos', () => {
    // Direto das faixas: 4..6 dezenas × 0..2 trevos, com P(trevos=t) =
    // hipergeométrica(6, 2, 2, t), MAIS as faixas fixas 3+2, 3+1, 2+2, 2+1
    // (regulamento oficial; espelho de PrizeRules.kt).
    let expected = 0;
    for (let hits = 4; hits <= 6; hits++) {
      for (let trevoHits = 0; trevoHits <= 2; trevoHits++) {
        expected +=
          pOf(Lottery.MAIS_MILIONARIA, hits) *
          hypergeometricProbability(6, 2, 2, trevoHits);
      }
    }
    for (const [hits, trevoHits] of [[3, 2], [3, 1], [2, 2], [2, 1]] as const) {
      expected +=
        pOf(Lottery.MAIS_MILIONARIA, hits) *
        hypergeometricProbability(6, 2, 2, trevoHits);
    }
    expect(anyPrizeProbability(Lottery.MAIS_MILIONARIA)).toBeCloseTo(expected, 15);
    // Constante de validação do spec official-rules.md: P(qualquer prêmio) na
    // aposta simples = 0,0877961323 (1 em ~11,4). A tabela sem as faixas fixas
    // devolvia 0,0009097 (~96,5× menor) — a mesma classe do bug H-1 da Quina.
    expect(anyPrizeProbability(Lottery.MAIS_MILIONARIA)).toBeCloseTo(0.0877961323, 8);
  });

  it('+Milionária: as faixas fixas 2+1/2+2/3+1/3+2 elevam o baseline acima da soma por dezenas', () => {
    // Para dezenas premiadas (4..6), as faixas 4/5/6 × trevos 0/1/2 cobrem
    // TODO o espaço de trevos (Σ P(h)·Σ P(t) = Σ P(h)). Mas o baseline oficial
    // vai além: as faixas fixas premiam com 2..3 dezenas acertadas (se o trevo
    // acertar), então anyPrize > Σ P(4..6) — e a diferença é a soma delas.
    const sumDezenas = pOf(Lottery.MAIS_MILIONARIA, 4) + pOf(Lottery.MAIS_MILIONARIA, 5) + pOf(Lottery.MAIS_MILIONARIA, 6);
    const baseline = anyPrizeProbability(Lottery.MAIS_MILIONARIA);
    expect(baseline).toBeGreaterThan(sumDezenas);
    let fixedSum = 0;
    for (const [hits, trevoHits] of [[3, 2], [3, 1], [2, 2], [2, 1]] as const) {
      fixedSum +=
        pOf(Lottery.MAIS_MILIONARIA, hits) *
        hypergeometricProbability(6, 2, 2, trevoHits);
    }
    expect(baseline).toBeCloseTo(sumDezenas + fixedSum, 12);
  });
});
