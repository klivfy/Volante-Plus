import { describe, expect, it } from 'vitest';
import { Lottery } from '../../../types/domain';
import { formatAuditReport, runAudit } from '../index';
import { loadMirrorSnapshot } from '../mirrorSource';

/**
 * A auditoria de verdade — a primeira vez que este módulo roda sobre dado
 * real, não sobre histórico honesto sintético construído para testar o
 * instrumento.
 *
 * Deliberadamente não afirmamos aqui se o resultado é "anomalia" ou
 * "compatível" — decidir isso antes de rodar seria exatamente o viés que o
 * protocolo existe para evitar. Os testes verificam que o relatório é
 * produzido corretamente e que a ressalva de fonte não oficial aparece; a
 * leitura do resultado em si vai para o relatório impresso, não para uma
 * asserção de teste.
 */
describe('auditoria real: Mega-Sena (espelho de terceiros)', () => {
  const dataset = loadMirrorSnapshot(Lottery.MEGA_SENA);
  // Réplicas reduzidas para o teste rodar rápido; o valor real fica registrado
  // no relatório mesmo assim (Regra 3 exige declarar, não necessariamente 10k
  // em todo teste automatizado).
  const report = runAudit(dataset, { baselineHistories: 3000, baselineSeed: 20260910 });

  it('processa os ~2.797 concursos reais sem lançar', () => {
    expect(report.contests).toBeGreaterThan(2500);
  });

  it('carrega a procedência correta e a marca de datas aproximadas', () => {
    expect(report.provenance).toBe('third_party_mirror');
    expect(report.datesAreApproximate).toBe(true);
  });

  it('produz os três recortes (histórico longo o bastante para replicação)', () => {
    expect(report.replicationPossible).toBe(true);
    expect(report.segments).toHaveLength(3);
  });

  it('todo teste executado tem p-valor, poder e efeito mínimo detectável', () => {
    const full = report.segments.find((s) => s.label === 'completo')!;
    for (const test of full.tests.filter((t) => t.executed)) {
      expect(test.pValue).toBeGreaterThanOrEqual(0);
      expect(test.pValue).toBeLessThanOrEqual(1);
      expect(test.power).toBeGreaterThanOrEqual(0);
      expect(test.minimumDetectableEffect).toBeDefined();
    }
  });

  it('a conclusão é uma das três formas válidas do protocolo', () => {
    expect(report.conclusion).toMatch(/Anomalia confirmada|Nenhuma anomalia|curto demais/);
  });

  it('o relatório formatado inclui a ressalva de fonte não oficial em destaque', () => {
    const text = formatAuditReport(report);
    expect(text).toContain('FONTE NÃO OFICIAL');
    expect(text).toContain('loteria.json');
    expect(text).toContain('APROXIMADO');
  });

  it('imprime o relatório completo (visível na saída do teste)', () => {
    console.log(`\n${formatAuditReport(report)}\n`);
    expect(true).toBe(true);
  });
});

describe('auditoria real: +Milionária (espelho de terceiros)', () => {
  const dataset = loadMirrorSnapshot(Lottery.MAIS_MILIONARIA);
  const report = runAudit(dataset, { baselineHistories: 3000, baselineSeed: 20260910 });

  it('processa os 199 concursos reais sem lançar', () => {
    expect(report.contests).toBe(199);
  });

  it('inclui o teste de trevos, exclusivo desta modalidade', () => {
    const full = report.segments.find((s) => s.label === 'completo')!;
    const trevos = full.tests.find((t) => t.id === 'A1.trevos')!;
    expect(trevos.executed).toBe(true);
  });

  it('a conclusão é uma das formas válidas do protocolo', () => {
    expect(report.conclusion).toMatch(/Anomalia confirmada|Nenhuma anomalia|curto demais/);
  });

  it('imprime o relatório completo (visível na saída do teste)', () => {
    console.log(`\n${formatAuditReport(report)}\n`);
    expect(true).toBe(true);
  });
});
