// Gera o histórico embutido (`src/data/history/`) a partir da API pública de loterias.
//
//   node scripts/update-history-seed.mjs                       # baixa da API
//   node scripts/update-history-seed.mjs --from-dir <dir>      # usa megasena.json/maismilionaria.json já baixados
//
// Regras (o script ABORTA, sem gravar nada, se qualquer uma falhar):
//   1. histórico contíguo do concurso 1 ao último, sem duplicatas;
//   2. cada concurso respeita as regras da modalidade (dezenas, universo, trevos);
//   3. datas válidas;
//   4. onde houver, dezenas e trevos coincidem com o espelho independente em
//      `src/data/mirrorSnapshot/` (segunda fonte, coletada por outro caminho).
// A fonte é uma API de terceiros (loteriascaixa-api), NÃO a Caixa: o app a trata
// como tal e a sincronização em runtime a sobrescreve com o que a API devolver.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'src/data/history');
const mirrorDir = path.join(root, 'src/data/mirrorSnapshot');
const BASE = process.env.CAIXA_API_BASE_URL ?? 'https://loteriascaixa-api.herokuapp.com/api';
const fromDir = process.argv.includes('--from-dir') ? process.argv[process.argv.indexOf('--from-dir') + 1] : null;

const RULES = {
  megasena: { key: 'megasena', drawn: 6, universe: 60, trevoDrawn: 0, trevoUniverse: 0, mirror: 'megasena.json' },
  maismilionaria: { key: 'maismilionaria', drawn: 6, universe: 50, trevoDrawn: 2, trevoUniverse: 6, mirror: 'maismilionaria.json' },
};

function toIso(value) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!m) throw new Error(`data fora do formato dd/MM/yyyy: ${value}`);
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  if (Number.isNaN(Date.parse(iso))) throw new Error(`data inválida: ${value}`);
  return iso;
}

const distinctInRange = (list, size, max) =>
  list.length === size && new Set(list).size === size && list.every((n) => Number.isInteger(n) && n >= 1 && n <= max);

async function load(rule) {
  if (fromDir) return JSON.parse(fs.readFileSync(path.join(fromDir, `${rule.key}.json`), 'utf8'));
  const response = await fetch(`${BASE}/${rule.key}`);
  if (!response.ok) throw new Error(`${rule.key}: HTTP ${response.status}`);
  return response.json();
}

const meta = { generatedAt: new Date().toISOString(), source: `loteriascaixa-api (${fromDir ? 'arquivo local' : BASE})`, lotteries: {} };

for (const rule of Object.values(RULES)) {
  const raw = await load(rule);
  const draws = raw
    .map((x) => ({
      contest: Number(x.concurso),
      date: toIso(x.data),
      numbers: x.dezenas.map(Number).sort((a, b) => a - b),
      trevos: (x.trevos ?? []).map(Number).sort((a, b) => a - b),
    }))
    .sort((a, b) => a.contest - b.contest);

  const errors = [];
  draws.forEach((d, i) => {
    if (d.contest !== i + 1) errors.push(`lacuna ou duplicata perto do concurso ${d.contest} (esperado ${i + 1})`);
    if (!distinctInRange(d.numbers, rule.drawn, rule.universe)) errors.push(`concurso ${d.contest}: dezenas inválidas`);
    if (rule.trevoDrawn && !distinctInRange(d.trevos, rule.trevoDrawn, rule.trevoUniverse)) errors.push(`concurso ${d.contest}: trevos inválidos`);
  });

  const mirror = new Map(JSON.parse(fs.readFileSync(path.join(mirrorDir, rule.mirror), 'utf8')).map((d) => [d.contestNumber, d]));
  let compared = 0;
  for (const d of draws) {
    const m = mirror.get(d.contest);
    if (!m) continue;
    compared++;
    if (JSON.stringify([...m.numbers].sort((a, b) => a - b)) !== JSON.stringify(d.numbers)) errors.push(`concurso ${d.contest}: dezenas divergem do espelho`);
    if (rule.trevoDrawn && JSON.stringify([...(m.trevos ?? [])].sort((a, b) => a - b)) !== JSON.stringify(d.trevos)) errors.push(`concurso ${d.contest}: trevos divergem do espelho`);
  }
  if (errors.length) {
    console.error(`${rule.key}: ${errors.length} problema(s); nada foi gravado.\n` + errors.slice(0, 20).join('\n'));
    process.exit(1);
  }

  const tuples = draws.map((d) => (rule.trevoDrawn ? [d.contest, d.date, d.numbers, d.trevos] : [d.contest, d.date, d.numbers]));
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, `${rule.key}.json`), JSON.stringify(tuples));
  const last = draws[draws.length - 1];
  meta.lotteries[rule.key] = { count: draws.length, firstContest: 1, lastContest: last.contest, lastDate: last.date, crossChecked: compared };
  console.log(`${rule.key}: ${draws.length} concursos (1..${last.contest}, até ${last.date}); ${compared} conferidos contra o espelho independente, 0 divergências.`);
}
fs.writeFileSync(path.join(outDir, 'meta.json'), JSON.stringify(meta, null, 2) + '\n');
