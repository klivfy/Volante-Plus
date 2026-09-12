# Espelho de terceiros — resultados reais, fonte não oficial

`megasena.json` (2.797 concursos) e `maismilionaria.json` (199 concursos)
neste diretório **são resultados reais de sorteios da Caixa**, mas passaram
por uma fonte de terceiros antes de chegar aqui. Isso é diferente tanto do
seed sintético de `data/seed/` (que é PRNG, não sorteio nenhum) quanto de uma
exportação oficial direta — e o código trata os três casos como coisas
distintas (`DrawProvenance` em `engine/audit/provenance.ts`).

## Origem

- Repositório: [`guilhermeasn/loteria.json`](https://github.com/guilhermeasn/loteria.json)
- Commit capturado: `f800c27777602e503129afaac529a1850377b074`
- Data desse commit: 2024-11-17 (não é a data da captura — é a última
  atualização do repositório; o workflow de atualização diária dele está
  desligado no momento da captura, então o dado está parado nesse ponto)
- Capturado em: 2026-09-10, por clone raso (`--depth 1`) do repositório
  público

## Por que não é `'official'`

A fidelidade destes números aos sorteios reais da Caixa depende inteiramente
da raspagem feita por aquele projeto, que este código não pode verificar —
só pode conferir a integridade estrutural (universo de dezenas, ausência de
repetição, contagem por concurso), o que foi feito e passou 0 problemas nos
2.797 + 199 concursos. Estrutura correta é evidência de que não é lixo ou
invenção; não é prova de que bate com a Caixa concurso a concurso.

`DrawDataset.provenance = 'third_party_mirror'` marca essa diferença, e
`assertAuditable` deixa isso passar — mas o relatório da auditoria imprime a
ressalva em destaque, antes de qualquer resultado.

## As datas são fabricadas — leia isto antes de usar `date`

A fonte não fornece data por concurso, só o número do concurso e as dezenas.
Sem data nenhuma, o campo `Draw.date` (que o tipo exige e a guarda de
integridade valida) ficaria vazio ou inválido. Em vez disso, cada concurso
recebeu uma data **sintética**, calculada por
`ancora + (contestNumber − 1) × intervalo_médio`:

| Loteria | Âncora (contest 1) | Intervalo médio |
|---|---|---|
| Mega-Sena | 1996-03-11 (data real de fundação) | 3,75 dias |
| +Milionária | 2022-02-05 (data real de fundação) | 7 dias (sorteio semanal) |

Essas datas **não são os dias reais dos sorteios** — são um espaçamento
uniforme entre duas âncoras reais, só para que o campo seja uma data válida.
`DrawDataset.datesAreApproximate = true` sinaliza isso, e nenhuma tela ou
relatório deste projeto deve exibi-las como fato. A ordenação cronológica
usada pela auditoria (`chronological()`) usa `contestNumber`, não `date` —
os concursos da Caixa são numerados sequencialmente, então a ordem já está
correta independente das datas fabricadas.

## +Milionária: formato de origem

A fonte guarda os 8 valores de cada concurso concatenados — as 6 dezenas
seguidas dos 2 trevos, sempre nessa ordem. Confirmado por inspeção de todo o
arquivo antes da conversão (nenhum dos 199 concursos tem dezena fora de
1–50 ou trevo fora de 1–6).

## Como isto se compara ao objetivo original

O Módulo A do protocolo de auditoria (`engine/audit/`) foi pré-registrado
antes de qualquer histórico real existir neste projeto — a rede de saída do
ambiente de desenvolvimento está bloqueada para a API oficial e para a
maioria dos hosts. Este espelho não é a exportação oficial que o protocolo
prevê como caso ideal, mas é a coisa mais próxima disponível sem depender de
alguém baixar o arquivo manualmente: dado real, estruturalmente íntegro,
com procedência declarada e suas limitações documentadas — em vez de esperar
indefinidamente ou (pior) auditar o próprio seed sintético.
