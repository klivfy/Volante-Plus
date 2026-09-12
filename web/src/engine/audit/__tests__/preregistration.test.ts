import { describe, expect, it } from 'vitest';
import { Lottery } from '../../../types/domain';
import {
  ALPHA,
  BASELINE_HISTORIES,
  PREREGISTERED_TESTS,
  expectedRepetition,
  expectedSum,
  plannedTestCount,
  sumStdDeviation,
  sumVariance,
  testsFor,
} from '../preregistration';

/**
 * Estes testes conferem que as constantes DERIVADAS reproduzem exatamente os
 * valores que o protocolo enuncia. É a diferença entre uma fórmula certa e um
 * número copiado certo: se alguém trocar a derivação, isto quebra.
 */
describe('constantes derivadas do protocolo', () => {
  it('repetição esperada entre concursos vizinhos: 0,6 (Mega) e 0,72 (+Mi)', () => {
    expect(expectedRepetition(Lottery.MEGA_SENA)).toBeCloseTo(0.6, 12);
    expect(expectedRepetition(Lottery.MAIS_MILIONARIA)).toBeCloseTo(0.72, 12);
  });

  it('soma média esperada: 183 (Mega) e 153 (+Mi)', () => {
    expect(expectedSum(Lottery.MEGA_SENA)).toBe(183);
    expect(expectedSum(Lottery.MAIS_MILIONARIA)).toBe(153);
  });

  it('variância da soma segue K(N+1)(N−K)/12', () => {
    // Mega: 6·61·54/12 = 1647.
    expect(sumVariance(Lottery.MEGA_SENA)).toBeCloseTo(1647, 9);
    expect(sumStdDeviation(Lottery.MEGA_SENA)).toBeCloseTo(Math.sqrt(1647), 9);
    // +Mi: 6·51·44/12 = 1122.
    expect(sumVariance(Lottery.MAIS_MILIONARIA)).toBeCloseTo(1122, 9);
  });

  it('a repetição esperada é K²/N, não um valor solto', () => {
    // Confere a identidade contra o cálculo independente, para as duas.
    expect(expectedRepetition(Lottery.MEGA_SENA)).toBeCloseTo((6 * 6) / 60, 12);
    expect(expectedRepetition(Lottery.MAIS_MILIONARIA)).toBeCloseTo((6 * 6) / 50, 12);
  });
});

describe('registro de testes', () => {
  it('o conjunto é congelado — o denominador de Bonferroni não pode mudar em runtime', () => {
    expect(Object.isFrozen(PREREGISTERED_TESTS)).toBe(true);
    expect(() => {
      (PREREGISTERED_TESTS as unknown as unknown[]).push({});
    }).toThrow();
  });

  it('trevos só entram na +Milionária', () => {
    const mega = testsFor(Lottery.MEGA_SENA).map((t) => t.id);
    const mais = testsFor(Lottery.MAIS_MILIONARIA).map((t) => t.id);
    expect(mega).not.toContain('A1.trevos');
    expect(mais).toContain('A1.trevos');
    expect(plannedTestCount(Lottery.MEGA_SENA)).toBe(4);
    expect(plannedTestCount(Lottery.MAIS_MILIONARIA)).toBe(5);
  });

  it('todo teste declara H0 e alternativa — sem isso não há pré-registração', () => {
    for (const test of PREREGISTERED_TESTS) {
      expect(test.nullHypothesis.length).toBeGreaterThan(10);
      expect(test.alternative.length).toBeGreaterThan(10);
    }
  });

  it('ids são únicos e estáveis', () => {
    const ids = PREREGISTERED_TESTS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(['A1.numbers', 'A1.trevos', 'A2.repetition', 'A3.sum', 'A4.winners']);
  });

  it('os parâmetros do protocolo são os que o spec fixa', () => {
    expect(ALPHA).toBe(0.05);
    expect(BASELINE_HISTORIES).toBe(10_000);
  });
});
