import mirrorMais from '../../data/mirrorSnapshot/maismilionaria.json';
import mirrorMega from '../../data/mirrorSnapshot/megasena.json';
import mirrorQuina from '../../data/mirrorSnapshot/quina.json';
import { Draw, Lottery } from '../../types/domain';
import { isValidDraw } from '../../services/drawSources';

/**
 * Procedência automatizada do histórico (Fase 4, frente 2) — núcleo puro.
 *
 * O que hoje é conferência manual documentada (`docs/historico.md`) + teste
 * de unidade (`data/history/__tests__`) vira verificação agendada: um CLI
 * (`provenanceCli.ts`) roda no workflow `provenance.yml` semanalmente e a
 * cada push nos dados, e ALARMA (CI vermelho) quando qualquer fonte — o seed
 * embutido, o espelho independente versionado ou as fontes ao vivo —
 * divergirem entre si num concurso em comum.
 *
 * Este módulo concentra as funções PURAS (sem fs, sem rede) para que os
 * testes possam exercitar a detecção com controles positivos e negativos,
 * inclusive sabotagem proposital — a mesma disciplina de via independente
 * que a recomputação dos exatos segue na calibração.
 */

/** Espelho independente versionado (`data/mirrorSnapshot/`). */
export const MIRROR_SNAPSHOT: Record<Lottery, Draw[]> = {
  [Lottery.MEGA_SENA]: mirrorMega as Draw[],
  [Lottery.MAIS_MILIONARIA]: mirrorMais as Draw[],
  [Lottery.QUINA]: mirrorQuina as Draw[],
};

export const PROVENANCE_SCHEMA = 'volante-plus/provenance@1';

export interface LotteryProvenanceVerdict {
  lottery: Lottery;
  /** Concursos no seed embutido. */
  seedContests: number;
  /** `true` quando contíguo do concurso 1 ao último declarado no meta. */
  contiguous: boolean;
  /** Concursos que violam a validação estrutural da modalidade. */
  structurallyInvalid: number[];
  /** Concursos comparados contra o espelho independente. */
  mirrorCompared: number;
  /** Concursos do espelho que não existem no seed (meta ou dado faltando). */
  missingFromSeed: number[];
  /** Concursos em que seed e espelho divergem (dezenas/trevos/data da Quina). */
  mirrorDivergences: Array<{ contest: number; detail: string }>;
}

export interface OnlineSourceResult {
  source: string;
  /** Concurso mais recente já realizado, quando a fonte respondeu. */
  latestContest: number | null;
  /** `true` quando a fonte respondeu com um concurso válido. */
  responsive: boolean;
  /** Como o resultado desta fonte se encaixa na comparação cruzada. */
  status: 'ok' | 'sem-resposta' | 'diverge-de-outra-fonte' | 'diverge-do-seed';
}

export interface LotteryOnlineVerdict {
  lottery: Lottery;
  /** Fontes que responderam com concurso válido. */
  responsiveSources: number;
  /** Fontes comparadas. */
  sources: OnlineSourceResult[];
  /** Último concurso do seed embutido, para contexto. */
  seedLastContest: number;
  /** Concursos novos observados ao vivo além do seed (quantos, não quais). */
  newContestsBeyondSeed: number;
  ok: boolean;
}

export interface LotteryProvenanceDivergence {
  lottery: Lottery;
  /** Qual verificação detectou (contiguidade, regras, espelho, fontes). */
  check: string;
  /** O que divergiu, em uma frase reproduzível. */
  detail: string;
}

/** Dois concursos são o mesmo resultado? Dezenas ordenadas; trevos idem.
 *  A data só é comparável na Quina — o espelho das outras duas tem datas
 *  sintéticas (a fonte não as trazia; ver README do mirrorSnapshot). */
