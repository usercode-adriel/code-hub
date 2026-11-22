// DIAGNÓSTICO: tempo das respostas por rota, atraso do event loop, memória e tempo no ar.
// Só o administrador consulta (GET /api/diagnostico). Guarda uma janela pequena (últimos 300 pedidos por rota).
import { monitorEventLoopDelay } from 'node:perf_hooks';

const inicio = Date.now();
const loop = monitorEventLoopDelay({ resolution: 20 });
loop.enable();
const rotas = new Map();
const MAX = 300;

// troca ids e números por ':id' para agrupar as rotas
const rotaDe = (req) => `${req.method} ${(req.originalUrl || req.url).split('?')[0].replace(/[0-9a-f]{8}-[0-9a-f-]{27,}|\/\d+(?=\/|$)/gi, '/:id')}`;

export function medirPedidos(req, res, next) {
  const t0 = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    const chave = rotaDe(req);
    let r = rotas.get(chave);
    if (!r) { r = { n: 0, erros: 0, ms: [] }; rotas.set(chave, r); }
    r.n++; if (res.statusCode >= 500) r.erros++;
    r.ms.push(ms); if (r.ms.length > MAX) r.ms.shift();
  });
  next();
}

const pct = (arr, p) => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const arred = (v) => Math.round(v * 10) / 10;

export function diagnostico() {
  const m = process.memoryUsage();
  const pedidos = [...rotas.entries()].map(([rota, r]) => ({
    rota, pedidos: r.n, erros5xx: r.erros,
    mediaMs: arred(r.ms.reduce((a, b) => a + b, 0) / Math.max(1, r.ms.length)), p95Ms: arred(pct(r.ms, 0.95)), maxMs: arred(Math.max(0, ...r.ms)),
  })).sort((a, b) => b.p95Ms - a.p95Ms).slice(0, 40);
  return {
    noArarS: Math.round((Date.now() - inicio) / 1000),
    memoriaMB: { rss: Math.round(m.rss / 1048576), heapUsado: Math.round(m.heapUsed / 1048576), heapTotal: Math.round(m.heapTotal / 1048576) },
    loopMs: { media: arred(loop.mean / 1e6), p99: arred(loop.percentile(99) / 1e6), max: arred(loop.max / 1e6) },
    pedidos,
  };
}
