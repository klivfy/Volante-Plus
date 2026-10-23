# Contrato: histórico embutido da Quina (fonte única → plataformas)

## Obrigações do produtor (`web/scripts/update-history-seed.mjs`, `scripts/generate-android-seed.mjs`)

1. Ler a Quina da API comunitária e **recusar gravar nada** se: a sequência
   não for contígua de 1 ao último sem duplicata; algum concurso não tiver 5
   dezenas distintas em 1–80; houver trevo; a data não for ISO válida; ou
   houver divergência de **dezenas ou data** contra
   `web/src/data/mirrorSnapshot/quina.json` (coletado do portal da Caixa) em
   qualquer concurso comum às duas fontes.
2. Gravar `web/src/data/history/quina.json` (tuplas de 3 elementos) e a
   entrada `lotteries.quina` de `meta.json` (`count`, `firstContest`,
   `lastContest`, `lastDate`, `crossChecked`).
3. O gerador do Android lê **somente** `web/src/data/history/` e grava
   `app/src/main/assets/seed/quina.csv` — nunca busca em rede. Falha nas três
   modalidades impede a gravação de **todas** (já é assim desde a feature
   001).
4. Saída determinística: mesma entrada → mesmo arquivo, byte a byte.
5. Ao terminar, imprimir por modalidade quantos concursos e a data do último.

## Obrigações dos consumidores

- `AssetDrawSeeder.seedIfEmpty(QUINA)` lê `seed/quina.csv` e só semeia banco
  vazio; arquivo ausente retorna 0 sem erro (comportamento atual).
- `loadHistorySeed(QUINA)` importa `quina.json` por `import()` dinâmico e
  **nunca** cai em `default: []` silencioso para a Quina.
- `historySeedVersion()` passa a incluir o último concurso da Quina.
- O seed nunca sobrescreve concurso já sincronizado.

## Rótulo de procedência (Princípio IV)

`third_party_mirror` para o seed; `meta.json.crossChecked` registra quantos
concursos foram conferidos contra o portal da Caixa. Nenhuma tela chama o
histórico da Quina de "oficial".

## Verificações automatizadas (Princípio III)

- Seed real: contíguo, 5 dezenas, 1–80, `count`/`lastContest` iguais a
  `meta.json` (Kotlin e TypeScript).
- Controles positivos (seed corrompido deve falhar): lacuna na sequência,
  dezena 81, 6 dezenas num concurso, trevo presente.
