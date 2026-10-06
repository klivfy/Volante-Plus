# Contrato: o que a interface pode e não pode dizer

Implementa a restrição de honestidade da Constituição ("nenhuma tela exibe uma
medida derivada sem a ressalva que explica o que ela mede e não mede, no
mesmo painel") e os FR-012, FR-019, FR-024, FR-025, FR-037 e FR-040. Os textos
abaixo são a base dos novos textos em `web/locales/pt-BR/common.json`; a
redação final pode mudar, o conteúdo obrigatório não.

## Por painel

### Cartão do jogo (FR-012)

- Mostra: popularidade relativa ("jogado por cerca de X vezes menos gente que
  um jogo médio") e ganho condicional ("se ganhar, prêmio Y% maior que o de um
  jogo médio").
- Ressalva obrigatória, no mesmo cartão ou painel: a de `PAYOUT_DISCLAIMER`
  (`payoutShare.ts`): "Este número não é chance de ganhar — a chance é idêntica
  para qualquer combinação e nada a altera…".
- Estado do modelo, na metodologia e num rótulo discreto: "medido com dado
  brasileiro" (`CALIBRATED_ADOPTED`), "heurística validada"
  (`HEURISTIC_KEPT`). Em `NO_SUPPORT`, **não** mostra ganho; mostra "no
  Brasil, a medida de popularidade não se sustentou nos dados — os jogos são
  sorteados ao acaso".

### Resumo do lote (FR-022 a FR-024)

- Mostra: chance exata de pelo menos um prêmio ("X%, cerca de 1 em N"),
  custo, retorno esperado neste concurso e perda esperada em reais.
- Ressalva obrigatória: "O arranjo dos jogos não muda a chance de cada jogo.
  Ele só muda a chance de algum jogo do lote ser premiado, pelo mesmo custo e
  com o mesmo retorno esperado."
- Mega-Sena: não exibir comparação de arranjos (o ganho é desprezível,
  research.md, R10). +Milionária: pode exibir "duplas de trevos
  complementares: X% → Y%".

### Painel de valor do concurso (FR-016 a FR-021)

- Mostra: retorno por real antes e depois do IR, perda esperada do lote,
  acumulado de equilíbrio, o que move o número (acumulado, final 0 ou 5,
  Virada, reserva), teste de Mandel, chance de repasse (Virada).
- Ressalva obrigatória: "Este número não muda com as dezenas escolhidas e não
  é chance de ganhar. Ele mostra quanto de cada real apostado volta, em média,
  neste concurso — sempre menos do que foi apostado."
- Teste de Mandel, ressalva obrigatória: "É uma medida, não uma sugestão: o
  app não recomenda comprar apostas em quantidade."
- Indisponível (FR-020): "Sem [dado], o valor deste concurso não pode ser
  calculado sem inventar números." — nunca um número aproximado.

### Contrato do fechamento (FR-025, FR-026)

Modelo: "Se **t** ou mais das suas **v** dezenas saírem [e pelo menos um dos
seus trevos], algum dos **J** jogos acerta pelo menos **t** dezenas [+ 1
trevo] — faixa **K**, prêmio mínimo de **R$ M** [ou: valor de rateio]. Custo:
**R$ C**. Chance de a condição acontecer: **P%** (1 em **N**). Um fechamento
não muda o retorno esperado por real; ele troca muitos resultados pequenos por
uma garantia condicional."

### Laboratório (FR-028 a FR-030)

- "Não aprovado" e "aprovado" com o mesmo tamanho, peso e posição; nunca
  "não aprovado" escondido, colapsado ou em cor de menor contraste.
- Para a Família C: "dentro da amostra X; fora da amostra Y; diferença Z (o
  sobreajuste)".
- Texto fixo: "Em sorteio honesto, nenhum método prevê o próximo resultado.
  Este laboratório testa os métodos mais vendidos para mostrar isso com dados
  — e mostraria o contrário se os dados dissessem o contrário."

### Auditoria forense (FR-033 a FR-037)

- A10: "Concursos para conferir (triagem): número de ganhadores fora do
  esperado. Pode ser erro na fonte de dados, um padrão atípico de apostas ou
  limitação do modelo. Não é acusação de fraude."
- Era encerrada: "Este resultado se refere a [equipamento/local] que não está
  mais em uso e não afeta a geração."

## Frases proibidas (FR-040)

Um teste varre `web/locales/pt-BR/common.json`, `docs/*.md` novos e os textos
do motor e falha em qualquer ocorrência destes padrões que **não** esteja
negada no mesmo período ("não", "nenhum", "nada", "nunca"):

- "aumenta(r) a chance", "mais chance(s) de ganhar", "melhora(r) as chances"
- "números quentes para ganhar", "dezenas com mais chance", "dezenas que vão
  sair"
- "previsão do próximo sorteio", "prever o resultado"
- "garantia de ganhar", "lucro garantido", "estratégia vencedora", "jogo
  certeiro"
- "aposte agora", "não perca", "compre" (imperativos de venda)

## Revisão de conteúdo (SC-007)

Checklist do PR de cada fase com UI:

- [ ] Todo número derivado tem a ressalva no mesmo painel.
- [ ] Nenhuma frase proibida (teste automatizado verde).
- [ ] Reprovação e aprovação com o mesmo destaque.
- [ ] Estados de indisponibilidade com motivo, sem número.
- [ ] Contraste e tamanho dos textos de ressalva iguais aos do número que
      acompanham (sem "letra miúda").
