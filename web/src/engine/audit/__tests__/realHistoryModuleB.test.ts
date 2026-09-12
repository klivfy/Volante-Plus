import { describe, expect, it } from 'vitest';
import { Draw, Lottery } from '../../../types/domain';
import { analyzeBacktest } from '../../backtestAnalyzer';
import { loadMirrorSnapshot } from '../mirrorSource';
import { runModuleB } from '../moduleB';
import { suggestGames } from '../moduleC';

/**
 * Módulo B e C sobre dado real — a mesma disciplina de
 * `realHistoryAudit.test.ts` para o Módulo A: o método (`moduleB.ts`,
 * `moduleC.ts`) foi escrito e commitado ANTES desta execução. Este teste é
 * a primeira vez que ele roda sobre sorteios de verdade, não sobre histórico
 * honesto sintético construído para validar o instrumento (isso já foi feito
 * em `__tests__/moduleB.test.ts`, com o controle negativo).
 *
 * Não afirmamos aqui, antes de rodar, se alguma estratégia será aprovada — a
 * expectativa da teoria é que não seja, e o teste só verifica que o
 * relatório é bem formado; a leitura do resultado vai para o `console.log`.
 */
function formatModuleBReport(
  report: ReturnType<typeof runModuleB>,
): string {
  const lines: string[] = [];
  lines.push(`MÓDULO B — PREVISIBILIDADE — ${report.lottery}`);
  lines.push(`Protocolo v${report.moduleBVersion} · fonte: ${report.sourceLabel}`);
  lines.push('');
  lines.push(
    `Seleção: ${report.selection.contests} concursos, ${report.selection.totalStrategiesCompared} ` +
      `estratégias comparadas, alpha corrigido ${report.selection.correctedAlpha.toExponential(2)}`,
  );
  lines.push(`Candidata: ${report.candidateStrategy ?? '— nenhuma —'}`);
  lines.push(`  ${report.candidateReason}`);
  if (report.confirmation) {
    lines.push(
      `Confirmação: ${report.confirmation.contests} concursos, ${report.confirmation.cuts} cortes, ` +
        `${report.confirmation.significantAdvantageCuts} significativos ` +
        `(consistência ${(report.confirmation.consistency * 100).toFixed(0)}%)`,
    );
  } else {
    lines.push('Confirmação: não executada.');
  }
  lines.push('');
  lines.push(`APROVADO: ${report.approved ? 'sim' : 'não'}`);
  lines.push(report.conclusion);
  return lines.join('\n');
}

describe('Módulo B real: Mega-Sena (espelho de terceiros)', () => {
  const dataset = loadMirrorSnapshot(Lottery.MEGA_SENA);
  const report = runModuleB(dataset);

  it('processa o espelho real sem lançar', () => {
    expect(report.selection.contests).toBeGreaterThan(1000);
  });

  it('roda a seleção com as 5 estratégias do benchmark', () => {
    expect(report.selection.totalStrategiesCompared).toBe(5);
  });

  it('aprovação é booleana e coerente com a presença de candidata', () => {
    if (report.approved) {
      expect(report.candidateStrategy).not.toBeNull();
      expect(report.confirmation).not.toBeNull();
    }
  });

  it('imprime o relatório completo (visível na saída do teste)', () => {
    console.log(`\n${formatModuleBReport(report)}\n`);
    expect(true).toBe(true);
  });

  it('Módulo C obedece o veredito — sugestão real de jogos', () => {
    const performances = analyzeBacktest(dataset.draws as Draw[], Lottery.MEGA_SENA, 20);
    const suggestion = suggestGames(Lottery.MEGA_SENA, performances, report);

    expect(suggestion.predictiveClaim).toBe(report.approved);
    expect(suggestion.games.length).toBeGreaterThan(0);
    console.log(
      `\nMÓDULO C — sugestão real (${suggestion.strategyUsed}, alegação preditiva: ` +
        `${suggestion.predictiveClaim}):\n${suggestion.disclaimer}\n` +
        suggestion.games.map((g) => `  ${g.numbers.join(', ')}`).join('\n') +
        '\n',
    );
  });
});

describe('Módulo B real: +Milionária (espelho de terceiros)', () => {
  const dataset = loadMirrorSnapshot(Lottery.MAIS_MILIONARIA);
  const report = runModuleB(dataset);

  it('processa o espelho real sem lançar', () => {
    expect(report.selection.contests).toBeGreaterThan(100);
  });

  it('aprovação é booleana e coerente com a presença de candidata', () => {
    if (report.approved) {
      expect(report.candidateStrategy).not.toBeNull();
      expect(report.confirmation).not.toBeNull();
    }
  });

  it('imprime o relatório completo (visível na saída do teste)', () => {
    console.log(`\n${formatModuleBReport(report)}\n`);
    expect(true).toBe(true);
  });

  it('Módulo C obedece o veredito — sugestão real de jogos', () => {
    const performances = analyzeBacktest(dataset.draws as Draw[], Lottery.MAIS_MILIONARIA, 20);
    const suggestion = suggestGames(Lottery.MAIS_MILIONARIA, performances, report);

    expect(suggestion.predictiveClaim).toBe(report.approved);
    expect(suggestion.games.length).toBeGreaterThan(0);
    console.log(
      `\nMÓDULO C — sugestão real (${suggestion.strategyUsed}, alegação preditiva: ` +
        `${suggestion.predictiveClaim}):\n${suggestion.disclaimer}\n` +
        suggestion.games.map((g) => `  ${g.numbers.join(', ')}`).join('\n') +
        '\n',
    );
  });
});
