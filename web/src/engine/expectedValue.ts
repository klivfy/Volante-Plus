import { Lottery } from '../types/domain';
import { prizeProbabilities } from './hypergeometric';

/**
 * Valor Esperado (EV) e Kelly Criterion.
 *
 * Em loterias o EV de uma aposta simples é, por desenho, negativo (o
 * arrecadado supera o distribuído). A exceção é a faixa acumulada
 * ("rollover"): o prêmio da faixa máxima cresce sem custo adicional do
 * bilhete, o que pode — em tese, e só para valores de acumulação muito altos
 * — aproximar ou até virar o EV positivo. Este módulo calcula isso
 * explicitamente, sem alterar a geração de jogos.
 *
 * ## O rateio não é opcional
 * O prêmio acumulado **não** é entregue a quem acerta: é dividido entre todos
 * os que acertarem. Tratá-lo como prêmio integral (o que este módulo fazia)
 * superestima o EV justamente no regime em que ele importa — acumulação alta,
 * que é quando mais gente aposta. Informe `tickets` (apostas estimadas no
 * concurso) para obter o número correto; sem ele o resultado é declarado como
 * limite superior via `sharedPool: false`, e não deve ser exibido sem essa
 * ressalva.
 */

export interface PrizeAverage {
  /** Chave da faixa, mesma convenção de `PrizeTier.key` (`prizeRules.ts`). */
  tier: string;
  /** Valor médio histórico pago nessa faixa (dado externo, não vem do engine). */
  averagePrize: number;
}

export interface EVResult {
  ev: number;
  evPercent: number;
  /**
   * Quanto precisaria estar acumulado na faixa máxima para o EV zerar,
   * assumindo tudo o mais constante. `Infinity` se a faixa máxima tem
   * probabilidade zero (não deveria ocorrer com `Lottery` válida).
   */
  breakEvenAccumulated: number;
  /** Parcela do EV devida exclusivamente ao prêmio acumulado. */
  accumulatedContribution: number;
  /**
   * `false` quando o cálculo ignorou o rateio por não ter recebido `tickets`.
   * Nesse caso `ev` é um **teto**, não uma estimativa.
   */
  sharedPool: boolean;
}

/**
 * `1 − (1 − p)^N`, a probabilidade de existir ao menos um acertador, estável
 * para `p` da ordem de 1e-8 e `N` da ordem de 1e7 (onde `(1 − p)^N` perderia
 * precisão por cancelamento).
 */
export function probabilityOfAnyWinner(probability: number, tickets: number): number {
  if (probability <= 0 || tickets <= 0) return 0;
  if (probability >= 1) return 1;
  return -Math.expm1(tickets * Math.log1p(-probability));
}

/**
 * Valor esperado que **uma** aposta recebe de um bolo rateado.
 *
 * Condicional a acertar (probabilidade `p`), divido o bolo com
 * `K ~ Binomial(N − 1, p)` outros acertadores, e
 * `E[1/(1 + K)] = (1 − (1 − p)^N) / (N·p)`. Multiplicando por `p`:
 *
 *     E[recebido] = bolo · (1 − (1 − p)^N) / N
 *
 * Conferência: somando sobre as N apostas, o bolo sai com probabilidade
 * `1 − (1 − p)^N` — exatamente a chance de haver algum ganhador.
 */
export function expectedShareOfPool(pool: number, probability: number, tickets: number): number {
  if (pool <= 0 || probability <= 0 || tickets <= 0) return 0;
  return (pool * probabilityOfAnyWinner(probability, tickets)) / tickets;
}

/**
 * EV de uma aposta simples: `Σ P(faixa) × prêmio(faixa) − custo do bilhete`.
 * `accumulatedPrize`, se informado, entra pela faixa mais alta — rateado
 * quando `tickets` é conhecido, integral (teto) quando não é.
 */
