# Publicar o Volante+ na Microsoft Store (PWA)

Este documento é só processo — nenhum passo aqui é executado automaticamente.
Submeter o app à Microsoft Store é uma ação manual, feita por uma pessoa com
conta no Partner Center, fora do controle deste repositório ou de CI.

## 1. Checklist de requisitos do PWA

| Requisito | Status | Onde |
|---|---|---|
| `manifest.json` com `name`, `short_name`, `start_url`, `display: standalone` | ✅ | `web/public/manifest.json` |
| Ícone 512×512 no manifest | ✅ | `icon-512x512.png` (também há 192×192) |
| Service Worker funcional (cache offline) | ✅ | `web/next.config.ts` + `docs/PWA.md` (implementado na fase de PWA) |
| HTTPS | ⏳ Depende do deploy | Garantido automaticamente por qualquer deploy na Vercel (ou outro host com TLS). **Não serve localhost/HTTP para submissão** — precisa da URL de produção. |

O `manifest.json` já atende aos três primeiros itens sem precisar de
mudança — conferido lendo o arquivo diretamente, não por suposição.

## 2. Assets de loja gerados

Todos em `web/public/store-assets/`, gerados a partir do app rodando de
verdade (não mockups desenhados à mão):

| Arquivo | Tamanho | Uso |
|---|---|---|
| `microsoft-store-screenshot.png` | 1280×720 | Screenshot principal (desktop, modo claro) |
| `desktop-dark.png` | 1280×720 | Desktop, modo escuro |
| `mobile-light.png` | 412×915 | Mobile, modo claro |
| `mobile-dark.png` | 412×915 | Mobile, modo escuro |
| `store-logo-300x300.png` | 300×300 | Ícone/logo da listagem na loja |

Também novo: `web/public/icon-144x144.png` (tile do Windows — ver seção 3) e
`web/public/privacy-policy.html` (política de privacidade, seção 4).

**Nota sobre os screenshots**: o card de "próximo concurso" nos screenshots
mostra dados de exemplo (concurso 2900, prêmio R$ 45.000.000) — a API real de
resultados não é alcançável a partir do ambiente onde as capturas foram
geradas. Antes de submeter para valer, tire novos screenshots contra o
deploy de produção de verdade (com a API respondendo), especialmente se você
quiser refletir dados atuais na imagem.

## 3. Meta tag de tile do Windows

Adicionada em `web/src/app/layout.tsx` (via `metadata.other`, o jeito
idiomático do Next para tags `<meta>` sem suporte nativo):

```html
<meta name="msapplication-TileImage" content="/icon-144x144.png" />
<meta name="msapplication-TileColor" content="#6750A4" />
```

O caminho usado é `/icon-144x144.png`, não `/icons/icon-144.png` — para
seguir a mesma convenção dos outros ícones do projeto, todos na raiz de
`public/` (`icon-192x192.png`, `icon-512x512.png`).

## 4. Política de privacidade

`web/public/privacy-policy.html` — servida como página estática em
`/privacy-policy.html` no mesmo domínio do app. Conteúdo: o app não coleta
dado pessoal algum (sem conta, sem analytics), armazenamento local
(cache do Service Worker + IndexedDB) explicado, e contato do desenvolvedor:
**privacidade@mestrys.com.br**.

## 5. Conteúdo da listagem

Rascunho pronto para colar no Partner Center — ajuste como preferir antes de
submeter.

**Nome:** Volante+

**Categoria:** Utilitários e Ferramentas

**Descrição curta:**
> Gerador estatístico para Mega-Sena e +Milionária. Sem palpite, sem número quente — backtesting transparente contra o histórico oficial.

**Descrição completa:**
> Volante+ é um laboratório estatístico para as loterias Mega-Sena e
> +Milionária. Em vez de prometer "números da sorte", o app usa
> backtesting — testar um modelo contra o histórico real de concursos — para
> classificar o desempenho de cada dezena e gerar jogos com base nisso.
>
> - Gere de 2 a 5 jogos por vez, ponderados pelo desempenho histórico das
>   dezenas.
> - Rode backtesting comparando qualquer janela de treino/validação contra o
>   baseline teórico (distribuição hipergeométrica).
> - Funciona offline depois da primeira visita: histórico e geração de jogos
>   não dependem de internet.
> - Sem cadastro, sem anúncio, sem coleta de dado pessoal.

**Palavras-chave:** loteria, mega-sena, +milionária, backtesting, estatística, gerador de jogos, apostas, análise de dados

**Classificação etária sugerida:** conteúdo genérico (o app não processa
apostas nem pagamentos — é uma ferramenta de análise). Preencha o
questionário de classificação etária do Partner Center com essa orientação;
a classificação final é definida pela própria Microsoft a partir das suas
respostas.

## 6. Submissão no Partner Center (processo manual)

1. Acesse [partner.microsoft.com](https://partner.microsoft.com) com uma
   conta Microsoft.
2. Pague a taxa única de desenvolvedor individual (US$ 19 — cobrada pela
   Microsoft, uma vez só, não recorrente).
3. **Criar novo app** → selecione o tipo **PWA**.
4. Informe a URL do PWA em produção (ex.: `https://SEU-PROJETO.vercel.app` —
   substitua pela URL real do seu deploy, ver `docs/WEB.md#deploy`).
5. Faça upload dos assets da seção 2 (ícone da loja, screenshots).
6. Preencha descrição, categoria e classificação etária com o conteúdo da
   seção 5.
7. Informe a URL da política de privacidade:
   `https://SEU-PROJETO.vercel.app/privacy-policy.html`.
8. Submeta para revisão.

A revisão da Microsoft normalmente leva de 1 a 3 dias úteis. Nenhum desses
passos é automatizável de forma responsável — envolve pagamento e uma conta
pessoal/organizacional que não pertence a este repositório.

## 7. Validação opcional com PWABuilder

Antes de submeter, [pwabuilder.com](https://www.pwabuilder.com/) aceita a
URL do seu deploy e roda uma auditoria específica para os requisitos da
Microsoft Store (Windows), além de poder gerar o pacote MSIX que o Partner
Center pede em alguns fluxos de submissão. É uma ferramenta de terceiros —
rode manualmente apontando para a sua URL de produção.
