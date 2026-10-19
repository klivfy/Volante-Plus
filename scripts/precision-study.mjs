#!/usr/bin/env node
/**
 * Medições do estudo de precisão (`docs/estudo-precisao-geracao.md`).
 *
 * Roda com Node puro, sem dependências:
 *
 *     node scripts/precision-study.mjs [tentativas]
 *
 * As simulações usam semente fixa (reprodutíveis) e o mesmo protocolo do
 * estudo: lotes de 2–5 jogos, dezenas disjuntas entre jogos, N tentativas por
 * configuração. Os números impressos são as tabelas do documento.
 */

const TRIALS = Number(process.argv[2] ?? 500_000);

// ---------------------------------------------------------------------------
// RNG determinístico e amostragem sem reposição
// ---------------------------------------------------------------------------

function mulberry32(seed) {
  let a = seed | 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = mulberry32(20261018);

/** k elementos distintos de 1..n, uniformes (Fisher–Yates parcial). */
function sample(n, k) {
  const pool = Array.from({ length: n }, (_, i) => i + 1);
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(rnd() * (n - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, k);
}

// ---------------------------------------------------------------------------
// Probabilidades exatas (fórmulas fechadas)
// ---------------------------------------------------------------------------

function combinations(n, k) {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return Math.round(r);
}

const MEGA_TOTAL = combinations(60, 6);
const MEGA_PRIZE = (() => {
  const p6 = 1 / MEGA_TOTAL;
  const p5 = (6 * 54) / MEGA_TOTAL;
  const p4 = (15 * combinations(54, 2)) / MEGA_TOTAL;
  return { sena: p6, quina: p5, quadra: p4, any: p6 + p5 + p4 };
})();

/** +Milionária: P(n dezenas, t trevos) para uma aposta simples. */
function milionariaP(n, t) {
  return (
    (combinations(6, n) * combinations(44, 6 - n)) / combinations(50, 6) *
    ((combinations(2, t) * combinations(4, 2 - t)) / combinations(6, 2))
  );
}

const MM_TIERS = [
  { name: 'faixa 1 (6+2)', p: milionariaP(6, 2), fixed: false },
  { name: 'faixa 2 (6+1/0)', p: milionariaP(6, 1) + milionariaP(6, 0), fixed: false },
  { name: 'faixa 3 (5+2)', p: milionariaP(5, 2), fixed: false },
  { name: 'faixa 4 (5+1/0)', p: milionariaP(5, 1) + milionariaP(5, 0), fixed: false },
  { name: 'faixa 5 (4+2)', p: milionariaP(4, 2), fixed: false },
  { name: 'faixa 6 (4+1/0)', p: milionariaP(4, 1) + milionariaP(4, 0), fixed: false },
  { name: 'faixa 7 (3+2)', p: milionariaP(3, 2), fixed: true },
  { name: 'faixa 8 (3+1)', p: milionariaP(3, 1), fixed: true },
  { name: 'faixa 9 (2+2)', p: milionariaP(2, 2), fixed: true },
  { name: 'faixa 10 (2+1)', p: milionariaP(2, 1), fixed: true },
];

const MM_ANY = MM_TIERS.reduce((s, t) => s + t.p, 0);
const MM_FIXED = MM_TIERS.filter((t) => t.fixed).reduce((s, t) => s + t.p, 0);

// ---------------------------------------------------------------------------
// Simulação de lotes
// ---------------------------------------------------------------------------

function countAny(fn, trials) {
  let hits = 0;
  for (let i = 0; i < trials; i++) if (fn()) hits++;
  const p = hits / trials;
  return { p, pm: p * 100, ci3: 3 * Math.sqrt((p * (1 - p)) / trials) * 100 };
}

/**
 * Mega-Sena: P(≥1 prêmio) para k jogos com dezenas disjuntas — exato.
 *
 * O sorteio distribui 6 dezenas entre as k "caixas" de 6 dezenas dos jogos e
 * o resto do universo. A probabilidade de uma composição (h₁..h_k, r) é
 *   [∏ C(6,h_i)] · C(60−6k, r) / C(60,6).
 * Soma-se onde alguma caixa tem h_i ≥ 4 (quadra ou mais).
 */
function exactMegaDisjoint(k) {
  const other = 60 - 6 * k;
  let favorable = 0;
  const visit = (gameIndex, remaining, ways, anyPrize) => {
    if (gameIndex === k) {
      if (remaining > other) return;
      if (anyPrize) favorable += ways * combinations(other, remaining);
      return;
    }
    for (let h = 0; h <= Math.min(6, remaining); h++) {
      visit(gameIndex + 1, remaining - h, ways * combinations(6, h), anyPrize || h >= 4);
    }
  };
  visit(0, 6, 1, false);
  return favorable / combinations(60, 6);
}

/** +Milionária: k jogos com dezenas disjuntas; duplas complementares ou independentes. */
function miliTrial(k, trevoMode) {
  const drawNumbers = new Set(sample(50, 6));
  const drawTrevos = new Set(sample(6, 2));
  const pool = sample(50, 6 * k);

  const perm = sample(6, 6);
  const partition = [
    [perm[0], perm[1]],
    [perm[2], perm[3]],
    [perm[4], perm[5]],
  ];
  const allPairs = [];
  for (let a = 1; a <= 6; a++) {
    for (let b = a + 1; b <= 6; b++) allPairs.push([a, b]);
  }

  let pairs;
  if (trevoMode === 'complementary') {
    const used = new Set();
    const list = [];
    for (const pair of partition) {
      list.push(pair);
      used.add(pair.join('-'));
    }
    while (list.length < k) {
      const available = allPairs.filter((p) => !used.has(p.join('-')));
      const pick = available[Math.floor(rnd() * available.length)];
      list.push(pick);
      used.add(pick.join('-'));
    }
    // embaralha a ordem das duplas
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    pairs = list;
  } else {
    pairs = Array.from({ length: k }, () => sample(6, 2));
  }

  for (let g = 0; g < k; g++) {
    const numbers = pool.slice(g * 6, (g + 1) * 6);
    const nHits = numbers.filter((n) => drawNumbers.has(n)).length;
    const tHits = pairs[g].filter((t) => drawTrevos.has(t)).length;
    if (MM_TIERS.some((tier) => tier.name && matchesTier(tier.name, nHits, tHits))) {
      return true;
    }
  }
  return false;
}

/** Mapa (dezenas, trevos) → faixa premiada, para o teste acima. */
function matchesTier(name, n, t) {
  const key = `${n}+${t}`;
  switch (name) {
    case 'faixa 1 (6+2)':
      return key === '6+2';
    case 'faixa 2 (6+1/0)':
      return n === 6 && (t === 1 || t === 0);
    case 'faixa 3 (5+2)':
      return key === '5+2';
    case 'faixa 4 (5+1/0)':
      return n === 5 && (t === 1 || t === 0);
    case 'faixa 5 (4+2)':
      return key === '4+2';
    case 'faixa 6 (4+1/0)':
      return n === 4 && (t === 1 || t === 0);
    case 'faixa 7 (3+2)':
      return key === '3+2';
    case 'faixa 8 (3+1)':
      return key === '3+1';
    case 'faixa 9 (2+2)':
      return key === '2+2';
    case 'faixa 10 (2+1)':
      return key === '2+1';
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Tabelas
// ---------------------------------------------------------------------------

function printHeader(title) {
  console.log(`\n## ${title}\n`);
}

console.log(`# Estudo de precisão — medições (${TRIALS.toLocaleString('pt-BR')} tentativas por configuração)`);

printHeader('Probabilidades exatas');
console.log(`- Mega-Sena, prêmio (quadra+): 1 em ${(1 / MEGA_PRIZE.any).toFixed(1)} (${(MEGA_PRIZE.any * 100).toFixed(5)}%)`);
console.log(`- +Milionária, prêmio (qualquer faixa): 1 em ${(1 / MM_ANY).toFixed(2)} (${(MM_ANY * 100).toFixed(4)}%)`);
console.log(`- +Milionária, faixas fixas 7–10: ${((MM_FIXED / MM_ANY) * 100).toFixed(1)}% da probabilidade de prêmio`);
console.log(`- +Milionária, faixas de rateio 1–6: ${(((MM_ANY - MM_FIXED) / MM_ANY) * 100).toFixed(1)}% da probabilidade de prêmio`);

printHeader('Mega-Sena — P(≥1 prêmio) com dezenas disjuntas (exato)');
console.log('| Jogos | P(≥1 prêmio) |');
console.log('|---:|---:|');
for (let k = 2; k <= 5; k++) {
  console.log(`| ${k} | ${(exactMegaDisjoint(k) * 100).toFixed(4)}% |`);
}
console.log('\nReferência R10 (enumeração exata): 3 jogos independentes = 0,1305%; disjuntos = 0,1306%.');

printHeader('+Milionária — P(≥1 prêmio) por lote (simulação, ±3σ)');
console.log('| Jogos | Duplas complementares | Duplas independentes |');
console.log('|---:|---:|---:|');
for (let k = 2; k <= 5; k++) {
  const c = countAny(() => miliTrial(k, 'complementary'), TRIALS);
  const i = countAny(() => miliTrial(k, 'independent'), TRIALS);
  console.log(`| ${k} | ${c.pm.toFixed(3)}% ±${c.ci3.toFixed(3)} | ${i.pm.toFixed(3)}% ±${i.ci3.toFixed(3)} |`);
}
console.log('\nReferência R10 (enumeração exata): 2 jogos máximo 17,25%; 3 jogos 25,42%; 4 jogos 32,91%.');
console.log('Em 2 jogos, as diferenças entre estratégias ficam dentro do ruído (não declarar ganho).');

printHeader('Ganho condicional vs número de apostas (m = popularidade relativa 0,659)');
const Q0 = 1 / MEGA_TOTAL;
const crowding = (q, n) => (1 - Math.pow(1 - q, n)) / (n * q);
const gain = (m, n) => (crowding(m * Q0, n) / crowding(Q0, n) - 1) * 100;
for (const n of [1e6, 5e6, 20e6, 50e6, 100e6, 200e6]) {
  console.log(`- N = ${(n / 1e6).toFixed(0)} M apostas: ${gain(0.659, n).toFixed(2)}%`);
}

printHeader('Piso de detecção de viés (3,3σ, desvio relativo)');
const mde = (p, n) => ((3.3 * Math.sqrt((p * (1 - p)) / n)) / p) * 100;
console.log(`- Mega dezenas, ~4.400 concursos: ${mde(0.1, 4400).toFixed(1)}%`);
console.log(`- Mega dezenas, ~2.800 concursos: ${mde(0.1, 2800).toFixed(1)}%`);
console.log(`- +Milionária dezenas, ~600 concursos: ${mde(0.12, 600).toFixed(1)}%`);
console.log(`- +Milionária trevos, ~600 concursos: ${mde(1 / 3, 600).toFixed(1)}%`);

printHeader('Poder de calibração — S/N de um efeito de 1%');
console.log('| Faixa | Ganhadores/concurso | S/N por concurso | S/N acumulado |');
console.log('|---|---:|---:|---:|');
const megaTiers = [
  ['Mega sena', MEGA_PRIZE.sena, 20e6, 1900],
  ['Mega quina', MEGA_PRIZE.quina, 20e6, 1900],
  ['Mega quadra', MEGA_PRIZE.quadra, 20e6, 1900],
];
for (const [name, p, n, draws] of megaTiers) {
  const lam = n * p;
  const snr = (0.01 * lam) / Math.sqrt(lam);
  console.log(`| ${name} | ${lam.toFixed(1)} | ${snr.toFixed(2)} | ${(snr * Math.sqrt(draws)).toFixed(1)} |`);
}
for (const tier of MM_TIERS) {
  const lam = 5e6 * tier.p;
  const snr = (0.01 * lam) / Math.sqrt(lam);
  console.log(`| ${tier.name} | ${lam.toFixed(0)} | ${snr.toFixed(2)} | ${(snr * Math.sqrt(600)).toFixed(0)} |`);
}

printHeader('Timing — valor incremental do acumulado (Mega, sem IR)');
console.log('| N (apostas) | E[1/(1+K)] | ΔEV por R$ 6 a cada R$ 100 M | Acumulado de equilíbrio (só sena) |');
console.log('|---:|---:|---:|---:|');
for (const n of [20e6, 100e6, 200e6]) {
  const np = n * MEGA_PRIZE.sena;
  const e = (1 - Math.exp(-np)) / np;
  const delta = 100e6 * MEGA_PRIZE.sena * e;
  const breakEven = 6 / (MEGA_PRIZE.sena * e);
  console.log(`| ${(n / 1e6).toFixed(0)} M | ${e.toFixed(3)} | R$ ${delta.toFixed(2)} | R$ ${(breakEven / 1e6).toFixed(0)} M |`);
}

console.log('\nFim.');
