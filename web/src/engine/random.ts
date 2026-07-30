/**
 * Fonte de aleatoriedade do motor.
 *
 * WHY: o motor precisa rodar em três ambientes — página, Service Worker da
 * extensão e o runner de testes — e em nenhum deles pode importar `node:crypto`.
 * A abstração permite injetar um gerador semeado nos testes sem que o código de
 * produção conheça o conceito de semente.
 */
export interface RandomSource {
  /** Real em [0, 1). */
  nextFloat(): number;
  /** Inteiro em [0, bound), com `bound` > 0. */
  nextInt(bound: number): number;
}

/** 2^32 — domínio de um `Uint32`. */
const UINT32_RANGE = 0x100000000;

/**
 * `crypto.getRandomValues` existe em navegadores, Web Workers, Service Workers
 * e no Node 18+. Quando ausente (ambientes muito antigos), cai em `Math.random`,
 * suficiente para sorteio de jogos — não há requisito criptográfico aqui.
 */
function nextUint32(): number {
  const webCrypto = (globalThis as { crypto?: Crypto }).crypto;
  if (typeof webCrypto?.getRandomValues === 'function') {
    const buffer = new Uint32Array(1);
    webCrypto.getRandomValues(buffer);
    return buffer[0];
  }
  return Math.floor(Math.random() * UINT32_RANGE);
}

function assertBound(bound: number): void {
  if (!Number.isInteger(bound) || bound <= 0) {
    throw new RangeError(`bound deve ser inteiro positivo (recebido: ${bound})`);
  }
}

/**
 * Gerador padrão. `nextInt` usa amostragem por rejeição: o resto simples
 * (`x % bound`) enviesaria as primeiras dezenas quando `2^32` não é múltiplo
 * de `bound`, e num sorteio de loteria esse viés é exatamente o defeito que o
 * app existe para não cometer.
 */
export const defaultRandom: RandomSource = {
  nextFloat(): number {
    return nextUint32() / UINT32_RANGE;
  },
  nextInt(bound: number): number {
    assertBound(bound);
    const limit = UINT32_RANGE - (UINT32_RANGE % bound);
    let value = nextUint32();
    while (value >= limit) {
      value = nextUint32();
    }
    return value % bound;
  },
};

/**
 * Gerador determinístico (mulberry32) para testes e relatórios reproduzíveis.
 * Não use em produção: a sequência é previsível a partir da semente.
 */
export function createSeededRandom(seed: number): RandomSource {
  let state = seed >>> 0;
  const nextRaw = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / UINT32_RANGE;
  };
  return {
    nextFloat: nextRaw,
    nextInt(bound: number): number {
      assertBound(bound);
      return Math.floor(nextRaw() * bound) % bound;
    },
  };
}
