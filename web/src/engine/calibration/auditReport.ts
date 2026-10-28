import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { historySeedVersion } from '../../data/history';
import type { ExactCheck } from './auditExact';
import type { CalibrationResult } from './runner';
import { runSmokeCalibration } from './runner';
import {
  FPR_TOLERANCE_PTS,
  GATE_RUNS,
  monteCarloEntries,
  SMOKE_SEED_BASE,
  SMOKE_TOLERANCE_PTS,
} from './catalog';
import { auditExactMethods } from './auditExact';

/**
 * Relatório de auditoria reciclável (Fase 2 do plano de confiabilidade).
 *
 * Transforma a medição da calibração em evidência registrada: executa o
 * harness com N configurável e produz o objeto completo do relatório —
 * identidade do commit, procedência do seed embutido de histórico, sementes
 * da simulação, FPR medido por método com IC de Wilson, veredito contra o
 * contrato, recomputação independente dos métodos exatos e um digest
 * SHA-256 do conteúdo determinístico.
 *
 * A regra de ouro: o relatório não é escrito à mão por ninguém. Ele nasce
 * do mesmo commit que audita, e qualquer pessoa o regenera com um comando —
 * mesmo commit + mesma semente = mesmo `contentSha256`, byte a byte.
 *
 * Honestidade: nada aqui torna sorteios previsíveis. Sorteios da Caixa são
 * eventos aleatórios independentes; o que este relatório prova é que as
 * promessas de significância do produto correspondem ao que o código entrega.
 */

/** Identificador de esquema do relatório (muda com quebra de formato). */
export const AUDIT_REPORT_SCHEMA = 'volante-plus/audit-report@1';

export interface AuditOptions {
  /** N de históricos honestos por método Monte Carlo. */
  runs: number;
  /** Semente base da simulação (padrão: a pública do contrato). */
  seedBase?: number;
  /** Raiz do repositório (padrão: detecção automática). */
  repoRoot?: string;
  /** Relógio injetável (testes). Não entra no digest de conteúdo. */
  now?: () => Date;
}

export interface AuditMeta {
  gitCommit: string | null;
  gitBranch: string | null;
  gitSubject: string | null;
  /** `null` quando git indisponível (ex.: execução a partir de um zip). */
  gitDirty: boolean | null;
  webVersion: string;
  nodeVersion: string;
  runs: number;
  historyLength: number;
  tolerancePoints: number;
  criterion: string;
  seedBase: number;
  seedBaseSha256: string;
  historySeedVersion: string;
  historySeedSha256: string;
  historySeedFiles: Record<string, string>;
  /** SHA-256 do conteúdo determinístico do relatório (ver docs). */
  contentSha256: string;
  /** Carimbo UTC da execução — o único campo fora do digest. */
  generatedAtUtc: string;
}

export interface DeferredMethod {
  method: string;
  alpha: number;
  reason: string;
}

export interface AuditSummary {
  measured: number;
  passed: number;
  failed: number;
  exactChecks: number;
  exactPassed: number;
  deferred: number;
  probeVerdict: 'FAIL (esperado)' | 'PASS (harness comprometido!)';
  allPass: boolean;
}

export interface AuditReport {
  schema: string;
  meta: AuditMeta;
  monteCarlo: CalibrationResult[];
  probe: CalibrationResult;
  deferred: DeferredMethod[];
  exact: ExactCheck[];
  summary: AuditSummary;
}

declare global {
  // Injetado pelo launcher `scripts/audit-report.mjs` (o bundle roda de um
  // diretório temporário; a raiz do repo vem do launcher).
  var __AUDIT_REPO_ROOT__: string | undefined;
}

/**
 * Raiz do repositório: injetada pelo launcher ou detectada subindo a partir
 * de `process.cwd()` até achar a pasta do motor de calibração.
 */
export function resolveRepoRoot(): string {
  const injected = globalThis.__AUDIT_REPO_ROOT__;
  if (injected) return injected;
  let dir = process.cwd();
  for (let depth = 0; depth < 8; depth++) {
    if (
      fs.existsSync(path.join(dir, 'web', 'src', 'engine', 'calibration', 'catalog.ts'))
    ) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `raiz do repositório não encontrada a partir de ${process.cwd()} — ` +
      'rode o relatório de dentro do repositório Volante-Plus',
  );
}

