'use client';

import React, { createContext, useContext, useState } from 'react';
import { Lottery } from '../types/domain';

interface LotteryThemeContextType {
  lottery: Lottery;
  setLottery: (lottery: Lottery) => void;
}

const LotteryThemeContext = createContext<LotteryThemeContextType | undefined>(undefined);

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
