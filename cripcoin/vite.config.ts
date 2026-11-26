import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// Cripcoin Office: app independente, compilado para public/cripcoin/ e aberto dentro do Hub (Estúdio → Cripcoin Office).
export default defineConfig({
  root: fileURLToPath(new URL('./', import.meta.url)),
  base: '/cripcoin/',
  publicDir: fileURLToPath(new URL('./public/', import.meta.url)),
  plugins: [react()],
  build: { outDir: fileURLToPath(new URL('../public/cripcoin', import.meta.url)), emptyOutDir: true, sourcemap: false },
  server: { port: 5175, proxy: { '/api': 'http://localhost:3000' } },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
