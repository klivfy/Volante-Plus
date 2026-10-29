import { Draw, Lottery } from '../types/domain';
import { DrawSource } from './drawSources';
import { mapLimited } from './mapLimited';

/**
 * Sincronização do histórico até o ÚLTIMO concurso, sem lacunas desde o 1º.
 *
 * Em vez de rebaixar tudo a cada vez (e de nunca conferir se o banco está
 * completo), o algoritmo é dirigido pelo que FALTA:
 *
 * 1. descobre o último concurso realizado (primeira fonte que responde);
 * 2. compara com os números de concurso já salvos e lista os ausentes
 *    (`1..último` menos o que existe) — cobre tanto concursos novos quanto
 *    buracos antigos;
 * 3. poucos ausentes → busca um a um (com fallback entre fontes); muitos →
 *    tenta o histórico inteiro de uma vez;
 * 4. só grava concursos que passaram na validação estrutural (`drawSources`).
 *
 * Nunca lança: falha de rede vira um relatório com `reachable: false`.
 */

/** Acima disto, prefere baixar o histórico inteiro a buscar concurso por concurso. */
export const BULK_THRESHOLD = 60;

/** Teto de buscas individuais por execução, para não travar uma aba com milhares de chamadas. */
export const MAX_INDIVIDUAL_FETCHES = 400;

const DEFAULT_CONCURRENCY = 4;

export interface HistoryStatus {
  lottery: Lottery;
  count: number;
  firstContest: number | null;
  lastContest: number | null;
  /** Concursos ausentes entre o 1º e `latestKnown` (ou o maior salvo). */
  missing: number[];
  /** Último concurso realizado conhecido pela fonte, se já consultada. */
  latestKnown: number | null;
  /** Começa no concurso 1, sem lacunas, e chega ao último conhecido. */
  complete: boolean;
}

/** Análise pura de completude: sem I/O, testável por inspeção. */
export function analyzeHistory(
  lottery: Lottery,
  contests: Iterable<number>,
  latestKnown: number | null = null,
): HistoryStatus {
  const have = new Set(contests);
  const sorted = [...have].sort((a, b) => a - b);
  const last = sorted.length ? sorted[sorted.length - 1] : null;
  const target = Math.max(latestKnown ?? 0, last ?? 0);
  const missing = missingContests(have, target);
  return {
    lottery,
    count: have.size,
    firstContest: sorted.length ? sorted[0] : null,
    lastContest: last,
    missing,
    latestKnown,
    complete: target > 0 && missing.length === 0,
  };
}

/** Números de `1..latest` que não estão em `have`, em ordem crescente. */
export function missingContests(have: ReadonlySet<number>, latest: number): number[] {
  const missing: number[] = [];
  for (let n = 1; n <= latest; n++) if (!have.has(n)) missing.push(n);
  return missing;
}

export interface SyncDeps {
  sources: DrawSource[];
  /** Concursos já salvos da loteria. */
  storedContests(lottery: Lottery): Promise<Set<number>>;
  save(draws: Draw[]): Promise<void>;
  concurrency?: number;
}

export interface SyncReport {
  lottery: Lottery;
  /** Pelo menos uma fonte informou o último concurso. */
  reachable: boolean;
  /** Último concurso realizado segundo a fonte. */
  latest: number | null;
  /** Concursos novos gravados nesta execução. */
  added: number;
  /** Ainda ausentes depois da execução. */
  missingAfter: number[];
  /** Fonte que respondeu ao pedido do último concurso. */
  source: string | null;
}

async function firstDraw(
  sources: DrawSource[],
  ask: (source: DrawSource) => Promise<Draw | null>,
): Promise<{ draw: Draw; source: string } | null> {
  for (const source of sources) {
    try {
      const draw = await ask(source);
      if (draw) return { draw, source: source.name };
    } catch {
      // Uma fonte que lança é tratada como indisponível; tenta a próxima.
    }
  }
  return null;
}

export async function syncLottery(lottery: Lottery, deps: SyncDeps): Promise<SyncReport> {
  try {
    const latest = await firstDraw(deps.sources, (s) => s.latest(lottery));
    if (!latest) {
      const have = await deps.storedContests(lottery);
      return { lottery, reachable: false, latest: null, added: 0, missingAfter: missingContests(have, Math.max(0, ...have)), source: null };
    }

    const latestNumber = latest.draw.contestNumber;
    const have = await deps.storedContests(lottery);
    let missing = missingContests(have, latestNumber);
    let added = 0;

    // O último concurso já está em mãos: grava (também refresca a data real).
    await deps.save([latest.draw]);
    if (!have.has(latestNumber)) added++;
    missing = missing.filter((n) => n !== latestNumber);

    if (missing.length > BULK_THRESHOLD) {
      for (const source of deps.sources) {
        if (!source.all) continue;
        try {
          const all = await source.all(lottery);
          if (all && all.length > 0) {
            await deps.save(all);
            added += all.filter((d) => !have.has(d.contestNumber) && d.contestNumber !== latestNumber).length;
            break;
          }
        } catch {
          // segue para a próxima fonte
        }
      }
      const stored = await deps.storedContests(lottery);
      missing = missingContests(stored, latestNumber);
    }

    if (missing.length > 0) {
      const batch = missing.slice(0, MAX_INDIVIDUAL_FETCHES);
      const fetched = await mapLimited(batch, deps.concurrency ?? DEFAULT_CONCURRENCY, async (n) => {
        const found = await firstDraw(deps.sources, (s) => s.byContest(lottery, n));
        return found && found.draw.contestNumber === n ? found.draw : null;
      });
      const valid = fetched.filter((d): d is Draw => d !== null);
      if (valid.length > 0) {
        await deps.save(valid);
        added += valid.length;
      }
    }

    const after = await deps.storedContests(lottery);
    return {
      lottery,
      reachable: true,
      latest: latestNumber,
      added,
      missingAfter: missingContests(after, latestNumber),
      source: latest.source,
    };
  } catch {
    return { lottery, reachable: false, latest: null, added: 0, missingAfter: [], source: null };
  }
}
