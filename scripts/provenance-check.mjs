#!/usr/bin/env node
/**
 * Launcher da verificação de procedência do histórico — Fase 4 do plano de
 * confiabilidade (frente 2). Mesma mecânica dos launchers da auditoria e
 * das fixtures douradas: empacota o CLI TypeScript com o esbuild
 * (devDependency de `web/`) num arquivo temporário e o executa. A lógica
 * vive em `web/src/engine/provenance/` — este launcher é o elo entre o Node
 * cru e o TypeScript, para que a verificação rode de qualquer máquina com
 * um comando, a partir da raiz do repositório:
 *
 *   node scripts/provenance-check.mjs              # offline + fontes ao vivo
 *   node scripts/provenance-check.mjs --offline    # só seed × espelho versionado
 *
 * Código de saída: 0 = sem divergência; 1 = divergência detectada (alarme
 * do workflow); 2 = erro de ambiente.
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

const entry = path.join(webDir, 'src', 'engine', 'provenance', 'provenanceCli.ts');
const outfile = path.join(os.tmpdir(), `volante-provenance-bundle-${process.pid}.mjs`);

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
  // localizar web/src/data/ e a identidade git.
  globalThis.__PROVENANCE_REPO_ROOT__ = repoRoot;
  await import(pathToFileURL(outfile).href);
} finally {
  fs.rmSync(outfile, { force: true });
}
