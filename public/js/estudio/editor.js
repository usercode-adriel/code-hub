// STRUCTURE STUDIO: editor. Três painéis: biblioteca (esquerda), área de construção (centro), propriedades (direita).
// Esta é a base da interface (fase 1): câmera do preset, grade de 32, zoom e pan. A biblioteca, a montagem e o
// encaixe entram nas fases seguintes, sempre dentro desta mesma estrutura.
import { api } from '../api.js';
import { esc, toast } from '../ui.js';
import { PRESETS, GRADE, CATEGORIAS, REQUER } from './presets.js';
import { criarBiblioteca } from './biblioteca.js';

export async function abrirEditor(el, id) {
  el.innerHTML = '<section class="card"><p>Carregando a estrutura…</p></section>';
  let est;
  try { est = await api.get(`/estudio/estruturas/${id}`); }
  catch (err) { el.innerHTML = `<section class="card"><p>${esc(err.message)}</p><a href="#/studio">← Studio</a></section>`; return; }
  montar(el, est);
}

function montar(el, est) {
  const preset = PRESETS[est.preset];
  const S = { cam: { x: est.area.w * GRADE / 2, y: est.area.h * GRADE / 2, z: 0.9 }, grade: true, sujo: false, pan: null };
  el.innerHTML = `<section class="card" id="stCaixa" style="padding:12px">
    <div class="row" style="gap:8px;align-items:center;flex-wrap:wrap">
      <a href="#/studio">← Studio</a>
      <input class="input" id="stNome" value="${esc(est.nome)}" maxlength="60" style="max-width:240px">
      <span class="chip" title="${esc(preset.descricao)}">${esc(preset.nome)}</span>
      <button class="btn" id="stSalvar">Salvar</button><span class="muted" id="stEstado" style="font-size:12px"></span>
      <span style="margin-left:auto" class="row"><button class="btn sm" id="stGrade">Grade</button><button class="btn sm" id="stTelaCheia">⛶ Tela cheia</button></span>
    </div>
    <div style="display:grid;grid-template-columns:260px 1fr 270px;gap:10px;margin-top:10px">
      <aside id="stBiblioteca" style="min-width:0"></aside>
      <div style="position:relative;min-width:0"><canvas id="stTela" style="width:100%;height:600px;display:block;background:#1b1f2a;border-radius:10px;touch-action:none"></canvas></div>
      <aside id="stProp" class="muted" style="font-size:13px;overflow:auto;max-height:720px"></aside>
    </div></section>`;
  const tela = el.querySelector('#stTela'); const g = tela.getContext('2d'); const dpr = window.devicePixelRatio || 1;
  const marcar = () => { S.sujo = true; el.querySelector('#stEstado').textContent = 'Alterações não salvas'; };

  function ajustar() { tela.width = tela.clientWidth * dpr; tela.height = tela.clientHeight * dpr; desenhar(); }
  const aoRedimensionar = () => { if (!el.isConnected) { window.removeEventListener('resize', aoRedimensionar); return; } ajustar(); };
  window.addEventListener('resize', aoRedimensionar);

  function desenhar() {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#1b1f2a'; g.fillRect(0, 0, tela.clientWidth, tela.clientHeight);
    g.save(); g.translate(tela.clientWidth / 2, tela.clientHeight / 2); g.scale(S.cam.z, S.cam.z); g.translate(-S.cam.x, -S.cam.y);
    const W = est.area.w * GRADE; const H = est.area.h * GRADE;
    g.fillStyle = '#242b3a'; g.fillRect(0, 0, W, H);
    if (S.grade) {
      g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 1 / S.cam.z;
      for (let x = 0; x <= est.area.w; x++) { g.beginPath(); g.moveTo(x * GRADE, 0); g.lineTo(x * GRADE, H); g.stroke(); }
      for (let y = 0; y <= est.area.h; y++) { g.beginPath(); g.moveTo(0, y * GRADE); g.lineTo(W, y * GRADE); g.stroke(); }
    }
    g.strokeStyle = '#f2c94c'; g.lineWidth = 2 / S.cam.z; g.strokeRect(0, 0, W, H);
    g.restore();
  }

  // painel direito: o componente escolhido na biblioteca (metadados) ou a estrutura
  function mostrarEstrutura() {
    el.querySelector('#stProp').innerHTML = `<b>Propriedades</b><p>Escolha um componente na biblioteca para ver os detalhes.</p>
      <p style="font-size:12px">Câmera: <b>${esc(preset.camera.tipo)}</b> (${preset.camera.inclinacao}°)<br>Grade: ${GRADE} unidades<br>Área: ${est.area.w}×${est.area.h} células</p>`;
  }
  function mostrarComponente(c) {
    if (!c) return mostrarEstrutura();
    const requer = REQUER[c.sub];
    el.querySelector('#stProp').innerHTML = `<b>${esc(c.nome)}</b><br><span class="muted">${esc(CATEGORIAS[c.categoria]?.nome || c.categoria)} · ${esc(CATEGORIAS[c.categoria]?.sub[c.sub] || c.sub)}</span>
      <img src="${esc(c.arquivo)}" alt="${esc(c.nome)}" style="display:block;max-width:100%;max-height:150px;margin:8px auto;background:#111827;border-radius:8px;padding:6px">
      <table style="font-size:12px;width:100%"><tbody>
        <tr><td>Perspectiva</td><td>${esc(c.perspectiva)}</td></tr><tr><td>Material</td><td>${esc(c.material)}</td></tr>
        <tr><td>Origem</td><td>${esc(c.origem)}</td></tr><tr><td>Dimensões</td><td>${c.w}×${c.h} px</td></tr>
        <tr><td>Área no chão</td><td>${c.area.w}×${c.area.h} células</td></tr><tr><td>Camada</td><td>${esc(c.camada)}</td></tr>
        <tr><td>Colisão</td><td>${c.colisao?.tipo === 'caixa' ? 'caixa no pé' : 'nenhuma'}</td></tr>
        <tr><td>Encaixa em</td><td>${requer ? esc(requer.join(', ')) : 'chão (grade)'}</td></tr>
        <tr><td>Id</td><td style="word-break:break-all">${esc(c.id)}</td></tr></tbody></table>`;
  }
  mostrarEstrutura();
  const biblioteca = criarBiblioteca(el.querySelector('#stBiblioteca'), { preset: est.preset, aoEscolher: mostrarComponente });
  void biblioteca;

  tela.addEventListener('contextmenu', (e) => e.preventDefault());
  tela.addEventListener('pointerdown', (e) => { tela.setPointerCapture(e.pointerId); if (e.button === 1 || e.button === 2 || e.button === 0) { S.pan = { x: e.clientX, y: e.clientY, cx: S.cam.x, cy: S.cam.y }; tela.style.cursor = 'grabbing'; } });
  tela.addEventListener('pointermove', (e) => { if (!S.pan) return; S.cam.x = S.pan.cx - (e.clientX - S.pan.x) / S.cam.z; S.cam.y = S.pan.cy - (e.clientY - S.pan.y) / S.cam.z; desenhar(); });
  tela.addEventListener('pointerup', () => { S.pan = null; tela.style.cursor = 'default'; });
  tela.addEventListener('wheel', (e) => { e.preventDefault(); S.cam.z = Math.max(0.25, Math.min(3, S.cam.z * (e.deltaY < 0 ? 1.1 : 0.9))); desenhar(); }, { passive: false });
  el.querySelector('#stGrade').onclick = () => { S.grade = !S.grade; desenhar(); };
  el.querySelector('#stNome').oninput = marcar;
  el.querySelector('#stTelaCheia').onclick = () => {
    const caixa = el.querySelector('#stCaixa'); const cheia = caixa.dataset.cheia !== '1'; caixa.dataset.cheia = cheia ? '1' : '';
    Object.assign(caixa.style, cheia ? { position: 'fixed', inset: '0', zIndex: '500', margin: '0', borderRadius: '0', overflow: 'auto', background: '#0f131c' } : { position: '', inset: '', zIndex: '', margin: '', borderRadius: '', overflow: '', background: '' });
    tela.style.height = cheia ? 'calc(100vh - 110px)' : '600px';
    el.querySelector('#stTelaCheia').textContent = cheia ? '⛶ Sair da tela cheia' : '⛶ Tela cheia';
    requestAnimationFrame(ajustar);
  };
  async function salvar() {
    try {
      el.querySelector('#stEstado').textContent = 'Salvando…';
      const r = await api.put(`/estudio/estruturas/${est.id}`, { nome: el.querySelector('#stNome').value, componentes: est.componentes, area: est.area });
      est.atualizado = r.atualizado; S.sujo = false;
      el.querySelector('#stEstado').textContent = `Salvo às ${new Date(r.atualizado).toLocaleTimeString('pt-BR')}`;
      return true;
    } catch (err) { el.querySelector('#stEstado').textContent = `Não salvou: ${err.message}`; toast('Studio', err.message, 'warning'); return false; }
  }
  el.querySelector('#stSalvar').onclick = salvar;
  // vista inicial: a área inteira cabe na tela
  const caber = () => { const W = est.area.w * GRADE; const H = est.area.h * GRADE; S.cam.x = W / 2; S.cam.y = H / 2; S.cam.z = Math.max(0.25, Math.min(1.5, (tela.clientWidth - 40) / W, (tela.clientHeight - 40) / H)); };
  caber(); ajustar();
}
