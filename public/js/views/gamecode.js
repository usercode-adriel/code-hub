// GAMECODE: painel de jogos no estilo do dashboard do PS5. Abas Games e Store, linha de jogos com foco (setas do teclado),
// destaque grande do jogo em foco e cartões com dados reais: armazenamento do navegador, controle conectado, tempo jogado,
// atividade recente e conquistas. Clicar no jogo (ou em Jogar) abre o jogo em tela cheia.
import { icon } from '../icons.js';
import { esc, timeAgo } from '../ui.js';
import { myAvatar } from '../chrome.js';
import { JOGOS, ROADMAP } from '../gamecode/jogos.js';
import { lerStats, registrarSessao, totalSegundos, totalPartidas, formatarTempo, conquistas } from '../gamecode/estatisticas.js';

const LOJA = { id: '__loja', titulo: 'Codeniac Store', descricao: 'Os jogos instalados e o que está em desenvolvimento.', genero: 'Loja' };
const gb = (b) => `${(b / 1073741824).toFixed(b >= 10737418240 ? 0 : 1).replace('.', ',')} GB`;
const hhmm = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const fundo = (g) => (g.capa ? `background-image:url('${esc(g.capa)}')` : `background:linear-gradient(135deg, ${g.cores?.[0] || '#1e3a8a'}, ${g.cores?.[1] || '#0ea5e9'})`);

