import { Lottery } from '../types/domain';
import { lotteryRules } from './prizeRules';

/**
 * Medida de quão **popular** é um jogo entre outros apostadores.
 *
 * ## Por que isto não é previsão
 * Loteria brasileira é pari-mutuel: o prêmio de cada faixa é um bolo dividido
 * entre quem acertou. A chance de acertar não depende das dezenas escolhidas
 * — isso é o teorema da invariância, e continua valendo aqui. Mas **quanto
 * você receberia se acertasse** depende de com quantas pessoas você divide.
 *
 * Então esta pontuação não mexe na probabilidade de ganhar. Ela mexe no valor
 * esperado *condicional a ganhar*. É a única alavanca real que sobra, e ela é
 * pequena: o retorno esperado incondicional continua exatamente o mesmo,
 * negativo e fixado em norma.
 *
 * ## O que a literatura mostra
 * Jogadores não escolhem ao acaso — o fenômeno se chama *conscious selection*.
 * Os vieses medidos que esta pontuação penaliza:
 *
 * - **Datas de aniversário.** Em 5.078.901 combinações reais do Dutch Lotto
 *   (2010-2012), o dia do nascimento foi escolhido em 21,03% dos casos
 *   contra 13,33% esperados sob escolha aleatória (p < 0,001); o mês, em
 *   17,94%. Isso concentra as apostas em dezenas ≤ 31, e mais ainda em ≤ 12.
 *   Wang, T. V., Potter van Loon, R. J. D., van den Assem, M. J. e van
 *   Dolder, D., *Number preferences in lotteries*, Judgment and Decision
 *   Making 11(3), 2016.
 *   https://www.cambridge.org/core/journals/judgment-and-decision-making/article/number-preferences-in-lotteries/47BA27051627CEED421AD3AEE255521E
 * - **Centro do volante.** O mesmo estudo encontra que números no centro da
 *   cartela de escolha são de 5% a 13% mais escolhidos que números nas
 *   bordas, efeito robusto a várias definições de "centro" testadas.
 * - **Primos e o número 7.** Primos são mais populares que não primos; o
 *   coeficiente do 7 é altamente significativo (0,0022 a 0,0027) em todos os
 *   modelos de proporção de vencedores, no Lotto e no Euromillions.
 *   Roger, P. e Roger, T., *On the preference for prime numbers: the case of
 *   lotto players*, 2024 — 10 anos de dados da loteria nacional belga
 *   (1.044 sorteios do Lotto, 758 do Euromillions, ~600 mil apostadores por
 *   sorteio em cada). Coeficiente de "# números primos" na proporção de
 *   vencedores: 0,0003 a 0,0011 (p < 1%) conforme o modelo e o jogo — a
 *   direção do efeito é a que esta pontuação usa, mas a magnitude é pequena.
 *   https://hal.science/hal-04451846v2/document
 * - **Sequências consecutivas.** Há relato de sorteio com sequência longa que
 *   produziu número anômalo de acertadores na segunda faixa. Este é o viés
 *   com evidência mais fraca dos quatro, e por isso recebe o menor peso.
 *
 * ## Honestidade sobre os pesos
 * Os pesos abaixo são **heurísticos**, não estimados a partir de dados de
 * apostas brasileiras — a Caixa não publica a distribuição de dezenas
 * apostadas. Eles codificam a direção do efeito, que a literatura sustenta,
 * não a sua magnitude no Brasil.
 *
 * Porta direta do `Unpopularity.kt` do app Android — mesmos pesos, mesma
 * fórmula, para que a medida seja a mesma nas duas plataformas.
 */

/** Dezenas até 31 podem ser dia do mês. */
export const BIRTHDAY_MAX = 31;

/** Dezenas até 12 podem ser mês, e sofrem o viés mais forte. */
export const MONTH_MAX = 12;

/** Colunas do volante impresso da Caixa. */
export const VOLANTE_COLUMNS = 10;

// Pesos heurísticos. Ordem de grandeza reflete a força da evidência.
const W_BIRTHDAY = 1.0;
const W_MONTH = 0.8;
const W_PRIME = 0.35;
const W_SEVEN = 0.3;
const W_CONSECUTIVE = 0.25;
const W_ALIGNMENT = 0.4;
const W_CENTER = 0.3;
const W_ARITHMETIC = 0.2;

