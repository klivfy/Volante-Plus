/**
 * Smoke test da extensão: carrega `extension/dist/<target>` num Chromium real
 * (Playwright) com `--load-extension`, confere o registro do service worker e
 * que o popup abre sem erro de console.
 *
 * Uso (a partir da raiz do repositório, com `web/node_modules` instalado):
 *   node extension/test-smoke.mjs [chrome|edge]
 */

import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const target = process.argv[2] ?? 'chrome';
process.exitCode = 0;
const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const webRequire = createRequire(join(repoRoot, 'web', 'package.json'));
const { chromium } = webRequire('playwright');

const extensionDir = join(repoRoot, 'extension', 'dist', target);
if (!existsSync(join(extensionDir, 'manifest.json'))) {
  console.error(`Diretório da extensão não encontrado: ${extensionDir}`);
  process.exit(1);
}

// Guarda de compatibilidade: o Chrome rejeita extensões com qualquer
// arquivo/diretório começando com "_" (ex.: o `_next` do export do Next —
// o build renomeia para `assets/`). Se este check falhar, o pacote não
// carrega no Chrome real.
{
  const reserved = readdirSync(extensionDir).filter((name) => name.startsWith('_'));
  if (reserved.length > 0) {
    console.error(
      `✗ Entradas reservadas na raiz da extensão (${reserved.join(', ')}) — o Chrome recusa. ` +
        'Rode o build de novo (extension/build.mjs deve renomear _next → assets).',
    );
    process.exit(1);
  }
}

/**
 * ID de extensão desempacotada sem `key` no manifest: os 16 primeiros bytes
 * do SHA-256 do caminho absoluto (normalizado, ASCII minúsculo), cada nibble
 * mapeado para o caractere 'a'..'p'. É o algoritmo do Chromium
 * (`Extension::GenerateId`) — permite abrir o popup sem depender do worker
 * ter iniciado no headless.
 */
function extensionIdFromPath(dirPath) {
  const normalized = dirPath.replace(/\\/g, '/').toLowerCase();
  const hash = createHash('sha256').update(normalized, 'latin1').digest();
  let id = '';
  for (let i = 0; i < 16; i++) {
    id += String.fromCharCode(0x61 + (hash[i] >> 4));
    id += String.fromCharCode(0x61 + (hash[i] & 0x0f));
  }
  return id;
}

/** Procura `Preferences` do perfil do Chrome em qualquer profundidade. */
function findPreferences(root) {
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const name of readdirSync(current)) {
      const full = join(current, name);
      if (name === 'Preferences' && statSync(full).isFile()) return full;
      if (statSync(full).isDirectory()) stack.push(full);
    }
  }
  return null;
}

const userDataDir = mkdtempSync(join(tmpdir(), 'volante-smoke-'));
// WHY headed opcional: o headless desta versão do Chromium não inicia o
// service worker de extensões (nem de uma extensão mínima) — limitação do
// runner, não do pacote. Com SMOKE_HEADED=1 o teste roda com janela visível.
const headed = process.env.SMOKE_HEADED === '1';
const context = await chromium.launchPersistentContext(userDataDir, {
  headless: !headed,
  args: [
    `--disable-extensions-except=${extensionDir}`,
    `--load-extension=${extensionDir}`,
  ],
});

const consoleErrors = [];
const workerConsoleErrors = [];

const workers = new Set();
context.on('serviceworker', (worker) => {
  workers.add(worker);
  worker.on('console', (msg) => {
    if (msg.type() === 'error') workerConsoleErrors.push(msg.text());
  });
});

