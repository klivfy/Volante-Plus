/**
 * Correção de múltiplas comparações.
 *
 * Testar N estratégias contra o mesmo histórico e reportar a "melhor" sem
 * correção infla o falso-positivo: com 10 testes a 5%, a chance de pelo menos
 * um "significativo" por puro acaso já é `1 - (1-0.05)^10 ≈ 40%`. Usado por
 * `strategyBenchmark.ts` sobre os p-values de `statisticalTests.ts`.
 */

export interface CorrectionResult {
  significant: boolean[];
  rejected: number;
}

/** Correção de Bonferroni: divide alpha pelo número de testes (conservadora). */
export function bonferroniCorrection(
  pValues: number[],
  alpha: number = 0.05,
): CorrectionResult & { correctedAlpha: number } {
  if (pValues.length === 0) {
    return { correctedAlpha: alpha, significant: [], rejected: 0 };
  }
  const correctedAlpha = alpha / pValues.length;
  const significant = pValues.map((p) => p < correctedAlpha);
  return { correctedAlpha, significant, rejected: significant.filter(Boolean).length };
}

/**
 * Correção Benjamini-Hochberg (controle de FDR — taxa de falsas descobertas).
 * Menos conservadora que Bonferroni quando há muitas hipóteses.
 */
export function benjaminiHochberg(
  pValues: number[],
  alpha: number = 0.05,
): CorrectionResult & { threshold: number } {
  const m = pValues.length;
  if (m === 0) {
    return { significant: [], rejected: 0, threshold: 0 };
  }

  const sorted = pValues.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);

  let lastReject = -1;
  for (let k = 0; k < m; k++) {
    if (sorted[k].p <= (alpha * (k + 1)) / m) {
      lastReject = k;
    }
  }

  const significant = new Array(m).fill(false);
  for (let k = 0; k <= lastReject; k++) {
    significant[sorted[k].i] = true;
  }

  return {
    significant,
    rejected: lastReject + 1,
    threshold: lastReject >= 0 ? sorted[lastReject].p : 0,
  };
}
