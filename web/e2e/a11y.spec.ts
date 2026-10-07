import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import axe from 'axe-core';

/**
 * Guardas de acessibilidade e de leitura (revisão de design de 2026-10,
 * `docs/revisao-de-design-2026-10.md`, Fase 0).
 *
 * Transforma as medições daquela revisão em testes, para que nenhuma
 * correção regrida:
 * - axe-core (WCAG 2.0/2.1/2.2, A e AA) nas quatro telas e nos estados que
 *   importam, em claro e escuro;
 * - texto a 200% e tela de 320 px: nada cortado, nenhum rótulo de campo por
 *   cima do valor, nenhuma rolagem horizontal da página;
 * - contorno dos campos com pelo menos 3:1 (WCAG 1.4.11);
 * - nenhum número decimal com ponto ("15.6%") num app em pt-BR.
 *
 * WHY (APIs externas simuladas): os testes não podem depender de rede nem do
 * concurso do dia. O "último concurso" das APIs é o último do histórico
 * embutido — a sincronização fica em dia sem buscar nada — e o próximo
 * concurso vem acumulado, para exercitar o cartão inteiro.
 */

type SeedTuple = [number, string, number[], number[]?];
type Slug = 'megasena' | 'maismilionaria';

function latestFixture(slug: Slug, prize: number) {
  const seed = JSON.parse(
    readFileSync(path.join(__dirname, '..', 'src', 'data', 'history', `${slug}.json`), 'utf8'),
  ) as SeedTuple[];
  const [contest, isoDate, numbers, trevos] = seed[seed.length - 1];
  const toBrazilian = (date: Date) =>
    `${String(date.getUTCDate()).padStart(2, '0')}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${date.getUTCFullYear()}`;
  const drawDate = new Date(`${isoDate}T00:00:00Z`);
  const nextDate = new Date(drawDate.getTime() + 3 * 24 * 60 * 60 * 1000);
  return {
    concurso: contest,
    data: toBrazilian(drawDate),
    dezenas: numbers.map((n) => String(n).padStart(2, '0')),
    ...(trevos ? { trevos: trevos.map(String) } : {}),
    acumulou: true,
    acumulado: true,
    proximoConcurso: contest + 1,
    dataProximoConcurso: toBrazilian(nextDate),
    valorEstimadoProximoConcurso: prize,
  };
}

const LATEST: Record<Slug, ReturnType<typeof latestFixture>> = {
  megasena: latestFixture('megasena', 92_000_000),
  maismilionaria: latestFixture('maismilionaria', 102_000_000),
};

async function mockExternalApis(page: Page): Promise<void> {
  await page.route(
    (url) => url.hostname !== '127.0.0.1' && url.hostname !== 'localhost',
    async (route) => {
      const { pathname } = new URL(route.request().url());
      const slug: Slug | null = pathname.includes('maismilionaria')
        ? 'maismilionaria'
        : pathname.includes('megasena')
          ? 'megasena'
          : null;
      const isLatest =
        /\/(latest|ultimo)$/.test(pathname) || /portaldeloterias\/api\/(megasena|maismilionaria)$/.test(pathname);
      if (slug && isLatest) {
        await route.fulfill({ json: LATEST[slug] });
        return;
      }
      await route.abort();
    },
  );
}

// Sem splash e sem animações (o app respeita "Reduzir movimento").
test.use({ contextOptions: { reducedMotion: 'reduce' } });

// ---------------------------------------------------------------- estados

async function openVolante(page: Page, lottery: 'mega' | 'mais' = 'mega'): Promise<void> {
  await mockExternalApis(page);
  await page.goto('/');
  if (lottery === 'mais') {
    await page.getByRole('button', { name: '+Milionária' }).click();
  }
  await expect(page.getByRole('button', { name: /^Gerar jogos$/ })).toBeEnabled({ timeout: 60_000 });
}

async function generateGames(page: Page, lottery: 'mega' | 'mais'): Promise<void> {
  await openVolante(page, lottery);
  await page.getByRole('group', { name: 'Quantos jogos' }).getByRole('button', { name: '3', exact: true }).click();
  await page.getByLabel(/Apostas no concurso/).fill(lottery === 'mega' ? '30000000' : '3000000');
  await page.getByRole('button', { name: /^Gerar jogos$/ }).click();
  await expect(page.getByRole('list', { name: 'Jogos gerados' })).toBeVisible({ timeout: 60_000 });
}

