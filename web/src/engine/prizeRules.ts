import { Lottery } from '../types/domain';

/**
 * Faixa de premiação: a combinação exata de acertos que paga prêmio.
 *
 * `key` é o identificador estável usado como chave em `expectedPrizes()` e nos
 * relatórios; `numberHits`/`trevoHits` são o critério objetivo de classificação.
 */
export interface PrizeTier {
  /** Chave estável (ex.: `'6'`, `'6+2'`). Nunca traduza — é identidade, não rótulo. */
  readonly key: string;
  /** Rótulo para exibição na UI. */
  readonly label: string;
  /** Dezenas que a faixa exige. */
  readonly numberHits: number;
  /** Trevos que a faixa exige; ausente em loterias sem trevo. */
  readonly trevoHits?: number;
  /**
   * Teto inclusivo de trevos da faixa.
   *
   * WHY: no regulamento da +Milionária as faixas de rateio intermediárias
   * agrupam dois cenários de trevo — “6 dezenas + 1 ou nenhum trevo” é uma
   * ÚNICA faixa (a 2). Quando presente, a faixa casa com
   * `trevoHits >= trevoHits && trevoHits <= trevoHitsMax`; ausente, o casamento
   * é exato em `trevoHits`.
   */
  readonly trevoHitsMax?: number;
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
  /** Preço da aposta simples, em reais. */
  readonly betPriceBrl: number;
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
 * +Milionária: as dez faixas oficiais do regulamento.
 *
 * Fonte: regulamento da +Milionária (Caixa, lançamento em 28/05/2022) —
 * verificado faixa a faixa por combinatória: a faixa 1 tem chance exata
 * 1/C(50,6)·1/C(6,2) = 1/238.360.500, o número oficial da Caixa. As faixas
 * de rateio agrupam “1 ou nenhum trevo” numa única faixa (2, 4 e 6), e as
 * faixas fixas (7 a 10) pagam R$ 50, R$ 24, R$ 12 e R$ 6.
 *
 * WHY (correção): a lista anterior tinha nove faixas cruzando 6/5/4 dezenas
 * com 2/1/0 trevos — tratava “6+1” e “6+0” como faixas distintas e omitia as
 * quatro faixas inferiores do regulamento (3 dezenas e 2 dezenas com trevo),
 * subestimando a chance de qualquer prêmio e a taxa de prêmio do backtest.
 */
export const MAIS_MILIONARIA_TIERS: readonly PrizeTier[] = [
  { key: '6+2', label: '6 dezenas + 2 trevos', numberHits: 6, trevoHits: 2 },
  { key: '6+0-1', label: '6 dezenas + 1 ou nenhum trevo', numberHits: 6, trevoHits: 0, trevoHitsMax: 1 },
  { key: '5+2', label: '5 dezenas + 2 trevos', numberHits: 5, trevoHits: 2 },
  { key: '5+0-1', label: '5 dezenas + 1 ou nenhum trevo', numberHits: 5, trevoHits: 0, trevoHitsMax: 1 },
  { key: '4+2', label: '4 dezenas + 2 trevos', numberHits: 4, trevoHits: 2 },
  { key: '4+0-1', label: '4 dezenas + 1 ou nenhum trevo', numberHits: 4, trevoHits: 0, trevoHitsMax: 1 },
  { key: '3+2', label: '3 dezenas + 2 trevos', numberHits: 3, trevoHits: 2 },
  { key: '3+1', label: '3 dezenas + 1 trevo', numberHits: 3, trevoHits: 1 },
  { key: '2+2', label: '2 dezenas + 2 trevos', numberHits: 2, trevoHits: 2 },
  { key: '2+1', label: '2 dezenas + 1 trevo', numberHits: 2, trevoHits: 1 },
];

/** Quina: quina, quadra, terno e duque (sem trevos). */
export const QUINA_TIERS: readonly PrizeTier[] = [
  { key: '5', label: 'Quina', numberHits: 5 },
  { key: '4', label: 'Quadra', numberHits: 4 },
  { key: '3', label: 'Terno', numberHits: 3 },
  { key: '2', label: 'Duque', numberHits: 2 },
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
    betPriceBrl: 6,
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
    betPriceBrl: 6,
    tiers: MAIS_MILIONARIA_TIERS,
  },
  [Lottery.QUINA]: {
    numberUniverse: 80,
    numbersDrawn: 5,
    numbersPerBet: 5,
    trevoUniverse: 0,
    trevosDrawn: 0,
    trevosPerBet: 0,
    minSelection: 5,
    maxSelection: 15,
    betPriceBrl: 3,
    tiers: QUINA_TIERS,
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
 * As faixas estão ordenadas da mais alta para a mais baixa e são disjuntas:
 * o primeiro casamento é o único. Faixas com `trevoHitsMax` casam um intervalo
 * inclusivo de trevos (regulamento da +Milionária: “1 ou nenhum trevo” é uma
 * faixa só).
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
    tiers.find((tier) => {
      if (tier.numberHits !== numberHits) return false;
      if (tier.trevoHits === undefined) return true;
      if (tier.trevoHitsMax !== undefined) {
        return trevoHits >= tier.trevoHits && trevoHits <= tier.trevoHitsMax;
      }
      return tier.trevoHits === trevoHits;
    }) ?? null
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
