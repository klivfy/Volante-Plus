'use client';

import React, { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from 'react';
import { Lottery } from '../types/domain';

/**
 * Modalidade selecionada — fonte única para todas as telas e para o tema.
 *
 * WHY: cada página guardava a sua modalidade num `useState` próprio e só o
 * tema era global. Escolher +Milionária no Volante e abrir outra aba deixava a
 * tela inteira azul com o seletor mostrando Mega-Sena; voltando ao Volante, os
 * jogos da Mega saíam com bolinhas azuis (`docs/revisao-de-design-2026-10.md`,
 * achado A1). Agora as páginas leem e escrevem aqui, e a escolha persiste no
 * navegador entre visitas e entre abas.
 */

const STORAGE_KEY = 'volante_lottery';
const CHANGE_EVENT = 'volante:lottery-change';

/**
 * Escolha desta sessão. Com o armazenamento bloqueado (navegação privada,
 * dados do site desligados) a escolha vale enquanto a página estiver aberta.
 */
let sessionChoice: Lottery | null = null;

function isLottery(value: unknown): value is Lottery {
  return (Object.values(Lottery) as unknown[]).includes(value);
}

function readChoice(): Lottery {
  if (sessionChoice) return sessionChoice;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isLottery(stored)) return stored;
  } catch {
    // Armazenamento indisponível: fica o padrão.
  }
  return Lottery.MEGA_SENA;
}

function writeChoice(lottery: Lottery): void {
  sessionChoice = lottery;
  try {
    window.localStorage.setItem(STORAGE_KEY, lottery);
  } catch {
    // Armazenamento indisponível: a escolha fica só nesta sessão.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void): () => void {
  // Outra aba trocou a modalidade: segue a escolha mais recente.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    sessionChoice = isLottery(event.newValue) ? event.newValue : null;
    onChange();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/** No servidor e na hidratação vale o padrão; a escolha salva entra logo depois. */
function serverChoice(): Lottery {
  return Lottery.MEGA_SENA;
}

interface LotteryThemeContextType {
  lottery: Lottery;
  setLottery: (lottery: Lottery) => void;
}

const LotteryThemeContext = createContext<LotteryThemeContextType | undefined>(undefined);

export function LotteryThemeProvider({ children }: { children: React.ReactNode }) {
  const lottery = useSyncExternalStore(subscribe, readChoice, serverChoice);
  const setLottery = useCallback((next: Lottery) => writeChoice(next), []);
  const value = useMemo(() => ({ lottery, setLottery }), [lottery, setLottery]);

  return <LotteryThemeContext.Provider value={value}>{children}</LotteryThemeContext.Provider>;
}

export function useLotteryTheme() {
  const context = useContext(LotteryThemeContext);
  if (!context) {
    throw new Error('useLotteryTheme deve ser usado dentro de LotteryThemeProvider');
  }
  return context;
}
