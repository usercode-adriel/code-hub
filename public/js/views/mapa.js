// 07 · WORLD MAP — Codeniac Society: bairros, empresas, alertas e eventos ao vivo. Zoom e arrasto.
import { shell, face, nx, bindEntities, mapSvg, evRow, companyCard, api, esc, icon } from '../world/wui.js';

export default async function render(el) {
  const body = shell(el, 'mapa', { title: 'World Map', sub: 'Toque num bairro para ver quem mora lá, empresas e imóveis.' });
  bindEntities(body);
  let m;
  try { m = await api.get('/mundo/mapa'); } catch (err) { body.innerHTML = `<div class="w-empty"><b>${esc(err.message)}</b></div>`; return; }
  body.innerHTML = `<div class="mp-grid"><div class="w-panel mp-stage"><div class="mp-tools"><button class="icon-btn sm" data-z="1" aria-label="Aproximar">${icon('plus', 14)}</button><button class="icon-btn sm" data-z="-1" aria-label="Afastar">${icon('minus', 14)}</button><button class="icon-btn sm" data-z="0" aria-label="Centralizar">${icon('refresh', 13)}</button></div>
      <div class="mp-svg" id="mpSvg">${mapSvg(m)}</div>
      <div class="cc-legend"><span><i class="lg co"></i>Empresas</span><span><i class="lg ev"></i>Eventos</span><span><i class="lg al"></i>Alertas (24 h)</span><span><i class="lg pl"></i>Locais</span><span><i class="lg lk"></i>Bloqueado (expansão)</span>${m.weather ? `<span>${m.weather.icon} ${m.weather.temp}°C</span>` : ''}</div></div>
    <aside class="w-panel mp-side" id="mpSide"><h3>Bairros</h3>${m.districts.map((d) => `<button class="mp-d" data-district="${esc(d.id)}" style="--c:${esc(d.color)}"><i></i><b>${esc(d.name)}</b><small>${d.locked ? 'expansão futura' : `${d.residents} moradores · índice ${d.value.toFixed(2)}`}</small></button>`).join('')}
      <h3>Últimos acontecimentos com local</h3>${m.recent.map((e) => evRow(e, { compact: true })).join('') || '<p class="muted">Nada recente.</p>'}</aside></div>`;
  // zoom e arrasto (mexe no viewBox do SVG)
  const svg = body.querySelector('#mpSvg svg');
  let vb = [0, 0, 1000, 600];
  const set = () => svg.setAttribute('viewBox', vb.map((v) => Math.round(v)).join(' '));
  const zoom = (f, cx = vb[0] + vb[2] / 2, cy = vb[1] + vb[3] / 2) => { const w = Math.max(250, Math.min(1000, vb[2] / f)); const h = w * 0.6; vb = [Math.max(0, Math.min(1000 - w, cx - w / 2)), Math.max(0, Math.min(600 - h, cy - h / 2)), w, h]; set(); };
  body.querySelectorAll('[data-z]').forEach((b) => { b.onclick = () => (b.dataset.z === '0' ? (vb = [0, 0, 1000, 600], set()) : zoom(b.dataset.z === '1' ? 1.5 : 1 / 1.5)); });
  let drag = null;
  svg.addEventListener('pointerdown', (e) => { if (vb[2] >= 1000) return; drag = { x: e.clientX, y: e.clientY, vb: vb.slice(), moved: false }; svg.setPointerCapture(e.pointerId); });
  svg.addEventListener('pointermove', (e) => { if (!drag) return; const k = vb[2] / svg.clientWidth; const dx = (e.clientX - drag.x) * k; const dy = (e.clientY - drag.y) * k; if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true; vb[0] = Math.max(0, Math.min(1000 - vb[2], drag.vb[0] - dx)); vb[1] = Math.max(0, Math.min(600 - vb[3], drag.vb[1] - dy)); set(); });
  svg.addEventListener('pointerup', () => { setTimeout(() => { drag = null; }, 0); });
  svg.addEventListener('click', (e) => {
    if (drag?.moved) return;
    const g = e.target.closest('[data-district]');
    if (g && !e.target.closest('[data-company]')) district(g.dataset.district);
  });
  body.querySelectorAll('.mp-d').forEach((b) => { b.onclick = (e) => { e.stopPropagation(); district(b.dataset.district); }; });
  async function district(id) {
    const side = body.querySelector('#mpSide');
    side.innerHTML = '<div class="skeleton" style="height:200px"></div>';
    const d = await api.get(`/mundo/bairro/${encodeURIComponent(id)}`);
    side.innerHTML = `<button class="w-back" id="mpBack">${icon('chevLeft', 14)} Todos os bairros</button><h3 style="color:${esc(d.color)}">${esc(d.name)}</h3><p class="muted">${d.locked ? 'Área reservada para a expansão da cidade.' : `${d.residents.length} moradores registrados · valor do bairro ${d.value.toFixed(2)}×`}</p>
      ${d.companies.length ? `<h4>Empresas</h4>${d.companies.map((c) => `<button class="cc-mover" data-company="${esc(c.id)}"><span class="cc-tk" style="--c:${esc(c.color)}">${esc(c.ticker)}</span><span>${esc(c.name)}</span><em>${esc(c.status)}</em></button>`).join('')}` : ''}
      ${d.places.length ? `<h4>Locais</h4><div class="w-chips">${d.places.map((p) => `<span class="w-chip">${esc(p.name)}</span>`).join('')}</div>` : ''}
      ${d.residents.length ? `<h4>Moradores</h4><div class="w-faces">${d.residents.map((p) => `<span data-person="${esc(p.id)}" title="${esc(p.name)}">${face(p, 30)}</span>`).join('')}</div>` : ''}
      ${d.properties.length ? `<h4>Imóveis</h4>${d.properties.map((p) => `<div class="w-row"><span>${esc(p.name)}</span><small>${nx(p.price, 0)}${p.ownerType === 'user' ? ' · seu' : p.ownerType === 'cidade' ? ' · à venda' : ''}</small></div>`).join('')}<a class="btn sm outline" href="#/economia/imoveis">Comprar imóveis</a>` : ''}
      ${d.events.length ? `<h4>História do bairro</h4>${d.events.map((e) => evRow(e, { compact: true })).join('')}` : ''}`;
    side.querySelector('#mpBack').onclick = () => render(el);
  }
}
