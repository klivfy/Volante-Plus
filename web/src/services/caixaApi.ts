import { Lottery, NextDrawInfo } from '../types/domain';

/**
 * Caminho da API pública para cada loteria. Segue a nomenclatura da
 * loteriascaixa-api (github.com/guto-alves/loterias-api): a +Milionária usa
 * `maismilionaria`, igual à chave interna de `Lottery` — não há mapeamento a
 * fazer aqui, mas o `Record` fica explícito caso a API mude.
 */
const API_PATH: Record<Lottery, string> = {
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
function baseUrl(): string {
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
  proximoConcurso?: string;
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
    const contestNumber = firstDefined(raw.numero, raw.numeroConcurso, raw.numero_concurso, raw.concurso);
    const rawDate = firstDefined(
      raw.dataProximoConcurso,
      raw.data_proximo_concurso,
      raw.proximoConcurso,
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
