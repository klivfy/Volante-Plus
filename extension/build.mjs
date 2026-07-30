#!/usr/bin/env node
// Monta extension/dist/<target>/ (assets compartilhados + manifest específico)
// e empacota cada um em extension/dist/<target>.zip. Usa o binário `zip` do
// sistema (presente por padrão nos runners ubuntu-latest do GitHub Actions)
// em vez de trazer uma dependência npm só para isso.
import { existsSync, mkdirSync, rmSync, cpSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const sharedDir = path.join(root, 'shared');
const manifestsDir = path.join(root, 'manifests');
const distDir = path.join(root, 'dist');

const TARGETS = ['chrome', 'edge', 'firefox'];

rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });

for (const target of TARGETS) {
  const targetDir = path.join(distDir, target);
  mkdirSync(targetDir, { recursive: true });
  cpSync(sharedDir, targetDir, { recursive: true });
  copyFileSync(path.join(manifestsDir, `${target}.manifest.json`), path.join(targetDir, 'manifest.json'));

  const zipPath = path.join(distDir, `${target}.zip`);
  if (existsSync(zipPath)) rmSync(zipPath);
  execFileSync('zip', ['-r', '-X', `../${target}.zip`, '.'], { cwd: targetDir, stdio: 'inherit' });

  console.log(`OK ${target}: dist/${target}.zip`);
}
