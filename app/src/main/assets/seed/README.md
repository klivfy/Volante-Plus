# Seed do histórico de concursos

Coloque aqui os arquivos com o histórico oficial exportado (fonte: Caixa):

- `megasena.csv`
- `maismilionaria.csv`

Formato (separador `;`, data ISO-8601, dezenas/trevos separados por espaço):

```
# concurso;data;dezenas;trevos
2700;2024-06-01;04 12 23 34 45 56;
150;2024-06-01;01 02 03 04 05 06;2 5
```

A coluna de trevos fica vazia para a Mega-Sena. O seed é importado apenas
quando a tabela local está vazia (`AssetDrawSeeder.seedIfEmpty`); concursos
posteriores chegam pela sincronização incremental com a API da Caixa
(`SyncDrawHistory`). Nenhum dado fictício deve ser commitado aqui.
