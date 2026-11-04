# Design system — Material Design 3 + Google Sans Flex

**Data:** 2026-11-04 · **Escopo:** `web/` (PWA Next.js + MUI 9) · Estado: em
produção desde ` este commit `.

## 1. Decisões

| Decisão | Escolha | Motivo |
| --- | --- | --- |
| Sistema de design | Material Design 3 (baseline) | Solicitado; é o sistema atual do Google/Android e o MUI já fornece a base de componentes |
| Fonte | Google Sans Flex (variável, 100–900, eixos opsz/slnt/wdth/ROND/GRAD) | Solicitada; fonte da marca Google para Material 3 |
| Distribuição da fonte | **Auto-hospedada** via `next/font/local` (`web/src/fonts/GoogleSansFlex.woff2`) | LGPD: nenhuma requisição a servidores de fonte de terceiros (IP do usuário não vaza); PWA: funciona offline; CSP/headers: nada muda (origem própria) |
| Licença | OFL-1.1 — cópia em `web/src/fonts/OFL.txt` | Redistribuição permitida com a licença acompanhando o arquivo |
| Tema claro/escuro | Mantido por **variáveis CSS** (`colorSchemeSelector: 'media'`) | Decisão anterior de acessibilidade (sem flash claro no escuro na primeira carga) — preservada |
| Paleta por modalidade | Mega-Sena (verde), +Milionária (azul), Quina (roxo) entram como `primary`; os demais papéis M3 vêm do esquema neutro | Cada modalidade mantém a identidade; superfícies e containers seguem o baseline M3 |

## 2. Papéis de cor implementados

Papéis M3 na paleta do MUI (augmentados em `web/src/theme.ts`), viram
variáveis CSS (`--mui-palette-*`) nos dois esquemas:

- `primary` (cor da modalidade, verificado ≥ 4,5:1) e `onPrimary`
- `primaryContainer` / `onPrimaryContainer` (tom da marca — tabela §3)
- `secondaryContainer` / `onSecondaryContainer` (baseline neutro M3 — pílula
  da navegação)
- Superfícies: `surface` (fundo), `surfaceContainer` (cartões/`paper`),
  `surfaceContainerHigh` (diálogos), `surfaceContainerLow/Lowest/Highest`,
  `surfaceVariant`, `onSurface`, `onSurfaceVariant` (texto secundário)
- `outline` / `outlineVariant` (contornos e `divider`)

Mapeamento MUI: `background.default` = `surface`, `background.paper` =
`surfaceContainer`, `text.secondary` = `onSurfaceVariant`, `divider` =
`outlineVariant`.

## 3. Contraste (WCAG 2.x, exigido ≥ 4,5:1 por teste)

Verificação automatizada em `web/src/theme.md3.test.ts` (26 casos) +
`web/src/__tests__/themeAccessibility.test.ts`. Destaques medidos:

| Par | Claro | Escuro |
| --- | --- | --- |
| `onPrimary`/`primary` (rótulo sobre a modalidade) | 6,72–8,02:1 | 7,01–7,80:1 |
| `primary` como texto sobre `surfaceContainer` (cartões) | 5,84:1 (Mega) | — |
| `primary` como texto sobre `surfaceContainerHighest` | 5,18:1 (Mega) | — |
| `onPrimaryContainer`/`primaryContainer` (Mega) | 12,06:1 | 8,02:1 |
| `onPrimaryContainer`/`primaryContainer` (+Milionária) | 13,27:1 | 6,88:1 |
| `onPrimaryContainer`/`primaryContainer` (Quina) | 12,47:1 | 9,25:1 |
| `onSecondaryContainer`/`secondaryContainer` (nav) | 13,24:1 | 7,19:1 |
| `onSurface`/`surface` | 16,23:1 | 14,35:1 |
| `onSurfaceVariant`/`surface` (texto secundário) | 8,88:1 | 10,91:1 |
| `onSurface`/`surfaceContainer` (cartões) | 14,85:1 | 12,57:1 |
| `onSurface`/`surfaceContainerHigh` (diálogos) | 13,94:1 | 11,08:1 |

## 4. Escala tipográfica M3 → slots MUI

Google Sans Flex em tudo; pesos conforme a escala M3 (headline 400,
títulos/rótulos 500); tracking em `em` (escala com a fonte do usuário);
tamanhos em `rem` (decisão de acessibilidade preservada).

| Slot MUI | Papel M3 | Valor |
| --- | --- | --- |
| `h1` | headline-large | 32/40 · 400 |
| `h2` | headline-medium | 28/36 · 400 |
| `h3` | headline-small | 24/32 · 400 |
| `h4` | title-large | 22/28 · 400 |
| `h5` | title-medium ampliado | 20/28 · 500 |
| `h6` | title-medium | 16/24 · 500 |
| `body1` | body-large | 16/24 · 400 · +0.03125em |
| `body2` | body-medium | 14/20 · 400 · +0.01786em |
| `button` | label-large | 14/20 · 500 · +0.00714em |
| `caption` | body-small | 12/16 · 400 · +0.03333em |
| `overline` | label-small | 11/16 · 500 · +0.04545em |

## 5. Escala de forma e componentes

- **Botões** (`MuiButton`): pílula completa (`9999px`), rótulo label-large
  (500), área de toque 44 pt preservada.
- **Diálogo**: canto extra-large (28 px) sobre `surfaceContainerHigh`.
- **Cartão**: canto medium (12 px), `outlined` com contorno `outlineVariant`,
  fundo `surfaceContainer` (hierarquia por tono).
- **Campo**: canto extra-small (4 px), área de toque 44 pt.
- **Chip**: canto small (8 px).
- **NavigationBar**: pílula `secondaryContainer` de 64×32 px em volta do
  ícone ativo (indicador M3); rótulo ativo `onSecondaryContainer`; fundo
  `surfaceContainer`.
- **ToggleButton**: não selecionado em `onSurfaceVariant` — o padrão do MUI
  (ação com α 60%) media 4,43:1 sobre `surfaceContainer` e era reprovado pelo
  axe; selecionado mantém `primary`/`onPrimary` (≥ 4,5:1 verificado).
- **Intocados de propósito** (a11y já resolvida e testada): foco visível de
  2 px, helper/rótulo desabilitado em `text.secondary`, polegar do slider
  28 pt, rótulos da barra em 12 px fixos.

## 6. Como ajustar

- Cor de uma modalidade: `BRAND` e `M3_BRAND_CONTAINER` em
  `web/src/theme.ts` — qualquer par novo **tem de passar** nos testes de
  contraste (rodam no CI; atualize as medições nos comentários).
- Superfícies/tonos neutros: `M3_NEUTRAL` (baseline M3; evite inventar tons).
- Tipografia: tabela da seção 4; mantenha pesos/tracking da escala M3.
- Fonte: o `.woff2` é o subset latin da família variável (Fontsource,
  `google-sans-flex:vf`); para atualizar, troque o arquivo em
  `web/src/fonts/` mantendo o `OFL.txt` ao lado.

## 7. Efeitos colaterais verificados

- **PWA**: `.woff2` (~50 KB) entra no precache do next-pwa (asset de build);
  `display: swap` + preload gerado pelo `next/font`.
- **Lighthouse**: sem mudança de CSP; fonte pré-carregada da própria origem;
  verificação visual dos 4 gateways feita no build local.
- **Testes**: 788/788 (26 novos no contrato MD3); `tsc` e `eslint` limpos.
