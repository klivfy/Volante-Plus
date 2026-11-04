import { describe, expect, it } from 'vitest';
import { createLotteryTheme, M3_BRAND_CONTAINER, M3_NEUTRAL, FONT_FAMILY } from './theme';
import { Lottery } from './types/domain';

/**
 * Contrato Material Design 3 do tema (`theme.ts`):
 * - todos os pares de texto/fundo novos do M3 passam em 4,5:1 (WCAG 1.4.3) —
 *   o gate de Lighthouse reprova o CI com qualquer par reprovado (a11y 1.0);
 * - a fonte da marca é o Google Sans Flex auto-hospedado (`--font-google-sans-flex`);
 * - escala de forma M3 (pílula nos botões, diálogo extra-large);
 * - os papéis M3 viram variáveis CSS (`theme.vars`), porque o claro/escuro
 *   é decidido por `prefers-color-scheme` no navegador, não em JavaScript.
 */

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const LOTTERIES = Object.values(Lottery);
const SCHEMES = ['light', 'dark'] as const;

describe.each(LOTTERIES)('tema MD3 — containers de marca (%s)', (lottery) => {
  const containers = M3_BRAND_CONTAINER[lottery];

  it.each(SCHEMES)('esquema %s: texto sobre primaryContainer ≥ 4,5:1', (scheme) => {
    expect(contrast(containers[scheme].on, containers[scheme].container)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('tema MD3 — papéis do esquema neutro (iguais para toda modalidade)', () => {
  it.each(SCHEMES)('esquema %s: onSurface sobre surface ≥ 4,5:1', (scheme) => {
    expect(contrast(M3_NEUTRAL[scheme].onSurface, M3_NEUTRAL[scheme].surface)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(SCHEMES)('esquema %s: onSurfaceVariant (texto secundário) sobre surface ≥ 4,5:1', (scheme) => {
    expect(contrast(M3_NEUTRAL[scheme].onSurfaceVariant, M3_NEUTRAL[scheme].surface)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(SCHEMES)('esquema %s: onSurface sobre surfaceContainer (cartões) ≥ 4,5:1', (scheme) => {
    expect(contrast(M3_NEUTRAL[scheme].onSurface, M3_NEUTRAL[scheme].surfaceContainer)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(SCHEMES)('esquema %s: texto secundário sobre surfaceContainer ≥ 4,5:1', (scheme) => {
    expect(
      contrast(M3_NEUTRAL[scheme].onSurfaceVariant, M3_NEUTRAL[scheme].surfaceContainer),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it.each(SCHEMES)('esquema %s: onSurface sobre surfaceContainerHigh (diálogos) ≥ 4,5:1', (scheme) => {
    expect(
      contrast(M3_NEUTRAL[scheme].onSurface, M3_NEUTRAL[scheme].surfaceContainerHigh),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it.each(SCHEMES)('esquema %s: onSecondaryContainer sobre secondaryContainer (nav) ≥ 4,5:1', (scheme) => {
    expect(
      contrast(M3_NEUTRAL[scheme].onSecondaryContainer, M3_NEUTRAL[scheme].secondaryContainer),
    ).toBeGreaterThanOrEqual(4.5);
  });
});

describe('tema MD3 — tema compilado', () => {
  const theme = createLotteryTheme(Lottery.MEGA_SENA);
  const schemes = (theme as unknown as {
    colorSchemes: Record<
      'light' | 'dark',
      { palette: Record<string, string | { main: string; contrastText: string; light?: string; dark?: string }> }
    >;
  }).colorSchemes;

  it('os papéis M3 viram variáveis CSS (claro/escuro por prefers-color-scheme)', () => {
    const vars = theme.vars as unknown as Record<string, Record<string, unknown>> | undefined;
    expect(vars).toBeTruthy();
    for (const role of [
      'primaryContainer',
      'onPrimaryContainer',
      'secondaryContainer',
      'onSecondaryContainer',
      'surfaceContainer',
      'surfaceContainerHigh',
      'onSurfaceVariant',
      'outlineVariant',
    ]) {
      expect(vars?.palette?.[role], role).toBeTruthy();
    }
  });

  it.each(SCHEMES)('esquema %s: os containers de marca do tema batem com os tokens', (scheme) => {
    expect(schemes[scheme].palette.primaryContainer).toBe(M3_BRAND_CONTAINER[Lottery.MEGA_SENA][scheme].container);
    expect(schemes[scheme].palette.onPrimaryContainer).toBe(M3_BRAND_CONTAINER[Lottery.MEGA_SENA][scheme].on);
  });

  it.each(SCHEMES)('esquema %s: cor principal segue ≥ 4,5:1 sobre a superfície M3', (scheme) => {
    const primary = schemes[scheme].palette.primary as { main: string };
    expect(contrast(primary.main, M3_NEUTRAL[scheme].surface)).toBeGreaterThanOrEqual(4.5);
  });

  it('a fonte da marca é o Google Sans Flex auto-hospedado, com fallback do sistema', () => {
    expect(FONT_FAMILY.startsWith('var(--font-google-sans-flex)')).toBe(true);
    expect(theme.typography.fontFamily).toBe(FONT_FAMILY);
    expect(FONT_FAMILY).toContain('system-ui');
  });

  it('escala de forma M3: botão em pílula, diálogo extra-large (28), base 12', () => {
    const overrides = theme.components as Record<string, { styleOverrides?: Record<string, unknown> }>;
    expect(overrides.MuiButton?.styleOverrides?.root).toMatchObject({ borderRadius: '9999px' });
    const dialogPaper = overrides.MuiDialog?.styleOverrides?.paper as (args: {
      theme: { palette: { surfaceContainerHigh?: string } };
    }) => Record<string, unknown>;
    expect(typeof dialogPaper).toBe('function');
    expect(dialogPaper({ theme: { palette: {} } })).toMatchObject({ borderRadius: '28px' });
    expect(theme.shape.borderRadius).toBe(12);
  });

  it('escala tipográfica M3: headline em 400, títulos/rótulos em 500, corpo ≥ 12px', () => {
    const typography = theme.typography as unknown as Record<string, { fontWeight?: number; fontSize: string }>;
    expect(typography.h1?.fontWeight).toBe(400);
    expect(typography.h2?.fontWeight).toBe(400);
    expect(typography.h3?.fontWeight).toBe(400);
    expect(typography.h4?.fontWeight).toBe(400);
    expect(typography.h5?.fontWeight).toBe(500);
    expect(typography.button?.fontWeight).toBe(500);
    expect(parseFloat(typography.body2?.fontSize ?? '0')).toBeGreaterThanOrEqual(0.75);
    expect(parseFloat(typography.caption?.fontSize ?? '0')).toBeGreaterThanOrEqual(0.75);
  });
});
