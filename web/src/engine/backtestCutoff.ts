/**
 * Limites do campo "data de corte" do backtesting, por modalidade.
 *
 * O piso é o PRIMEIRO SORTEIO OFICIAL da modalidade (concurso 1): corte
 * anterior a ele não treina nada — não houve sorteio — e só abre espaço para
 * data digitada errônea. O teto é o dia atual (UTC, padrão do projeto): data
 * futura só produziria janela de validação vazia; o próximo concurso é sempre
 * hoje ou depois, então "hoje" também nunca ultrapassa o próximo sorteio.
 *
 * Fontes dos pisos (concurso 1 de cada modalidade):
 * - Mega-Sena: 11/03/1996 · +Milionária: 28/05/2022 · Quina: 13/03/1994.
 * - Conferência cruzada com o seed versionado (`data/history`, que alimenta o
 *   app): concurso 1 bate nas três modalidades. O espelho de terceiros
 *   (`data/mirrorSnapshot`) tem a coluna de datas da +Milionária deslocada
 *   (ver README do espelho) — por isso o piso vem dos registros oficiais,
 *   confirmados contra o seed, nunca do espelho.
 */

import { Lottery } from '../types/domain';
import { MIN_CUTOFF_DATES } from './backtestEngine';

export interface CutoffBounds {
  /** Primeiro sorteio oficial da modalidade (inclusive). */
  min: string;
  /** Dia atual em UTC (inclusive) — nenhum corte futuro. */
  max: string;
}

/** Data UTC corrente no formato `yyyy-MM-dd` (padrão do projeto: tudo UTC). */
export function todayUtcIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Limites do seletor de data de corte para a modalidade. */
export function cutoffBounds(lottery: Lottery, todayUtc: string): CutoffBounds {
  return { min: MIN_CUTOFF_DATES[lottery], max: todayUtc };
}

export type CutoffValidation =
  | { ok: true; value: string }
  | { ok: false; reason: 'invalid-format' | 'before-first-draw' | 'future' };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Valida a data de corte contra os limites da modalidade: formato `yyyy-MM-dd`,
 * nunca anterior ao primeiro sorteio oficial, nunca futura. As comparações são
 * lexicográficas — seguras porque todas as datas envolvidas são `yyyy-MM-dd`.
 */
export function validateCutoffDate(
  input: string,
  lottery: Lottery,
  todayUtc: string,
): CutoffValidation {
  if (!ISO_DATE.test(input)) return { ok: false, reason: 'invalid-format' };
  if (input < MIN_CUTOFF_DATES[lottery]) return { ok: false, reason: 'before-first-draw' };
  if (input > todayUtc) return { ok: false, reason: 'future' };
  return { ok: true, value: input };
}
