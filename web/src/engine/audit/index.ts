import { Draw, Lottery } from '../../types/domain';
import {
  ContestOutcome,
  TestOutcome,
  testA1Numbers,
  testA1Trevos,
  testA2Repetition,
  testA3Sum,
  testA4Winners,
  chronological,
} from './anomalyTests';
import { BaselineDistribution, simulateBaseline } from './baseline';
import {
  ALPHA,
  BASELINE_HISTORIES,
  BASELINE_SEED,
  PREREGISTRATION_VERSION,
} from './preregistration';
import {
  DrawDataset,
  DrawProvenance,
  assertAuditable,
  coveredPeriod,
  minimumContestsFor,
} from './provenance';

/**
 * O orquestrador da auditoria: roda o Módulo A completo e monta o relatório.
 *
 * ## O que este módulo decide, e que os testes individuais não podem decidir
 *
 * Significância. Um teste isolado sabe seu p-valor, mas não sabe quantos
 * outros testes correram ao lado dele — e é isso que determina o limiar.
 * Deixar cada teste decidir sozinho e corrigir depois é o caminho mais curto
 * para o falso positivo: com 15 testes a 5%, a chance de ao menos um
 * "significativo" por acaso é `1 − 0,95¹⁵ ≈ 54%`.
 *
 * ## O denominador de Bonferroni
 *
 * O protocolo pede correção "sobre o total de testes executados". Aqui isso
 * é literal: conta-se todo teste que produziu um p-valor, nos três recortes
 * (histórico completo, primeira metade, segunda metade). Testes pulados por
 * falta de dado não entram — inflar o denominador com testes que não
 * correram tornaria a correção arbitrariamente frouxa ou severa conforme o
 * que faltasse.
 *
 * O resultado é uma correção duplamente conservadora, porque A5 ainda exige
 * que a anomalia apareça nas **duas** metades. Isso é deliberado: num
 * exercício cujo objetivo é distinguir matemática de crença, o erro caro é
 * anunciar anomalia onde há acaso.
 */

export type SegmentLabel = 'completo' | 'primeira metade' | 'segunda metade';

export type TestConclusion = 'anomalia' | 'compatível com sorteio honesto' | 'não executado';

export interface AuditedTest extends TestOutcome {
  /** p-valor após Bonferroni: `min(1, p × total de testes)`. */
  readonly pValueCorrected?: number;
  readonly conclusion: TestConclusion;
}

export interface SegmentReport {
  readonly label: SegmentLabel;
  readonly contests: number;
  readonly tests: readonly AuditedTest[];
}

export interface AuditReport {
  readonly preregistrationVersion: string;
  readonly lottery: Lottery;
  readonly sourceLabel: string;
  readonly provenance: DrawProvenance;
  readonly contests: number;
  readonly periodStart: string;
  readonly periodEnd: string;
  /** `true` quando `periodStart`/`periodEnd` são datas fabricadas para
   * validação estrutural, não fornecidas pela fonte — ver `provenance.ts`. */
  readonly datesAreApproximate: boolean;
  readonly baselineHistories: number;
  readonly alpha: number;
  readonly correctedAlpha: number;
  readonly totalTestsExecuted: number;
  readonly segments: readonly SegmentReport[];
  /** Anomalias que apareceram nas duas metades (critério de A5). */
  readonly confirmedAnomalies: readonly string[];
  /** Anomalias no histórico completo que **não** replicaram nas metades. */
  readonly unreplicatedFindings: readonly string[];
  readonly replicationPossible: boolean;
  readonly conclusion: string;
}

export interface AuditOptions {
  /** Dados de ganhadores/apostas para A4. Sem eles, A4 não é executado. */
  readonly outcomes?: readonly ContestOutcome[];
  /**
   * Réplicas da linha de base. O protocolo fixa 10.000; reduzir acelera, e o
   * relatório registra o valor usado para que a leitura saiba o que foi feito.
   */
  readonly baselineHistories?: number;
  readonly baselineSeed?: number;
}

interface Segment {
  readonly label: SegmentLabel;
  readonly draws: readonly Draw[];
  readonly outcomes?: readonly ContestOutcome[];
}

/** Roda os quatro testes de um recorte com um alpha dado. */
function runSegment(
  segment: Segment,
  lottery: Lottery,
  baseline: BaselineDistribution,
  alpha: number,
): TestOutcome[] {
  return [
    testA1Numbers(segment.draws, lottery, baseline, alpha),
    testA1Trevos(segment.draws, lottery, baseline, alpha),
    testA2Repetition(segment.draws, lottery, baseline, alpha),
    testA3Sum(segment.draws, lottery, baseline, alpha),
    testA4Winners(segment.outcomes, lottery, alpha),
  ];
}

function outcomesFor(
  outcomes: readonly ContestOutcome[] | undefined,
  draws: readonly Draw[],
): readonly ContestOutcome[] | undefined {
  if (!outcomes) return undefined;
  const contests = new Set(draws.map((draw) => draw.contestNumber));
  const filtered = outcomes.filter((outcome) => contests.has(outcome.contestNumber));
  return filtered.length > 0 ? filtered : undefined;
}