export function drawsAgree(lottery: Lottery, a: Draw, b: Draw): { agree: boolean; detail: string } {
  const an = [...a.numbers].sort((x, y) => x - y).join('-');
  const bn = [...b.numbers].sort((x, y) => x - y).join('-');
  if (an !== bn) {
    return { agree: false, detail: `dezenas ${an} != ${bn}` };
  }
  if (lottery === Lottery.MAIS_MILIONARIA) {
    const at = [...(a.trevos ?? [])].sort((x, y) => x - y).join('-');
    const bt = [...(b.trevos ?? [])].sort((x, y) => x - y).join('-');
    if (at !== bt) return { agree: false, detail: `trevos ${at} != ${bt}` };
  }
  if (lottery === Lottery.QUINA && a.date !== b.date) {
    return { agree: false, detail: `data ${a.date} != ${b.date}` };
  }
  return { agree: true, detail: '' };
}

/**
 * Verificação offline completa de uma modalidade: seed embutido contra as
 * regras da modalidade e contra o espelho independente versionado. Pura —
 * recebe o seed pronto (`loadHistorySeed`) e o meta declarado.
 */
export function verifyLotteryProvenance(
  lottery: Lottery,
  seed: readonly Draw[],
  meta: { count: number; firstContest: number; lastContest: number; lastDate: string },
  mirror: readonly Draw[],
): LotteryProvenanceVerdict {
  const verdict: LotteryProvenanceVerdict = {
    lottery,
    seedContests: seed.length,
    contiguous: seed.every((d, i) => d.contestNumber === i + 1) && seed.length === meta.lastContest,
    structurallyInvalid: [],
    mirrorCompared: 0,
    missingFromSeed: [],
    mirrorDivergences: [],
  };

  const byContest = new Map(seed.map((d) => [d.contestNumber, d]));
  for (const draw of seed) {
    if (!isValidDraw(lottery, draw)) verdict.structurallyInvalid.push(draw.contestNumber);
  }

  for (const m of mirror) {
    const s = byContest.get(m.contestNumber);
    if (!s) {
      verdict.missingFromSeed.push(m.contestNumber);
      continue;
    }
    verdict.mirrorCompared += 1;
    const agreement = drawsAgree(lottery, s, m);
    if (!agreement.agree) {
      verdict.mirrorDivergences.push({ contest: m.contestNumber, detail: agreement.detail });
    }
  }
  return verdict;
}

/** Converte o veredito offline em divergências explícitas (lista vazia = ok). */
export function offlineDivergences(
  verdict: LotteryProvenanceVerdict,
  meta: { count: number; firstContest: number; lastContest: number; lastDate: string },
): LotteryProvenanceDivergence[] {
  const divergences: LotteryProvenanceDivergence[] = [];
  const label = verdict.lottery;
  if (verdict.seedContests !== meta.count) {
    divergences.push({
      lottery: label,
      check: 'meta',
      detail: `seed tem ${verdict.seedContests} concursos, meta declara ${meta.count}`,
    });
  }
  if (!verdict.contiguous) {
    divergences.push({
      lottery: label,
      check: 'contiguidade',
      detail: `histórico não é contíguo do concurso 1 ao ${meta.lastContest}`,
    });
  }
  if (verdict.structurallyInvalid.length > 0) {
    divergences.push({
      lottery: label,
      check: 'regras',
      detail: `concursos fora das regras da modalidade: ${verdict.structurallyInvalid.slice(0, 5).join(', ')}` +
        (verdict.structurallyInvalid.length > 5 ? ` (+${verdict.structurallyInvalid.length - 5})` : ''),
    });
  }
  if (verdict.missingFromSeed.length > 0) {
    divergences.push({
      lottery: label,
      check: 'espelho',
      detail: `concursos no espelho ausentes do seed: ${verdict.missingFromSeed.slice(0, 5).join(', ')}`,
    });
  }
  for (const d of verdict.mirrorDivergences.slice(0, 10)) {
    divergences.push({
      lottery: label,
      check: 'espelho',
      detail: `concurso ${d.contest}: ${d.detail}`,
    });
  }
  return divergences;
}

/**
 * Compara os resultados ao vivo das fontes entre si e contra o seed. Pura —
 * recebe os pares (fonte, concurso) já buscados. Só é DIVERGÊNCIA quando
 * duas ou mais fontes respondem e discordam entre si, ou quando uma fonte
 * responde com um concurso que o seed também tem e os resultados diferem:
 * fonte que não responde é indisponibilidade declarada, nunca alarme falso
 * (o gate semanal não pode tremer por rede).
 */
