#!/usr/bin/env node
/**
 * Launcher do relatório de auditoria estatística — Fase 2 do plano de
 * confiabilidade (docs/calibration-contract.md).
 *
 * Empacota o CLI TypeScript do motor de calibração com o esbuild (devDependency
 * do `web/`) em um arquivo temporário e o executa. A lógica inteira vive em
 * `web/src/engine/calibration/` — este launcher é só o elo entre o Node cru e
 * o TypeScript do motor, para que a auditoria rode de qualquer máquina com um
 * comando, a partir da raiz do repositório:
 *
 *   node scripts/audit-report.mjs --runs 2000
 *
 * Código de saída: 0 = dentro do contrato; 1 = violação; 2 = erro de ambiente.
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

const entry = path.join(webDir, 'src', 'engine', 'calibration', 'auditCli.ts');
const outfile = path.join(os.tmpdir(), `volante-audit-bundle-${process.pid}.mjs`);

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
  // O bundle roda do diretório temporário; a raiz do repo é injetada para a
  // identidade da auditoria (commit, versão, seed de histórico).
  globalThis.__AUDIT_REPO_ROOT__ = repoRoot;
  await import(pathToFileURL(outfile).href);
} finally {
  fs.rmSync(outfile, { force: true });
}
