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
  // Dois finais possíveis quando a rede cai, ambos provam o SW a servir o
  // app offline:
  // - mensagem de erro do NextDrawCard — quando a 1ª visita NÃO conseguiu
  //   buscar o próximo concurso (nada no runtime cache `caixa-api`);
  // - os dados do concurso exibidos — quando a 1ª visita BUSCOU com sucesso
  //   (sandbox/CI com internet): o NetworkFirst cai no cache e o card
  //   renderiza normalmente. Exigir sempre a mensagem codificava a premissa
  //   ambiental "sem internet na primeira visita" e falhava em ambientes
  //   conectados, onde o cache dá resultado MELHOR que a mensagem de erro.
  const offlineMessage = page.getByText(
    'Não foi possível carregar os dados do próximo concurso. Verifique sua conexão.',
  );
  const nextDrawData = page.getByRole('heading', { name: /Concurso \d+/ });
  await expect(offlineMessage.or(nextDrawData).first()).toBeVisible({ timeout: 10_000 });

  // Perfil de teste limpo não tem histórico no IndexedDB — exercita o
  // fallback de histórico vazio do analyzeBacktest, não dados cacheados
  // reais, mas prova que gerar jogos não depende de rede.
  const generateButton = page.getByRole('button', { name: /gerar jogos/i });
  await expect(generateButton).toBeEnabled({ timeout: 15_000 });
  await generateButton.click();

  await expect(page.getByText('Jogo 01')).toBeVisible();
});