export default async function render(el) {
  let aba = 'games'; let foco = 1; // 0 = Store, 1.. = jogos
  const itens = () => [LOJA, ...JOGOS];
  const nomeDe = (id) => JOGOS.find((j) => j.id === id)?.titulo || id;

  el.innerHTML = `<div class="gc-ps5"><div class="gc-bg" data-bg></div>
    <header class="gc-bar"><nav class="gc-tabs"><button type="button" data-aba="games" class="on">Games</button><button type="button" data-aba="store">Store</button></nav>
      <div class="gc-bar-r"><input data-busca placeholder="Buscar jogo" hidden aria-label="Buscar jogo"><button type="button" data-lupa aria-label="Buscar">${icon('search', 18)}</button>
        <a href="#/settings" aria-label="Configurações">${icon('settings', 18)}</a><img src="${esc(myAvatar())}" alt="Você"><span class="gc-relogio" data-relogio>${hhmm()}</span></div></header>
    <section data-pg="games"><div class="gc-linha" data-linha></div>
      <div class="gc-hero"><h1 data-titulo></h1><p data-desc></p><span class="gc-meta" data-meta></span><button type="button" class="gc-jogar" data-acao></button></div>
      <div class="gc-sec"><h4>Em destaque</h4><div class="gc-destaques" data-destaques></div></div>
      <div class="gc-paineis" data-paineis></div></section>
    <section data-pg="store" class="gc-store" hidden></section></div>`;
  const $ = (s) => el.querySelector(s);

  // ---------- linha de jogos e destaque ----------
  const desenharLinha = (filtro = '') => {
    const f = filtro.trim().toLowerCase();
    $('[data-linha]').innerHTML = itens().map((g, i) => ({ g, i })).filter(({ g, i }) => i === 0 || !f || g.titulo.toLowerCase().includes(f)).map(({ g, i }) => `<button type="button" class="gc-tile ${i === 0 ? 'loja' : ''} ${i === foco ? 'on' : ''}" data-i="${i}" style="${i === 0 ? '' : fundo(g)}" aria-label="${esc(g.titulo)}">${i === 0 ? icon('bag', i === foco ? 38 : 26) : ''}<span class="gc-rot">${esc(g.titulo)}</span></button>`).join('');
  };
  const destaque = () => {
    const g = itens()[foco] || LOJA; const s = lerStats(); const j = s.jogos[g.id];
    $('[data-bg]').style.backgroundImage = g.capa ? `url('${g.capa}')` : `linear-gradient(135deg, ${g.cores?.[0] || '#1e3a8a'}, ${g.cores?.[1] || '#0ea5e9'})`;
    $('[data-titulo]').textContent = g.titulo;
    $('[data-desc]').textContent = g.descricao;
    $('[data-meta]').textContent = g.id === LOJA.id ? `${JOGOS.length} jogo(s) instalado(s) · ${ROADMAP.length} em desenvolvimento` : `${g.versao} · ${g.genero}${j ? ` · ${formatarTempo(j.segundos)} jogados` : ' · ainda não jogado'}`;
    const b = $('[data-acao]'); b.innerHTML = g.id === LOJA.id ? `${icon('bag', 15)} Abrir a Store` : `${icon('play', 15)} Jogar`; b.dataset.id = g.id;
    desenharLinha($('[data-busca]').value);
  };
  const focar = (n) => { foco = Math.max(0, Math.min(itens().length - 1, n)); destaque(); $('[data-linha] .on')?.scrollIntoView({ inline: 'center', block: 'nearest' }); };

  // ---------- cartões ----------
  const painelArmazenamento = async () => {
    let corpo = '<p>O navegador não informa o espaço disponível.</p>';
    try {
      const e = await navigator.storage.estimate();
      if (e?.quota) { const usado = e.usage || 0; corpo = `<div class="gc-big">${gb(Math.max(0, e.quota - usado))} <small style="font-size:13px;opacity:.7">livres</small></div><div class="gc-barra"><i style="width:${Math.min(100, (usado / e.quota) * 100).toFixed(1)}%"></i></div><p>${gb(usado)} usados pelo Codeniac neste navegador (saves e dados do jogo ficam aqui).</p>`; }
    } catch { /* sem suporte */ }
    return `<div class="gc-painel"><h5>${icon('layers', 15)} Armazenamento</h5>${corpo}</div>`;
  };
  const painelControle = () => {
    const pads = [...(navigator.getGamepads?.() || [])].filter(Boolean);
    return `<div class="gc-painel" data-controle><h5>${icon('play', 15)} Controle</h5>${pads.length
      ? `<div class="gc-big">${esc(pads[0].id.replace(/\s*\(.*$/, '').slice(0, 34))}</div><p>Controle conectado. O jogo ainda é controlado pelo teclado.</p>`
      : '<div class="gc-big">Teclado</div><p>Nenhum controle conectado. Use WASD ou as setas, Shift para correr e +/− para o zoom.</p>'}</div>`;
  };
  const painelStats = (s) => `<div class="gc-painel"><h5>${icon('clock', 15)} Tempo de jogo</h5><div class="gc-big">${formatarTempo(totalSegundos(s))}</div><p>${totalPartidas(s)} partida(s) · ${JOGOS.length} jogo(s) instalado(s)</p></div>`;
  const painelAtividade = (s) => `<div class="gc-painel"><h5>${icon('activity', 15)} Atividade recente</h5>${s.recentes.length
    ? `<div class="gc-lista">${s.recentes.slice(0, 4).map((r) => `<div><span>${esc(nomeDe(r.id))}</span><small>${esc(formatarTempo(r.segundos))} · ${esc(timeAgo(new Date(r.em).toISOString()))}</small></div>`).join('')}</div>`
    : '<p>Nenhuma partida ainda. Abra um jogo para começar.</p>'}</div>`;
  const painelConquistas = (s) => {
    const c = conquistas(s);
    const prox = c.lista.find((x) => !x.feita);
    return `<div class="gc-painel"><h5>${icon('trophy', 15)} Conquistas<em>${c.feitas} de ${c.total}</em></h5>
      <div class="gc-trofeus"><span>🏆 ${c.platina}</span><span>🥇 ${c.ouro}</span><span>🥈 ${c.prata}</span><span>🥉 ${c.bronze}</span></div>
      <p>${prox ? `Próxima: <b>${esc(prox.titulo)}</b> — ${esc(prox.texto)}` : 'Todas as conquistas foram feitas!'}</p></div>`;
  };
  const painelStore = () => `<div class="gc-painel"><h5>${icon('bag', 15)} Novo na Store</h5><div class="gc-lista"><div><span>${esc(JOGOS[JOGOS.length - 1]?.titulo || '—')}</span><small>${esc(JOGOS[JOGOS.length - 1]?.versao || '')}</small></div></div><button type="button" class="gc-etiq ok" style="border:0;cursor:pointer;color:#86efac;font:inherit;font-size:11px;font-weight:800" data-abrir-store>Abrir a Store</button></div>`;
  const painelRoadmap = () => `<div class="gc-painel"><h5>${icon('zap', 15)} Em desenvolvimento</h5><div class="gc-lista">${ROADMAP.slice(0, 4).map((r) => `<div><span>${esc(r.titulo)}</span><small>${esc(r.versao)}</small></div>`).join('')}</div></div>`;
  const desenharPaineis = async () => {
    const s = lerStats();
    $('[data-paineis]').innerHTML = [await painelArmazenamento(), painelControle(), painelStats(s), painelAtividade(s), painelConquistas(s), painelStore(), painelRoadmap()].join('');
  };
  const desenharDestaques = () => {
    $('[data-destaques]').innerHTML = JOGOS.map((g) => `<button type="button" class="gc-card-d" data-jogo="${esc(g.id)}" style="${fundo(g)}"><span>${esc(g.titulo)}</span></button>`).join('')
      + ROADMAP.slice(0, 3).map((r) => `<div class="gc-card-d soon"><small>EM BREVE</small><span>${esc(r.titulo)}</span></div>`).join('');
  };

  // ---------- Store ----------
  const desenharStore = () => {
    $('[data-pg="store"]').innerHTML = `<div><h2>Codeniac Store</h2><p style="opacity:.75;margin:0">Jogos instalados e o que está a caminho.</p></div>
      <div><h4 style="margin:0 0 10px;opacity:.85">Instalados</h4><div class="gc-grade">${JOGOS.map((g) => `<article class="gc-item"><div class="capa" style="${fundo(g)}"></div><div class="txt"><span class="gc-etiq ok">INSTALADO</span><b>${esc(g.titulo)}</b><small>${esc(g.versao)} · ${esc(g.genero)}</small><p>${esc(g.descricao)}</p>
        <button type="button" class="gc-jogar" style="font-size:13px;padding:8px 20px" data-jogo="${esc(g.id)}">${icon('play', 13)} Jogar</button></div></article>`).join('')}</div></div>
      <div><h4 style="margin:0 0 10px;opacity:.85">Em desenvolvimento</h4><div class="gc-grade">${ROADMAP.map((r) => `<article class="gc-item"><div class="capa"></div><div class="txt"><span class="gc-etiq">${esc(r.versao)} · EM BREVE</span><b>${esc(r.titulo)}</b><p>${esc(r.texto)}</p></div></article>`).join('')}</div></div>`;
  };

  // ---------- abrir o jogo ----------
  const abrirJogo = (g) => {
    if (!g || g.id === LOJA.id) return;
    const inicio = Date.now();
    const tela = document.createElement('div');
    tela.className = 'gc-play';
    tela.innerHTML = `<div class="gc-play-bar"><button type="button" id="gcVoltar">← Voltar</button><b>${esc(g.titulo)}</b></div><iframe src="${esc(g.src)}" title="${esc(g.titulo)}" allow="fullscreen"></iframe>`;
    const sair = () => { tela.remove(); document.removeEventListener('keydown', tecla); registrarSessao(g.id, (Date.now() - inicio) / 1000); destaque(); desenharPaineis(); desenharStore(); };
    const tecla = (e) => { if (e.key === 'Escape') sair(); };
    tela.querySelector('#gcVoltar').onclick = sair;
    document.addEventListener('keydown', tecla);
    document.body.appendChild(tela);
  };
  const abrirPorId = (id) => { if (id === LOJA.id) trocarAba('store'); else abrirJogo(JOGOS.find((g) => g.id === id)); };
  function trocarAba(a) {
    aba = a;
    el.querySelectorAll('[data-aba]').forEach((b) => b.classList.toggle('on', b.dataset.aba === a));
    $('[data-pg="games"]').hidden = a !== 'games'; $('[data-pg="store"]').hidden = a !== 'store';
    if (a === 'store') { desenharStore(); $('[data-bg]').style.backgroundImage = 'linear-gradient(135deg, #1e3a8a, #0ea5e9)'; } else destaque();
  }

  // ---------- eventos ----------
  el.addEventListener('click', (e) => {
    const ab = e.target.closest('[data-aba]'); if (ab) { trocarAba(ab.dataset.aba); return; }
    if (e.target.closest('[data-abrir-store]')) { trocarAba('store'); return; }
    if (e.target.closest('[data-lupa]')) { const b = $('[data-busca]'); b.hidden = !b.hidden; if (!b.hidden) b.focus(); else { b.value = ''; desenharLinha(); } return; }
    const t = e.target.closest('.gc-tile'); if (t) { const i = Number(t.dataset.i); if (i === foco) abrirPorId(itens()[i].id); else focar(i); return; }
    const a = e.target.closest('[data-acao]'); if (a) { abrirPorId(a.dataset.id); return; }
    const j = e.target.closest('[data-jogo]'); if (j) abrirPorId(j.dataset.jogo);
  });
  el.addEventListener('mouseover', (e) => { const t = e.target.closest('.gc-tile'); if (t && Number(t.dataset.i) !== foco) focar(Number(t.dataset.i)); });
  $('[data-busca]').addEventListener('input', (e) => desenharLinha(e.target.value));
  const teclas = (e) => {
    if (aba !== 'games' || document.querySelector('.gc-play') || /input|textarea|select/i.test(e.target.tagName)) return;
    if (e.key === 'ArrowRight') { focar(foco + 1); e.preventDefault(); }
    if (e.key === 'ArrowLeft') { focar(foco - 1); e.preventDefault(); }
    if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') abrirPorId(itens()[foco].id);
  };
  document.addEventListener('keydown', teclas);
  const relogio = setInterval(() => { const r = $('[data-relogio]'); if (r) r.textContent = hhmm(); }, 10000);
  const pad = () => { const c = $('[data-controle]'); if (c) c.outerHTML = painelControle(); };
  window.addEventListener('gamepadconnected', pad); window.addEventListener('gamepaddisconnected', pad);

  destaque(); desenharDestaques(); desenharPaineis();
  return () => { document.removeEventListener('keydown', teclas); clearInterval(relogio); window.removeEventListener('gamepadconnected', pad); window.removeEventListener('gamepaddisconnected', pad); };
}
