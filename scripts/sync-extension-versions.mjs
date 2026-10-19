#!/usr/bin/env node

/**
 * Sync version across all browser extension manifests.
 * Usage: node scripts/sync-extension-versions.mjs <version>
 * Example: node scripts/sync-extension-versions.mjs 2.1.0
 *
 * Modo conferência (não escreve nada; falha se qualquer manifest divergir):
 *   node scripts/sync-extension-versions.mjs --check <version>
 * Usado no CI para garantir que tag e manifests nunca saiam dessincronizados
 * (um release `web-vX.Y.Z` precisa empacotar zips rotulados X.Y.Z).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const MANIFEST_PATHS = [
  'extension/manifests/chrome.manifest.json',
  'extension/manifests/edge.manifest.json',
  'extension/manifests/firefox.manifest.json',
];

function getVersion() {
  const args = process.argv.slice(2).filter((arg) => arg !== '--check');
  if (args.length === 0) {
    console.error('Usage: node sync-extension-versions.mjs [--check] <version>');
    console.error('Example: node sync-extension-versions.mjs 2.1.0');
    process.exit(1);
  }
  return args[0];
}

function validateVersion(version) {
  const semverRegex = /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/;
  if (!semverRegex.test(version)) {
    console.error(`❌ Invalid version format: ${version}`);
    console.error('Expected format: MAJOR.MINOR.PATCH (e.g., 2.1.0)');
    process.exit(1);
  }
}

function readManifestVersion(filePath) {
  const fullPath = path.resolve(projectRoot, filePath);

  if (!fs.existsSync(fullPath)) {
    console.error(`❌ File not found: ${fullPath}`);
    process.exit(1);
  }

  return JSON.parse(fs.readFileSync(fullPath, 'utf-8')).version;
}

function updateManifest(filePath, version) {
  const fullPath = path.resolve(projectRoot, filePath);

  if (!fs.existsSync(fullPath)) {
    console.error(`❌ File not found: ${fullPath}`);
    return false;
  }

  try {
    const content = fs.readFileSync(fullPath, 'utf-8');
    const manifest = JSON.parse(content);

    const oldVersion = manifest.version;
    manifest.version = version;

    fs.writeFileSync(fullPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');

    console.log(`✅ ${filePath}: ${oldVersion} → ${version}`);
    return true;
  } catch (error) {
    console.error(`❌ Error updating ${filePath}:`, error.message);
    return false;
  }
}

function checkVersions(version) {
  console.log(`🔎 Conferindo manifests da extensão contra ${version}\n`);

  const mismatches = [];
  for (const filePath of MANIFEST_PATHS) {
    const current = readManifestVersion(filePath);
    const ok = current === version;
    console.log(`${ok ? '✅' : '❌'} ${filePath}: ${current}`);
    if (!ok) mismatches.push({ filePath, current });
  }

  if (mismatches.length > 0) {
    console.error(`\n❌ ${mismatches.length} manifest(s) fora da versão ${version}.`);
    console.error(`   Rode: node scripts/sync-extension-versions.mjs ${version}`);
    console.error('   e commite as mudanças junto com o bump de versão do release.');
    process.exit(1);
  }

  console.log(`\n✨ Todos os manifests estão na versão ${version}.`);
  process.exit(0);
}

async function main() {
  const checkFlag = process.argv.includes('--check');
  const version = getVersion();
  validateVersion(version);

  if (checkFlag) {
    checkVersions(version);
    return;
  }

  console.log(`📦 Syncing extension manifests to version ${version}\n`);

  const results = MANIFEST_PATHS.map(filePath => updateManifest(filePath, version));

  if (results.every(r => r)) {
    console.log(`\n✨ All manifests updated successfully!`);
    process.exit(0);
  } else {
    console.error('\n❌ Some updates failed');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
