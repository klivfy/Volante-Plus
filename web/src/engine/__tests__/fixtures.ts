import { Draw, Lottery } from '../../types/domain';
import { createSeededRandom } from '../random';

/**
 * Gera um histórico sintético de concursos para uma loteria, com sorteios
 * uniformes e determinísticos (RNG semeado) — usado pelos testes dos módulos
 * de validação avançada, que precisam de dezenas/dúzias/centenas de
 * concursos para terem sentido estatístico.
 */
export function generateSyntheticHistory(
  lottery: Lottery,
  count: number,
  options: { seed?: number; startDate?: string } = {},
): Draw[] {
  const seed = options.seed ?? 42;
  const random = createSeededRandom(seed);
  const universe = lottery === Lottery.MEGA_SENA ? 60 : 50;
  const hasTrevos = lottery === Lottery.MAIS_MILIONARIA;
  const startDate = new Date(options.startDate ?? '2015-01-01');

  const draws: Draw[] = [];
  for (let i = 0; i < count; i++) {
    const numbers = new Set<number>();
    while (numbers.size < 6) {
      numbers.add(1 + random.nextInt(universe));
    }
    const trevos = hasTrevos
      ? (() => {
          const set = new Set<number>();
          while (set.size < 2) set.add(1 + random.nextInt(6));
          return [...set].sort((a, b) => a - b);
        })()
      : undefined;

    const date = new Date(startDate);
    date.setDate(date.getDate() + i * 3); // ~3 concursos por semana

    draws.push({
      lottery,
      contestNumber: i + 1,
      date: date.toISOString().slice(0, 10),
      numbers: [...numbers].sort((a, b) => a - b),
      ...(trevos ? { trevos } : {}),
    });
  }

  return draws;
}
