import fs from 'node:fs';
import path from 'node:path';
import type { AuditReport } from './auditReport';
import { renderAuditPdf, pctPtBr } from './auditPdf';
import { buildAuditReport, resolveRepoRoot } from './auditReport';
import { SMOKE_SEED_BASE } from './catalog';

/**
 * CLI do relatório de auditoria (Fase 2 do plano de confiabilidade).
 *
 * Executado pelo launcher `scripts/audit-report.mjs` (que empacota este
 * módulo com esbuild), ou diretamente sob um runner TypeScript. Escreve o
 * JSON estruturado e o PDF legível, imprime o resumo no console e devolve
 * código de saída 0 só quando a auditoria inteira passa — o mesmo comando
 * vira o gate da Fase 3 sem adaptação.
 *
 * Uso:
 *   node scripts/audit-report.mjs [--runs N] [--out-dir D] [--json F]
 *        [--pdf F] [--seed-base N]
 */

interface CliArgs {
  runs: number;
  outDir: string;
  jsonPath: string | null;
  pdfPath: string | null;
  seedBase: number;
  help: boolean;
}

function parseArgs(argv: readonly string[]): CliArgs {
  const args: CliArgs = {
    runs: 2000,
    outDir: 'audit-reports',
    jsonPath: null,
    pdfPath: null,
    seedBase: SMOKE_SEED_BASE,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const value = (flag: string): string => {
      const v = argv[i + 1];
      if (v === undefined) {
        throw new Error(`flag ${flag} exige um valor`);
      }
      i += 1;
      return v;
    };
    switch (argv[i]) {
      case '--runs':
        args.runs = Number(value('--runs'));
        break;
      case '--out-dir':
        args.outDir = value('--out-dir');
        break;
      case '--json':
        args.jsonPath = value('--json');
        break;
      case '--pdf':
        args.pdfPath = value('--pdf');
        break;
      case '--seed-base':
        args.seedBase = Number(value('--seed-base'));
        break;
      case '--help':
      case '-h':
        args.help = true;
        break;
      default:
        throw new Error(`argumento desconhecido: ${argv[i]} (use --help)`);
    }
  }
  if (!Number.isInteger(args.runs) || args.runs <= 0) {
    throw new Error(`--runs deve ser inteiro positivo (recebido: ${args.runs})`);
  }
  return args;
}

function printHelp(): void {
  process.stdout.write(
    'Relatório de auditoria estatística — Volante Plus (Fase 2)\n\n' +
      'Uso: node scripts/audit-report.mjs [opções]\n\n' +
      '  --runs N       históricos honestos por método (padrão 2000 = gate do contrato)\n' +
      '  --out-dir D    diretório de saída (padrão audit-reports/)\n' +
      '  --json F       caminho exato do JSON (padrão audit-<data UTC>.json)\n' +
      '  --pdf F        caminho exato do PDF (padrão audit-<data UTC>.pdf)\n' +
      '  --seed-base N  semente base da simulação (padrão: a pública do contrato)\n' +
      '  -h, --help     esta ajuda\n\n' +
      'Código de saída: 0 = todos os vereditos dentro do contrato; 1 = violação; 2 = erro.\n',
  );
}

// '2026-10-28T14:55:01Z' -> '20261028T145501Z' (remove ':' e '-' dos caminhos)
function fileStamp(generatedAtUtc: string): string {
  return generatedAtUtc.replace(/[:-]/g, '');
}

function printSummary(report: AuditReport, jsonPath: string, pdfPath: string): void {
  const meta = report.meta;
  process.stdout.write(
    '\nRelatório de auditoria — Volante Plus\n' +
      `  commit: ${meta.gitCommit ? meta.gitCommit.slice(0, 12) : 'indisponível'}` +
      `${meta.gitBranch ? ` (${meta.gitBranch})` : ''}\n` +
      `  execução UTC: ${meta.generatedAtUtc} — N = ${meta.runs} — ` +
      `tolerância: alfa + ${meta.tolerancePoints} p.p.\n` +
      `  seed base: ${meta.seedBase} (SHA-256 ${meta.seedBaseSha256.slice(0, 16)}...)\n` +
      `  seed de histórico: versão ${meta.historySeedVersion} ` +
      `(SHA-256 ${meta.historySeedSha256.slice(0, 16)}...)\n\n`,
  );
  const width = Math.max(
    ...report.monteCarlo.map((r) => r.method.length),
    report.probe.method.length,
  );
  for (const result of report.monteCarlo) {
    const verdict = result.verdict === 'PASS' ? 'PASS' : 'FAIL';
    process.stdout.write(
      `  ${result.method.padEnd(width)}  FPR ${pctPtBr(result.fpr).padStart(6)}  ` +
        `IC [${pctPtBr(result.ci.lower)}; ${pctPtBr(result.ci.upper)}]  ` +
        `${verdict}\n`,
    );
  }
  process.stdout.write(
    `  ${report.probe.method.padEnd(width)}  FPR ${pctPtBr(report.probe.fpr).padStart(6)}  ` +
      `${report.probe.verdict === 'FAIL' ? 'FAIL (esperado)' : 'PASS — HARNESS COMPROMETIDO'}\n`,
  );
  for (const check of report.exact) {
    process.stdout.write(
      `  ${check.method.padEnd(width)}  ${check.pass ? 'PASS' : 'FAIL'} — ${check.detail}\n`,
    );
  }
  for (const deferred of report.deferred) {
    process.stdout.write(`  ${deferred.method.padEnd(width)}  adido ao gate de CI (Fase 3)\n`);
  }
  process.stdout.write(
    `\n  veredito: ${report.summary.allPass ? 'TODOS DENTRO DO CONTRATO' : 'CONTRATO VIOLADO'}\n` +
      `  conteúdo SHA-256: ${report.meta.contentSha256}\n` +
      `  JSON: ${jsonPath}\n  PDF:  ${pdfPath}\n`,
  );
}

export function main(argv: readonly string[] = process.argv.slice(2)): void {
  const args = parseArgs(argv);
  if (args.help) {
    printHelp();
    return;
  }
  const repoRoot = resolveRepoRoot();
  const outDir = path.isAbsolute(args.outDir)
    ? args.outDir
    : path.join(repoRoot, args.outDir);
  fs.mkdirSync(outDir, { recursive: true });

  const report = buildAuditReport({
    runs: args.runs,
    seedBase: args.seedBase,
    repoRoot,
  });

  const stamp = fileStamp(report.meta.generatedAtUtc);
  const jsonPath = args.jsonPath ?? path.join(outDir, `audit-${stamp}.json`);
  const pdfPath = args.pdfPath ?? path.join(outDir, `audit-${stamp}.pdf`);

  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  fs.writeFileSync(pdfPath, renderAuditPdf(report), 'latin1');

  printSummary(report, jsonPath, pdfPath);
  process.exitCode = report.summary.allPass ? 0 : 1;
}

if (process.env['VITEST'] === undefined) {
  try {
    main();
  } catch (error) {
    console.error(`Erro: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  }
}