async function generateClosure(page: Page): Promise<void> {
  await openVolante(page);
  await page.getByRole('button', { name: 'Fechamento', exact: true }).click();
  const numbers = page.getByRole('group', { name: /Dezenas do fechamento/ }).getByRole('button');
  for (const index of [2, 7, 11, 16, 22, 28, 33, 41, 47, 52]) {
    await numbers.nth(index).click();
  }
  await page.getByRole('button', { name: /^Gerar fechamento$/ }).click();
  await expect(page.getByRole('list', { name: 'Jogos gerados' })).toBeVisible({ timeout: 60_000 });
}

async function runBacktest(page: Page): Promise<void> {
  await mockExternalApis(page);
  await page.goto('/backtesting');
  await page.getByLabel('Data de corte').fill('2024-06-01');
  const run = page.getByRole('button', { name: /Executar backtest/ });
  await expect(run).toBeEnabled({ timeout: 60_000 });
  await run.click();
  await expect(page.getByText('Média de acertos')).toBeVisible({ timeout: 120_000 });
}

async function runAdvanced(page: Page): Promise<void> {
  await mockExternalApis(page);
  await page.goto('/analise-avancada');
  const collapsed = page.locator('main [aria-expanded="false"]');
  while ((await collapsed.count()) > 0) {
    await collapsed.first().click();
  }
  for (const name of [/^Rodar testes$/, /^Rodar benchmark$/]) {
    await page.getByRole('button', { name }).click();
    await expect(page.getByText('Calculando…')).toHaveCount(0, { timeout: 180_000 });
  }
}

async function openAbout(page: Page): Promise<void> {
  await mockExternalApis(page);
  await page.goto('/sobre');
  await expect(page.getByText('Sobre o Volante+')).toBeVisible();
}

const STATES: Record<string, (page: Page) => Promise<void>> = {
  'Volante (Mega-Sena)': (page) => openVolante(page),
  'Volante com jogos gerados (Mega-Sena)': (page) => generateGames(page, 'mega'),
  'Volante com jogos gerados (+Milionária)': (page) => generateGames(page, 'mais'),
  'Volante › Fechamento gerado': generateClosure,
  'Backtesting executado': runBacktest,
  'Análise avançada com as seções abertas': runAdvanced,
  Sobre: openAbout,
};

// ---------------------------------------------------------------- axe

/**
 * Regras do axe que ainda podem falhar. Vazia desde a Fase 1 da revisão de
 * design (achados C2 e C3 corrigidos): nada entra aqui sem um achado
 * registrado em `docs/revisao-de-design-2026-10.md` e uma tarefa para tirá-lo.
 */
const KNOWN_VIOLATIONS = new Set<string>();

async function axeViolations(page: Page) {
  await page.addScriptTag({ content: axe.source });
  return page.evaluate(async () => {
    const result = await (window as unknown as { axe: typeof axe }).axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    });
    return result.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      targets: violation.nodes.slice(0, 5).map((node) => node.target.join(' ')),
    }));
  });
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`axe — ${scheme === 'light' ? 'claro' : 'escuro'}`, () => {
    test.use({ colorScheme: scheme });
    for (const [name, open] of Object.entries(STATES)) {
      test(name, async ({ page }) => {
        test.setTimeout(240_000);
        await open(page);
        const violations = (await axeViolations(page)).filter((v) => !KNOWN_VIOLATIONS.has(v.id));
        expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
      });
    }
  });
}

// ---------------------------------------------------------------- leitura

interface LayoutProblems {
  horizontalOverflow: number;
  clippedText: string[];
  labelOverValue: string[];
}

async function layoutProblems(page: Page): Promise<LayoutProblems> {
  return page.evaluate(() => {
    const visible = (element: Element) => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && box.width > 0 && box.height > 0;
    };
    const clippedText: string[] = [];
    for (const element of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      // O `legend` do contorno do MUI é invisível de propósito (só abre o vão do rótulo).
      if (element.tagName === 'LEGEND' || !visible(element)) continue;
      const text = element.innerText?.trim();
      if (!text || element.children.length > 3) continue;
      const style = getComputedStyle(element);
      const hidesX = ['hidden', 'clip'].includes(style.overflowX) || style.textOverflow === 'ellipsis';
      const hidesY = ['hidden', 'clip'].includes(style.overflowY);
      if ((hidesX && element.scrollWidth > element.clientWidth + 1) || (hidesY && element.scrollHeight > element.clientHeight + 1)) {
        clippedText.push(text.slice(0, 60));
      }
    }
    const labelOverValue: string[] = [];
    for (const label of Array.from(document.querySelectorAll<HTMLElement>('.MuiInputLabel-root'))) {
      const input = label.parentElement?.querySelector('input');
      if (!input || !input.value || !visible(label)) continue;
      const a = label.getBoundingClientRect();
      const b = input.getBoundingClientRect();
      const paddingTop = parseFloat(getComputedStyle(input).paddingTop);
      const textTop = b.top + paddingTop;
      if (a.bottom > textTop + 1 && a.top < b.bottom) labelOverValue.push(label.innerText.trim());
    }
    return {
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      clippedText,
      labelOverValue,
    };
  });
}

