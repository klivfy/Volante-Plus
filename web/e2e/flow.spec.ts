import { test, expect } from '@playwright/test';

test('fluxo completo: abrir página → selecionar loteria → gerar jogos → ver resultados', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Volante+' })).toBeVisible();

  await page.getByRole('button', { name: '+Milionária' }).click();
  await expect(page.getByRole('button', { name: '+Milionária' })).toHaveAttribute('aria-pressed', 'true');

  const generateButton = page.getByRole('button', { name: /gerar jogos/i });
  // Enquanto o histórico local é analisado, o botão fica desabilitado
  // ("Analisando histórico…") — sem histórico salvo, cai no fallback de
  // histórico vazio do analyzeBacktest, então sempre acaba habilitando.
  await expect(generateButton).toBeEnabled({ timeout: 15_000 });

  await generateButton.click();

  await expect(page.getByText('Jogo 01')).toBeVisible();
  await expect(page.getByText('Jogo 02')).toBeVisible();
});

test('rateio do prêmio só aparece quando o número de apostas é informado', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Volante+' })).toBeVisible();

  const generateButton = page.getByRole('button', { name: /gerar jogos/i });
  await expect(generateButton).toBeEnabled({ timeout: 15_000 });
  await generateButton.click();
  await expect(page.getByText('Jogo 01')).toBeVisible();

  // Sem apostas informadas: o rateio depende de quantas pessoas concorrem, e
  // sem esse número exibir um ganho seria inventá-lo — o painel não aparece.
  await expect(page.getByText('Rateio do prêmio', { exact: true })).toHaveCount(0);

  await page.getByLabel('Apostas no concurso (opcional)').fill('10000000');

  // O painel aparece com a ressalva obrigatória — nunca o número sem ela.
  await expect(page.getByText('Rateio do prêmio', { exact: true })).toBeVisible();
  await expect(page.getByText(/Este número não é chance de ganhar/)).toBeVisible();
});
