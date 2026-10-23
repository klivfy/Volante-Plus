# Research: Modalidade Quina

Fase 0 do plano. Cada decisão registra o que foi escolhido, por quê e o que
foi descartado. Fatos externos foram conferidos em 2026-10-23 (fontes no
final).

## Decisão 1 — Parametrizar "dezenas sorteadas" por modalidade, com teste dourado antes

**Decisão**: trocar a constante global de 6 dezenas por uma propriedade da
modalidade (`Lottery.numbersDrawn` no Kotlin; `numbersDrawn`/`numbersPerBet`
já existem em `LotteryRules` no TypeScript) e fazer todos os pontos
dependentes lerem dela. Antes de tocar qualquer cálculo, capturar um **teste
dourado** da saída de Mega-Sena e +Milionária (backtest, chances por faixa,
retorno esperado, lote gerado com semente fixa) e exigir que continue
idêntico depois da refatoração (SC-005).

**Por quê**: o código assume 6 em lugares que o compilador **não** acusa:
`Hypergeometric.kt:62,66,70` (K e n), `BacktestAnalyzer.kt:44`,
`PayoutShare.kt:273` (`GAME_SIZE = 6`), `AccumulatedReturn.kt:84`
(`binomial(…, 6)`), `GameGenerator.kt:328`; na web, `payoutShare.ts:126`. Um
ramo `if (quina)` em cada um deixaria a mesma suposição escondida para a
próxima modalidade. Só os `when(lottery)` exaustivos de `PrizeRules`,
`PrizeTable`, `CaixaLotteryApi.apiPath` e `AssetDrawSeeder.assetPath` são
pegos pelo compilador.

**Alternativas**: (a) ramos pontuais por modalidade — rápido, mas acumula
dívida e o erro de 6-fixo só aparece como número errado em runtime; (b) pôr
`numbersDrawn` só em `Draw` — não resolve K/n da hipergeométrica.

## Decisão 2 — Fonte do histórico e conferência contra o portal oficial

**Decisão**: o seed vem da API comunitária (`loteriascaixa-api`), igual às
outras modalidades, e é conferido **concurso a concurso** contra o portal da
Caixa (`servicebus2.caixa.gov.br/portaldeloterias/api/quina/{n}`), com o
resultado reduzido a `{contestNumber, date, numbers}` e commitado em
`web/src/data/mirrorSnapshot/quina.json`. O script de seed passa a comparar
também as **datas** quando o espelho as tem reais (o espelho antigo tinha
datas sintéticas, então só comparava dezenas).

**Evidência**: a API comunitária devolveu 7.149 concursos, **contíguos de 1 a
7.149**, todos com 5 dezenas distintas em 1–80, sem trevo e com data válida
(1994-03-13 a 2026-10-22); 9 são concursos especiais (Quina de São João). O
portal da Caixa respondeu 200 daqui (~0,35 s por concurso) e coincidiu em
dezenas **e** datas nos 11 concursos amostrados, inclusive o especial 4706. A
coleta completa leva ~10 min com 4 requisições paralelas.

**Por quê**: é uma segunda fonte realmente independente e oficial, melhor que
o espelho de terceiros usado nas outras duas (stale desde 2024-11 e sem datas
reais). Princípio IV: o rótulo do seed permanece `third_party_mirror` — a
conferência aumenta a confiança, não muda a procedência — e `meta.json`
registra `crossChecked` = 7.149.

**Alternativas**: (a) usar o portal como fonte primária — consistente com a
autoridade, mas o portal não envia CORS (só serve à extensão/ao Node) e
quebraria a simetria com as outras duas; (b) o espelho `guilhermeasn/loteria.json`
— sem datas reais, parado em 2024-11 e exigiria clonar repositório de
terceiros; (c) a API `api.guidi.dev.br` — respondeu 403 daqui; (d) sem
conferência — rejeitado: o Princípio IV exige declarar o limite, e uma
conferência barata existe.

