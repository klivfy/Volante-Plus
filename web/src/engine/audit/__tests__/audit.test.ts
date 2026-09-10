import { describe, expect, it } from 'vitest';
import { getSeedData } from '../../../data/seed';
import { Draw, Lottery } from '../../../types/domain';
import { createSeededRandom } from '../../random';
import { ContestOutcome } from '../anomalyTests';
import { DrawDataset, NonAuditableDataError } from '../provenance';
import { formatAuditReport, runAudit } from '../index';

const MEGA = Lottery.MEGA_SENA;

/**
 * Histórico contíguo. Com `carryBias > 0`, a dezena 1 é forçada numa fração
 * dos concursos — um viés de urna deliberado, para o controle positivo.
 */
function history(contests: number, seed: number, carryBias = 0): Draw[] {
  const random = createSeededRandom(seed);
  const draws: Draw[] = [];
  for (let i = 0; i < contests; i += 1) {
    const numbers = new Set<number>();
    while (numbers.size < 6) numbers.add(1 + random.nextInt(60));
    if (carryBias > 0 && random.nextFloat() < carryBias && !numbers.has(1)) {
      numbers.delete([...numbers][0]);
      numbers.add(1);
    }
    draws.push({
      lottery: MEGA,
      contestNumber: 9000 + i,
      date: new Date(Date.UTC(2015, 0, 1 + i)).toISOString().slice(0, 10),
      numbers: [...numbers].sort((a, b) => a - b),
    });
  }
  return draws;
}

function official(draws: Draw[], label = 'Simulação rotulada para teste'): DrawDataset {
  return { lottery: MEGA, draws, provenance: 'official', sourceLabel: label };
}

const FAST = { baselineHistories: 1000, baselineSeed: 4242 } as const;

describe('runAudit — a guarda vem antes de tudo', () => {
  it('não roda sobre dados sintéticos, nem degrada em silêncio', () => {
    const data: DrawDataset = { ...official(history(200, 1)), provenance: 'synthetic' };
    expect(() => runAudit(data, FAST)).toThrow(NonAuditableDataError);
  });

  it('não roda sobre o seed empacotado rotulado de oficial', () => {
    const data = official(getSeedData(MEGA));
    expect(() => runAudit(data, FAST)).toThrow(/seed sintético empacotado/);
  });
});

/**
 * CONTROLE NEGATIVO — a bateria não pode inventar anomalia onde não há.
 *
 * O histórico aqui é honesto por construção. Um instrumento que acusasse
 * viés nele estaria quebrado, e qualquer "anomalia" que ele apontasse em
 * dado real não valeria nada.
 */
describe('controle negativo: histórico honesto', () => {
  const report = runAudit(official(history(400, 20260910)), FAST);

  it('não confirma anomalia nenhuma', () => {
    expect(report.confirmedAnomalies).toEqual([]);
  });

  it('conclui explicitamente pela compatibilidade com sorteio honesto', () => {
    expect(report.conclusion).toMatch(/Nenhuma anomalia/);
  });

  it('todos os testes executados no histórico completo passam', () => {
    const full = report.segments.find((s) => s.label === 'completo')!;
    const executed = full.tests.filter((t) => t.executed);
    expect(executed.length).toBeGreaterThan(0);
    for (const test of executed) {
      expect(test.conclusion).toBe('compatível com sorteio honesto');
    }
  });

  it('reporta o que o protocolo exige no cabeçalho: concursos e período', () => {
    expect(report.contests).toBe(400);
    expect(report.periodStart).toBe('2015-01-01');
    expect(report.periodEnd).not.toBe('');
    expect(report.baselineHistories).toBe(1000);
  });
});

/**
 * CONTROLE POSITIVO — a bateria precisa pegar viés que existe de verdade.
 *
 * Sem este teste, o controle negativo não prova nada: um instrumento que
 * nunca acusa nada também passa nele. Aqui a dezena 1 é forçada em ~25% dos
 * concursos, contra os 10% que a teoria prevê.
 */
describe('controle positivo: urna com viés real', () => {
  const report = runAudit(official(history(400, 777, 0.25)), FAST);

  it('detecta o viés e confirma nas duas metades (critério de A5)', () => {
    expect(report.confirmedAnomalies).toContain('A1.numbers');
  });

  it('a conclusão anuncia anomalia confirmada', () => {
    expect(report.conclusion).toMatch(/Anomalia confirmada/);
  });

  it('o p-valor corrigido de A1 fica abaixo do alpha nas duas metades', () => {
    for (const label of ['primeira metade', 'segunda metade'] as const) {
      const segment = report.segments.find((s) => s.label === label)!;
      const a1 = segment.tests.find((t) => t.id === 'A1.numbers')!;
      expect(a1.pValueCorrected).toBeLessThan(report.alpha);
    }
  });

  it('A2 e A3 seguem compatíveis — o viés é de frequência, não de dependência', () => {
    const full = report.segments.find((s) => s.label === 'completo')!;
    expect(full.tests.find((t) => t.id === 'A2.repetition')!.conclusion).toBe(
      'compatível com sorteio honesto',
    );
  });
});

