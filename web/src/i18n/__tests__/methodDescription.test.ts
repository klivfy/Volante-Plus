import { describe, expect, it } from 'vitest';
import common from '../../../locales/pt-BR/common.json';
import { UNPOPULAR_STRATEGY_LABEL } from '../../engine/gameGenerator';
import { runStrategyBenchmark } from '../../engine/strategyBenchmark';
import { Draw, Lottery } from '../../types/domain';

/**
 * A página Sobre e a comparação de estratégias descreviam como atual o método
 * por faixas de frequência (70/20/10), que deixou de ser o padrão na 2.3.0
 * (`docs/revisao-de-design-2026-10.md`, achado A3). Estes testes amarram o
 * texto à estratégia que o gerador usa de fato.
 */
describe('descrição do método de geração', () => {
  it('a página Sobre descreve a estratégia padrão do gerador', () => {
    expect(common.sobre.howBody.toLowerCase()).toContain(UNPOPULAR_STRATEGY_LABEL.toLowerCase());
  });

  it('a página Sobre não apresenta as faixas 70/20/10 como o método atual', () => {
    expect(common.sobre.howBody).not.toMatch(/sorteia 70%/);
    expect(common.sobre.howBody).toMatch(/método anterior/);
  });

  it('a comparação de estratégias não chama as faixas de "método do app"', () => {
    const draws: Draw[] = Array.from({ length: 60 }, (_, i) => ({
      lottery: Lottery.MEGA_SENA,
      contestNumber: i + 1,
      date: `2020-01-${String((i % 28) + 1).padStart(2, '0')}`,
      numbers: [1, 2, 3, 4, 5, 6].map((n) => ((n + i * 7) % 60) + 1),
    }));
    const result = runStrategyBenchmark(draws.slice(0, 50), draws.slice(50), Lottery.MEGA_SENA, {
      simulationRounds: 1,
    });
    const tiers = result.results.find((row) => row.strategy === 'tier-weighted');
    expect(tiers?.description).not.toMatch(/^Método do app/);
    expect(tiers?.description).toMatch(/até a versão 2\.2/);
  });
});
