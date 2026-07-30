import { test, expect } from '@playwright/test';

test('fluxo completo: abrir página → selecionar loteria → gerar jogos → ver resultados', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Volante+' })).toBeVisible();

  await page.getByRole('tab', { name: '+Milionária' }).click();
  await expect(page.getByRole('tab', { name: '+Milionária' })).toHaveAttribute('aria-selected', 'true');

  const generateButton = page.getByRole('button', { name: /gerar jogos/i });
  // Enquanto o histórico local é analisado, o botão fica desabilitado
  // ("Analisando histórico…") — sem histórico salvo, cai no fallback de
  // histórico vazio do analyzeBacktest, então sempre acaba habilitando.
  await expect(generateButton).toBeEnabled({ timeout: 15_000 });

  await generateButton.click();

  await expect(page.getByText('Jogo 01')).toBeVisible();
  await expect(page.getByText('Jogo 02')).toBeVisible();
});
