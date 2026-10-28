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
  if (z >= 0) {
    return 1 - normalUpperTail(z);
  }
  return normalUpperTail(-z);
}

/**
 * Cauda superior normal Q(z) = 1 − Φ(z) para z ≥ 0, direto da 26.2.17.
 *
 * WHY não `1 - approxNormalCDF(z)`: para z grande o CDF encosta em 1 e a
 * subtração cancela ε abaixo de ~1e-16 — Q(15) ≈ 1e-51 virava exatamente 0.
 * A fórmula devolve a cauda com magnitude preservada até o underflow de
 * `exp` (z ≈ 38.5), o que mantém p-values pequenos porém não nulos.
 *
 * Exportada: o p-value bicaudal `2·Q(|z|)` (espelho do `erfc(|z|/√2)` do
 * Kotlin) é o jeito estável de calculá-lo — ver `numberEvidence`.
 */
export function normalUpperTail(z: number): number {
  const t = 1 / (1 + 0.2316419 * z);
  const poly =
    0.31938153 +
    t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429)));
  return 0.39894228 * Math.exp((-z * z) / 2) * poly;
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
 * Cauda superior da Chi-quadrado: P(X >= x), via Wilson-Hilferty.
 *
 * WHY não computar `1 - approxChi2CDF(x, df)`: para χ² grande a CDF encosta
 * em 1 e a subtração em ponto flutuante cancela todos os algarismos —
 * p-values de 1e-10 viravam 0 (ou lixo da última casa). A cauda é avaliada
 * diretamente pela 26.2.17, preservando a magnitude até o underflow de
 * `exp` (z ≈ 38.5).
 */
export function approxChi2Survival(x: number, df: number): number {
  if (x <= 0 || df <= 0) return 1;
  const z = Math.pow(x / df, 1 / 3) - (1 - 2 / (9 * df));
  const denom = Math.sqrt(2 / (9 * df));
  const zn = z / denom;
  return zn >= 0 ? normalUpperTail(zn) : 1 - normalUpperTail(-zn);
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
