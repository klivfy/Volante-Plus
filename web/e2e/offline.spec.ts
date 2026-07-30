import { test, expect } from '@playwright/test';

test('funciona offline após a primeira visita: cache do service worker serve o app e a geração de jogos continua funcionando', async ({
  page,
  context,
}) => {
  await page.goto('/');

  // O SW ficar "active" não basta: até `clients.claim()` assumir esta aba
  // específica (`serviceWorker.controller`), um reload dela ainda pode ir
  // direto para a rede em vez de passar pelo fetch handler do SW — e falhar
  // com ERR_INTERNET_DISCONNECTED assim que a rede for cortada.
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, { timeout: 15_000 });

  await context.setOffline(true);
  await page.reload();

  await expect(page.getByRole('heading', { name: 'Volante+' })).toBeVisible();
  await expect(
    page.getByText('Não foi possível carregar os dados do próximo concurso. Verifique sua conexão.'),
  ).toBeVisible();

  // Perfil de teste limpo não tem histórico no IndexedDB — exercita o
  // fallback de histórico vazio do analyzeBacktest, não dados cacheados
  // reais, mas prova que gerar jogos não depende de rede.
  const generateButton = page.getByRole('button', { name: /gerar jogos/i });
  await expect(generateButton).toBeEnabled({ timeout: 15_000 });
  await generateButton.click();

  await expect(page.getByText('Jogo 01')).toBeVisible();
});
