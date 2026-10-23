import { describe, expect, it } from 'vitest';
import { Lottery } from '../../../types/domain';
import { lotteryRules } from '../../prizeRules';
import {
  QUINA_BIASED_NUMBER,
  QUINA_INHERITED,
  QUINA_NEGATIVE_MAX_REJECTION_RATE,
  QUINA_POSITIVE_MIN_DETECTION_RATE,
} from '../quinaControls.preregistration';

describe('pré-registro dos controles da Quina', () => {
  it('herda o protocolo global sem alterá-lo', () => {
    expect(QUINA_INHERITED.alpha).toBe(0.05);
    expect(QUINA_INHERITED.targetPower).toBe(0.8);
    expect(QUINA_INHERITED.alternativeRelativeBias).toBe(0.2);
  });

  it('limiares são os congelados', () => {
    expect(QUINA_NEGATIVE_MAX_REJECTION_RATE).toBeCloseTo(0.0962, 3);
    expect(QUINA_POSITIVE_MIN_DETECTION_RATE).toBe(0.8);
  });

  it('a dezena viciada existe no universo da Quina', () => {
    if (!(Lottery as Record<string, string>).QUINA) return; // modalidade entra na Fase 2
    const { numberUniverse } = lotteryRules('quina' as Lottery);
    expect(QUINA_BIASED_NUMBER).toBeGreaterThanOrEqual(1);
    expect(QUINA_BIASED_NUMBER).toBeLessThanOrEqual(numberUniverse);
  });
});
