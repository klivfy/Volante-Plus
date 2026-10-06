# Contrato: campos consumidos das APIs de loterias

Estrutura conferida em 2026-10-06 nas duas fontes (ver research.md, R3 e R17).
O app usa a API de terceiros como principal (já é a do histórico) e a oficial
como conferência e para os campos que só ela tem.

| Conceito | API de terceiros (`loteriascaixa-api`) | API oficial (`servicebus2.caixa.gov.br/portaldeloterias/api`) | Uso |
|---|---|---|---|
| Concurso | `concurso` | `numero` | todos |
| Data | `data` (dd/MM/yyyy) | `dataApuracao` | todos |
| Dezenas | `dezenas` | `listaDezenas` | todos |
| Trevos | `trevos` | `trevosSorteados` | +Milionária |
| Ordem de extração | `dezenasOrdemSorteio` | `dezenasSorteadasOrdemSorteio` (na +Milionária, 8 valores: dezenas e trevos) | A7 |
| Local | `local` ("ESPAÇO DA SORTE em SÃO PAULO, SP") | `localSorteio` + `nomeMunicipioUFSorteio` | A8 |
| Ganhadores por faixa | `premiacoes[].ganhadores` | `listaRateioPremio[].numeroDeGanhadores` | popularidade, A10 |
| Prêmio por faixa | `premiacoes[].valorPremio` | `listaRateioPremio[].valorPremio` | IR, validação |
| Arrecadação | `valorArrecadado` | `valorArrecadado` | apostas, demanda, valor |
| Acumulado próximo | `valorAcumuladoProximoConcurso` | idem | valor |
| Acumulado finais 0/5 | `valorAcumuladoConcurso_0_5` | idem | valor (Mega) |
| Acumulado especial (Virada) | `valorAcumuladoConcursoEspecial` | idem | valor (Mega) |
| Próximo final 0/5 | — | `numeroConcursoFinal_0_5` | valor (Mega) |
| Reserva garantidora | — | `valorSaldoReservaGarantidora` | valor (+Milionária) |
| Prêmio estimado | `valorEstimadoProximoConcurso` | idem | valor |
| Próximo concurso / data | `proximoConcurso`, `dataProximoConcurso` | `numeroConcursoProximo`, `dataProximoConcurso` | valor |
| Especial | `concursoEspecial` | `indicadorConcursoEspecial` | detecção (semântica dos códigos a confirmar) |

## Regras

- Todos os campos são opcionais na leitura (as APIs variam): a ausência de um
  campo torna indisponível só a medida que depende dele (FR-020). O parser
  continua tolerante, como `parseRawDraw` hoje.
- Valores monetários zerados em concursos antigos significam **ausente**, não
  zero.
- `fetchContestOutlook` nunca lança; devolve `null` ou um panorama parcial com
  as ausências explícitas, como `fetchNextDraw` faz hoje.
- Os testes usam fixtures gravadas das duas APIs (sem rede), incluindo um
  concurso regular, um de final 0 ou 5, uma Virada e um +Milionária com
  reserva.
