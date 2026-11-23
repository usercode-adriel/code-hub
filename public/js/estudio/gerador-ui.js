// STRUCTURE STUDIO: painel de geração de componentes por IA de imagem (OpenRouter) e fila de aprovação.
// O que a IA gera NÃO vai direto para a biblioteca: cai em "pendentes", onde o usuário vê o resultado com o fundo removido
// (transparência), ajusta a tolerância e o tamanho, e só então aprova. A chave de API fica no servidor.
import { api } from '../api.js';
import { esc, toast } from '../ui.js';
import { CATEGORIAS, MATERIAIS, PERSPECTIVAS_COMP, PRESETS } from './presets.js';
import { PAPEIS, MAX_REFERENCIAS, prepararAsset } from './gerador.js';

const XADREZ = 'background:repeating-conic-gradient(#2b3342 0% 25%, #1b2130 0% 50%) 50% / 16px 16px';
const sim = (v) => (v === true ? 'sim' : v === false ? 'não' : '?');

export function criarGerador(box, { preset, componenteEscolhido, aoAprovar }) {
  const cats = PRESETS[preset].categorias;
  const E = { estado: null, modelos: null, refs: [], pendentes: [], carregando: false };
  const $ = (s) => box.querySelector(s);

  box.innerHTML = `<div style="display:flex;flex-direction:column;gap:6px">
    <b>Gerar componente com IA</b>
    <div class="muted" id="gAviso" style="font-size:12px">Carregando…</div>
    <div id="gForm" style="display:none;flex-direction:column;gap:6px">
      <label>Modelo de imagem<select class="input" id="gModelo"></select></label>
      <div class="muted" id="gCap" style="font-size:11px"></div>
      <label>Descreva o componente<textarea class="input" id="gDesc" rows="3" maxlength="600" placeholder="Ex.: janela moderna de vidro azul com moldura de alumínio escuro"></textarea></label>
      <div class="row" style="gap:4px"><select class="input" id="gCat" style="flex:1">${cats.map((c) => `<option value="${c}">${esc(CATEGORIAS[c].nome)}</option>`).join('')}</select><select class="input" id="gSub" style="flex:1"></select></div>
      <label>Perspectiva<select class="input" id="gPersp">${PERSPECTIVAS_COMP.map((p) => `<option value="${p}" ${p === preset ? 'selected' : ''}>${p}</option>`).join('')}</select></label>
      <div><b style="font-size:12px">Imagens de referência</b> <span class="muted" style="font-size:11px">(até ${MAX_REFERENCIAS})</span></div>
      <div id="gRefs" style="display:grid;gap:4px"></div>
      <div class="row" style="gap:4px;flex-wrap:wrap"><button class="btn sm" id="gAddArq">+ Enviar imagem</button><button class="btn sm" id="gAddComp" title="Usa o componente escolhido na biblioteca como referência">+ Do componente escolhido</button><input type="file" id="gArq" accept="image/png,image/jpeg,image/webp" style="display:none"></div>
      <button class="btn primary" id="gGerar">Gerar</button>
    </div>
    <div class="muted" id="gEstado" style="font-size:12px"></div>
    <b style="margin-top:6px">Para aprovar <span id="gN" class="chip" style="font-size:10px">0</span></b>
    <div id="gPend" style="display:grid;gap:8px"></div>
  </div>`;

  const subs = () => { const c = $('#gCat').value; $('#gSub').innerHTML = Object.entries(CATEGORIAS[c].sub).map(([k, n]) => `<option value="${k}">${esc(n)}</option>`).join(''); };
  $('#gCat').onchange = subs; subs();

  const modeloAtual = () => E.modelos?.find((m) => m.id === $('#gModelo').value);
  function atualizarCap() {
    const m = modeloAtual(); if (!m) { $('#gCap').textContent = ''; return; }
    $('#gCap').textContent = `Declarado pelo OpenRouter: aceita imagem de referência: ${sim(m.aceitaReferencia)}. Várias referências e transparência: não informados (o fundo é removido depois).`;
    const bloqueia = m.aceitaReferencia === false;
    $('#gAddArq').disabled = bloqueia; $('#gAddComp').disabled = bloqueia;
    if (bloqueia && E.refs.length) { E.refs = []; desenharRefs(); toast('Gerador', 'Este modelo não aceita referências: removi as que estavam na lista.', 'info'); }
  }
  function desenharRefs() {
    $('#gRefs').innerHTML = E.refs.map((r, k) => `<div class="card" style="padding:4px;display:grid;gap:4px"><div style="display:flex;gap:4px;align-items:center"><img src="${esc(r.preview)}" alt="" style="width:36px;height:36px;object-fit:contain;border-radius:6px;${XADREZ}">
      <span style="flex:1;min-width:0;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.nome)}</span><button class="btn sm" data-rm="${k}" title="Remover">✕</button></div>
      <select class="input" data-papel="${k}" style="height:30px" aria-label="Papel da referência">${Object.entries(PAPEIS).map(([t, n]) => `<option value="${t}" ${r.tipo === t ? 'selected' : ''}>Serve como referência de ${esc(n)}</option>`).join('')}</select></div>`).join('');
    box.querySelectorAll('[data-papel]').forEach((s) => { s.onchange = () => { E.refs[Number(s.dataset.papel)].tipo = s.value; }; });
    box.querySelectorAll('[data-rm]').forEach((b) => { b.onclick = () => { E.refs.splice(Number(b.dataset.rm), 1); desenharRefs(); }; });
    $('#gAddArq').disabled = E.refs.length >= MAX_REFERENCIAS || modeloAtual()?.aceitaReferencia === false;
    $('#gAddComp').disabled = $('#gAddArq').disabled;
  }
  $('#gAddArq').onclick = () => $('#gArq').click();
  $('#gArq').onchange = (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    if (f.size > 4 * 1024 * 1024) { toast('Gerador', 'A referência pode ter até 4 MB.', 'warning'); return; }
    E.refs.push({ fonte: 'upload', arquivo: f, nome: f.name, tipo: 'estilo', preview: URL.createObjectURL(f) }); desenharRefs();
  };
  $('#gAddComp').onclick = () => {
    const c = componenteEscolhido(); if (!c) { toast('Gerador', 'Escolha um componente na biblioteca primeiro.', 'warning'); return; }
    if (E.refs.some((r) => r.id === c.id)) return;
    E.refs.push({ fonte: 'componente', id: c.id, nome: c.nome, tipo: 'perspectiva', preview: c.arquivo }); desenharRefs();
  };

  $('#gGerar').onclick = async () => {
    const desc = $('#gDesc').value.trim(); if (desc.length < 3) { toast('Gerador', 'Descreva o componente.', 'warning'); return; }
    const m = modeloAtual(); if (!m) { toast('Gerador', 'Escolha um modelo.', 'warning'); return; }
    localStorage.setItem('studio.modelo', m.id);
    const fd = new FormData();
    fd.append('descricao', desc); fd.append('modelo', m.id); fd.append('categoria', $('#gCat').value); fd.append('sub', $('#gSub').value); fd.append('perspectiva', $('#gPersp').value);
    fd.append('referencias', JSON.stringify(E.refs.map((r) => (r.fonte === 'upload' ? { fonte: 'upload', tipo: r.tipo } : { fonte: 'componente', id: r.id, tipo: r.tipo }))));
    for (const r of E.refs) if (r.fonte === 'upload') fd.append('ref', r.arquivo);
    $('#gGerar').disabled = true; $('#gEstado').textContent = 'Gerando… isso pode levar até um minuto.';
    try {
      const r = await api.post('/estudio/gerador/gerar', fd);
      $('#gEstado').textContent = (r.avisos || []).join(' ');
      toast('Gerador', `${r.pendentes.length} imagem(ns) gerada(s) com ${r.modelo}. Revise abaixo antes de aprovar.`, 'success');
      await carregarPendentes();
    } catch (err) { $('#gEstado').textContent = ''; toast('Gerador', err.message, 'warning'); }
    $('#gGerar').disabled = false;
  };

  // ---------------------------------------------------------------- fila de pendentes
  async function carregarPendentes() {
    try { E.pendentes = (await api.get('/estudio/gerador/pendentes')).pendentes.slice().reverse(); } catch { E.pendentes = []; }
    $('#gN').textContent = String(E.pendentes.length);
    $('#gPend').innerHTML = E.pendentes.map((p) => `<div class="card" style="padding:8px;display:grid;gap:6px" data-p="${esc(p.id)}">
      <div class="muted" style="font-size:11px">${esc(p.modelo)} · ${esc(p.prompt.slice(0, 80))}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
        <div><div style="font-size:10px">Original</div><div style="${XADREZ};border-radius:6px;padding:4px"><img data-orig src="${esc(p.arquivo)}" alt="original" style="width:100%;max-height:120px;object-fit:contain;display:block"></div></div>
        <div><div style="font-size:10px">Como ficará <span data-info class="muted"></span></div><div style="${XADREZ};border-radius:6px;padding:4px"><canvas data-prev style="width:100%;max-height:120px;display:block;object-fit:contain"></canvas></div></div></div>
      <label style="font-size:12px"><input type="checkbox" data-remover checked> Remover o fundo</label>
      <label style="font-size:11px">Tolerância do fundo <input type="range" data-tol min="20" max="150" value="70" style="width:100%"></label>
      <label style="font-size:11px">Tamanho máximo (px) <input class="input" type="number" data-tam min="32" max="1024" value="256"></label>
      <input class="input" data-nome maxlength="60" placeholder="Nome do componente" value="${esc(p.prompt.slice(0, 40))}">
      <div class="row" style="gap:4px"><select class="input" data-cat style="flex:1">${cats.map((c) => `<option value="${c}" ${p.categoria === c ? 'selected' : ''}>${esc(CATEGORIAS[c].nome)}</option>`).join('')}</select><select class="input" data-sub style="flex:1"></select></div>
      <select class="input" data-mat>${MATERIAIS.map((m) => `<option>${m}</option>`).join('')}</select>
      <div class="row" style="gap:6px"><button class="btn primary sm" data-ok>Aprovar</button><button class="btn sm" data-no>Rejeitar</button></div></div>`).join('') || '<p class="muted" style="font-size:12px">Nada para aprovar. O que você gerar aparece aqui antes de entrar na biblioteca.</p>';
    for (const card of box.querySelectorAll('[data-p]')) montarCard(card, E.pendentes.find((x) => x.id === card.dataset.p));
  }

  function montarCard(card, p) {
    const q = (s) => card.querySelector(s);
    const subsCard = () => { const c = q('[data-cat]').value; q('[data-sub]').innerHTML = Object.entries(CATEGORIAS[c].sub).map(([k, n]) => `<option value="${k}" ${p.sub === k ? 'selected' : ''}>${esc(n)}</option>`).join(''); };
    q('[data-cat]').onchange = () => { p.sub = ''; subsCard(); }; subsCard();
    const orig = q('[data-orig]'); let pronto = null; let tempo = 0;
    // processa no navegador: fundo removido, recorte e redução; mostra o resultado antes de aprovar
    const processar = () => {
      if (!orig.naturalWidth) return;
      const c = document.createElement('canvas'); const maxLado = 1024; const f = Math.min(1, maxLado / Math.max(orig.naturalWidth, orig.naturalHeight));
      c.width = Math.round(orig.naturalWidth * f); c.height = Math.round(orig.naturalHeight * f);
      const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(orig, 0, 0, c.width, c.height);
      const dados = x.getImageData(0, 0, c.width, c.height);
      const r = prepararAsset(dados.data, c.width, c.height, { tolerancia: Number(q('[data-tol]').value), remover: q('[data-remover]').checked });
      const alvo = q('[data-prev]');
      if (r.erro) { q('[data-info]').textContent = `— ${r.erro}`; pronto = null; alvo.width = 4; alvo.height = 4; return; }
      const tmp = document.createElement('canvas'); tmp.width = r.w; tmp.height = r.h; tmp.getContext('2d').putImageData(new ImageData(r.rgba, r.w, r.h), 0, 0);
      const tam = Math.max(32, Math.min(1024, Number(q('[data-tam]').value) || 256)); const e = Math.min(1, tam / Math.max(r.w, r.h));
      alvo.width = Math.max(1, Math.round(r.w * e)); alvo.height = Math.max(1, Math.round(r.h * e));
      const ax = alvo.getContext('2d'); ax.imageSmoothingQuality = 'high'; ax.clearRect(0, 0, alvo.width, alvo.height); ax.drawImage(tmp, 0, 0, alvo.width, alvo.height);
      pronto = alvo;
      q('[data-info]').textContent = `— ${alvo.width}×${alvo.height}px · transparência ${r.info.transparencia}${r.info.aviso ? ` (${r.info.aviso})` : ''}`;
    };
    const agendar = () => { clearTimeout(tempo); tempo = setTimeout(processar, 120); };
    if (orig.complete) processar(); else orig.addEventListener('load', processar, { once: true });
    q('[data-tol]').oninput = agendar; q('[data-remover]').onchange = agendar; q('[data-tam]').oninput = agendar;
    q('[data-no]').onclick = async () => { await api.del(`/estudio/gerador/pendentes/${p.id}`); carregarPendentes(); };
    q('[data-ok]').onclick = async () => {
      if (!pronto) { toast('Gerador', 'A imagem não está pronta (veja o aviso ao lado).', 'warning'); return; }
      const blob = await new Promise((ok) => pronto.toBlob(ok, 'image/png'));
      const fd = new FormData(); fd.append('imagem', blob, 'componente.png'); fd.append('nome', q('[data-nome]').value || p.prompt.slice(0, 40));
      fd.append('categoria', q('[data-cat]').value); fd.append('sub', q('[data-sub]').value); fd.append('perspectiva', p.perspectiva); fd.append('material', q('[data-mat]').value);
      try {
        const r = await api.post(`/estudio/gerador/pendentes/${p.id}/aprovar`, fd);
        toast('Biblioteca', r.duplicado ? 'Esse arquivo já estava na biblioteca: usei o existente.' : 'Componente aprovado e adicionado à biblioteca.', r.duplicado ? 'info' : 'success');
        await carregarPendentes(); aoAprovar(r.componente);
      } catch (err) { toast('Gerador', err.message, 'warning'); }
    };
  }

  // ---------------------------------------------------------------- início
  (async () => {
    try { E.estado = await api.get('/estudio/gerador/estado'); } catch { E.estado = { chave: false }; }
    if (!E.estado.chave) { $('#gAviso').innerHTML = 'O OpenRouter ainda não está configurado: um administrador precisa salvar a chave em <b>Configurações → Assistente</b>. A chave fica só no servidor.'; await carregarPendentes(); return; }
    try { E.modelos = (await api.get('/estudio/gerador/modelos')).modelos; } catch (err) { $('#gAviso').textContent = `Não consegui listar os modelos de imagem: ${err.message}`; await carregarPendentes(); return; }
    if (!E.modelos.length) { $('#gAviso').textContent = 'O OpenRouter não listou nenhum modelo que gere imagens agora.'; await carregarPendentes(); return; }
    $('#gAviso').textContent = `${E.modelos.length} modelo(s) de imagem disponíveis.`;
    $('#gModelo').innerHTML = E.modelos.map((m) => `<option value="${esc(m.id)}">${esc(m.nome)} (referência: ${sim(m.aceitaReferencia)})</option>`).join('');
    const ultimo = localStorage.getItem('studio.modelo') || E.estado.modeloPadrao; if (ultimo && E.modelos.some((m) => m.id === ultimo)) $('#gModelo').value = ultimo;
    $('#gModelo').onchange = atualizarCap; atualizarCap(); desenharRefs();
    $('#gForm').style.display = 'flex'; await carregarPendentes();
  })();

  return { recarregar: carregarPendentes };
}