export function calculateEV(
  lottery: Lottery,
  prizeAverages: PrizeAverage[],
  ticketCost: number,
  accumulatedPrize?: number,
  tickets?: number,
): EVResult {
  const probabilities = prizeProbabilities(lottery);
  const topTierKey = findTopTierKey(probabilities);

  let baseExpectedPrize = 0;
  for (const { tier, averagePrize } of prizeAverages) {
    baseExpectedPrize += (probabilities[tier] ?? 0) * averagePrize;
  }

  const topProbability = topTierKey ? (probabilities[topTierKey] ?? 0) : 0;
  const shared = typeof tickets === 'number' && Number.isFinite(tickets) && tickets >= 1;

  // Fração do acumulado que se espera receber por real acumulado. Sem rateio
  // é a própria probabilidade de acertar; com rateio é sempre menor, porque
  // parte das vezes em que se acerta há outros dividindo.
  const perUnitAccumulated = shared
    ? probabilityOfAnyWinner(topProbability, tickets as number) / (tickets as number)
    : topProbability;

  const pot = accumulatedPrize && topTierKey ? accumulatedPrize : 0;
  const accumulatedContribution = pot * perUnitAccumulated;

  const expectedPrize = baseExpectedPrize + accumulatedContribution;
  const ev = expectedPrize - ticketCost;
  const evPercent = ticketCost === 0 ? 0 : (ev / ticketCost) * 100;

  // A contribuição é linear no acumulado, então inverter é direto — mas o
  // divisor é `perUnitAccumulated`, não `topProbability`: com rateio o
  // acumulado necessário é maior, e usar a probabilidade crua devolveria um
  // limiar otimista demais.
  const breakEvenAccumulated =
    perUnitAccumulated > 0 ? (ticketCost - baseExpectedPrize) / perUnitAccumulated : Infinity;

  return { ev, evPercent, breakEvenAccumulated, accumulatedContribution, sharedPool: shared };
}

/** A faixa com maior `numberHits` costuma ter a menor probabilidade — é a faixa que acumula. */
function findTopTierKey(probabilities: Record<string, number>): string | null {
  const entries = Object.entries(probabilities);
  if (entries.length === 0) return null;
  return entries.reduce((min, entry) => (entry[1] < min[1] ? entry : min))[0];
}

export interface KellyResult {
  /** Fração da banca recomendada; 0 quando o EV não é positivo. */
  fraction: number;
  isPositive: boolean;
}

/**
 * Kelly Criterion de dois resultados: `f* = (b·p − q) / b`, `b` = odds
 * líquidas, `p` = prob. de ganhar, `q = 1 − p`.
 *
 * Vale quando existe um único prêmio possível. Loteria tem várias faixas, e
 * para esse caso a fórmula certa é [kellyFraction], não esta.
 */
export function kellyCriterion(probability: number, netOdds: number): KellyResult {
  if (netOdds <= 0) return { fraction: 0, isPositive: false };
  const q = 1 - probability;
  const fraction = (netOdds * probability - q) / netOdds;
  return { fraction: Math.max(0, fraction), isPositive: fraction > 0 };
}

/** Um resultado possível da aposta, em múltiplos do custo do bilhete. */
export interface KellyOutcome {
  probability: number;
  /** Prêmio bruto dividido pelo custo do bilhete (0 = bilhete não paga nada). */
  grossReturn: number;
}

/**
 * Kelly para uma aposta com **vários** prêmios possíveis — o caso da loteria.
 *
 * Maximiza a taxa de crescimento logarítmico da banca,
 *
 *     g(f) = Σᵢ pᵢ · ln(1 + f·(Rᵢ − 1)) + p_perde · ln(1 − f)
 *
 * onde `Rᵢ` é o prêmio da faixa i em múltiplos do bilhete. `g` é estritamente
 * côncava em [0, 1), então `g′` é decrescente e a raiz de `g′` é única — a
 * bisseção abaixo converge sempre.
 *
 * ## Por que a versão de dois resultados não servia
 * O código anterior chamava [kellyCriterion] passando `ev / custo` como odds
 * líquidas. Isso é um erro de dimensão: odds líquidas são o que se recebe **ao
 * ganhar**, da ordem de milhões em loteria, enquanto `ev / custo` é da ordem
 * de 0,001. Com `b ≈ 0,001` e `q ≈ 1`, `(b·p − q)/b` é enormemente negativo e
 * o resultado era clampado a zero — a função devolvia 0 para qualquer entrada,
 * inclusive nos cenários de EV positivo que ela existia para avaliar.
 *
 * Note que `g′(0) = Σᵢ pᵢ·Rᵢ − 1 = EV / custo`: a fração é positiva se e
 * somente se o EV é positivo, como tem de ser.
 */
