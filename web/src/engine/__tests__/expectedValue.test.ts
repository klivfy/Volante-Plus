import { describe, expect, it } from 'vitest';
import { Lottery } from '../../types/domain';
import {
  calculateEV,
  expectedShareOfPool,
  kellyCriterion,
  kellyFraction,
  kellySimulation,
  probabilityOfAnyWinner,
  PrizeAverage,
} from '../expectedValue';

const MEGA_PRIZES: PrizeAverage[] = [
  { tier: '6', averagePrize: 0 }, // entra via accumulatedPrize
  { tier: '5', averagePrize: 50_000 },
  { tier: '4', averagePrize: 1_000 },
];

describe('calculateEV', () => {
  it('é negativo para um bilhete comum sem acumulação relevante', () => {
    const result = calculateEV(Lottery.MEGA_SENA, MEGA_PRIZES, 5, 0);
    expect(result.ev).toBeLessThan(0);
  });

  it('cresce com o valor acumulado', () => {
    const small = calculateEV(Lottery.MEGA_SENA, MEGA_PRIZES, 5, 10_000_000);
    const large = calculateEV(Lottery.MEGA_SENA, MEGA_PRIZES, 5, 500_000_000);
    expect(large.ev).toBeGreaterThan(small.ev);
  });

  it('breakEvenAccumulated é positivo e finito para a Mega-Sena', () => {
    const result = calculateEV(Lottery.MEGA_SENA, MEGA_PRIZES, 5, 0);
    expect(result.breakEvenAccumulated).toBeGreaterThan(0);
    expect(Number.isFinite(result.breakEvenAccumulated)).toBe(true);
  });
});

describe('kellyCriterion', () => {
  it('recomenda fração positiva quando as odds líquidas favorecem o apostador', () => {
    // p alto e odds boas o suficiente para vantagem clara.
    const result = kellyCriterion(0.5, 2);
    expect(result.isPositive).toBe(true);
    expect(result.fraction).toBeGreaterThan(0);
  });

  it('recomenda zero para odds desfavoráveis', () => {
    const result = kellyCriterion(0.001, 0.5);
    expect(result.isPositive).toBe(false);
    expect(result.fraction).toBe(0);
  });

  it('degenera com segurança para odds <= 0', () => {
    expect(kellyCriterion(0.5, 0)).toEqual({ fraction: 0, isPositive: false });
  });
});

describe('kellySimulation', () => {
  it('recomenda aposta zero quando o EV não é positivo', () => {
    const result = kellySimulation(1000, Lottery.MEGA_SENA, MEGA_PRIZES, 5, 0);
    expect(result.recommendedBet).toBe(0);
    expect(result.fraction).toBe(0);
  });
});

