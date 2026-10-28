# Histórico de concursos: completo desde o 1º e sempre no último

## Garantias do app web

1. **Nasce completo.** O app embute o histórico REAL de cada modalidade, do
   concurso 1 até o da geração do seed (`web/src/data/history/`, ver
   `meta.json`): Mega-Sena 1..3063 e +Milionária 1..393 (até 27/09/2026) e
   Quina 1..7149 (até 22/10/2026). Antes, o "seed offline" era sintético
   (50 concursos inventados por PRNG) e um usuário sem rede analisava
   sorteios que nunca existiram. O sintético foi movido para
   `data/syntheticFixture/` e só serve à guarda de procedência da auditoria.
2. **Fica no último concurso.** A sincronização descobre o último concurso
   realizado e busca **só o que falta**.
3. **Sem buracos.** Ela compara `1..último` com o que está salvo; lacunas antigas
   são preenchidas do mesmo jeito que concursos novos.
4. **Análise sempre sobre o histórico atual.** O cache de desempenho `auto` é
   recalculado quando o histórico avança, e na hora em que a sincronização grava
   concursos novos com o app aberto.

## Como a sincronização funciona (`services/historySync.ts`)

```
último concurso (1ª fonte que responde)
  → ausentes = 1..último − concursos salvos
  → ≤ 60 ausentes: busca um a um (até 4 em paralelo, com fallback entre fontes)
  → > 60 ausentes: baixa o histórico inteiro de uma vez
  → só grava o que passa na validação estrutural
```

Quando roda: ao abrir o app, ao voltar à aba e a cada 30 min com o app aberto
(uma chamada de ~1 KB quando nada mudou); em segundo plano a cada 6 h
(Periodic Background Sync no PWA, `chrome.alarms` na extensão).

Validação (`drawSources.isValidDraw`): concurso positivo, data ISO válida,
dezenas distintas dentro do universo e na quantidade da modalidade e, na
+Milionária, 2 trevos distintos em 1..6. Um concurso que falhe **não entra no
banco**. Um `byContest(n)` que devolva outro número de concurso é descartado.

O painel da tela principal mostra o intervalo (`concursos 1 a 3063`), a data do
último e o estado: em dia, sem conseguir consultar agora, ou com lacunas.

## Fontes

Em ordem: API da comunidade (`loteriascaixa-api`, a única exercitada contra
respostas reais ao implementar), `api.guidi.dev.br` e o portal da Caixa. Todas de
terceiros, exceto a última — que não envia CORS e por isso só responde à extensão
ou fora do navegador. **Nenhuma é uma exportação oficial**, e o app não a trata
como tal. Se uma fonte cair, a próxima assume; se todas caírem, o app segue com o
que tem e diz isso na tela.

O endereço principal pode ser trocado por `NEXT_PUBLIC_CAIXA_API_BASE_URL`.

## Verificação do seed

`scripts/update-history-seed.mjs` **aborta sem gravar nada** se: o histórico não
for contíguo desde o concurso 1; algum concurso violar as regras da modalidade;
ou dezenas/trevos divergirem do espelho independente (`data/mirrorSnapshot/`,
coletado por outro caminho) nos concursos em comum. Na geração atual: 3.063 +
393 concursos, **0 divergências** em 2.797 + 199 comparados. Duas fontes de
terceiros concordarem não é prova de que batem com a Caixa, mas descarta erro de
transcrição de uma delas. O seed da Quina (7.149 concursos) foi conferido
concurso a concurso — dezenas e datas — contra o portal da Caixa, como registrado
no CHANGELOG (`[Unreleased]`).

```
node scripts/update-history-seed.mjs                    # baixa da API e regenera
node scripts/update-history-seed.mjs --from-dir <dir>   # a partir de arquivos já baixados
```

Ao regenerar, a versão do seed (`historySeedVersion`) muda e o app aplica o novo
seed uma vez: preenche o que falta e nunca sobrescreve um concurso já
sincronizado. Usuários de versões antigas têm os concursos sintéticos removidos
do banco (só linhas idênticas à fixture; dado real nunca é tocado).

## Limites

- Datas do espelho antigo são sintéticas (a fonte não as trazia); as do seed
  atual são as reais da API.
- Sem rede E sem sincronização anterior, o app usa o seed — completo, mas parado
  na data de geração dele. O painel mostra "sem conseguir consultar".
- A extensão de navegador só acessa o host da fonte principal
  (`host_permissions`). Ampliar isso desativaria a extensão até o usuário
  reaprovar, então as fontes de reserva ficam inertes nela.
- O app desktop (Kotlin) tem seed e sincronização próprios e **não** foi
  alterado aqui.
- O app Android também tem sincronização própria (inalterada), mas o seed
  embarcado dele (`app/src/main/assets/seed/*.csv`) deixou de ser
  independente: é gerado a partir deste mesmo histórico (`scripts/generate-
  android-seed.mjs`, a partir da raiz do repositório) — nunca uma segunda
  busca/validação separada, para as duas plataformas nunca divergirem
  silenciosamente uma da outra. Ver `app/src/main/assets/seed/README.md`.

## Verificação agendada (Fase 4)

A conferência do seed deixou de depender de alguém lembrar de rodar: o
workflow `provenance.yml` executa `scripts/provenance-check.mjs` **toda
quinta-feira às 04:00 UTC**, a cada push que toque os dados de histórico e
sob demanda (`workflow_dispatch`). São duas camadas, com semântica de falha
distinta:

1. **Offline (sempre)** — o seed embutido contra as regras de cada
   modalidade e contra o espelho independente versionado
   (`data/mirrorSnapshot/`), mais a procedência SHA-256 do seed (por
   arquivo e concatenação canônica — a mesma da auditoria). Qualquer
   divergência num concurso em comum acende o alarme.
2. **Fontes ao vivo (padrão; `--offline` pula)** — busca o concurso mais
   recente em cada fonte configurada do app e cruza os resultados: fontes
   que divergem entre si para o MESMO concurso, ou que devolvem resultado
   diferente do seed para concurso que o seed já tem, **acendem o alarme**
   (job vermelho). Fonte que não responde é indisponibilidade declarada no
   relatório — nunca falha, porque o gate agendado não pode tremer por rede.

O relatório JSON da execução fica como artefato do GitHub por 90 dias
(inclusive quando há divergência), com commit, data UTC e digest do seed —
a mesma disciplina de identidade do relatório de auditoria da calibração.

```bash
node scripts/provenance-check.mjs              # offline + fontes ao vivo
node scripts/provenance-check.mjs --offline    # só seed × espelho versionado
```

Resultado da implementação (2026-10-28, seed 3063-393-7149): offline com
**0 divergências** em 3.063 + 393 + 7.149 concursos (2.797 + 199 + 7.149
comparados ao espelho); online com a fonte principal respondendo (13 + 8 + 4
concursos além do seed, coerentes com a data de geração dele) e as outras
duas sem resposta no ambiente — declaradas, sem alarme.