## Decisão 3 — Preço, fração de prêmio e faixas por modalidade

**Decisão**: preço da aposta simples e fração da arrecadação destinada a
prêmios viram propriedades **por modalidade**. Quina: **R$ 3,00** (5 dezenas;
15 dezenas = R$ 9.009,00 = 3.003 apostas × R$ 3,00), prêmio bruto
**43,79%** da arrecadação, rateio **35% quina, 15% quadra, 10% terno, 10%
duque**; os 30% restantes **não** entram na lista de faixas (acúmulo para a
quina de final 5 e para a Quina de São João), tratados como a Mega-Sena
trata o que não é pago agora. Mega-Sena e +Milionária **mantêm** os valores
atuais (6,00 e 0,4335) — corrigi-los é escopo da feature 002.

**Por quê**: `PrizeTable.betPrice(lottery)` hoje ignora o parâmetro e
`PRIZE_SHARE_OF_COLLECTION` é compartilhado; a Quina herdaria R$ 6 e 43,35%
em silêncio e o retorno esperado sairia errado. O portal da Caixa também dá
a tabela de quantos prêmios cada aposta recebe por faixa, usada como oráculo
de teste (Decisão 8).

**Ressalva registrada (Princípio IV)**: o texto oficial lido é ambíguo sobre
os 30% restantes ("15% … final 5" e "15% … São João"); a primeira tarefa de
prêmios confere o regulamento (circular da Caixa) e, se a partição divergir,
a fração fica explicitamente marcada como "não paga no concurso comum" sem
inventar destino.

**Alternativas**: manter um preço único e multiplicar — falso para a Quina;
modelar Quina de São João agora — fora de escopo (spec: concurso comum).

## Decisão 4 — Aposta de 5 a 15 dezenas e grade do volante

**Decisão**: `minSelection = 5`, `maxSelection = 15` (regra oficial) para a
Quina, ainda que Mega-Sena e +Milionária usem mínimo 8 no app. A grade do
volante vira **por modalidade**: 8 colunas para a Quina (o volante oficial
tem 10 linhas × 8 colunas), mantendo 6 para as outras (hoje
`NUMBER_GRID_COLUMNS = 6` no Android e no desktop).

**Por quê**: a spec (FR-002) manda a regra oficial; o mínimo 8 das outras é
convenção do app (jogos avulsos a partir de um pool). Com mínimo 5, uma
seleção exata de 5 é uma aposta simples e o gerador precisa aceitar `eligible
>= 5` (hoje `>= GAME_SIZE`).

**Alternativas**: alinhar o mínimo a 8 — contradiz FR-002; mudar o mínimo das
outras — fora de escopo (SC-005).

## Decisão 5 — Fechamento (k = 5): tabelas geradas por script, com *fallback*

**Decisão**: `scripts/generate-closure-tables.mjs` calcula coberturas
C(v, 5, t) para v = 6..15 e t = 3 (terno) e 4 (quadra) pelo mesmo algoritmo
guloso determinístico já em `closureDesigner.ts`, **verifica cada uma por
enumeração exaustiva**, e emite o mesmo dado em `closureTables.ts` e em uma
tabela Kotlin. Garantias oferecidas na Quina: terno e quadra (como hoje); a de
2 acertos (duque) existe como `t=2` mas não é oferecida, igual à web hoje.
`ClosureDesigner.kt` (hoje preso a k=6) é generalizado para k e a guarda de
fechamento no Android/desktop (`VolanteViewModel`) deixa de recusar a Quina.

**Por quê**: Princípio V — duas listas de blocos digitadas à mão divergem;
um gerador único e uma verificação exaustiva nos dois lados é a mesma
disciplina de `ClosureDesigner.verify()`. A web **já** funciona para k=5 pelo
caminho guloso (MAX_POOL = 15), então o risco real está no Kotlin.

