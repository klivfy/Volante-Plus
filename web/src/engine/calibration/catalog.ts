import { Lottery } from '../../types/domain';

/**
 * Contrato de calibração — catálogo único dos métodos estatísticos que fazem
 * afirmação de significância.
 *
 * WHY: cada método que promete um nível de significância (α) precisa ser
 * medido contra o que realmente entrega, sob o modelo nulo que ele assume
 * (históricos honestos, iid uniforme). Este catálogo é a única fonte de
 * verdade: consumido pelo harness de calibração (`runner.ts`), pelo teste de
 * unidade e, na Fase 2/3 do plano de confiabilidade, pelo relatório de
 * auditoria e pelo gate de CI. Alterar α aqui exige pull request dedicado com
 * recalibração completa (docs/calibration-contract.md).
 *
 * Honestidade: os sorteios da Caixa são eventos aleatórios independentes.
 * Calibração não torna nenhum método capaz de prever resultados — garante que
 * "anomalia com α = 5%" significa exatamente isso.
 */

/** Método verificado por Monte Carlo em históricos honestos. */
export type CalibrationKind = 'monte-carlo' | 'exato';

export interface CalibrationEntry {
  /** Identificador estável (nome do módulo + espaço quando aplicável). */
  method: string;
  /** Afirmação estatística que o método faz ao usuário. */
  claim: string;
  /** α nominal declarado; `null` para métodos exatos (verificação direta). */
  alpha: number | null;
  kind: CalibrationKind;
  /** Onde a afirmação aparece para o usuário (ou "interno/auditoria"). */
  surface: string;
  /** Loteria usada como referência na medição (histórico honesto). */
  lottery: Lottery | null;
  /**
   * `true` quando o método entra no teste de unidade rápido (N pequeno,
   * tolerância larga — prova do mecanismo). O gate estrito (α + 2 p.p. com
   * N = 2.000) é da Fase 3 e cobre todos os métodos `monte-carlo`.
   */
  smoke: boolean;
}

export const FPR_TOLERANCE_PTS = 2;
export const SMOKE_TOLERANCE_PTS = 5;
export const SMOKE_RUNS = 300;
export const SMOKE_HISTORY_LENGTH = 400;
/** Semente base pública: qualquer pessoa reproduz os mesmos vereditos. */
export const SMOKE_SEED_BASE = 20261028;

export const CALIBRATION_CATALOG: readonly CalibrationEntry[] = [
  {
    method: 'numberEvidence (dezenas)',
    claim:
      'Desvio por dezena bilateral com Bonferroni sobre o universo; veredito DESVIO_SIGNIFICATIVO só com rejeição corrigida',
    alpha: 0.05,
    kind: 'monte-carlo',
    surface: 'Painel de evidência (/analise-avancada)',
    lottery: Lottery.MEGA_SENA,
    smoke: true,
  },
  {
    method: 'numberEvidence (trevos)',
    claim: 'Mesmo teste no espaço dos trevos da +Milionária (2 de 6)',
    alpha: 0.05,
    kind: 'monte-carlo',
    surface: 'Painel de evidência (trevos)',
    lottery: Lottery.MAIS_MILIONARIA,
    smoke: true,
  },
  {
    method: 'collisionTest',
    claim: 'P(≥ repetições de combinação | honesto) por cauda superior de Poisson',
    alpha: 0.05,
    kind: 'monte-carlo',
    surface: 'Interno/auditoria (drawDependence)',
    lottery: Lottery.MEGA_SENA,
    smoke: true,
  },
  {
    method: 'frequencyFairnessTest',
    claim: 'Uniformidade das frequências por χ² de aderência',
    alpha: 0.05,
    kind: 'monte-carlo',
    surface: 'Interno/auditoria (fairnessTests)',
    lottery: Lottery.MEGA_SENA,
    smoke: true,
  },
  {
    method: 'chiSquareGlobal (numberEvidence)',
    claim: 'χ² global calibrado para sorteio sem reposição (fator (m−1)/m)',
    alpha: 0.05,
    kind: 'monte-carlo',
    surface: 'Painel de evidência (qui-quadrado global)',
    lottery: Lottery.MEGA_SENA,
    smoke: true,
  },
  {
    method: 'walkForwardMulti (stabilityAnalysis)',
    claim: 'Significância por corte com correção de Bonferroni pelo nº de cortes',
    alpha: 0.05,
    kind: 'monte-carlo',
    surface: 'Backtesting (análise de estabilidade)',
    lottery: Lottery.MEGA_SENA,
    smoke: false,
  },
  {
    method: 'hypergeometricChances',
    claim: 'Chances exatas por faixa (hipergeométrica, recomputação independente)',
    alpha: null,
    kind: 'exato',
    surface: 'Telas de chances e EV',
    lottery: null,
    smoke: false,
  },
  {
    method: 'closureDesigner',
    claim: 'Garantia C(v,k,t) verificada por varredura exaustiva (verifyClosure)',
    alpha: null,
    kind: 'exato',
    surface: 'Tela de fechamento',
    lottery: null,
    smoke: false,
  },
];

export const monteCarloEntries = (): CalibrationEntry[] =>
  CALIBRATION_CATALOG.filter((entry) => entry.kind === 'monte-carlo');

export const smokeEntries = (): CalibrationEntry[] =>
  monteCarloEntries().filter((entry) => entry.smoke);
