import { createTheme, ThemeOptions } from '@mui/material/styles';
import { Lottery } from './types/domain';

/**
 * Tema do Volante+ — Material Design 3 (Material You) + Google Sans Flex.
 *
 * ## Material Design 3
 * O app adota os papéis (roles) de cor, a escala tipográfica e a escala de
 * forma do M3 (m3.material.io). Diferenças visíveis em relação ao tema
 * anterior (que seguia o baseline do MD2):
 *
 * - **Superfícies M3**: `surface` #FEF7FF (claro) / #141218 (escuro) e a
 *   família `surfaceContainer*` substituem os antigos `#FFFBFE`/`#1C1B1F`.
 *   Cartões e a barra de navegação usam `surfaceContainer`; diálogos usam
 *   `surfaceContainerHigh` — hierarquia por tono, não só por sombra.
 * - **Forma**: botões em pílula completa (canto "full" do M3), diálogos com
 *   canto extra-large (28), cartões medium (12), campos extra-small (4).
 * - **Tipografia**: escala M3 — display/headline em peso 400, títulos em
 *   500, rótulos em 500 com tracking próprio da escala (valores em `em`
 *   para escalar com o tamanho de fonte do usuário).
 * - **Indicador de navegação**: pílula `secondaryContainer` em volta do
 *   ícone ativo (padrão NavigationBar do M3).
 *
 * ## Google Sans Flex
 * Fonte da marca do Google para Android/Material 3, sob OFL-1.1
 * (`src/fonts/OFL.txt`), auto-hospedada (`next/font/local` em `layout.tsx`)
 * e exposta como `--font-google-sans-flex`. Auto-hospedar evita requisição
 * a terceiros (LGPD — nenhum IP é enviado a servidores de fonte) e mantém
 * o app utilizável offline (PWA). A pilha do sistema continua como fallback.
 *
 * ## Claro/escuro por CSS, não por JavaScript
 * O tema usa variáveis CSS (`cssVariables`) com `colorSchemeSelector: 'media'`: as
 * duas paletas vão no stylesheet e o navegador escolhe por `prefers-color-scheme`.
 * Antes, o tema escuro era escolhido por `useMediaQuery` DEPOIS da hidratação,
 * então na primeira carga em modo escuro os cartões ficavam claros
 * com texto branco (contraste 1,02:1) até uma navegação ou recarga corrigir.
 *
 * ## Contraste das cores (WCAG, calculado — ver `theme.md3.test.ts`)
 * Rótulo sobre a cor principal (mínimo 4,5:1 exigido pelo teste):
 *
 * | Modalidade / aparência | cor principal | rótulo sobre ela |
 * |---|---|---|
 * | Mega-Sena, claro   | #2B8300 | branco 4,83:1 |
 * | Mega-Sena, escuro  | #40BE00 | #0B2000 7,03:1 |
 * | +Milionária, claro | #005CA9 | branco 6,77:1 |
 * | +Milionária, escuro| #48ACFF | #001D36 7,01:1 |
 * | Quina, claro       | #5E35B1 | branco 8,02:1 |
 * | Quina, escuro      | #C4A5FF | #2A0A5E 7,80:1 |
 *
 * Os pares novos do M3 (`primaryContainer`/`onPrimaryContainer`,
 * `secondaryContainer`/`onSecondaryContainer`, superfícies M3) passam em
 * 6,88:1 ou mais — a tabela completa é verificada a cada teste
 * (`theme.md3.test.ts`), que falha o CI se qualquer par cair abaixo de 4,5:1.
 *
 * ## Tamanho de texto
 * Tamanhos em `rem`, não `px`: com `px` o texto ignorava a preferência de
 * tamanho de fonte do navegador/sistema (200% no `<html>` deixava o corpo em 14 px).
 */

