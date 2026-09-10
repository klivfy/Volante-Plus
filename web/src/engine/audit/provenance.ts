import { getSeedData } from '../../data/seed';
import { Draw, Lottery } from '../../types/domain';
import { lotteryRules } from '../prizeRules';

/**
 * A guarda que decide se um conjunto de dados pode ser auditado.
 *
 * ## Por que este módulo existe
 *
 * Uma auditoria de honestidade só significa alguma coisa se rodar sobre
 * sorteios reais. Rodá-la sobre dados sintéticos não produz um resultado
 * fraco — produz um resultado **vazio e enganoso**: as séries de
 * `data/seed/` saem de um PRNG (`mulberry32`), que é uniforme por
 * construção, então A1–A3 passariam em tudo e o relatório sairia com a
 * cara de "compatível com sorteio honesto" quando o que ele mediu foi a
 * qualidade do gerador pseudoaleatório.
 *
 * Essa confusão é fácil de cometer por acidente — o app carrega o seed
 * automaticamente quando não há sincronização — e o custo dela é um
 * relatório que parece uma prova e não é. Por isso a barreira é código,
 * não convenção: `assertAuditable` recusa qualquer coisa que não seja
 * declaradamente oficial, e recusa de novo, por conteúdo, se o seed for
 * rotulado de oficial (por engano ou não).
 *
 * ## O que esta guarda NÃO faz
 *
 * Ela não detecta dado fabricado em geral, e nenhum código detectaria: uma
 * série inventada com as estatísticas certas é indistinguível de uma série
 * real por inspeção interna. O que a guarda cobre é o acidente concreto e
 * provável deste repositório — auditar o próprio seed — mais os erros de
 * integridade que denunciam arquivo corrompido ou mal convertido.
 *
 * A garantia de que o histórico é mesmo da Caixa continua sendo externa:
 * vem da conferência da exportação contra a fonte oficial. `sourceLabel`
 * existe para que essa origem viaje junto do relatório, onde o leitor possa
 * cobrá-la.
 */

/** De onde vieram os concursos. Sem isso declarado, nada é auditável. */
export type DrawProvenance =
  /** Exportação oficial da Caixa (portal ou API). Único valor auditável. */
  | 'official'
  /** Gerado por PRNG — `data/seed/`, fixtures de teste, simulações. */
  | 'synthetic'
  /** Origem não estabelecida. Tratado como não auditável. */
  | 'unknown';

export interface DrawDataset {
  readonly lottery: Lottery;
  readonly draws: readonly Draw[];
  readonly provenance: DrawProvenance;
  /** Origem legível, reproduzida no cabeçalho do relatório. */
  readonly sourceLabel: string;
}

/** Recusa de auditoria. O `reason` é exibido ao usuário sem tradução. */
export class NonAuditableDataError extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = 'NonAuditableDataError';
  }
}

/**
 * Mínimo de concursos para o qui-quadrado de A1 ser válido.
 *
 * Derivado, não arbitrado: a aproximação assintótica do qui-quadrado exige
 * frequência esperada >= 5 por casela. Com `K` dezenas sorteadas em `N`
 * possíveis, a esperança por dezena após `c` concursos é `c·K/N`, logo
 * `c >= 5N/K`. Mega-Sena: 50. +Milionária: 42 (dezenas) e 15 (trevos) —
 * vale o maior.
 */
export function minimumContestsFor(lottery: Lottery): number {
  const rules = lotteryRules(lottery);
  const forNumbers = Math.ceil((5 * rules.numberUniverse) / rules.numbersDrawn);
  const forTrevos =
    rules.trevoUniverse > 0 ? Math.ceil((5 * rules.trevoUniverse) / rules.trevosDrawn) : 0;
  return Math.max(forNumbers, forTrevos);
}

/** Assinatura de um concurso, para detectar o seed por conteúdo. */
function signature(draw: Draw): string {
  const numbers = [...draw.numbers].sort((a, b) => a - b).join(',');
  const trevos = draw.trevos ? [...draw.trevos].sort((a, b) => a - b).join(',') : '';
  return `${draw.contestNumber}|${numbers}|${trevos}`;
}

/**
 * Valida as regras de negócio de cada concurso. Dado que viola a própria
 * modalidade não é histórico oficial — é arquivo corrompido ou mal
 * convertido, e auditar isso produziria uma "anomalia" que é bug de parser.
 */
