// Cliente da geração do mundo: usa o worker (mundo.worker.js) quando o navegador permite; senão, gera na própria thread.
import { generateCity } from './mundo.js';

let trabalhador = null; let seq = 0; const pendentes = new Map();
function worker() {
  if (trabalhador !== null) return trabalhador;
  try {
    trabalhador = new Worker(new URL('./mundo.worker.js', import.meta.url), { type: 'module' });
    trabalhador.onmessage = (e) => {
      const p = pendentes.get(e.data.id); if (!p) return; pendentes.delete(e.data.id);
      if (e.data.erro) p.reject(new Error(e.data.erro)); else p.resolve(e.data.city);
    };
    trabalhador.onerror = (err) => { for (const p of pendentes.values()) p.reject(err); pendentes.clear(); };
  } catch { trabalhador = false; }
  return trabalhador;
}

export function gerarCidade(reforma = null) {
  const w = worker();
  if (!w) return Promise.resolve(generateCity(undefined, { reforma }));
  const id = ++seq;
  return new Promise((resolve, reject) => { pendentes.set(id, { resolve, reject }); w.postMessage({ id, reforma }); });
}
