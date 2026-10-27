import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Espelha o alias `@ -> src` do tsconfig para que testes que importam
    // módulos da app (rotas de API, hooks) resolvam igual ao Next.
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    // O motor é TypeScript puro (sem DOM): `node` é o ambiente mais barato e
    // ainda expõe `crypto.getRandomValues`, usado por `defaultRandom`.
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules', '.next'],
  },
});
