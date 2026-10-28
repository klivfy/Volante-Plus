#!/usr/bin/env node
/**
 * Launcher do gerador das fixtures douradas de paridade web–Kotlin — Fase 4
 * do plano de confiabilidade (frente 1, testes dourados).
 *
 * Mesma mecânica do `audit-report.mjs`: empacota o CLI TypeScript do motor
 * com o esbuild (devDependency de `web/`) num arquivo temporário e executa.
 * A lógica vive em `web/src/engine/golden/`; este launcher é o elo entre o
 * Node cru e o TypeScript, para que a geração rode de qualquer máquina com
 * um comando, a partir da raiz do repositório:
 *
 *   node scripts/generate-golden-fixtures.mjs           # grava/atualiza
 *   node scripts/generate-golden-fixtures.mjs --check   # só confere (CI)
 *
 * Código de saída: 0 ok; 1 fixtures divergem do versionado (--check);
 * 2 erro de ambiente.
 */

import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const webDir = path.join(repoRoot, 'web');

let esbuild;
try {
  esbuild = createRequire(path.join(webDir, 'package.json'))('esbuild');
} catch {
  console.error(
    'esbuild não encontrado — é devDependency de web/. Rode `npm ci` dentro de web/ e tente de novo.',
  );
  process.exit(2);
}

const entry = path.join(webDir, 'src', 'engine', 'golden', 'goldenFixtureCli.ts');
const outfile = path.join(os.tmpdir(), `volante-golden-bundle-${process.pid}.mjs`);

try {
  await esbuild.build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    logLevel: 'warning',
  });
  // O bundle roda do diretório temporário; a raiz do repo é injetada para
  // localizar shared/src/commonTest/resources/golden/.
  globalThis.__AUDIT_REPO_ROOT__ = repoRoot;
  await import(pathToFileURL(outfile).href);
} finally {
  fs.rmSync(outfile, { force: true });
}
