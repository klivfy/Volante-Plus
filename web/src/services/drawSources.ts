import { Draw, Lottery } from '../types/domain';
import { lotteryRules } from '../engine/prizeRules';
import { API_PATH, baseUrl, parseRawDraw, RawDrawResponse } from './caixaApi';

/**
 * Fontes de concursos já realizados. A sincronização tenta as fontes em ordem e
 * só desiste quando todas falham — depender de um único host de terceiros seria
 * deixar o "sempre atualizado" à mercê de um serviço.
 *
 * Só a primeira (API da comunidade) foi exercitada contra respostas reais ao
 * escrever isto; as demais seguem a documentação pública de cada serviço e
 * estão cobertas por testes com respostas simuladas. Todas passam pelo mesmo
 * `parseRawDraw` tolerante e pela mesma validação estrutural (`isValidDraw`).
 */
export interface DrawSource {
  name: string;
  /** Último concurso já realizado. */
  latest(lottery: Lottery): Promise<Draw | null>;
  /** Um concurso pelo número. */
  byContest(lottery: Lottery, contest: number): Promise<Draw | null>;
  /** Histórico inteiro numa chamada, se a fonte oferecer. */
  all?(lottery: Lottery): Promise<Draw[] | null>;
}

const REQUEST_TIMEOUT_MS = 20_000;

/** GET JSON com timeout; qualquer falha (rede, HTTP, JSON, aborto) vira `null`. */
async function getJson(url: string): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    return response.ok ? ((await response.json()) as unknown) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Concurso íntegro segundo as regras da modalidade: número positivo, data ISO
 * válida, dezenas distintas dentro do universo e, na +Milionária, os 2 trevos
 * distintos em 1..6. Nada que falhe aqui chega ao banco.
 */
export function isValidDraw(lottery: Lottery, draw: Draw): boolean {
  const rules = lotteryRules(lottery);
  const distinctInRange = (values: readonly number[] | undefined, size: number, max: number) =>
    values !== undefined &&
    values.length === size &&
    new Set(values).size === size &&
    values.every((n) => Number.isInteger(n) && n >= 1 && n <= max);

  return (
    draw.lottery === lottery &&
    Number.isInteger(draw.contestNumber) &&
    draw.contestNumber > 0 &&
    /^\d{4}-\d{2}-\d{2}/.test(draw.date) &&
    !Number.isNaN(Date.parse(draw.date)) &&
    distinctInRange(draw.numbers, rules.numbersDrawn, rules.numberUniverse) &&
    (rules.trevoUniverse === 0
      ? (draw.trevos ?? []).length === 0 // modalidade sem trevo: qualquer trevo é rejeitado
      : distinctInRange(draw.trevos, rules.trevosDrawn, rules.trevoUniverse))
  );
}

function asDraw(lottery: Lottery, raw: unknown): Draw | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const draw = parseRawDraw(lottery, raw as RawDrawResponse);
  return draw && isValidDraw(lottery, draw) ? draw : null;
}

/** API da comunidade (loteriascaixa-api): `/latest`, `/{n}` e o histórico inteiro na raiz. */
export function communitySource(base: string = baseUrl()): DrawSource {
  return {
    name: 'loteriascaixa-api',
    latest: async (l) => asDraw(l, await getJson(`${base}/${API_PATH[l]}/latest`)),
    byContest: async (l, n) => asDraw(l, await getJson(`${base}/${API_PATH[l]}/${n}`)),
    all: async (l) => {
      const raw = await getJson(`${base}/${API_PATH[l]}`);
      if (!Array.isArray(raw)) return null;
      return raw.map((item) => asDraw(l, item)).filter((d): d is Draw => d !== null);
    },
  };
}

/** API guidi.dev.br: `/{modalidade}/ultimo` e `/{modalidade}/{n}`. */
export function guidiSource(base = 'https://api.guidi.dev.br/loteria'): DrawSource {
  return {
    name: 'guidi.dev.br',
    latest: async (l) => asDraw(l, await getJson(`${base}/${API_PATH[l]}/ultimo`)),
    byContest: async (l, n) => asDraw(l, await getJson(`${base}/${API_PATH[l]}/${n}`)),
  };
}

/**
 * Portal de Loterias da Caixa. Não envia cabeçalhos CORS, então só responde a
 * páginas web via proxy, mas funciona a partir da extensão (com
 * `host_permissions`) e de qualquer ambiente sem a restrição do navegador.
 */
export function caixaSource(base = 'https://servicebus2.caixa.gov.br/portaldeloterias/api'): DrawSource {
  return {
    name: 'caixa',
    latest: async (l) => asDraw(l, await getJson(`${base}/${API_PATH[l]}`)),
    byContest: async (l, n) => asDraw(l, await getJson(`${base}/${API_PATH[l]}/${n}`)),
  };
}

/** Ordem de tentativa: comunidade (verificada), guidi, Caixa. */
export function defaultSources(): DrawSource[] {
  return [communitySource(), guidiSource(), caixaSource()];
}
