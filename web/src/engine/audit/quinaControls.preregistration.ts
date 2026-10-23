import {
  ALPHA,
  ALTERNATIVE_RELATIVE_BIAS,
  BASELINE_HISTORIES,
  BASELINE_SEED,
  POWER_REPLICATIONS,
  POWER_SEED,
  TARGET_POWER,
} from './preregistration';

/**
 * Pré-registro dos controles da Quina (feature 003-quina-lottery, Princípios
 * II e III). Escrito e commitado ANTES de existir `quina.json` neste
 * repositório e antes de qualquer execução sobre o histórico real da Quina.
 * Qualquer mudança posterior aparece no diff, com autor e momento.
 *
 * A Quina herda, sem alteração, o protocolo global de `preregistration.ts`:
 * alfa, linha de base, sementes, réplicas de poder e viés alternativo de +20%.
 * Reexportados abaixo para que o teste dos controles cite um único lugar.
 */
export const QUINA_INHERITED = {
  alpha: ALPHA,
  baselineHistories: BASELINE_HISTORIES,
  baselineSeed: BASELINE_SEED,
  powerReplications: POWER_REPLICATIONS,
  powerSeed: POWER_SEED,
  targetPower: TARGET_POWER,
  alternativeRelativeBias: ALTERNATIVE_RELATIVE_BIAS,
} as const;

/** Muda quando qualquer critério deste arquivo muda. */
export const QUINA_CONTROLS_VERSION = '1.0.0';

/** Semente dos históricos simulados dos controles, distinta das demais. */
export const QUINA_CONTROL_SEED = 80_005;

/** Concursos por história simulada: a escala do histórico real (7.149 em 2026-10-22). */
export const QUINA_CONTROL_CONTESTS = 7_149;

/** Réplicas por controle. */
export const QUINA_CONTROL_REPLICATIONS = 200;

/**
 * Controle negativo: em histórico i.i.d. honesto, a taxa de rejeição por
 * teste não pode passar do alfa mais uma margem de Monte Carlo de 3 desvios
 * binomiais (sqrt(alfa(1-alfa)/réplicas) = ~0,0154), ou seja 0,05 + 3·0,0154.
 */
export const QUINA_NEGATIVE_MAX_REJECTION_RATE =
  ALPHA + 3 * Math.sqrt((ALPHA * (1 - ALPHA)) / QUINA_CONTROL_REPLICATIONS);

/**
 * Controle positivo: dezena única com probabilidade relativa +20% acima do
 * esperado (`ALTERNATIVE_RELATIVE_BIAS`) deve ser detectada em pelo menos
 * `TARGET_POWER` das réplicas.
 */
export const QUINA_POSITIVE_MIN_DETECTION_RATE = TARGET_POWER;

/** Dezena viciada no controle positivo. */
export const QUINA_BIASED_NUMBER = 13;
