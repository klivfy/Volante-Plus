import Dexie, { Table } from 'dexie';
import { getSeedData } from '../data/seed';
import { Draw, Lottery, NumberPerformance } from '../types/domain';

/** Desempenho cacheado de uma loteria — chave primária é a própria loteria. */
export interface PerformanceRecord {
  lottery: Lottery;
  performances: NumberPerformance[];
  trevoPerformances: NumberPerformance[];
  /** ISO 8601; informativo ("atualizado em"), não expira o cache sozinho. */
  updatedAt: string;
}

/** Par chave/valor genérico — hoje só guarda a flag de seed já aplicado. */
export interface ConfigRecord {
  key: string;
  value: string;
}

const SEEDED_CONFIG_KEY = 'seedApplied';

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
 * Concursos com `date <= cutoffDate` — janela de treino do backtesting.
 * Datas são strings ISO (`yyyy-MM-dd`), então a comparação lexicográfica do
 * índice composto já reflete a ordem cronológica correta.
 */
export async function getDrawsUpTo(lottery: Lottery, cutoffDate: string): Promise<Draw[]> {
  await seedIfEmpty();
  return db.draws
    .where('[lottery+date]')
    .between([lottery, ''], [lottery, cutoffDate], true, true)
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

/** Substitui o desempenho cacheado da loteria (fonte: análise local ou backtesting). */
export async function savePerformances(
  lottery: Lottery,
  performances: NumberPerformance[],
  trevoPerformances: NumberPerformance[] = [],
): Promise<void> {
  await db.performances.put({
    lottery,
    performances,
    trevoPerformances,
    updatedAt: new Date().toISOString(),
  });
}

/** Desempenho cacheado da loteria, ou `undefined` se nunca foi calculado/salvo. */
export async function getPerformances(lottery: Lottery): Promise<PerformanceRecord | undefined> {
  return db.performances.get(lottery);
}
