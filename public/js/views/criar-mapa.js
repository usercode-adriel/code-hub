// CRIAR MAPA: editor do seu próprio mundo. Todo mapa começa com a grama (célula por célula) e só recebe o que está
// no inventário: terreno pintado nas células, e construções, objetos, veículos, aeronaves, 3D e personagens como peças.
// Cada peça tem posição, escala, rotação livre, espelho e camada. Desfazer/refazer, copiar/colar e atalhos de teclado.
// Expandir acrescenta grama na borda escolhida. Criar um mapa já o torna o mapa do jogo ("Vida").
import { api } from '../api.js';
import { esc, toast } from '../ui.js';

const CEL = 32;
const ROTAS = ['#/mapa', '#/mercado', '#/banco', '#/veiculos', '#/policia', '#/hospital', '#/justica', '#/governo', '#/empregos', '#/diversao', '#/locadora', '#/construtora'];
const NOMES_CAT = { terreno: 'Terreno', construcoes: 'Construções', objetos: 'Objetos', vegetacao: 'Vegetação', relevo: 'Relevo', veiculos: 'Veículos', aeronaves: 'Aeronaves', '3d': '3D', personagens: 'Personagens' };
const GRAMA = 'terreno/grama-base';
const PASSO = 8;      // com o ímã ligado, as peças encaixam a cada 8 unidades
const HIST_MAX = 80;  // quantas ações cabem no Desfazer

export default async function render(el, parts, params = new URLSearchParams()) {
  const id = params.get('id');
  if (!id) return listar(el);
  el.innerHTML = '<section class="card"><p>Carregando o mapa…</p></section>';
  let inv; let mapa;
  try { inv = await api.get('/mapas/inventario'); mapa = await api.get(`/mapas/${id}`); }
  catch (err) { el.innerHTML = `<section class="card"><p>${esc(err.message)}</p><a href="#/configuracoes">Voltar às configurações</a></section>`; return; }
  editor(el, mapa, inv.itens);
}

async function listar(el) {
  const { mapas, vida } = await api.get('/mapas');
  el.innerHTML = `<section class="card"><h3 class="title">Criar mapa</h3>
    <p class="muted">Monte o seu mundo peça por peça, com o inventário de assets. Ao criar um mapa, ele já vira o mapa do jogo: é só abrir o <b>Mapa</b>.</p>
    <div class="row" style="gap:8px"><input class="input" id="mNome" placeholder="Nome do mapa" maxlength="60" style="max-width:260px"><button class="btn primary" id="mNovo">Novo mapa</button></div>
    <div style="display:grid;gap:8px;margin-top:14px">${mapas.map((m) => `<div class="card" style="padding:10px;display:flex;gap:10px;align-items:center;justify-content:space-between">
      <div><b>${esc(m.nome)}</b> ${vida === m.id ? '<span class="chip">Jogo usa este mapa</span>' : ''}<div class="muted" style="font-size:12px">${m.largura}×${m.altura} células · ${m.itens} peças</div></div>
      <div class="row" style="gap:6px"><a class="btn sm" href="#/criar-mapa?id=${m.id}">Editar</a>${vida === m.id ? '' : `<button class="btn sm" data-vida="${m.id}">Usar no jogo</button>`}<button class="btn sm" data-del="${m.id}">Apagar</button></div></div>`).join('') || '<p class="muted">Nenhum mapa ainda. Crie o primeiro aqui.</p>'}</div>
    <p style="margin-top:12px"><a href="#/configuracoes">← Configurações</a> · <a href="#/studio">Structure Studio</a></p></section>`;
  el.querySelector('#mNovo').onclick = async () => {
    const nome = el.querySelector('#mNome').value.trim() || 'Meu mapa';
    const m = await api.post('/mapas', { nome }); location.hash = `#/criar-mapa?id=${m.id}`;
  };
  el.querySelectorAll('[data-vida]').forEach((b) => { b.onclick = async () => { await api.post(`/mapas/${b.dataset.vida}/vida`, {}); toast('Mapa', 'Este é agora o mapa do jogo.', 'success'); listar(el); }; });
  el.querySelectorAll('[data-del]').forEach((b) => { b.onclick = async () => { if (!confirm('Apagar este mapa?')) return; await api.del(`/mapas/${b.dataset.del}`); listar(el); }; });
}

