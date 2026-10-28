import { describe, expect, it } from 'vitest';
import { pageLottery } from '../LotteryThemeContext';
import { Lottery } from '../../types/domain';

describe('pageLottery', () => {
  it('a modalidade do tema global define a modalidade inicial da tela', () => {
    expect(pageLottery(Lottery.QUINA)).toBe(Lottery.QUINA);
    expect(pageLottery(Lottery.MAIS_MILIONARIA)).toBe(Lottery.MAIS_MILIONARIA);
    expect(pageLottery(Lottery.MEGA_SENA)).toBe(Lottery.MEGA_SENA);
  });

  it('sem tema escolhido, cai no padrão do app (Mega-Sena)', () => {
    expect(pageLottery(undefined)).toBe(Lottery.MEGA_SENA);
  });

  it('contrato por modalidade: as três loterias são respeitadas (nada colapsa em Mega-Sena)', () => {
    const all = [Lottery.MEGA_SENA, Lottery.MAIS_MILIONARIA, Lottery.QUINA];
    for (const lottery of all) {
      expect(pageLottery(lottery)).toBe(lottery);
    }
  });
});
