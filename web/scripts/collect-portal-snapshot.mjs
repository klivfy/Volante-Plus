// Coleta o histórico de uma modalidade direto do portal da Caixa e grava um
// espelho reduzido em `src/data/mirrorSnapshot/<modalidade>.json`:
// [{ contestNumber, date (ISO), numbers }]. É a segunda fonte, independente da
// API comunitária, usada por `update-history-seed.mjs` para conferir dezenas E datas.
//
//   node scripts/collect-portal-snapshot.mjs quina [--last N] [--concurrency 4]
//
// Aborta sem gravar se algum concurso falhar após as tentativas. Uso manual (rede);
// nenhum teste automatizado depende dela.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const key = process.argv[2];
if (!key) throw new Error('uso: collect-portal-snapshot.mjs <modalidade> [--last N] [--concurrency 4]');
const arg = (name, fallback) => (process.argv.includes(name) ? Number(process.argv[process.argv.indexOf(name) + 1]) : fallback);
const BASE = process.env.CAIXA_PORTAL_BASE_URL ?? 'https://servicebus2.caixa.gov.br/portaldeloterias/api';
const concurrency = arg('--concurrency', 4);

const toIso = (v) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
  if (!m) throw new Error(`data fora do formato dd/MM/yyyy: ${v}`);
  return `${m[3]}-${m[2]}-${m[1]}`;
};

async function get(url) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const r = await fetch(url);
      if (r.ok) return await r.json();
      if (r.status === 404) throw new Error(`HTTP 404 em ${url}`);
    } catch (e) {
      if (attempt === 5) throw e;
    }
    await new Promise((res) => setTimeout(res, 500 * attempt));
  }
  throw new Error(`falha em ${url}`);
}

const latest = await get(`${BASE}/${key}`);
const last = arg('--last', Number(latest.numero));
const rows = new Array(last);
let next = 1;
let done = 0;
await Promise.all(
  Array.from({ length: concurrency }, async () => {
    while (next <= last) {
      const n = next++;
      const d = await get(`${BASE}/${key}/${n}`);
      if (Number(d.numero) !== n) throw new Error(`concurso ${n}: portal devolveu ${d.numero}`);
      rows[n - 1] = {
        contestNumber: n,
        date: toIso(d.dataApuracao),
        numbers: d.listaDezenas.map(Number).sort((a, b) => a - b),
      };
      if (++done % 500 === 0) console.error(`${key}: ${done}/${last}`);
    }
  }),
);
const out = path.join(root, 'src/data/mirrorSnapshot', `${key}.json`);
fs.writeFileSync(out, JSON.stringify(rows));
console.log(`${key}: ${rows.length} concursos coletados do portal da Caixa (1..${last}).`);
