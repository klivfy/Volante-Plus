/**
 * Formatação do momento do próximo concurso.
 *
 * Módulo puro (sem MUI/React) para ser testável fora do componente.
 */

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

const timeFormatter = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
});

/** `Z` ou offset explícito (`-03:00`, `-0300`) no fim da string. */
const HAS_OFFSET = /(?:Z|[+-]\d{2}:?\d{2})$/;

export interface DrawMoment {
  date: string;
  time: string | null;
}

/**
 * Algumas fontes trazem só a data (sem horário), outras trazem data e hora do
 * sorteio. Meia-noite exata é ambígua demais para exibir como "hora do
 * sorteio" — nesse caso mostramos só a data.
 *
 * WHY tudo em UTC: é o padrão do projeto para datas de concurso (ver
 * `walkForwardMulti.ts`) — 'YYYY-MM-DD' é meia-noite UTC. Interpretar e
 * formatar sempre em UTC mantém a exibição idêntica em qualquer fuso de
 * dispositivo; os getters locais (`getHours`) deslocavam dia e hora fora do
 * Brasil. String com hora sem offset explícito também é tratada como UTC
 * (o mesmo valor de parede que a Caixa exibe), nunca como fuso do aparelho.
 * Dado malformado que passe na validação do `parseDrawDate` (só o prefixo é
 * conferido) devolve a string bruta em vez de derrubar o cartão com
 * `RangeError` do `Intl` sobre `Invalid Date`.
 */
export function formatDrawMoment(drawDate: string): DrawMoment {
  const normalized =
    drawDate.length <= 10
      ? `${drawDate}T00:00:00Z`
      : HAS_OFFSET.test(drawDate)
        ? drawDate
        : `${drawDate}Z`;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return { date: drawDate, time: null };
  }
  const hasTime = parsed.getUTCHours() !== 0 || parsed.getUTCMinutes() !== 0;
  return {
    date: dateFormatter.format(parsed),
    time: hasTime ? timeFormatter.format(parsed) : null,
  };
}
