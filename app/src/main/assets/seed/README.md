# Seed do histórico de concursos

`megasena.csv` e `maismilionaria.csv` contêm o histórico oficial completo de
cada modalidade (do concurso 1 até o último coberto na geração). **Não edite
estes arquivos manualmente** — eles são gerados a partir do histórico já
validado no app web (`web/src/data/history/`, cruzado contra um espelho
independente por `web/scripts/update-history-seed.mjs`; ver
`docs/historico.md`). Duas derivações independentes do "histórico oficial"
divergiriam silenciosamente com o tempo (Constitution, Princípio V), então
este diretório nunca busca dado de uma fonte própria.

Para gerar ou atualizar os dois arquivos, a partir da raiz do repositório:

```bash
node scripts/generate-android-seed.mjs
```

O script aborta sem gravar nada em nenhuma modalidade se o histórico de
origem não for contíguo do concurso 1 ao último, violar as regras de alguma
modalidade, ou divergir da contagem/último concurso de
`web/src/data/history/meta.json`. Ao terminar com sucesso, imprime por
modalidade quantos concursos foram incluídos e a data do último concurso
coberto.

> ⚠ Como o próprio histórico de origem, este seed vem de uma agregação de
> terceiros dos resultados da Caixa (não da exportação oficial direta) — ver
> `docs/historico.md` para as garantias e limitações exatas dessa fonte.

Formato (separador `;`, data ISO-8601, dezenas/trevos separados por espaço):

```
# concurso;data;dezenas;trevos
2700;2024-06-01;04 12 23 34 45 56;
150;2024-06-01;01 02 03 04 05 06;2 5
```

A coluna de trevos fica vazia para a Mega-Sena. O seed é importado apenas
quando a tabela local está vazia (`AssetDrawSeeder.seedIfEmpty`); concursos
posteriores chegam pela sincronização incremental com a API da Caixa
(`SyncDrawHistory`).
