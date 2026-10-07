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

test('a modalidade escolhida vale em todas as abas e sobrevive à recarga', async ({ page }) => {
  // Regressão (revisão de design, achado A1): cada tela guardava a própria
  // modalidade e só o tema era global — a tela ficava azul com o seletor em
  // Mega-Sena.
  await page.goto('/');
  await page.getByRole('button', { name: '+Milionária' }).click();

  const nav = page.getByRole('navigation', { name: 'Seções do app' });
  for (const [tab, path] of [
    ['Backtesting', '/backtesting'],
    ['Avançado', '/analise-avancada'],
    ['Volante', '/'],
  ] as const) {
    await nav.getByRole('link', { name: tab }).click();
    await expect(page).toHaveURL(new RegExp(`${path === '/' ? '/$' : path}`));
    await expect(nav.getByRole('link', { name: tab })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('button', { name: '+Milionária' })).toHaveAttribute('aria-pressed', 'true');
  }

  await page.reload();
  await expect(page.getByRole('button', { name: '+Milionária' })).toHaveAttribute('aria-pressed', 'true');
});

test('o selo "Acumulou" só aparece quando a API diz que acumulou', async ({ page }) => {
  // Regressão (achado A2): o selo era inferido de "prêmio estimado > 0",
  // verdadeiro em todo concurso.
  let accumulated = false;
  await page.route(/\/api\/megasena\/latest$/, (route) =>
    route.fulfill({
      json: {
        concurso: 3048,
        data: '16/09/2026',
        dezenas: ['01', '02', '03', '04', '05', '06'],
        acumulou: accumulated,
        proximoConcurso: 3049,
        dataProximoConcurso: '18/09/2026',
        valorEstimadoProximoConcurso: 3_500_000,
      },
    }),
  );

  await page.goto('/');
  await expect(page.getByText('Concurso 3049')).toBeVisible();
  await expect(page.getByText('Acumulou', { exact: true })).toHaveCount(0);

  accumulated = true;
  await page.reload();
  await expect(page.getByText('Concurso 3049')).toBeVisible();
  await expect(page.getByText('Acumulou', { exact: true })).toBeVisible();
});
