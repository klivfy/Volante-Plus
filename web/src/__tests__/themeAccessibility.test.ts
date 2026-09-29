import { describe, expect, it } from 'vitest';
import { createLotteryTheme } from '../theme';
import { Lottery } from '../types/domain';

/** Parte do tema com variáveis CSS que os testes leem (o tipo `Theme` do MUI não a expõe). */
interface SchemePalette {
  palette: {
    primary: { main: string; contrastText: string };
    background: { default: string };
  };
}
interface CssVarsTheme {
  vars?: unknown;
  colorSchemes: { light: SchemePalette; dark: SchemePalette };
  typography: Record<string, { fontSize: string | number }>;
}

/** Luminância relativa e razão de contraste WCAG 2.x. */
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

const LOTTERIES = [Lottery.MEGA_SENA, Lottery.MAIS_MILIONARIA];

describe.each(LOTTERIES)('tema — acessibilidade (%s)', (lottery) => {
  const theme = createLotteryTheme(lottery) as unknown as CssVarsTheme;
  const schemes = theme.colorSchemes;

  it.each(['light', 'dark'] as const)('aparência %s: rótulo sobre a cor principal ≥ 4,5:1', (scheme) => {
    const { main, contrastText } = schemes[scheme].palette.primary;
    expect(contrast(contrastText, main)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(['light', 'dark'] as const)('aparência %s: cor principal como texto/borda sobre o fundo ≥ 4,5:1', (scheme) => {
    const { palette } = schemes[scheme];
    expect(contrast(palette.primary.main, palette.background.default)).toBeGreaterThanOrEqual(4.5);
  });

  it('claro e escuro têm fundos distintos (o escuro é de fato escuro)', () => {
    expect(luminance(schemes.dark.palette.background.default)).toBeLessThan(0.05);
    expect(luminance(schemes.light.palette.background.default)).toBeGreaterThan(0.9);
  });

  it('o tema usa variáveis CSS: claro e escuro convivem no stylesheet, sem troca em JavaScript', () => {
    expect(theme.vars).toBeTruthy();
    expect(Object.keys(theme.colorSchemes).sort()).toEqual(['dark', 'light']);
  });

  it('tipografia em rem (escala com a preferência de tamanho do sistema), sem px', () => {
    const sizes = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'body1', 'body2', 'button', 'caption'] as const;
    for (const key of sizes) {
      expect(String(theme.typography[key].fontSize), key).toMatch(/rem$/);
    }
  });

  it('nenhum tamanho de fonte de texto do corpo fica abaixo de 12 px (0,75rem)', () => {
    for (const key of ['body1', 'body2', 'button', 'caption'] as const) {
      expect(parseFloat(String(theme.typography[key].fontSize))).toBeGreaterThanOrEqual(0.75);
    }
  });
});
