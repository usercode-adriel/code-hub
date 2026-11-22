// Diagnóstico: desempenho do servidor (pedidos, event loop, memória) e do navegador (quadros por segundo).
// Só o administrador vê os números do servidor. A tela para de atualizar quando você sai dela.
import { api } from '../api.js';
import { esc } from '../ui.js';

export default async function render(el) {
  el.innerHTML = `<section class="card"><h3 class="title">Diagnóstico</h3>
    <p class="muted">Atualiza a cada 3 segundos. Quadros por segundo são medidos neste navegador.</p>
    <div id="dgCli"></div><div id="dgSrv"></div></section>`;
  const cli = el.querySelector('#dgCli'); const srv = el.querySelector('#dgSrv');
  let quadros = 0; let fps = 0; let ultimo = performance.now(); let pior = Infinity; let ativo = true;
  const quadro = (t) => {
    if (!ativo) return;
    quadros++;
    if (t - ultimo >= 1000) { fps = Math.round((quadros * 1000) / (t - ultimo)); quadros = 0; ultimo = t; pior = Math.min(pior, fps); }
    requestAnimationFrame(quadro);
  };
  requestAnimationFrame(quadro);
  const mem = () => (performance.memory ? `${Math.round(performance.memory.usedJSHeapSize / 1048576)} MB` : 'indisponível');
  const linhas = (obj) => Object.entries(obj).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(String(v))}</td></tr>`).join('');
  async function atualizar() {
    if (!el.isConnected) { ativo = false; clearInterval(timer); return; }
    cli.innerHTML = `<h4>Navegador</h4><table class="table"><tbody>${linhas({ 'quadros por segundo (agora)': fps, 'pior nos últimos segundos': pior === Infinity ? '—' : pior, 'memória JS': mem(), 'tela': `${innerWidth}×${innerHeight}` })}</tbody></table>`;
    try {
      const d = await api.get('/diagnostico');
      srv.innerHTML = `<h4>Servidor</h4><table class="table"><tbody>${linhas({ 'no ar': `${d.noArarS} s`, 'memória (RSS)': `${d.memoriaMB.rss} MB`, 'heap usado': `${d.memoriaMB.heapUsado} MB`, 'atraso do event loop (p99)': `${d.loopMs.p99} ms`, 'atraso máximo': `${d.loopMs.max} ms` })}</tbody></table>
        <h4>Rotas mais lentas (p95)</h4><table class="table"><thead><tr><th>Rota</th><th>Pedidos</th><th>Média</th><th>p95</th><th>Máx</th><th>Erros 5xx</th></tr></thead><tbody>
        ${d.pedidos.map((r) => `<tr><td>${esc(r.rota)}</td><td>${r.pedidos}</td><td>${r.mediaMs} ms</td><td>${r.p95Ms} ms</td><td>${r.maxMs} ms</td><td>${r.erros5xx}</td></tr>`).join('') || '<tr><td colspan="6">Sem pedidos ainda.</td></tr>'}</tbody></table>`;
    } catch (err) {
      srv.innerHTML = `<p class="muted">${esc(err.message || 'Sem permissão para ver o diagnóstico do servidor.')}</p>`;
    }
  }
  await atualizar();
  const timer = setInterval(atualizar, 3000);
}
