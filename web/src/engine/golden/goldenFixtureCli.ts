import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  GOLDEN_LOTTERIES,
  buildGoldenFixture,
  goldenLotteryKey,
  serializeGoldenFixture,
} from './goldenFixture';

/**
 * CLI do gerador das fixtures douradas (Fase 4, frente 1 — paridade
 * web–Kotlin). Executado pelo launcher `scripts/generate-golden-fixtures.mjs`
 * (esbuild) ou diretamente sob runner TypeScript.
 *
 * Grava um JSON por modalidade em
 * `shared/src/commonTest/resources/golden/` — o diretório que o teste
 * dourado Kotlin lê como resource e o teste anti-deriva da web re-gera.
 * Determinístico: mesma árvore, mesmos bytes (o SHA-256 impresso serve de
 * registro público da versão da fixture).
 *
 * Uso:
 *   node scripts/generate-golden-fixtures.mjs [--out-dir D] [--check]
 *
 * `--check` não grava nada: re-gera e compara byte a byte com o que está
 * versionado (é o modo do teste anti-deriva; o flag existe para o CI e para
 * conferência manual). Código de saída: 0 ok; 1 divergiu; 2 erro de ambiente.
 */

const FIXTURES_RELATIVE_DIR = path.join('shared', 'src', 'commonTest', 'resources', 'golden');

declare global {
  // Injetado pelo launcher (mesma convenção do relatório de auditoria).
  var __AUDIT_REPO_ROOT__: string | undefined;
}

export function resolveRepoRoot(): string {
  const fromGlobal = globalThis.__AUDIT_REPO_ROOT__;
  if (fromGlobal) return fromGlobal;
  // Fallback para execução direta sob runner TypeScript a partir de web/.
  return path.resolve(process.cwd(), '..');
}

function sha256Hex(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

export interface GenerateResult {
  file: string;
  sha256: string;
  bytes: number;
  changed: boolean;
}

export function generateFixtures(options: {
  outDir: string;
  checkOnly: boolean;
}): GenerateResult[] {
  const results: GenerateResult[] = [];
  for (const lottery of GOLDEN_LOTTERIES) {
    const content = serializeGoldenFixture(buildGoldenFixture(lottery));
    const file = path.join(options.outDir, `${goldenLotteryKey(lottery)}.json`);
    const exists = fs.existsSync(file);
    const changed = !exists || fs.readFileSync(file, 'utf8') !== content;
    if (!options.checkOnly && changed) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content, 'utf8');
    }
    results.push({
      file: path.relative(resolveRepoRoot(), file),
      sha256: sha256Hex(content),
      bytes: Buffer.byteLength(content, 'utf8'),
      changed,
    });
  }
  return results;
}

export function main(argv: readonly string[] = process.argv.slice(2)): void {
  const checkOnly = argv.includes('--check');
  const outDirFlag = argv.indexOf('--out-dir');
  const outDir =
    outDirFlag >= 0 && argv[outDirFlag + 1]
      ? path.resolve(argv[outDirFlag + 1])
      : path.join(resolveRepoRoot(), FIXTURES_RELATIVE_DIR);

  if (checkOnly && !fs.existsSync(outDir)) {
    console.error(`--check: diretório de fixtures não existe: ${outDir}`);
    process.exitCode = 2;
    return;
  }

  const results = generateFixtures({ outDir, checkOnly });
  for (const r of results) {
    const status = checkOnly ? (r.changed ? 'DIVERGE' : 'ok') : r.changed ? 'gravado' : 'igual';
    console.log(`${status}  ${r.file}  ${r.bytes} B  sha256=${r.sha256}`);
  }
  if (checkOnly && results.some((r) => r.changed)) {
    console.error(
      'Fixtures douradas desatualizadas — rode `node scripts/generate-golden-fixtures.mjs` e revise o diff.',
    );
    process.exitCode = 1;
  }
}

if (process.env['VITEST'] === undefined) {
  try {
    main();
  } catch (error) {
    console.error(`Erro: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  }
}
