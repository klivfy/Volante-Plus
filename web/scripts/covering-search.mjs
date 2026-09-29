// Busca de coberturas C(v, 6, t) por recozimento simulado (Nurmela–Östergård).
//
// Reproduz as tabelas de `src/engine/closureTables.ts`:
//   mkdir -p covering-out && node scripts/covering-search.mjs <v> <t> <blocosIniciais> <segundosPorNivel>
//   ex.: node scripts/covering-search.mjs 12 4 52 120   → chega a 41 blocos (ótimo)
//
// Parte de `blocosIniciais` blocos aleatórios, minimiza o número de t-subconjuntos
// descobertos trocando uma dezena de um bloco por outra, e ao achar uma cobertura
// completa remove um bloco e recomeça. Sai em `covering-out/best_<v>_<t>.json`
// (blocos como máscaras de bits). Semente fixa: rodadas reproduzíveis.
// Toda cobertura é reverificada exaustivamente pelos testes antes de ser usada.
// Recozimento simulado para covering designs C(v,6,t). Uso: node sa.mjs v t startBlocks secondsPerLevel
import fs from 'node:fs';
const [v, t, startB, secs] = [+process.argv[2], +process.argv[3], +process.argv[4], +process.argv[5]];
const K = 6;
let seed = (v * 1000 + t * 7 + 12345) >>> 0;
const rnd = () => { seed = (seed + 0x6d2b79f5) >>> 0; let x = seed; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
const pop = (m) => { let c = 0; while (m) { m &= m - 1; c++; } return c; };
const idOf = new Int32Array(1 << v).fill(-1); let nT = 0;
for (let m = 0; m < 1 << v; m++) if (pop(m) === t) idOf[m] = nT++;
const subsetsOfBlock = new Map();
function tSubs(mask) { // máscaras dos t-subconjuntos de uma máscara
  let c = subsetsOfBlock.get(mask); if (c) return c;
  const bits = []; for (let i = 0; i < v; i++) if (mask & (1 << i)) bits.push(i);
  const out = []; const w = (s, l, acc) => { if (l === 0) { out.push(acc); return; } for (let i = s; i <= bits.length - l; i++) w(i + 1, l - 1, acc | (1 << bits[i])); };
  w(0, t, 0); subsetsOfBlock.set(mask, out); return out;
}
function randomBlock() { const b = []; while (b.length < K) { const x = Math.floor(rnd() * v); if (!b.includes(x)) b.push(x); } return b.reduce((m, x) => m | (1 << x), 0); }
function solve(blocks, budgetMs) {
  const B = blocks.length; const cnt = new Int32Array(nT); let unc = nT;
  for (const m of blocks) for (const s of tSubs(m)) if (cnt[idOf[s]]++ === 0) unc--;
  const start = Date.now(); let T = 0.6; const cool = 0.995; let iters = 0;
  const per = Math.max(2000, B * 300);
  while (unc > 0) {
    for (let k = 0; k < per && unc > 0; k++) {
      iters++;
      const i = Math.floor(rnd() * B); const m = blocks[i];
      let a; do { a = Math.floor(rnd() * v); } while (!(m & (1 << a)));
      let b; do { b = Math.floor(rnd() * v); } while (m & (1 << b));
      const nm = (m ^ (1 << a)) | (1 << b);
      let delta = 0;
      for (const s of tSubs(m)) if ((s & (1 << a)) && cnt[idOf[s]] === 1) delta++;
      for (const s of tSubs(nm)) if ((s & (1 << b)) && cnt[idOf[s]] === 0) delta--;
      if (delta <= 0 || rnd() < Math.exp(-delta / T)) {
        for (const s of tSubs(m)) if ((s & (1 << a)) && --cnt[idOf[s]] === 0) unc++;
        for (const s of tSubs(nm)) if ((s & (1 << b)) && cnt[idOf[s]]++ === 0) unc--;
        blocks[i] = nm;
      }
    }
    T = Math.max(0.08, T * cool);
    if (Date.now() - start > budgetMs) return null;
    if (T <= 0.08 && (iters % (per * 40)) < per) T = 0.5; // reaquece
  }
  return blocks;
}
let best = null; let B = startB; let cur = Array.from({ length: B }, randomBlock);
const out = `./covering-out/best_${v}_${t}.json`;
while (B >= 1) {
  const res = solve(cur.slice(), secs * 1000);
  if (!res) { console.log(`v=${v} t=${t}: sem solução com ${B} blocos em ${secs}s`); break; }
  best = res.slice(); fs.writeFileSync(out, JSON.stringify({ v, t, blocks: best }));
  console.log(`v=${v} t=${t}: cobertura com ${B} blocos`);
  B--; const drop = Math.floor(rnd() * best.length); cur = best.filter((_, j) => j !== drop);
}
console.log(`FINAL v=${v} t=${t} = ${best ? best.length : startB + 1}`);