function expectReadable(problems: LayoutProblems): void {
  expect(problems.horizontalOverflow, 'rolagem horizontal da página').toBeLessThanOrEqual(0);
  expect(problems.clippedText, 'texto cortado').toEqual([]);
  expect(problems.labelOverValue, 'rótulo de campo por cima do valor').toEqual([]);
}

/**
 * Falhas conhecidas por estado, com o achado da revisão. Vazias desde a Fase 1
 * (achado C1). Um estado listado aqui que passa a passar faz o teste falhar
 * ("Expected to fail, but passed"): a lista só encolhe.
 */
const KNOWN_200_PERCENT: Record<string, string> = {};
const KNOWN_320_PX: Record<string, string> = {};

const READABILITY_STATES = [
  'Volante com jogos gerados (Mega-Sena)',
  'Volante com jogos gerados (+Milionária)',
  'Volante › Fechamento gerado',
  'Backtesting executado',
  'Análise avançada com as seções abertas',
  'Sobre',
];

test.describe('texto a 200%', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  for (const name of READABILITY_STATES) {
    test(name, async ({ page }) => {
      test.setTimeout(240_000);
      test.fail(name in KNOWN_200_PERCENT, KNOWN_200_PERCENT[name]);
      await STATES[name](page);
      await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
      await page.waitForTimeout(300);
      expectReadable(await layoutProblems(page));
    });
  }
});

test.describe('tela de 320 px', () => {
  test.use({ viewport: { width: 320, height: 640 } });
  for (const name of ['Volante com jogos gerados (Mega-Sena)', 'Análise avançada com as seções abertas']) {
    test(name, async ({ page }) => {
      test.setTimeout(240_000);
      test.fail(name in KNOWN_320_PX, KNOWN_320_PX[name]);
      await STATES[name](page);
      expectReadable(await layoutProblems(page));
    });
  }
});

// ---------------------------------------------------------------- contraste do contorno

for (const scheme of ['light', 'dark'] as const) {
  test(`contorno dos campos com pelo menos 3:1 — ${scheme === 'light' ? 'claro' : 'escuro'}`, async ({ browser }) => {
    test.setTimeout(120_000);
    const context = await browser.newContext({ colorScheme: scheme, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await openVolante(page);
    const ratio = await page.getByLabel(/Apostas no concurso/).evaluate((input) => {
      const parse = (value: string) => {
        const [r, g, b, a = 1] = (value.match(/[\d.]+/g) ?? []).map(Number);
        return { r, g, b, a };
      };
      const background = (element: Element | null): { r: number; g: number; b: number } => {
        for (let node = element; node; node = node.parentElement) {
          const color = parse(getComputedStyle(node).backgroundColor);
          if (color.a > 0) return color;
        }
        return { r: 255, g: 255, b: 255 };
      };
      const fieldset = input.parentElement?.querySelector('fieldset');
      if (!fieldset) return 0;
      const bg = background(fieldset.parentElement);
      const border = parse(getComputedStyle(fieldset).borderTopColor);
      const mix = (channel: 'r' | 'g' | 'b') => border[channel] * border.a + bg[channel] * (1 - border.a);
      const luminance = ({ r, g, b }: { r: number; g: number; b: number }) => {
        const f = (c: number) => {
          const s = c / 255;
          return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const l1 = luminance({ r: mix('r'), g: mix('g'), b: mix('b') });
      const l2 = luminance(bg);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    });
    await context.close();
    expect(ratio).toBeGreaterThanOrEqual(3);
  });
}

// ---------------------------------------------------------------- números em pt-BR

test('nenhum decimal com ponto nas telas com números', async ({ page }) => {
  test.setTimeout(300_000);
  const offenders: string[] = [];
  for (const open of [(p: Page) => generateGames(p, 'mega'), runBacktest, runAdvanced]) {
    await open(page);
    const text = await page.locator('body').innerText();
    offenders.push(...(text.match(/\d\.\d+\s?[%×]/g) ?? []));
  }
  expect(offenders).toEqual([]);
});
