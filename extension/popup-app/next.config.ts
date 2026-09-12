import path from "node:path";
import type { NextConfig } from "next";

/**
 * Popup da extensão: precisa virar HTML/JS/CSS estáticos para caber dentro do
 * pacote da extensão (Manifest V3 não roda um servidor Next.js). `output:
 * "export"` gera exatamente isso em `out/`; sem servidor, `images.unoptimized`
 * é obrigatório (o otimizador de imagem do Next depende de uma rota de
 * servidor).
 *
 * WHY (sem assetPrefix): o Next exporta os assets com caminho absoluto
 * (`/_next/static/...`), resolvido contra a raiz da *origin*. Uma extensão
 * serve tudo sob `chrome-extension://<id>/`, então `build.mjs` copia esta
 * exportação para a **raiz** de `dist/<target>/` (não para uma subpasta
 * `popup/`) — assim `/_next/...` aponta pro lugar certo sem precisar
 * reescrever nada.
 */
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  // Necessário para importar módulos puros de `../web/src/engine` e
  // `../src/` (fora da raiz deste projeto) — por padrão o webpack do Next
  // recusa resolver imports que escapam do diretório do projeto.
  experimental: { externalDir: true },
  // Silencia o aviso de "workspace root" — este projeto importa módulos de
  // `../web` e `../src`, então a raiz de rastreamento real é a raiz do
  // monorepo (`../../`), não `popup-app/` sozinho.
  outputFileTracingRoot: path.join(__dirname, "../.."),
};

export default nextConfig;