/**
 * Executa o Módulo A completo sobre um histórico oficial.
 *
 * @throws NonAuditableDataError quando os dados não são auditáveis — ver
 * `provenance.ts`. A auditoria não degrada silenciosamente para dado
 * sintético; ela para.
 */
export function runAudit(dataset: DrawDataset, options: AuditOptions = {}): AuditReport {
  assertAuditable(dataset);

  const { lottery } = dataset;
  const ordered = chronological(dataset.draws);
  const histories = options.baselineHistories ?? BASELINE_HISTORIES;
  const seed = options.baselineSeed ?? BASELINE_SEED;

  const midpoint = Math.floor(ordered.length / 2);
  const minimum = minimumContestsFor(lottery);
  const replicationPossible = midpoint >= minimum;

  const segments: Segment[] = [
    { label: 'completo', draws: ordered, outcomes: outcomesFor(options.outcomes, ordered) },
  ];
  if (replicationPossible) {
    const first = ordered.slice(0, midpoint);
    const second = ordered.slice(midpoint);
    segments.push(
      { label: 'primeira metade', draws: first, outcomes: outcomesFor(options.outcomes, first) },
      { label: 'segunda metade', draws: second, outcomes: outcomesFor(options.outcomes, second) },
    );
  }

  // Uma linha de base por recorte: a Regra 3 exige o mesmo número de
  // concursos do histórico comparado, e as metades têm metade do tamanho.
  const baselines = segments.map((segment) =>
    simulateBaseline(lottery, segment.draws.length, { histories, seed }),
  );

  // Passe 1: descobrir quantos testes de fato produzem p-valor. O alpha aqui
  // é provisório e não entra em conclusão nenhuma — só o passe 2 decide.
  const provisional = segments.map((segment, i) =>
    runSegment(segment, lottery, baselines[i], ALPHA),
  );
  const totalTestsExecuted = provisional
    .flat()
    .filter((test) => test.executed && test.pValue !== undefined).length;

  const correctedAlpha = totalTestsExecuted > 0 ? ALPHA / totalTestsExecuted : ALPHA;

  // Passe 2: com o alpha corrigido definitivo, que também move o valor
  // crítico usado no cálculo de poder de A1.
  const finalSegments: SegmentReport[] = segments.map((segment, i) => ({
    label: segment.label,
    contests: segment.draws.length,
    tests: runSegment(segment, lottery, baselines[i], correctedAlpha).map((test) => {
      if (!test.executed || test.pValue === undefined) {
        return { ...test, conclusion: 'não executado' as const };
      }
      const pValueCorrected = Math.min(1, test.pValue * totalTestsExecuted);
      return {
        ...test,
        pValueCorrected,
        conclusion:
          pValueCorrected < ALPHA
            ? ('anomalia' as const)
            : ('compatível com sorteio honesto' as const),
      };
    }),
  }));

  const significantIn = (label: SegmentLabel): Set<string> => {
    const segment = finalSegments.find((s) => s.label === label);
    return new Set(
      (segment?.tests ?? []).filter((t) => t.conclusion === 'anomalia').map((t) => t.id),
    );
  };

  const inFull = significantIn('completo');
  const confirmedAnomalies = replicationPossible
    ? [...significantIn('primeira metade')].filter((id) => significantIn('segunda metade').has(id))
    : [];
  const unreplicatedFindings = [...inFull].filter((id) => !confirmedAnomalies.includes(id));

  const period = coveredPeriod(dataset);

  return {
    preregistrationVersion: PREREGISTRATION_VERSION,
    lottery,
    sourceLabel: dataset.sourceLabel,
    provenance: dataset.provenance,
    contests: ordered.length,
    periodStart: period.start,
    periodEnd: period.end,
    datesAreApproximate: dataset.datesAreApproximate ?? false,
    baselineHistories: histories,
    alpha: ALPHA,
    correctedAlpha,
    totalTestsExecuted,
    segments: finalSegments,
    confirmedAnomalies,
    unreplicatedFindings,
    replicationPossible,
    conclusion: buildConclusion(
      confirmedAnomalies,
      unreplicatedFindings,
      replicationPossible,
      finalSegments.find((s) => s.label === 'completo'),
    ),
  };
}

/**
 * Descreve o que o recorte completo consegue descartar. Um resultado nulo sem
 * isto seria ambíguo entre "não há viés" e "o teste não veria viés nenhum".
 */
function describeBounds(full: SegmentReport | undefined): string {
  const bounds = (full?.tests ?? [])
    .filter(
      (test) =>
        test.executed &&
        test.minimumDetectableEffect !== undefined &&
        Number.isFinite(test.minimumDetectableEffect),
    )
    .map((test) => {
      const mde = test.minimumDetectableEffect!;
      const value = test.effectUnit?.includes('relativ')
        ? `${(mde * 100).toFixed(1)}%`
        : mde.toFixed(2);
      return `${test.id} acima de ${value} (${test.effectUnit})`;
    });

  return bounds.length === 0
    ? ''
    : ` Com 80% de probabilidade, este histórico descartaria: ${bounds.join('; ')}.`;
}

