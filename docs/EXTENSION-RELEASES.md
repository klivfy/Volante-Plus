# Extension Release Cycle

Este documento descreve como versionar, construir e publicar atualizações das extensões do navegador (Chrome Web Store, Microsoft Edge Add-ons, Firefox Add-ons).

## Versionamento

Volante+ usa **Semantic Versioning** (semver): `MAJOR.MINOR.PATCH`

- **MAJOR**: Breaking changes (arquitetura, removido recursos)
- **MINOR**: Novas features ou melhorias
- **PATCH**: Bug fixes e atualizações de dependências

### Versão única para todo o projeto

A versão de referência da extensão é a do **`web/package.json`** — a extensão
empacota o mesmo app (popup = export estático do Next). Os três
`extension/manifests/*.manifest.json` precisam estar na mesma versão.

O manifest **não** é atualizado automaticamente durante o build:
`extension/build.mjs` copia cada manifest verbatim. Quem sincroniza é
`scripts/sync-extension-versions.mjs`, que tem dois modos:

```bash
# Escreve a versão nos três manifests
node scripts/sync-extension-versions.mjs 2.3.0

# Só confere (não escreve) e falha se algum divergir — é o que o CI roda
node scripts/sync-extension-versions.mjs --check 2.3.0
```

Dois portões no CI garantem que isso nunca passe despercebido:

- **`web-ci.yml`** confere os manifests contra o `web/package.json` em todo PR;
- **`extension-release.yml`** confere contra a versão da tag antes de empacotar.

### Convenção de tags

Cada artefato tem um workflow dono, para que uma tag não dispare três
releases concorrentes:

| Tag | Workflow | Publica |
|---|---|---|
| `web-vX.Y.Z` | `extension-release.yml` | zips das extensões (Chrome/Edge/Firefox) |
| `vX.Y.Z` | `release.yml` | APK Android de debug |
| `vX.Y.Z-android` | `android-build.yml` | APK Android de release assinado |
| `vX.Y.Z-desktop` | `desktop-ci.yml` | instaladores Windows (.msi/.exe) |

### Exemplo de bump

Para liberar a versão `2.4.0` da extensão (e do web):

```bash
# 1. Atualizar a versão do web
npm version 2.4.0 --no-git-tag-version --prefix web

# 2. Sincronizar versão em todos os manifests da extensão
node scripts/sync-extension-versions.mjs 2.4.0

# 3. Commitar
git add web/package.json web/package-lock.json extension/manifests/
git commit -m "chore: bump version to 2.4.0"

# 4. Criar e publicar a tag da plataforma web/extensão
git tag web-v2.4.0
git push origin web-v2.4.0
```

## Build automatizado de releases

Quando você cria uma tag `web-v*` (ex.: `web-v2.4.0`):

1. **GitHub Actions** (`.github/workflows/extension-release.yml`) é acionado
2. Confere que os manifests estão na versão da tag (falha o job se não)
3. Instala dependências (`npm ci` em `extension/` e `extension/popup-app/`)
4. Build dos 3 alvos: Chrome, Edge, Firefox
5. Artefatos gerados:
   - `extension/dist/chrome.zip`
   - `extension/dist/edge.zip`
   - `extension/dist/firefox.zip`
6. Publicados como assets de uma **Release em rascunho**, com o número da
   versão no nome (`volante-plus-chrome-2.4.0.zip`)

### Workflow detalhes

