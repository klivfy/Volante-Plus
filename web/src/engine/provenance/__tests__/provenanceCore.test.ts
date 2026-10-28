import { describe, expect, it } from 'vitest';
import { Draw, Lottery } from '../../../types/domain';
import { isValidDraw } from '../../../services/drawSources';
import { HISTORY_SEED_META, loadHistorySeed } from '../../../data/history';
import {
  ALL_LOTTERIES,
  MIRROR_SNAPSHOT,
  compareOnlineSources,
  drawsAgree,
  offlineDivergences,
  onlineDivergences,
  verifyLotteryProvenance,
} from '../provenanceCore';

/**
 * Procedência automatizada (Fase 4, frente 2) — o núcleo puro sob controle
 * positivo E negativo: as mesmas funções que o workflow `provenance.yml`
 * agenda têm de aprovar o seed real e REJEITAR histórico sabotado. Verificação
 * que só sabe aprovar não verifica nada.
 */

function draw(lottery: Lottery, contest: number, numbers: number[], date: string, trevos?: number[]): Draw {
  return {
    lottery,
    contestNumber: contest,
    date,
    numbers: [...numbers].sort((a, b) => a - b),
    ...(trevos ? { trevos: [...trevos].sort((a, b) => a - b) } : {}),
  };
}

const MEGA_META = HISTORY_SEED_META[Lottery.MEGA_SENA];

describe('procedência offline — seed real', () => {
  it.each(ALL_LOTTERIES)('%s: contíguo, válido e coincidente com o espelho', async (lottery) => {
    const seed = await loadHistorySeed(lottery);
    const meta = HISTORY_SEED_META[lottery];
    const verdict = verifyLotteryProvenance(lottery, seed, meta, MIRROR_SNAPSHOT[lottery]);
    expect(verdict.contiguous).toBe(true);
    expect(verdict.structurallyInvalid).toEqual([]);
    expect(verdict.missingFromSeed).toEqual([]);
    expect(verdict.mirrorDivergences).toEqual([]);
    expect(verdict.mirrorCompared).toBeGreaterThan(0);
    expect(offlineDivergences(verdict, meta)).toEqual([]);
  });
});

describe('procedência offline — controles negativos', () => {
  it('dezena sabotada num concurso em comum é detectada no concurso exato', async () => {
    const seed = (await loadHistorySeed(Lottery.MEGA_SENA)).slice();
    const mirror = MIRROR_SNAPSHOT[Lottery.MEGA_SENA];
    const overlap = mirror[0].contestNumber;
    const sabotaged = seed.find((d) => d.contestNumber === overlap)!;
    const original = sabotaged.numbers[0];
    sabotaged.numbers[0] = original === 1 ? 2 : 1;
    const verdict = verifyLotteryProvenance(Lottery.MEGA_SENA, seed, MEGA_META, mirror);
    expect(verdict.mirrorDivergences).toHaveLength(1);
    expect(verdict.mirrorDivergences[0].contest).toBe(overlap);
    const divergences = offlineDivergences(verdict, MEGA_META);
    expect(divergences).toHaveLength(1);
    expect(divergences[0].check).toBe('espelho');
  });

  it('concurso removido do seed aparece como ausente/quebra de contiguidade', async () => {
    const seed = (await loadHistorySeed(Lottery.MEGA_SENA)).filter((d) => d.contestNumber !== 10);
    const verdict = verifyLotteryProvenance(Lottery.MEGA_SENA, seed, MEGA_META, MIRROR_SNAPSHOT[Lottery.MEGA_SENA]);
    expect(verdict.contiguous).toBe(false);
    const divergences = offlineDivergences(verdict, MEGA_META);
    expect(divergences.some((d) => d.check === 'contiguidade')).toBe(true);
  });

  it('concurso fora das regras da modalidade é detectado', async () => {
    const seed = (await loadHistorySeed(Lottery.MAIS_MILIONARIA)).slice();
    seed[0].trevos = [1, 6, 3]; // três trevos: viola a regra (2 distintos)
    const verdict = verifyLotteryProvenance(
      Lottery.MAIS_MILIONARIA,
      seed,
      HISTORY_SEED_META[Lottery.MAIS_MILIONARIA],
      MIRROR_SNAPSHOT[Lottery.MAIS_MILIONARIA],
    );
    expect(verdict.structurallyInvalid).toContain(seed[0].contestNumber);
  });
});

