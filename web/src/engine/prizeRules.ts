import { Lottery } from '../types/domain';

/**
 * Faixa de premiação: a combinação exata de acertos que paga prêmio.
 *
 * `key` é o identificador estável usado como chave em `expectedPrizes()` e nos
 * relatórios; `numberHits` e o conjunto `trevoHits` são o critério objetivo
 * de classificação (o regulamento da +Milionária premia faixas com "1 ou
 * nenhum trevo" — por isso `trevoHits` é um conjunto, não um escalar).
 */
export interface PrizeTier {
  /** Chave estável (ex.: `'6'`, `'6+1/0'`). Nunca traduza — é identidade, não rótulo. */
  readonly key: string;
  /** Rótulo para exibição na UI. */
  readonly label: string;
  /** Dezenas que a faixa exige. */
  readonly numberHits: number;
  /** Trevos que a faixa exige (conjunto); ausente em loterias sem trevo. */
  readonly trevoHits?: readonly number[];
  /**
   * `true` quando o prêmio é de valor **fixo** (não rateado). Popularidade só
   * afeta o prêmio de faixas de rateio — nas fixas, dividir com outros
   * acertadores não muda nada (spec 003, FR-005).
   */
  readonly fixed?: boolean;
}

/**
 * Parâmetros numéricos de uma loteria — fonte única de verdade para o motor.
 * Espelha o enum `Lottery` do app Android.
 */
export interface LotteryRules {
  /** Tamanho do universo de dezenas (N do modelo hipergeométrico). */
  readonly numberUniverse: number;
  /** Dezenas sorteadas por concurso (K). */
  readonly numbersDrawn: number;
  /** Dezenas de uma aposta simples (n). */
  readonly numbersPerBet: number;
  /** Universo de trevos; 0 quando a loteria não tem trevos. */
  readonly trevoUniverse: number;
  /** Trevos sorteados por concurso. */
  readonly trevosDrawn: number;
  /** Trevos de uma aposta. */
  readonly trevosPerBet: number;
  /** Mínimo de dezenas marcáveis no volante. */
  readonly minSelection: number;
  /** Máximo de dezenas marcáveis no volante. */
  readonly maxSelection: number;
  /** Faixas de premiação, da mais alta para a mais baixa. */
  readonly tiers: readonly PrizeTier[];
}

/** Mega-Sena: quadra, quina e sena. */
export const MEGA_SENA_TIERS: readonly PrizeTier[] = [
  { key: '6', label: 'Sena', numberHits: 6 },
  { key: '5', label: 'Quina', numberHits: 5 },
  { key: '4', label: 'Quadra', numberHits: 4 },
];

/**
 * +Milionária: as 10 faixas oficiais.
 *
 * Espelha `PrizeRules.kt` do app Android (que já estava corrigido). Atenção às
 * faixas 2, 4 e 6: o regulamento diz **"1 ou nenhum trevo"** — elas também
 * premiam com 0 trevos. As faixas 8 e 10 exigem exatamente 1 trevo.
 *
 * Correção aplicada: a tabela anterior cruzava 6/5/4 dezenas com 2/1/0 trevos
 * (9 faixas) e omitia 3+2, 3+1, 2+2 e 2+1. Como 2+1 sozinha vale 6,83% de
 * probabilidade, o erro subestimava a chance de prêmio em ~88% — o app dizia
 * "1 em 1.099" quando o correto é **1 em 11,39** (spec 002, US-001/SC-001).
 * Um laboratório que existe para refutar contas erradas não pode errar a
 * própria tabela.
 */
