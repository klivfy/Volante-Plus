import { Lottery, NextDrawInfo } from '../types/domain';

/**
 * Caminho da API pública para cada loteria. Note que o segmento da
 * +Milionária é `milionaria`, diferente da chave interna `maismilionaria`
 * usada em `Lottery` — a chave interna descreve o domínio do app, o caminho
 * descreve o endpoint de terceiros.
 */
const API_PATH: Record<Lottery, string> = {
  [Lottery.MEGA_SENA]: 'megasena',
  [Lottery.MAIS_MILIONARIA]: 'milionaria',
};

/**
 * Host da API de loterias. Propositalmente **sem valor padrão embutido**: não
 * há como confirmar, a partir daqui, qual API pública de terceiros está no ar
 * e com o schema esperado. Configure `NEXT_PUBLIC_CAIXA_API_BASE_URL` (ex.:
 * `.env.local`) apontando para uma API que sirva `GET /{loteria}/v2/proximos`.
 * Sem a variável, `fetchNextDraw` se comporta como se o serviço estivesse
 * fora do ar — devolve `null`, o mesmo tratamento de qualquer outra falha de
 * rede — em vez de arriscar um host que ninguém validou.
 *
 * WHY (leitura tardia, não em módulo): o Next.js substitui
 * `process.env.NEXT_PUBLIC_*` estaticamente em tempo de build em qualquer
 * ponto do código onde a expressão apareça — cachear numa constante de módulo
 * não muda esse comportamento em produção, mas impede testes de simular a
 * variável ausente/presente em cada caso.
 */
function baseUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_CAIXA_API_BASE_URL;
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
  const base = baseUrl();
  if (!base) {
    return null;
  }

  try {
    const response = await fetch(`${base}/${API_PATH[lottery]}/v2/proximos`, {
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
