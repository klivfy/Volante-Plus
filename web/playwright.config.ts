import { defineConfig, devices } from '@playwright/test';

/**
 * Aponta para um binário de Chromium já instalado (em vez de baixar um) só
 * quando `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` estiver definida — não
 * hardcoded, porque o caminho varia por máquina/CI. Sem a variável, o
 * Playwright resolve o navegador do jeito normal (`playwright install`).
 */
const chromiumExecutablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
  },
  // `next start` exige um build de produção prévio (`npm run build`) — é o
  // service worker desse build que os testes offline dependem para servir o
  // app sem rede.
  webServer: {
    command: 'npm run start',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(chromiumExecutablePath ? { launchOptions: { executablePath: chromiumExecutablePath } } : {}),
      },
    },
  ],
});
