// NOTÍCIAS: lista ao vivo (fontes internacionais), botão atualizar, leitor dentro do sistema e insights.
// Usado no Início (versão compacta) e na tela News (versão completa).
import { api } from '../api.js';
import { icon } from '../icons.js';
import { esc, timeAgo } from '../ui.js';

const ATUALIZA_MS = 3 * 60 * 1000;
const hora = (iso) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--');

const cartao = (n, cats) => `<button type="button" class="nx-n" data-id="${esc(n.id)}">
    ${n.imagem ? `<img src="${esc(n.imagem)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'nx-sem',textContent:'📰'}))">` : '<div class="nx-sem">📰</div>'}
    <span class="nx-t"><b>${esc(n.titulo)}</b>
      <small><span class="nx-cat">${esc(cats?.[n.categoria] || n.categoria)}</span>${esc(n.fonte)}${n.publicado ? ` · ${esc(timeAgo(n.publicado))}` : ''}</small></span></button>`;

/** Painel de notícias. Devolve a função que desliga os temporizadores. */
export function montarNoticias(host, { compacto = false, limite = 0, titulo = 'Notícias ao vivo' } = {}) {
  let dados = null; let cat = 'todas'; let vivo = true; let timer = null; let carregando = false;
  host.innerHTML = `<header><h3>${esc(titulo)}</h3><span class="nx-vivo"><i></i>AO VIVO</span>
      <span class="nx-esq"><span data-atualizado>carregando…</span><button type="button" class="nx-btn" data-atualizar>${icon('refresh', 14)} Atualizar notícias</button></span></header>
    <div class="nx-barra" data-barra></div>
    <div class="nx-chips" data-chips></div><div class="nx-lista ${compacto ? 'comp' : ''}" data-lista><div class="nx-vazio">Buscando as manchetes…</div></div>
    ${compacto ? '' : '<div class="nx-fontes" data-fontes></div>'}`;
  const $ = (s) => host.querySelector(s);

  const desenhar = () => {
    if (!dados) return;
    const cats = dados.categorias || {};
    const itens = dados.itens.filter((n) => cat === 'todas' || n.categoria === cat);
    const lista = limite ? itens.slice(0, limite) : itens;
    $('[data-chips]').innerHTML = [['todas', 'Todas'], ...Object.entries(cats)].map(([k, l]) => `<button type="button" class="nx-chip ${k === cat ? 'on' : ''}" data-cat="${esc(k)}">${esc(l)}</button>`).join('');
    $('[data-lista]').innerHTML = lista.length ? lista.map((n) => cartao(n, cats)).join('')
      : `<div class="nx-vazio">${dados.itens.length ? 'Nenhuma notícia nesta categoria agora.' : 'Nenhuma manchete agora. As fontes podem estar fora do ar; tentamos de novo em alguns minutos.'}</div>`;
    $('[data-atualizado]').textContent = `atualizado às ${hora(dados.atualizado)}`;
    const f = $('[data-fontes]');
    if (f) f.innerHTML = `<span>Fontes:</span>${dados.fontes.map((x) => `<span class="nx-fonte ${x.ok ? '' : 'off'}" title="${x.ok ? 'Respondendo' : esc(x.erro || 'Sem resposta')}">${esc(x.nome)}</span>`).join('')}`;
  };

  async function carregar(forcar = false) {
    if (!vivo || carregando) return;
    carregando = true;
    const btn = $('[data-atualizar]');
    btn.disabled = true; btn.classList.add('gira'); $('[data-barra]').classList.remove('pausa');
    try { dados = await api.get(`/tech-news${forcar ? '?forcar=1' : ''}`); desenhar(); host.dispatchEvent(new CustomEvent('nx-dados', { bubbles: true, detail: dados })); }
    catch (err) { $('[data-atualizado]').textContent = 'sem conexão'; if (!dados) $('[data-lista]').innerHTML = `<div class="nx-vazio">Não consegui carregar as notícias: ${esc(err.message)}</div>`; $('[data-barra]').classList.add('pausa'); }
    finally { carregando = false; btn.disabled = false; btn.classList.remove('gira'); }
  }

  host.addEventListener('click', (e) => {
    const c = e.target.closest('[data-cat]'); if (c) { cat = c.dataset.cat; desenhar(); return; }
    if (e.target.closest('[data-atualizar]')) { carregar(true); return; }
    const n = e.target.closest('[data-id]'); if (n && dados) abrirLeitor(dados.itens.find((x) => x.id === n.dataset.id));
  });
  carregar();
  timer = setInterval(() => carregar(false), ATUALIZA_MS);
  return () => { vivo = false; clearInterval(timer); };
}