describe('Bonferroni sobre o total executado', () => {
  const report = runAudit(official(history(400, 55)), FAST);

  it('o denominador conta só testes que produziram p-valor', () => {
    const executed = report.segments
      .flatMap((s) => s.tests)
      .filter((t) => t.executed && t.pValue !== undefined).length;
    expect(report.totalTestsExecuted).toBe(executed);
    expect(report.correctedAlpha).toBeCloseTo(report.alpha / executed, 12);
  });

  it('Mega-Sena sem dados de rateio: 3 testes por recorte, 3 recortes', () => {
    // A1.trevos não se aplica; A4 sem dado. Sobram A1.numbers, A2, A3.
    expect(report.totalTestsExecuted).toBe(9);
  });

  it('o p-valor corrigido é o bruto multiplicado pelo total, saturado em 1', () => {
    const full = report.segments.find((s) => s.label === 'completo')!;
    for (const test of full.tests.filter((t) => t.executed)) {
      expect(test.pValueCorrected).toBeCloseTo(
        Math.min(1, test.pValue! * report.totalTestsExecuted),
        12,
      );
    }
  });
});

describe('A5 — replicação', () => {
  it('histórico curto demais não permite confirmar nada, mesmo com p baixo', () => {
    // 80 concursos: passa o mínimo de 50, mas cada metade tem 40 — abaixo.
    const report = runAudit(official(history(80, 3, 0.4)), FAST);
    expect(report.replicationPossible).toBe(false);
    expect(report.confirmedAnomalies).toEqual([]);
    expect(report.conclusion).toMatch(/curto demais/);
    expect(report.segments).toHaveLength(1);
  });

  it('histórico suficiente produz os três recortes', () => {
    const report = runAudit(official(history(400, 4)), FAST);
    expect(report.replicationPossible).toBe(true);
    expect(report.segments.map((s) => s.label)).toEqual([
      'completo',
      'primeira metade',
      'segunda metade',
    ]);
    const [full, first, second] = report.segments;
    expect(first.contests + second.contests).toBe(full.contests);
  });
});

describe('A4 — ganhadores', () => {
  const draws = history(400, 61);

  it('sem dados de rateio, é pulado com o motivo declarado', () => {
    const report = runAudit(official(draws), FAST);
    const a4 = report.segments[0].tests.find((t) => t.id === 'A4.winners')!;
    expect(a4.executed).toBe(false);
    expect(a4.skipReason).toMatch(/não fornecidos/);
    expect(a4.conclusion).toBe('não executado');
  });

  it('com dados, executa e declara a limitação da não-uniformidade', () => {
    // Volume tal que o lambda agregado seja da ordem de algumas dezenas.
    const outcomes: ContestOutcome[] = draws.map((draw) => ({
      contestNumber: draw.contestNumber,
      topTierWinners: draw.contestNumber % 7 === 0 ? 1 : 0,
      simpleBets: 25_000_000,
    }));
    const report = runAudit(official(draws), { ...FAST, outcomes });
    const a4 = report.segments[0].tests.find((t) => t.id === 'A4.winners')!;

    expect(a4.executed).toBe(true);
    expect(a4.pValue).toBeDefined();
    expect(a4.caveats?.join(' ')).toMatch(/não são uniformes/);
    // Passa a contar no denominador de Bonferroni.
    expect(report.totalTestsExecuted).toBe(12);
  });
});

/**
 * O EMD é o que impede a leitura errada do resultado nulo. Sem ele,
 * "nenhuma anomalia" não distingue ausência de viés de cegueira do teste.
 */
describe('efeito mínimo detectável', () => {
  const report = runAudit(official(history(400, 88)), FAST);
  const full = report.segments.find((s) => s.label === 'completo')!;

  it('todo teste executado reporta o que consegue detectar, e em que unidade', () => {
    for (const test of full.tests.filter((t) => t.executed)) {
      expect(test.minimumDetectableEffect).toBeDefined();
      expect(test.effectUnit).toBeTruthy();
      expect(test.minimumDetectableEffect!).toBeGreaterThan(0);
    }
  });

  it('a conclusão nula declara o que ficou descartado', () => {
    expect(report.confirmedAnomalies).toEqual([]);
    expect(report.conclusion).toMatch(/descartaria/);
  });

  it('histórico maior detecta efeitos menores', () => {
    const bigger = runAudit(official(history(1200, 88)), FAST);
    const a1Small = full.tests.find((t) => t.id === 'A1.numbers')!.minimumDetectableEffect!;
    const a1Big = bigger.segments[0].tests.find((t) => t.id === 'A1.numbers')!
      .minimumDetectableEffect!;
    expect(a1Big).toBeLessThan(a1Small);
  });
});

describe('formatAuditReport', () => {
  it('inclui fonte, concursos, período, alpha corrigido e conclusão', () => {
    const report = runAudit(official(history(400, 9), 'Exportação oficial (teste)'), FAST);
    const text = formatAuditReport(report);

    expect(text).toContain('Exportação oficial (teste)');
    expect(text).toContain('Concursos: 400');
    expect(text).toContain('Bonferroni');
    expect(text).toContain('CONCLUSÃO');
    expect(text).toContain('A1.numbers');
    expect(text).toContain('não executado');
    expect(text).toContain('detecta a partir de');
  });
});

describe('determinismo', () => {
  it('a mesma entrada produz o mesmo relatório — auditoria conferível', () => {
    const draws = history(200, 12);
    const a = runAudit(official(draws), FAST);
    const b = runAudit(official(draws), FAST);
    expect(formatAuditReport(a)).toBe(formatAuditReport(b));
  });
});