describe('rateio do prêmio acumulado', () => {
  const TICKETS = 10_000_000;

  it('expectedShareOfPool bate com a soma termo a termo da binomial', () => {
    // Verificação independente da identidade E[1/(1+K)] = (1-(1-p)^N)/(N·p):
    // soma direta sobre K ~ Binomial(N-1, p), viável para N pequeno.
    const n = 40;
    const p = 0.08;
    const pool = 1_000;

    let direct = 0;
    let term = Math.pow(1 - p, n - 1); // k = 0
    for (let k = 0; k <= n - 1; k += 1) {
      direct += (term * pool) / (1 + k);
      term = (term * (n - 1 - k) * p) / ((k + 1) * (1 - p));
    }
    direct *= p; // condicional a a própria aposta acertar

    expect(expectedShareOfPool(pool, p, n)).toBeCloseTo(direct, 9);
  });

  it('probabilityOfAnyWinner casa com o cálculo ingênuo onde ele ainda é exato', () => {
    // Com p moderado e N pequeno, `1 - (1-p)^N` não sofre cancelamento e
    // serve de referência independente.
    const p = 1e-3;
    const n = 1_000;
    expect(probabilityOfAnyWinner(p, n)).toBeCloseTo(1 - Math.pow(1 - p, n), 12);
  });

  it('probabilityOfAnyWinner fica logo acima do limite de Poisson', () => {
    // Para p da ordem de 1e-8 e N de 1e7 a versão ingênua perde precisão, mas
    // duas relações exatas continuam valendo e fixam o resultado sem depender
    // de aproximação: ln(1-p) < -p, logo (1-p)^N < e^(-Np) e o valor é
    // *maior* que o de Poisson; e a diferença relativa é da ordem de N·p²/2.
    const p = 1 / 50_063_860; // Mega-Sena, aposta simples
    const value = probabilityOfAnyWinner(p, TICKETS);
    const poisson = -Math.expm1(-TICKETS * p);

    // Segunda ordem: ln(1-p) = -p - p²/2 - …, então
    // 1-(1-p)^N - (1-e^(-Np)) ≈ e^(-Np) · N·p²/2. Bater com essa previsão em
    // 6 casas relativas só é possível se os dois lados estiverem corretos.
    const previsto = (1 - poisson) * ((TICKETS * p * p) / 2);
    expect(value).toBeGreaterThan(poisson);
    expect(Math.abs(value - poisson - previsto) / previsto).toBeLessThan(1e-6);
  });

  it('o acumulado rende menos quando é rateado do que quando não é', () => {
    // O bug corrigido: tratar o bolo como prêmio integral superestima o EV
    // exatamente no regime que interessa — acumulação alta.
    const teto = calculateEV(Lottery.MEGA_SENA, MEGA_PRIZES, 5, 500_000_000);
    const real = calculateEV(Lottery.MEGA_SENA, MEGA_PRIZES, 5, 500_000_000, TICKETS);

    expect(teto.sharedPool).toBe(false);
    expect(real.sharedPool).toBe(true);
    expect(real.accumulatedContribution).toBeLessThan(teto.accumulatedContribution);
    expect(real.ev).toBeLessThan(teto.ev);
  });

  it('o acumulado necessário para zerar o EV é maior com rateio', () => {
    const teto = calculateEV(Lottery.MEGA_SENA, MEGA_PRIZES, 5, 0);
    const real = calculateEV(Lottery.MEGA_SENA, MEGA_PRIZES, 5, 0, TICKETS);
    expect(real.breakEvenAccumulated).toBeGreaterThan(teto.breakEvenAccumulated);
    expect(Number.isFinite(real.breakEvenAccumulated)).toBe(true);
  });
});

describe('kellyFraction', () => {
  it('reproduz a fórmula clássica quando há um único prêmio', () => {
    // p = 0,5 e prêmio de 3× o custo => odds líquidas b = 2 e f* = 0,25.
    expect(kellyFraction([{ probability: 0.5, grossReturn: 3 }])).toBeCloseTo(0.25, 9);
  });

  it('devolve zero quando o EV é negativo', () => {
    // E[R] = 0,5 × 1,5 = 0,75 < 1.
    expect(kellyFraction([{ probability: 0.5, grossReturn: 1.5 }])).toBe(0);
  });

  it('nunca recomenda mais que a banca inteira', () => {
    const f = kellyFraction([{ probability: 0.99, grossReturn: 1_000 }]);
    expect(f).toBeGreaterThan(0);
    expect(f).toBeLessThanOrEqual(1);
  });

  it('cresce com a vantagem, mantida a probabilidade', () => {
    const modesta = kellyFraction([{ probability: 0.5, grossReturn: 2.5 }]);
    const generosa = kellyFraction([{ probability: 0.5, grossReturn: 6 }]);
    expect(generosa).toBeGreaterThan(modesta);
  });
});

describe('kellySimulation com EV positivo', () => {
  // REGRESSÃO: a versão anterior passava `ev / custo` como odds líquidas para
  // a fórmula de dois resultados. Com b ~ 1e-3 e q ~ 1 o numerador era
  // enormemente negativo e a função devolvia 0 para *qualquer* entrada — nunca
  // recomendava nada, nem no cenário de EV positivo que ela existia para medir.
  const ACUMULADO_ABSURDO = 2_000_000_000_000;

  it('recomenda fração positiva quando o EV é de fato positivo', () => {
    const { ev, fraction, recommendedBet } = kellySimulation(
      1_000,
      Lottery.MEGA_SENA,
      MEGA_PRIZES,
      5,
      ACUMULADO_ABSURDO,
    );
    expect(ev).toBeGreaterThan(0);
    expect(fraction).toBeGreaterThan(0);
    expect(recommendedBet).toBeCloseTo(1_000 * fraction, 9);
  });

  it('o rateio reduz a fração recomendada', () => {
    const teto = kellySimulation(1_000, Lottery.MEGA_SENA, MEGA_PRIZES, 5, ACUMULADO_ABSURDO);
    const real = kellySimulation(
      1_000,
      Lottery.MEGA_SENA,
      MEGA_PRIZES,
      5,
      ACUMULADO_ABSURDO,
      10_000_000,
    );
    expect(real.fraction).toBeLessThan(teto.fraction);
  });
});