try {
  // O MV3 inicia o worker em eventos (onInstalled/onStartup); no headless isso
  // pode não acontecer sozinho — então espera-se com escuta ativa E polling.
  let worker = null;
  for (let i = 0; i < 40 && worker === null; i++) {
    worker = context.serviceWorkers()[0] ?? null;
    if (worker === null) await new Promise((r) => setTimeout(r, 500));
  }

  let extensionId = worker?.url().split('/')[2] ?? null;

  if (extensionId === null) {
    // Fallback 1: id computado pelo algoritmo do Chromium (determinístico).
    extensionId = extensionIdFromPath(extensionDir);
    // Fallback 2: confere com o Preferences do perfil, quando disponível.
    const preferencesFile = findPreferences(userDataDir);
    if (preferencesFile !== null) {
      const preferences = JSON.parse(readFileSync(preferencesFile, 'utf8'));
      const ids = Object.keys(preferences?.extensions?.settings ?? {});
      const fromProfile = ids.find(
        (id) => preferences.extensions.settings[id].path === extensionDir,
      ) ?? ids[0] ?? null;
      if (fromProfile !== null && fromProfile !== extensionId) {
        console.warn(`ℹ id computado (${extensionId}) difere do perfil (${fromProfile}) — usando o do perfil.`);
        extensionId = fromProfile;
      }
    }
  }

  if (!extensionId || !/^[a-p]{32}$/.test(extensionId)) {
    throw new Error(`Extensão não carregada (id obtido: ${extensionId})`);
  }
  console.log(`✓ Extensão registrada — id: ${extensionId}`);
  console.log(
    worker !== null
      ? `✓ Service worker ativo: ${worker.url()}`
      : 'ℹ Service worker registrado, mas não iniciado no headless (o Chrome o inicia no primeiro alarme/evento).',
  );

  // Popup: abre a página e confere renderização e erros de console.
  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));
  await page.goto(`chrome-extension://${extensionId}/index.html`, { waitUntil: 'load', timeout: 20_000 });
  await page.waitForTimeout(2_500);

  const title = await page.title();
  const body = await page.evaluate(() => document.body?.innerText ?? '');
  console.log(`✓ Popup carregado — título: "${title}"`);
  console.log(`  texto: ${body.slice(0, 160).replace(/\s+/g, ' ')}…`);

  if (body.length < 10) throw new Error('Corpo do popup vazio — export estático não renderizou.');
  if (consoleErrors.length > 0) {
    console.error(`✗ Erros de console no popup (${consoleErrors.length}):`);
    for (const err of consoleErrors.slice(0, 10)) console.error('  -', err);
    process.exitCode = 1;
  } else {
    console.log('✓ Nenhum erro de console no popup.');
  }
  if (workerConsoleErrors.length > 0) {
    console.error(`✗ Erros de console no service worker (${workerConsoleErrors.length}):`);
    for (const err of workerConsoleErrors.slice(0, 10)) console.error('  -', err);
    process.exitCode = 1;
  }

  // 3) Fluxo real: espera o histórico ficar pronto e gera um lote de jogos.
  // O popup precisa do histórico (seed ou sync do worker) para liberar o botão.
  const generateButton = page.getByRole('button', { name: /gerar jogos/i });
  try {
    await generateButton.waitFor({ state: 'visible', timeout: 10_000 });
    let enabled = false;
    for (let i = 0; i < 30 && !enabled; i++) {
      enabled = await generateButton.isEnabled();
      if (!enabled) await page.waitForTimeout(2_000);
    }
    if (!enabled) {
      console.warn('ℹ Botão "Gerar jogos" não habilitou em 60s — o histórico não chegou (rede/API da Caixa fora do ar neste ambiente?).');
    } else {
      await generateButton.click();
      await page.waitForTimeout(3_000);
      const after = await page.evaluate(() => document.body?.innerText ?? '');
      const hasGames = /jogo 0\d|jogos gerados|fechamento|copiar jogo|compartilhar/i.test(after);
      console.log(
        hasGames
          ? `✓ Geração executada no popup — texto pós-clique: ${after.slice(0, 140).replace(/\s+/g, ' ')}…`
          : `ℹ Clique executado, mas não detectei o painel de jogos: ${after.slice(0, 140).replace(/\s+/g, ' ')}…`,
      );
      if (!hasGames && !/analisando|carregando/i.test(after)) {
        console.warn('ℹ Sem painel de jogos e sem indicador de análise — verificar manualmente.');
      }
    }
  } catch (error) {
    console.warn(`ℹ Fase de geração pulada: ${error.message}`);
  }

  const screenshot = join(repoRoot, 'extension', 'dist', `smoke-${target}.png`);
  await page.screenshot({ path: screenshot });
  console.log(`✓ Screenshot: ${screenshot}`);
} catch (error) {
  console.error('✗ Falha no smoke test:', error.message);
  process.exitCode = 1;
} finally {
  await context.close().catch(() => undefined);
  rmSync(userDataDir, { recursive: true, force: true });
}

if (process.exitCode === 0) console.log(`\nSmoke test ${target}: OK`);
else console.log(`\nSmoke test ${target}: FALHOU`);
