// Remove source maps do PWA que o build deixou em public/.
//
// Pentest 2026-11: sw.js.map, workbox-*.js.map e worker-*.js.map eram
// servidos publicamente e incluíam `sourcesContent` — o TypeScript original
// do service worker (com comentários) ficava acessível a qualquer um. O
// `sourcemap: false` no workbox cobre o sw gerado, mas o worker customizado
// é compilado por webpack em etapa própria; este passo final garante que
// nenhum .map chega ao deploy.
//
// Roda após `next build` (ver package.json). Silencioso por natureza: se não
// há .map, não há nada a fazer.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
let removed = 0;
for (const entry of fs.readdirSync(dir)) {
  if (entry.endsWith('.js.map')) {
    fs.unlinkSync(path.join(dir, entry));
    removed++;
  }
}
if (removed > 0) console.log(`strip-pwa-maps: ${removed} source map(s) removido(s) de public/`);