function sha256Hex(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

function git(args: string[], repoRoot: string): string | null {
  try {
    return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

/**
 * Tolerância do critério conforme o N: a partir do gate do contrato
 * (N = 2.000) vale a folga estreita de 2 p.p.; abaixo, a da fumaça
 * (5 p.p.). Nenhum valor é decidido aqui — vem de `catalog.ts`.
 */
export function auditTolerance(runs: number): number {
  return runs >= GATE_RUNS ? FPR_TOLERANCE_PTS : SMOKE_TOLERANCE_PTS;
}

/**
 * Arquivos do seed embutido de histórico (`web/src/data/history/`) na ordem
 * canônica da concatenação para o SHA-256 de procedência.
 */
export const HISTORY_SEED_FILES = [
  'maismilionaria.json',
  'megasena.json',
  'meta.json',
  'quina.json',
] as const;

interface HistorySeedProvenance {
  version: string;
  sha256: string;
  files: Record<string, string>;
}

/**
 * Procedência do seed embutido de histórico (`web/src/data/history/`):
 * SHA-256 por arquivo + SHA-256 da concatenação bruta dos arquivos na ordem
 * canônica acima. Conecta a calibração dos métodos à procedência dos dados
 * que os alimentam — a versão vem de `historySeedVersion()` (fonte única).
 */
function historySeedProvenance(repoRoot: string): HistorySeedProvenance {
  const dir = path.join(repoRoot, 'web', 'src', 'data', 'history');
  const files: Record<string, string> = {};
  const chunks: Buffer[] = [];
  for (const name of HISTORY_SEED_FILES) {
    const bytes = fs.readFileSync(path.join(dir, name));
    files[name] = sha256Hex(bytes);
    chunks.push(bytes);
  }
  return {
    version: historySeedVersion(),
    sha256: sha256Hex(Buffer.concat(chunks)),
    files,
  };
}

function buildMetaCore(options: Required<Pick<AuditOptions, 'runs' | 'seedBase'>> & {
  repoRoot: string;
  tolerancePoints: number;
}): {
  metaCore: Omit<AuditMeta, 'generatedAtUtc' | 'contentSha256'>;
} {
  const { runs, seedBase, repoRoot, tolerancePoints } = options;
  const webPackage = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'web', 'package.json'), 'utf8'),
  ) as { version?: string };
  const commit = git(['rev-parse', 'HEAD'], repoRoot);
  const porcelain = git(['status', '--porcelain'], repoRoot);
  const seed = historySeedProvenance(repoRoot);

  const metaCore: Omit<AuditMeta, 'generatedAtUtc' | 'contentSha256'> = {
    gitCommit: commit,
    gitBranch: git(['rev-parse', '--abbrev-ref', 'HEAD'], repoRoot),
    gitSubject: git(['log', '-1', '--pretty=%s'], repoRoot),
    gitDirty: porcelain === null ? null : porcelain.length > 0,
    webVersion: webPackage.version ?? 'desconhecida',
    nodeVersion: process.version,
    runs,
    historyLength: 400,
    tolerancePoints,
    criterion:
      `limite superior do IC de Wilson 95% do FPR <= alfa + ` +
      `${tolerancePoints} p.p. (docs/calibration-contract.md)`,
    seedBase,
    seedBaseSha256: sha256Hex(String(seedBase)),
    historySeedVersion: seed.version,
    historySeedSha256: seed.sha256,
    historySeedFiles: seed.files,
  };
  return { metaCore };
}

/**
 * Constrói o relatório completo. Determinístico no conteúdo: mesmas
 * `options` + mesmo commit = mesmo `contentSha256` (o carimbo UTC fica
 * fora do digest por construção).
 */
export function buildAuditReport(options: AuditOptions): AuditReport {
  const runs = options.runs;
  if (!Number.isInteger(runs) || runs <= 0) {
    throw new RangeError(`runs deve ser inteiro positivo (recebido: ${runs})`);
  }
  const repoRoot = options.repoRoot ?? resolveRepoRoot();
  const seedBase = options.seedBase ?? SMOKE_SEED_BASE;
  const tolerancePoints = auditTolerance(runs);

  const smoke = runSmokeCalibration({
    runs,
    seedBase,
    tolerancePts: tolerancePoints,
  });
  const { metaCore } = buildMetaCore({ runs, seedBase, repoRoot, tolerancePoints });

  // Métodos monte-carlo fora da fumaça (adaptador custoso por histórico):
  // ficam registrados como adidos ao gate de CI (Fase 3) — ausência
  // declarada, nunca silenciosa.
  const deferred: DeferredMethod[] = monteCarloEntries()
    .filter((entry) => !entry.smoke)
    .map((entry) => ({
      method: entry.method,
      alpha: entry.alpha ?? Number.NaN,
      reason: 'medido apenas no gate de CI (Fase 3): adaptador custoso por histórico',
    }));

  const exact = auditExactMethods();

  const mcPassed = smoke.results.filter((r) => r.verdict === 'PASS').length;
  const exactPassed = exact.filter((c) => c.pass).length;
  const probeHealthy = smoke.probe.verdict === 'FAIL';
  const summary: AuditSummary = {
    measured: smoke.results.length,
    passed: mcPassed,
    failed: smoke.results.length - mcPassed,
    exactChecks: exact.length,
    exactPassed,
    deferred: deferred.length,
    probeVerdict: probeHealthy ? 'FAIL (esperado)' : 'PASS (harness comprometido!)',
    allPass:
      mcPassed === smoke.results.length &&
      exactPassed === exact.length &&
      probeHealthy,
  };

  // Digest do conteúdo determinístico: tudo, exceto o carimbo UTC. A ordem
  // de inserção das chaves é parte da canonização — construir sempre na
  // mesma ordem (metaCore sem os dois últimos campos, que entram depois).
  const digest = sha256Hex(
    JSON.stringify({
      schema: AUDIT_REPORT_SCHEMA,
      meta: metaCore,
      monteCarlo: smoke.results,
      probe: smoke.probe,
      deferred,
      exact,
      summary,
    }),
  );

  const nowFn = options.now ?? ((): Date => new Date());
  const generatedAtUtc = nowFn().toISOString().replace(/\.\d{3}Z$/, 'Z');

  return {
    schema: AUDIT_REPORT_SCHEMA,
    meta: { ...metaCore, generatedAtUtc, contentSha256: digest },
    monteCarlo: smoke.results,
    probe: smoke.probe,
    deferred,
    exact,
    summary,
  };
}
