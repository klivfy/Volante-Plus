import { expect, test, type Page } from '@playwright/test';

/**
 * E2E do fluxo de consentimento LGPD (docs/CONFORMIDADE-LGPD.md).
 *
 * Cada teste começa com um contexto limpo (Playwright cria um novo browser
 * context por teste) = titular "primeira visita", sem decisão de
 * consentimento. O app é servido por `next start` de um build de produção
 * (webServer do playwright.config).
 */

const BANNER_LABEL = 'Aviso de privacidade e consentimento';

async function readConsent(page: Page): Promise<Record<string, unknown> | null> {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem('volante_consent_v1');
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
  });
}

test.describe('banner de consentimento (opt-in)', () => {
  test('primeira visita mostra o banner; rejeitar persiste tudo desligado', async ({ page }) => {
    await page.goto('/');

    const banner = page.getByRole('complementary', { name: BANNER_LABEL });
    await expect(banner).toBeVisible();

    // Link permanente para a política dentro do banner.
    await expect(banner.getByRole('link', { name: 'Política de Privacidade' })).toBeVisible();

    // Paridade de botões: Aceitar todos e Rejeitar não essenciais existem
    // lado a lado, ambos como botões primários (mesma facilidade de acesso).
    await expect(banner.getByRole('button', { name: 'Aceitar todos' })).toBeVisible();
    await expect(banner.getByRole('button', { name: 'Rejeitar não essenciais' })).toBeVisible();

    await banner.getByRole('button', { name: 'Rejeitar não essenciais' }).click();
    await expect(banner).toBeHidden();

    const consent = await readConsent(page);
    expect(consent).not.toBeNull();
    expect(consent).toMatchObject({ version: 1, analiticos: false, diagnosticos: false, marketing: false });

    // LGPD: sem consentimento analítico, nenhum script de métricas no DOM.
    expect(await page.locator('#plausible-script').count()).toBe(0);

    // Recarregar: a decisão persiste — o banner NÃO volta.
    await page.reload();
    await expect(page.getByRole('complementary', { name: BANNER_LABEL })).toBeHidden();
  });

  test('aceitar todos concede as três categorias', async ({ page }) => {
    await page.goto('/');
    const banner = page.getByRole('complementary', { name: BANNER_LABEL });
    await banner.getByRole('button', { name: 'Aceitar todos' }).click();
    await expect(banner).toBeHidden();

    expect(await readConsent(page)).toMatchObject({
      version: 1,
      analiticos: true,
      diagnosticos: true,
      marketing: true,
    });
  });

  test('preferências: switches desmarcados por padrão e salvamento granular', async ({ page }) => {
    await page.goto('/');
    const banner = page.getByRole('complementary', { name: BANNER_LABEL });
    await banner.getByRole('button', { name: 'Preferências' }).click();

    const dialog = page.getByRole('dialog', { name: 'Preferências de privacidade' });
    await expect(dialog).toBeVisible();

    // Privacy by Default: nenhum switch de categoria opcional nasce marcado.
    for (const label of ['Métricas de acesso', 'Diagnóstico de erros', 'Marketing / publicidade']) {
      const sw = dialog.getByRole('switch', { name: label });
      await expect(sw).toBeVisible();
      await expect(sw).not.toBeChecked();
    }

    // Liga só métricas e salva: decisão granular respeitada.
    await dialog.getByRole('switch', { name: 'Métricas de acesso' }).click();
    await dialog.getByRole('button', { name: 'Salvar preferências' }).click();
    await expect(dialog).toBeHidden();

    expect(await readConsent(page)).toMatchObject({
      version: 1,
      analiticos: true,
      diagnosticos: false,
      marketing: false,
    });
    await expect(banner).toBeHidden();
  });
});

test.describe('página /privacidade', () => {
  test.beforeEach(async ({ page }) => {
    // Decide de antemão: a página deve funcionar com decisão tomada (chips
    // com estado) — o cenário "sem decisão" é coberto pelo banner.
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'volante_consent_v1',
        JSON.stringify({ version: 1, analiticos: true, diagnosticos: false, marketing: false, decidedAt: new Date().toISOString() }),
      );
    });
    await page.goto('/privacidade');
  });

  test('exibe política, estado do consentimento e canal do DPO', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Privacidade e dados pessoais', level: 1 })).toBeVisible();
    await expect(page.getByText('Encarregado — DPO').first()).toBeVisible();
    // Chips do estado atual: analíticos ligado, diagnósticos/marketing desligados.
    await expect(page.getByText('Métricas de acesso: Ligado')).toBeVisible();
    await expect(page.getByText('Diagnóstico de erros: Desligado')).toBeVisible();
    await expect(page.getByText('Marketing / publicidade: Desligado')).toBeVisible();
  });

  test('exporta os dados locais como JSON', async ({ page }) => {
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exportar meus dados (JSON)' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^volante-plus-meus-dados-\d{4}-\d{2}-\d{2}\.json$/);
    await expect(page.getByText(/Arquivo gerado: volante-plus-meus-dados-/)).toBeVisible();
  });

  test('eliminação exige confirmação e é cancelável', async ({ page }) => {
    await page.getByRole('button', { name: 'Apagar todos os dados locais' }).click();
    const confirm = page.getByRole('dialog', { name: 'Apagar todos os dados locais?' });
    await expect(confirm).toBeVisible();
    // Cancelar: nada é apagado.
    await confirm.getByRole('button', { name: 'Cancelar' }).click();
    await expect(confirm).toBeHidden();
    await expect(await readConsent(page)).not.toBeNull();
  });

  test('preferências abrem a partir da página', async ({ page }) => {
    await page.getByRole('button', { name: 'Gerenciar preferências' }).click();
    const dialog = page.getByRole('dialog', { name: 'Preferências de privacidade' });
    await expect(dialog).toBeVisible();
    // Decisão prévia (analiticos=true) vem pré-carregada para poder mudar.
    await expect(dialog.getByRole('switch', { name: 'Métricas de acesso' })).toBeChecked();
    await expect(dialog.getByRole('switch', { name: 'Diagnóstico de erros' })).not.toBeChecked();
  });
});
