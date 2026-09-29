import { describe, expect, it } from 'vitest';
import { loadHistorySeed } from '../../data/history';
import { isValidDraw } from '../../services/drawSources';
import { Draw, Lottery, NumberPerformance } from '../../types/domain';
import { analyzeBacktest, analyzeTrevoBacktest } from '../backtestAnalyzer';
import { guaranteeProbability } from '../betPlanning';
import { bayesEvidenceFromDraws, bayesEvidenceFromPerformances, bayesTrajectory } from '../bayesEvidence';
import { generateClosure, offeredGuarantees, verifyClosure } from '../closureDesigner';
import { collisionTest, overlapSpectrumTest } from '../drawDependence';
import { generateGames } from '../gameGenerator';
import { numberEvidence } from '../numberEvidence';
import { drawSpace, hasTrevos, lotteryRules } from '../prizeRules';
import { createSeededRandom } from '../random';
import { relativePopularity } from '../payoutShare';

/**
 * Paridade entre modalidades: todo método de sugestão e de análise roda, com
 * resultado íntegro, na Mega-Sena E na +Milionária — dezenas e, onde existem,
 * trevos. Se um método novo só funcionar numa das duas, este arquivo é o lugar
 * que denuncia.
 */

const LOTTERIES = [Lottery.MEGA_SENA, Lottery.MAIS_MILIONARIA];

/** Histórico honesto simulado, com trevos quando a modalidade os tem. */
function honest(lottery: Lottery, count: number, seed: number): Draw[] {
  const rules = lotteryRules(lottery);
  const random = createSeededRandom(seed);
  const pick = (universe: number, size: number): number[] => {
    const s = new Set<number>();
    while (s.size < size) s.add(1 + random.nextInt(universe));
    return [...s];
  };
  return Array.from({ length: count }, (_, i) => ({
    lottery,
    contestNumber: i + 1,
    date: '2030-01-01',
    numbers: pick(rules.numberUniverse, rules.numbersDrawn),
    ...(hasTrevos(lottery) ? { trevos: pick(rules.trevoUniverse, rules.trevosDrawn) } : {}),
  }));
}

describe.each(LOTTERIES)('paridade — %s', (lottery) => {
  const rules = lotteryRules(lottery);

  it('gerador: estratégia padrão e a legada devolvem jogos íntegros', () => {
    const draws = honest(lottery, 400, 1);
    const perf = analyzeBacktest(draws, lottery, 0);
    const trevoPerf = analyzeTrevoBacktest(draws, lottery, 0);
    for (const strategy of ['UNPOPULAR', 'FREQUENCY_TIERS'] as const) {
      const batch = generateGames(lottery, 4, perf, {
        trevoPerformances: trevoPerf,
        strategy,
        random: createSeededRandom(3),
      });
      expect(batch.games).toHaveLength(4);
      for (const game of batch.games) {
        expect(new Set(game.numbers).size).toBe(rules.numbersDrawn);
        expect(game.numbers.every((n) => n >= 1 && n <= rules.numberUniverse)).toBe(true);
        if (hasTrevos(lottery)) {
          const [a, b] = game.trevoDuplas![0];
          expect(a).not.toBe(b);
          expect([a, b].every((t) => t >= 1 && t <= rules.trevoUniverse)).toBe(true);
        } else {
          expect(game.trevoDuplas).toBeUndefined();
        }
      }
    }
  });

  it('gerador de baixa popularidade é menos popular que o sorteio uniforme', () => {
    const perf = analyzeBacktest(honest(lottery, 200, 2), lottery, 0);
    const rnd = createSeededRandom(4);
    let chosen = 0;
    let uniform = 0;
    const N = 400;
    for (let i = 0; i < N; i++) {
      chosen += relativePopularity(lottery, generateGames(lottery, 2, perf, { random: rnd }).games[0].numbers);
      const s = new Set<number>();
      while (s.size < rules.numbersDrawn) s.add(1 + rnd.nextInt(rules.numberUniverse));
      uniform += relativePopularity(lottery, [...s]);
    }
    expect(chosen / N).toBeLessThan((uniform / N) * 0.9);
  });

  it('fechamento: toda garantia oferecida, em todo tamanho de pool, é provada e íntegra', () => {
    expect(offeredGuarantees(lottery).length).toBeGreaterThan(0);
    for (const guarantee of offeredGuarantees(lottery)) {
      for (let v = rules.numbersDrawn + 1; v <= rules.maxSelection; v++) {
        const pool = Array.from({ length: v }, (_, i) => i + 1);
        const batch = generateClosure(lottery, pool, guarantee, { random: createSeededRandom(v) });
        expect(verifyClosure({ games: batch.games.map((g) => g.numbers), guarantee, poolSize: v }, pool)).toBe(true);
        expect(batch.closure).toMatchObject({ guarantee, poolSize: v });
        for (const game of batch.games) {
          expect(game.numbers.every((n) => pool.includes(n))).toBe(true);
          if (hasTrevos(lottery)) expect(game.trevoDuplas).toHaveLength(1);
        }
        const p = guaranteeProbability(lottery, v, guarantee);
        expect(p).toBeGreaterThan(0);
        expect(p).toBeLessThan(1);
      }
    }
  });

  it('evidência e fator de Bayes nas dezenas: honesto não aponta viés', () => {
    const draws = honest(lottery, 1500, 5);
    const perf = analyzeBacktest(draws, lottery, 0);
    expect(numberEvidence(lottery, perf).verdict).not.toBe('DESVIO_SIGNIFICATIVO');
    const bayes = bayesEvidenceFromPerformances(lottery, perf);
    expect(bayes.log10Bf10).toBeLessThan(1);
    expect(bayes.shrunkProbabilities).toHaveLength(rules.numberUniverse);
    // Coerência: o caminho por concursos e o por frequências dão o mesmo fator.
    expect(bayesEvidenceFromDraws(lottery, draws).log10Bf10).toBeCloseTo(bayes.log10Bf10, 9);
  });

  it('teste de colisão e espectro de sobreposição rodam e não acusam histórico honesto', () => {
    const draws = honest(lottery, 250, 6);
    const c = collisionTest(lottery, draws);
    expect(c.observed).toBe(0);
    expect(c.expected).toBeGreaterThan(0);
    const o = overlapSpectrumTest(lottery, draws, { baselineRuns: 30, random: createSeededRandom(1) });
    expect(o.observed.reduce((a, b) => a + b, 0)).toBe(o.pairs);
  });

  it('roda sobre o histórico REAL embutido, completo', async () => {
    const draws = await loadHistorySeed(lottery);
    expect(draws.every((d) => isValidDraw(lottery, d))).toBe(true);
    const perf = analyzeBacktest(draws, lottery, 0);
    expect(perf).toHaveLength(rules.numberUniverse);
    expect(numberEvidence(lottery, perf).draws).toBe(draws.length);
    expect(collisionTest(lottery, draws).observed).toBe(0);
    expect(bayesTrajectory(lottery, draws).points).toHaveLength(draws.length);
  }, 60_000);
});