export function kellyFraction(outcomes: KellyOutcome[]): number {
  const winning = outcomes.filter((o) => o.probability > 0 && o.grossReturn > 0);
  const pWin = winning.reduce((sum, o) => sum + o.probability, 0);
  if (winning.length === 0 || pWin <= 0 || pWin >= 1) return 0;

  const pLose = 1 - pWin;
  const derivative = (f: number): number => {
    let sum = 0;
    for (const { probability, grossReturn } of winning) {
      const edge = grossReturn - 1;
      sum += (probability * edge) / (1 + f * edge);
    }
    return sum - pLose / (1 - f);
  };

  // g′(0) = EV/custo. Sem vantagem, não se aposta.
  if (derivative(0) <= 0) return 0;

  // g′ → −∞ quando f → 1, então a raiz está em (0, 1). 60 bisseções levam o
  // intervalo a ~1e-18: mais do que a precisão do double.
  let low = 0;
  let high = 1 - Number.EPSILON;
  for (let i = 0; i < 60; i += 1) {
    const mid = (low + high) / 2;
    if (derivative(mid) > 0) low = mid;
    else high = mid;
  }
  return Math.max(0, Math.min(1, (low + high) / 2));
}

export interface KellySimulationResult {
  recommendedBet: number;
  fraction: number;
  ev: number;
}

/**
 * Amarra [calculateEV] + [kellyFraction]: se o EV não é positivo, a aposta
 * recomendada é sempre 0 — não há cenário em que Kelly recomenda apostar em
 * um jogo de EV negativo.
 *
 * ## Aproximação declarada
 * Com rateio, o prêmio da faixa máxima é uma variável aleatória (depende de
 * quantos outros acertaram). Aqui entra sua **esperança condicional a
 * acertar** como se fosse certa. Por Jensen, `E[ln(·)] ≤ ln(E[·])`, então a
 * fração devolvida é um teto — o que é a direção segura para um número que
 * sugere quanto apostar.
 *
 * ADVERTÊNCIA: Kelly assume apostas repetidas e independentes com a mesma
 * probabilidade — verdadeiro entre concursos de loteria, mas o critério foi
 * desenhado para apostas com _feedback rápido_ (permitindo reinvestir
 * ganhos). Aqui ele serve só como heurística de limite superior racional,
 * não como recomendação de gestão de banca real.
 */
export function kellySimulation(
  bankroll: number,
  lottery: Lottery,
  prizeAverages: PrizeAverage[],
  ticketCost: number,
  accumulatedPrize?: number,
  tickets?: number,
): KellySimulationResult {
  const { ev } = calculateEV(lottery, prizeAverages, ticketCost, accumulatedPrize, tickets);
  if (ev <= 0 || ticketCost <= 0 || bankroll <= 0) {
    return { recommendedBet: 0, fraction: 0, ev };
  }

  const probabilities = prizeProbabilities(lottery);
  const topTierKey = findTopTierKey(probabilities);
  const shared = typeof tickets === 'number' && Number.isFinite(tickets) && tickets >= 1;

  const outcomes: KellyOutcome[] = prizeAverages.map(({ tier, averagePrize }) => {
    const probability = probabilities[tier] ?? 0;
    let prize = averagePrize;
    if (tier === topTierKey && accumulatedPrize) {
      // Prêmio esperado condicional a acertar: o bolo vezes a fração que
      // sobra depois de dividi-lo. Sem `tickets`, o bolo inteiro (teto).
      const crowding =
        shared && probability > 0
          ? probabilityOfAnyWinner(probability, tickets as number) /
            ((tickets as number) * probability)
          : 1;
      prize += accumulatedPrize * crowding;
    }
    return { probability, grossReturn: prize / ticketCost };
  });

  const fraction = kellyFraction(outcomes);
  return { recommendedBet: bankroll * fraction, fraction, ev };
}
