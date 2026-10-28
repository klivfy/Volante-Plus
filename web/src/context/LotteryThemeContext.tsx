'use client';

import React, { createContext, useContext, useState } from 'react';
import { Lottery } from '../types/domain';

interface LotteryThemeContextType {
  lottery: Lottery;
  setLottery: (lottery: Lottery) => void;
}

const LotteryThemeContext = createContext<LotteryThemeContextType | undefined>(undefined);

/**
 * Modalidade inicial de uma tela: o tema global vence, e o padrão do app
 * (Mega-Sena) só vale enquanto nenhuma modalidade foi escolhida.
 *
 * Extraída como função pura para o contrato ficar testável sem DOM: ao
 * chegar de outra tela — ex.: "Usar estes dados" do backtesting — a tela
 * nova abre na modalidade em uso, e não sempre na Mega-Sena, o que fazia
 * os pesos do backtest daquela modalidade parecerem ignorados na geração.
 */
export function pageLottery(themeLottery: Lottery | undefined): Lottery {
  return themeLottery ?? Lottery.MEGA_SENA;
}

export function LotteryThemeProvider({ children }: { children: React.ReactNode }) {
  const [lottery, setLottery] = useState<Lottery>(Lottery.MEGA_SENA);

  return (
    <LotteryThemeContext.Provider value={{ lottery, setLottery }}>
      {children}
    </LotteryThemeContext.Provider>
  );
}

export function useLotteryTheme() {
  const context = useContext(LotteryThemeContext);
  if (!context) {
    throw new Error('useLotteryTheme deve ser usado dentro de LotteryThemeProvider');
  }
  return context;
}