export const MAIS_MILIONARIA_TIERS: readonly PrizeTier[] = [
  { key: '6+2', label: '6 dezenas + 2 trevos', numberHits: 6, trevoHits: [2] },
  { key: '6+1/0', label: '6 dezenas + 1 ou nenhum trevo', numberHits: 6, trevoHits: [1, 0] },
  { key: '5+2', label: '5 dezenas + 2 trevos', numberHits: 5, trevoHits: [2] },
  { key: '5+1/0', label: '5 dezenas + 1 ou nenhum trevo', numberHits: 5, trevoHits: [1, 0] },
  { key: '4+2', label: '4 dezenas + 2 trevos', numberHits: 4, trevoHits: [2] },
  { key: '4+1/0', label: '4 dezenas + 1 ou nenhum trevo', numberHits: 4, trevoHits: [1, 0] },
  { key: '3+2', label: '3 dezenas + 2 trevos', numberHits: 3, trevoHits: [2], fixed: true },
  { key: '3+1', label: '3 dezenas + 1 trevo', numberHits: 3, trevoHits: [1], fixed: true },
  { key: '2+2', label: '2 dezenas + 2 trevos', numberHits: 2, trevoHits: [2], fixed: true },
  { key: '2+1', label: '2 dezenas + 1 trevo', numberHits: 2, trevoHits: [1], fixed: true },
];

const RULES: Readonly<Record<Lottery, LotteryRules>> = {
  [Lottery.MEGA_SENA]: {
    numberUniverse: 60,
    numbersDrawn: 6,
    numbersPerBet: 6,
    trevoUniverse: 0,
    trevosDrawn: 0,
    trevosPerBet: 0,
    minSelection: 8,
    maxSelection: 15,
    tiers: MEGA_SENA_TIERS,
  },
  [Lottery.MAIS_MILIONARIA]: {
    numberUniverse: 50,
    numbersDrawn: 6,
    numbersPerBet: 6,
    trevoUniverse: 6,
    trevosDrawn: 2,
    trevosPerBet: 2,
    minSelection: 8,
    maxSelection: 12,
    tiers: MAIS_MILIONARIA_TIERS,
  },
};

/** Parâmetros numéricos da loteria. Lança se `lottery` não for reconhecida. */
export function lotteryRules(lottery: Lottery): LotteryRules {
  const rules = RULES[lottery];
  if (!rules) {
    throw new RangeError(`Loteria desconhecida: ${lottery}`);
  }
  return rules;
}

/** Faixas de premiação da loteria, da mais alta para a mais baixa. */
export function prizeTiers(lottery: Lottery): readonly PrizeTier[] {
  return lotteryRules(lottery).tiers;
}

/** `true` quando a loteria usa trevos (apenas +Milionária). */
export function hasTrevos(lottery: Lottery): boolean {
  return lotteryRules(lottery).trevoUniverse > 0;
}

/**
 * Classifica um resultado de aposta na faixa premiada correspondente.
 *
 * @param trevoHits ignorado nas loterias sem trevo.
 * @returns a faixa, ou `null` quando a aposta não premia.
 */
export function classifyHits(
  lottery: Lottery,
  numberHits: number,
  trevoHits = 0,
): PrizeTier | null {
  const tiers = prizeTiers(lottery);
  return (
    tiers.find(
      (tier) =>
        tier.numberHits === numberHits &&
        (tier.trevoHits === undefined || tier.trevoHits.includes(trevoHits)),
    ) ?? null
  );
}

/** `true` quando a combinação de acertos paga algum prêmio. */
export function isPrized(lottery: Lottery, numberHits: number, trevoHits = 0): boolean {
  return classifyHits(lottery, numberHits, trevoHits) !== null;
}

/** Espaços sorteados de uma modalidade: as dezenas e, na +Milionária, os trevos. */
export type DrawSpace = 'numbers' | 'trevos';

export interface DrawSpaceSpec {
  /** Tamanho do universo (N). */
  universe: number;
  /** Quantos são sorteados por concurso (K). */
  drawn: number;
}

/**
 * Universo e quantidade sorteada de cada espaço. É o que permite aplicar os
 * mesmos testes estatísticos às dezenas (60/6 ou 50/6) e aos trevos (6/2)
 * sem casos especiais por modalidade.
 *
 * @throws RangeError para `trevos` numa modalidade sem trevos.
 */
export function drawSpace(lottery: Lottery, space: DrawSpace): DrawSpaceSpec {
  const rules = lotteryRules(lottery);
  if (space === 'numbers') {
    return { universe: rules.numberUniverse, drawn: rules.numbersDrawn };
  }
  if (rules.trevoUniverse === 0) {
    throw new RangeError('Esta modalidade não tem trevos');
  }
  return { universe: rules.trevoUniverse, drawn: rules.trevosDrawn };
}
