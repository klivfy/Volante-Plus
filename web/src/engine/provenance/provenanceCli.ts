import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { HISTORY_SEED_META, loadHistorySeed } from '../../data/history';
import { Draw, Lottery } from '../../types/domain';
import { defaultSources } from '../../services/drawSources';
import { HISTORY_SEED_FILES } from '../calibration/auditReport';
import {
  ALL_LOTTERIES,
  MIRROR_SNAPSHOT,
  PROVENANCE_SCHEMA,
  compareOnlineSources,
  offlineDivergences,
  onlineDivergences,
  verifyLotteryProvenance,
  type LotteryOnlineVerdict,
  type LotteryProvenanceVerdict,
} from './provenanceCore';

/**
 * CLI da procedência automatizada (Fase 4, frente 2). Executado pelo
 * launcher `scripts/provenance-check.mjs` (esbuild) ou direto sob runner
 * TypeScript; o workflow `provenance.yml` o agenda semanalmente, a cada
 * push nos dados e sob demanda.
 *
 * Duas camadas, com semântica de falha distinta:
 *
 * - **Offline (sempre)**: seed embutido contra as regras da modalidade e
 *   contra o espelho independente versionado (`data/mirrorSnapshot/`) — a
 *   mesma conferência do `update-history-seed.mjs`, refeita de fora, mais
 *   a procedência SHA-256 do seed (por arquivo e concatenação canônica).
 * - **Online (padrão; `--offline` pula)**: busca o concurso mais recente em
 *   cada fonte configurada do app e cruza: fontes que discordam entre si
 *   para o MESMO concurso, ou que devolvem resultado divergente do seed
 *   para concurso que o seed já tem, ACENDEM o alarme. Fonte que não
 *   responde é indisponibilidade declarada no relatório — nunca falha (o
 *   gate agendado não pode tremer por rede).
 *
 * Saída: JSON em `provenance-reports/` + resumo no console.
 * Código de saída: 0 = sem divergência; 1 = divergência detectada (alarme);
 * 2 = erro de ambiente (arquivo ausente, git falhou etc.).
 */

declare global {
  // Injetado pelo launcher (convenção do relatório de auditoria).
  var __PROVENANCE_REPO_ROOT__: string | undefined;
}

export function resolveRepoRoot(): string {
  const fromGlobal = globalThis.__PROVENANCE_REPO_ROOT__;
  if (fromGlobal) return fromGlobal;
  return path.resolve(process.cwd(), '..');
}

function sha256Hex(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

function git(args: readonly string[], cwd: string): string | null {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim() || null;
  } catch {
    return null;
  }
}

export interface ProvenanceReport {
  schema: string;
  meta: {
    generatedAtUtc: string;
    gitCommit: string | null;
    gitBranch: string | null;
    gitSubject: string | null;
    gitDirty: boolean | null;
    webVersion: string;
    nodeVersion: string;
    seedVersion: string;
    seedSha256: string;
    seedFiles: Record<string, string>;
    onlineEnabled: boolean;
  };
  offline: {
    ok: boolean;
    lotteries: LotteryProvenanceVerdict[];
  };
  online: {
    enabled: boolean;
    ok: boolean;
    /** 'verificado' | 'nenhuma-fonte-respondeu' | 'desativado' */
    note: string;
    lotteries: LotteryOnlineVerdict[];
  } | null;
  divergences: Array<{ lottery: string; check: string; detail: string }>;
  ok: boolean;
}

/** Procedência SHA-256 do seed embutido (mesmo algoritmo da auditoria). */
export function seedProvenance(repoRoot: string): { version: string; sha256: string; files: Record<string, string> } {
  const dir = path.join(repoRoot, 'web', 'src', 'data', 'history');
  const files: Record<string, string> = {};
  const chunks: Buffer[] = [];
  for (const name of HISTORY_SEED_FILES) {
    const bytes = fs.readFileSync(path.join(dir, name));
    files[name] = sha256Hex(bytes);
    chunks.push(bytes);
  }
  return {
    version: `${HISTORY_SEED_META[Lottery.MEGA_SENA].lastContest}-${HISTORY_SEED_META[Lottery.MAIS_MILIONARIA].lastContest}-${HISTORY_SEED_META[Lottery.QUINA].lastContest}`,
    sha256: sha256Hex(Buffer.concat(chunks)),
    files,
  };
}

async function fetchLatestPerSource(
  lottery: Lottery,
): Promise<Array<{ source: string; draw: Draw | null }>> {
  const sources = defaultSources();
  return Promise.all(
    sources.map(async (source) => ({
      source: source.name,
      draw: await source.latest(lottery).catch(() => null),
    })),
  );
}