/** Abre a matéria dentro do sistema. O servidor baixa a página e entrega só o texto; "Abrir original" leva ao site. */
export async function abrirLeitor(item) {
  if (!item) return;
  document.querySelector('.nx-leitor')?.remove();
  const tela = document.createElement('div');
  tela.className = 'nx-leitor';
  const sair = () => { tela.remove(); document.removeEventListener('keydown', tecla); };
  const tecla = (e) => { if (e.key === 'Escape') sair(); };
  document.addEventListener('keydown', tecla);
  const moldura = (corpo) => `<div class="nx-leitor-in"><div class="nx-leitor-bar"><button type="button" class="nx-btn" data-fechar>← Voltar</button><b>${esc(item.fonte)}</b>
      <a class="nx-btn" href="${esc(item.link)}" target="_blank" rel="noopener noreferrer">Abrir original ${icon('chevRight', 12)}</a></div>${corpo}</div>`;
  tela.innerHTML = moldura('<div class="nx-leitor-txt"><p class="nx-vazio">Abrindo a matéria…</p></div>');
  tela.addEventListener('click', (e) => { if (e.target === tela || e.target.closest('[data-fechar]')) sair(); });
  document.body.appendChild(tela);
  try {
    const a = await api.get(`/tech-news/artigo/${encodeURIComponent(item.id)}`);
    const blocos = a.blocos.map((b) => (b.t === 'h' ? `<h4>${esc(b.texto)}</h4>` : b.t === 'q' ? `<blockquote>${esc(b.texto)}</blockquote>` : b.t === 'li' ? `<ul><li>${esc(b.texto)}</li></ul>` : `<p>${esc(b.texto)}</p>`)).join('').replace(/<\/ul><ul>/g, '');
    tela.innerHTML = moldura(`${a.imagem ? `<img class="capa" src="${esc(a.imagem)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
      <div class="nx-leitor-txt"><small class="nx-cat">${esc(a.fonte)}</small>${a.publicado ? ` <small>${esc(timeAgo(a.publicado))}</small>` : ''}<h1>${esc(a.titulo)}</h1>
      ${a.semTexto ? `<div class="nx-aviso">Este site não deixou o Codeniac ler o texto completo${a.motivo ? ` (${esc(a.motivo)})` : ''}. Abaixo está o resumo da fonte; use <b>Abrir original</b> para ver a página inteira.</div><p>${esc(a.resumo || '')}</p>` : blocos}
      <p class="nx-vazio" style="margin-top:18px">Texto da fonte <b>${esc(a.fonte)}</b>, exibido aqui para leitura. Direitos do conteúdo: ${esc(a.fonte)}.</p></div>`);
  } catch (err) {
    tela.innerHTML = moldura(`<div class="nx-leitor-txt"><h1>${esc(item.titulo)}</h1><div class="nx-aviso">Não consegui abrir a matéria aqui: ${esc(err.message)}</div><p>${esc(item.resumo || '')}</p></div>`);
  }
}

/** Insights: tendências calculadas das manchetes de agora (não é texto gerado por IA). */
export function montarInsights(host, { titulo = 'Insights IA' } = {}) {
  let vivo = true;
  host.innerHTML = `<header><h3>${esc(titulo)}</h3><span class="nx-esq">${icon('sparkles', 14)} tendências das manchetes de agora</span></header><div class="nx-ins" data-ins><div class="nx-vazio">Analisando as manchetes…</div></div>`;
  const carregar = async () => {
    try {
      const r = await api.get('/tech-news/insights');
      if (!vivo) return;
      host.querySelector('[data-ins]').innerHTML = r.temas.length
        ? r.temas.map((t) => `<div class="nx-ins-i"><b><span>${esc(t.tema)}</span><span>${t.pct}% das manchetes</span></b><p>${esc(t.dica)}</p>${t.exemplo ? `<button type="button" data-id="${esc(t.exemplo.id)}" data-titulo="${esc(t.exemplo.titulo)}">Ex.: ${esc(t.exemplo.titulo.slice(0, 80))} — ${esc(t.exemplo.fonte)}</button>` : ''}</div>`).join('')
        : '<div class="nx-vazio">Sem manchetes suficientes para analisar agora.</div>';
    } catch { if (vivo) host.querySelector('[data-ins]').innerHTML = '<div class="nx-vazio">Não consegui analisar as manchetes agora.</div>'; }
  };
  host.addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-id]'); if (!b) return;
    try { const d = await api.get('/tech-news'); abrirLeitor(d.itens.find((x) => x.id === b.dataset.id)); } catch { /* sem conexão */ }
  });
  carregar();
  const t = setInterval(carregar, ATUALIZA_MS);
  return () => { vivo = false; clearInterval(t); };
}

// ---------- Carrossel automático e personalizável ----------
const CFG_KEY = 'codeniac.newsCarrossel';
const CFG_PADRAO = { auto: true, seg: 6, max: 6, cats: null };
const lerCfg = () => { try { return { ...CFG_PADRAO, ...JSON.parse(localStorage.getItem(CFG_KEY) || '{}') }; } catch { return { ...CFG_PADRAO }; } };

/** Carrossel de destaques: troca sozinho, pausa com o mouse, e o usuário escolhe categorias, velocidade e quantidade. */
export function montarCarrossel(host) {
  let cfg = lerCfg(); let dados = null; let itens = []; let i = 0; let timer = null; let pausado = false;
  host.innerHTML = `<header><h3>Destaques</h3><span class="nx-vivo"><i></i>AO VIVO</span>
      <span class="nx-esq"><button type="button" class="nx-btn" data-config aria-expanded="false">${icon('settings', 14)} Personalizar</button></span></header>
    <div class="nx-conf" data-painel hidden></div>
    <div class="nx-car" data-car tabindex="0" aria-roledescription="carrossel" aria-label="Destaques das notícias">
      <div class="nx-car-trilho" data-trilho></div>
      <button type="button" class="nx-car-seta esq" data-prev aria-label="Anterior">${icon('chevLeft', 20)}</button>
      <button type="button" class="nx-car-seta dir" data-next aria-label="Próxima">${icon('chevRight', 20)}</button>
      <div class="nx-car-pontos" data-pontos></div></div>`;
  const $ = (s2) => host.querySelector(s2);
  const salvar = () => localStorage.setItem(CFG_KEY, JSON.stringify(cfg));

  const iniciar = () => { clearInterval(timer); if (cfg.auto && itens.length > 1) timer = setInterval(() => { if (!pausado && !document.hidden) ir(i + 1); }, Math.max(1, Number(cfg.seg) || 6) * 1000); };
  function ir(n) {
    if (!itens.length) return;
    i = (n + itens.length) % itens.length;
    $('[data-trilho]').style.transform = `translateX(-${i * 100}%)`;
    host.querySelectorAll('[data-ponto]').forEach((b, k) => { b.classList.toggle('on', k === i); b.setAttribute('aria-current', k === i ? 'true' : 'false'); });
    host.querySelectorAll('.nx-slide').forEach((sl, k) => sl.setAttribute('aria-hidden', k === i ? 'false' : 'true'));
  }
  function desenhar() {
    const cats = dados?.categorias || {};
    const base = (dados?.itens || []).filter((n) => !cfg.cats || cfg.cats.includes(n.categoria));
    itens = base.slice(0, Number(cfg.max) || 6);
    $('[data-trilho]').innerHTML = itens.length ? itens.map((n) => `<article class="nx-slide" style="${n.imagem ? `background-image:linear-gradient(180deg, rgba(8,10,40,.15), rgba(8,10,40,.92)), url('${esc(n.imagem)}')` : ''}">
        <div class="nx-slide-in"><span class="nx-cat">${esc(cats[n.categoria] || n.categoria)}</span><h2>${esc(n.titulo)}</h2>
          <p>${esc((n.resumo || '').slice(0, 170))}</p><small>${esc(n.fonte)}${n.publicado ? ` · ${esc(timeAgo(n.publicado))}` : ''}</small>
          <button type="button" class="nx-btn pri" data-ler="${esc(n.id)}">Ler aqui ${icon('chevRight', 12)}</button></div></article>`).join('')
      : '<article class="nx-slide"><div class="nx-slide-in"><h2>Sem destaques agora</h2><p>Ajuste as categorias em Personalizar ou atualize as notícias.</p></div></article>';
    $('[data-pontos]').innerHTML = itens.map((_, k) => `<button type="button" data-ponto="${k}" aria-label="Destaque ${k + 1}"></button>`).join('');
    $('[data-prev]').hidden = $('[data-next]').hidden = itens.length < 2;
    if (i >= itens.length) i = 0;
    ir(i); iniciar();
  }
  function painel() {
    const cats = dados?.categorias || {};
    $('[data-painel]').innerHTML = `<div class="nx-conf-g"><b>Categorias</b>${Object.entries(cats).map(([k, l]) => `<label><input type="checkbox" data-cc="${esc(k)}" ${!cfg.cats || cfg.cats.includes(k) ? 'checked' : ''}> ${esc(l)}</label>`).join('')}</div>
      <div class="nx-conf-g"><b>Troca automática</b><label><input type="checkbox" data-auto ${cfg.auto ? 'checked' : ''}> Ligada</label>
        <label>a cada <select data-seg>${[4, 6, 10, 15].map((v) => `<option value="${v}" ${Number(cfg.seg) === v ? 'selected' : ''}>${v} s</option>`).join('')}</select></label></div>
      <div class="nx-conf-g"><b>Quantidade</b><label><select data-max>${[4, 6, 8, 10].map((v) => `<option value="${v}" ${Number(cfg.max) === v ? 'selected' : ''}>${v} destaques</option>`).join('')}</select></label></div>`;
  }
  host.addEventListener('click', (e) => {
    if (e.target.closest('[data-prev]')) { ir(i - 1); iniciar(); return; }
    if (e.target.closest('[data-next]')) { ir(i + 1); iniciar(); return; }
    const pt = e.target.closest('[data-ponto]'); if (pt) { ir(Number(pt.dataset.ponto)); iniciar(); return; }
    const ler = e.target.closest('[data-ler]'); if (ler && dados) { abrirLeitor(dados.itens.find((x) => x.id === ler.dataset.ler)); return; }
    const c = e.target.closest('[data-config]');
    if (c) { const p = $('[data-painel]'); p.hidden = !p.hidden; c.setAttribute('aria-expanded', String(!p.hidden)); if (!p.hidden) painel(); }
  });
  host.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('[data-cc]')) {
      const marcadas = [...host.querySelectorAll('[data-cc]')].filter((x) => x.checked).map((x) => x.dataset.cc);
      const todas = Object.keys(dados?.categorias || {});
      cfg.cats = marcadas.length && marcadas.length < todas.length ? marcadas : null;
      if (!marcadas.length) { t.checked = true; }
    }
    if (t.matches('[data-auto]')) cfg.auto = t.checked;
    if (t.matches('[data-seg]')) cfg.seg = Number(t.value);
    if (t.matches('[data-max]')) cfg.max = Number(t.value);
    salvar(); desenhar();
  });
  const car = $('[data-car]');
  car.addEventListener('mouseenter', () => { pausado = true; }); car.addEventListener('mouseleave', () => { pausado = false; });
  car.addEventListener('focusin', () => { pausado = true; }); car.addEventListener('focusout', () => { pausado = false; });
  car.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') { ir(i + 1); iniciar(); } if (e.key === 'ArrowLeft') { ir(i - 1); iniciar(); } });
  desenhar();
  return {
    atualizar(d) { dados = d; desenhar(); },
    destruir() { clearInterval(timer); },
  };
}
