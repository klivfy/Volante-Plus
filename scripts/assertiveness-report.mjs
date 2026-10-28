#!/usr/bin/env node
/**
 * Launcher do relatório de assertividade do motor de geração.
 *
 * Empacota o CLI TypeScript (`web/src/engine/assertiveness/cli.ts`) com o
 * esbuild (devDependency do `web/`) e o executa — o mesmo padrão do
 * `audit-report.mjs`. Roda de qualquer máquina com um comando, a partir da
 * raiz do repositório:
 *
 *   node scripts/assertiveness-report.mjs
 *   node scripts/assertiveness-report.mjs --runs 50000 --out-dir /tmp/x
 *
 * Código de saída: 0 = todos os veredictos confirmados; 1 = veredicto
 * reprovado; 2 = erro de ambiente.
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

const entry = path.join(webDir, 'src', 'engine', 'assertiveness', 'cli.ts');
const outfile = path.join(os.tmpdir(), `volante-assertiveness-${process.pid}.mjs`);

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
  await import(pathToFileURL(outfile).href);
} finally {
  fs.rmSync(outfile, { force: true });
}
