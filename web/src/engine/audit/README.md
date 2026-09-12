# Auditoria de anomalias (Módulo A) — protocolo pré-registrado

Bateria de testes que verifica se um histórico oficial de sorteios é
compatível com sorteio honesto. Implementa A1–A5 do protocolo, com linha de
base simulada (Regra 3) e correção de Bonferroni sobre o total de testes
executados (Regra 4).

## Estado: rodando, sobre dado real de fonte não oficial

**Não existe exportação oficial da Caixa neste repositório** — a rede de
saída do ambiente de desenvolvimento remoto está bloqueada para o portal e
para a API pública. O que existe, em `src/data/mirrorSnapshot/` (carregado
por `mirrorSource.ts`), é um espelho de terceiros: 2.797 concursos reais da
Mega-Sena e 199 da +Milionária, capturados de um repositório GitHub que
raspa o portal da Caixa periodicamente — real, mas nem oficial nem atual (o
espelho está parado em 2024-11-17). O README daquele diretório documenta a
origem exata, o commit capturado e por que as datas por concurso são
fabricadas (a fonte não as fornece).

Esse dado tem `provenance: 'third_party_mirror'`, distinto de `'official'` —
a guarda deixa passar, mas `formatAuditReport` imprime a ressalva **antes**
de qualquer resultado. `__tests__/realHistoryAudit.test.ts` roda a auditoria
completa sobre ele e imprime o relatório; é o primeiro resultado deste
módulo sobre sorteios de verdade, não sobre histórico honesto construído
para testar o instrumento.

Este módulo foi escrito **antes** de qualquer dado real existir no
repositório. Não foi um detalhe de cronograma: é o que dá sentido à Regra 2
do protocolo ("critérios fixados ANTES de rodar a análise"). Um limiar
escolhido depois de ver o resultado não corrige nada, e "prometo que não
olhei antes" não é verificável — o histórico do git é.

## Como rodar sobre a exportação oficial, quando ela chegar

```ts
import { runAudit, formatAuditReport } from '@/engine/audit';

const report = runAudit({
  lottery: Lottery.MEGA_SENA,
  draws,                       // Draw[] da exportação oficial
  provenance: 'official',      // qualquer outro valor é recusado
  sourceLabel: 'Portal Caixa, exportação de 2026-09-10',
});

console.log(formatAuditReport(report));
```

Para incluir A4, passe também os dados de rateio, que a Caixa publica
separados do histórico de dezenas:

```ts
runAudit(dataset, {
  outcomes: [{ contestNumber: 2900, topTierWinners: 2, simpleBets: 34_000_000 }],
});
```

Sem `outcomes`, A4 é **pulado com o motivo declarado** — nunca estimado.

## A guarda de procedência

`runAudit` recusa e lança `NonAuditableDataError` quando:

- `provenance` não é `'official'` nem `'third_party_mirror'` (as únicas
  procedências auditáveis — `'synthetic'` e `'unknown'` são sempre recusadas);
- os dados coincidem com o seed sintético empacotado (checagem por conteúdo,
  que pega o seed até se rotulado de oficial por engano);
- algum concurso viola as regras da modalidade, repete número de concurso ou
  tem data irreconhecível;
- o histórico é curto demais para o qui-quadrado ser válido (< 50 concursos
  na Mega-Sena, derivado de esperança >= 5 por casela).

`'official'` e `'third_party_mirror'` não são intercambiáveis: a segunda
existe para uma agregação de terceiros de resultados reais (ver
`data/mirrorSnapshot/README.md`), e o relatório imprime uma ressalva em
destaque sempre que a procedência não é `'official'` — a fidelidade aos
sorteios reais depende inteiramente da fonte citada, não de nenhuma
verificação que este código possa fazer.

O que a guarda **não** faz, em nenhum dos dois casos: detectar dado
fabricado em geral. Nenhum código faz isso. A garantia final é externa, e
`sourceLabel` existe para que ela viaje junto do relatório.

## O que o relatório entrega

Por teste: estatística, valor teórico sob H0, p-valor corrigido, poder,
**efeito mínimo detectável** e conclusão (`anomalia` ou `compatível com
sorteio honesto`).

O EMD é o que impede a leitura errada do resultado esperado. "Nenhuma
anomalia" sozinho não distingue *não há viés* de *o teste não veria viés
nenhum*; o EMD fecha essa ambiguidade dizendo o menor desvio que aquele
recorte pegaria em 80% das vezes. Um resultado nulo com EMD é uma afirmação
positiva: *viés acima de X está descartado*.

## Validação do instrumento

Dois controles, em `__tests__/audit.test.ts`:

- **negativo** — histórico honesto por construção não pode produzir anomalia;
- **positivo** — urna com viés injetado tem de ser detectada, e confirmada nas
  duas metades.

