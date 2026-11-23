// CRIAR MAPA: editor do seu próprio mundo. Todo mapa começa com a grama (célula por célula) e só recebe o que está
// no inventário: terreno pintado nas células, e construções, objetos, veículos, aeronaves e personagens como itens.
// Expandir acrescenta grama na borda escolhida. "Vida" torna este mapa o mapa do jogo.
import { api } from '../api.js';
import { esc, toast } from '../ui.js';

const CEL = 32;
const ROTAS = ['#/mapa', '#/mercado', '#/banco', '#/veiculos', '#/policia', '#/hospital', '#/justica', '#/governo', '#/empregos', '#/diversao', '#/locadora', '#/construtora'];
const NOMES_CAT = { terreno: 'Terreno', construcoes: 'Construções', objetos: 'Objetos', vegetacao: 'Vegetação', relevo: 'Relevo', veiculos: 'Veículos', aeronaves: 'Aeronaves', '3d': '3D', personagens: 'Personagens' };
const GRAMA = 'terreno/grama-base';

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
    <p class="muted">Monte o seu mundo peça por peça, com o inventário de assets. Quando estiver pronto, toque em <b>Vida</b> para o jogo rodar nele.</p>
    <div class="row" style="gap:8px"><input class="input" id="mNome" placeholder="Nome do mapa" maxlength="60" style="max-width:260px"><button class="btn primary" id="mNovo">Novo mapa</button></div>
    <div style="display:grid;gap:8px;margin-top:14px">${mapas.map((m) => `<div class="card" style="padding:10px;display:flex;gap:10px;align-items:center;justify-content:space-between">
      <div><b>${esc(m.nome)}</b> ${vida === m.id ? '<span class="chip">Vida ativa</span>' : ''}<div class="muted" style="font-size:12px">${m.largura}×${m.altura} células · ${m.itens} itens</div></div>
      <div class="row" style="gap:6px"><a class="btn sm" href="#/criar-mapa?id=${m.id}">Editar</a><button class="btn sm" data-del="${m.id}">Apagar</button></div></div>`).join('') || '<p class="muted">Nenhum mapa ainda.</p>'}</div>
    <p style="margin-top:12px"><a href="#/configuracoes">← Configurações</a></p></section>`;
  el.querySelector('#mNovo').onclick = async () => {
    const nome = el.querySelector('#mNome').value.trim() || 'Meu mapa';
    const m = await api.post('/mapas', { nome }); location.hash = `#/criar-mapa?id=${m.id}`;
  };
  el.querySelectorAll('[data-del]').forEach((b) => { b.onclick = async () => { if (!confirm('Apagar este mapa?')) return; await api.del(`/mapas/${b.dataset.del}`); listar(el); }; });
}

