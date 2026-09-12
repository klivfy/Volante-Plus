import { describe, expect, it } from 'vitest';
import { Draw, Lottery } from '../../../types/domain';
import { generateSyntheticHistory } from '../../__tests__/fixtures';
import { DrawDataset } from '../provenance';
import { runModuleB } from '../moduleB';
import { suggestGames, NO_CLAIM_DISCLAIMER, DEFAULT_BUDGET_GAMES } from '../moduleC';
import { analyzeBacktest } from '../../backtestAnalyzer';

const MEGA = Lottery.MEGA_SENA;

function officialDataset(draws: Draw[], label = 'Simulação rotulada para teste'): DrawDataset {
  return { lottery: MEGA, draws, provenance: 'official', sourceLabel: label };
}

/**
 * CONTROLE NEGATIVO — histórico honesto por construção não pode aprovar
 * previsibilidade. É o mesmo espírito do controle negativo do Módulo A: um
 * instrumento que "aprova" um método sobre sorteio uniforme está quebrado.
 */
describe('runModuleB — controle negativo: histórico honesto', () => {
  it('não aprova nenhuma estratégia sobre sorteio uniforme', () => {
    const history = generateSyntheticHistory(MEGA, 700, { seed: 11 });
    const report = runModuleB(officialDataset(history));

    expect(report.approved).toBe(false);
    expect(report.moduleBVersion).toBe('1.0.0');
    // Ou nenhum candidato emergiu, ou emergiu mas não replicou — nunca aprovado.
    if (report.candidateStrategy !== null) {
      expect(report.confirmation).not.toBeNull();
    }
  });

  it('recusa dado não auditável, igual ao Módulo A', () => {
    const history = generateSyntheticHistory(MEGA, 700, { seed: 12 });
    const data: DrawDataset = { ...officialDataset(history), provenance: 'synthetic' };
    expect(() => runModuleB(data)).toThrow(/oficial|terceiros/);
  });
});

describe('suggestGames — Módulo C obedece o veredito do Módulo B', () => {
  it('sem aprovação, rotula sem alegação preditiva e usa tier-weighted', () => {
    const history = generateSyntheticHistory(MEGA, 700, { seed: 13 });
    const moduleB = runModuleB(officialDataset(history));
    const performances = analyzeBacktest(history, MEGA, 5);

    const suggestion = suggestGames(MEGA, performances, moduleB);

    expect(suggestion.predictiveClaim).toBe(false);
    expect(suggestion.strategyUsed).toBe('tier-weighted');
    expect(suggestion.disclaimer).toBe(NO_CLAIM_DISCLAIMER);
    expect(suggestion.budgetGames).toBe(DEFAULT_BUDGET_GAMES);
    expect(suggestion.games.length).toBeGreaterThan(0);
    for (const game of suggestion.games) {
      expect(game.numbers).toHaveLength(6);
    }
  });

  it('recusa orçamento fora de MIN_GAMES..MAX_GAMES', () => {
    const history = generateSyntheticHistory(MEGA, 700, { seed: 14 });
    const moduleB = runModuleB(officialDataset(history));
    const performances = analyzeBacktest(history, MEGA, 5);

    expect(() => suggestGames(MEGA, performances, moduleB, { budgetGames: 99 })).toThrow(RangeError);
  });

  it('recusa relatório do Módulo B de outra loteria', () => {
    const history = generateSyntheticHistory(MEGA, 700, { seed: 15 });
    const moduleB = runModuleB(officialDataset(history));
    const performances = analyzeBacktest(history, MEGA, 5);

    expect(() =>
      suggestGames(Lottery.MAIS_MILIONARIA, performances, moduleB),
    ).toThrow(RangeError);
  });
});