function validateStructure(dataset: DrawDataset): void {
  const rules = lotteryRules(dataset.lottery);
  const seen = new Set<number>();

  for (const draw of dataset.draws) {
    const where = `concurso ${draw.contestNumber}`;

    if (draw.lottery !== dataset.lottery) {
      throw new NonAuditableDataError(`${where}: pertence a outra modalidade (${draw.lottery}).`);
    }
    if (seen.has(draw.contestNumber)) {
      throw new NonAuditableDataError(`${where}: número de concurso duplicado.`);
    }
    seen.add(draw.contestNumber);

    if (draw.numbers.length !== rules.numbersDrawn) {
      throw new NonAuditableDataError(
        `${where}: ${draw.numbers.length} dezenas, esperado ${rules.numbersDrawn}.`,
      );
    }
    if (new Set(draw.numbers).size !== draw.numbers.length) {
      throw new NonAuditableDataError(`${where}: dezenas repetidas.`);
    }
    for (const n of draw.numbers) {
      if (!Number.isInteger(n) || n < 1 || n > rules.numberUniverse) {
        throw new NonAuditableDataError(
          `${where}: dezena ${n} fora do universo 1–${rules.numberUniverse}.`,
        );
      }
    }

    if (rules.trevosDrawn > 0) {
      const trevos = draw.trevos ?? [];
      if (trevos.length !== rules.trevosDrawn) {
        throw new NonAuditableDataError(
          `${where}: ${trevos.length} trevos, esperado ${rules.trevosDrawn}.`,
        );
      }
      if (new Set(trevos).size !== trevos.length) {
        throw new NonAuditableDataError(`${where}: trevos repetidos.`);
      }
      for (const t of trevos) {
        if (!Number.isInteger(t) || t < 1 || t > rules.trevoUniverse) {
          throw new NonAuditableDataError(
            `${where}: trevo ${t} fora do universo 1–${rules.trevoUniverse}.`,
          );
        }
      }
    }

    if (Number.isNaN(Date.parse(draw.date))) {
      throw new NonAuditableDataError(`${where}: data não reconhecida (${draw.date}).`);
    }
  }
}

/**
 * Recusa dados que coincidam com o seed sintético empacotado.
 *
 * WHY (defesa em profundidade): a checagem de `provenance` é uma promessa de
 * quem chamou, e promessas erram. Esta segunda barreira olha o conteúdo, e
 * por isso pega o caso em que o seed é rotulado de `'official'` por engano.
 *
 * Uma única coincidência exata basta para recusar: para um concurso real
 * bater número **e** dezenas com uma entrada do seed é preciso acertar
 * `C(60,6) ≈ 5,0e7` combinações, logo ~2e-8 por concurso. Num histórico
 * inteiro de ~3.000 concursos contra 50 entradas de seed, a chance de uma
 * recusa falsa fica na casa de 1e-6 — desprezível frente ao custo de
 * publicar um relatório que auditou um PRNG.
 */
function rejectBundledSeed(dataset: DrawDataset): void {
  const seed = getSeedData(dataset.lottery);
  if (seed.length === 0) return;

  const seedSignatures = new Set(seed.map(signature));
  const collision = dataset.draws.find((draw) => seedSignatures.has(signature(draw)));

  if (collision) {
    throw new NonAuditableDataError(
      `Os dados coincidem com o seed sintético empacotado (concurso ` +
        `${collision.contestNumber}). Esse histórico vem de um PRNG, não da ` +
        `Caixa — auditá-lo mediria o gerador, não o sorteio.`,
    );
  }
}

/**
 * Porta de entrada da auditoria: só passa histórico oficial, íntegro e
 * grande o bastante para o teste ser válido. Lança `NonAuditableDataError`
 * com o motivo em qualquer outro caso.
 */
export function assertAuditable(dataset: DrawDataset): void {
  if (dataset.provenance !== 'official') {
    throw new NonAuditableDataError(
      `Procedência "${dataset.provenance}": a auditoria exige histórico ` +
        `oficial da Caixa. Dados sintéticos ou de origem não estabelecida ` +
        `produziriam um relatório sobre o gerador, não sobre o sorteio.`,
    );
  }

  const minimum = minimumContestsFor(dataset.lottery);
  if (dataset.draws.length < minimum) {
    throw new NonAuditableDataError(
      `${dataset.draws.length} concursos: abaixo do mínimo de ${minimum} para ` +
        `a aproximação do qui-quadrado ser válida (esperança >= 5 por dezena).`,
    );
  }

  validateStructure(dataset);
  rejectBundledSeed(dataset);
}

/** `true` quando `assertAuditable` passaria, sem lançar. */
export function isAuditable(dataset: DrawDataset): boolean {
  try {
    assertAuditable(dataset);
    return true;
  } catch (error) {
    if (error instanceof NonAuditableDataError) return false;
    throw error;
  }
}

/** Período coberto (ISO `yyyy-MM-dd`), para o cabeçalho exigido pelo spec. */
export function coveredPeriod(dataset: DrawDataset): { start: string; end: string } {
  const dates = dataset.draws.map((d) => d.date).sort();
  return { start: dates[0] ?? '', end: dates[dates.length - 1] ?? '' };
}
