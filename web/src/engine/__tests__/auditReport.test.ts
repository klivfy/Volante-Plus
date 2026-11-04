import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderAuditPdf } from '../calibration/auditPdf';
import {
  AUDIT_REPORT_SCHEMA,
  gateIncludesDeferred,
  HISTORY_SEED_FILES,
  auditTolerance,
  buildAuditReport,
  resolveRepoRoot,
} from '../calibration/auditReport';
import {
  FPR_TOLERANCE_PTS,
  GATE_RUNS,
  SMOKE_SEED_BASE,
  SMOKE_TOLERANCE_PTS,
  smokeEntries,
} from '../calibration/catalog';
import { historySeedVersion } from '../../data/history';

/**
 * Testes do relatório de auditoria (Fase 2): determinismo, digest de
 * conteúdo, critério de tolerância, procedência do seed, recomputação
 * independente dos exatos e estrutura do PDF gerado.
 *
 * O N estrutural é 300 — a referência documentada da Fase 1, na qual todos
 * os métodos smoke passam com a tolerância larga. Em N pequeno o IC de
 * Wilson é largo e reprovar é comportamento correto do harness, não bug.
 */

const FIXED_NOW = (): Date => new Date('2026-10-28T12:00:00.000Z');
const N_ESTRUTURAL = 300;

const report = buildAuditReport({ runs: N_ESTRUTURAL, now: FIXED_NOW });

describe('resolveRepoRoot', () => {
  it('acha a raiz que contém o motor de calibração', () => {
    const root = resolveRepoRoot();
    expect(
      fs.existsSync(path.join(root, 'web', 'src', 'engine', 'calibration', 'catalog.ts')),
    ).toBe(true);
  });
});

describe('buildAuditReport — determinismo e digest', () => {
  it('mesma entrada produz mesmo contentSha256 e mesmo conteúdo', () => {
    const b = buildAuditReport({ runs: N_ESTRUTURAL, now: FIXED_NOW });
    expect(report.meta.contentSha256).toBe(b.meta.contentSha256);

    const core = (value: ReturnType<typeof buildAuditReport>): string => {
      const { schema, meta, ...others } = value;
      const { generatedAtUtc: _stamp, contentSha256: _digest, ...metaCore } = meta;
      void _stamp;
      void _digest;
      return JSON.stringify({ schema, meta: metaCore, ...others });
    };
    expect(core(report)).toBe(core(b));

    // Digest confere com o SHA-256 recalculado por via externa (crypto).
    const recomputed = createHash('sha256').update(core(report)).digest('hex');
    expect(report.meta.contentSha256).toBe(recomputed);
    expect(report.schema).toBe(AUDIT_REPORT_SCHEMA);
  });

  it('o carimbo UTC fica fora do digest (pode mudar sem invalidar o conteúdo)', () => {
    const later = buildAuditReport({
      runs: N_ESTRUTURAL,
      now: (): Date => new Date('2026-10-28T18:30:00.000Z'),
    });
    expect(report.meta.generatedAtUtc).not.toBe(later.meta.generatedAtUtc);
    expect(report.meta.contentSha256).toBe(later.meta.contentSha256);
  });
});

describe('critério numérico', () => {
  it('tolerância estrita só a partir do gate do contrato (N = 2.000)', () => {
    expect(auditTolerance(GATE_RUNS - 1)).toBe(SMOKE_TOLERANCE_PTS);
    expect(auditTolerance(GATE_RUNS)).toBe(FPR_TOLERANCE_PTS);
  });

  it('relatório com N < gate usa a tolerância larga da fumaça', () => {
    expect(report.meta.runs).toBe(N_ESTRUTURAL);
    expect(report.meta.tolerancePoints).toBe(SMOKE_TOLERANCE_PTS);
    expect(report.meta.criterion).toContain('5 p.p.');
  });
});

describe('estrutura do relatório', () => {
  it('cobre todos os métodos smoke + sonda + adidos + exatos', () => {
    expect(report.monteCarlo.length).toBe(smokeEntries().length);
    expect(report.deferred).toHaveLength(1);
    expect(report.deferred[0].method).toBe('walkForwardMulti (stabilityAnalysis)');
    expect(report.exact).toHaveLength(2);

    for (const result of report.monteCarlo) {
      expect(result.runs).toBe(N_ESTRUTURAL);
      // Veredito consistente com o critério (limite superior do IC x limite).
      expect(result.verdict).toBe(result.ci.upper <= result.bound ? 'PASS' : 'FAIL');
    }
    // A sonda (alfa = 0,5) tem de reprovar: se passar, o harness está errado.
    expect(report.probe.verdict).toBe('FAIL');
    expect(report.summary.probeVerdict).toBe('FAIL (esperado)');
  });

  it('com a referência da Fase 1 (N = 300), todos passam dentro do contrato', () => {
    expect(report.summary.measured).toBe(report.monteCarlo.length);
    expect(report.summary.passed).toBe(report.summary.measured);
    expect(report.summary.failed).toBe(0);
    expect(report.summary.allPass).toBe(true);
  });

  it('métodos exatos: recomputação independente confirma o motor', () => {
    for (const check of report.exact) {
      expect(check.pass, check.method).toBe(true);
      expect(check.detail.length).toBeGreaterThan(10);
    }
    expect(report.summary.exactPassed).toBe(report.summary.exactChecks);
  });
});

