import { createTheme, ThemeOptions } from '@mui/material/styles';
import { Lottery } from './types/domain';

/**
 * Tema do Volante+.
 *
 * ## Claro/escuro por CSS, não por JavaScript
 * O tema usa variáveis CSS (`cssVariables`) com `colorSchemeSelector: 'media'`: as
 * duas paletas vão no stylesheet e o navegador escolhe por `prefers-color-scheme`.
 * Antes, o tema escuro era escolhido por `useMediaQuery` DEPOIS da hidratação,
 * então na primeira carga em modo escuro os cartões ficavam claros (`#FFFBFE`)
 * com texto branco (contraste 1,02:1) até uma navegação ou recarga corrigir.
 *
 * ## Contraste das cores das modalidades
 * Todos os pares abaixo foram calculados (WCAG) e passam em 4,5:1:
 *
 * | Modalidade / aparência | cor principal | rótulo sobre ela | cor sobre o fundo |
 * |---|---|---|---|
 * | Mega-Sena, claro   | #2B8300 | branco 4,83:1  | 4,71:1 sobre #FFFBFE |
 * | Mega-Sena, escuro  | #40BE00 | #0B2000 7,03:1 | 7,00:1 sobre #1C1B1F |
 * | +Milionária, claro | #005CA9 | branco 6,77:1  | 6,60:1 sobre #FFFBFE |
 * | +Milionária, escuro| #48ACFF | #001D36 7,01:1 | 7,03:1 sobre #1C1B1F |
 *
 * O verde anterior (#39A900) dava 3,07:1 com branco e 2,99:1 como texto; o azul
 * na aparência escura (#005CA9 sobre #1C1B1F) dava 2,53:1.
 *
 * ## Tamanho de texto
 * Tamanhos em `rem`, não `px`: com `px` o texto ignorava a preferência de
 * tamanho de fonte do navegador/sistema (200% no `<html>` deixava o corpo em 14 px).
 */

const rem = (px: number): string => `${px / 16}rem`;

const LIGHT_BACKGROUND = '#FFFBFE';
const DARK_BACKGROUND = '#1C1B1F';

interface BrandColors {
  main: string;
  light: string;
  dark: string;
  contrastText: string;
}

const BRAND: Record<Lottery, { light: BrandColors; dark: BrandColors }> = {
  [Lottery.MEGA_SENA]: {
    light: { main: '#2B8300', light: '#5DAE33', dark: '#1D5A00', contrastText: '#FFFFFF' },
    dark: { main: '#40BE00', light: '#7ADB44', dark: '#2E8C00', contrastText: '#0B2000' },
  },
  [Lottery.MAIS_MILIONARIA]: {
    light: { main: '#005CA9', light: '#3D87CC', dark: '#003F75', contrastText: '#FFFFFF' },
    dark: { main: '#48ACFF', light: '#8AC8FF', dark: '#1A7FD0', contrastText: '#001D36' },
  },
};

const neutralLight = {
  secondary: { main: '#625B71', light: '#E8DEF8', dark: '#4A4458', contrastText: '#FFFFFF' },
  error: { main: '#B3261E', light: '#F9DEDC', dark: '#8C0D0D', contrastText: '#FFFFFF' },
  background: { default: LIGHT_BACKGROUND, paper: LIGHT_BACKGROUND },
};

const neutralDark = {
  secondary: { main: '#CCC7D8', light: '#E8DEF8', dark: '#625B71', contrastText: '#4A4458' },
  error: { main: '#F2B8B5', light: '#F9DEDC', dark: '#B3261E', contrastText: '#8C0D0D' },
  background: { default: DARK_BACKGROUND, paper: DARK_BACKGROUND },
};

/** Pilha do sistema: SF no Apple, Segoe no Windows, Roboto no Android — sem requisição de terceiros e funciona offline. */
const FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, system-ui, sans-serif';

const typographyOptions: ThemeOptions['typography'] = {
  fontFamily: FONT_FAMILY,
  h1: { fontSize: rem(32), fontWeight: 700, lineHeight: 1.25 },
  h2: { fontSize: rem(28), fontWeight: 700, lineHeight: 1.286 },
  h3: { fontSize: rem(26), fontWeight: 700, lineHeight: 1.231 },
  h4: { fontSize: rem(22), fontWeight: 700, lineHeight: 1.273 },
  h5: { fontSize: rem(20), fontWeight: 700, lineHeight: 1.4 },
  h6: { fontSize: rem(18), fontWeight: 600, lineHeight: 1.556 },
  body1: { fontSize: rem(16), fontWeight: 400, lineHeight: 1.5 },
  body2: { fontSize: rem(14), fontWeight: 400, lineHeight: 1.429 },
  button: { fontSize: rem(14), fontWeight: 600, lineHeight: 1.429 },
  caption: { fontSize: rem(12), fontWeight: 400, lineHeight: 1.333 },
};

