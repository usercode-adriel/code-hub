// STRUCTURE STUDIO (hub do Game Development Studio): edifícios, vias e estacionamentos montados com componentes,
// à mão, por IA ou nos dois. Também reúne as outras ferramentas de criação do jogo (Criar mapa, Personagens).
import { api } from '../api.js';
import { esc, toast } from '../ui.js';
import { PRESETS } from '../estudio/presets.js';

export default async function render(el, parts, params = new URLSearchParams()) {
  const id = params.get('id');
  if (id) {
    const { abrirEditor } = await import('../estudio/editor.js');
    return abrirEditor(el, id);
  }
  return hub(el);
}

async function hub(el) {
  let lista = []; let prefabs = [];
  try { [lista, prefabs] = await Promise.all([api.get('/estudio/estruturas').then((r) => r.estruturas), api.get('/estudio/prefabs').then((r) => r.prefabs)]); } catch (err) { el.innerHTML = `<section class="card"><p>${esc(err.message)}</p></section>`; return; }
  el.innerHTML = `<section class="card" style="padding:14px">
    <h3 class="title">Game Development Studio</h3>
    <p class="muted">Ferramentas para criar o mundo do jogo.</p>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin-top:10px">
      <a class="card" href="#/studio" style="padding:12px;text-decoration:none;border:2px solid #f2c94c"><b>Structure Studio</b><div class="muted" style="font-size:12px">Edifícios, vias e estacionamentos modulares (aqui)</div></a>
      <a class="card" href="#/criar-mapa" style="padding:12px;text-decoration:none"><b>Criar mapa</b><div class="muted" style="font-size:12px">Monte o mapa do jogo com os assets e as estruturas</div></a>
      <a class="card" href="#/personagens" style="padding:12px;text-decoration:none"><b>Personagens</b><div class="muted" style="font-size:12px">Gerador de personagens</div></a>
    </div></section>
    <section class="card" style="padding:14px;margin-top:12px">
      <h3 class="title">Structure Studio</h3>
      <p class="muted">Monte à mão, peça por peça; peça para a IA montar; ou combine: a IA monta e você edita cada componente.</p>
      <div class="row" style="gap:8px;flex-wrap:wrap;align-items:end">
        <label>Nome<input class="input" id="sNome" placeholder="Ex.: Delegacia do centro" maxlength="60" style="min-width:220px"></label>
        <label>Perspectiva<select class="input" id="sPreset">${Object.values(PRESETS).map((p) => `<option value="${p.id}">${esc(p.nome)}</option>`).join('')}</select></label>
        <label>Tipo<select class="input" id="sTipo"></select></label>
        <button class="btn primary" id="sNovo">Nova estrutura</button>
      </div>
      <div class="row" style="gap:8px;flex-wrap:wrap;align-items:end;margin-top:10px">
        <label style="flex:1;min-width:260px">Ou descreva e deixe a IA montar<input class="input" id="sIA" maxlength="300" placeholder="Ex.: delegacia pequena com estacionamento para 10 veículos e palmeiras"></label>
        <button class="btn" id="sNovoIA">✨ Criar com IA</button>
      </div>
      <p class="muted" id="sDesc" style="font-size:12px;margin-top:6px"></p>
      <div style="display:grid;gap:8px;margin-top:14px">${lista.map((e) => `<div class="card" style="padding:10px;display:flex;gap:10px;align-items:center;justify-content:space-between">
        <div><b>${esc(e.nome)}</b> <span class="chip">${esc(PRESETS[e.preset]?.nome || e.preset)}</span> ${e.prefab ? `<span class="chip">Prefab v${e.prefab.versao}</span>` : ''}${e.variacaoDe ? '<span class="chip">Variação</span>' : ''}
        <div class="muted" style="font-size:12px">${esc(e.tipo)} · ${e.area.w}×${e.area.h} células · ${e.componentes} componentes</div></div>
        <div class="row" style="gap:6px;flex-wrap:wrap"><a class="btn sm" href="#/studio?id=${e.id}">Editar</a><button class="btn sm" data-dup="${e.id}">Duplicar</button><button class="btn sm" data-var="${e.id}">Criar variação</button><button class="btn sm" data-del="${e.id}">Apagar</button></div></div>`).join('') || '<p class="muted">Nenhuma estrutura ainda. Crie a primeira acima.</p>'}</div>
    </section>
    <section class="card" style="padding:14px;margin-top:12px">
      <h3 class="title">Prefabs</h3>
      <p class="muted" style="font-size:12px">Estruturas prontas para o jogo: imagem, área ocupada, colisões e entradas.</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:8px;margin-top:8px">${prefabs.map((p) => `<div class="card" style="padding:8px;display:flex;gap:8px;align-items:center">
        <img src="${esc(p.arquivo)}" alt="${esc(p.nome)}" loading="lazy" style="width:72px;height:56px;object-fit:contain;background:#111827;border-radius:8px">
        <div style="flex:1;min-width:0"><b>${esc(p.nome)}</b> <span class="chip">v${p.versao}</span><div class="muted" style="font-size:12px">${p.pegada.w}×${p.pegada.d} · ${p.entradas} entrada(s) · ${p.colisoes} colisão(ões)</div></div>
        <a class="btn sm" href="#/criar-mapa" title="Abre o Criar mapa: a estrutura está na aba Estruturas">Usar no mapa</a><button class="btn sm" data-exp="${p.id}">Exportar</button><button class="btn sm" data-delp="${p.id}">Apagar</button></div>`).join('') || '<p class="muted">Nenhum prefab ainda. Abra uma estrutura e use "Salvar como prefab".</p>'}</div>
    </section>`;
  const preset = el.querySelector('#sPreset'); const tipo = el.querySelector('#sTipo');
  const atualizar = () => {
    const p = PRESETS[preset.value];
    tipo.innerHTML = p.tipos.map((t) => `<option value="${t}">${esc(t)}</option>`).join('');
    el.querySelector('#sDesc').textContent = p.descricao;
  };
  preset.onchange = atualizar; atualizar();
  el.querySelector('#sNovoIA').onclick = async () => {
    const desc = el.querySelector('#sIA').value.trim(); if (!desc) { toast('Studio', 'Descreva a estrutura para a IA.', 'warning'); return; }
    try {
      const e = await api.post('/estudio/estruturas', { nome: el.querySelector('#sNome').value.trim() || desc.slice(0, 40), preset: preset.value, tipo: tipo.value });
      sessionStorage.setItem(`studio.ia.${e.id}`, desc); location.hash = `#/studio?id=${e.id}`;
    } catch (err) { toast('Studio', err.message, 'warning'); }
  };
  el.querySelector('#sNovo').onclick = async () => {
    try {
      const e = await api.post('/estudio/estruturas', { nome: el.querySelector('#sNome').value.trim() || 'Nova estrutura', preset: preset.value, tipo: tipo.value });
      location.hash = `#/studio?id=${e.id}`;
    } catch (err) { toast('Studio', err.message, 'warning'); }
  };
  const copiar = (id, variacao) => async () => { try { const e = await api.post(`/estudio/estruturas/${id}/duplicar`, { variacao }); toast('Studio', variacao ? 'Variação criada.' : 'Estrutura duplicada.', 'success'); location.hash = `#/studio?id=${e.id}`; } catch (err) { toast('Studio', err.message, 'warning'); } };
  el.querySelectorAll('[data-dup]').forEach((b) => { b.onclick = copiar(b.dataset.dup, false); });
  el.querySelectorAll('[data-var]').forEach((b) => { b.onclick = copiar(b.dataset.var, true); });
  el.querySelectorAll('[data-exp]').forEach((b) => { b.onclick = async () => {
    try {
      const pacote = await api.get(`/estudio/prefabs/${b.dataset.exp}/exportar`);
      const url = URL.createObjectURL(new Blob([JSON.stringify(pacote)], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = `${pacote.prefab.nome.replace(/[^\w.-]+/g, '-')}.prefab.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) { toast('Studio', err.message, 'warning'); }
  }; });
  el.querySelectorAll('[data-delp]').forEach((b) => { b.onclick = async () => { if (!confirm('Apagar este prefab? A estrutura original continua.')) return; try { await api.del(`/estudio/prefabs/${b.dataset.delp}`); hub(el); } catch (err) { toast('Studio', err.message, 'warning'); } }; });
  el.querySelectorAll('[data-del]').forEach((b) => { b.onclick = async () => { if (!confirm('Apagar esta estrutura?')) return; await api.del(`/estudio/estruturas/${b.dataset.del}`); hub(el); }; });
}
