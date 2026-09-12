import Dexie, { Table } from 'dexie';
import { MIN_CUTOFF_DATES } from '../engine/backtestEngine';
import { getSeedData } from '../data/seed';
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
}

/** Par chave/valor genérico — hoje só guarda a flag de seed já aplicado. */
export interface ConfigRecord {
  key: string;
  value: string;
}

const SEEDED_CONFIG_KEY = 'seedApplied';

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

/**
 * Popula `draws` com o seed offline (`data/seed`) na primeira vez que o
 * banco é aberto sem nenhum concurso salvo — cobre a primeira visita sem
 * rede (ou PWA instalado antes de qualquer sincronização real). Idempotente
 * via a flag `seedApplied` em `config`: mesmo que o usuário apague todo o
 * histórico sincronizado depois, o seed não volta a ser reaplicado por
 * cima.
 */
export async function seedIfEmpty(): Promise<void> {
  const alreadySeeded = await db.config.get(SEEDED_CONFIG_KEY);
  if (alreadySeeded) return;

  const hasAnyDraws = (await db.draws.count()) > 0;
  if (!hasAnyDraws) {
    const seedDraws = [
      ...getSeedData(Lottery.MEGA_SENA),
      ...getSeedData(Lottery.MAIS_MILIONARIA),
    ];
    await db.draws.bulkPut(seedDraws);
  }

  await db.config.put({ key: SEEDED_CONFIG_KEY, value: 'true' });
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
  options: { source?: PerformanceSource; force?: boolean; ttlMs?: number } = {},
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
