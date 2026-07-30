import { createTheme, ThemeOptions } from '@mui/material/styles';

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

const typographyOptions = {
  fontFamily: '"Open Sans", sans-serif',
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

const componentOverrides = {
  MuiButton: {
    styleOverrides: {
      root: {
        borderRadius: '24px',
        textTransform: 'none' as const,
        fontWeight: 600,
      },
    },
  },
  MuiCard: {
    styleOverrides: {
      root: {
        borderRadius: '12px',
      },
    },
  },
};

export const lightTheme = createTheme({
  ...lightThemeOptions,
  typography: typographyOptions as any,
  shape: {
    borderRadius: 8,
  },
  components: componentOverrides,
});

export const darkTheme = createTheme({
  ...darkThemeOptions,
  typography: typographyOptions as any,
  shape: {
    borderRadius: 8,
  },
  components: componentOverrides,
});
