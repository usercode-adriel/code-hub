import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: here,
  base: '/jogo/',
  plugins: [react()],
  build: { outDir: fileURLToPath(new URL('../public/jogo', import.meta.url)), emptyOutDir: true, sourcemap: true },
  server: { port: 5173, proxy: { '/api': 'http://localhost:3000' } },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