/** Área de toque mínima recomendada: 44 × 44 pt. */
const TOUCH_TARGET = 44;

const componentOverrides: ThemeOptions['components'] = {
  // Indicador de foco do teclado: contorno de 2 px, visível em qualquer controle
  // (antes só o fundo mudava 8%, sem contorno).
  MuiButtonBase: {
    styleOverrides: {
      root: ({ theme }) => ({
        '&.Mui-focusVisible': {
          outline: `2px solid ${theme.vars?.palette.primary.main ?? theme.palette.primary.main}`,
          outlineOffset: 2,
        },
      }),
    },
  },
  MuiButton: {
    styleOverrides: {
      root: {
        borderRadius: '20px',
        textTransform: 'none' as const,
        fontWeight: 600,
        padding: '10px 24px',
        minHeight: TOUCH_TARGET,
        textAlign: 'center' as const,
      },
      outlined: { borderRadius: '8px' },
      text: { borderRadius: '8px' },
    },
  },
  MuiIconButton: {
    styleOverrides: {
      root: { minWidth: TOUCH_TARGET, minHeight: TOUCH_TARGET },
    },
  },
  MuiToggleButton: {
    styleOverrides: {
      root: ({ theme }) => ({
        minHeight: TOUCH_TARGET,
        textTransform: 'none' as const,
        fontWeight: 600,
        // Selecionado: preenchido com a cor da modalidade. Antes era cinza sobre
        // branco, quase indistinguível do estado normal.
        '&.Mui-selected': {
          backgroundColor: theme.vars?.palette.primary.main ?? theme.palette.primary.main,
          color: theme.vars?.palette.primary.contrastText ?? theme.palette.primary.contrastText,
          fontWeight: 700,
          '&:hover': {
            backgroundColor: theme.vars?.palette.primary.dark ?? theme.palette.primary.dark,
          },
        },
      }),
    },
  },
  // Um só acabamento de borda nos cartões: contorno, sem sombra (antes: os dois).
  MuiCard: {
    defaultProps: { variant: 'outlined' },
    styleOverrides: { root: { borderRadius: '12px' } },
  },
  MuiChip: {
    styleOverrides: { root: { borderRadius: '8px', fontWeight: 500 } },
  },
  MuiOutlinedInput: {
    styleOverrides: {
      root: { borderRadius: '4px', minHeight: TOUCH_TARGET },
      // O <input> em si também ocupa os 44 pt (antes só a caixa: o campo interno tinha 40).
      input: { boxSizing: 'border-box' as const, minHeight: TOUCH_TARGET },
    },
  },
  // Rótulos da barra inferior com tamanho FIXO (px de propósito). Quem aumenta o
  // texto não espera que os títulos das abas cresçam (`typography.md`: "when
  // people increase text size to read the content in a tabbed window, they don't
  // expect the tab titles to increase in size"): a 200% eles se sobrepunham e
  // ficavam cortados na barra de altura fixa.
  MuiBottomNavigationAction: {
    styleOverrides: {
      label: { fontSize: '12px', '&.Mui-selected': { fontSize: '12px', fontWeight: 700 } },
    },
  },
  MuiSlider: {
    styleOverrides: {
      // O polegar padrão (20 pt) fica abaixo do mínimo de 28 pt.
      thumb: { width: 28, height: 28 },
    },
  },
  MuiDialog: {
    styleOverrides: { paper: { borderRadius: '16px' } },
  },
};

/**
 * Tema de uma modalidade: a cor principal muda (verde / azul), o resto é comum.
 * Claro e escuro convivem no mesmo tema, escolhidos pelo navegador via CSS.
 */
export function createLotteryTheme(lottery: Lottery) {
  const brand = BRAND[lottery];
  return createTheme({
    cssVariables: { colorSchemeSelector: 'media' },
    colorSchemes: {
      light: { palette: { primary: brand.light, ...neutralLight } },
      dark: { palette: { primary: brand.dark, ...neutralDark } },
    },
    typography: typographyOptions,
    shape: { borderRadius: 8 },
    components: componentOverrides,
  });
}