function editor(el, mapa, itens) {
  const porChave = new Map(itens.map((i) => [i.chave, i]));
  const imgs = new Map();
  const img = (arq) => { if (!imgs.has(arq)) { const i = new Image(); i.src = arq; imgs.set(arq, i); } return imgs.get(arq); };
  // células como {"x,y": chave}; grama é o padrão e não aparece
  const m = {
    id: mapa.id, nome: mapa.nome, largura: mapa.largura, altura: mapa.altura, celulas: { ...mapa.celulas },
    itens: mapa.itens.map((p) => ({ ...p, rot: p.rot || 0, escala: p.escala || 1, espelho: !!p.espelho, z: p.z || 0, dados: { ...(p.dados || {}) } })),
  };
  const S = { cat: 'construcoes', chave: null, ferr: 'item', sel: null, cam: { x: m.largura * CEL / 2, y: m.altura * CEL / 2, z: 0.8 }, grade: true, snap: true, sujo: false, arrastando: null, pan: null, mouse: null };
  const hist = { passado: [], futuro: [] };
  let clip = null;

  el.innerHTML = `<section class="card" id="eCaixa" style="padding:12px">
    <div class="row" style="gap:8px;align-items:center;flex-wrap:wrap">
      <a href="#/criar-mapa">← Mapas</a>
      <input class="input" id="eNome" value="${esc(m.nome)}" maxlength="60" style="max-width:220px">
      <button class="btn" id="eSalvar">Salvar</button><span id="eEstado" class="muted" style="font-size:12px"></span>
      <span style="margin-left:auto" class="row"><button class="btn sm" id="eDesfazer" title="Ctrl+Z">↶ Desfazer</button><button class="btn sm" id="eRefazer" title="Ctrl+Y">↷ Refazer</button>
      <button class="btn sm" id="eGrade">Grade</button><button class="btn sm" id="eIma" title="Encaixa as peças na grade fina">Ímã</button>
      <button class="btn sm" id="eTelaCheia" title="Ocupa a janela inteira">⛶ Tela cheia</button>
      <button class="btn primary" id="eVida">Usar no jogo ▶</button></span>
    </div>
    <div style="display:grid;grid-template-columns:1fr 270px;gap:10px;margin-top:10px">
      <div id="eArea" style="position:relative;min-width:0">
        <canvas id="eTela" style="width:100%;height:560px;display:block;background:#1b1f2a;border-radius:10px;touch-action:none"></canvas>
        <div id="eBarra" style="position:absolute;display:none;gap:4px;align-items:center;padding:4px;background:rgba(17,24,39,.96);border:1px solid #334155;border-radius:8px;box-shadow:0 4px 14px rgba(0,0,0,.45);z-index:3;white-space:nowrap">
          <button class="btn sm" data-b="dup" title="Duplicar (Ctrl+D)">Duplicar</button>
          <button class="btn sm" data-b="cop" title="Copiar (Ctrl+C)">Copiar</button>
          <button class="btn sm" data-b="tras" title="Enviar para trás ([)">▼ Camada</button>
          <button class="btn sm" data-b="frente" title="Trazer para frente (])">▲ Camada</button>
          <button class="btn sm" data-b="gira" title="Girar 90° (R)">↻ 90°</button>
          <button class="btn sm" data-b="esp" title="Espelhar (F)">⇋</button>
          <button class="btn sm" data-b="apaga" title="Apagar (Delete)">Apagar</button>
        </div>
        <div id="eFerr" style="position:absolute;left:8px;top:8px;width:270px;max-height:calc(100% - 16px);display:flex;flex-direction:column;background:rgba(17,24,39,.95);border:1px solid #334155;border-radius:10px;box-shadow:0 6px 20px rgba(0,0,0,.4);z-index:2">
          <div id="eFerrAlca" style="display:flex;align-items:center;justify-content:space-between;padding:6px 8px;cursor:move;user-select:none;border-bottom:1px solid #334155">
            <b style="font-size:13px">Caixa de ferramentas</b><button class="btn sm" id="eFerrMin" title="Recolher">–</button></div>
          <div id="eFerrCorpo" style="padding:8px;overflow:auto">
            <div class="row" id="eCats" style="gap:4px;flex-wrap:wrap">${Object.keys(NOMES_CAT).map((c) => `<button class="btn sm" data-cat="${c}">${NOMES_CAT[c]}</button>`).join('')}</div>
            <div id="ePaleta" style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin-top:8px;max-height:260px;overflow:auto"></div>
            <div class="row" style="gap:4px;margin-top:8px;flex-wrap:wrap">
              <button class="btn sm" data-ferr="item">Colocar</button><button class="btn sm" data-ferr="pintar">Pintar chão</button>
              <button class="btn sm" data-ferr="mover">Selecionar</button><button class="btn sm" data-ferr="apagar">Apagar</button></div>
            <div class="row" style="gap:4px;margin-top:8px;flex-wrap:wrap"><span class="muted" style="font-size:12px;width:100%">Expandir terreno:</span>
              <button class="btn sm" data-exp="esq">← Esq.</button><button class="btn sm" data-exp="dir">Dir. →</button><button class="btn sm" data-exp="cima">↑ Cima</button><button class="btn sm" data-exp="baixo">Baixo ↓</button></div>
          </div>
        </div>
      </div>
      <div id="eProp" class="muted" style="font-size:13px;overflow:auto;max-height:720px"></div>
    </div>
    <p class="muted" style="font-size:12px;margin-top:8px">Clique para colocar ou pintar. Com <b>Selecionar</b>, clique numa peça: a alça amarela no topo gira, a do canto redimensiona. <b>Segure o botão direito sobre uma peça para movê-la</b>; o botão direito em área vazia ou o do meio move a visão. A roda dá zoom.</p>
  </section>`;

  const tela = el.querySelector('#eTela'); const g = tela.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  function ajustar() { tela.width = tela.clientWidth * dpr; tela.height = tela.clientHeight * dpr; desenhar(); }
  const aoRedimensionar = () => { if (!el.isConnected) return; ajustar(); };
  // caixa de ferramentas: arrasta pelo cabeçalho, recolhe com o botão –
  const caixaF = el.querySelector('#eFerr');
  let arrastoCaixa = null;
  el.querySelector('#eFerrAlca').addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    const r = caixaF.getBoundingClientRect(); arrastoCaixa = { dx: e.clientX - r.left, dy: e.clientY - r.top }; e.currentTarget.setPointerCapture(e.pointerId);
  });
  el.querySelector('#eFerrAlca').addEventListener('pointermove', (e) => {
    if (!arrastoCaixa) return;
    const area = el.querySelector('#eArea').getBoundingClientRect();
    caixaF.style.left = Math.max(0, Math.min(area.width - 60, e.clientX - arrastoCaixa.dx - area.left)) + 'px';
    caixaF.style.top = Math.max(0, Math.min(area.height - 40, e.clientY - arrastoCaixa.dy - area.top)) + 'px';
  });
  el.querySelector('#eFerrAlca').addEventListener('pointerup', () => { arrastoCaixa = null; });
  el.querySelector('#eFerrMin').onclick = () => {
    const corpo = el.querySelector('#eFerrCorpo'); const fechada = corpo.style.display === 'none';
    corpo.style.display = fechada ? '' : 'none'; el.querySelector('#eFerrMin').textContent = fechada ? '–' : '+';
  };
  // tela cheia: a seção ocupa a janela; a tela de desenho acompanha
  el.querySelector('#eTelaCheia').onclick = () => {
    const cheia = el.querySelector('#eCaixa').dataset.cheia !== '1';
    const caixa = el.querySelector('#eCaixa');
    caixa.dataset.cheia = cheia ? '1' : '';
    Object.assign(caixa.style, cheia ? { position: 'fixed', inset: '0', zIndex: '500', margin: '0', borderRadius: '0', overflow: 'auto', background: '#0f131c' } : { position: '', inset: '', zIndex: '', margin: '', borderRadius: '', overflow: '', background: '' });
    el.querySelector('#eTela').style.height = cheia ? 'calc(100vh - 150px)' : '560px';
    el.querySelector('#eProp').style.maxHeight = cheia ? 'calc(100vh - 150px)' : '720px';
    el.querySelector('#eTelaCheia').textContent = cheia ? '⛶ Sair da tela cheia' : '⛶ Tela cheia';
    requestAnimationFrame(ajustar);
  };
  window.addEventListener('resize', aoRedimensionar);

  const mundoDeTela = (sx, sy) => { const r = tela.getBoundingClientRect(); return { x: (sx - r.left - r.width / 2) / S.cam.z + S.cam.x, y: (sy - r.top - r.height / 2) / S.cam.z + S.cam.y }; };
  const celulaDe = (p) => [Math.floor(p.x / CEL), Math.floor(p.y / CEL)];
  const chaoDe = (x, y) => m.celulas[`${x},${y}`] || GRAMA;
  const sel = () => m.itens.find((x) => x.id === S.sel);
  const encaixe = (x, y) => (S.snap ? [Math.round(x / PASSO) * PASSO, Math.round(y / PASSO) * PASSO] : [Math.round(x), Math.round(y)]);
  const limitar = (v, max) => Math.min(max, Math.max(0, v));
  const zoomHandle = () => 1 / S.cam.z;

  // geometria da peça: tamanho já com escala; coordenadas locais têm o pivô (base, centro) em (0,0)
  function dimensoes(p) { const it = porChave.get(p.chave); const e = p.escala || 1; return { it, w: it.w * e, h: it.h * e }; }
  const rad = (graus) => graus * Math.PI / 180;
  function localDe(p, q) {
    const r = -rad(p.rot || 0); const dx = q.x - p.x; const dy = q.y - p.y;
    return { x: dx * Math.cos(r) - dy * Math.sin(r), y: dx * Math.sin(r) + dy * Math.cos(r) };
  }
  function mundoDe(p, lx, ly) {
    const t = rad(p.rot || 0);
    return { x: p.x + lx * Math.cos(t) - ly * Math.sin(t), y: p.y + lx * Math.sin(t) + ly * Math.cos(t) };
  }
  const distancia = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  // alças de redimensionar: (kx, ky) com kx, ky em {-1, 0, 1}; (0, 0) não é alça. Oposta = (-kx, -ky) fica parada.
  const ALCAS = [[-1, 1], [0, 1], [1, 1], [-1, 0], [1, 0], [-1, -1], [0, -1], [1, -1]];
  // posição local de uma alça: base do item em y=0, topo em y=-h, x centrado
  const posAlca = ([kx, ky], w, h) => ({ x: kx * w / 2, y: -h / 2 + ky * h / 2 });
  // redimensiona pela alça, com a alça oposta presa no lugar: a peça cresce ou encolhe a partir dela
  function redimensionar(p, a, q) {
    const it = porChave.get(p.chave);
    const e0 = a.base.escala; const w0 = it.w * e0; const h0 = it.h * e0;
    const [kx, ky] = a.alca; const op = [-kx, -ky];
    const alcaPos = posAlca(a.alca, w0, h0); const opPos = posAlca(op, w0, h0);
    const v = { x: alcaPos.x - opPos.x, y: alcaPos.y - opPos.y };
    // ponto do mouse no quadro da peça, na orientação original
    const l = localDe({ x: a.base.x, y: a.base.y, rot: a.base.rot }, q);
    const d = { x: l.x - opPos.x, y: l.y - opPos.y };
    let sc;
    if (kx && ky) sc = (d.x * v.x + d.y * v.y) / (v.x * v.x + v.y * v.y); // canto: proporção pela diagonal
    else if (kx) sc = d.x / v.x;                                         // borda lateral
    else sc = d.y / v.y;                                                 // borda de cima ou de baixo
    const novaEscala = Math.min(5, Math.max(0.1, e0 * sc));
    const s2 = novaEscala / e0;
    // a alça oposta fica no mesmo ponto do mundo
    const ancora = mundoDe({ x: a.base.x, y: a.base.y, rot: a.base.rot }, opPos.x, opPos.y);
    const r = mundoDe({ x: 0, y: 0, rot: a.base.rot }, opPos.x * s2, opPos.y * s2);
    p.escala = novaEscala; p.x = limitar(ancora.x - r.x, m.largura * CEL); p.y = limitar(ancora.y - r.y, m.altura * CEL);
  }
  // barra de opções: fica acima da peça selecionada, dentro da área de desenho
  function atualizarBarra() {
    const barra = el.querySelector('#eBarra'); const p = sel();
    if (!p || S.arrastando?.tipo === 'escalar') { barra.style.display = 'none'; return; }
    const { h } = dimensoes(p);
    const cw = tela.clientWidth; const ch = tela.clientHeight;
    const sx = cw / 2 + (p.x - S.cam.x) * S.cam.z; const sy = ch / 2 + (p.y - h - S.cam.y) * S.cam.z;
    barra.style.display = 'flex';
    const bw = barra.offsetWidth; const bh = barra.offsetHeight;
    barra.style.left = Math.max(4, Math.min(cw - bw - 4, sx - bw / 2)) + 'px';
    barra.style.top = Math.max(4, Math.min(ch - bh - 4, sy - bh - 58 * S.cam.z)) + 'px';
  }

  // peças por camada (z), a de cima primeiro para o clique; empate: a última colocada fica por cima
  const porCamada = () => m.itens.map((p, i) => ({ p, i })).sort((a, b) => (a.p.z || 0) - (b.p.z || 0) || a.i - b.i).map((x) => x.p);
  function itemNoPonto(q) {
    const lista = porCamada().reverse();
    for (const p of lista) {
      const { it, w, h } = dimensoes(p); if (!it) continue;
      const l = localDe(p, q);
      if (Math.abs(l.x) <= w / 2 && l.y >= -h && l.y <= 0) return p;
    }
    return null;
  }

  function desenhar() {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#1b1f2a'; g.fillRect(0, 0, tela.clientWidth, tela.clientHeight);
    g.save();
    g.translate(tela.clientWidth / 2, tela.clientHeight / 2); g.scale(S.cam.z, S.cam.z); g.translate(-S.cam.x, -S.cam.y);
    // chão: a grama em todas as células, depois o terreno pintado
    const base = img(porChave.get(GRAMA)?.arquivo || '');
    for (let y = 0; y < m.altura; y++) for (let x = 0; x < m.largura; x++) {
      const k = chaoDe(x, y); const it = porChave.get(k);
      const im = k === GRAMA ? base : img(it?.arquivo || '');
      if (im.complete && im.naturalWidth) g.drawImage(im, x * CEL, y * CEL, CEL, CEL);
      else g.fillStyle = '#4f8f3a', g.fillRect(x * CEL, y * CEL, CEL, CEL);
    }
    if (S.grade) { g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 1 / S.cam.z; for (let x = 0; x <= m.largura; x++) { g.beginPath(); g.moveTo(x * CEL, 0); g.lineTo(x * CEL, m.altura * CEL); g.stroke(); } for (let y = 0; y <= m.altura; y++) { g.beginPath(); g.moveTo(0, y * CEL); g.lineTo(m.largura * CEL, y * CEL); g.stroke(); } }
    // peças, por camada
    for (const p of porCamada()) {
      const { it, w, h } = dimensoes(p); if (!it) continue;
      const im = img(it.arquivo);
      g.save(); g.translate(p.x, p.y); g.rotate(rad(p.rot || 0)); if (p.espelho) g.scale(-1, 1);
      if (im.complete && im.naturalWidth) g.drawImage(im, -w / 2, -h, w, h); else { g.fillStyle = '#c084fc'; g.fillRect(-8, -8, 16, 16); }
      g.restore();
    }
    // seleção: contorno, alça de girar no topo e 8 alças nas bordas e cantos (redimensionam pela borda)
    const p = sel();
    if (p) {
      const { w, h } = dimensoes(p); const z = zoomHandle();
      g.save(); g.translate(p.x, p.y); g.rotate(rad(p.rot || 0));
      g.strokeStyle = '#f2c94c'; g.lineWidth = 2 * z; g.strokeRect(-w / 2, -h, w, h);
      g.beginPath(); g.moveTo(0, -h); g.lineTo(0, -h - 30 * z); g.stroke();
      g.beginPath(); g.arc(0, -h - 30 * z, 6 * z, 0, Math.PI * 2); g.fillStyle = '#f2c94c'; g.fill();
      g.fillStyle = '#fff'; g.strokeStyle = '#111827'; g.lineWidth = 1 * z;
      for (const k of ALCAS) { const ps = posAlca(k, w, h); g.fillRect(ps.x - 5 * z, ps.y - 5 * z, 10 * z, 10 * z); g.strokeRect(ps.x - 5 * z, ps.y - 5 * z, 10 * z, 10 * z); }
      g.restore();
    }
    atualizarBarra();
    g.restore();
  }

  const marcar = () => { m.sujo = true; S.sujo = true; el.querySelector('#eEstado').textContent = 'Alterações não salvas'; };
  function registrar() {
    hist.passado.push(JSON.stringify({ celulas: m.celulas, itens: m.itens }));
    if (hist.passado.length > HIST_MAX) hist.passado.shift();
    hist.futuro = []; atualizarBotoes();
  }
  function restaurar(foto) {
    const f = JSON.parse(foto); m.celulas = f.celulas; m.itens = f.itens;
    if (!m.itens.some((p) => p.id === S.sel)) S.sel = null;
    marcar(); desenhar(); mostrarProp();
  }
  function desfazer() {
    if (!hist.passado.length) return;
    hist.futuro.push(JSON.stringify({ celulas: m.celulas, itens: m.itens }));
    restaurar(hist.passado.pop()); atualizarBotoes();
  }
  function refazer() {
    if (!hist.futuro.length) return;
    hist.passado.push(JSON.stringify({ celulas: m.celulas, itens: m.itens }));
    restaurar(hist.futuro.pop()); atualizarBotoes();
  }
  function atualizarBotoes() {
    el.querySelector('#eDesfazer').disabled = !hist.passado.length;
    el.querySelector('#eRefazer').disabled = !hist.futuro.length;
  }

  // ações sobre peças (usadas pelo painel e pelos atalhos)
  function colocar(q) {
    if (!S.chave) return;
    const it = porChave.get(S.chave); if (!it || it.categoria === 'terreno') return;
    registrar();
    const [x, y] = encaixe(q.x, q.y);
    const p = { id: crypto.randomUUID(), chave: S.chave, x: limitar(x, m.largura * CEL), y: limitar(y, m.altura * CEL), rot: 0, escala: 1, espelho: false, z: 0, dados: it.categoria === 'personagens' ? { nome: it.nome } : {} };
    m.itens.push(p); S.sel = p.id; marcar(); desenhar(); mostrarProp();
  }
  function apagar(p) { registrar(); m.itens = m.itens.filter((x) => x !== p); if (S.sel === p.id) S.sel = null; marcar(); desenhar(); mostrarProp(); }
  function duplicar(p) {
    registrar();
    const c = { ...p, id: crypto.randomUUID(), x: limitar(p.x + CEL, m.largura * CEL), y: limitar(p.y + CEL, m.altura * CEL), dados: { ...(p.dados || {}) } };
    m.itens.push(c); S.sel = c.id; marcar(); desenhar(); mostrarProp();
  }
  function copiar(p) { clip = { ...p, dados: { ...(p.dados || {}) } }; toast('Copiado', 'Ctrl+V cola no ponto do cursor.', 'info'); }
  function colar() {
    if (!clip) return;
    registrar();
    const [x, y] = S.mouse ? encaixe(S.mouse.x, S.mouse.y) : [clip.x + CEL, clip.y + CEL];
    const c = { ...clip, id: crypto.randomUUID(), x: limitar(x, m.largura * CEL), y: limitar(y, m.altura * CEL), dados: { ...(clip.dados || {}) } };
    m.itens.push(c); S.sel = c.id; marcar(); desenhar(); mostrarProp();
  }
  function girar(p, graus) { registrar(); p.rot = (((p.rot || 0) + graus) % 360 + 360) % 360; marcar(); desenhar(); mostrarProp(); }
  function espelhar(p) { registrar(); p.espelho = !p.espelho; marcar(); desenhar(); mostrarProp(); }
  function camada(p, delta) { registrar(); p.z = Math.max(-999, Math.min(999, (p.z || 0) + delta)); marcar(); desenhar(); mostrarProp(); }
  function mover(p, dx, dy) { registrar(); p.x = limitar(p.x + dx, m.largura * CEL); p.y = limitar(p.y + dy, m.altura * CEL); marcar(); desenhar(); mostrarProp(); }

  // ferramentas no clique
  function aplicarFerramenta(q, primeiro) {
    const [cx, cy] = celulaDe(q);
    if (S.ferr === 'pintar') {
      if (cx < 0 || cy < 0 || cx >= m.largura || cy >= m.altura) return;
      if (!S.chave || porChave.get(S.chave)?.categoria !== 'terreno') return;
      if (primeiro) registrar();
      m.celulas[`${cx},${cy}`] = S.chave; marcar(); return;
    }
    if (S.ferr === 'apagar') {
      const p = itemNoPonto(q);
      if (p && primeiro) { apagar(p); return; }
      if (cx >= 0 && cy >= 0 && cx < m.largura && cy < m.altura) { if (primeiro) registrar(); delete m.celulas[`${cx},${cy}`]; marcar(); desenhar(); }
      return;
    }
    if (S.ferr === 'mover') {
      const p = itemNoPonto(q);
      if (p) { S.sel = p.id; registrar(); S.arrastando = { tipo: 'mover', id: p.id, dx: q.x - p.x, dy: q.y - p.y }; }
      else S.sel = null;
      mostrarProp(); desenhar();
      return;
    }
    if (S.ferr === 'item' && primeiro) {
      const p = itemNoPonto(q);
      if (p && !S.chave) { S.sel = p.id; mostrarProp(); desenhar(); return; }
      colocar(q);
    }
  }

  function mostrarProp() {
    const box = el.querySelector('#eProp');
    const p = sel();
    if (!p) {
      box.innerHTML = `<p>Nada selecionado.</p><p>Escolha uma peça na paleta e clique na grade para colocar. Com <b>Selecionar</b>, clique numa peça para editá-la.</p>
        <p style="margin-top:10px"><b>Atalhos</b><br>R gira 90° (Shift+R, −90°) · F espelha · setas movem (Shift: 1 célula) · [ ] camada · Ctrl+D duplica · Ctrl+C e Ctrl+V copiam e colam · Ctrl+Z desfaz · Ctrl+Y refaz · Delete apaga · Esc desmarca</p>`;
      return;
    }
    const { it, w, h } = dimensoes(p);
    const pct = Math.round((p.escala || 1) * 100);
    const rot = Math.round((p.rot || 0) * 10) / 10;
    const estab = it.categoria === 'construcoes' || it.categoria === 'objetos';
    box.innerHTML = `<b>${esc(it.nome)}</b> <span class="muted">· ${esc(NOMES_CAT[it.categoria] || it.categoria)}</span>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px">
        <label>X<input class="input" id="pX" type="number" value="${Math.round(p.x)}"></label>
        <label>Y<input class="input" id="pY" type="number" value="${Math.round(p.y)}"></label>
      </div>
      <div style="margin-top:10px"><b>Tamanho</b></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:4px">
        <label>Largura (px)<input class="input" id="pL" type="number" min="4" value="${Math.round(w)}"></label>
        <label>Altura (px)<input class="input" id="pA" type="number" value="${Math.round(h)}" disabled title="Acompanha a largura (mantém a proporção)"></label>
      </div>
      <label style="display:block;margin-top:6px">Escala <span id="pEV">${pct}%</span><input type="range" id="pE" min="10" max="500" value="${pct}" style="width:100%"></label>
      <div style="margin-top:10px"><b>Rotação</b></div>
      <div class="row" style="gap:6px;align-items:center;margin-top:4px">
        <input class="input" id="pR" type="number" min="0" max="359.9" step="1" value="${rot}" style="width:86px"><span>°</span>
        <button class="btn sm" id="pRm" title="−90°">−90</button><button class="btn sm" id="pRp" title="+90°">+90</button><button class="btn sm" id="pR0" title="0°">0</button>
      </div>
      <input type="range" id="pRr" min="0" max="359" value="${Math.round(rot) % 360}" style="width:100%;margin-top:4px">
      <div class="row" style="gap:6px;margin-top:10px"><button class="btn sm ${p.espelho ? 'primary' : ''}" id="pEsp">${p.espelho ? '⇋ Espelhado' : '⇋ Espelhar'}</button></div>
      <div style="margin-top:10px"><b>Camada</b> <span class="muted">(${p.z || 0})</span></div>
      <div class="row" style="gap:6px;margin-top:4px"><button class="btn sm" id="pZm">Para trás</button><button class="btn sm" id="pZp">Para frente</button></div>
      ${estab ? `<label style="display:block;margin-top:10px">Abre como<select class="input" id="pRota"><option value="">—</option>${ROTAS.map((r) => `<option value="${r}" ${p.dados?.rota === r ? 'selected' : ''}>${r}</option>`).join('')}</select></label>` : ''}
      <label style="display:block;margin-top:8px">Nome (personagem ou estabelecimento)<input class="input" id="pNome" value="${esc(p.dados?.nome || '')}" maxlength="60"></label>
      <div class="row" style="gap:6px;margin-top:10px;flex-wrap:wrap"><button class="btn sm" id="pDup">Duplicar</button><button class="btn sm" id="pCop">Copiar</button><button class="btn sm" id="pApagar">Apagar</button></div>
      <div style="font-size:11px;margin-top:8px">x ${Math.round(p.x)}, y ${Math.round(p.y)}</div>`;

    // valores que mudam vários a cada digitação: uma ação de desfazer por edição
    const vivo = (input, aplicar) => {
      let reg = false;
      input.oninput = () => { if (!reg) { registrar(); reg = true; } aplicar(input); marcar(); desenhar(); };
      input.onchange = () => { reg = false; mostrarProp(); };
    };
    vivo(box.querySelector('#pX'), (i) => { p.x = limitar(Number(i.value) || 0, m.largura * CEL); });
    vivo(box.querySelector('#pY'), (i) => { p.y = limitar(Number(i.value) || 0, m.altura * CEL); });
    vivo(box.querySelector('#pL'), (i) => { const nw = Math.max(4, Number(i.value) || 4); p.escala = Math.min(5, Math.max(0.1, nw / it.w)); });
    vivo(box.querySelector('#pE'), (i) => { p.escala = Number(i.value) / 100; box.querySelector('#pEV').textContent = `${Math.round(p.escala * 100)}%`; });
    vivo(box.querySelector('#pR'), (i) => { p.rot = (((Number(i.value) || 0) % 360) + 360) % 360; });
    vivo(box.querySelector('#pRr'), (i) => { p.rot = Number(i.value); });
    box.querySelector('#pRm').onclick = () => girar(p, -90);
    box.querySelector('#pRp').onclick = () => girar(p, 90);
    box.querySelector('#pR0').onclick = () => { registrar(); p.rot = 0; marcar(); desenhar(); mostrarProp(); };
    box.querySelector('#pEsp').onclick = () => espelhar(p);
    box.querySelector('#pZm').onclick = () => camada(p, -1);
    box.querySelector('#pZp').onclick = () => camada(p, 1);
    box.querySelector('#pNome').oninput = (e) => { p.dados = { ...(p.dados || {}), nome: e.target.value }; marcar(); };
    const r = box.querySelector('#pRota'); if (r) r.onchange = (e) => { p.dados = { ...(p.dados || {}), rota: e.target.value }; marcar(); };
    box.querySelector('#pDup').onclick = () => duplicar(p);
    box.querySelector('#pCop').onclick = () => copiar(p);
    box.querySelector('#pApagar').onclick = () => apagar(p);
  }

  function paleta() {
    const lista = itens.filter((i) => i.categoria === S.cat);
    el.querySelector('#ePaleta').innerHTML = lista.map((i) => `<button data-chave="${esc(i.chave)}" title="${esc(i.nome)}" style="border:2px solid ${S.chave === i.chave ? '#f2c94c' : 'transparent'};background:#111827;border-radius:8px;padding:4px;cursor:pointer;height:72px;display:flex;align-items:center;justify-content:center"><img src="${esc(i.arquivo)}" style="max-width:100%;max-height:64px;image-rendering:pixelated"></button>`).join('');
    el.querySelectorAll('#ePaleta [data-chave]').forEach((b) => { b.onclick = () => { S.chave = b.dataset.chave; if (porChave.get(S.chave).categoria === 'terreno') S.ferr = 'pintar'; el.querySelectorAll('[data-ferr]').forEach((x) => x.classList.toggle('primary', x.dataset.ferr === S.ferr)); paleta(); }; });
    el.querySelectorAll('[data-cat]').forEach((b) => b.classList.toggle('primary', b.dataset.cat === S.cat));
  }

  // expansão: acrescenta grama na borda; esquerda e cima deslocam tudo
  function expandir(lado) {
    if (m.largura >= 120 && (lado === 'esq' || lado === 'dir')) return toast('Limite', 'O mapa chegou ao tamanho máximo.', 'warning');
    if (m.altura >= 120 && (lado === 'cima' || lado === 'baixo')) return toast('Limite', 'O mapa chegou ao tamanho máximo.', 'warning');
    registrar();
    const dx = lado === 'esq' ? 4 : 0; const dy = lado === 'cima' ? 4 : 0;
    if (dx || dy) {
      const novos = {}; for (const [k, v] of Object.entries(m.celulas)) { const [x, y] = k.split(',').map(Number); novos[`${x + dx},${y + dy}`] = v; }
      m.celulas = novos; for (const p of m.itens) { p.x += dx * CEL; p.y += dy * CEL; }
      S.cam.x += dx * CEL; S.cam.y += dy * CEL;
    }
    if (lado === 'esq' || lado === 'dir') m.largura += 4; else m.altura += 4;
    marcar(); desenhar();
  }

  async function salvar() {
    const celulas = {}; for (const [k, v] of Object.entries(m.celulas)) if (v !== GRAMA) celulas[k] = v;
    try {
      el.querySelector('#eEstado').textContent = 'Salvando…';
      const r = await api.put(`/mapas/${m.id}`, { nome: el.querySelector('#eNome').value, largura: m.largura, altura: m.altura, celulas, itens: m.itens });
      m.sujo = false; S.sujo = false; el.querySelector('#eEstado').textContent = `Salvo às ${new Date(r.atualizado).toLocaleTimeString('pt-BR')}`;
      return true;
    } catch (err) { el.querySelector('#eEstado').textContent = 'Não salvou: ' + (err.message || 'erro'); return false; }
  }

  // eventos da tela
  tela.addEventListener('contextmenu', (e) => e.preventDefault());
  tela.addEventListener('pointerdown', (e) => {
    tela.setPointerCapture(e.pointerId);
    const q = mundoDeTela(e.clientX, e.clientY); S.mouse = q;
    const p = sel();
    const umaFerramentaDeEdicao = S.ferr !== 'pintar' && S.ferr !== 'apagar';
    // alças da peça selecionada: girar (topo) e redimensionar (bordas e cantos)
    if (p && umaFerramentaDeEdicao && (e.button === 0 || e.button === 2)) {
      const { w, h } = dimensoes(p); const z = zoomHandle();
      const base = { x: p.x, y: p.y, rot: p.rot || 0, escala: p.escala || 1 };
      if (distancia(q, mundoDe(p, 0, -h - 30 * z)) <= 10 * z) { S.arrastando = { tipo: 'girar', id: p.id, reg: false }; return; }
      const alca = ALCAS.find((k) => distancia(q, mundoDe(p, posAlca(k, w, h).x, posAlca(k, w, h).y)) <= 9 * z);
      if (alca) { S.arrastando = { tipo: 'escalar', id: p.id, alca, base, reg: false }; return; }
    }
    // peça debaixo do cursor: segurar move (botão esquerdo nas ferramentas Colocar e Selecionar; botão direito em qualquer uma)
    const alvo = itemNoPonto(q);
    if (alvo && umaFerramentaDeEdicao && (e.button === 2 || (e.button === 0 && (S.ferr === 'item' || S.ferr === 'mover')))) {
      S.sel = alvo.id; S.arrastando = { tipo: 'mover', id: alvo.id, dx: q.x - alvo.x, dy: q.y - alvo.y, reg: false };
      tela.style.cursor = 'move'; mostrarProp(); desenhar(); return;
    }
    // botão do meio, ou direito em área vazia: mão para mover o mapa
    if (e.button === 1 || e.button === 2) { S.pan = { x: e.clientX, y: e.clientY, cx: S.cam.x, cy: S.cam.y }; tela.style.cursor = 'grabbing'; return; }
    aplicarFerramenta(q, true); desenhar();
  });
  tela.addEventListener('pointermove', (e) => {
    if (S.pan) { S.cam.x = S.pan.cx - (e.clientX - S.pan.x) / S.cam.z; S.cam.y = S.pan.cy - (e.clientY - S.pan.y) / S.cam.z; desenhar(); return; }
    const q = mundoDeTela(e.clientX, e.clientY); S.mouse = q;
    if (e.buttons === 0) { // só o cursor: mostra o que o clique vai fazer
      tela.style.cursor = itemNoPonto(q) ? 'move' : 'default';
      return;
    }
    if (e.buttons !== 1 && e.buttons !== 2) return;
    if (S.arrastando) {
      const a = S.arrastando; const p = m.itens.find((x) => x.id === a.id); if (!p) return;
      if (!a.reg) { registrar(); a.reg = true; } // a primeira mudança guarda o estado anterior no Desfazer
      if (a.tipo === 'mover') { const [x, y] = encaixe(q.x - a.dx, q.y - a.dy); p.x = limitar(x, m.largura * CEL); p.y = limitar(y, m.altura * CEL); }
      else if (a.tipo === 'girar') {
        let ang = Math.atan2(q.y - p.y, q.x - p.x) * 180 / Math.PI + 90; ang = (ang % 360 + 360) % 360;
        if (S.snap || e.shiftKey) ang = Math.round(ang / 15) * 15;
        p.rot = Math.round((ang % 360) * 10) / 10;
      } else if (a.tipo === 'escalar') redimensionar(p, a, q);
      marcar(); desenhar(); mostrarProp(); return;
    }
    if (S.ferr === 'pintar' || S.ferr === 'apagar') aplicarFerramenta(q, false);
    desenhar();
  });
  tela.addEventListener('pointerup', () => { S.pan = null; S.arrastando = null; tela.style.cursor = 'default'; desenhar(); });
  tela.addEventListener('wheel', (e) => { e.preventDefault(); S.cam.z = Math.max(0.25, Math.min(3, S.cam.z * (e.deltaY < 0 ? 1.1 : 0.9))); desenhar(); }, { passive: false });
  el.querySelectorAll('[data-ferr]').forEach((b) => { b.onclick = () => { S.ferr = b.dataset.ferr; el.querySelectorAll('[data-ferr]').forEach((x) => x.classList.toggle('primary', x === b)); }; });
  el.querySelectorAll('[data-cat]').forEach((b) => { b.onclick = () => { S.cat = b.dataset.cat; paleta(); }; });
  el.querySelectorAll('[data-exp]').forEach((b) => { b.onclick = () => expandir(b.dataset.exp); });
  el.querySelector('#eGrade').onclick = () => { S.grade = !S.grade; desenhar(); };
  el.querySelector('#eIma').onclick = (e) => { S.snap = !S.snap; e.currentTarget.classList.toggle('primary', S.snap); toast('Ímã', S.snap ? 'Peças encaixam na grade fina.' : 'Posição livre.', 'info'); };
  el.querySelector('#eDesfazer').onclick = desfazer;
  el.querySelector('#eRefazer').onclick = refazer;
  el.querySelector('#eSalvar').onclick = salvar;
  el.querySelector('#eNome').oninput = marcar;
  el.querySelector('#eVida').onclick = async () => {
    if (S.sujo && !(await salvar())) return;
    await api.post(`/mapas/${m.id}/vida`, {});
    toast('Mapa do jogo', 'Este mapa agora roda no jogo. Abra o Mapa.', 'success');
  };
  const teclas = (e) => {
    if (!el.isConnected) { window.removeEventListener('keydown', teclas); return; }
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
    const ctrl = e.ctrlKey || e.metaKey; const k = e.key.toLowerCase();
    if (ctrl) {
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); desfazer(); return; }
      if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); refazer(); return; }
      if (k === 'c') { const p = sel(); if (p) copiar(p); e.preventDefault(); return; }
      if (k === 'v') { e.preventDefault(); colar(); return; }
      if (k === 'd') { const p = sel(); if (p) { e.preventDefault(); duplicar(p); } return; }
      return;
    }
    if (k === 'escape') { S.sel = null; mostrarProp(); desenhar(); return; }
    const p = sel();
    if ((k === 'delete' || k === 'backspace') && p) { e.preventDefault(); apagar(p); return; }
    if (!p) return;
    if (k === 'r') { e.preventDefault(); girar(p, e.shiftKey ? -90 : 90); return; }
    if (k === 'f') { espelhar(p); return; }
    if (k === '[') { camada(p, -1); return; }
    if (k === ']') { camada(p, 1); return; }
    const passo = e.shiftKey ? CEL : PASSO;
    const setas = { arrowleft: [-passo, 0], arrowright: [passo, 0], arrowup: [0, -passo], arrowdown: [0, passo] }[k];
    if (setas) { e.preventDefault(); mover(p, setas[0], setas[1]); }
  };
  window.addEventListener('keydown', teclas);
  el.querySelector('#eIma').classList.toggle('primary', S.snap);
  atualizarBotoes();
  el.querySelectorAll('#eBarra [data-b]').forEach((b) => { b.onclick = () => {
    const p = sel(); if (!p) return;
    const acao = { dup: () => duplicar(p), cop: () => copiar(p), tras: () => camada(p, -1), frente: () => camada(p, 1), gira: () => girar(p, 90), esp: () => espelhar(p), apaga: () => apagar(p) }[b.dataset.b];
    acao();
  }; });
  paleta(); mostrarProp(); ajustar();
  setInterval(() => { if (el.isConnected && S.sujo) salvar(); }, 20000);
}
