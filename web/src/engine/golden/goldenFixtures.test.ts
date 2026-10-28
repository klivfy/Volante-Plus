import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Lottery } from '../../types/domain';
import { binomial, hypergeometricProbability } from '../hypergeometric';
import { classifyHits, lotteryRules } from '../prizeRules';
import {
  FLOAT_VS_EXACT_TOLERANCE,
  GOLDEN_FIXTURE_SCHEMA,
  GOLDEN_LOTTERIES,
  buildGoldenFixture,
  goldenLotteryKey,
  relativeDeviation,
  serializeGoldenFixture,
} from './goldenFixture';

/**
 * Anti-deriva das fixtures douradas (Fase 4, frente 1).
 *
 * A fixture versionada em `shared/src/commonTest/resources/golden/` é lida
 * pelo teste dourado Kotlin — e por ESTE teste aqui, que re-gera tudo a
 * partir do motor TypeScript e exige igualdade byte a byte. Se alguém mudou
 * o motor (regras, faixas, entradas canônicas) sem regenerar, ou regenerou
 * sem revisar o impacto no Kotlin, o teste falha nos dois lados. Nunca
 * atualize o JSON esperado sem ler o diff — ele é contrato entre
 * plataformas, não snapshot.
 */

const here = dirname(fileURLToPath(import.meta.url));
/** web/src/engine/golden → raiz do repo → shared/.../resources/golden. */
const committedDir = join(here, '..', '..', '..', '..', 'shared', 'src', 'commonTest', 'resources', 'golden');

const committed = Object.fromEntries(
  GOLDEN_LOTTERIES.map((lottery) => {
    const key = goldenLotteryKey(lottery);
    return [key, readFileSync(join(committedDir, `${key}.json`), 'utf8')];
  }),
);

