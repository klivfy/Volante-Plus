import { Lottery, NumberPerformance } from '../types/domain';
import { bonferroniCorrection } from './multipleComparisons';
import { DrawSpace, drawSpace } from './prizeRules';
import { approxChi2CDF, approxNormalCDF } from './statUtils';

/**
 * Evidência estatística sobre a frequência das dezenas.
 *
 * O ranking por frequência (`analyzeBacktest`) ordena as dezenas por quantas
 * vezes saíram — mas ordenar sempre produz um "primeiro" e um "último", saia o
 * que sair. A pergunta que importa é se alguma dezena se afasta do que o acaso
 * produz, e isso exige teste de hipótese com correção de múltiplas
 * comparações, não ranking. Este módulo responde a essa pergunta com o mesmo
 * dado que o ranking usa, sem precisar do histórico bruto: o total de
 * concursos sai da soma das frequências.
 *
 * Modelo: cada dezena aparece em cada concurso com probabilidade
 * `p = sorteadas / universo`, então a contagem em `n` concursos é
 * Binomial(n, p). Teste bilateral por aproximação normal, válida quando
 * `n·p >= 5` (verificado; abaixo disso o veredito é `AMOSTRA_INSUFICIENTE`).
 */

export type EvidenceVerdict = 'COMPATIVEL_COM_ACASO' | 'DESVIO_SIGNIFICATIVO' | 'AMOSTRA_INSUFICIENTE';

export interface NumberEvidenceRow {
  number: number;
  hitCount: number;
  expected: number;
  /** Escore z da contagem frente ao esperado sob acaso. */
  z: number;
  /** p-valor bilateral, sem correção. */
  pValue: number;
  /** Significativa após Bonferroni sobre todas as dezenas do universo. */
  significant: boolean;
}

export interface EvidenceSummary {
  verdict: EvidenceVerdict;
  draws: number;
  alpha: number;
  correctedAlpha: number;
  significantCount: number;
  rows: NumberEvidenceRow[];
  /** Qui-quadrado global de aderência à uniformidade das frequências. */
  chiSquare: { statistic: number; df: number; pValue: number };
  /**
   * Menor viés relativo numa única dezena que este histórico detectaria com
   * 80% de poder — `0.385` = 38,5% acima/abaixo do esperado. Quanto maior,
   * menos o histórico consegue afirmar.
   */
  minimumDetectableRelativeBias: number | null;
  /** Concursos mínimos para o teste ter validade (`n·p >= 5`). */
  minimumDraws: number;
}

/** Inversa da normal padrão por bisseção sobre `approxNormalCDF`. */
function normalQuantile(probability: number): number {
  let lo = -10;
  let hi = 10;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (approxNormalCDF(mid) < probability) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

const POWER = 0.8;
const ALPHA = 0.05;

/**
 * @param performances desempenho por dezena (ou por trevo); `hitCount` é a
 *   frequência real.
 * @param space `numbers` (padrão) ou `trevos` — a +Milionária tem os dois
 *   espaços, com universo e quantidade sorteada diferentes (6/2 nos trevos).
 */
export function numberEvidence(
  lottery: Lottery,
  performances: readonly NumberPerformance[],
  space: DrawSpace = 'numbers',
): EvidenceSummary {
  const spec = drawSpace(lottery, space);
  const p = spec.drawn / spec.universe;
  const totalHits = performances.reduce((sum, row) => sum + row.hitCount, 0);
  const draws = Math.round(totalHits / spec.drawn);
  const minimumDraws = Math.ceil(5 / p);
  const expected = draws * p;
  const sd = Math.sqrt(draws * p * (1 - p));

  const rows: NumberEvidenceRow[] = performances.map((row) => {
    const z = sd > 0 ? (row.hitCount - expected) / sd : 0;
    const pValue = sd > 0 ? Math.min(1, 2 * (1 - approxNormalCDF(Math.abs(z)))) : 1;
    return { number: row.number, hitCount: row.hitCount, expected, z, pValue, significant: false };
  });

  const correction = bonferroniCorrection(
    rows.map((row) => row.pValue),
    ALPHA,
  );
  rows.forEach((row, i) => {
    row.significant = correction.significant[i];
  });

  // Qui-quadrado de aderência: soma dos z² sobre as dezenas do universo. As
  // contagens somam `draws·K` (fixo), o que custa um grau de liberdade.
  const statistic = rows.reduce((sum, row) => sum + row.z * row.z, 0);
  const df = Math.max(performances.length - 1, 0);
  const chiPValue = df === 0 || sd === 0 ? 1 : 1 - approxChi2CDF(statistic, df);

  const testable = draws >= minimumDraws && performances.length > 1;
  const zAlpha = normalQuantile(1 - correction.correctedAlpha / 2);
  const zPower = normalQuantile(POWER);
  const minimumDetectableRelativeBias =
    testable && expected > 0 ? ((zAlpha + zPower) * sd) / expected : null;

  const verdict: EvidenceVerdict = !testable
    ? 'AMOSTRA_INSUFICIENTE'
    : correction.rejected > 0
      ? 'DESVIO_SIGNIFICATIVO'
      : 'COMPATIVEL_COM_ACASO';

  return {
    verdict,
    draws,
    alpha: ALPHA,
    correctedAlpha: correction.correctedAlpha,
    significantCount: correction.rejected,
    rows,
    chiSquare: { statistic, df, pValue: chiPValue },
    minimumDetectableRelativeBias,
    minimumDraws,
  };
}
