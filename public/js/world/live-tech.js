// TECH AO VIVO: painel da tela inicial com as manchetes reais de tecnologia (GET /api/tech-news), contadas por dois
// apresentadores do próprio jogo. Cada fala é a manchete da fonte, sem texto inventado. A voz é opcional (botão Narrar).
import { api } from '../api.js';
import { icon } from '../icons.js';
import { esc, timeAgo, speak } from '../ui.js';

// apresentadores: as fotos de perfil dos personagens da cidade (as mesmas do painel de ao vivo de antes)
const APRESENTADORES = [{ nome: '—', foto: null, cor: '#6c4cf5' }, { nome: '—', foto: null, cor: '#38bdf8' }];
const INTERVALO_MS = 9000;
const ATUALIZA_MS = 5 * 60 * 1000;

const rosto = (a) => (a.foto
  ? `<img class="tv-foto" src="${esc(a.foto)}" alt="${esc(a.nome)}" loading="lazy">`
  : `<span class="tv-foto tv-ini" style="--c:${esc(a.cor)}">${esc((a.nome || '?')[0])}</span>`);
const falaDe = (n) => {
  const base = `Manchete da ${n.fonte}: ${n.titulo}.`;
  const resumo = (n.resumo || '').split(/(?<=[.!?])\s/)[0];
  return resumo && resumo.length < 180 && !n.titulo.includes(resumo) ? `${base} ${resumo}` : base;
};

export function liveTech(host, { titulo = 'Tech ao vivo' } = {}) {
  host.classList.add('lv2', 'tv-live');
  host.innerHTML = `<header class="lv2-h"><span class="lv2-rec"></span><h3>${esc(titulo)}</h3><span class="lv2-badge">AO VIVO</span>
      <button class="tv-voz" id="tvVoz" type="button" aria-pressed="false" title="Ler as manchetes em voz alta">${icon('volume', 13)}<span>Narrar</span></button></header>
    <div class="tv-palco">
      <div class="tv-apres">${APRESENTADORES.map((a, k) => `<div class="tv-pessoa" data-k="${k}">${rosto(a)}<b>${esc(a.nome)}</b></div>`).join('')}</div>
      <div class="tv-fala" id="tvFala"><span class="muted">Carregando as manchetes…</span></div>
    </div>
    <div class="tv-fontes" id="tvFontes"></div>
    <ul class="lv2-list tv-lista" id="tvLista"></ul>`;
  const $ = (s) => host.querySelector(s);
  let alive = true; let itens = []; let idx = 0; let timer = null; let refresco = null; let narrar = false;
  const pessoas = [...host.querySelectorAll('.tv-pessoa')];
  // quem apresenta: duas pessoas da cidade com foto de perfil (se não houver, iniciais)
  async function apresentadores() {
    try {
      const r = await api.get('/mundo/ao-vivo?scope=cidade&n=30');
      const com = []; const vistos = new Set();
      for (const x of r.items || []) { const w = x.who; if (!w?.name || w.me || vistos.has(w.name)) continue; vistos.add(w.name); com.push({ nome: w.name, foto: w.avatar || null, cor: w.color || '#6c4cf5' }); if (com.length === 2) break; }
      com.forEach((a, k) => { APRESENTADORES[k] = { ...APRESENTADORES[k], ...a }; });
      pessoas.forEach((el, k) => { el.innerHTML = `${rosto(APRESENTADORES[k])}<b>${esc(APRESENTADORES[k].nome)}</b>`; });
    } catch { /* sem pessoas: mantém as iniciais */ }
  }

  function falar() {
    if (!alive || !itens.length) return;
    const n = itens[idx % itens.length]; const k = idx % APRESENTADORES.length; idx++;
    pessoas.forEach((p, j) => p.classList.toggle('fala', j === k));
    $('#tvFala').innerHTML = `<small>${esc(APRESENTADORES[k].nome)} · ${esc(n.fonte)}</small><p>${esc(falaDe(n))}</p><a href="${esc(n.link)}" target="_blank" rel="noopener">Ler a notícia completa ↗</a>`;
    host.querySelectorAll('.tv-lista .lv2-row').forEach((li, j) => li.classList.toggle('atual', j === (idx - 1) % Math.max(1, itens.length)));
    if (narrar) speak(falaDe(n));
  }

  function desenhar(dados) {
    itens = dados.itens;
    $('#tvFontes').innerHTML = dados.fontes.map((f) => `<span class="chip ${f.ok ? '' : 'off'}" title="${f.ok ? 'Fonte respondendo' : esc(f.erro || 'Sem resposta')}">${esc(f.nome)}</span>`).join('');
    $('#tvLista').innerHTML = itens.slice(0, 12).map((n) => `<li class="lv2-row"><a class="tv-item" href="${esc(n.link)}" target="_blank" rel="noopener">
        ${n.imagem ? `<img src="${esc(n.imagem)}" alt="" loading="lazy" class="tv-thumb">` : `<span class="tv-thumb tv-semimg">${icon('news', 16)}</span>`}
        <div class="lv2-tx"><p>${esc(n.titulo)}</p><small>${esc(n.fonte)}${n.publicado ? ` · ${esc(timeAgo(n.publicado))}` : ''}</small></div></a></li>`).join('')
      || '<li class="lv2-empty"><p>Nenhuma manchete agora. As fontes podem estar fora do ar; tentamos de novo em alguns minutos.</p></li>';
    if (!itens.length) { $('#tvFala').innerHTML = '<p class="muted">Sem manchetes no momento.</p>'; return; }
    if (!timer) { falar(); timer = setInterval(falar, INTERVALO_MS); }
  }

  async function carregar() {
    if (!alive) return;
    try { desenhar(await api.get('/tech-news')); }
    catch (err) { $('#tvFala').innerHTML = `<p class="muted">Não consegui carregar as notícias: ${esc(err.message)}</p>`; }
  }

  $('#tvVoz').onclick = (e) => {
    narrar = !narrar; e.currentTarget.setAttribute('aria-pressed', String(narrar)); e.currentTarget.classList.toggle('on', narrar);
    if (narrar) falar(); else if ('speechSynthesis' in window) speechSynthesis.cancel();
  };
  carregar(); apresentadores();
  refresco = setInterval(carregar, ATUALIZA_MS);

  return () => {
    alive = false; clearInterval(timer); clearInterval(refresco);
    if (narrar && 'speechSynthesis' in window) speechSynthesis.cancel();
  };
}
