import { describe, expect, it } from 'vitest';
import { getSyntheticFixture } from '../../../data/syntheticFixture';
import { Draw, Lottery } from '../../../types/domain';
import {
  DrawDataset,
  NonAuditableDataError,
  assertAuditable,
  coveredPeriod,
  isAuditable,
  minimumContestsFor,
} from '../provenance';

/** Histórico honesto e contíguo, distinto do seed empacotado. */
function officialLikeDraws(count: number, lottery = Lottery.MEGA_SENA, startContest = 9000): Draw[] {
  const universe = lottery === Lottery.MEGA_SENA ? 60 : 50;
  const draws: Draw[] = [];
  let state = 12345;
  const next = (bound: number): number => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state % bound;
  };
  for (let i = 0; i < count; i += 1) {
    const numbers = new Set<number>();
    while (numbers.size < 6) numbers.add(1 + next(universe));
    const trevos = new Set<number>();
    while (trevos.size < 2) trevos.add(1 + next(6));
    draws.push({
      lottery,
      contestNumber: startContest + i,
      date: new Date(Date.UTC(2020, 0, 1 + i)).toISOString().slice(0, 10),
      numbers: [...numbers].sort((a, b) => a - b),
      ...(lottery === Lottery.MAIS_MILIONARIA
        ? { trevos: [...trevos].sort((a, b) => a - b) }
        : {}),
    });
  }
  return draws;
}

function dataset(draws: Draw[], overrides: Partial<DrawDataset> = {}): DrawDataset {
  return {
    lottery: Lottery.MEGA_SENA,
    draws,
    provenance: 'official',
    sourceLabel: 'Exportação oficial (teste)',
    ...overrides,
  };
}

describe('minimumContestsFor', () => {
  it('deriva do critério de esperança >= 5 por casela', () => {
    // Mega: 5·60/6 = 50. +Mi: max(5·50/6, 5·6/2) = max(42, 15) = 42.
    expect(minimumContestsFor(Lottery.MEGA_SENA)).toBe(50);
    expect(minimumContestsFor(Lottery.MAIS_MILIONARIA)).toBe(42);
  });
});

describe('assertAuditable — a guarda', () => {
  it('aceita histórico oficial íntegro e suficiente', () => {
    expect(() => assertAuditable(dataset(officialLikeDraws(60)))).not.toThrow();
  });

  it('RECUSA dados declaradamente sintéticos', () => {
    const data = dataset(officialLikeDraws(60), { provenance: 'synthetic' });
    expect(() => assertAuditable(data)).toThrow(NonAuditableDataError);
    expect(() => assertAuditable(data)).toThrow(/histórico oficial/);
  });

  it('RECUSA procedência não estabelecida', () => {
    expect(() => assertAuditable(dataset(officialLikeDraws(60), { provenance: 'unknown' }))).toThrow(
      NonAuditableDataError,
    );
  });

  it('RECUSA o seed empacotado mesmo rotulado de oficial — defesa em profundidade', () => {
    // Este é o caso que a checagem de conteúdo existe para pegar: alguém
    // (ou algum caminho de código) afirma que o seed é dado oficial.
    const seed = getSyntheticFixture(Lottery.MEGA_SENA);
    const mislabeled = dataset(seed, {
      provenance: 'official',
      sourceLabel: 'mentira: seed rotulado de oficial',
    });
    expect(() => assertAuditable(mislabeled)).toThrow(/seed sintético empacotado/);
  });

  it('RECUSA histórico curto demais para o qui-quadrado ser válido', () => {
    expect(() => assertAuditable(dataset(officialLikeDraws(49)))).toThrow(/abaixo do mínimo/);
  });

  it('RECUSA concurso duplicado', () => {
    const draws = officialLikeDraws(60);
    draws[10] = { ...draws[10], contestNumber: draws[9].contestNumber };
    expect(() => assertAuditable(dataset(draws))).toThrow(/duplicado/);
  });

  it('RECUSA dezena fora do universo', () => {
    const draws = officialLikeDraws(60);
    draws[3] = { ...draws[3], numbers: [1, 2, 3, 4, 5, 61] };
    expect(() => assertAuditable(dataset(draws))).toThrow(/fora do universo/);
  });

  it('RECUSA quantidade errada de dezenas', () => {
    const draws = officialLikeDraws(60);
    draws[3] = { ...draws[3], numbers: [1, 2, 3, 4, 5] };
    expect(() => assertAuditable(dataset(draws))).toThrow(/esperado 6/);
  });

  it('RECUSA dezenas repetidas no mesmo concurso', () => {
    const draws = officialLikeDraws(60);
    draws[3] = { ...draws[3], numbers: [1, 1, 3, 4, 5, 6] };
    expect(() => assertAuditable(dataset(draws))).toThrow(/repetidas/);
  });

  it('RECUSA data irreconhecível', () => {
    const draws = officialLikeDraws(60);
    draws[7] = { ...draws[7], date: 'ontem' };
    expect(() => assertAuditable(dataset(draws))).toThrow(/data não reconhecida/);
  });

  it('RECUSA concurso de outra modalidade misturado', () => {
    const draws = officialLikeDraws(60);
    draws[5] = { ...draws[5], lottery: Lottery.MAIS_MILIONARIA };
    expect(() => assertAuditable(dataset(draws))).toThrow(/outra modalidade/);
  });

  it('+Milionária: exige os dois trevos em todo concurso', () => {
    const draws = officialLikeDraws(60, Lottery.MAIS_MILIONARIA, 700);
    draws[2] = { ...draws[2], trevos: [3] };
    expect(() =>
      assertAuditable(dataset(draws, { lottery: Lottery.MAIS_MILIONARIA })),
    ).toThrow(/trevos, esperado 2/);
  });
});

describe('isAuditable', () => {
  it('espelha assertAuditable sem lançar', () => {
    expect(isAuditable(dataset(officialLikeDraws(60)))).toBe(true);
    expect(isAuditable(dataset(officialLikeDraws(10)))).toBe(false);
  });
});

describe('coveredPeriod', () => {
  it('devolve a primeira e a última data do recorte', () => {
    const period = coveredPeriod(dataset(officialLikeDraws(60)));
    expect(period.start).toBe('2020-01-01');
    expect(period.end).toBe('2020-02-29');
  });
});

describe("provenance 'third_party_mirror'", () => {
  it('é auditável, ao contrário de synthetic/unknown', () => {
    const data = dataset(officialLikeDraws(60), { provenance: 'third_party_mirror' });
    expect(() => assertAuditable(data)).not.toThrow();
    expect(isAuditable(data)).toBe(true);
  });

  it('ainda passa pelas mesmas checagens de integridade estrutural', () => {
    const draws = officialLikeDraws(60);
    draws[3] = { ...draws[3], numbers: [1, 2, 3, 4, 5, 61] };
    const data = dataset(draws, { provenance: 'third_party_mirror' });
    expect(() => assertAuditable(data)).toThrow(/fora do universo/);
  });

  it('ainda é recusado se coincidir com o seed empacotado', () => {
    const seed = getSyntheticFixture(Lottery.MEGA_SENA);
    const data = dataset(seed, { provenance: 'third_party_mirror' });
    expect(() => assertAuditable(data)).toThrow(/seed sintético empacotado/);
  });
});
