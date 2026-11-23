// STRUCTURE STUDIO: painel da biblioteca de componentes (esquerda). Busca, categorias, subcategorias, filtros e importação.
// Carrega sob demanda: só uma página de miniaturas por vez (as imagens usam loading="lazy"); nada é carregado por inteiro.
import { api } from '../api.js';
import { esc, toast } from '../ui.js';
import { CATEGORIAS, MATERIAIS, PERSPECTIVAS_COMP, PRESETS } from './presets.js';

const POR_PAGINA = 60;

export function criarBiblioteca(box, { preset, aoEscolher }) {
  const F = { q: '', categoria: '', sub: '', origem: '', material: '', pagina: 0 };
  let ativo = null; let facetas = {}; let ultima = { componentes: [], total: 0 }; let pedido = 0;
  const cats = PRESETS[preset].categorias;

  box.innerHTML = `<div style="display:flex;flex-direction:column;gap:6px">
    <b>Biblioteca</b>
    <input class="input" id="bQ" placeholder="Buscar: janela, vidro, palmeira…" aria-label="Buscar componentes">
    <div class="row" id="bCats" style="gap:4px;flex-wrap:wrap"></div>
    <select class="input" id="bSub" aria-label="Subcategoria"><option value="">Todas as subcategorias</option></select>
    <div class="row" style="gap:4px">
      <select class="input" id="bOrigem" aria-label="Origem" style="flex:1"><option value="">Origem: todas</option><option value="existente">Existente</option><option value="importado">Importado</option><option value="gerado">Gerado</option></select>
      <select class="input" id="bMat" aria-label="Material" style="flex:1"><option value="">Material: todos</option>${MATERIAIS.map((m) => `<option value="${m}">${m}</option>`).join('')}</select>
    </div>
    <div id="bLista" style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;max-height:400px;overflow:auto"></div>
    <div class="row" style="gap:6px;align-items:center"><button class="btn sm" id="bMais" style="display:none">Mais</button><span class="muted" id="bInfo" style="font-size:11px"></span></div>
    <button class="btn sm" id="bImportar">+ Importar PNG</button>
    <div id="bForm" style="display:none"></div>
  </div>`;
  const $ = (s) => box.querySelector(s);

  async function carregar(anexar = false) {
    const meu = ++pedido;
    const p = new URLSearchParams({ preset, limite: POR_PAGINA, pagina: F.pagina });
    for (const k of ['q', 'categoria', 'sub', 'origem', 'material']) if (F[k]) p.set(k, F[k]);
    let r;
    try { r = await api.get(`/estudio/componentes?${p}`); } catch (err) { $('#bInfo').textContent = err.message; return; }
    if (meu !== pedido) return; // chegou uma resposta mais nova
    facetas = r.facetas;
    ultima = { componentes: anexar ? [...ultima.componentes, ...r.componentes] : r.componentes, total: r.total };
    desenharCats(); desenharSubs(); desenharLista();
  }

  function desenharCats() {
    const total = Object.values(facetas).reduce((n, f) => n + f.total, 0);
    $('#bCats').innerHTML = `<button class="btn sm ${F.categoria ? '' : 'primary'}" data-cat="">Todas (${total})</button>`
      + cats.filter((c) => facetas[c]).map((c) => `<button class="btn sm ${F.categoria === c ? 'primary' : ''}" data-cat="${c}">${esc(CATEGORIAS[c].nome)} (${facetas[c].total})</button>`).join('');
    box.querySelectorAll('[data-cat]').forEach((b) => { b.onclick = () => { F.categoria = b.dataset.cat; F.sub = ''; F.pagina = 0; carregar(); }; });
  }
  function desenharSubs() {
    const sel = $('#bSub');
    const subs = F.categoria ? (facetas[F.categoria]?.sub || {}) : {};
    sel.style.display = F.categoria ? '' : 'none';
    sel.innerHTML = `<option value="">Todas as subcategorias</option>${Object.entries(subs).map(([k, n]) => `<option value="${k}" ${F.sub === k ? 'selected' : ''}>${esc(CATEGORIAS[F.categoria].sub[k] || k)} (${n})</option>`).join('')}`;
  }
  function desenharLista() {
    const lista = $('#bLista');
    lista.innerHTML = ultima.componentes.map((c) => `<button data-id="${esc(c.id)}" title="${esc(c.nome)} · ${esc(CATEGORIAS[c.categoria]?.sub[c.sub] || c.sub)}" style="border:2px solid ${ativo?.id === c.id ? '#f2c94c' : 'transparent'};background:#111827;border-radius:8px;padding:4px;cursor:pointer;height:68px;display:flex;align-items:center;justify-content:center"><img src="${esc(c.arquivo)}" loading="lazy" decoding="async" alt="${esc(c.nome)}" style="max-width:100%;max-height:60px"></button>`).join('')
      || '<p class="muted" style="grid-column:1/-1;font-size:12px">Nenhum componente com esses filtros.</p>';
    lista.querySelectorAll('[data-id]').forEach((b) => { b.onclick = () => { ativo = ultima.componentes.find((c) => c.id === b.dataset.id); desenharLista(); aoEscolher(ativo); }; });
    $('#bMais').style.display = ultima.componentes.length < ultima.total ? '' : 'none';
    $('#bInfo').textContent = `${ultima.componentes.length} de ${ultima.total}`;
  }

  let espera = 0;
  $('#bQ').oninput = (e) => { clearTimeout(espera); espera = setTimeout(() => { F.q = e.target.value.trim(); F.pagina = 0; carregar(); }, 200); };
  $('#bSub').onchange = (e) => { F.sub = e.target.value; F.pagina = 0; carregar(); };
  $('#bOrigem').onchange = (e) => { F.origem = e.target.value; F.pagina = 0; carregar(); };
  $('#bMat').onchange = (e) => { F.material = e.target.value; F.pagina = 0; carregar(); };
  $('#bMais').onclick = () => { F.pagina++; carregar(true); };

  // importação: PNG + metadados; o servidor recusa arquivo repetido (mesmo hash) e devolve o que já existe
  $('#bImportar').onclick = () => {
    const f = $('#bForm');
    if (f.style.display !== 'none') { f.style.display = 'none'; return; }
    const catInicial = cats[0];
    f.style.display = 'block';
    f.innerHTML = `<div class="card" style="padding:8px;display:grid;gap:6px">
      <input type="file" id="iArq" accept="image/png">
      <input class="input" id="iNome" placeholder="Nome do componente" maxlength="60">
      <select class="input" id="iCat">${cats.map((c) => `<option value="${c}">${esc(CATEGORIAS[c].nome)}</option>`).join('')}</select>
      <select class="input" id="iSub"></select>
      <select class="input" id="iPersp">${PERSPECTIVAS_COMP.map((p) => `<option value="${p}" ${p === preset ? 'selected' : ''}>${p}</option>`).join('')}</select>
      <select class="input" id="iMat">${MATERIAIS.map((m) => `<option value="${m}">${m}</option>`).join('')}</select>
      <button class="btn primary sm" id="iEnviar">Importar</button></div>`;
    const subs = () => { const c = f.querySelector('#iCat').value; f.querySelector('#iSub').innerHTML = Object.entries(CATEGORIAS[c].sub).map(([k, n]) => `<option value="${k}">${esc(n)}</option>`).join(''); };
    f.querySelector('#iCat').onchange = subs; f.querySelector('#iCat').value = catInicial; subs();
    f.querySelector('#iEnviar').onclick = async () => {
      const arq = f.querySelector('#iArq').files[0];
      if (!arq) { toast('Importar', 'Escolha um arquivo PNG.', 'warning'); return; }
      const fd = new FormData();
      fd.append('imagem', arq);
      fd.append('nome', f.querySelector('#iNome').value || arq.name.replace(/\.png$/i, ''));
      fd.append('categoria', f.querySelector('#iCat').value); fd.append('sub', f.querySelector('#iSub').value);
      fd.append('perspectiva', f.querySelector('#iPersp').value); fd.append('material', f.querySelector('#iMat').value); fd.append('origem', 'importado');
      try {
        const r = await api.post('/estudio/componentes', fd);
        toast('Biblioteca', r.duplicado ? 'Esse arquivo já está na biblioteca: usei o existente.' : 'Componente importado.', r.duplicado ? 'info' : 'success');
        f.style.display = 'none'; F.pagina = 0; carregar();
      } catch (err) { toast('Importar', err.message, 'warning'); }
    };
  };

  carregar();
  return { ativo: () => ativo, recarregar: () => { F.pagina = 0; return carregar(); } };
}
