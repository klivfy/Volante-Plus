import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // O motor é TypeScript puro (sem DOM): `node` é o ambiente mais barato e
    // ainda expõe `crypto.getRandomValues`, usado por `defaultRandom`.
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules', '.next'],
  },
});
