import { createTheme, ThemeOptions } from '@mui/material/styles';
import { Lottery } from './types/domain';

const lightThemeOptions: ThemeOptions = {
  palette: {
    mode: 'light',
    primary: {
      main: '#6750A4',
      light: '#EADDFF',
      dark: '#4F378B',
      contrastText: '#FFFFFF',
    },
    secondary: {
      main: '#625B71',
      light: '#E8DEF8',
      dark: '#4A4458',
      contrastText: '#FFFFFF',
    },
    error: {
      main: '#B3261E',
      light: '#F9DEDC',
      dark: '#8C0D0D',
      contrastText: '#FFFFFF',
    },
    background: {
      default: '#FFFBFE',
      paper: '#FFFBFE',
    },
  },
};

const darkThemeOptions: ThemeOptions = {
  palette: {
    mode: 'dark',
    primary: {
      main: '#D0BCFF',
      light: '#EADDFF',
      dark: '#6750A4',
      contrastText: '#4F378B',
    },
    secondary: {
      main: '#CCC7D8',
      light: '#E8DEF8',
      dark: '#625B71',
      contrastText: '#4A4458',
    },
    error: {
      main: '#F2B8B5',
      light: '#F9DEDC',
      dark: '#B3261E',
      contrastText: '#8C0D0D',
    },
    background: {
      default: '#1C1B1F',
      paper: '#1C1B1F',
    },
  },
};

const typographyOptions: ThemeOptions['typography'] = {
  fontFamily: '"Google Sans Flex", "Google Sans", system-ui, sans-serif',
  h1: { fontSize: '32px', fontWeight: 700, lineHeight: '40px' },
  h2: { fontSize: '28px', fontWeight: 700, lineHeight: '36px' },
  h3: { fontSize: '26px', fontWeight: 700, lineHeight: '32px' },
  h4: { fontSize: '22px', fontWeight: 700, lineHeight: '28px' },
  h5: { fontSize: '20px', fontWeight: 700, lineHeight: '28px' },
  h6: { fontSize: '18px', fontWeight: 600, lineHeight: '28px' },
  body1: { fontSize: '16px', fontWeight: 400, lineHeight: '24px' },
  body2: { fontSize: '14px', fontWeight: 400, lineHeight: '20px' },
  button: { fontSize: '14px', fontWeight: 600, lineHeight: '20px' },
  caption: { fontSize: '12px', fontWeight: 400, lineHeight: '16px' },
};

const componentOverrides: ThemeOptions['components'] = {
  MuiButton: {
    styleOverrides: {
      root: {
        borderRadius: '20px', // MD3 CTA pill shape
        textTransform: 'none' as const,
        fontWeight: 600,
        padding: '10px 24px',
        fontSize: '14px',
        textAlign: 'center' as const,
      },
      outlined: {
        borderRadius: '8px', // MD3 standard button
      },
      text: {
        borderRadius: '8px',
      },
    },
  },
  MuiCard: {
    styleOverrides: {
      root: {
        borderRadius: '12px', // MD3 card standard
        boxShadow: '0px 1px 2px rgba(0,0,0,0.3),0px 1px 3px rgba(0,0,0,0.15)',
      },
    },
  },
  MuiChip: {
    styleOverrides: {
      root: {
        borderRadius: '8px',
        fontWeight: 500,
      },
    },
  },
  MuiTextField: {
    styleOverrides: {
      root: {
        '& .MuiOutlinedInput-root': {
          borderRadius: '4px',
        },
      },
    },
  },
  MuiDialog: {
    styleOverrides: {
      paper: {
        borderRadius: '16px', // MD3 dialog standard
      },
    },
  },
};

/** Cores primárias por modalidade de loteria. */
const lotteryPrimaryColors: Record<Lottery, string> = {
  [Lottery.MEGA_SENA]: '#39A900', // Verde Mega-Sena
  [Lottery.MAIS_MILIONARIA]: '#005CA9', // Azul +Milionária
};

/**
 * Gera tema light customizado por modalidade.
 * Substitui a cor primária baseado na loteria selecionada.
 */
export function createLotteryLightTheme(lottery: Lottery) {
  const primaryColor = lotteryPrimaryColors[lottery];
  return createTheme({
    ...lightThemeOptions,
    palette: {
      ...lightThemeOptions.palette,
      primary: {
        main: primaryColor,
        light: `${primaryColor}20`,
        dark: primaryColor,
        contrastText: '#FFFFFF',
      },
    },
    typography: typographyOptions,
    shape: {
      borderRadius: 8,
    },
    components: componentOverrides,
  });
}

/**
 * Gera tema dark customizado por modalidade.
 * Substitui a cor primária baseado na loteria selecionada.
 */
export function createLotteryDarkTheme(lottery: Lottery) {
  const primaryColor = lotteryPrimaryColors[lottery];
  return createTheme({
    ...darkThemeOptions,
    palette: {
      ...darkThemeOptions.palette,
      primary: {
        main: primaryColor,
        light: `${primaryColor}40`,
        dark: primaryColor,
        contrastText: '#FFFFFF',
      },
    },
    typography: typographyOptions,
    shape: {
      borderRadius: 8,
    },
    components: componentOverrides,
  });
}

// Temas padrão (fallback para quando nenhuma modalidade está selecionada)
export const lightTheme = createTheme({
  ...lightThemeOptions,
  typography: typographyOptions,
  shape: {
    borderRadius: 8,
  },
  components: componentOverrides,
});

export const darkTheme = createTheme({
  ...darkThemeOptions,
  typography: typographyOptions,
  shape: {
    borderRadius: 8,
  },
  components: componentOverrides,
});