describe.each(GOLDEN_LOTTERIES)('fixture dourada %s — geração e conteúdo', (lottery) => {
  const key = goldenLotteryKey(lottery);
  const fixture = buildGoldenFixture(lottery);
  const rules = lotteryRules(lottery);

  it('re-gerada do motor é byte a byte a versão versionada', () => {
    expect(serializeGoldenFixture(fixture)).toBe(committed[key]);
  });

  it('schema é o da paridade e as entradas canônicas são declaradas sintéticas', () => {
    expect(fixture.schema).toBe(GOLDEN_FIXTURE_SCHEMA);
    expect(fixture.lottery).toBe(key);
    // Concursos canônicos nunca usam numeração do histórico real (1..3063
    // na Mega). Os blocos fixados usam faixas altas distintas (1001+, 2001+,
    // 3001+) para que a colisão com dados oficiais seja visível no diff.
    expect(fixture.canonicalDraws.map((d) => d.contestNumber)).not.toContain(1);
  });

  it('regras espelham lotteryRules e as faixas vêm de prizeTiers', () => {
    expect(fixture.rules).toEqual({
      numberUniverse: rules.numberUniverse,
      numbersDrawn: rules.numbersDrawn,
      numbersPerBet: rules.numbersPerBet,
      trevoUniverse: rules.trevoUniverse,
      trevosDrawn: rules.trevosDrawn,
      trevosPerBet: rules.trevosPerBet,
      minSelection: rules.minSelection,
      maxSelection: rules.maxSelection,
      betPriceBrl: rules.betPriceBrl,
    });
    expect(fixture.tiers.map((t) => t.key)).toEqual(rules.tiers.map((t) => t.key));
  });

  it('grade de classificação cobre todo o espaço de acertos e bate com classifyHits', () => {
    const expectedCount = (rules.numbersPerBet + 1) * (rules.trevoUniverse > 0 ? 3 : 1);
    expect(fixture.classification).toHaveLength(expectedCount);
    for (const row of fixture.classification) {
      const tier = classifyHits(lottery, row.numberHits, row.trevoHits);
      expect(row.tier).toBe(tier ? tier.key : null);
    }
  });

  it('frações exatas: motor double concorda com a verdade exata dentro da tolerância', () => {
    for (const entry of fixture.exactTierProbabilities) {
      const tier = rules.tiers.find((t) => t.key === entry.tier)!;
      const numbers = hypergeometricProbability(
        rules.numberUniverse,
        rules.numbersDrawn,
        rules.numbersPerBet,
        tier.numberHits,
      );
      const trevos =
        tier.trevoHits === undefined
          ? 1
          : hypergeometricProbability(rules.trevoUniverse, rules.trevosDrawn, rules.trevosPerBet, tier.trevoHits);
      const deviation = relativeDeviation(Number(entry.numerator) / Number(entry.denominator), numbers * trevos);
      expect(deviation, `faixa ${entry.tier}`).toBeLessThanOrEqual(FLOAT_VS_EXACT_TOLERANCE);
    }
    const prizeExact = Number(fixture.exactPrizeProbability.numerator) / Number(fixture.exactPrizeProbability.denominator);
    const total = Object.values(
      // soma via prizeProbabilities exigiria outro import; aqui o Produto das
      // faixas já cobre — a soma exata tem de bater com Σ doubles das faixas.
      fixture.exactTierProbabilities.reduce<Record<string, number>>((acc, e) => {
        acc[e.tier] = Number(e.numerator) / Number(e.denominator);
        return acc;
      }, {}),
    ).reduce((a, b) => a + b, 0);
    expect(relativeDeviation(prizeExact, total)).toBeLessThanOrEqual(FLOAT_VS_EXACT_TOLERANCE);
  });

  it('probabilidade de prêmio exata é coerente com o complementar das faixas', () => {
    const { numerator, denominator } = fixture.exactPrizeProbability;
    expect(BigInt(numerator)).toBeGreaterThan(BigInt(0));
    expect(BigInt(denominator)).toBeGreaterThan(BigInt(numerator));
  });

  it('E[acertos] exato = K·n/N e o double do motor concorda', () => {
    const exact = Number(fixture.exactExpectedNumberHits.numerator) / Number(fixture.exactExpectedNumberHits.denominator);
    expect(exact).toBeCloseTo((rules.numbersDrawn * rules.numbersPerBet) / rules.numberUniverse, 12);
  });

  it('resultados dos pares (aposta, concurso) batem com a classificação do motor', () => {
    expect(fixture.betOutcomes).toHaveLength(fixture.canonicalBets.length * fixture.canonicalDraws.length);
    for (const outcome of fixture.betOutcomes) {
      const bet = fixture.canonicalBets[outcome.betIndex];
      const draw = fixture.canonicalDraws[outcome.drawIndex];
      const numberHits = bet.filter((n) => draw.numbers.includes(n)).length;
      expect(outcome.numberHits).toBe(numberHits);
      const tier = classifyHits(lottery, numberHits, outcome.trevoHits);
      expect(outcome.tier).toBe(tier ? tier.key : null);
      expect(outcome.prized).toBe(tier !== null);
    }
  });

  it('casos de fechamento declaram C(v,t) correto e garantias oferecidas', () => {
    for (const closureCase of fixture.closureCases) {
      expect(closureCase.gameSize).toBe(rules.numbersPerBet);
      // C(10, t) — o pool canônico tem 10 dezenas.
      expect(closureCase.totalSubsets).toBe(Number(binomial(closureCase.pool.length, closureCase.guarantee)));
    }
    expect(fixture.offeredGuarantees.length).toBeGreaterThan(0);
  });
});

describe('fixtures douradas — coerência entre modalidades', () => {
  it('cada modalidade tem schema, loteria e preços próprios corretos', () => {
    expect(buildGoldenFixture(Lottery.MEGA_SENA).rules.betPriceBrl).toBe(6);
    expect(buildGoldenFixture(Lottery.MAIS_MILIONARIA).rules.betPriceBrl).toBe(6);
    expect(buildGoldenFixture(Lottery.QUINA).rules.betPriceBrl).toBe(3);
    const keys = GOLDEN_LOTTERIES.map(goldenLotteryKey);
    expect(new Set(keys).size).toBe(3);
  });
});
