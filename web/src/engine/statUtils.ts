import { RandomSource, defaultRandom } from './random';

/**
 * Utilitários numéricos compartilhados pelos módulos de validação estatística
 * avançada (`statisticalTests`, `fairnessTests`, `powerAnalysis`, ...).
 *
 * Tudo aqui é aproximação numérica pura (sem dependência externa como
 * `jStat`) — mantém o engine livre de bibliotecas de estatística e portável
 * para Service Worker / testes, igual ao restante de `web/src/engine/`.
 */

/**
 * Aproximação da CDF normal padrão (Abramowitz & Stegun, fórmula 26.2.17).
 * Erro máximo ~7.5e-8 — mais que suficiente para p-values e intervalos de
 * confiança de uso exploratório.
 */
export function approxNormalCDF(z: number): number {
  const b1 = 0.319381530;
  const b2 = -0.356563782;
  const b3 = 1.781477937;
  const b4 = -1.821255978;
  const b5 = 1.330274429;
  const p = 0.2316419;
  const c = 0.39894228;

  if (z >= 0) {
    const t = 1 / (1 + p * z);
    return 1 - c * Math.exp((-z * z) / 2) * t * (b1 + t * (b2 + t * (b3 + t * (b4 + t * b5))));
  }
  return 1 - approxNormalCDF(-z);
}

/**
 * CDF binomial exata: P(X <= k) para X ~ Binomial(n, p).
 * Soma a pmf via recorrência (evita recalcular fatoriais); estável para o
 * range de tamanhos de amostra que o app usa (histórico de loteria: milhares,
 * não milhões, de observações).
 */
export function binomialCDF(k: number, n: number, p: number): number {
  if (k < 0) return 0;
  if (k >= n) return 1;
  if (p <= 0) return 1;
  if (p >= 1) return 0;

  let sum = 0;
  let term = Math.pow(1 - p, n); // P(X = 0)

  for (let i = 0; i <= k; i++) {
    sum += term;
    term *= (p / (1 - p)) * ((n - i) / (i + 1));
    if (term < 1e-300) break; // proteção contra underflow
  }

  return Math.min(1, sum);
}

/**
 * Aproximação da CDF de Chi-quadrado via Wilson-Hilferty.
 * Razoavelmente precisa para `df` > 5 — suficiente para os testes de
 * goodness-of-fit e fairness deste módulo (universos de 50/60 dezenas).
 */
export function approxChi2CDF(x: number, df: number): number {
  if (x <= 0 || df <= 0) return 0;
  const z = Math.pow(x / df, 1 / 3) - (1 - 2 / (9 * df));
  const denom = Math.sqrt(2 / (9 * df));
  return approxNormalCDF(z / denom);
}

/**
 * Embaralhamento Fisher-Yates usando a fonte de aleatoriedade do engine
 * (`RandomSource`), não `Math.random` diretamente — mantém consistência com
 * `gameGenerator.ts`/`backtestAnalyzer.ts` e permite semear em testes.
 */
export function shuffleArray<T>(items: readonly T[], random: RandomSource = defaultRandom): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = random.nextInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