export function compareOnlineSources(
  lottery: Lottery,
  results: Array<{ source: string; draw: Draw | null }>,
  seed: readonly Draw[],
): LotteryOnlineVerdict {
  const seedLast = seed.length > 0 ? seed[seed.length - 1].contestNumber : 0;
  const seedByContest = new Map(seed.map((d) => [d.contestNumber, d]));

  const valid = results.filter((r): r is { source: string; draw: Draw } => r.draw !== null);
  const sources: OnlineSourceResult[] = results.map((r) => ({
    source: r.source,
    latestContest: r.draw?.contestNumber ?? null,
    responsive: r.draw !== null,
    status: r.draw ? 'ok' : 'sem-resposta',
  }));

  const verdict: LotteryOnlineVerdict = {
    lottery,
    responsiveSources: valid.length,
    sources,
    seedLastContest: seedLast,
    newContestsBeyondSeed: 0,
    ok: true,
  };

  // Concursos ao vivo além do seed: contados, não comparáveis ao seed.
  for (const { draw } of valid) {
    if (draw.contestNumber > seedLast) {
      verdict.newContestsBeyondSeed = Math.max(
        verdict.newContestsBeyondSeed,
        draw.contestNumber - seedLast,
      );
    }
  }

  // Discordância entre fontes que responderam, por CONCURSO: agrupa os
  // resultados pelo número do concurso e compara dentro de cada grupo. Uma
  // fonte que só ainda não viu o concurso mais novo não é divergência — é
  // defasagem, e defasagem não acende alarme.
  const signatureOf = (draw: Draw): string =>
    [
      [...draw.numbers].sort((x, y) => x - y).join('-'),
      [...(draw.trevos ?? [])].sort((x, y) => x - y).join('-'),
      lottery === Lottery.QUINA ? draw.date : '',
    ].join('|');

  const byContest = new Map<number, Array<{ source: string; draw: Draw }>>();
  for (const entry of valid) {
    const group = byContest.get(entry.draw.contestNumber) ?? [];
    group.push({ source: entry.source, draw: entry.draw });
    byContest.set(entry.draw.contestNumber, group);
  }
  for (const group of byContest.values()) {
    if (group.length < 2) continue; // um só respondente para o concurso: nada a comparar
    const signatures = new Set(group.map((g) => signatureOf(g.draw)));
    if (signatures.size > 1) {
      verdict.ok = false;
      for (const { source } of group) {
        sources.find((s) => s.source === source)!.status = 'diverge-de-outra-fonte';
      }
    }
  }

  // Fonte respondeu com concurso que o seed JÁ tem e o resultado diverge —
  // é exatamente o alarme que a frente promete ("novo concurso oficial
  // divergir de qualquer fonte").
  for (const { source, draw } of valid) {
    const fromSeed = draw ? seedByContest.get(draw.contestNumber) : undefined;
    if (draw && fromSeed) {
      const agreement = drawsAgree(lottery, fromSeed, draw);
      if (!agreement.agree) {
        verdict.ok = false;
        sources.find((s) => s.source === source)!.status = 'diverge-do-seed';
      }
    }
  }
  return verdict;
}

/** Converte o veredito online em divergências explícitas (lista vazia = ok). */
export function onlineDivergences(verdict: LotteryOnlineVerdict): LotteryProvenanceDivergence[] {
  const divergences: LotteryProvenanceDivergence[] = [];
  for (const s of verdict.sources) {
    if (s.status === 'diverge-de-outra-fonte') {
      divergences.push({
        lottery: verdict.lottery,
        check: 'fontes',
        detail: `fonte ${s.source} diverge de outra fonte no concurso mais recente`,
      });
    }
    if (s.status === 'diverge-do-seed') {
      divergences.push({
        lottery: verdict.lottery,
        check: 'fontes',
        detail: `fonte ${s.source} diverge do seed embutido no concurso ${s.latestContest}`,
      });
    }
  }
  return divergences;
}

export const ALL_LOTTERIES: readonly Lottery[] = [
  Lottery.MEGA_SENA,
  Lottery.MAIS_MILIONARIA,
  Lottery.QUINA,
];
