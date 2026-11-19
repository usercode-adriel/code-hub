// Inventário — tudo o que você comprou, com efeito real: instalar, ativar, usar, presentear, revender, descartar.
import { shell, bindEntities, nx, api, esc, icon, toast, timeAgo, confirmDialog } from '../world/wui.js';
import { formModal } from '../ui.js';

const ACT = { instalar: ['Instalar', 'download'], ativar: ['Ativar', 'zap'], usar: ['Usar', 'play'], equipar: ['Equipar', 'check'], esconder: ['Esconder / tirar', 'eye'], transferir: ['Presentear', 'heart'], vender: ['Revender', 'wallet'], descartar: ['Descartar', 'trash'] };
const CATS = [['', 'Tudo'], ['tecnologia', 'Tecnologia'], ['celular', 'Celulares'], ['veiculos', 'Veículos'], ['social', 'Social'], ['geral', 'Consumo'], ['submundo', 'Submundo']];
const catOf = (it) => (it.phone ? 'celular' : it.category);
const STATE = { novo: 'Novo', instalado: 'Instalado', ativo: 'Ativo', usado: 'Usado', equipado: 'Equipado', guardado: 'Guardado', escondido: 'Escondido em casa' };
const INSTALLED = { central: ['Central de Comando', 'cpu', '#/centro'], mapa: ['Mapa Inteligente', 'pin', '#/mapa'], phone: ['Smartphone', 'chat', '#/social'], camera: ['Câmera', 'camera', '#/rede'], kit: ['Kit do Empreendedor', 'rocket', '#/empresas/empresa'] };

