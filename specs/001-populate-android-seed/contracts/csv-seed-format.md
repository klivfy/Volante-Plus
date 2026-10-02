# Contrato: formato do CSV de seed (`app/src/main/assets/seed/*.csv`)

Este contrato **já existe** (documentado em
`app/src/main/assets/seed/README.md` e implementado por
`shared/.../data/seed/CsvDrawParser.kt`) — esta feature é obrigada a
produzir um arquivo que satisfaça exatamente o que segue, sem alterar
nenhum dos dois lados do contrato.

## Produtor → Consumidor

- **Produtor** (novo, desta feature): `scripts/generate-android-seed.mjs`.
- **Consumidor** (já existente, inalterado): `CsvDrawParser.parse(lottery, content)`,
  chamado por `AssetDrawSeeder.seedIfEmpty(lottery)` na primeira execução do
  app.

## Formato

```
# comentário opcional, ignorado
concurso;data;dezenas;trevos
2700;2024-06-01;04 12 23 34 45 56;
150;2024-06-01;01 02 03 04 05 06;2 5
```

- Separador de coluna: `;`.
- Colunas: `concurso` (inteiro), `data` (ISO-8601 `yyyy-MM-dd`), `dezenas`
  (inteiros separados por espaço simples, ordem não é significativa para o
  parser mas MUST ser crescente por legibilidade/diff estável), `trevos`
  (idem; coluna vazia — ponto e vírgula seguido de nada — na Mega-Sena).
- Linhas em branco, iniciadas por `#`, ou cuja primeira coluna seja
  literalmente `concurso` (case-insensitive) são ignoradas pelo parser.
- Qualquer outra linha inválida (número de colunas fora de 3–4, dezena fora
  do universo, trevo fora de 1–6, data não parseável) faz `CsvDrawParser`
  lançar `IllegalArgumentException` com o número da linha — o parser já
  trata isso como erro fatal, não como linha a pular.

## Obrigações do produtor (`generate-android-seed.mjs`)

1. MUST escrever uma linha de cabeçalho `# concurso;data;dezenas;trevos` (ou
   equivalente reconhecido pelo parser) antes dos dados.
2. MUST ordenar as linhas por `concurso` crescente.
3. MUST deixar a coluna de trevos vazia para a Mega-Sena e preenchida com
   exatamente 2 valores para a +Milionária.
4. MUST NOT escrever nenhuma linha se a validação (ver `data-model.md`)
   falhar para qualquer concurso — falha fechada, sem saída parcial.
5. MUST produzir saída byte-idêntica para a mesma entrada (determinístico) —
   nenhum timestamp, ordem de iteração de `Map`/`Set`, ou locale-dependente
   no conteúdo gerado.

## Obrigações do consumidor

Nenhuma — `CsvDrawParser` e `AssetDrawSeeder` não mudam nesta feature. Eles
são o contrato fixo contra o qual o produtor é validado.

## Como este contrato é verificado

`app/src/test/.../data/seed/SeedHistoryIntegrityTest.kt` (novo) lê os dois
arquivos commitados em `app/src/main/assets/seed/` e chama
`CsvDrawParser.parse` diretamente sobre o conteúdo — se o produtor violar
qualquer obrigação acima de um jeito que o parser rejeite, o teste falha
apontando o arquivo e a linha.