**Fallback (declarado, não silencioso)**: se a generalização do Kotlin não
fechar no prazo, a Quina entra no Android/desktop sem a aba Fechamento
(mensagem e guarda iguais às da +Milionária) e a web mantém o fechamento; a
spec registra que fechamento é P2 e o restante da feature não depende dele.

**Alternativas**: reutilizar as tabelas k=6 — matematicamente inválidas para
k=5; solver exato de covering designs — já descartado no projeto (não
converge em tempo viável); omitir fechamento da Quina em tudo — contraria
FR-006.

## Decisão 6 — Heurística de baixa popularidade na Quina

**Decisão**: `Unpopularity` (Kotlin) e `unpopularity.ts` parametrizam o
número de colunas do volante por modalidade (8 na Quina). Os limiares de
data (≤31) e de mês (≤12) valem para qualquer universo ≥ 31. Tudo que
depender de como **apostadores da Quina** escolhem (a popularidade é um
fato empírico do comportamento deles) fica rotulado como **hipótese não
validada** na Quina, pois não há histórico brasileiro de rateio de Quina no
repositório.

**Por quê**: Princípio I/IV — o ajuste de colunas é geometria do volante,
verificável; a *crença* de que esses padrões são mais disputados é hipótese.

**Alternativas**: desligar a estratégia na Quina — perderia a paridade de
estratégias (FR-006/Assumptions) sem ganho de honestidade além do rótulo.

## Decisão 7 — Piso da data de corte e dado insuficiente

**Decisão**: `MIN_CUTOFF_DATES[QUINA] = '1994-03-13'` (início da modalidade) e
a regra de "histórico insuficiente" existente (`minimumContestsFor`, 5·N/K =
**80** concursos na Quina) continua sendo o que barra cortes sem histórico
suficiente.

**Por quê**: o piso das outras é o início da modalidade; a suficiência é
tratada por outra guarda, e a fórmula já é genérica.

## Decisão 8 — Como provar as chances e o retorno (Princípio III)

**Decisão**: oráculos independentes, em ordem de força: (1) combinatória
exata por `C(75, 5−h)·C(5, h)/C(80, 5)` em testes, contra o código
hipergeométrico; (2) a tabela oficial da Caixa (5 a 15 dezenas, ver
`contracts/quina-official-rules.md`); (3) simulação Monte Carlo
independente para o retorno esperado. A tabela oficial arredonda de modo
inconsistente (quadra: 24.040.016/375 = 64.106,7 → "64.106"; duque:
35,6 → "36"), então a comparação exige **±1 do valor oficial**, e o valor
exato é a referência.

**Por quê**: os números oficiais são conferência, não definição; a fórmula
fechada nova exige verificação cruzada independente.

## Decisão 9 — Desktop

**Decisão**: o desktop consome o domínio compartilhado e **não** tem seed nem
sincronização embutidos (usa `InMemoryDrawRepository` e o botão "Importar
CSV"); a Quina chega a ele pelo enum e pelas abas, e o histórico por CSV
(`app/src/main/assets/seed/quina.csv` serve de arquivo de exemplo, já citado
na tela). Nenhum seed novo no desktop.

**Por quê**: introduzir seed no desktop é outra feature; o Princípio V pede
domínio único, que o enum compartilhado já dá.

## Fontes

- Portal Loterias da Caixa, página da Quina (preço R$ 3,00 / R$ 9.009,00;
  prêmio bruto 43,79%; rateio 35/15/10/10; seis sorteios por semana; tabelas
  de chances e de quantidade de prêmios por aposta) —
  https://loterias.caixa.gov.br/Paginas/Quina.aspx
- Agência Brasil, reajuste de preços das Loterias Caixa (julho de 2025) —
  https://agenciabrasil.ebc.com.br/geral/noticia/2025-07/precos-das-apostas-das-loterias-caixas-aumentam-partir-desta-quarta
- Ensaio local de 2026-10-23: `loteriascaixa-api` (7.149 concursos) e
  amostra de 11 concursos no portal da Caixa (todos coincidentes).
