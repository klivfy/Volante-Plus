import { Lottery } from '../../types/domain';
import { lotteryRules } from '../prizeRules';

/**
 * A pré-registração: todos os critérios da auditoria, fixados **antes** de
 * qualquer dado real existir neste repositório.
 *
 * ## Por que isto é um arquivo, e não um parágrafo de método
 *
 * "Critérios fixados antes de ver os resultados" é a regra mais fácil de
 * violar sem perceber e a mais difícil de provar que se cumpriu. Um analista
 * que roda o teste, vê p = 0,07 e então decide que o corte era 0,10 não está
 * mentindo conscientemente — está fazendo o que parece razoável depois do
 * fato. É por isso que a pré-registração precisa ser anterior e verificável,
 * não uma intenção declarada.
 *
 * Este módulo foi escrito e commitado enquanto o repositório **não tinha
 * histórico oficial nenhum** (ver `provenance.ts` e o README de
 * `data/syntheticFixture/`). O git carrega a data. Qualquer alteração posterior a estes
 * valores aparece no diff, com autor e momento. A regra deixa de depender da
 * boa-fé de quem analisa e passa a depender de um registro que ninguém
 * reescreve em silêncio.
 *
 * ## Nada aqui é digitado à mão
 *
 * As constantes que o protocolo cita — repetição esperada de 0,6 e 0,72;
 * soma média de 183 e 153 — não estão escritas como literais. São derivadas
 * das regras de cada modalidade pelas funções abaixo, e os testes conferem
 * que a derivação reproduz exatamente os valores do protocolo. Um número
 * copiado errado seria invisível; uma fórmula errada quebra o teste.
 */

/** Identificador do protocolo. Muda quando qualquer critério abaixo muda. */
export const PREREGISTRATION_VERSION = '1.0.0';

/** Nível de significância antes da correção de múltiplas comparações. */
export const ALPHA = 0.05;

/** Históricos honestos simulados que formam a linha de base (Regra 3). */
export const BASELINE_HISTORIES = 10_000;

/**
 * Semente da linha de base. Fixa para que dois relatórios sobre o mesmo
 * histórico sejam idênticos — uma auditoria que muda de resposta a cada
 * execução não é auditável.
 */
export const BASELINE_SEED = 20260910;

/** Réplicas para estimar poder sob a alternativa (menos precisão exigida). */
export const POWER_REPLICATIONS = 2_000;

/** Semente das simulações de poder, independente da linha de base. */
export const POWER_SEED = 76543;

/**
 * Poder-alvo usado para reportar o **efeito mínimo detectável** (EMD).
 *
 * WHY (por que o EMD importa mais que o poder): a resposta esperada desta
 * auditoria é "nenhuma anomalia", e um resultado nulo sozinho não distingue
 * "não há viés" de "o teste não enxergaria viés nenhum". O EMD resolve isso:
 * é o menor efeito que o teste pegaria em 80% das vezes, e transforma o nulo
 * numa afirmação positiva — "viés maior que X está descartado". Sem ele, o
 * protocolo reportaria ausência de evidência como se fosse evidência de
 * ausência, que é o erro que ele existe para não cometer.
 */
export const TARGET_POWER = 0.8;

/**
 * Efeito relativo da hipótese alternativa: +20% no parâmetro natural de cada
 * teste. Escolhido antes de ver dado nenhum, e deliberadamente grosseiro —
 * um viés de urna de 20% numa dezena é enorme fisicamente. Poder alto contra
 * ele é o piso, não o teto, da capacidade do teste.
 */
export const ALTERNATIVE_RELATIVE_BIAS = 0.2;

/** Deslocamento da média da soma sob a alternativa de A3, em desvios-padrão. */
export const ALTERNATIVE_SUM_SHIFT_SD = 0.25;

/**
 * Repetição esperada de dezenas entre concursos consecutivos, sob
 * independência.
 *
 * Derivação: para cada uma das `K` dezenas do concurso anterior, a chance de
 * reaparecer no seguinte é `K/N` (sorteio uniforme sem reposição). Por
 * linearidade da esperança — que vale mesmo com as dezenas dependentes entre
 * si dentro do mesmo concurso — `E[repetição] = K·K/N = K²/N`.
 *
 * Mega-Sena: 36/60 = 0,6. +Milionária: 36/50 = 0,72. São os valores que o
 * protocolo cita.
 */
export function expectedRepetition(lottery: Lottery): number {
  const { numbersDrawn, numberUniverse } = lotteryRules(lottery);
  return (numbersDrawn * numbersDrawn) / numberUniverse;
}

/**
 * Soma esperada das dezenas de um concurso.
 *
 * Derivação: cada dezena sorteada é uniforme em `{1..N}` marginalmente, com
 * média `(N+1)/2`. Somando as `K`: `E[soma] = K(N+1)/2`.
 *
 * Mega-Sena: 6·61/2 = 183. +Milionária: 6·51/2 = 153. Idem protocolo.
 */