// Augmentação de tipos: papéis M3 como chaves de primeira classe na paleta.
declare module '@mui/material/styles' {
  interface Palette {
    primaryContainer: string;
    onPrimaryContainer: string;
    secondaryContainer: string;
    onSecondaryContainer: string;
    surfaceContainerLowest: string;
    surfaceContainerLow: string;
    surfaceContainer: string;
    surfaceContainerHigh: string;
    surfaceContainerHighest: string;
    surfaceVariant: string;
    onSurfaceVariant: string;
    outline: string;
    outlineVariant: string;
  }
  interface PaletteOptions {
    primaryContainer?: string;
    onPrimaryContainer?: string;
    secondaryContainer?: string;
    onSecondaryContainer?: string;
    surfaceContainerLowest?: string;
    surfaceContainerLow?: string;
    surfaceContainer?: string;
    surfaceContainerHigh?: string;
    surfaceContainerHighest?: string;
    surfaceVariant?: string;
    onSurfaceVariant?: string;
    outline?: string;
    outlineVariant?: string;
  }
}

const rem = (px: number): string => `${px / 16}rem`;

// ---------------------------------------------------------------------------
// Papéis M3 do esquema neutro (baseline do Material Design 3). As cores de
// marca por modalidade entram em `primary`; o restante dos papéis é comum.
// ---------------------------------------------------------------------------
export const M3_NEUTRAL = {
  light: {
    surface: '#FEF7FF',
    surfaceDim: '#DED8E1',
    surfaceContainerLowest: '#FFFFFF',
    surfaceContainerLow: '#F7F2FA',
    surfaceContainer: '#F3EDF7',
    surfaceContainerHigh: '#ECE6F0',
    surfaceContainerHighest: '#E6E0E9',
    onSurface: '#1D1B20',
    surfaceVariant: '#E7E0EC',
    onSurfaceVariant: '#49454F',
    outline: '#79747E',
    outlineVariant: '#CAC4D0',
    secondaryContainer: '#E8DEF8',
    onSecondaryContainer: '#1D192B',
  },
  dark: {
    surface: '#141218',
    surfaceDim: '#141218',
    surfaceContainerLowest: '#0F0D13',
    surfaceContainerLow: '#1D1B20',
    surfaceContainer: '#211F26',
    surfaceContainerHigh: '#2B2930',
    surfaceContainerHighest: '#36343B',
    onSurface: '#E6E0E9',
    surfaceVariant: '#49454F',
    onSurfaceVariant: '#CAC4D0',
    outline: '#938F99',
    outlineVariant: '#49454F',
    secondaryContainer: '#4A4458',
    onSecondaryContainer: '#E8DEF8',
  },
} as const;

// ---------------------------------------------------------------------------
// Containers de marca por modalidade (papéis `primaryContainer` do M3):
// tom claro da cor da marca no esquema claro (container 90 / conteúdo 10) e
// tom escuro no esquema escuro (container 30 / conteúdo 90). Pares verificados
// em WCAG — mínimo 6,88:1 (tabela completa no teste `theme.md3.test.ts`).
// ---------------------------------------------------------------------------
export const M3_BRAND_CONTAINER: Record<
  Lottery,
  { light: { container: string; on: string }; dark: { container: string; on: string } }
> = {
  [Lottery.MEGA_SENA]: {
    light: { container: '#B4F1A1', on: '#0A2900' }, // 12,06:1
    dark: { container: '#0F4A00', on: '#B4F1A1' }, // 8,02:1
  },
  [Lottery.MAIS_MILIONARIA]: {
    light: { container: '#CFE5FF', on: '#001D36' }, // 13,27:1
    dark: { container: '#0B4B87', on: '#CFE5FF' }, // 6,88:1
  },
  [Lottery.QUINA]: {
    light: { container: '#E9DDFF', on: '#2A0A5E' }, // 12,47:1
    dark: { container: '#43217E', on: '#E9DDFF' }, // 9,25:1
  },
};

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
  [Lottery.QUINA]: {
    light: { main: '#5E35B1', light: '#8E65D6', dark: '#3F1D82', contrastText: '#FFFFFF' },
    dark: { main: '#C4A5FF', light: '#DCC8FF', dark: '#9A74E0', contrastText: '#2A0A5E' },
  },
};

const SECONDARY = {
  light: { main: '#625B71', light: '#E8DEF8', dark: '#4A4458', contrastText: '#FFFFFF' },
  dark: { main: '#CCC7D8', light: '#E8DEF8', dark: '#625B71', contrastText: '#4A4458' },
};

const ERROR = {
  light: { main: '#B3261E', light: '#F9DEDC', dark: '#8C0D0D', contrastText: '#FFFFFF' },
  dark: { main: '#F2B8B5', light: '#F9DEDC', dark: '#B3261E', contrastText: '#8C0D0D' },
};