function editor(el, mapa, itens) {
  const porChave = new Map(itens.map((i) => [i.chave, i]));
  const imgs = new Map();
  const img = (arq) => { if (!imgs.has(arq)) { const i = new Image(); i.src = arq; imgs.set(arq, i); } return imgs.get(arq); };
  // estado: células como {"x,y": chave}; grama é o padrão e não aparece
  const m = { id: mapa.id, nome: mapa.nome, largura: mapa.largura, altura: mapa.altura, celulas: { ...mapa.celulas }, itens: mapa.itens.map((i) => ({ ...i, dados: { ...(i.dados || {}) } })) };
  const S = { cat: 'construcoes', chave: null, ferr: 'item', sel: null, cam: { x: m.largura * CEL / 2, y: m.altura * CEL / 2, z: 0.8 }, grade: true, sujo: false, arrastando: null, pan: null };

  el.innerHTML = `<section class="card" style="padding:12px">
    <div class="row" style="gap:8px;align-items:center;flex-wrap:wrap">
      <a href="#/criar-mapa">← Mapas</a>
      <input class="input" id="eNome" value="${esc(m.nome)}" maxlength="60" style="max-width:220px">
      <button class="btn" id="eSalvar">Salvar</button><span id="eEstado" class="muted" style="font-size:12px"></span>
      <button class="btn primary" id="eVida" style="margin-left:auto">Vida ▶</button>
    </div>
    <div style="display:grid;grid-template-columns:260px 1fr 240px;gap:10px;margin-top:10px;min-height:560px">
      <div>
        <div class="row" id="eCats" style="gap:4px;flex-wrap:wrap">${Object.keys(NOMES_CAT).map((c) => `<button class="btn sm" data-cat="${c}">${NOMES_CAT[c]}</button>`).join('')}</div>
        <div id="ePaleta" style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin-top:8px;max-height:480px;overflow:auto"></div>
        <div class="row" style="gap:4px;margin-top:8px;flex-wrap:wrap">
          <button class="btn sm" data-ferr="item">Colocar</button><button class="btn sm" data-ferr="pintar">Pintar chão</button>
          <button class="btn sm" data-ferr="mover">Mover</button><button class="btn sm" data-ferr="apagar">Apagar</button>
          <button class="btn sm" id="eGrade">Grade</button></div>
        <div class="row" style="gap:4px;margin-top:8px;flex-wrap:wrap"><span class="muted" style="font-size:12px;width:100%">Expandir:</span>
          <button class="btn sm" data-exp="esq">← Esq.</button><button class="btn sm" data-exp="dir">Dir. →</button><button class="btn sm" data-exp="cima">↑ Cima</button><button class="btn sm" data-exp="baixo">Baixo ↓</button></div>
      </div>
      <canvas id="eTela" style="width:100%;height:560px;background:#1b1f2a;border-radius:10px;touch-action:none"></canvas>
      <div id="eProp" class="muted" style="font-size:13px"></div>
    </div>
    <p class="muted" style="font-size:12px;margin-top:8px">Clique para colocar ou pintar. Arraste com o botão do meio ou direito para mover a visão. Roda com a roda. R gira a peça selecionada; Delete a apaga.</p>
  </section>`;

  const tela = el.querySelector('#eTela'); const g = tela.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  function ajustar() { tela.width = tela.clientWidth * dpr; tela.height = tela.clientHeight * dpr; desenhar(); }
  const aoRedimensionar = () => { if (!el.isConnected) return; ajustar(); };
  window.addEventListener('resize', aoRedimensionar);

  const mundoDeTela = (sx, sy) => { const r = tela.getBoundingClientRect(); return { x: (sx - r.left - r.width / 2) / S.cam.z + S.cam.x, y: (sy - r.top - r.height / 2) / S.cam.z + S.cam.y }; };
  const celulaDe = (p) => [Math.floor(p.x / CEL), Math.floor(p.y / CEL)];
  const chaoDe = (x, y) => m.celulas[`${x},${y}`] || GRAMA;

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
    // itens
    for (const p of m.itens) {
      const it = porChave.get(p.chave); if (!it) continue;
      const im = img(it.arquivo); const w = it.w; const h = it.h;
      g.save(); g.translate(p.x, p.y); g.rotate((p.rot || 0) * Math.PI / 180);
      if (im.complete && im.naturalWidth) g.drawImage(im, -w / 2, -h, w, h); else { g.fillStyle = '#c084fc'; g.fillRect(-8, -8, 16, 16); }
      g.restore();
      if (S.sel === p.id) { g.strokeStyle = '#f2c94c'; g.lineWidth = 2 / S.cam.z; g.strokeRect(p.x - w / 2, p.y - h, w, h); }
    }
    g.restore();
  }

  const itemNoPonto = (q) => { for (let i = m.itens.length - 1; i >= 0; i--) { const p = m.itens[i]; const it = porChave.get(p.chave); if (!it) continue; if (q.x >= p.x - it.w / 2 && q.x <= p.x + it.w / 2 && q.y >= p.y - it.h && q.y <= p.y) return p; } return null; };
  const marcar = () => { m.sujo = true; S.sujo = true; el.querySelector('#eEstado').textContent = 'Alterações não salvas'; };

  function aplicarFerramenta(q, primeiro) {
    const [cx, cy] = celulaDe(q);
    if (S.ferr === 'pintar') {
      if (cx < 0 || cy < 0 || cx >= m.largura || cy >= m.altura) return;
      if (S.chave && porChave.get(S.chave)?.categoria === 'terreno') { m.celulas[`${cx},${cy}`] = S.chave; marcar(); }
      return;
    }
    if (S.ferr === 'apagar') {
      const p = itemNoPonto(q);
      if (p) { m.itens = m.itens.filter((x) => x !== p); if (S.sel === p.id) S.sel = null; marcar(); }
      else if (cx >= 0 && cy >= 0 && cx < m.largura && cy < m.altura) { delete m.celulas[`${cx},${cy}`]; marcar(); }
      return;
    }
    if (S.ferr === 'mover') {
      const p = itemNoPonto(q); if (p) { S.sel = p.id; S.arrastando = { id: p.id, dx: q.x - p.x, dy: q.y - p.y }; mostrarProp(); }
      else S.sel = null;
      return;
    }
    if (S.ferr === 'item' && primeiro) {
      if (!S.chave) return;
      const it = porChave.get(S.chave); if (!it || it.categoria === 'terreno') return;
      const p = { id: crypto.randomUUID(), chave: S.chave, x: Math.round(q.x), y: Math.round(q.y), rot: 0, dados: it.categoria === 'personagens' ? { nome: it.nome } : {} };
      m.itens.push(p); S.sel = p.id; marcar(); mostrarProp(); desenhar();
    }
  }

  function mostrarProp() {
    const p = m.itens.find((x) => x.id === S.sel);
    const box = el.querySelector('#eProp');
    if (!p) { box.innerHTML = 'Nada selecionado.<br><br>Escolha uma peça na paleta e clique na grade.'; return; }
    const it = porChave.get(p.chave);
    const estab = it.categoria === 'construcoes' || it.categoria === 'objetos';
    box.innerHTML = `<b>${esc(it.nome)}</b><br>
      <label style="display:block;margin-top:8px">Nome (personagem ou estabelecimento)<input class="input" id="pNome" value="${esc(p.dados?.nome || '')}" maxlength="60"></label>
      ${estab ? `<label style="display:block;margin-top:8px">Abre como<select class="input" id="pRota"><option value="">—</option>${ROTAS.map((r) => `<option value="${r}" ${p.dados?.rota === r ? 'selected' : ''}>${r}</option>`).join('')}</select></label>` : ''}
      <div class="row" style="gap:6px;margin-top:8px"><button class="btn sm" id="pGirar">Girar (R)</button><button class="btn sm" id="pApagar">Apagar</button></div>
      <div style="font-size:11px;margin-top:8px">x ${Math.round(p.x)}, y ${Math.round(p.y)}</div>`;
    box.querySelector('#pNome').oninput = (e) => { p.dados = { ...(p.dados || {}), nome: e.target.value }; marcar(); };
    const r = box.querySelector('#pRota'); if (r) r.onchange = (e) => { p.dados = { ...(p.dados || {}), rota: e.target.value }; marcar(); };
    box.querySelector('#pGirar').onclick = () => girar();
    box.querySelector('#pApagar').onclick = () => { m.itens = m.itens.filter((x) => x.id !== p.id); S.sel = null; marcar(); mostrarProp(); desenhar(); };
  }
  function girar() { const p = m.itens.find((x) => x.id === S.sel); if (!p) return; p.rot = ((p.rot || 0) + 90) % 360; marcar(); desenhar(); }

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

  // eventos
  tela.addEventListener('contextmenu', (e) => e.preventDefault());
  tela.addEventListener('pointerdown', (e) => {
    tela.setPointerCapture(e.pointerId);
    if (e.button === 1 || e.button === 2) { S.pan = { x: e.clientX, y: e.clientY, cx: S.cam.x, cy: S.cam.y }; return; }
    const q = mundoDeTela(e.clientX, e.clientY);
    aplicarFerramenta(q, true); desenhar();
  });
  tela.addEventListener('pointermove', (e) => {
    if (S.pan) { S.cam.x = S.pan.cx - (e.clientX - S.pan.x) / S.cam.z; S.cam.y = S.pan.cy - (e.clientY - S.pan.y) / S.cam.z; desenhar(); return; }
    if (e.buttons !== 1) return;
    const q = mundoDeTela(e.clientX, e.clientY);
    if (S.arrastando) { const p = m.itens.find((x) => x.id === S.arrastando.id); if (p) { p.x = Math.round(q.x - S.arrastando.dx); p.y = Math.round(q.y - S.arrastando.dy); marcar(); desenhar(); } return; }
    if (S.ferr === 'pintar' || S.ferr === 'apagar') { aplicarFerramenta(q, false); desenhar(); }
  });
  tela.addEventListener('pointerup', () => { S.pan = null; S.arrastando = null; });
  tela.addEventListener('wheel', (e) => { e.preventDefault(); S.cam.z = Math.max(0.25, Math.min(3, S.cam.z * (e.deltaY < 0 ? 1.1 : 0.9))); desenhar(); }, { passive: false });
  el.querySelectorAll('[data-ferr]').forEach((b) => { b.onclick = () => { S.ferr = b.dataset.ferr; el.querySelectorAll('[data-ferr]').forEach((x) => x.classList.toggle('primary', x === b)); }; });
  el.querySelectorAll('[data-cat]').forEach((b) => { b.onclick = () => { S.cat = b.dataset.cat; paleta(); }; });
  el.querySelectorAll('[data-exp]').forEach((b) => { b.onclick = () => expandir(b.dataset.exp); });
  el.querySelector('#eGrade').onclick = () => { S.grade = !S.grade; desenhar(); };
  el.querySelector('#eSalvar').onclick = salvar;
  el.querySelector('#eNome').oninput = marcar;
  el.querySelector('#eVida').onclick = async () => {
    if (S.sujo && !(await salvar())) return;
    await api.post(`/mapas/${m.id}/vida`, {});
    toast('Vida', 'Este mapa é agora o mapa do jogo. Abra o Mapa para ver.', 'success');
  };
  const teclas = (e) => {
    if (!el.isConnected) { window.removeEventListener('keydown', teclas); return; }
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.key === 'r' || e.key === 'R') girar();
    if (e.key === 'Delete' || e.key === 'Backspace') { if (S.sel) { m.itens = m.itens.filter((x) => x.id !== S.sel); S.sel = null; marcar(); mostrarProp(); desenhar(); } }
  };
  window.addEventListener('keydown', teclas);
  paleta(); mostrarProp(); ajustar();
  setInterval(() => { if (el.isConnected && S.sujo) salvar(); }, 20000);
}
