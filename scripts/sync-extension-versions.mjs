#!/usr/bin/env node

/**
 * Sync version across all browser extension manifests.
 * Usage: node scripts/sync-extension-versions.mjs <version>
 * Example: node scripts/sync-extension-versions.mjs 2.1.0
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
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node sync-extension-versions.mjs <version>');
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

async function main() {
  const version = getVersion();
  validateVersion(version);

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