Ver [`.github/workflows/extension-release.yml`](https://github.com/mestrys/volante-plus/blob/main/.github/workflows/extension-release.yml).
A publicação usa o **`gh` CLI** (`gh release create` / `gh release upload`), o
mesmo padrão de `release.yml` e `desktop-ci.yml` — as actions
`actions/create-release@v1` e `actions/upload-release-asset@v1` usadas antes
estão descontinuadas e rodam em runtimes Node sem manutenção.

## Publicação nas lojas

### Antes de publicar

1. Clique em **Releases** no GitHub
2. Abra o draft criado pela CI (ex.: `Release v2.1.0`)
3. **Revise**:
   - Changelog é preciso?
   - Screenshots atualizadas?
   - Descrição da loja reflete mudanças?
4. Faça download dos `.zip` gerados pela CI

### Chrome Web Store

1. Acesse [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. Clique na extensão **Volante+**
3. → **Pacotes** → **Upload novo pacote**
4. Envie `volante-plus-chrome.zip`
5. Atualize:
   - Descrição (se houver mudanças)
   - Screenshots (se houver mudanças de UI)
   - Changelog/Release notes
6. Clique **Enviar para revisão**
7. Espere aprovação (geralmente 1-2 dias)

**Notas**:
- Não é necessário atualizar `version` no manifest — já vem correto do build
- A loja detecta versão automaticamente

### Microsoft Edge Add-ons

1. Acesse [Partner Center — Extensões do Microsoft Edge](https://partner.microsoft.com/dashboard/microsoftedge/overview)
2. Clique na extensão **Volante+**
3. → **Pacotes** ou **Upload** (varia por versão)
4. Envie `volante-plus-edge.zip`
5. Preencha:
   - Descrição (se mudou)
   - Screenshots (se mudou)
   - Release notes
6. Submeta para **Certificação**
7. Espere aprovação (geralmente 24-48 horas)

**Notas**:
- Edge usa o mesmo manifest que Chrome (Manifest V3 idêntico)
- Cópias de loja são independentes — aprovar no Chrome não aprova no Edge

### Firefox Add-ons (addons.mozilla.org)

1. Acesse [Firefox Add-on Developer Hub](https://addons.mozilla.org/developers/)
2. Clique em **Minhas extensões** → **Volante+**
3. → **Upload nova versão**
4. Envie `volante-plus-firefox.zip`
5. Preencha:
   - Release notes (obrigatório)
   - Categoria
   - Descrição (se mudou)
   - Screenshots (se mudou)
6. Escolha:
   - **On this site** — listagem pública no AMO (com revisão da Mozilla, ~7 dias)
   - **On your own** — assinada pela Mozilla, você distribui (mais rápido, ~3 dias)
7. Submeta
8. **Revisão automática** (~3-7 dias):
   - Scanner verifica código malicioso
   - Revisor humano lê o código
   - Notificação por email se aprovado/rejeitado

**Notas**:
- Firefox exige assinatura da Mozilla antes de instalar permanentemente
- Carregamento "temporário" (`about:debugging`) não exige assinatura (dev)
- Release notes são obrigatórias em todas as submissões

## Checklist de release

```markdown
- [ ] Versão atualizada em web/package.json
- [ ] Manifests sincronizados (node scripts/sync-extension-versions.mjs <versão>)
- [ ] Commit e tag `web-vX.Y.Z` criados
- [ ] GitHub Actions concluiu build com sucesso
- [ ] Artifacts aparecem na Release page
- [ ] Changelog/release notes preparado
- [ ] Screenshots atualizadas (se necessário)
- [ ] Descrição de loja revisada (se necessário)
- [ ] Chrome Web Store — enviado para revisão
- [ ] Microsoft Edge Add-ons — enviado para certificação
- [ ] Firefox Add-ons — enviado para revisão
- [ ] Aguardar aprovação em cada loja
- [ ] Publicar release no GitHub (não mais como draft)
```

## Timeline típico

| Etapa | Duração |
|-------|---------|
| Build CI/CD (após tag push) | ~2-5 min |
| Revisão manual e download | ~5-15 min |
| Chrome Web Store revisão | ~1-2 dias |
| Edge Add-ons certificação | ~1-2 dias |
| Firefox Add-ons revisão | ~3-7 dias |
| **Total até todos publicados** | **~1-2 semanas** |

## Rollback (revogar uma release)

Se uma versão tiver bugs críticos:

1. **Chrome Web Store**: Clique "Deslistar" (remove públicos, existentes continuam funcionando)
2. **Edge Add-ons**: Clique "Unpublish" (similar)
3. **Firefox Add-ons**: Clique "Delete version" (permanente) ou "Disable" (temporário)
4. Prepare versão de bugfix (ex.: 2.1.1)
5. Faça novo build e resubmeta

## Debugging de rejeição

Se uma loja rejeitar:

### Chrome Web Store

- Email de rejeição descreve o motivo
- Geralmente: descrição enganosa, screenshots ruins, ou bugs óbvios
- Correção: fixe o issue, faça resubmissão

### Edge Add-ons

- Email de certificação inclui log detalhado
- Pode ser necessário explicar uso de APIs sensíveis
- Resubmissão permitida após correção

### Firefox Add-ons

- Reviewer deixa comentário públicamente (também via email)
- Você pode responder antes de resubmeter
- Comumente: código danificado, permissões injustificadas, ou descrição vaga

## Automatizar mais?

### Submissão automática

Seria possível automatizar submissão às lojas, mas:

- **Chrome/Edge**: Têm APIs oficiais, mas requerem OAuth2 complexo
- **Firefox**: Tem API, mas não integrada nativamente
- **Risk**: Submeter código errado sem revisão humana

**Recomendação**: Manter build automático (GitHub Actions), submissão manual (você revisa antes).

### Changelog automático

Se quiser changelog automático a partir de commits:

```bash
# Usar ferramenta como conventional-changelog
npm install -D conventional-changelog-cli

npm run changelog  # Gera CHANGELOG.md a partir de commits "fix:" e "feat:"
```

Integrar no workflow CI antes do build de release.

## Referências

- [Chrome Web Store Publishing Guide](https://developer.chrome.com/docs/webstore/publish/)
- [Microsoft Edge Add-ons Submission Guide](https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/how-to/submission-guide)
- [Firefox Add-ons Developer Guide](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/)
- [Semantic Versioning](https://semver.org)
