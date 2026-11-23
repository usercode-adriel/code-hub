// STRUCTURE STUDIO: editor de montagem. Três painéis: biblioteca (esquerda), área de construção (centro), propriedades,
// camadas e verificação (direita). A lógica de encaixe, grupos, alinhamento e diagnóstico fica em montagem.js (testada sem navegador).
import { api } from '../api.js';
import { esc, toast } from '../ui.js';
import { PRESETS, GRADE, CATEGORIAS, CAMADAS, MATERIAIS, REQUER } from './presets.js';
import { criarBiblioteca } from './biblioteca.js';
import * as M from './montagem.js';

const HIST_MAX = 80;
const rad = (g) => g * Math.PI / 180;

export async function abrirEditor(el, id) {
  el.innerHTML = '<section class="card"><p>Carregando a estrutura…</p></section>';
  let est;
  try { est = await api.get(`/estudio/estruturas/${id}`); }
  catch (err) { el.innerHTML = `<section class="card"><p>${esc(err.message)}</p><a href="#/studio">← Studio</a></section>`; return; }
  // metadados dos componentes que a estrutura já usa (e das texturas aplicadas)
  const comps = new Map();
  const usados = [...new Set(est.componentes.flatMap((i) => [i.comp, i.textura].filter(Boolean)))];
  await Promise.all(usados.map(async (u) => { try { comps.set(u, await api.get(`/estudio/componentes/item?id=${encodeURIComponent(u)}`)); } catch { /* componente removido: o diagnóstico acusa */ } }));
  montar(el, est, comps);
}