describe('trevos (+Milionária) recebem o mesmo tratamento das dezenas', () => {
  const lottery = Lottery.MAIS_MILIONARIA;

  it('drawSpace descreve os dois espaços e recusa trevos na Mega-Sena', () => {
    expect(drawSpace(lottery, 'numbers')).toEqual({ universe: 50, drawn: 6 });
    expect(drawSpace(lottery, 'trevos')).toEqual({ universe: 6, drawn: 2 });
    expect(() => drawSpace(Lottery.MEGA_SENA, 'trevos')).toThrow(RangeError);
  });

  it('sorteio honesto: evidência frequentista dos trevos calibrada (falso-positivo global ≲ 10%)', () => {
    let flagged = 0;
    const seeds = 150;
    for (let seed = 1; seed <= seeds; seed++) {
      const perf = analyzeTrevoBacktest(honest(lottery, 300, 1000 + seed), lottery, 0);
      if (numberEvidence(lottery, perf, 'trevos').verdict === 'DESVIO_SIGNIFICATIVO') flagged++;
    }
    expect(flagged / seeds).toBeLessThanOrEqual(0.1);
  });

  it('sorteio honesto: BF dos trevos respeita Markov (P(BF10 ≥ 10) ≤ 10%)', () => {
    let strong = 0;
    const seeds = 100;
    for (let seed = 1; seed <= seeds; seed++) {
      const e = bayesEvidenceFromDraws(lottery, honest(lottery, 400, 2000 + seed), 'trevos');
      if (e.log10Bf10 >= 1) strong++;
    }
    expect(strong / seeds).toBeLessThanOrEqual(0.1);
  });

  it('detecta um trevo viciado (o 3 sai bem mais que o esperado)', () => {
    const draws = honest(lottery, 1500, 7);
    const random = createSeededRandom(9);
    for (const d of draws) {
      if (random.nextFloat() < 0.35 && !d.trevos!.includes(3)) d.trevos = [3, d.trevos![0] === 3 ? d.trevos![1] : d.trevos![0]];
    }
    const perf = analyzeTrevoBacktest(draws, lottery, 0);
    expect(numberEvidence(lottery, perf, 'trevos').verdict).toBe('DESVIO_SIGNIFICATIVO');
    const bayes = bayesEvidenceFromDraws(lottery, draws, 'trevos');
    expect(bayes.log10BfSparse).toBeGreaterThan(2);
    expect(bayes.anytimeP).toBeLessThan(0.05);
  });

  it('poucos concursos: recusa concluir, sem quebrar', () => {
    const perf = analyzeTrevoBacktest(honest(lottery, 5, 1), lottery, 0);
    expect(numberEvidence(lottery, perf, 'trevos').verdict).toBe('AMOSTRA_INSUFICIENTE');
  });

  it('colisão inclui os trevos: mesmas dezenas com trevos diferentes NÃO é repetição', () => {
    const draws = honest(lottery, 100, 3);
    draws[50] = { ...draws[50], numbers: [...draws[10].numbers], trevos: draws[10].trevos!.map((t) => (t === 6 ? 1 : t + 1)) as number[] };
    expect(collisionTest(lottery, draws).observed).toBe(0);
    draws[60] = { ...draws[60], numbers: [...draws[10].numbers], trevos: [...draws[10].trevos!] };
    expect(collisionTest(lottery, draws).observed).toBe(1);
  });

  it('a desigualdade esperada de colisão usa C(50,6)·C(6,2)', () => {
    const c = collisionTest(lottery, honest(lottery, 100, 4));
    expect(c.expected).toBeCloseTo((100 * 99) / 2 / (15890700 * 15), 12);
  });
});

it('nenhuma função de análise deixa de aceitar as duas modalidades: perfis de desempenho completos', () => {
  for (const lottery of LOTTERIES) {
    const perf: NumberPerformance[] = analyzeBacktest(honest(lottery, 100, 8), lottery, 0);
    expect(perf.map((p) => p.number).sort((a, b) => a - b)).toEqual(
      Array.from({ length: lotteryRules(lottery).numberUniverse }, (_, i) => i + 1),
    );
  }
});
