import Dexie, { Table } from 'dexie';
import { Draw, Lottery, NumberPerformance } from '../types/domain';

/** Desempenho cacheado de uma loteria — chave primária é a própria loteria. */
export interface PerformanceRecord {
  lottery: Lottery;
  performances: NumberPerformance[];
  trevoPerformances: NumberPerformance[];
  /** ISO 8601; informativo ("atualizado em"), não expira o cache sozinho. */
  updatedAt: string;
}

class VolanteDatabase extends Dexie {
  draws!: Table<Draw, [Lottery, number]>;
  performances!: Table<PerformanceRecord, Lottery>;

  constructor() {
    super('volante-plus');
    this.version(1).stores({
      // Chave primária composta [lottery+contestNumber] — upsert natural ao
      // ressincronizar. Índice extra [lottery+date] para o corte
      // treino/validação do backtesting; `lottery` sozinho para listar todo
      // o histórico de uma loteria sem depender do número do concurso.
      draws: '[lottery+contestNumber], [lottery+date], lottery',
      performances: 'lottery',
    });
  }
}

export const db = new VolanteDatabase();

/** Insere ou atualiza concursos (upsert pela chave composta). */
export async function saveDraws(draws: Draw[]): Promise<void> {
  await db.draws.bulkPut(draws);
}

/** Histórico completo de uma loteria, ordenado por concurso crescente. */
export async function getDraws(lottery: Lottery): Promise<Draw[]> {
  return db.draws.where('lottery').equals(lottery).sortBy('contestNumber');
}

/**
 * Concursos com `date <= cutoffDate` — janela de treino do backtesting.
 * Datas são strings ISO (`yyyy-MM-dd`), então a comparação lexicográfica do
 * índice composto já reflete a ordem cronológica correta.
 */
export async function getDrawsUpTo(lottery: Lottery, cutoffDate: string): Promise<Draw[]> {
  return db.draws
    .where('[lottery+date]')
    .between([lottery, ''], [lottery, cutoffDate], true, true)
    .sortBy('contestNumber');
}

/** Concursos com `date > cutoffDate` — janela de validação do backtesting. */
export async function getDrawsAfter(lottery: Lottery, cutoffDate: string): Promise<Draw[]> {
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