O negativo sozinho não prova nada (um instrumento que nunca acusa nada
também passa nele). Os dois juntos, sim.

`__tests__/baseline.test.ts` verifica ainda que os p-valores são **uniformes
sob H0** — a propriedade sem a qual o limiar de significância não quer dizer
o que diz. Foi esse teste que pegou um erro real durante a construção: usar
χ²(59) teórico como referência de poder inflava o poder de 5% para 15%,
porque o sorteio *sem reposição* correlaciona negativamente as contagens e
estreita a nula frente ao χ² teórico. O cálculo passou a casar os momentos da
nula empírica (Patnaik/Satterthwaite).

## Custo

A linha de base do protocolo são 10.000 históricos simulados por recorte, e
são três recortes. Para um histórico de ~2.900 concursos isso é da ordem de
6e7 sorteios — dezenas de segundos. `baselineHistories` permite reduzir; o
relatório sempre registra o valor usado.

## O que o espelho mostrou, na primeira rodada real

Vale registrar um achado concreto, porque ele demonstra o protocolo
funcionando contra dado de verdade, não só contra os controles sintéticos.
No recorte "segunda metade" da Mega-Sena, `A1.numbers` deu p-valor corrigido
0,012 — abaixo do alpha, isoladamente uma "anomalia". Mas o mesmo teste na
"primeira metade" deu p-valor 1,0 (nada). O critério de replicação de A5
exige as duas metades concordando, então `confirmedAnomalies` fica vazio: é
exatamente o tipo de achado isolado, sem repetição independente, que a
exigência de replicação existe para descartar antes que vire manchete. Rodar
`__tests__/realHistoryAudit.test.ts` reproduz e imprime esse relatório
inteiro.

## O que este módulo não faz

Não prevê dezenas, e nenhum resultado dele autoriza isso. Aprovação em
previsibilidade é o Módulo B. Ausência de anomalia em A **não** é evidência a
favor de método preditivo nenhum — é o contrário: confirma o modelo sob o
qual todas as combinações são equiprováveis.

## Módulo B — previsibilidade (`moduleB.ts`)

Método pré-registrado, escrito e commitado antes de rodar sobre o espelho
real (mesma disciplina do Módulo A — ver seção acima). Fixa, antes de ver
qualquer resultado:

1. **Separação cronológica**: os últimos `CONFIRMATION_HOLDOUT_FRACTION`
   (20%) do histórico são reservados para **confirmação** e nunca entram na
   escolha de estratégia.
2. **Seleção**: dentro do restante (80%), `strategyBenchmark.ts` compara as 5
   estratégias (incluindo `random-uniform`, o baseline que a Regra 5 exige)
   com correção de Bonferroni entre elas. Só uma estratégia com vantagem
   significativa vira candidata.
3. **Confirmação**: a candidata é reexecutada, sozinha, em cortes
   walk-forward sucessivos dentro da fatia de confirmação — o desenho de
   replicação de A5, aplicado a previsão.
4. **Aprovação**: só `true` quando a vantagem replica em pelo menos
   `APPROVAL_MIN_CONSISTENCY` (80%) dos cortes de confirmação, com Bonferroni
   aplicado entre eles.

Sem essas quatro condições, `ModuleBReport.approved` é `false` — que é o
resultado esperado sob a hipótese nula, e reportado com o mesmo peso que uma
aprovação teria. `__tests__/moduleB.test.ts` roda o controle negativo
(histórico honesto não pode aprovar nada) sobre o mesmo tipo de dado sintético
que valida o Módulo A; ainda não foi rodado sobre o espelho real de
`mirrorSnapshot/` — isso é um próximo passo, não parte desta definição de
método.

## Módulo C — sugestão de jogos (`moduleC.ts`)

A especificação original previa um orçamento em reais informado pelo
usuário, que nunca chegou. `suggestGames` redefine o orçamento em
**quantidade de jogos** (`budgetGames`, padrão `DEFAULT_BUDGET_GAMES =
MIN_GAMES`, teto `MAX_GAMES` — os mesmos limites que o app já usa), o que
evita depender do preço da aposta.

A Regra 5 é aplicada na assinatura, não na UI: `suggestGames` exige um
`ModuleBReport` da mesma loteria e decide a partir dele —

- **aprovado**: usa a estratégia candidata do Módulo B, com aviso que reporta
  a vantagem medida no passado sem prometer resultado futuro;
- **não aprovado** (o caso esperado): usa `tier-weighted` (o motor já
  existente do app) e imprime `NO_CLAIM_DISCLAIMER`, que declara
  explicitamente a equivalência estatística ao sorteio aleatório.

Não existe caminho de código que produza uma sugestão "premium" sem ter
passado pelo relatório do Módulo B.