export async function buildProvenanceReport(options: {
  repoRoot: string;
  online: boolean;
}): Promise<ProvenanceReport> {
  const { repoRoot, online } = options;
  const webPackage = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'web', 'package.json'), 'utf8'),
  ) as { version?: string };

  const seed = seedProvenance(repoRoot);
  const porcelain = git(['status', '--porcelain'], repoRoot);

  const meta: ProvenanceReport['meta'] = {
    generatedAtUtc: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    gitCommit: git(['rev-parse', 'HEAD'], repoRoot),
    gitBranch: git(['rev-parse', '--abbrev-ref', 'HEAD'], repoRoot),
    gitSubject: git(['log', '-1', '--pretty=%s'], repoRoot),
    gitDirty: porcelain === null ? null : porcelain.length > 0,
    webVersion: webPackage.version ?? 'desconhecida',
    nodeVersion: process.version,
    seedVersion: seed.version,
    seedSha256: seed.sha256,
    seedFiles: seed.files,
    onlineEnabled: online,
  };

  const offlineLotteries: LotteryProvenanceVerdict[] = [];
  const divergences: ProvenanceReport['divergences'] = [];

  for (const lottery of ALL_LOTTERIES) {
    const seedDraws = await loadHistorySeed(lottery);
    const metaLottery = HISTORY_SEED_META[lottery];
    const verdict = verifyLotteryProvenance(
      lottery,
      seedDraws,
      metaLottery,
      MIRROR_SNAPSHOT[lottery],
    );
    offlineLotteries.push(verdict);
    for (const d of offlineDivergences(verdict, metaLottery)) {
      divergences.push({ lottery: d.lottery, check: d.check, detail: d.detail });
    }
  }

  let onlineSection: ProvenanceReport['online'] = null;
  if (online) {
    const onlineLotteries: LotteryOnlineVerdict[] = [];
    let anyResponsive = false;
    for (const lottery of ALL_LOTTERIES) {
      const seedDraws = await loadHistorySeed(lottery);
      const results = await fetchLatestPerSource(lottery);
      const verdict = compareOnlineSources(lottery, results, seedDraws);
      onlineLotteries.push(verdict);
      if (verdict.responsiveSources > 0) anyResponsive = true;
      for (const d of onlineDivergences(verdict)) {
        divergences.push({ lottery: d.lottery, check: d.check, detail: d.detail });
      }
    }
    onlineSection = {
      enabled: true,
      ok: !divergences.some((d) => d.check === 'fontes'),
      note: anyResponsive ? 'verificado' : 'nenhuma-fonte-respondeu',
      lotteries: onlineLotteries,
    };
  }

  return {
    schema: PROVENANCE_SCHEMA,
    meta,
    offline: { ok: !divergences.some((d) => d.check !== 'fontes'), lotteries: offlineLotteries },
    online: onlineSection,
    divergences,
    ok: divergences.length === 0,
  };
}

function printSummary(report: ProvenanceReport): void {
  console.log(`Procedência do histórico — ${report.meta.generatedAtUtc}`);
  console.log(`  commit: ${report.meta.gitCommit ?? 'desconhecido'}${report.meta.gitDirty ? ' (árvore suja)' : ''}`);
  console.log(`  seed: versão ${report.meta.seedVersion}, sha256=${report.meta.seedSha256.slice(0, 16)}…`);
  for (const lot of report.offline.lotteries) {
    const flags: string[] = [];
    if (!lot.contiguous) flags.push('NÃO-CONTÍGUO');
    if (lot.structurallyInvalid.length > 0) flags.push(`${lot.structurallyInvalid.length} fora das regras`);
    if (lot.mirrorDivergences.length > 0) flags.push(`${lot.mirrorDivergences.length} divergência(ns) do espelho`);
    if (lot.missingFromSeed.length > 0) flags.push(`${lot.missingFromSeed.length} ausentes do seed`);
    console.log(
      `  offline ${lot.lottery}: ${lot.seedContests} concursos, ${lot.mirrorCompared} comparados ao espelho` +
        (flags.length > 0 ? ` — ${flags.join('; ')}` : ' — ok'),
    );
  }
  if (report.online) {
    for (const lot of report.online.lotteries) {
      const sources = lot.sources.map((s) => `${s.source}:${s.status}`).join(', ');
      console.log(
        `  online ${lot.lottery}: ${lot.responsiveSources} fonte(s) respondeu(ram), ` +
          `${lot.newContestsBeyondSeed} concurso(s) além do seed — ${sources || 'sem fontes'}`,
      );
    }
    console.log(`  online: ${report.online.note}`);
  }
  if (report.ok) {
    console.log('RESULTADO: 0 divergências — procedência íntegra.');
  } else {
    console.log(`RESULTADO: ${report.divergences.length} divergência(s):`);
    for (const d of report.divergences) {
      console.log(`  [${d.check}] ${d.lottery}: ${d.detail}`);
    }
  }
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  const offlineOnly = argv.includes('--offline');
  const noSave = argv.includes('--no-save');
  const outDirFlag = argv.indexOf('--out-dir');
  const repoRoot = resolveRepoRoot();
  const outDir =
    outDirFlag >= 0 && argv[outDirFlag + 1]
      ? path.resolve(argv[outDirFlag + 1])
      : path.join(repoRoot, 'provenance-reports');

  const report = await buildProvenanceReport({ repoRoot, online: !offlineOnly });
  printSummary(report);

  if (!noSave) {
    fs.mkdirSync(outDir, { recursive: true });
    const stamp = report.meta.generatedAtUtc.replace(/[-:]/g, '').replace('T', 'T').slice(0, 15);
    const jsonPath = path.join(outDir, `provenance-${stamp}Z.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
    console.log(`  relatório: ${path.relative(repoRoot, jsonPath)}`);
  }
  process.exitCode = report.ok ? 0 : 1;
}

if (process.env['VITEST'] === undefined) {
  main().catch((error: unknown) => {
    console.error(`Erro: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  });
}
