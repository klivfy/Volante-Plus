import { Draw, Lottery, NextDrawInfo } from '../types/domain';

/**
 * Caminho da API pública para cada loteria. Segue a nomenclatura da
 * loteriascaixa-api (github.com/guto-alves/loterias-api): a +Milionária usa
 * `maismilionaria`, igual à chave interna de `Lottery` — não há mapeamento a
 * fazer aqui, mas o `Record` fica explícito caso a API mude.
 */
export const API_PATH: Record<Lottery, string> = {
  [Lottery.MEGA_SENA]: 'megasena',
  [Lottery.MAIS_MILIONARIA]: 'maismilionaria',
};

/**
 * Host da API de loterias, configurável via `NEXT_PUBLIC_CAIXA_API_BASE_URL`
 * (ver `.env.local`). O padrão aponta para a loteriascaixa-api pública
 * (https://github.com/guto-alves/loterias-api) — não é o serviço oficial da
 * Caixa, é uma API de terceiros mantida pela comunidade. Sem rede ou com o
 * serviço fora do ar, `fetchNextDraw` devolve `null` normalmente.
 *
 * WHY (leitura tardia, não em módulo): o Next.js substitui
 * `process.env.NEXT_PUBLIC_*` estaticamente em tempo de build em qualquer
 * ponto do código onde a expressão apareça — cachear numa constante de módulo
 * não muda esse comportamento em produção, mas impede testes de simular a
 * variável ausente/presente em cada caso.
 */
export function baseUrl(): string {
  return process.env.NEXT_PUBLIC_CAIXA_API_BASE_URL ?? 'https://loteriascaixa-api.herokuapp.com/api';
}

/** Shape tolerante: APIs públicas de loteria variam a nomenclatura dos campos. */
interface RawNextDrawResponse {
  numero?: number;
  numeroConcurso?: number;
  numero_concurso?: number;
  concurso?: number;
  dataProximoConcurso?: string;
  data_proximo_concurso?: string;
  proximoConcurso?: string | number;
  dataProxima?: string;
  valorEstimadoProximoConcurso?: number;
  valor_estimado_proximo_concurso?: number;
  valorAcumuladoProximoConcurso?: number;
  valorEstimado?: number;
}

function firstDefined<T>(...values: Array<T | undefined>): T | undefined {
  return values.find((value) => value !== undefined);
}

/**
 * Normaliza a data do próximo concurso para ISO 8601 (`yyyy-MM-dd[THH:mm[:ss]]`).
 *
 * @throws Error quando o formato não é nem ISO nem `dd/MM/yyyy`.
 */
export function parseDrawDate(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value;
  }
  const brazilian = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brazilian) {
    const [, day, month, year] = brazilian;
    return `${year}-${month}-${day}`;
  }
  throw new Error(`Formato de data não reconhecido: ${value}`);
}

/**
 * Dados do próximo concurso (data e prêmio estimado).
 *
 * Nunca lança: qualquer falha — rede indisponível, resposta não-OK, JSON
 * malformado, campos ausentes, data em formato desconhecido — resulta em
 * `null`. É consumido por uma UI com fallback gracioso quando a API está fora
 * do ar, nunca por um caminho que precise de exceção para se comunicar.
 */
export async function fetchNextDraw(lottery: Lottery): Promise<NextDrawInfo | null> {
  try {
    const response = await fetch(`${baseUrl()}/${API_PATH[lottery]}/latest`, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      return null;
    }

    const raw = (await response.json()) as RawNextDrawResponse;
    // `proximoConcurso` numérico é o número do PRÓXIMO concurso (a API da
    // comunidade o traz ao lado de `concurso`, que é o último já sorteado);
    // sem ele, cai nos nomes de campo das demais APIs.
    const contestNumber = firstDefined(
      typeof raw.proximoConcurso === 'number' ? raw.proximoConcurso : undefined,
      raw.numero,
      raw.numeroConcurso,
      raw.numero_concurso,
      raw.concurso,
    );
    const rawDate = firstDefined(
      raw.dataProximoConcurso,
      raw.data_proximo_concurso,
      typeof raw.proximoConcurso === 'string' ? raw.proximoConcurso : undefined,
      raw.dataProxima,
    );
    const estimatedPrize = firstDefined(
      raw.valorEstimadoProximoConcurso,
      raw.valor_estimado_proximo_concurso,
      raw.valorAcumuladoProximoConcurso,
      raw.valorEstimado,
    );

    if (contestNumber === undefined || rawDate === undefined || estimatedPrize === undefined) {
      return null;
    }

    return {
      lottery,
      contestNumber,
      drawDate: parseDrawDate(rawDate),
      estimatedPrize,
    };
  } catch {
    return null;
  }
}

/** Shape tolerante de um concurso já realizado, como devolvido pela API de histórico. */
export interface RawDrawResponse {
  numero?: number;
  numeroConcurso?: number;
  concurso?: number;
  dataApuracao?: string;
  data_apuracao?: string;
  data?: string;
  dezenas?: Array<string | number>;
  listaDezenas?: Array<string | number>;
  dezenasSorteadas?: Array<string | number>;
  trevos?: Array<string | number>;
  trevosSorteados?: Array<string | number>;
}

function toNumberArray(values: Array<string | number> | undefined): number[] | undefined {
  if (!values) return undefined;
  const numbers = values.map((value) => Number(value));
  return numbers.every((n) => Number.isFinite(n)) ? numbers : undefined;
}

export function parseRawDraw(lottery: Lottery, raw: RawDrawResponse): Draw | null {
  const contestNumber = firstDefined(raw.numero, raw.numeroConcurso, raw.concurso);
  const rawDate = firstDefined(raw.dataApuracao, raw.data_apuracao, raw.data);
  const numbers = toNumberArray(firstDefined(raw.dezenas, raw.listaDezenas, raw.dezenasSorteadas));
  const trevos = toNumberArray(firstDefined(raw.trevos, raw.trevosSorteados));

  if (contestNumber === undefined || rawDate === undefined || numbers === undefined) {
    return null;
  }

  try {
    return {
      lottery,
      contestNumber,
      date: parseDrawDate(rawDate),
      numbers,
      ...(trevos ? { trevos } : {}),
    };
  } catch {
    return null;
  }
}

/**
 * Histórico completo de concursos já realizados de uma loteria.
 *
 * Nunca lança: qualquer falha (rede, resposta não-OK, JSON malformado,
 * concurso individual sem os campos esperados) resulta em `null` ou, no caso
 * de um item isolado malformado, na sua omissão silenciosa da lista —
 * consumido por quem faz o fallback para o seed offline (`data/seed`).
 */
export async function fetchDrawHistory(lottery: Lottery): Promise<Draw[] | null> {
  try {
    const response = await fetch(`${baseUrl()}/${API_PATH[lottery]}`, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      return null;
    }

    const raw = (await response.json()) as unknown;
    const items = Array.isArray(raw) ? raw : [raw];
    const draws = items
      .map((item) => parseRawDraw(lottery, item as RawDrawResponse))
      .filter((draw): draw is Draw => draw !== null);

    return draws;
  } catch {
    return null;
  }
}
