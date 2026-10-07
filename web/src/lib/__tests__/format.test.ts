import { describe, expect, it } from 'vitest';
import {
  formatCurrency,
  formatDecimal,
  formatInteger,
  formatMultiplier,
  formatPercent,
  formatPowerOfTen,
  formatSignificant,
} from '../format';

// O Intl separa "R$" do valor com espaço não separável (U+00A0).
const nbsp = (text: string) => text.replace(/ /g, ' ');

describe('formatação em pt-BR', () => {
  it('porcentagem com vírgula decimal, nunca ponto', () => {
    expect(formatPercent(0.156)).toBe('15,6%');
    expect(formatPercent(0.00149, { digits: 3 })).toBe('0,149%');
    expect(formatPercent(-0.45004)).toBe('-45,0%');
  });

  it('porcentagem com sinal explícito nos positivos', () => {
    expect(formatPercent(0.14, { signed: true })).toBe('+14,0%');
    expect(formatPercent(-0.003, { signed: true })).toBe('-0,3%');
    expect(formatPercent(0, { signed: true })).toBe('0,0%');
  });

  it('decimal com casas fixas', () => {
    expect(formatDecimal(0.6034)).toBe('0,60');
    expect(formatDecimal(12.0725, 3)).toBe('12,073');
  });

  it('inteiro com separador de milhar', () => {
    expect(formatInteger(2731)).toBe('2.731');
    expect(formatInteger(30_000_000)).toBe('30.000.000');
    expect(formatInteger(335)).toBe('335');
  });

  it('algarismos significativos sem notação científica', () => {
    // Regressão: o fator de Bayes usava toPrecision(2), que dá "1.2e+2" para 120.
    expect(formatSignificant(120)).toBe('120');
    expect(formatSignificant(456)).toBe('460');
    expect(formatSignificant(0.453)).toBe('0,45');
    expect(formatSignificant(2)).toBe('2');
  });

  it('fator multiplicativo', () => {
    expect(formatMultiplier(0.531)).toBe('0,53×');
  });

  it('moeda', () => {
    expect(nbsp(formatCurrency(1234.5))).toBe('R$ 1.234,50');
  });

  it('potência de dez com expoente sobrescrito', () => {
    expect(formatPowerOfTen(18)).toBe('10¹⁸');
    expect(formatPowerOfTen(-3)).toBe('10⁻³');
    expect(formatPowerOfTen(17.6)).toBe('10¹⁸');
  });
});
