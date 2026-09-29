import Dexie, { Table } from 'dexie';
import { MIN_CUTOFF_DATES } from '../engine/backtestEngine';
import { historySeedVersion, loadHistorySeed } from '../data/history';
import { Draw, Lottery, NumberPerformance } from '../types/domain';

/** Origem do desempenho cacheado — usada para priorizar backtest manual sobre análise automática. */
export type PerformanceSource = 'manual' | 'auto';

/** Desempenho cacheado de uma loteria — chave primária é a própria loteria. */
export interface PerformanceRecord {
  lottery: Lottery;
  performances: NumberPerformance[];
  trevoPerformances: NumberPerformance[];
  /** ISO 8601; informativo ("atualizado em"). */
  updatedAt: string;
  /**
   * ISO 8601 opcional. Se presente e já no passado, o cache é considerado
   * expirado: `getPerformances` o descarta e devolve `undefined`, forçando um
   * recálculo. Usado para dar validade a um backtest `manual` — ver
   * `MANUAL_CACHE_TTL_MS`.
   */
  expiresAt?: string;
  /** `manual` (tela de backtesting) tem prioridade sobre `auto` (análise automática ao abrir o app). */
  source: PerformanceSource;
  /**
   * Último concurso considerado na análise. Um cache `auto` com concurso menor
   * que o último do histórico está defasado e é recalculado — sem isso a
   * análise ficaria presa ao histórico de quando foi gerada.
   */
  lastContest?: number;
}

/** Par chave/valor genérico — hoje só guarda a flag de seed já aplicado. */
export interface ConfigRecord {
  key: string;
  value: string;
}

const HISTORY_SEED_KEY = 'historySeedVersion';
const ALL_LOTTERIES = [Lottery.MEGA_SENA, Lottery.MAIS_MILIONARIA];

/**
 * Validade padrão de um cache `manual`: 24h. O histórico é ressincronizado com
 * frequência, então um backtest manual "colado" no cache indefinidamente
 * ficaria defasado em relação aos concursos novos. Passado esse prazo o cache
 * expira e a análise `auto` volta a valer.
 */
export const MANUAL_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

class VolanteDatabase extends Dexie {
  draws!: Table<Draw, [Lottery, number]>;
  performances!: Table<PerformanceRecord, Lottery>;
  config!: Table<ConfigRecord, string>;

  constructor() {
    super('volante-plus');
    this.version(1).stores({
      // Chave primária composta [lottery+contestNumber] — upsert natural ao
      // ressincronizar. Índice extra [lottery+date] para o corte
      // treino/validação do backtesting; `lottery` sozinho para listar todo
      // o histórico de uma loteria sem depender do número do concurso.
      draws: '[lottery+contestNumber], [lottery+date], lottery',
      performances: 'lottery',
      config: 'key',
    });
  }
}

export const db = new VolanteDatabase();

let seeding: Promise<void> | null = null;

/** Marca o seed embutido como já aplicado — para testes que isolam o CRUD do seed. */
export async function markHistorySeeded(): Promise<void> {
  await db.config.put({ key: HISTORY_SEED_KEY, value: historySeedVersion() });
}

/**
 * Remove do banco os concursos SINTÉTICOS que versões anteriores gravaram como
 * "seed offline". Só apaga linhas idênticas à fixture (mesmo concurso, data e
 * dezenas): nunca toca em dado real sincronizado.
 */
async function purgeSyntheticFixture(): Promise<void> {
  const { getSyntheticFixture } = await import('../data/syntheticFixture');
  for (const lottery of ALL_LOTTERIES) {
    for (const fake of getSyntheticFixture(lottery)) {
      const row = await db.draws.get([lottery, fake.contestNumber]);
      if (
        row &&
        row.date === fake.date &&
        JSON.stringify(row.numbers) === JSON.stringify(fake.numbers)
      ) {
        await db.draws.delete([lottery, fake.contestNumber]);
      }
    }
  }
}

async function applyHistorySeed(): Promise<void> {
  const applied = await db.config.get(HISTORY_SEED_KEY);
  if (applied?.value === historySeedVersion()) return;

  await purgeSyntheticFixture();
  for (const lottery of ALL_LOTTERIES) {
    const have = new Set(
      (await db.draws.where('lottery').equals(lottery).primaryKeys()).map(
        (key) => (key as unknown as [Lottery, number])[1],
      ),
    );
    const missing = (await loadHistorySeed(lottery)).filter((d) => !have.has(d.contestNumber));
    if (missing.length === 0) continue;
    try {
      // `bulkAdd`, não `bulkPut`: o seed só PREENCHE o que falta e nunca
      // sobrescreve um concurso que a sincronização já trouxe.
      await db.draws.bulkAdd(missing);
    } catch (error) {
      if ((error as { name?: string }).name !== 'BulkError') throw error;
      // Outra aba/sincronização inseriu alguns no meio do caminho: o resto entrou.
    }
  }
  await markHistorySeeded();
}