export function expectedSum(lottery: Lottery): number {
  const { numbersDrawn, numberUniverse } = lotteryRules(lottery);
  return (numbersDrawn * (numberUniverse + 1)) / 2;
}

/**
 * Variância da soma das dezenas de um concurso.
 *
 * Derivação (amostra sem reposição de `{1..N}`): a variância populacional de
 * `{1..N}` é `(N²−1)/12`, e o fator de correção para população finita é
 * `(N−K)/(N−1)`. Logo
 * `Var = K·(N²−1)/12·(N−K)/(N−1) = K(N+1)(N−K)/12`.
 *
 * Mega-Sena: 6·61·54/12 = 1647 (dp ≈ 40,58).
 */
export function sumVariance(lottery: Lottery): number {
  const { numbersDrawn, numberUniverse } = lotteryRules(lottery);
  return (numbersDrawn * (numberUniverse + 1) * (numberUniverse - numbersDrawn)) / 12;
}

/** Desvio-padrão da soma das dezenas de um concurso. */
export function sumStdDeviation(lottery: Lottery): number {
  return Math.sqrt(sumVariance(lottery));
}

/** Módulos do protocolo de auditoria de anomalias. */
export type AuditModule = 'A1' | 'A2' | 'A3' | 'A4';

export interface PreregisteredTest {
  /** Estável entre execuções; é a chave do teste no relatório. */
  readonly id: string;
  readonly module: AuditModule;
  readonly label: string;
  /** Hipótese nula, em uma frase. */
  readonly nullHypothesis: string;
  /** Alternativa contra a qual o poder é estimado. */
  readonly alternative: string;
  /** Nem todo teste se aplica a toda modalidade (trevos só na +Milionária). */
  readonly appliesTo: (lottery: Lottery) => boolean;
}

const hasTrevoDraw = (lottery: Lottery): boolean => lotteryRules(lottery).trevosDrawn > 0;
const always = (): boolean => true;

/**
 * O conjunto fechado de testes. Fechado é a palavra importante: o
 * denominador de Bonferroni sai daqui, e um denominador que pudesse crescer
 * ou encolher depois de ver os dados não corrigiria nada — bastaria abandonar
 * os testes que não deram no que se queria para inflar o que sobrou.
 */
export const PREREGISTERED_TESTS: readonly PreregisteredTest[] = Object.freeze([
  {
    id: 'A1.numbers',
    module: 'A1',
    label: 'Uniformidade das dezenas (qui-quadrado)',
    nullHypothesis: 'Cada dezena sai com a mesma probabilidade K/N.',
    alternative: `Uma dezena com probabilidade relativa ${1 + ALTERNATIVE_RELATIVE_BIAS}×.`,
    appliesTo: always,
  },
  {
    id: 'A1.trevos',
    module: 'A1',
    label: 'Uniformidade dos trevos (qui-quadrado)',
    nullHypothesis: 'Cada trevo sai com a mesma probabilidade.',
    alternative: `Um trevo com probabilidade relativa ${1 + ALTERNATIVE_RELATIVE_BIAS}×.`,
    appliesTo: hasTrevoDraw,
  },
  {
    id: 'A2.repetition',
    module: 'A2',
    label: 'Independência entre concursos consecutivos',
    nullHypothesis: 'Repetição média entre concursos vizinhos igual a K²/N.',
    alternative: `Repetição média ${1 + ALTERNATIVE_RELATIVE_BIAS}× a teórica.`,
    appliesTo: always,
  },
  {
    id: 'A3.sum',
    module: 'A3',
    label: 'Distribuição da soma das dezenas',
    nullHypothesis: 'Soma média igual a K(N+1)/2, com a dispersão teórica.',
    alternative: `Média deslocada em ${ALTERNATIVE_SUM_SHIFT_SD} desvio-padrão da soma.`,
    appliesTo: always,
  },
  {
    id: 'A4.winners',
    module: 'A4',
    label: 'Ganhadores observados versus modelo de Poisson',
    nullHypothesis: 'Ganhadores da faixa principal seguem Poisson(apostas × p).',
    alternative: `Taxa de ganhadores ${1 + ALTERNATIVE_RELATIVE_BIAS}× a esperada.`,
    appliesTo: always,
  },
]);

/** Testes aplicáveis a uma modalidade, na ordem do protocolo. */
export function testsFor(lottery: Lottery): readonly PreregisteredTest[] {
  return PREREGISTERED_TESTS.filter((test) => test.appliesTo(lottery));
}

/**
 * Quantos testes o protocolo prevê por recorte (histórico completo, primeira
 * metade, segunda metade). O total efetivamente executado — que é o
 * denominador de Bonferroni — pode ser menor, quando falta dado para algum
 * teste; ver `orchestrator.ts`.
 */
export function plannedTestCount(lottery: Lottery): number {
  return testsFor(lottery).length;
}
