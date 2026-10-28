import { describe, expect, it } from 'vitest';
import { formatDrawMoment } from '../drawMoment';

/**
 * As asserções valem em QUALQUER fuso do dispositivo: a função inteira
 * opera em UTC (padrão do projeto, ver walkForwardMulti.ts) e formata com
 * `timeZone: 'UTC'`. É exatamente isso que se testa aqui — a saída não
 * depende de getHours() locais, que deslocavam dia e hora fora do Brasil.
 */
describe('formatDrawMoment', () => {
  it('data-only (caso real da API): mostra só a data', () => {
    const moment = formatDrawMoment('2026-11-01');
    expect(moment).toEqual({ date: '01 de novembro de 2026', time: null });
  });

  it('data e hora com Z: exibe a hora da parede em UTC', () => {
    const moment = formatDrawMoment('2026-11-01T20:00:00Z');
    expect(moment).toEqual({ date: '01 de novembro de 2026', time: '20:00' });
  });

  it('data e hora SEM offset: tratada como UTC, nunca como fuso do aparelho', () => {
    const moment = formatDrawMoment('2026-11-01T20:00:00');
    expect(moment).toEqual({ date: '01 de novembro de 2026', time: '20:00' });
  });

  it('meia-noite exata em UTC é ambígua: mostra só a data', () => {
    const moment = formatDrawMoment('2026-11-01T00:00:00Z');
    expect(moment.time).toBeNull();
  });

  it('offset explícito é respeitado (não reinterpreta o relógio como UTC)', () => {
    // 21:00 em -03:00 = 00:00 UTC do dia seguinte: exibe a data UTC seguinte
    // e meia-noite é ambígua, então só a data.
    const moment = formatDrawMoment('2026-11-01T21:00:00-03:00');
    expect(moment).toEqual({ date: '02 de novembro de 2026', time: null });
  });

  it('string malformada que passe no parseDrawDate não derruba o cartão', () => {
    // parseDrawDate só confere o prefixo 'YYYY-MM-DD'; o resto pode ser lixo.
    const moment = formatDrawMoment('2026-99-99T99:99:99Z');
    expect(moment).toEqual({ date: '2026-99-99T99:99:99Z', time: null });
  });
});