function montar(el, est, comps) {
  const preset = PRESETS[est.preset];
  const compDe = (id) => comps.get(id);
  const S = {
    cam: { x: 0, y: 0, z: 1 }, grade: true, snap: true, pegadas: false, colisoes: false, sel: new Set(), ativo: null, aba: 'prop',
    ocultos: new Set(), travados: new Set(), pan: null, arrasto: null, faixa: null, fantasma: null, sujo: false, diag: [],
  };
  const hist = { passado: [], futuro: [] };
  let clip = null;

  el.innerHTML = `<section class="card" id="stCaixa" style="padding:12px">
    <div class="row" style="gap:8px;align-items:center;flex-wrap:wrap">
      <a href="#/studio">← Studio</a>
      <input class="input" id="stNome" value="${esc(est.nome)}" maxlength="60" style="max-width:240px">
      <span class="chip" title="${esc(preset.descricao)}">${esc(preset.nome)}</span>
      <button class="btn" id="stSalvar">Salvar</button><span class="muted" id="stEstado" style="font-size:12px"></span>
      <span style="margin-left:auto" class="row">
        <button class="btn sm" id="stDesfazer" title="Ctrl+Z">↶ Desfazer</button><button class="btn sm" id="stRefazer" title="Ctrl+Y">↷ Refazer</button>
        <button class="btn sm" id="stGrade">Grade</button><button class="btn sm" id="stIma" title="Encaixe na grade fina">Ímã</button>
        <button class="btn sm" id="stPegadas" title="Mostra a área ocupada no chão">Áreas</button><button class="btn sm" id="stColisoes" title="Mostra as caixas de colisão">Colisões</button>
        <button class="btn sm" id="stTelaCheia">⛶ Tela cheia</button></span>
    </div>
    <div style="display:grid;grid-template-columns:260px 1fr 290px;gap:10px;margin-top:10px">
      <aside id="stBiblioteca" style="min-width:0"></aside>
      <div style="position:relative;min-width:0">
        <canvas id="stTela" style="width:100%;height:600px;display:block;background:#1b1f2a;border-radius:10px;touch-action:none"></canvas>
        <div id="stDica" style="position:absolute;left:8px;top:8px;padding:4px 8px;border-radius:8px;background:rgba(17,24,39,.9);font-size:12px;display:none"></div>
      </div>
      <aside style="min-width:0;display:flex;flex-direction:column;gap:6px">
        <div class="row" id="stAbas" style="gap:4px"><button class="btn sm" data-aba="prop">Propriedades</button><button class="btn sm" data-aba="camadas">Camadas</button><button class="btn sm" data-aba="verificar" id="stAbaVerificar">Verificar</button></div>
        <div id="stProp" class="muted" style="font-size:13px;overflow:auto;max-height:690px"></div>
      </aside>
    </div></section>`;
  const $ = (s) => el.querySelector(s);
  const tela = $('#stTela'); const g = tela.getContext('2d'); const dpr = window.devicePixelRatio || 1;

  // ---------------------------------------------------------------- imagens (carregadas sob demanda) e variantes de cor/textura
  const imagens = new Map(); const variantes = new Map(); let quadro = 0;
  const pedirDesenho = () => { if (!quadro) quadro = requestAnimationFrame(() => { quadro = 0; desenhar(); }); };
  const imagem = (arq) => { if (!imagens.has(arq)) { const im = new Image(); im.onload = pedirDesenho; im.src = arq; imagens.set(arq, im); } return imagens.get(arq); };
  function fonte(c, i) {
    const im = imagem(c.arquivo); if (!im.complete || !im.naturalWidth) return null;
    if (!i.cor && !i.textura) return im;
    const chave = `${c.id}|${i.cor || ''}|${i.textura || ''}`;
    if (variantes.has(chave)) return variantes.get(chave);
    const cv = document.createElement('canvas'); cv.width = im.naturalWidth; cv.height = im.naturalHeight;
    const x = cv.getContext('2d'); x.drawImage(im, 0, 0); x.globalCompositeOperation = 'source-atop';
    let pronta = true;
    const tc = i.textura && compDe(i.textura);
    if (tc) { const ti = imagem(tc.arquivo); if (ti.complete && ti.naturalWidth) { x.globalAlpha = 0.55; x.fillStyle = x.createPattern(ti, 'repeat'); x.fillRect(0, 0, cv.width, cv.height); x.globalAlpha = 1; } else pronta = false; }
    if (i.cor) { x.globalAlpha = 0.4; x.fillStyle = i.cor; x.fillRect(0, 0, cv.width, cv.height); x.globalAlpha = 1; }
    if (pronta) variantes.set(chave, cv);
    return cv;
  }

  // ---------------------------------------------------------------- geometria da tela
  const W = () => est.area.w * GRADE; const H = () => est.area.h * GRADE;
  const mundoDe = (e) => { const r = tela.getBoundingClientRect(); return { x: (e.clientX - r.left - r.width / 2) / S.cam.z + S.cam.x, y: (e.clientY - r.top - r.height / 2) / S.cam.z + S.cam.y }; };
  const visiveis = () => est.componentes.filter((i) => !S.ocultos.has(i.id) && compDe(i.comp));
  const ctxEncaixe = () => ({ instancias: est.componentes, compDe, passo: S.snap ? M.PASSO : 1, raio: 48 });
  const unico = () => (S.sel.size === 1 ? est.componentes.find((i) => i.id === [...S.sel][0]) : null);
  // quadro da peça: origem no pé (x, y-z), girado; devolve o ponto no sistema local da peça
  const eixo = (i) => ({ x: i.x, y: i.y - (i.z || 0), rot: i.rot || 0 });
  function local(i, q) { const p = eixo(i); const r = -rad(p.rot); const dx = q.x - p.x; const dy = q.y - p.y; return { x: dx * Math.cos(r) - dy * Math.sin(r), y: dx * Math.sin(r) + dy * Math.cos(r) }; }
  function paraMundo(i, lx, ly) { const p = eixo(i); const t = rad(p.rot); return { x: p.x + lx * Math.cos(t) - ly * Math.sin(t), y: p.y + lx * Math.sin(t) + ly * Math.cos(t) }; }
  const caixa = (i) => { const c = compDe(i.comp); return { w: M.larguraVisual(i, c), h: M.alturaVisual(i, c) }; };
  function itemEm(q) {
    for (const i of M.ordemDeDesenho(visiveis()).reverse()) {
      if (S.travados.has(i.id)) continue;
      const { w, h } = caixa(i); const l = local(i, q);
      if (Math.abs(l.x) <= w / 2 && l.y >= -h && l.y <= 0) return i;
    }
    return null;
  }
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  // ---------------------------------------------------------------- desenho
  function ajustar() { tela.width = tela.clientWidth * dpr; tela.height = tela.clientHeight * dpr; desenhar(); }
  const aoRedimensionar = () => { if (!el.isConnected) { window.removeEventListener('resize', aoRedimensionar); return; } ajustar(); };
  window.addEventListener('resize', aoRedimensionar);
  const caber = () => { S.cam.x = W() / 2; S.cam.y = H() / 2; S.cam.z = Math.max(0.25, Math.min(1.5, (tela.clientWidth - 40) / W(), (tela.clientHeight - 40) / (H() + 60))); };

  function desenharInstancia(i, alpha = 1) {
    const c = compDe(i.comp); if (!c) return;
    const f = fonte(c, i); const w = c.w * i.escala; const h = c.h * i.escala; const n = M.eModular(c) ? Math.max(1, i.n || 1) : 1;
    g.save(); g.translate(i.x, i.y - (i.z || 0)); g.rotate(rad(i.rot || 0)); if (i.espelho) g.scale(-1, 1); g.globalAlpha = alpha;
    for (let k = 0; k < n; k++) {
      const dx = -w * n / 2 + k * w;
      if (f) g.drawImage(f, dx, -h, w + (k < n - 1 ? 0.6 : 0), h); else { g.fillStyle = '#334155'; g.fillRect(dx, -h, w, h); }
    }
    g.restore();
  }

  function desenhar() {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#1b1f2a'; g.fillRect(0, 0, tela.clientWidth, tela.clientHeight);
    g.save(); g.translate(tela.clientWidth / 2, tela.clientHeight / 2); g.scale(S.cam.z, S.cam.z); g.translate(-S.cam.x, -S.cam.y);
    g.fillStyle = '#242b3a'; g.fillRect(0, 0, W(), H());
    if (S.grade) {
      g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 1 / S.cam.z;
      for (let x = 0; x <= est.area.w; x++) { g.beginPath(); g.moveTo(x * GRADE, 0); g.lineTo(x * GRADE, H()); g.stroke(); }
      for (let y = 0; y <= est.area.h; y++) { g.beginPath(); g.moveTo(0, y * GRADE); g.lineTo(W(), y * GRADE); g.stroke(); }
    }
    g.strokeStyle = '#f2c94c'; g.lineWidth = 2 / S.cam.z; g.strokeRect(0, 0, W(), H());
    const ordem = M.ordemDeDesenho(visiveis());
    for (const i of ordem) desenharInstancia(i);
    const z = 1 / S.cam.z;
    // áreas ocupadas e colisões (opcionais)
    if (S.pegadas || S.colisoes) for (const i of ordem) {
      const c = compDe(i.comp);
      if (S.pegadas) { const p = M.pegada(i, c); g.strokeStyle = 'rgba(96,165,250,.8)'; g.lineWidth = z; g.strokeRect(p.x0, p.y0, p.w, p.d); }
      if (S.colisoes && i.colisao && c.colisao?.tipo === 'caixa') { const k = c.colisao; g.fillStyle = 'rgba(239,68,68,.28)'; g.strokeStyle = 'rgba(239,68,68,.9)'; g.lineWidth = z; g.fillRect(i.x + k.x * i.escala, i.y + k.y * i.escala, k.w * i.escala, k.h * i.escala); g.strokeRect(i.x + k.x * i.escala, i.y + k.y * i.escala, k.w * i.escala, k.h * i.escala); }
    }
    // marcas de erro (peça flutuando etc.)
    for (const p of S.diag) if (p.gravidade === 'erro') { const i = est.componentes.find((x) => x.id === p.id); if (!i) continue; g.fillStyle = '#ef4444'; g.beginPath(); g.arc(i.x, i.y - (i.z || 0) - 4 * z, 6 * z, 0, Math.PI * 2); g.fill(); g.fillStyle = '#fff'; g.font = `bold ${9 * z}px sans-serif`; g.textAlign = 'center'; g.fillText('!', i.x, i.y - (i.z || 0) - 1 * z); }
    // seleção
    for (const id of S.sel) {
      const i = est.componentes.find((x) => x.id === id); if (!i || !compDe(i.comp)) continue;
      const { w, h } = caixa(i);
      g.save(); const p = eixo(i); g.translate(p.x, p.y); g.rotate(rad(p.rot));
      g.strokeStyle = '#f2c94c'; g.lineWidth = 2 * z; g.strokeRect(-w / 2, -h, w, h);
      if (S.sel.size === 1) {
        g.beginPath(); g.moveTo(0, -h); g.lineTo(0, -h - 30 * z); g.stroke();
        g.beginPath(); g.arc(0, -h - 30 * z, 6 * z, 0, Math.PI * 2); g.fillStyle = '#f2c94c'; g.fill();
        g.fillStyle = '#fff'; g.strokeStyle = '#111827'; g.lineWidth = z;
        for (const [hx, hy] of [[-w / 2, -h], [w / 2, -h], [-w / 2, 0], [w / 2, 0]]) { g.fillRect(hx - 5 * z, hy - 5 * z, 10 * z, 10 * z); g.strokeRect(hx - 5 * z, hy - 5 * z, 10 * z, 10 * z); }
      }
      g.restore();
    }
    // pré-visualização de colocação, com o encaixe calculado (verde = encaixa, vermelho = não)
    const f = S.fantasma;
    if (f && S.ativo) {
      const tpl = { ...M.novaInstancia(S.ativo, f.x, f.y, { z: f.z || 0 }), anfitriao: f.anfitriao };
      desenharInstancia(tpl, f.ok ? 0.75 : 0.35);
      const c = S.ativo; const w = M.larguraVisual(tpl, c); const h = M.alturaVisual(tpl, c);
      g.strokeStyle = f.ok ? '#22c55e' : '#ef4444'; g.lineWidth = 2 * z; g.strokeRect(tpl.x - w / 2, tpl.y - (tpl.z || 0) - h, w, h);
      if (f.anfitriao) { const a = est.componentes.find((x) => x.id === f.anfitriao); if (a) { const ac = compDe(a.comp); const p = M.pegada(a, ac); const ah = M.alturaVisual(a, ac); g.setLineDash([6 * z, 4 * z]); g.strokeStyle = '#22c55e'; g.strokeRect(p.x0, a.y - (a.z || 0) - ah, p.w, ah); g.setLineDash([]); } }
    }
    if (S.faixa) { g.strokeStyle = '#60a5fa'; g.fillStyle = 'rgba(96,165,250,.12)'; g.lineWidth = z; const { x0, y0, x1, y1 } = S.faixa; g.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0)); g.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0)); }
    g.restore();
  }

  // ---------------------------------------------------------------- histórico, estado e diagnóstico
  const foto = () => JSON.stringify(est.componentes);
  const atualizarBotoes = () => { $('#stDesfazer').disabled = !hist.passado.length; $('#stRefazer').disabled = !hist.futuro.length; };
  function registrar() { hist.passado.push(foto()); if (hist.passado.length > HIST_MAX) hist.passado.shift(); hist.futuro = []; atualizarBotoes(); }
  function restaurar(f) { est.componentes = JSON.parse(f); S.sel = new Set([...S.sel].filter((id) => est.componentes.some((i) => i.id === id))); marcar(); desenhar(); painel(); }
  function desfazer() { if (!hist.passado.length) return; hist.futuro.push(foto()); restaurar(hist.passado.pop()); atualizarBotoes(); }
  function refazer() { if (!hist.futuro.length) return; hist.passado.push(foto()); restaurar(hist.futuro.pop()); atualizarBotoes(); }
  let tDiag = 0;
  function recalcular() {
    S.diag = M.diagnosticar(est.componentes, est.area, est.preset, compDe);
    const erros = S.diag.filter((p) => p.gravidade === 'erro').length;
    $('#stAbaVerificar').textContent = S.diag.length ? `Verificar (${S.diag.length})` : 'Verificar';
    $('#stAbaVerificar').style.color = erros ? '#ef4444' : '';
    if (S.aba === 'verificar') painel();
    desenhar();
  }
  function marcar() { S.sujo = true; $('#stEstado').textContent = 'Alterações não salvas'; clearTimeout(tDiag); tDiag = setTimeout(recalcular, 200); }

  // ---------------------------------------------------------------- ações
  const apagarSel = () => {
    if (!S.sel.size) return; registrar();
    const escolhidas = S.sel.size;
    const { restantes, removidos } = M.removerComFilhos(est.componentes, [...S.sel]);
    est.componentes = restantes; S.sel = new Set(); marcar(); desenhar(); painel();
    if (removidos > escolhidas) toast('Studio', `${removidos} peças removidas (as encaixadas saem junto).`, 'info');
  };
  const duplicarSel = () => {
    if (!S.sel.size) return; registrar();
    const copias = M.clonarCom(est.componentes, [...S.sel]);
    est.componentes.push(...copias); S.sel = new Set(copias.filter((c) => !c.anfitriao).map((c) => c.id)); marcar(); desenhar(); painel();
  };
  const copiarSel = () => { if (!S.sel.size) return; const ids = M.expandirSelecao(est.componentes, [...S.sel]); clip = est.componentes.filter((i) => ids.has(i.id)).map((i) => ({ ...i })); toast('Copiado', 'Ctrl+V cola.', 'info'); };
  const colar = () => { if (!clip) return; registrar(); const copias = M.clonarCom(clip, clip.map((i) => i.id)); est.componentes.push(...copias); S.sel = new Set(copias.filter((c) => !c.anfitriao).map((c) => c.id)); marcar(); desenhar(); painel(); };
  const agruparSel = () => { registrar(); if (!M.agrupar(est.componentes, S.sel)) { hist.passado.pop(); atualizarBotoes(); toast('Agrupar', 'Selecione duas ou mais peças.', 'warning'); return; } marcar(); painel(); };
  const desagruparSel = () => { registrar(); M.desagrupar(est.componentes, M.expandirSelecao(est.componentes, [...S.sel])); marcar(); painel(); };
  const alinharSel = (modo) => { registrar(); const n = M.alinhar(est.componentes, S.sel, modo, compDe); if (!n) { hist.passado.pop(); atualizarBotoes(); toast('Alinhar', 'Selecione duas ou mais peças (três para distribuir).', 'warning'); return; } marcar(); desenhar(); painel(); };
  function alterar(i, fn, { filhos = false } = {}) { registrar(); fn(i); if (filhos) M.reencaixarFilhos(est.componentes, i.id, compDe); marcar(); desenhar(); }
  function posicionar(i, nx, ny, nz) { M.moverComFilhos(est.componentes, i.id, nx - i.x, ny - i.y, nz - (i.z || 0)); }
  function calcularFantasma(q) {
    const c = S.ativo; const tpl = M.novaInstancia(c, q.x, q.y);
    const r = M.encaixar(tpl, c, q.x, q.y, ctxEncaixe());
    if (r.ok && (r.x < 0 || r.x > W() || r.y < 0 || r.y > H())) return { ...r, ok: false, motivo: 'fora da área de construção' };
    return r;
  }
  function colocar(q) {
    const c = S.ativo; if (!c) return;
    const f = calcularFantasma(q);
    if (!f.ok) { toast('Encaixe', f.motivo || 'Não dá para colocar aqui.', 'warning'); return; }
    registrar();
    const i = M.novaInstancia(c, f.x, f.y, { z: f.z || 0, anfitriao: f.anfitriao });
    est.componentes.push(i); S.sel = new Set([i.id]); marcar(); desenhar(); painel();
  }
  function atualizarDica() {
    const d = $('#stDica');
    if (!S.ativo) { d.style.display = 'none'; return; }
    const req = REQUER[S.ativo.sub];
    d.style.display = 'block'; d.innerHTML = `Colocando <b>${esc(S.ativo.nome)}</b>${req ? ` — encaixa em ${esc(req.join(', '))}` : ''}. Clique para colocar · <b>Esc</b> cancela`;
  }
  function escolher(c) {
    if (!c) return; comps.set(c.id, c); S.ativo = c; S.sel = new Set(); atualizarDica(); painel(); desenhar();
  }

  // ---------------------------------------------------------------- painel direito
  const campo = (id, rot, v, extra = '') => `<label>${rot}<input class="input" id="${id}" type="number" value="${v}" ${extra}></label>`;
  function painel() {
    el.querySelectorAll('[data-aba]').forEach((b) => b.classList.toggle('primary', b.dataset.aba === S.aba));
    const box = $('#stProp');
    if (S.aba === 'camadas') return painelCamadas(box);
    if (S.aba === 'verificar') return painelVerificar(box);
    if (S.sel.size > 1) return painelMulti(box);
    const um = unico();
    if (!um) {
      box.innerHTML = `<b>${S.ativo ? esc(S.ativo.nome) : 'Propriedades'}</b>
        <p>${S.ativo ? 'Clique na área para colocar. As peças de encaixe (janelas, portas, telhado) só entram sobre um anfitrião compatível.' : 'Escolha um componente na biblioteca e clique na área, ou clique numa peça para editá-la.'}</p>
        <p style="font-size:12px">Câmera: <b>${esc(preset.camera.tipo)}</b> (${preset.camera.inclinacao}°) · Grade ${GRADE} · Área ${est.area.w}×${est.area.h} células · ${est.componentes.length} peças</p>
        <p style="font-size:12px"><b>Atalhos</b><br>Arrastar: mover · Shift: várias · arrastar no vazio: seleção em faixa · botão direito ou do meio: mover a vista · roda: zoom · Ctrl+Z / Y · Ctrl+D duplicar · Ctrl+C / V · Ctrl+G agrupar · setas · F espelha · R gira 90° · [ ] ordem · Delete apaga</p>`;
      return;
    }
    const c = compDe(um.comp); const { w, h } = caixa(um); const mod = M.eModular(c);
    const anf = um.anfitriao ? est.componentes.find((x) => x.id === um.anfitriao) : null;
    box.innerHTML = `<b>${esc(um.nome || c.nome)}</b> <span class="muted">· ${esc(CATEGORIAS[c.categoria]?.sub[c.sub] || c.sub)}</span>
      <div class="muted" style="font-size:11px">${anf ? `Encaixada em: ${esc(compDe(anf.comp)?.nome || anf.comp)}` : (REQUER[c.sub] ? 'Sem anfitrião' : 'No chão')}${um.grupo ? ' · em grupo' : ''}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-top:8px">${campo('pX', 'X', Math.round(um.x))}${campo('pY', 'Y', Math.round(um.y))}${campo('pZ', 'Z (altura)', Math.round(um.z || 0))}</div>
      <div style="margin-top:8px"><b>Tamanho</b> <span class="muted" style="font-size:11px">(proporcional: o asset não deforma)</span></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:4px">
        <label>Escala <span id="pEV">${Math.round(um.escala * 100)}%</span><input type="range" id="pE" min="${M.ESCALA_MIN * 100}" max="${M.ESCALA_MAX * 100}" value="${Math.round(um.escala * 100)}" style="width:100%"></label>
        ${mod ? campo('pN', 'Módulos', um.n || 1, `min="1" max="${M.MODULOS_MAX}"`) : `<div class="muted" style="font-size:11px;align-self:end">${Math.round(w)}×${Math.round(h)} px</div>`}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px">${campo('pR', 'Rotação (°)', Math.round((um.rot || 0) * 10) / 10, 'min="0" max="359.9"')}
        <div class="row" style="gap:4px;align-self:end"><button class="btn sm" id="pRp">+90</button><button class="btn sm ${um.espelho ? 'primary' : ''}" id="pEsp">Espelhar</button></div></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px">
        <label>Camada<select class="input" id="pCam">${CAMADAS.map((k) => `<option ${um.camada === k ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
        <label>Ordem<div class="row" style="gap:4px"><button class="btn sm" id="pOm">−</button><span style="min-width:24px;text-align:center">${um.zfino || 0}</span><button class="btn sm" id="pOp">+</button></div></label></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px">
        <label>Material<select class="input" id="pMat"><option value="">${esc(c.material)} (padrão)</option>${MATERIAIS.map((k) => `<option ${um.material === k ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
        <label>Cor<div class="row" style="gap:4px"><input type="color" id="pCor" value="${um.cor || '#888888'}" style="width:40px;height:32px"><button class="btn sm" id="pCor0" ${um.cor ? '' : 'disabled'}>Limpar</button></div></label></div>
      <label style="display:block;margin-top:8px">Textura<select class="input" id="pTex"><option value="">nenhuma</option></select></label>
      <label style="display:flex;gap:6px;align-items:center;margin-top:8px"><input type="checkbox" id="pCol" ${um.colisao ? 'checked' : ''} ${c.colisao?.tipo === 'caixa' ? '' : 'disabled'}> Colisão ${c.colisao?.tipo === 'caixa' ? '' : '(este componente não tem)'}</label>
      <label style="display:block;margin-top:8px">Nome<input class="input" id="pNome" value="${esc(um.nome || '')}" maxlength="60" placeholder="${esc(c.nome)}"></label>
      <div class="row" style="gap:6px;margin-top:10px;flex-wrap:wrap"><button class="btn sm" id="pDup">Duplicar</button><button class="btn sm" id="pCop">Copiar</button><button class="btn sm" id="pApagar">Apagar</button></div>
      <div class="muted" style="font-size:11px;margin-top:8px;word-break:break-all">Peça ${esc(um.id)}<br>Componente ${esc(c.id)}</div>`;
    // edições numéricas: uma ação de desfazer por gesto; o painel só é refeito ao confirmar
    const vivo = (id, aplicar, filhos = false) => {
      const inp = box.querySelector(id); let reg = false;
      inp.oninput = () => { if (!reg) { registrar(); reg = true; } aplicar(inp); if (filhos) M.reencaixarFilhos(est.componentes, um.id, compDe); marcar(); desenhar(); };
      inp.onchange = () => { reg = false; painel(); };
    };
    vivo('#pX', (i) => posicionar(um, Number(i.value) || 0, um.y, um.z || 0)); vivo('#pY', (i) => posicionar(um, um.x, Number(i.value) || 0, um.z || 0)); vivo('#pZ', (i) => posicionar(um, um.x, um.y, Number(i.value) || 0));
    vivo('#pE', (i) => { um.escala = Number(i.value) / 100; box.querySelector('#pEV').textContent = `${Math.round(um.escala * 100)}%`; }, true);
    if (mod) vivo('#pN', (i) => { um.n = M.limitar(Math.round(Number(i.value) || 1), 1, M.MODULOS_MAX); }, true);
    vivo('#pR', (i) => { um.rot = (((Number(i.value) || 0) % 360) + 360) % 360; });
    box.querySelector('#pRp').onclick = () => { alterar(um, (i) => { i.rot = ((i.rot || 0) + 90) % 360; }); painel(); };
    box.querySelector('#pEsp').onclick = () => { alterar(um, (i) => { i.espelho = !i.espelho; }); painel(); };
    box.querySelector('#pCam').onchange = (e) => { alterar(um, (i) => { i.camada = e.target.value; }); painel(); };
    box.querySelector('#pOm').onclick = () => { alterar(um, (i) => { i.zfino = (i.zfino || 0) - 1; }); painel(); };
    box.querySelector('#pOp').onclick = () => { alterar(um, (i) => { i.zfino = (i.zfino || 0) + 1; }); painel(); };
    box.querySelector('#pMat').onchange = (e) => { alterar(um, (i) => { i.material = e.target.value || null; }); };
    box.querySelector('#pCor').oninput = (e) => { if (!um.cor) registrar(); um.cor = e.target.value; marcar(); desenhar(); };
    box.querySelector('#pCor').onchange = () => painel();
    box.querySelector('#pCor0').onclick = () => { alterar(um, (i) => { i.cor = null; }); painel(); };
    box.querySelector('#pCol').onchange = (e) => { alterar(um, (i) => { i.colisao = e.target.checked; }); };
    box.querySelector('#pNome').oninput = (e) => { um.nome = e.target.value; marcar(); };
    box.querySelector('#pDup').onclick = duplicarSel; box.querySelector('#pCop').onclick = copiarSel; box.querySelector('#pApagar').onclick = apagarSel;
    // texturas da biblioteca (carregadas só quando o painel de uma peça abre)
    api.get(`/estudio/componentes?preset=${est.preset}&categoria=material&sub=textura&limite=60`).then((r) => {
      if (unico() !== um) return;
      const sel = box.querySelector('#pTex'); if (!sel) return;
      for (const t of r.componentes) { comps.set(t.id, t); const o = document.createElement('option'); o.value = t.id; o.textContent = t.nome; if (um.textura === t.id) o.selected = true; sel.appendChild(o); }
      sel.onchange = () => { alterar(um, (i) => { i.textura = sel.value || null; }); };
    }).catch(() => {});
  }

  function painelMulti(box) {
    const grupo = [...S.sel].some((id) => est.componentes.find((i) => i.id === id)?.grupo);
    box.innerHTML = `<b>${S.sel.size} peças selecionadas</b>
      <div class="row" style="gap:6px;margin-top:8px;flex-wrap:wrap"><button class="btn sm" id="mAgr">Agrupar (Ctrl+G)</button><button class="btn sm" id="mDes" ${grupo ? '' : 'disabled'}>Desagrupar</button></div>
      <div style="margin-top:10px"><b>Alinhar</b></div>
      <div class="row" style="gap:4px;margin-top:4px;flex-wrap:wrap">${[['esq', '⇤ Esq.'], ['centro-h', '↔ Centro'], ['dir', 'Dir. ⇥'], ['topo', '⤒ Topo'], ['centro-v', '↕ Meio'], ['base', 'Base ⤓'], ['distribuir-h', '⇹ Distribuir H'], ['distribuir-v', '⇳ Distribuir V']].map(([k, n]) => `<button class="btn sm" data-al="${k}">${n}</button>`).join('')}</div>
      <div class="row" style="gap:6px;margin-top:10px;flex-wrap:wrap"><button class="btn sm" id="mDup">Duplicar</button><button class="btn sm" id="mCop">Copiar</button><button class="btn sm" id="mApagar">Apagar</button></div>`;
    box.querySelector('#mAgr').onclick = agruparSel; box.querySelector('#mDes').onclick = desagruparSel;
    box.querySelectorAll('[data-al]').forEach((b) => { b.onclick = () => alinharSel(b.dataset.al); });
    box.querySelector('#mDup').onclick = duplicarSel; box.querySelector('#mCop').onclick = copiarSel; box.querySelector('#mApagar').onclick = apagarSel;
  }

  function painelCamadas(box) {
    const ordem = M.ordemDeDesenho(est.componentes).reverse();
    box.innerHTML = `<b>Camadas</b> <span class="muted" style="font-size:11px">(de cima para baixo)</span>
      <div style="display:grid;gap:3px;margin-top:6px">${ordem.map((i) => { const c = compDe(i.comp); return `<div data-linha="${esc(i.id)}" style="display:flex;gap:4px;align-items:center;padding:3px 4px;border-radius:6px;cursor:pointer;background:${S.sel.has(i.id) ? 'rgba(242,201,76,.18)' : 'transparent'}">
        <button class="btn sm" data-ver="${esc(i.id)}" title="Mostrar ou ocultar">${S.ocultos.has(i.id) ? '○' : '●'}</button><button class="btn sm" data-trava="${esc(i.id)}" title="Travar">${S.travados.has(i.id) ? '🔒' : '🔓'}</button>
        <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(i.nome || c?.nome || i.comp)}</span><span class="chip" style="font-size:10px">${esc(i.camada)}</span></div>`; }).join('') || '<p class="muted">Sem peças ainda.</p>'}</div>`;
    box.querySelectorAll('[data-linha]').forEach((l) => { l.onclick = (e) => { if (e.target.closest('button')) return; S.sel = M.expandirSelecao(est.componentes, [l.dataset.linha]); painelCamadas(box); desenhar(); }; });
    box.querySelectorAll('[data-ver]').forEach((b) => { b.onclick = () => { const id = b.dataset.ver; S.ocultos.has(id) ? S.ocultos.delete(id) : S.ocultos.add(id); painelCamadas(box); desenhar(); }; });
    box.querySelectorAll('[data-trava]').forEach((b) => { b.onclick = () => { const id = b.dataset.trava; S.travados.has(id) ? S.travados.delete(id) : S.travados.add(id); painelCamadas(box); }; });
  }

  function painelVerificar(box) {
    box.innerHTML = `<b>Verificar a montagem</b>
      ${S.diag.length ? `<div style="display:grid;gap:4px;margin-top:6px">${S.diag.map((p) => { const i = est.componentes.find((x) => x.id === p.id); const c = i && compDe(i.comp); return `<div data-prob="${esc(p.id)}" style="padding:5px 6px;border-radius:6px;cursor:pointer;background:rgba(255,255,255,.04);border-left:3px solid ${p.gravidade === 'erro' ? '#ef4444' : p.gravidade === 'aviso' ? '#f59e0b' : '#60a5fa'}"><b>${esc(c?.nome || p.id)}</b><div style="font-size:12px">${esc(p.msg)}</div></div>`; }).join('')}</div>` : '<p style="color:#22c55e">Nenhum problema: nada flutuando, atravessando ou fora da área.</p>'}`;
    box.querySelectorAll('[data-prob]').forEach((d) => { d.onclick = () => { S.sel = new Set([d.dataset.prob]); S.aba = 'prop'; painel(); desenhar(); }; });
  }

  // ---------------------------------------------------------------- mouse
  tela.addEventListener('contextmenu', (e) => e.preventDefault());
  const cantos = (i) => { const { w, h } = caixa(i); return [[-w / 2, -h], [w / 2, -h], [-w / 2, 0], [w / 2, 0]]; };
  tela.addEventListener('pointerdown', (e) => {
    tela.setPointerCapture(e.pointerId); const q = mundoDe(e);
    if (e.button === 1 || e.button === 2) { S.pan = { x: e.clientX, y: e.clientY, cx: S.cam.x, cy: S.cam.y }; tela.style.cursor = 'grabbing'; return; }
    if (S.ativo) { colocar(q); return; }
    const um = unico();
    if (um) {
      const { h } = caixa(um); const z = 1 / S.cam.z;
      if (dist(q, paraMundo(um, 0, -h - 30 * z)) <= 10 * z) { S.arrasto = { tipo: 'girar', id: um.id, reg: false }; return; }
      const canto = cantos(um).find(([hx, hy]) => dist(q, paraMundo(um, hx, hy)) <= 9 * z);
      if (canto) {
        const centro = paraMundo(um, 0, -h / 2); const p0 = paraMundo(um, canto[0], canto[1]);
        S.arrasto = { tipo: 'escalar', id: um.id, reg: false, e0: um.escala, d0: Math.max(4, dist(p0, centro)), centro }; return;
      }
    }
    const alvo = itemEm(q);
    if (alvo) {
      const ids = M.expandirSelecao(est.componentes, [alvo.id]);
      if (e.shiftKey) { const tem = S.sel.has(alvo.id); for (const id of ids) tem ? S.sel.delete(id) : S.sel.add(id); }
      else if (!S.sel.has(alvo.id)) S.sel = new Set(ids);
      iniciarArrasto(q); painel(); desenhar(); return;
    }
    if (!e.shiftKey) S.sel = new Set();
    S.faixa = { x0: q.x, y0: q.y, x1: q.x, y1: q.y, base: new Set(S.sel) };
    painel(); desenhar();
  });

  // origem do arrasto: guarda a posição de tudo que pode andar, para restaurar e recalcular a cada movimento
  function iniciarArrasto(q) {
    const sel = M.expandirSelecao(est.componentes, [...S.sel]);
    const raizes = est.componentes.filter((i) => sel.has(i.id) && !(i.anfitriao && sel.has(i.anfitriao)));
    const afetados = new Set(raizes.map((r) => r.id)); for (const r of raizes) for (const d of M.descendentes(est.componentes, r.id)) afetados.add(d);
    S.arrasto = { tipo: 'mover', q0: q, raizes: raizes.map((r) => r.id), origem: new Map(est.componentes.filter((i) => afetados.has(i.id)).map((i) => [i.id, { x: i.x, y: i.y, z: i.z || 0, anfitriao: i.anfitriao }])), reg: false, invalido: null };
  }
  function moverArrasto(q) {
    const a = S.arrasto; if (!a.reg) { registrar(); a.reg = true; }
    for (const [id, o] of a.origem) { const i = est.componentes.find((x) => x.id === id); Object.assign(i, o); }
    const dx = q.x - a.q0.x; const dy = q.y - a.q0.y; a.invalido = null;
    for (const rid of a.raizes) {
      const r = est.componentes.find((x) => x.id === rid); const c = compDe(r.comp); const o = a.origem.get(rid);
      if (REQUER[c.sub]) {
        if (a.raizes.length > 1) continue; // peça de encaixe só anda sozinha ou junto com o anfitrião
        const ant = r.anfitriao; r.anfitriao = null;
        const res = M.encaixar({ ...r, z: o.z }, c, o.x + dx, o.y + dy, ctxEncaixe());
        r.anfitriao = ant;
        if (res.ok) { M.moverComFilhos(est.componentes, rid, res.x - o.x, res.y - o.y, res.z - o.z); r.anfitriao = res.anfitriao; } else a.invalido = res.motivo;
      } else {
        const p = S.snap ? M.PASSO : 1; const nx = Math.round((o.x + dx) / p) * p; const ny = Math.round((o.y + dy) / p) * p;
        M.moverComFilhos(est.componentes, rid, nx - o.x, ny - o.y);
      }
    }
    marcar(); desenhar();
  }
  tela.addEventListener('pointermove', (e) => {
    if (S.pan) { S.cam.x = S.pan.cx - (e.clientX - S.pan.x) / S.cam.z; S.cam.y = S.pan.cy - (e.clientY - S.pan.y) / S.cam.z; desenhar(); return; }
    const q = mundoDe(e);
    if (S.ativo && e.buttons === 0) { S.fantasma = calcularFantasma(q); tela.style.cursor = S.fantasma.ok ? 'copy' : 'not-allowed'; desenhar(); return; }
    if (e.buttons === 0) { tela.style.cursor = itemEm(q) ? 'move' : 'default'; return; }
    if (e.buttons !== 1) return;
    const a = S.arrasto;
    if (a) {
      if (a.tipo === 'mover') { moverArrasto(q); return; }
      const i = est.componentes.find((x) => x.id === a.id); if (!i) return;
      if (!a.reg) { registrar(); a.reg = true; }
      if (a.tipo === 'girar') { const p = eixo(i); let ang = Math.atan2(q.y - p.y, q.x - p.x) * 180 / Math.PI + 90; ang = (ang % 360 + 360) % 360; if (S.snap || e.shiftKey) ang = Math.round(ang / 15) * 15; i.rot = Math.round((ang % 360) * 10) / 10; }
      else if (a.tipo === 'escalar') { i.escala = Math.round(M.limitar(a.e0 * dist(q, a.centro) / a.d0, M.ESCALA_MIN, M.ESCALA_MAX) * 100) / 100; M.reencaixarFilhos(est.componentes, i.id, compDe); }
      marcar(); desenhar(); painel(); return;
    }
    if (S.faixa) { S.faixa.x1 = q.x; S.faixa.y1 = q.y; desenhar(); }
  });
  tela.addEventListener('pointerup', () => {
    S.pan = null; tela.style.cursor = 'default';
    if (S.arrasto?.tipo === 'mover' && S.arrasto.invalido) { // o destino não encaixa: volta ao lugar de antes
      for (const [id, o] of S.arrasto.origem) Object.assign(est.componentes.find((x) => x.id === id), o);
      toast('Encaixe', S.arrasto.invalido, 'warning');
    }
    if (S.arrasto?.reg) painel();
    S.arrasto = null;
    if (S.faixa) {
      const { x0, y0, x1, y1, base } = S.faixa; S.faixa = null;
      if (Math.abs(x1 - x0) > 4 || Math.abs(y1 - y0) > 4) {
        const ach = visiveis().filter((i) => !S.travados.has(i.id)).filter((i) => { const { w, h } = caixa(i); const cx = i.x; const cy = i.y - (i.z || 0) - h / 2; return cx + w / 2 >= Math.min(x0, x1) && cx - w / 2 <= Math.max(x0, x1) && cy + h / 2 >= Math.min(y0, y1) && cy - h / 2 <= Math.max(y0, y1); });
        S.sel = M.expandirSelecao(est.componentes, [...base, ...ach.map((i) => i.id)]);
      }
      painel(); desenhar();
    }
  });
  tela.addEventListener('pointerleave', () => { if (S.fantasma) { S.fantasma = null; desenhar(); } });
  tela.addEventListener('wheel', (e) => { e.preventDefault(); S.cam.z = Math.max(0.2, Math.min(3, S.cam.z * (e.deltaY < 0 ? 1.1 : 0.9))); desenhar(); }, { passive: false });

  // ---------------------------------------------------------------- teclado
  const teclas = (e) => {
    if (!el.isConnected) { window.removeEventListener('keydown', teclas); return; }
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
    const ctrl = e.ctrlKey || e.metaKey; const k = e.key.toLowerCase();
    if (ctrl) {
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); desfazer(); } else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); refazer(); }
      else if (k === 'c') { e.preventDefault(); copiarSel(); } else if (k === 'v') { e.preventDefault(); colar(); } else if (k === 'd') { e.preventDefault(); duplicarSel(); }
      else if (k === 'g') { e.preventDefault(); e.shiftKey ? desagruparSel() : agruparSel(); } else if (k === 'a') { e.preventDefault(); S.sel = new Set(est.componentes.map((i) => i.id)); painel(); desenhar(); }
      return;
    }
    if (k === 'escape') { if (S.ativo) { S.ativo = null; S.fantasma = null; atualizarDica(); } else S.sel = new Set(); painel(); desenhar(); return; }
    if (k === 'delete' || k === 'backspace') { if (S.sel.size) { e.preventDefault(); apagarSel(); } return; }
    const um = unico(); if (!um) return;
    if (k === 'r') { e.preventDefault(); alterar(um, (i) => { i.rot = ((i.rot || 0) + (e.shiftKey ? 270 : 90)) % 360; }); painel(); return; }
    if (k === 'f') { alterar(um, (i) => { i.espelho = !i.espelho; }); painel(); return; }
    if (k === '[' || k === ']') { alterar(um, (i) => { i.zfino = (i.zfino || 0) + (k === ']' ? 1 : -1); }); painel(); return; }
    const passo = e.shiftKey ? GRADE : M.PASSO;
    const d = { arrowleft: [-passo, 0], arrowright: [passo, 0], arrowup: [0, -passo], arrowdown: [0, passo] }[k];
    if (d && !REQUER[compDe(um.comp).sub]) { e.preventDefault(); registrar(); M.moverComFilhos(est.componentes, um.id, d[0], d[1]); marcar(); desenhar(); painel(); }
  };
  window.addEventListener('keydown', teclas);

  // ---------------------------------------------------------------- barra de cima
  el.querySelectorAll('[data-aba]').forEach((b) => { b.onclick = () => { S.aba = b.dataset.aba; painel(); }; });
  $('#stGrade').onclick = () => { S.grade = !S.grade; desenhar(); };
  $('#stIma').onclick = (e) => { S.snap = !S.snap; e.currentTarget.classList.toggle('primary', S.snap); };
  $('#stPegadas').onclick = (e) => { S.pegadas = !S.pegadas; e.currentTarget.classList.toggle('primary', S.pegadas); desenhar(); };
  $('#stColisoes').onclick = (e) => { S.colisoes = !S.colisoes; e.currentTarget.classList.toggle('primary', S.colisoes); desenhar(); };
  $('#stDesfazer').onclick = desfazer; $('#stRefazer').onclick = refazer;
  $('#stNome').oninput = marcar;
  $('#stTelaCheia').onclick = () => {
    const caixaEl = $('#stCaixa'); const cheia = caixaEl.dataset.cheia !== '1'; caixaEl.dataset.cheia = cheia ? '1' : '';
    Object.assign(caixaEl.style, cheia ? { position: 'fixed', inset: '0', zIndex: '500', margin: '0', borderRadius: '0', overflow: 'auto', background: '#0f131c' } : { position: '', inset: '', zIndex: '', margin: '', borderRadius: '', overflow: '', background: '' });
    tela.style.height = cheia ? 'calc(100vh - 110px)' : '600px';
    $('#stTelaCheia').textContent = cheia ? '⛶ Sair da tela cheia' : '⛶ Tela cheia';
    requestAnimationFrame(() => { ajustar(); });
  };
  async function salvar() {
    try {
      $('#stEstado').textContent = 'Salvando…';
      const r = await api.put(`/estudio/estruturas/${est.id}`, { nome: $('#stNome').value, componentes: est.componentes, area: est.area });
      est.atualizado = r.atualizado; S.sujo = false;
      $('#stEstado').textContent = `Salvo às ${new Date(r.atualizado).toLocaleTimeString('pt-BR')}`;
      return true;
    } catch (err) { $('#stEstado').textContent = `Não salvou: ${err.message}`; toast('Studio', err.message, 'warning'); return false; }
  }
  $('#stSalvar').onclick = salvar;
  const auto = setInterval(() => { if (!el.isConnected) { clearInterval(auto); return; } if (S.sujo) salvar(); }, 20000);

  criarBiblioteca($('#stBiblioteca'), { preset: est.preset, aoEscolher: escolher });
  $('#stIma').classList.toggle('primary', S.snap);
  atualizarBotoes(); caber(); ajustar(); painel(); recalcular();
  $('#stCaixa').__studio = { S, est, compDe, M }; // para os testes de navegador
}