describe('procedência', () => {
  it('seed base pública tem o SHA-256 esperado', () => {
    expect(report.meta.seedBase).toBe(SMOKE_SEED_BASE);
    expect(report.meta.seedBaseSha256).toBe(
      createHash('sha256').update(String(SMOKE_SEED_BASE)).digest('hex'),
    );
  });

  it('versão do seed embutido bate com meta.json e hash cobre os 4 arquivos', () => {
    const root = resolveRepoRoot();
    const historyDir = path.join(root, 'web', 'src', 'data', 'history');

    const metaJson = JSON.parse(
      fs.readFileSync(path.join(historyDir, 'meta.json'), 'utf8'),
    ) as {
      lotteries: Record<string, { lastContest: number }>;
    };
    expect(report.meta.historySeedVersion).toBe(
      `${metaJson.lotteries.megasena.lastContest}-` +
        `${metaJson.lotteries.maismilionaria.lastContest}-` +
        `${metaJson.lotteries.quina.lastContest}`,
    );
    // Trava dupla: a função do app produz o mesmo identificador.
    expect(report.meta.historySeedVersion).toBe(historySeedVersion());

    expect(Object.keys(report.meta.historySeedFiles)).toEqual([...HISTORY_SEED_FILES]);
    for (const hash of Object.values(report.meta.historySeedFiles)) {
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    }

    // SHA-256 combinado = hash da concatenação bruta na ordem canônica.
    const concatenated = Buffer.concat(
      HISTORY_SEED_FILES.map((name) => fs.readFileSync(path.join(historyDir, name))),
    );
    expect(report.meta.historySeedSha256).toBe(
      createHash('sha256').update(concatenated).digest('hex'),
    );
  });
});

describe('modo gate (Fase 3)', () => {
  it('predicado: catálogo inteiro só a partir de N = 2.000, com override explícito', () => {
    expect(gateIncludesDeferred(GATE_RUNS - 1)).toBe(false);
    expect(gateIncludesDeferred(GATE_RUNS)).toBe(true);
    expect(gateIncludesDeferred(GATE_RUNS + 500)).toBe(true);
    expect(gateIncludesDeferred(100, false)).toBe(false);
    expect(gateIncludesDeferred(100, true)).toBe(true);
  });

  it('abaixo do gate sem override, o walk-forward segue declarado em deferred[]', () => {
    expect(report.summary.deferred).toBe(1);
    expect(report.deferred.map((d) => d.method)).toEqual([
      'walkForwardMulti (stabilityAnalysis)',
    ]);
  });

  it('com override, o relatório mede o walk-forward e deferred nasce vazio', () => {
    const gate = buildAuditReport({ runs: 50, includeDeferred: true, now: FIXED_NOW });
    const methods = gate.monteCarlo.map((r) => r.method);
    expect(methods).toContain('walkForwardMulti (stabilityAnalysis)');
    expect(methods).toHaveLength(smokeEntries().length + 1);
    expect(gate.deferred).toHaveLength(0);
    expect(gate.summary.measured).toBe(smokeEntries().length + 1);
    expect(gate.summary.deferred).toBe(0);
    for (const result of gate.monteCarlo) {
      expect(result.runs).toBe(50);
      expect(result.verdict).toBe(result.ci.upper <= result.bound ? 'PASS' : 'FAIL');
    }
  });

  it('o modo gate é determinístico: override repetido produz o mesmo digest', () => {
    const a = buildAuditReport({ runs: 50, includeDeferred: true, now: FIXED_NOW });
    const b = buildAuditReport({ runs: 50, includeDeferred: true, now: FIXED_NOW });
    expect(a.meta.contentSha256).toBe(b.meta.contentSha256);
    // Dois builds completos com runs:50 (~4 s no sandbox; runners de 2 vCPU
    // passam de 6 s) — headroom explícito acima do default de 5 s do vitest.
  }, 20_000);
});

describe('PDF do relatório', () => {
  it('é determinístico e estruturalmente válido (xref aponta para objetos)', () => {
    const a = renderAuditPdf(report);
    const b = renderAuditPdf(report);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);

    const text = Buffer.from(a).toString('latin1');
    expect(text.startsWith('%PDF-1.4\n')).toBe(true);
    expect(text.endsWith('%%EOF')).toBe(true);
    expect(text).toContain('/WinAnsiEncoding');

    // xref: cada entrada "n" aponta exatamente para um "obj".
    // Linhas: [0]='xref', [1]='0 N', [2]=entrada livre do objeto 0, [2+i]=obj i.
    const startxref = Number(
      text
        .slice(text.lastIndexOf('startxref') + 'startxref'.length)
        .trim()
        .split(/\s+/)[0],
    );
    expect(Number.isFinite(startxref)).toBe(true);
    const xrefLines = text.slice(startxref, startxref + 2000).split('\n');
    expect(xrefLines[0]).toBe('xref');
    const count = Number(xrefLines[1].split(' ')[1]);
    expect(count).toBeGreaterThanOrEqual(7);
    for (let i = 1; i < count; i++) {
      const entry = xrefLines[2 + i];
      expect(entry, `entrada ${i} do xref`).toMatch(/^[0-9]{10} 00000 n $/);
      const offset = Number(entry.slice(0, 10));
      expect(text.slice(offset, offset + 30)).toMatch(/^[0-9]+ 0 obj/);
    }
  });

  it('carrega identidade, vereditos e procedência no texto visível', () => {
    const text = Buffer.from(renderAuditPdf(report)).toString('latin1');
    expect(text).toContain('Relatório de Auditoria Estatística');
    expect(text).toContain('Wilson');
    expect(text).toContain('PASS');
    expect(text).toContain('Seed de histórico embutido');
    expect(text).toContain(report.meta.historySeedVersion);
    expect(text).toContain(report.meta.contentSha256.slice(0, 26));
  });
});
