import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('./office/', import.meta.url));

// Commerce Office: segundo app de game/, compilado para public/escritorio/ e aberto dentro do Hub (cartão Ecommerce do Estúdio).
export default defineConfig({
  root: here,
  base: '/escritorio/',
  plugins: [react()],
  build: { outDir: fileURLToPath(new URL('../public/escritorio', import.meta.url)), emptyOutDir: true, sourcemap: false },
  server: { port: 5174, proxy: { '/api': 'http://localhost:3000' } },
});