/**
 * Recência: dezenas do concurso anterior são **menos** apostadas — a falácia
 * do apostador faz o jogador evitá-las ("acabou de sair, agora vai demorar").
 * Clotfelter, C. T. e Cook, P. J., *The "Gambler's Fallacy" in Lottery Play*,
 * Management Science 39(12), 1993: queda medida nas apostas sobre dezenas
 * recém-sorteadas. Incluí-las é de graça: mesma chance, menos divisores.
 * Peso conservador — a magnitude brasileira não é calibrada (como os demais).
 */
const W_RECENCY = 0.25;

/** Primalidade por divisão sucessiva; o universo aqui vai só até 60. */
export function isPrime(value: number): boolean {
  if (value < 2) return false;
  if (value < 4) return true;
  if (value % 2 === 0) return false;
  for (let d = 3; d * d <= value; d += 2) {
    if (value % d === 0) return false;
  }
  return true;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function isArithmeticProgression(sorted: readonly number[]): boolean {
  const step = sorted[1] - sorted[0];
  if (step === 0) return false;
  for (let i = 1; i < sorted.length - 1; i += 1) {
    if (sorted[i + 1] - sorted[i] !== step) return false;
  }
  return true;
}

function maxRepeat(counts: Map<number, number>): number {
  let max = 1;
  for (const count of counts.values()) {
    if (count > max) max = count;
  }
  return max;
}

function countBy(numbers: readonly number[], keyOf: (n: number) => number): Map<number, number> {
  const counts = new Map<number, number>();
  for (const n of numbers) {
    const key = keyOf(n);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * Penalidade de popularidade do jogo. Maior = mais popular = pior para o
 * rateio. Sempre >= 0.
 *
 * @param recentNumbers dezenas do concurso mais recente (opcional): entram
 *   com sinal **negativo**, porque recém-sorteadas são menos apostadas.
 */
export function unpopularityPenalty(
  lottery: Lottery,
  numbers: readonly number[],
  recentNumbers: Iterable<number> = [],
): number {
  if (numbers.length === 0) return 0;
  const n = numbers.length;
  const sorted = [...numbers].sort((a, b) => a - b);

  const birthday = numbers.filter((x) => x <= BIRTHDAY_MAX).length / n;
  const month = numbers.filter((x) => x <= MONTH_MAX).length / n;
  const primes = numbers.filter(isPrime).length / n;
  const seven = numbers.includes(7) ? 1 : 0;

  // Pares consecutivos: 5, 6 conta uma vez.
  let consecutivePairs = 0;
  for (let i = 0; i < sorted.length - 1; i += 1) {
    if (sorted[i + 1] - sorted[i] === 1) consecutivePairs += 1;
  }
  const consecutive = consecutivePairs / Math.max(1, n - 1);

  // Alinhamento no volante: dezenas na mesma coluna ou na mesma linha formam
  // o desenho vertical/horizontal que as pessoas marcam.
  const columns = countBy(numbers, (x) => (x - 1) % VOLANTE_COLUMNS);
  const rows = countBy(numbers, (x) => Math.floor((x - 1) / VOLANTE_COLUMNS));
  const alignment = clamp01((maxRepeat(columns) + maxRepeat(rows) - 2) / (2 * Math.max(1, n - 1)));

  // Atração pelo centro do volante, medida como proximidade média do meio.
  const { numberUniverse } = lotteryRules(lottery);
  const first = 1;
  const last = numberUniverse;
  const middle = (first + last) / 2;
  const halfSpan = (last - first) / 2;
  const center =
    halfSpan <= 0
      ? 0
      : numbers.reduce((sum, x) => sum + (1 - Math.abs(x - middle) / halfSpan), 0) / n;

  // Progressão aritmética exata (5,10,15,...) é padrão deliberado comum.
  const arithmetic = numbers.length >= 3 && isArithmeticProgression(sorted) ? 1 : 0;

  // Recência: dezenas do último concurso são MENOS apostadas — o componente
  // é subtraído, não somado (ver W_RECENCY).
  const recentSet = recentNumbers instanceof Set ? recentNumbers : new Set(recentNumbers);
  const recency = numbers.filter((x) => recentSet.has(x)).length / n;

  return Math.max(
    0,
    W_BIRTHDAY * birthday +
      W_MONTH * month +
      W_PRIME * primes +
      W_SEVEN * seven +
      W_CONSECUTIVE * consecutive +
      W_ALIGNMENT * alignment +
      W_CENTER * center +
      W_ARITHMETIC * arithmetic -
      W_RECENCY * recency,
  );
}