/**
 * Garante que o banco tenha o histórico embutido (`data/history`), completo do
 * concurso 1 ao último da geração do seed, sem sobrescrever o que já foi
 * sincronizado. Roda uma vez por versão do seed (flag `historySeedVersion`).
 * Também limpa a fixture sintética que versões antigas gravavam no banco.
 */
export async function seedIfEmpty(): Promise<void> {
  seeding ??= applyHistorySeed().finally(() => {
    seeding = null;
  });
  await seeding;
}

/** Maior concurso salvo da loteria, ou `null` se não houver nenhum. */
export async function getLastContest(lottery: Lottery): Promise<number | null> {
  const last = await db.draws
    .where('[lottery+contestNumber]')
    .between([lottery, 0], [lottery, Number.MAX_SAFE_INTEGER], true, true)
    .last();
  return last ? last.contestNumber : null;
}

/** Números de concurso salvos da loteria (para achar lacunas). */
export async function getStoredContests(lottery: Lottery): Promise<Set<number>> {
  const keys = await db.draws.where('lottery').equals(lottery).primaryKeys();
  return new Set(keys.map((key) => (key as unknown as [Lottery, number])[1]));
}

/** Insere ou atualiza concursos (upsert pela chave composta). */
export async function saveDraws(draws: Draw[]): Promise<void> {
  await db.draws.bulkPut(draws);
}

/** Histórico completo de uma loteria, ordenado por concurso crescente. */
export async function getDraws(lottery: Lottery): Promise<Draw[]> {
  await seedIfEmpty();
  return db.draws.where('lottery').equals(lottery).sortBy('contestNumber');
}

/**
 * Concursos com `date >= minDate && date <= cutoffDate` — janela de treino do backtesting.
 * Datas são strings ISO (`yyyy-MM-dd`), então a comparação lexicográfica do
 * índice composto já reflete a ordem cronológica correta.
 * `minDate` é o piso histórico absoluto por modalidade (ver `MIN_CUTOFF_DATES`).
 */
export async function getDrawsUpTo(lottery: Lottery, cutoffDate: string): Promise<Draw[]> {
  await seedIfEmpty();
  const minDate = MIN_CUTOFF_DATES[lottery];
  return db.draws
    .where('[lottery+date]')
    .between([lottery, minDate], [lottery, cutoffDate], true, true)
    .sortBy('contestNumber');
}

/** Concursos com `date > cutoffDate` — janela de validação do backtesting. */
export async function getDrawsAfter(lottery: Lottery, cutoffDate: string): Promise<Draw[]> {
  await seedIfEmpty();
  return db.draws
    .where('[lottery+date]')
    .between([lottery, cutoffDate], [lottery, '￿'], false, true)
    .sortBy('contestNumber');
}

/**
 * Substitui o desempenho cacheado da loteria.
 *
 * `source` define a prioridade: um cache `manual` (backtesting explícito do
 * usuário) nunca é sobrescrito por uma análise `auto` (rodada automaticamente
 * ao abrir o app) — só por outro `manual`, ou explicitamente via
 * `force: true`.
 */
export async function savePerformances(
  lottery: Lottery,
  performances: NumberPerformance[],
  trevoPerformances: NumberPerformance[] = [],
  options: { source?: PerformanceSource; force?: boolean; ttlMs?: number; lastContest?: number } = {},
): Promise<void> {
  const { source = 'auto', force = false, ttlMs } = options;

  if (!force && source === 'auto') {
    const existing = await db.performances.get(lottery);
    if (existing?.source === 'manual') {
      return;
    }
  }

  // Um backtest `manual` ganha validade padrão (`MANUAL_CACHE_TTL_MS`) para não
  // ficar "colado" indefinidamente; `ttlMs` sobrescreve, e a análise `auto`
  // não expira sozinha (é sempre recalculável na próxima abertura).
  const effectiveTtl = ttlMs ?? (source === 'manual' ? MANUAL_CACHE_TTL_MS : undefined);
  const expiresAt =
    effectiveTtl === undefined ? undefined : new Date(Date.now() + effectiveTtl).toISOString();

  await db.performances.put({
    lottery,
    performances,
    trevoPerformances,
    source,
    updatedAt: new Date().toISOString(),
    expiresAt,
    ...(options.lastContest === undefined ? {} : { lastContest: options.lastContest }),
  });
}

/**
 * Desempenho cacheado da loteria, ou `undefined` se nunca foi calculado/salvo
 * — ou se o cache expirou (`expiresAt` no passado), caso em que o registro é
 * descartado antes de retornar.
 */
export async function getPerformances(lottery: Lottery): Promise<PerformanceRecord | undefined> {
  const record = await db.performances.get(lottery);
  if (record?.expiresAt && Date.parse(record.expiresAt) <= Date.now()) {
    await db.performances.delete(lottery);
    return undefined;
  }
  return record;
}

/** Remove o desempenho cacheado da loteria — usado para limpar um backtest manual. */
export async function clearPerformances(lottery: Lottery): Promise<void> {
  await db.performances.delete(lottery);
}