export default async function render(el) {
  const body = shell(el, 'inventario');
  bindEntities(body);
  let cat = '';
  const load = async () => {
    const d = await api.get('/mundo/inventario');
    const vip = d.vipUntil && d.vipUntil > new Date().toISOString();
    const inst = Object.entries(d.installed).filter(([k, v]) => v && INSTALLED[k]);
    const list = d.items.filter((it) => !cat || catOf(it) === cat);
    const total = d.items.reduce((n, it) => n + (it.price || 0), 0);
    body.innerHTML = `<div class="iv2">
      <header class="iv2-head cx-card"><span class="cx-h-ic" style="--c:#c084fc">${icon('layers', 18)}</span><div><h1>Inventário</h1><p class="cx-mut">${d.items.length} item(ns) · ${nx(total, 0)} investidos. Tudo o que você compra nas lojas do mapa fica aqui, com histórico.</p></div>
        <div class="iv-inst">${inst.map(([k]) => `<a class="w-chip ok" href="${INSTALLED[k][2]}">${icon(INSTALLED[k][1], 11)} ${INSTALLED[k][0]}</a>`).join('')}${vip ? `<span class="w-chip gold">${icon('star', 11)} VIP até ${new Date(d.vipUntil).toLocaleDateString('pt-BR')}</span>` : ''}</div></header>
      <div class="sh-chips">${CATS.filter(([k]) => !k || d.items.some((it) => catOf(it) === k)).map(([k, l]) => `<button data-cat="${k}" class="${cat === k ? 'on' : ''}">${l}${k ? ` (${d.items.filter((it) => catOf(it) === k).length})` : ''}</button>`).join('')}</div>
      ${list.length ? `<div class="iv2-grid">${list.map((it) => `<article class="iv2-item st-${esc(it.state)} ${it.illegal ? 'illegal' : ''}">
          <div class="iv2-art"><img src="${esc(it.art || '')}" alt="" onerror="this.style.visibility='hidden'"><span class="iv2-st">${STATE[it.state] || it.state}</span>${it.illegal ? '<span class="iv2-ill">clandestino</span>' : ''}</div>
          <b>${esc(it.name)}</b>
          <small class="cx-mut">${it.phone ? `${esc(it.phone.tierLabel)} · ${it.phone.apps} apps · ${it.phone.camera} MP` : esc(it.desc || '')}</small>
          <div class="iv-meta"><span>Pago <b>${nx(it.price, 0)}</b></span><span>${esc(it.placeName || '')}</span><span>${esc(timeAgo(it.acquiredAt))}</span></div>
          <div class="iv2-acts">${it.actions.map((a) => `<button class="cx-btn sm ${['instalar', 'ativar', 'usar', 'equipar'].includes(a) ? '' : 'ghost'}" data-id="${esc(it.id)}" data-a="${a}" title="${ACT[a]?.[0] || a}">${icon(ACT[a]?.[1] || 'check', 12)} ${['instalar', 'ativar', 'usar', 'equipar'].includes(a) ? (ACT[a]?.[0] || a) : ''}</button>`).join('')}</div>
          <details><summary>Histórico</summary><ul class="gm-hist">${it.history.map((h) => `<li><small class="cx-mut">${new Date(h.at).toLocaleDateString('pt-BR')}</small> ${esc(h.text)}</li>`).join('')}</ul></details></article>`).join('')}</div>`
        : `<div class="cx-card iv2-empty"><img src="/assets/items/central-comando.png" alt=""><b>${d.items.length ? 'Nada nesta categoria' : 'Inventário vazio'}</b><p class="cx-mut">Celulares, carros, softwares, câmera, Clube VIP e mais nas lojas do mapa.</p><a class="cx-btn" href="#/mercado">${icon('cart', 14)} Ir às lojas</a></div>`}
    </div>`;
    body.querySelectorAll('[data-cat]').forEach((b) => { b.onclick = () => { cat = b.dataset.cat; load(); }; });
    body.querySelectorAll('[data-a]').forEach((b) => { b.onclick = () => act(d, d.items.find((x) => x.id === b.dataset.id), b.dataset.a); });
  };
  const run = async (it, a, extra = {}) => {
    try { const r = await api.post(`/mundo/inventario/${encodeURIComponent(it.id)}/${a}`, extra); toast(`${ACT[a]?.[0] || a}: ${it.name}`, r.text || 'Pronto.', 'success'); await load(); return r; } catch (err) { toast('Não deu', err.message, 'error'); throw err; }
  };
  const act = async (d, it, a) => {
    if (a === 'transferir') {
      if (!d.friends.length) { toast('Sem amigos para presentear', 'Faça amizades na Rede primeiro.', 'info'); return; }
      return formModal({ title: `Presentear: ${it.name}`, submit: 'Dar de presente', fields: [{ name: 'personaId', label: 'Para quem', type: 'select', options: d.friends.map((f) => [f.id, f.name]) }], onSubmit: (v) => run(it, a, v) });
    }
    if (it.key === 'campanha' && a === 'usar') return formModal({ title: 'Lançar campanha', submit: 'Lançar', fields: [{ name: 'alvo', label: 'Divulgar', type: 'select', options: [...(d.hasCompany ? [['empresa', 'Minha empresa']] : []), ['perfil', 'Meu perfil']] }, { name: 'texto', label: 'Texto do anúncio', type: 'textarea', full: true }], onSubmit: (v) => run(it, a, v) });
    if (it.key === 'estudio' && a === 'usar') return formModal({ title: 'Sessão no estúdio', submit: 'Gravar', fields: [{ name: 'tipo', label: 'O que gravar', type: 'select', options: [['musica', 'Música'], ['podcast', 'Podcast']] }, { name: 'titulo', label: 'Título' }], onSubmit: (v) => run(it, a, v) });
    if (a === 'vender' && !(await confirmDialog('Revender item', `Alguém da cidade compra por cerca de ${it.state === 'novo' ? '50' : '35'}% do que você pagou. Continuar?`, 'Revender'))) return;
    if (a === 'descartar' && !(await confirmDialog('Descartar item', 'O item some do inventário para sempre.', 'Descartar'))) return;
    run(it, a).catch(() => {});
  };
  try { await load(); } catch (err) { body.innerHTML = `<div class="w-empty"><b>${esc(err.message)}</b></div>`; }
}
