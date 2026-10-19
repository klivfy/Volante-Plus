#!/usr/bin/env node
// Monta extension/dist/<target>/ (popup estático + background.js + ícones +
// manifest específico) e empacota cada um em extension/dist/<target>.zip.
// Usa o binário `zip` do sistema (presente por padrão nos runners
// ubuntu-latest do GitHub Actions); quando ele não existe — o caso de
// máquinas Windows de desenvolvimento — cai no compactador puro
// (`lib/zip-fallback.mjs`), sem dependências.
import { existsSync, mkdirSync, rmSync, cpSync, copyFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as esbuild from 'esbuild';
import { zipDirectory } from './lib/zip-fallback.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const sharedIconsDir = path.join(root, 'shared', 'icons');
const manifestsDir = path.join(root, 'manifests');
const distDir = path.join(root, 'dist');
const popupAppDir = path.join(root, 'popup-app');
const popupOutDir = path.join(popupAppDir, 'out');
const backgroundEntry = path.join(root, 'src', 'background.ts');

const ALL_TARGETS = ['chrome', 'edge', 'firefox'];

const targetArg = process.argv.find((arg) => arg.startsWith('--target='));
const targets = targetArg ? [targetArg.slice('--target='.length)] : ALL_TARGETS;

for (const target of targets) {
  if (!ALL_TARGETS.includes(target)) {
    console.error(`Alvo desconhecido: "${target}". Use um de: ${ALL_TARGETS.join(', ')}.`);
    process.exit(1);
  }
}

console.log('Compilando o popup (Next.js, export estático)...');
// WHY shell no Windows: o `npm` do PATH é um shim `.cmd`, que o
// `execFileSync` só executa através do shell — o mesmo build quebraria em
// qualquer máquina Windows de desenvolvimento (no CI ubuntu o binário é o
// script sh e roda sem shell).
execFileSync('npm', ['run', 'build'], {
  cwd: popupAppDir,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (!existsSync(popupOutDir) || readdirSync(popupOutDir).length === 0) {
  console.error(`Export do popup não gerou nada em ${popupOutDir}.`);
  process.exit(1);
}

console.log('Empacotando o service worker de background (esbuild)...');
await esbuild.build({
  entryPoints: [backgroundEntry],
  bundle: true,
  format: 'iife',
  target: ['chrome100', 'firefox115'],
  outfile: path.join(root, '.background-build.js'),
  // Mesma leitura tardia de `process.env.NEXT_PUBLIC_CAIXA_API_BASE_URL` que
  // `caixaApi.ts` usa no app web, mas o bundle da extensão não passa pelo
  // pipeline do Next.js que normalmente substitui isso — sem este `define`,
  // o service worker referenciaria um `process` inexistente em runtime.
  define: {
    'process.env.NEXT_PUBLIC_CAIXA_API_BASE_URL': 'undefined',
  },
});
const backgroundBuiltPath = path.join(root, '.background-build.js');

rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });

for (const target of targets) {
  const targetDir = path.join(distDir, target);
  mkdirSync(targetDir, { recursive: true });

  // Popup na raiz do pacote (não numa subpasta): o export do Next referencia
  // assets com caminho absoluto (`/_next/...`), resolvido contra a raiz da
  // origin `chrome-extension://<id>/` — ver `popup-app/next.config.ts`.
  cpSync(popupOutDir, targetDir, { recursive: true });
  cpSync(sharedIconsDir, path.join(targetDir, 'icons'), { recursive: true });
  copyFileSync(backgroundBuiltPath, path.join(targetDir, 'background.js'));
  copyFileSync(path.join(manifestsDir, `${target}.manifest.json`), path.join(targetDir, 'manifest.json'));

  const zipPath = path.join(distDir, `${target}.zip`);
  if (existsSync(zipPath)) rmSync(zipPath);
  try {
    execFileSync('zip', ['-r', '-X', `../${target}.zip`, '.'], { cwd: targetDir, stdio: 'inherit' });
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    console.log(`  (binário \`zip\` ausente — usando compactador puro para ${target})`);
    zipDirectory(targetDir, zipPath);
  }

  console.log(`OK ${target}: dist/${target}.zip`);
}

rmSync(backgroundBuiltPath, { force: true });