/**
 * Google Sans Flex (variável, 100–900): definida em `layout.tsx` via
 * `next/font/local` e exposta como `--font-google-sans-flex`. A pilha do
 * sistema vem logo depois como fallback — sem ela, quem bloqueia fontes
 * cairia em serif por padrão.
 */
export const FONT_FAMILY =
  'var(--font-google-sans-flex), -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, system-ui, sans-serif';

// Escala tipográfica M3 mapeada nos slots do MUI. Tracking em `em` para
// escalar junto com o tamanho de fonte do usuário. Display/headline em 400
// e títulos/rótulos em 500, como define a escala do M3.
const typographyOptions: ThemeOptions['typography'] = {
  fontFamily: FONT_FAMILY,
  // display-large 57 · display-medium 45 — não usados nos slots; disponíveis
  // como `displayLarge`/`displayMedium` se uma tela precisar.
  h1: { fontSize: rem(32), fontWeight: 400, lineHeight: 1.25 }, // headline-large
  h2: { fontSize: rem(28), fontWeight: 400, lineHeight: 1.286 }, // headline-medium
  h3: { fontSize: rem(24), fontWeight: 400, lineHeight: 1.333 }, // headline-small
  h4: { fontSize: rem(22), fontWeight: 400, lineHeight: 1.273 }, // title-large
  h5: { fontSize: rem(20), fontWeight: 500, lineHeight: 1.4, letterSpacing: '0.009375em' }, // title-medium ampliado
  h6: { fontSize: rem(16), fontWeight: 500, lineHeight: 1.5, letterSpacing: '0.009375em' }, // title-medium
  subtitle1: { fontSize: rem(16), fontWeight: 400, lineHeight: 1.5, letterSpacing: '0.009375em' },
  subtitle2: { fontSize: rem(14), fontWeight: 500, lineHeight: 1.429, letterSpacing: '0.00714em' }, // title-small
  body1: { fontSize: rem(16), fontWeight: 400, lineHeight: 1.5, letterSpacing: '0.03125em' }, // body-large
  body2: { fontSize: rem(14), fontWeight: 400, lineHeight: 1.429, letterSpacing: '0.01786em' }, // body-medium
  button: { fontSize: rem(14), fontWeight: 500, lineHeight: 1.429, letterSpacing: '0.00714em' }, // label-large
  caption: { fontSize: rem(12), fontWeight: 400, lineHeight: 1.333, letterSpacing: '0.03333em' }, // body-small
  overline: { fontSize: rem(11), fontWeight: 500, lineHeight: 1.455, letterSpacing: '0.04545em' }, // label-small
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
  // M3: botão em pílula completa ("corner full"), rótulo label-large (500).
  MuiButton: {
    styleOverrides: {
      root: {
        borderRadius: '9999px',
        textTransform: 'none' as const,
        fontWeight: 500,
        padding: '10px 24px',
        minHeight: TOUCH_TARGET,
        textAlign: 'center' as const,
      },
    },
  },
  // A11y (contraste, WCAG 1.4.3): com o campo desabilitado (estado
  // "Analisando histórico"), o MUI pinta helperText/rótulo com
  // `text.disabled` (α 38% → 2,66:1 no claro) e o Lighthouse/axe reprova.
  // O texto de ajuda segue legível com `text.secondary` (≥4,5:1 nos dois
  // esquemas); o campo em si continua visualmente travado.
  MuiFormHelperText: {
    styleOverrides: {
      root: ({ theme }) => ({
        '&.Mui-disabled': {
          color: theme.vars?.palette.text.secondary ?? theme.palette.text.secondary,
        },
      }),
    },
  },
  MuiInputLabel: {
    styleOverrides: {
      root: ({ theme }) => ({
        '&.Mui-disabled': {
          color: theme.vars?.palette.text.secondary ?? theme.palette.text.secondary,
        },
      }),
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
        fontWeight: 500,
        // Selecionado: preenchido com a cor da modalidade (contraste
        // verificado ≥4,5:1) — mais forte que `secondaryContainer` e mantém
        // a distinção do estado mesmo em visão de baixo contraste.
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
  // Cartão M3: canto medium (12), variante outlined com contorno
  // `outlineVariant` (o `divider` do tema já aponta para ele) e fundo
  // `surfaceContainer` (hierarquia por tono, sem sombra).
  MuiCard: {
    defaultProps: { variant: 'outlined' },
    styleOverrides: { root: { borderRadius: '12px' } },
  },
  // Chip M3: canto small (8), rótulo label-large.
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
  // Diálogo M3: canto extra-large (28) sobre `surfaceContainerHigh` —
  // um degrau acima do conteúdo, como define o componente no M3.
  MuiDialog: {
    styleOverrides: {
      paper: ({ theme }) => ({
        borderRadius: '28px',
        backgroundColor:
          theme.vars?.palette.surfaceContainerHigh ?? theme.palette.surfaceContainerHigh,
      }),
    },
  },
  // NavigationBar do M3: pílula `secondaryContainer` em volta do ícone
  // ativo (indicador do M3) e rótulo ativo em `onSecondaryContainer`.
  // O fundo vem de `background.paper` = `surfaceContainer`.
  MuiBottomNavigationAction: {
    styleOverrides: {
      root: ({ theme }) => ({
        '&.Mui-selected': {
          color: theme.vars?.palette.onSecondaryContainer ?? theme.palette.onSecondaryContainer,
        },
        // A pílula envolve o ícone (o MUI não expõe slot próprio; o ícone
        // é filho direto do action). Padding fixo: a pílula tem 32×64 px
        // como a NavigationBar do M3 e não escala com o texto.
        '& .MuiSvgIcon-root': {
          borderRadius: '9999px',
          padding: '4px 20px',
          boxSizing: 'content-box' as const,
        },
        '&.Mui-selected .MuiSvgIcon-root': {
          backgroundColor:
            theme.vars?.palette.secondaryContainer ?? theme.palette.secondaryContainer,
        },
      }),
      // Rótulos da barra inferior com tamanho FIXO (px de propósito). Quem aumenta o
      // texto não espera que os títulos das abas cresçam (`typography.md`: "when
      // people increase text size to read the content in a tabbed window, they don't
      // expect the tab titles to increase in size"): a 200% eles se sobrepunham e
      // ficavam cortados na barra de altura fixa.
      label: { fontSize: '12px', '&.Mui-selected': { fontSize: '12px', fontWeight: 700 } },
    },
  },
  MuiSlider: {
    styleOverrides: {
      // O polegar padrão (20 pt) fica abaixo do mínimo de 28 pt.
      thumb: { width: 28, height: 28 },
    },
  },
};

/**
 * Tema de uma modalidade: a cor principal (e o container de marca) mudam, o
 * resto é o esquema neutro M3. Claro e escuro convivem no mesmo tema,
 * escolhidos pelo navegador via CSS.
 */
export function createLotteryTheme(lottery: Lottery) {
  const brand = BRAND[lottery];
  const container = M3_BRAND_CONTAINER[lottery];

  const scheme = (mode: 'light' | 'dark') => {
    const neutral = M3_NEUTRAL[mode];
    return {
      palette: {
        primary: brand[mode],
        secondary: SECONDARY[mode],
        error: ERROR[mode],
        background: { default: neutral.surface, paper: neutral.surfaceContainer },
        text: { primary: neutral.onSurface, secondary: neutral.onSurfaceVariant },
        divider: neutral.outlineVariant,
        primaryContainer: container[mode].container,
        onPrimaryContainer: container[mode].on,
        secondaryContainer: neutral.secondaryContainer,
        onSecondaryContainer: neutral.onSecondaryContainer,
        surfaceContainerLowest: neutral.surfaceContainerLowest,
        surfaceContainerLow: neutral.surfaceContainerLow,
        surfaceContainer: neutral.surfaceContainer,
        surfaceContainerHigh: neutral.surfaceContainerHigh,
        surfaceContainerHighest: neutral.surfaceContainerHighest,
        surfaceVariant: neutral.surfaceVariant,
        onSurfaceVariant: neutral.onSurfaceVariant,
        outline: neutral.outline,
        outlineVariant: neutral.outlineVariant,
      },
    };
  };

  return createTheme({
    cssVariables: { colorSchemeSelector: 'media' },
    colorSchemes: { light: scheme('light'), dark: scheme('dark') },
    typography: typographyOptions,
    shape: { borderRadius: 12 },
    components: componentOverrides,
  });
}
