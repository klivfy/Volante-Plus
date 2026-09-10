import { describe, expect, it } from 'vitest';
import { Lottery } from '../../../types/domain';
import { loadMirrorSnapshot } from '../mirrorSource';
import { assertAuditable, isAuditable, minimumContestsFor } from '../provenance';

describe('loadMirrorSnapshot', () => {
  it('carrega histórico real da Mega-Sena, com procedência de espelho', () => {
    const dataset = loadMirrorSnapshot(Lottery.MEGA_SENA);
    expect(dataset.provenance).toBe('third_party_mirror');
    expect(dataset.datesAreApproximate).toBe(true);
    expect(dataset.draws.length).toBeGreaterThan(minimumContestsFor(Lottery.MEGA_SENA));
    expect(dataset.sourceLabel).toMatch(/loteria\.json/);
  });

  it('carrega histórico real da +Milionária', () => {
    const dataset = loadMirrorSnapshot(Lottery.MAIS_MILIONARIA);
    expect(dataset.provenance).toBe('third_party_mirror');
    expect(dataset.draws.length).toBeGreaterThan(minimumContestsFor(Lottery.MAIS_MILIONARIA));
  });

  it('os dois conjuntos passam a guarda de auditabilidade', () => {
    expect(isAuditable(loadMirrorSnapshot(Lottery.MEGA_SENA))).toBe(true);
    expect(isAuditable(loadMirrorSnapshot(Lottery.MAIS_MILIONARIA))).toBe(true);
  });

  it('não lança na validação estrutural completa (0 problemas esperados)', () => {
    expect(() => assertAuditable(loadMirrorSnapshot(Lottery.MEGA_SENA))).not.toThrow();
    expect(() => assertAuditable(loadMirrorSnapshot(Lottery.MAIS_MILIONARIA))).not.toThrow();
  });

  it('números de concurso são únicos e sequenciais desde o 1', () => {
    const draws = loadMirrorSnapshot(Lottery.MEGA_SENA).draws;
    const numbers = draws.map((d) => d.contestNumber).sort((a, b) => a - b);
    expect(numbers[0]).toBe(1);
    expect(new Set(numbers).size).toBe(numbers.length);
    // Sequencial sem buracos: máximo == contagem.
    expect(numbers[numbers.length - 1]).toBe(numbers.length);
  });

  it('+Milionária: trevos vêm sempre nos últimos 2 valores, dezenas nos 6 primeiros', () => {
    const draws = loadMirrorSnapshot(Lottery.MAIS_MILIONARIA).draws;
    for (const draw of draws) {
      expect(draw.numbers).toHaveLength(6);
      expect(draw.trevos).toHaveLength(2);
      expect(draw.numbers!.every((n) => n >= 1 && n <= 50)).toBe(true);
      expect(draw.trevos!.every((t) => t >= 1 && t <= 6)).toBe(true);
    }
  });
});