describe('procedência online — cruzamento de fontes (puro)', () => {
  const seed = [
    draw(Lottery.MEGA_SENA, 3063, [10, 25, 31, 44, 55, 58], '2026-09-27'),
  ];

  it('fontes que concordam entre si e com o seed: ok', () => {
    const a = { source: 'comunidade', draw: draw(Lottery.MEGA_SENA, 3076, [5, 12, 23, 34, 45, 56], '2026-10-25') };
    const b = { source: 'guidi', draw: draw(Lottery.MEGA_SENA, 3076, [5, 12, 23, 34, 45, 56], '2026-10-25') };
    const verdict = compareOnlineSources(Lottery.MEGA_SENA, [a, b], seed);
    expect(verdict.ok).toBe(true);
    expect(verdict.responsiveSources).toBe(2);
    expect(verdict.newContestsBeyondSeed).toBe(13);
    expect(onlineDivergences(verdict)).toEqual([]);
  });

  it('fontes que divergem para o MESMO concurso: alarme nas duas', () => {
    const a = { source: 'comunidade', draw: draw(Lottery.MEGA_SENA, 3076, [5, 12, 23, 34, 45, 56], '2026-10-25') };
    const b = { source: 'guidi', draw: draw(Lottery.MEGA_SENA, 3076, [5, 12, 23, 34, 45, 99], '2026-10-25') };
    const verdict = compareOnlineSources(Lottery.MEGA_SENA, [a, b], seed);
    expect(verdict.ok).toBe(false);
    const divergences = onlineDivergences(verdict);
    expect(divergences).toHaveLength(2);
    expect(divergences.every((d) => d.check === 'fontes')).toBe(true);
  });

  it('fonte em defasagem (concurso anterior) não é divergência', () => {
    const a = { source: 'comunidade', draw: draw(Lottery.MEGA_SENA, 3076, [5, 12, 23, 34, 45, 56], '2026-10-25') };
    const b = { source: 'guidi', draw: draw(Lottery.MEGA_SENA, 3075, [1, 2, 3, 4, 5, 6], '2026-10-22') };
    const verdict = compareOnlineSources(Lottery.MEGA_SENA, [a, b], seed);
    expect(verdict.ok).toBe(true);
  });

  it('fonte que devolve concurso JÁ no seed com resultado diferente: alarme contra o seed', () => {
    const a = { source: 'comunidade', draw: draw(Lottery.MEGA_SENA, 3063, [10, 25, 31, 44, 55, 99], '2026-09-27') };
    const verdict = compareOnlineSources(Lottery.MEGA_SENA, [a], seed);
    expect(verdict.ok).toBe(false);
    const divergences = onlineDivergences(verdict);
    expect(divergences).toHaveLength(1);
    expect(divergences[0].detail).toContain('diverge do seed');
  });

  it('nenhuma fonte respondeu: declarado, sem alarme (gate não treme por rede)', () => {
    const a = { source: 'comunidade', draw: null };
    const b = { source: 'guidi', draw: null };
    const verdict = compareOnlineSources(Lottery.MEGA_SENA, [a, b], seed);
    expect(verdict.ok).toBe(true);
    expect(verdict.responsiveSources).toBe(0);
    expect(onlineDivergences(verdict)).toEqual([]);
  });

  it('trevos divergentes na +Milionária são detectados', () => {
    const seedMili = [
      draw(Lottery.MAIS_MILIONARIA, 393, [1, 2, 3, 4, 5, 6], '2026-09-27', [1, 2]),
    ];
    const a = { source: 'comunidade', draw: draw(Lottery.MAIS_MILIONARIA, 393, [1, 2, 3, 4, 5, 6], '', [2, 1]) };
    const b = { source: 'guidi', draw: draw(Lottery.MAIS_MILIONARIA, 393, [1, 2, 3, 4, 5, 6], '', [1, 3]) };
    const verdict = compareOnlineSources(Lottery.MAIS_MILIONARIA, [a, b], seedMili);
    expect(verdict.ok).toBe(false);
  });
});

describe('drawsAgree — semântica de comparação', () => {
  it('dezenas em ordem diferente são o mesmo concurso', () => {
    const a = draw(Lottery.MEGA_SENA, 1, [6, 5, 4, 3, 2, 1], '2026-01-01');
    const b = draw(Lottery.MEGA_SENA, 1, [1, 2, 3, 4, 5, 6], '2026-01-01');
    expect(drawsAgree(Lottery.MEGA_SENA, a, b).agree).toBe(true);
  });

  it('data só pesa na Quina (espelho das outras tem data sintética)', () => {
    const a = draw(Lottery.MEGA_SENA, 1, [1, 2, 3, 4, 5, 6], '2026-01-01');
    const b = draw(Lottery.MEGA_SENA, 1, [1, 2, 3, 4, 5, 6], '1999-12-31');
    expect(drawsAgree(Lottery.MEGA_SENA, a, b).agree).toBe(true);
    const q1 = draw(Lottery.QUINA, 1, [1, 2, 3, 4, 5], '2026-01-01');
    const q2 = draw(Lottery.QUINA, 1, [1, 2, 3, 4, 5], '1999-12-31');
    expect(drawsAgree(Lottery.QUINA, q1, q2).agree).toBe(false);
  });
});

describe('isValidDraw — a validação que a procedência herda do app', () => {
  it('concurso íntegro passa; duplicata de dezena não', () => {
    const ok = draw(Lottery.QUINA, 1, [5, 20, 33, 61, 80], '1994-03-13');
    expect(isValidDraw(Lottery.QUINA, ok)).toBe(true);
    const bad = draw(Lottery.QUINA, 1, [5, 5, 33, 61, 80], '1994-03-13');
    expect(isValidDraw(Lottery.QUINA, bad)).toBe(false);
  });
});
