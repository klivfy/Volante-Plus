// Gera o seed embarcado do Android (`app/src/main/assets/seed/`) a partir do
// histórico já validado em `web/src/data/history/` — nunca busca de uma
// segunda fonte (Constitution, Princípio V: domínio único compartilhado).
//
//   node scripts/generate-android-seed.mjs
//
// Regras (o script ABORTA, sem gravar nada em nenhuma modalidade, se
// qualquer uma falhar — mais estrito que o script web equivalente, que só
// aborta a modalidade corrente; aqui as duas são validadas antes de
// qualquer gravação, ver contracts/csv-seed-format.md):
//   1. histórico contíguo do concurso 1 ao último, sem duplicata nem lacuna;
//   2. cada concurso respeita as regras da modalidade (dezenas, universo,
//      trevos — nenhum trevo na Mega-Sena, exatamente 2 em 1-6 na +Milionária);
//   3. datas válidas (ISO-8601);
//   4. contagem e último concurso batem exatamente com
//      web/src/data/history/meta.json (a fonte da verdade).
// Este script NÃO revalida a procedência do histórico (isso já foi feito por
// web/scripts/update-history-seed.mjs, incluindo a conferência contra um
// espelho independente) — só converte o formato já validado para o CSV que
// CsvDrawParser espera.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const historyDir = path.join(root, 'web/src/data/history');
const outDir = path.join(root, 'app/src/main/assets/seed');

const RULES = {
  megasena: { key: 'megasena', file: 'megasena.csv', drawn: 6, universe: 60, trevoDrawn: 0, trevoUniverse: 0 },
  maismilionaria: { key: 'maismilionaria', file: 'maismilionaria.csv', drawn: 6, universe: 50, trevoDrawn: 2, trevoUniverse: 6 },
  quina: { key: 'quina', file: 'quina.csv', drawn: 5, universe: 80, trevoDrawn: 0, trevoUniverse: 0 },
};

const distinctInRange = (list, size, max) =>
  list.length === size && new Set(list).size === size && list.every((n) => Number.isInteger(n) && n >= 1 && n <= max);

function loadJson(file) {
  const full = path.join(historyDir, file);
  if (!fs.existsSync(full)) {
    throw new Error(`fonte ausente: ${full} — rode a partir da raiz do repositório, com web/src/data/history/ presente`);
  }
  return JSON.parse(fs.readFileSync(full, 'utf8'));
}

const meta = loadJson('meta.json');

const ready = {};
let hadErrors = false;

for (const rule of Object.values(RULES)) {
  const tuples = loadJson(`${rule.key}.json`);
  const draws = tuples
    .map(([contest, date, numbers, trevos]) => ({
      contest: Number(contest),
      date: String(date),
      numbers: numbers.map(Number),
      trevos: (trevos ?? []).map(Number),
    }))
    .sort((a, b) => a.contest - b.contest);

  const errors = [];
  draws.forEach((d, i) => {
    if (d.contest !== i + 1) {
      errors.push(`lacuna ou duplicata perto do concurso ${d.contest} (esperado ${i + 1})`);
    }
    if (Number.isNaN(Date.parse(d.date))) {
      errors.push(`concurso ${d.contest}: data inválida (${d.date})`);
    }
    if (!distinctInRange(d.numbers, rule.drawn, rule.universe)) {
      errors.push(`concurso ${d.contest}: dezenas inválidas`);
    }
    if (rule.trevoDrawn > 0) {
      if (!distinctInRange(d.trevos, rule.trevoDrawn, rule.trevoUniverse)) {
        errors.push(`concurso ${d.contest}: trevos inválidos`);
      }
    } else if (d.trevos.length > 0) {
      errors.push(`concurso ${d.contest}: trevos presentes numa modalidade sem trevo`);
    }
  });

  const metaLottery = meta.lotteries?.[rule.key];
  const last = draws[draws.length - 1];
  if (!metaLottery) {
    errors.push(`meta.json não tem entrada para ${rule.key}`);
  } else {
    if (draws.length !== metaLottery.count) {
      errors.push(`contagem (${draws.length}) diverge de meta.json (${metaLottery.count})`);
    }
    if (!last || last.contest !== metaLottery.lastContest) {
      errors.push(`último concurso (${last?.contest}) diverge de meta.json (${metaLottery.lastContest})`);
    }
  }

  if (errors.length > 0) {
    hadErrors = true;
    console.error(`${rule.key}: ${errors.length} problema(s).\n` + errors.slice(0, 20).join('\n'));
    continue;
  }

  const lines = ['# concurso;data;dezenas;trevos'];
  for (const d of draws) {
    const numbers = [...d.numbers].sort((a, b) => a - b).join(' ');
    const trevos = rule.trevoDrawn > 0 ? [...d.trevos].sort((a, b) => a - b).join(' ') : '';
    lines.push(`${d.contest};${d.date};${numbers};${trevos}`);
  }
  ready[rule.key] = { rule, draws, content: lines.join('\n') + '\n' };
}

if (hadErrors) {
  console.error('\nNada foi gravado — corrija os problemas acima e rode de novo.');
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });
for (const { rule, draws, content } of Object.values(ready)) {
  fs.writeFileSync(path.join(outDir, rule.file), content);
  const last = draws[draws.length - 1];
  console.log(
    `${rule.key}: ${draws.length} concursos (1..${last.contest}, até ${last.date}) -> app/src/main/assets/seed/${rule.file}`,
  );
}
