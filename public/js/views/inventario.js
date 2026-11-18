// Inventário — tudo o que você comprou, com efeito real: instalar, ativar, usar, presentear, revender, descartar.
import { shell, bindEntities, nx, api, esc, icon, toast, timeAgo, confirmDialog } from '../world/wui.js';
import { formModal } from '../ui.js';

const ACT = { instalar: ['Instalar', 'download'], ativar: ['Ativar', 'zap'], usar: ['Usar', 'play'], transferir: ['Presentear', 'heart'], vender: ['Revender', 'wallet'], descartar: ['Descartar', 'trash'] };
const STATE = { novo: 'Novo', instalado: 'Instalado', ativo: 'Ativo', usado: 'Usado' };
const INSTALLED = { central: ['Central de Comando', 'cpu', '#/centro'], mapa: ['Mapa Inteligente', 'pin', '#/mapa'], phone: ['Smartphone', 'chat', '#/social'], camera: ['Câmera', 'camera', '#/rede'], kit: ['Kit do Empreendedor', 'rocket', '#/empresas/empresa'] };

export default async function render(el) {
  const body = shell(el, 'inventario');
  bindEntities(body);
  const load = async () => {
    const d = await api.get('/mundo/inventario');
    const vip = d.vipUntil && d.vipUntil > new Date().toISOString();
    const inst = Object.entries(d.installed).filter(([k, v]) => v && INSTALLED[k]);
    body.innerHTML = `<div class="iv">
      <section class="w-panel iv-top"><div><h1>${icon('layers', 22)} Inventário</h1><p class="muted">${d.items.length} item(ns). Itens comprados nas lojas do mapa ficam aqui com histórico completo.</p></div>
        <div class="iv-inst">${inst.map(([k]) => `<a class="w-chip ok" href="${INSTALLED[k][2]}">${icon(INSTALLED[k][1], 11)} ${INSTALLED[k][0]}</a>`).join('')}${vip ? `<span class="w-chip gold">${icon('star', 11)} VIP até ${new Date(d.vipUntil).toLocaleDateString('pt-BR')}</span>` : ''}<span class="w-chip">Memória dos amigos: ${d.memCap} lembranças</span></div></section>
      ${d.items.length ? `<div class="iv-grid">${d.items.map((it) => `<article class="w-panel iv-item ${esc(it.state)}"><div class="iv-h"><span class="mk-ic sm">${icon(it.icon, 16)}</span><div><b>${esc(it.name)}</b><small>${STATE[it.state] || it.state} · ${esc(it.compatibility)}</small></div></div>
          <p class="muted">${esc(it.desc || '')}</p>
          <div class="iv-meta"><span>Pago: <b>${nx(it.price, 0)}</b></span><span>${esc(it.placeName || '')}</span><span>${esc(timeAgo(it.acquiredAt))}</span></div>
          <details><summary>Histórico</summary><ul class="gm-hist">${it.history.map((h) => `<li><small class="muted">${new Date(h.at).toLocaleDateString('pt-BR')}</small> ${esc(h.text)}</li>`).join('')}</ul></details>
          <div class="iv-acts">${it.actions.map((a) => `<button class="btn sm ${['instalar', 'ativar', 'usar'].includes(a) ? 'primary' : a === 'descartar' ? 'ghost' : 'outline'}" data-id="${esc(it.id)}" data-a="${a}">${icon(ACT[a]?.[1] || 'check', 12)} ${ACT[a]?.[0] || a}</button>`).join('')}</div></article>`).join('')}</div>`
        : `<div class="w-panel w-empty">${icon('bag', 30)}<b>Inventário vazio</b><p class="muted">Vá ao Mercado: Central de Comando, Mapa Inteligente, smartphone, câmera, Clube VIP e mais.</p><a class="btn primary" href="#/mercado">Abrir o Mercado</a></div>`}
    </div>`;
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
