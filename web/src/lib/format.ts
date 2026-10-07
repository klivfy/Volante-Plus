/**
 * Formatação de números para a interface, sempre em pt-BR.
 *
 * WHY: telas diferentes formatavam números de jeitos diferentes. O painel de
 * rateio usava `toFixed` e mostrava "15.6%" e "0.53×" ao lado de "0,54%" e
 * "12,072" em outras telas; o backtest mostrava "treino 2731" sem separador de
 * milhar (`docs/revisao-de-design-2026-10.md`, achado M1). Toda formatação de
 * número visível passa por aqui. Funções puras, sem dependências: valem no
 * motor, nos componentes e nos testes.
 */

const LOCALE = 'pt-BR';

const formatters = new Map<string, Intl.NumberFormat>();

function formatter(key: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  let cached = formatters.get(key);
  if (!cached) {
    cached = new Intl.NumberFormat(LOCALE, options);
    formatters.set(key, cached);
  }
  return cached;
}

export interface PercentOptions {
  /** Casas decimais (padrão: 1). */
  digits?: number;
  /** Mostra o sinal também nos positivos: "+12,3%". */
  signed?: boolean;
}

/** Fração como porcentagem: `0.123` → "12,3%". */
export function formatPercent(fraction: number, { digits = 1, signed = false }: PercentOptions = {}): string {
  return formatter(`percent:${digits}:${signed}`, {
    style: 'percent',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    signDisplay: signed ? 'exceptZero' : 'auto',
  }).format(fraction);
}

/** Número com casas decimais fixas: `0.6034` → "0,60" (2 casas). */
export function formatDecimal(value: number, digits = 2): string {
  return formatter(`decimal:${digits}`, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

/** Inteiro com separador de milhar: `2731` → "2.731". */
export function formatInteger(value: number): string {
  return formatter('integer', { maximumFractionDigits: 0 }).format(value);
}

/**
 * Algarismos significativos, sem notação científica: `120` → "120",
 * `0.453` → "0,45". (`toPrecision(2)` dava "1.2e+2" para 120.)
 */
export function formatSignificant(value: number, digits = 2): string {
  return formatter(`significant:${digits}`, { maximumSignificantDigits: digits }).format(value);
}

/** Fator multiplicativo: `0.531` → "0,53×". */
export function formatMultiplier(value: number, digits = 2): string {
  return `${formatDecimal(value, digits)}×`;
}

/** Valor em reais: `1234.5` → "R$ 1.234,50". */
export function formatCurrency(value: number): string {
  return formatter('currency', { style: 'currency', currency: 'BRL' }).format(value);
}

const SUPERSCRIPT_DIGITS = '⁰¹²³⁴⁵⁶⁷⁸⁹';

/** Potência de dez com expoente sobrescrito: `18` → "10¹⁸", `-3` → "10⁻³". */
export function formatPowerOfTen(exponent: number): string {
  const rounded = Math.round(exponent);
  const digits = String(Math.abs(rounded))
    .split('')
    .map((digit) => SUPERSCRIPT_DIGITS[Number(digit)])
    .join('');
  return `10${rounded < 0 ? '⁻' : ''}${digits}`;
}