function buildConclusion(
  confirmed: readonly string[],
  unreplicated: readonly string[],
  replicationPossible: boolean,
  full?: SegmentReport,
): string {
  if (!replicationPossible) {
    return (
      'Histórico curto demais para o critério de replicação de A5: cada metade ' +
      'precisaria atingir o mínimo de concursos por si só. Nenhuma anomalia ' +
      'pode ser confirmada sob este protocolo, independentemente dos p-valores.'
    );
  }
  if (confirmed.length > 0) {
    return (
      `Anomalia confirmada em ${confirmed.length} teste(s) — significativo após ` +
      `Bonferroni nas duas metades do histórico: ${confirmed.join(', ')}. ` +
      `Replicação independente é recomendada antes de qualquer afirmação forte.`
    );
  }
  if (unreplicated.length > 0) {
    return (
      `Nenhuma anomalia confirmada. ${unreplicated.length} achado(s) atingiram ` +
      `significância no histórico completo mas não replicaram nas duas metades ` +
      `(${unreplicated.join(', ')}) — o padrão esperado de flutuação amostral, ` +
      `não de viés sistemático.`
    );
  }
  return (
    'Nenhuma anomalia. Todos os testes executados são compatíveis com sorteio ' +
    'honesto após correção de múltiplas comparações — que é o resultado que a ' +
    'teoria prevê, e vale tanto quanto qualquer outro.' +
    describeBounds(full)
  );
}

/** Relatório em texto, na estrutura que o protocolo pede. */
export function formatAuditReport(report: AuditReport): string {
  const lines: string[] = [];
  const pct = (value: number | undefined): string =>
    value === undefined ? '—' : `${(value * 100).toFixed(1)}%`;
  const num = (value: number | undefined, digits = 4): string =>
    value === undefined ? '—' : value.toFixed(digits);

  lines.push(`AUDITORIA DE ANOMALIAS — ${report.lottery}`);
  lines.push(`Protocolo pré-registrado v${report.preregistrationVersion}`);
  lines.push('');

  if (report.provenance !== 'official') {
    lines.push(
      '⚠⚠⚠ FONTE NÃO OFICIAL ⚠⚠⚠ — agregação de terceiros, não a exportação ' +
        'direta da Caixa. A fidelidade destes números aos sorteios reais ' +
        'depende inteiramente da fonte citada abaixo, não de nenhuma ' +
        'verificação que este relatório possa fazer.',
    );
    lines.push('');
  }

  lines.push(`Fonte: ${report.sourceLabel}`);
  lines.push(
    report.datesAreApproximate
      ? `Concursos: ${report.contests} (período ${report.periodStart} a ` +
          `${report.periodEnd} é APROXIMADO — a fonte não fornece data por ` +
          `concurso; ver README da fonte)`
      : `Concursos: ${report.contests} (${report.periodStart} a ${report.periodEnd})`,
  );
  lines.push(`Linha de base: ${report.baselineHistories} históricos honestos simulados`);
  lines.push(
    `Alpha ${report.alpha} / ${report.totalTestsExecuted} testes = ` +
      `${report.correctedAlpha.toExponential(2)} (Bonferroni)`,
  );
  lines.push('');

  for (const segment of report.segments) {
    lines.push(`── ${segment.label.toUpperCase()} (${segment.contests} concursos)`);
    for (const test of segment.tests) {
      if (!test.executed) {
        lines.push(`   ${test.id.padEnd(14)} não executado — ${test.skipReason}`);
        continue;
      }
      lines.push(
        `   ${test.id.padEnd(14)} estat=${num(test.statistic, 3)} ` +
          `esperado=${num(test.expected, 3)} ` +
          `p_corr=${num(test.pValueCorrected)} ` +
          `poder=${pct(test.power)} → ${test.conclusion}`,
      );
      if (test.minimumDetectableEffect !== undefined) {
        const mde = test.minimumDetectableEffect;
        const shown = Number.isFinite(mde)
          ? test.effectUnit?.includes('relativ')
            ? `${(mde * 100).toFixed(1)}%`
            : mde.toFixed(2)
          : 'inalcançável neste tamanho de amostra';
        lines.push(`      detecta a partir de ${shown} — ${test.effectUnit}`);
      }
      for (const caveat of test.caveats ?? []) {
        lines.push(`      ⚠ ${caveat}`);
      }
    }
    lines.push('');
  }

  lines.push('CONCLUSÃO');
  lines.push(report.conclusion);
  return lines.join('\n');
}

export * from './anomalyTests';
export * from './baseline';
export * from './preregistration';
export * from './provenance';
export * from './moduleB';
export * from './moduleC';
