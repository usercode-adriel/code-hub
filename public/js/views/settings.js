// Configurações: aparência (temas + editor de cores/layout), rotina, assistente, notificações, dados
// e Administração (usuários, sistema, imagens, backup, rede/celular, CSS, menu, logs, reinício).
import { api, auth } from '../api.js';
import { store, applySettings, emit } from '../store.js';
import { icon } from '../icons.js';
import { esc, toast, confirmDialog, formModal, validateImage, pickImage, modal } from '../ui.js';
import { THEMES, COLOR_LABELS, resolveTheme, presetLayout } from '../theme.js';
import { PERSONA } from '../chatui.js';
import { NAV_KEYS } from '../app.js';
import { AVATAR_SLOTS } from '../avatars.js';

const TABS = [['aparencia', 'Aparência', 'palette'], ['rotina', 'Rotina', 'sun'], ['assistente', 'Assistente', 'bot'], ['conexoes', 'Conexões', 'link'], ['dev', 'Desenvolvedor', 'code'], ['notificacoes', 'Notificações', 'bell'], ['dados', 'Dados', 'download'], ['admin', 'Administração', 'shield']];
const AVATARS = ['🤖', '🦉', '🐱', '🦊', '🐼', '🧠', '👾', '🚀', '🌵', '🧙', '🐉', '⚡'];
const fmtSize = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

let pending = {}; let saveT = null;
function patch(p, now = false) {
  Object.assign(pending, p);
  applySettings({ ...store.settings, ...p });
  clearTimeout(saveT);
  const run = async () => { const body = pending; pending = {}; try { applySettings(await api.put('/settings', body)); } catch (e) { toast('Erro ao salvar', e.message, 'error'); } };
  if (now) return run();
  saveT = setTimeout(run, 400);
}
const sw = (key, label, hint = '') => `<div class="setting-row"><div class="txt"><b>${label}</b>${hint ? `<small>${hint}</small>` : ''}</div><label class="switch"><input type="checkbox" data-sw="${key}" ${store.settings[key] !== false ? 'checked' : ''}><span></span></label></div>`;
const seg = (key, opts, cur) => `<div class="seg" data-seg="${key}">${opts.map(([v, l]) => `<button type="button" data-v="${v}" class="${String(cur) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
const row = (label, hint, ctrl) => `<div class="setting-row"><div class="txt"><b>${label}</b>${hint ? `<small>${hint}</small>` : ''}</div>${ctrl}</div>`;
function bindCommon(box, redraw) {
  box.querySelectorAll('[data-sw]').forEach((i) => { i.onchange = () => patch({ [i.dataset.sw]: i.checked }); });
  box.querySelectorAll('[data-seg]').forEach((g) => g.querySelectorAll('[data-v]').forEach((b) => { b.onclick = () => {
    const v = /^\d+$/.test(b.dataset.v) ? Number(b.dataset.v) : b.dataset.v;
    g.querySelectorAll('[data-v]').forEach((x) => x.classList.toggle('on', x === b));
    patch({ [g.dataset.seg]: v }); if (redraw) redraw();
  }; }));
  box.querySelectorAll('[data-set]').forEach((i) => { i.onchange = () => { const v = i.type === 'number' ? Number(i.value) : i.value; patch({ [i.dataset.set]: v }); }; });
}

// ---------------- Aparência ----------------
function appearance(box) {
  const s = store.settings;
  const { vars } = resolveTheme(s);
  const card = ([k, t]) => `<button class="theme-card ${t.group === 'premium' ? 'prem' : ''} ${s.theme === k ? 'on' : ''}" data-theme="${k}" style="--p-accent2:${t.vars.accent2 || t.vars.accent};--p-bg:${t.vars.bg};--p-side:${t.vars.sidebar};--p-card:${t.vars.card};--p-accent:${t.vars.accent};--p-text:${t.vars.text};--p-muted:${t.vars.muted}">
        <div class="preview"><div class="side"><i></i><i></i><i></i><i></i></div><div class="main"><div class="hero-p"><b></b></div><div class="row"><span></span><span></span><span></span></div></div></div><div class="label">${esc(t.name)}<small>${esc(t.desc)}</small></div></button>`;
  const group = (g) => Object.entries(THEMES).filter(([, t]) => t.group === g).map(card).join('');
  box.innerHTML = `<section class="card"><h3 class="title">${icon('palette', 15)} Cores básicas</h3><p class="sub">Mudam só as cores do sistema.</p>
      <div class="theme-grid">${group('basic')}</div></section>
    <section class="card" style="margin-top:var(--gap)"><h3 class="title">${icon('sparkles', 15)} Temas prontos</h3><p class="sub">Cores com efeitos e personalidade (Matrix tem chuva de código, Gamer tem neon...). Desligue os efeitos em “Layout” se preferir algo mais calmo.</p>
      <div class="theme-grid">${group('preset')}</div></section>
    <section class="card" style="margin-top:var(--gap)" id="premSec"><h3 class="title">${icon('sparkles', 15)} Temas premium</h3>
      <div class="prem-banner"><span class="th" style="width:42px;height:42px;border-radius:14px;display:grid;place-items:center;background:linear-gradient(115deg,var(--accent),var(--accent-2));color:#fff">${icon('layers', 20)}</span><div><b>Início em vidro, degradê e personagens 3D</b><small>Os temas premium trocam o layout do Início (cartões em vidro, destaque grande e banner do assistente) e deixam os personagens saírem do cartão com um movimento leve. Dá para mudar todas as cores em “Cores personalizadas”.</small></div></div>
      <div class="theme-grid">${group('premium')}</div>
      ${row('Layout do início', 'O premium funciona com qualquer cor de tema', seg('layout', [['classic', 'Clássico'], ['premium', 'Premium']], s.layout || 'classic'))}
      ${store.user.role === 'admin' ? '<div class="av-admin" id="avAdmin"></div>' : ''}</section>
    <section class="card" style="margin-top:var(--gap)"><div class="section-head"><h3>${icon('edit', 14)} Cores personalizadas</h3><button class="see-more" id="resetColors">${icon('refresh', 12)} Restaurar cores do tema</button></div>
      <div class="color-grid">${Object.entries(COLOR_LABELS).map(([k, l]) => `<label class="color-field"><input type="color" data-color="${k}" value="${vars[k]}"><span>${l}<small>${vars[k]}</small></span></label>`).join('')}</div></section>
    <section class="card" style="margin-top:var(--gap)"><h3 class="title">${icon('columns', 15)} Layout</h3>
      ${row('Cantos arredondados', '', `<div class="range-row" style="width:240px"><input type="range" min="0" max="28" value="${s.radius}" data-range="radius"><output>${s.radius}px</output></div>`)}
      ${row('Tamanho do texto', '', `<div class="range-row" style="width:240px"><input type="range" min="85" max="120" step="5" value="${s.fontScale}" data-range="fontScale"><output>${s.fontScale}%</output></div>`)}
      ${row('Fonte', '', seg('fontFamily', [['poppins', 'Poppins'], ['system', 'Sistema'], ['mono', 'Mono'], ['serif', 'Serifada']], s.fontFamily))}
      ${row('Densidade', '', seg('density', [['comfortable', 'Confortável'], ['compact', 'Compacta']], s.density))}
      ${sw('effects', 'Efeitos do tema', 'Neve, chuva, neon, brilhos e animações')}${sw('heroAutoplay', 'Destaque do início muda sozinho')}</section>`;
  box.querySelectorAll('[data-theme]').forEach((b) => { b.onclick = () => { patch({ theme: b.dataset.theme, themeVars: {}, ...presetLayout(b.dataset.theme) }); appearance(box); }; });
  box.querySelectorAll('[data-color]').forEach((i) => {
    i.oninput = () => { i.nextElementSibling.querySelector('small').textContent = i.value; applySettings({ ...store.settings, themeVars: { ...store.settings.themeVars, [i.dataset.color]: i.value } }); };
    i.onchange = () => patch({ themeVars: { ...store.settings.themeVars, [i.dataset.color]: i.value } });
  });
  box.querySelector('#resetColors').onclick = () => { patch({ themeVars: {} }); appearance(box); };
  box.querySelectorAll('[data-range]').forEach((r) => {
    r.oninput = () => { r.nextElementSibling.textContent = `${r.value}${r.dataset.range === 'radius' ? 'px' : '%'}`; applySettings({ ...store.settings, [r.dataset.range]: Number(r.value) }); };
    r.onchange = () => patch({ [r.dataset.range]: Number(r.value) });
  });
  bindCommon(box, () => {});
  if (store.user.role === 'admin') avatarAdmin(box.querySelector('#avAdmin'));
}

// Avatares PNG (só o administrador vê): liga/desliga, envia arquivos e escolhe qual vai em cada cartão.
function avatarAdmin(wrap) {
  if (!wrap) return;
  const A = () => store.avatars || { enabled: true, items: [], slots: {} };
  const apply = (a) => { store.avatars = a; emit('system', { avatars: a }); };
  const paint = () => {
    const a = A();
    wrap.innerHTML = `<h4>${icon('image', 15)} Avatares dos cartões <span class="tag">só administradores</span></h4>
      <p class="sub" style="margin:0 0 6px">Envie PNGs com fundo transparente (personagens, mascotes). Eles saem levemente do cartão, com movimento suave, no Início e na tela de login. Vale para todos os usuários.</p>
      <div class="setting-row"><div class="txt"><b>Mostrar avatares</b><small>Desligue para esconder todos sem apagar os arquivos</small></div><label class="switch"><input type="checkbox" id="avOn" ${a.enabled ? 'checked' : ''}><span></span></label></div>
      <div class="av-drop" id="avDrop">${icon('upload', 22)}<b>Clique ou arraste PNGs aqui</b><span>PNG ou WEBP transparente · até 8 MB cada · até 24 avatares</span></div>
      ${a.items.length ? `<div class="av-gallery">${a.items.map((i) => `<div class="av-item" data-id="${i.id}"><div class="thumb"><img src="${esc(i.url)}" alt=""></div><div class="nm" title="${esc(i.name)}">${esc(i.name)}</div><button class="x" data-del="${i.id}" title="Excluir" aria-label="Excluir ${esc(i.name)}">${icon('x', 12)}</button></div>`).join('')}</div>
        <h4 style="margin-top:18px;font-size:13px">Onde cada avatar aparece</h4>
        <div class="av-slots">${AVATAR_SLOTS.map(([k, l]) => `<label>${l}<select class="input" data-slot="${k}"><option value="auto">Automático</option><option value="none">Nenhum</option>${a.items.map((i) => `<option value="${i.id}" ${a.slots[k] === i.id ? 'selected' : ''}>${esc(i.name)}</option>`).join('')}</select></label>`).join('')}</div>` : '<p class="sub" style="margin-top:6px">Nenhum avatar ainda. Sem avatares o início premium usa apenas os brilhos do tema.</p>'}`;
    wrap.querySelectorAll('[data-slot]').forEach((sel) => { if (!A().slots[sel.dataset.slot] || A().slots[sel.dataset.slot] === 'auto') sel.value = 'auto'; if (A().slots[sel.dataset.slot] === 'none') sel.value = 'none'; });
    wrap.querySelector('#avOn').onchange = async (e) => { try { apply(await api.put('/admin/avatars', { enabled: e.target.checked })); toast(e.target.checked ? 'Avatares ligados' : 'Avatares escondidos', '', 'success'); } catch (err) { toast('Erro', err.message, 'error'); } };
    const send = async (files) => {
      for (const f of [...files]) {
        if (!/^image\/(png|webp)$/.test(f.type)) { toast('Formato inválido', `${f.name}: use PNG ou WEBP transparente.`, 'error'); continue; }
        if (f.size > 8 * 1024 * 1024) { toast('Arquivo grande', `${f.name} passa de 8 MB.`, 'error'); continue; }
        try { apply(await api.upload('/admin/avatars', f)); } catch (err) { toast('Erro no envio', err.message, 'error'); }
      }
      paint();
    };
    const drop = wrap.querySelector('#avDrop');
    drop.onclick = () => { const i = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/png,image/webp', multiple: true }); i.onchange = () => send(i.files); i.click(); };
    drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
    drop.ondragleave = () => drop.classList.remove('over');
    drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); send(e.dataTransfer.files); };
    wrap.querySelectorAll('[data-del]').forEach((b) => { b.onclick = async () => { if (!await confirmDialog('Excluir avatar?', 'Os cartões que usavam esse avatar voltam para o modo automático.')) return; apply(await api.del(`/admin/avatars/${b.dataset.del}`)); paint(); }; });
    wrap.querySelectorAll('[data-slot]').forEach((sel) => { sel.onchange = async () => { apply(await api.put('/admin/avatars', { slots: { [sel.dataset.slot]: sel.value } })); }; });
  };
  paint();
}

// ---------------- Rotina ----------------
function routine(box) {
  const s = store.settings;
  const num = (k, min, max, step = 1) => `<input class="input" type="number" min="${min}" max="${max}" step="${step}" data-set="${k}" value="${s[k]}" style="width:90px">`;
  box.innerHTML = `<section class="card"><h3 class="title">${icon('sun', 15)} Briefing e rotina</h3><p class="sub">Tudo calculado no seu computador, sem IA e sem internet.</p>
    ${sw('briefingEnabled', 'Briefing automático', 'Todo dia, no horário abaixo, chega uma notificação com agenda, pendências, contas e prioridades')}
    ${sw('weeklyReview', 'Revisão semanal', 'Domingo, no horário de encerramento do dia, o assistente manda o resumo da semana e os focos da próxima')}
    ${row('Horário do briefing', '', `<input class="input" type="time" data-set="briefingTime" value="${s.briefingTime}">`)}
    ${row('Encerramento do dia', 'Lembrete para registrar o que fez e planejar amanhã', `<input class="input" type="time" data-set="dayCloseTime" value="${s.dayCloseTime}">`)}
    ${row('Pomodoro (minutos)', '', num('pomodoroMinutes', 5, 90))}
    ${row('Meta diária de cartões de inglês', '', num('englishDailyGoal', 5, 200))}
    ${row('Meta de livros no ano', '', num('readingYearGoal', 1, 200))}
    ${row('Avisar contas e assinaturas com antecedência (dias)', '', num('remindDaysBefore', 0, 30))}
    <div class="form-actions"><a class="btn outline" href="#/hoje">${icon('sun', 13)} Ver o briefing de hoje</a></div></section>`;
  bindCommon(box);
}

// ---------------- Assistente ----------------
const CLOUD_UI = {
  groq: { label: 'Groq', link: 'console.groq.com/keys', ph: 'gsk_...', hint: 'É muito rápido e usa modelos abertos como o Llama. O plano grátis tem limite por minuto e por dia.' },
  openrouter: { label: 'OpenRouter', link: 'openrouter.ai/keys', ph: 'sk-or-...', hint: 'Uma chave dá acesso a vários modelos gratuitos (os que terminam em :free). A lista de modelos grátis muda com frequência.' },
};
function cloudCard(ai, n) {
  const c = ai.cloud[n]; const u = CLOUD_UI[n];
  return `<section class="card" style="margin-top:var(--gap)"><h3 class="title">${icon('zap', 15)} ${u.label}</h3>
    <p class="sub">${c.configured ? `Chave configurada <span class="chip ok">${esc(c.hint || '')}</span>` : `Crie uma chave grátis em <b>${u.link}</b> e cole aqui. ${u.hint}`}</p>
    <form class="form" data-cform="${n}"><div class="form-row"><div class="field"><label>${c.configured ? 'Trocar a chave' : 'Chave da API'}</label><input type="password" name="key" autocomplete="off" placeholder="${u.ph}"></div>
      <div class="field"><label>Modelo</label><select data-cmodel="${n}" ${c.configured ? '' : 'disabled'}><option value="">Automático (recomendado)</option>${c.model ? `<option value="${esc(c.model)}" selected>${esc(c.model)}</option>` : ''}</select></div></div>
      <div class="form-actions">${c.configured ? `<button type="button" class="btn danger" data-cdel="${n}" style="margin-right:auto">Remover chave</button>` : ''}<button class="btn primary">Salvar e testar</button></div></form>
    <p class="muted" style="font-size:11px;margin:10px 0 0">A chave fica só no seu computador (arquivo .env) e não vai para os backups. Nos planos gratuitos, o provedor pode registrar ou usar as conversas para melhorar os produtos dele. Fotos e PDFs só o Gemini lê; sem ele, o ${u.label} responde apenas texto (e fotos, quando o modelo enxerga).</p></section>`;
}
async function assistantTab(box) {
  const s = store.settings;
  let ai = null;
  try { ai = await api.get('/ai/status'); } catch { /* sem acesso */ }
  box.innerHTML = `<section class="card"><h3 class="title">${icon('bot', 15)} Assistente</h3><p class="sub">Com uma IA na nuvem ligada (Gemini, Groq ou OpenRouter), ele conversa, consulta seus dados, pesquisa na web, gera imagens e arquivos e faz coisas no sistema por você (registrar, criar, pagar, marcar...). Se você escrever em inglês, ele responde em inglês.</p>
      ${sw('assistantEnabled', 'Assistente ligado')}
      ${row('Nome', '', `<input class="input" data-set="assistantName" value="${esc(s.assistantName)}" maxlength="40" style="width:200px">`)}
      ${row('Como ele te chama', 'Apelido (opcional)', `<input class="input" data-set="assistantNickname" value="${esc(s.assistantNickname || '')}" maxlength="40" style="width:200px">`)}
      ${row('Avatar', '', `<div class="icon-pick">${AVATARS.map((a) => `<button type="button" data-av="${a}" class="${s.assistantAvatar === a ? 'on' : ''}" style="font-size:18px">${a}</button>`).join('')}</div>`)}
      ${row('Tamanho das respostas', '', seg('assistantLength', [['curta', 'Curtas'], ['media', 'Médias'], ['detalhada', 'Detalhadas']], s.assistantLength))}
      <div class="field" style="margin-top:14px"><label>Personalidade</label><div class="persona-grid">${Object.entries(PERSONA).map(([k, p]) => `<button class="persona ${s.assistantPersonality === k ? 'on' : ''}" data-pe="${k}"><span class="pe">${p.emoji}</span><b>${p.label}</b><small>${p.desc}</small></button>`).join('')}</div></div>
      <div class="field" style="margin-top:14px"><label>Instruções extras</label><textarea class="input" data-set="assistantInstructions" rows="3" maxlength="600" placeholder="Ex.: sempre me lembre de beber água; responda em tom motivador.">${esc(s.assistantInstructions || '')}</textarea></div></section>
    <section class="card" style="margin-top:var(--gap)"><h3 class="title">${icon('cpu', 15)} Modo de resposta</h3>
      <p class="sub">Atual: <b>${{ gemini: 'Gemini (Google, pela internet)', groq: 'Groq (pela internet)', openrouter: 'OpenRouter (pela internet)', ollama: 'IA local (Ollama)', claude: 'Claude (internet)' }[ai?.mode] || 'Sem IA — base de conhecimento + comandos (rápido e leve)'}</b>${ai?.cloudOrder?.length > 1 ? ` · reservas: ${ai.cloudOrder.slice(1).map((n) => ({ gemini: 'Gemini', groq: 'Groq', openrouter: 'OpenRouter' }[n])).join(', ')}` : ''}</p>
      ${ai?.isAdmin ? `<div class="seg" id="prov">${[['local', 'Sem IA'], ['auto', 'Automático'], ['gemini', 'Gemini'], ['groq', 'Groq'], ['openrouter', 'OpenRouter'], ['ollama', 'IA local (Ollama)'], ['claude', 'Claude']].map(([v, l]) => `<button data-v="${v}" class="${ai.config.provider === v ? 'on' : ''}">${l}</button>`).join('')}</div>
        <p class="muted" style="font-size:11.5px;margin-top:10px">“Sem IA” responde na hora sobre o sistema e executa comandos. <b>Gemini</b>, <b>Groq</b> e <b>OpenRouter</b> conversam sobre qualquer assunto usando cotas gratuitas (precisam de internet e da chave abaixo). Pode ligar mais de uma: se a principal falhar ou a cota acabar, o sistema usa as outras sozinho, e cada personagem pode ter a sua IA. Os comandos (/gasto, /corrida, /tarefa...) continuam funcionando em qualquer modo.</p>` : '<p class="muted">Somente o administrador pode trocar o modo.</p>'}</section>
    ${ai?.isAdmin ? `<section class="card" style="margin-top:var(--gap)"><h3 class="title">${icon('sparkles', 15)} Gemini (Google)</h3>
      <p class="sub">${ai.gemini.configured ? `Chave configurada <span class="chip ok">${esc(ai.gemini.hint || '')}</span>` : 'Crie uma chave grátis em <b>aistudio.google.com</b> → “Get API key” e cole aqui.'}</p>
      <form class="form" id="gemForm"><div class="form-row"><div class="field"><label>${ai.gemini.configured ? 'Trocar a chave' : 'Chave da API'}</label><input type="password" name="key" autocomplete="off" placeholder="Cole a chave aqui"></div>
        <div class="field"><label>Modelo</label><select id="gemModel">${ai.gemini.models.map((m) => `<option value="${m.name}" ${ai.config.geminiModel === m.name ? 'selected' : ''}>${esc(m.label)} — ${esc(m.desc)}</option>`).join('')}</select></div></div>
        <div class="form-actions">${ai.gemini.configured ? '<button type="button" class="btn danger" id="gemDel" style="margin-right:auto">Remover chave</button>' : ''}<button class="btn primary" id="gemSave">Salvar e testar</button></div></form>
      <p class="muted" style="font-size:11px;margin:10px 0 0">A chave fica só no seu computador (arquivo .env da pasta de dados) e não vai para os backups. No plano gratuito, o Google pode usar as conversas para melhorar os produtos dele: o assistente envia sua mensagem e um resumo do dia (prioridades, agenda e saldo do InDrive). Se o Gemini estiver ocupado ou a cota acabar, o assistente tenta outro modelo grátis e, por fim, volta ao modo sem IA.</p></section>
    ${['groq', 'openrouter'].map((n) => cloudCard(ai, n)).join('')}` : ''}
    <section class="card" style="margin-top:var(--gap)"><h3 class="title">${icon('sparkles', 15)} Recursos do chat</h3><p class="sub">O que a IA pode fazer quando você pedir (precisa de uma IA na nuvem ligada).</p>
      ${sw('chatWeb', 'Pesquisar na web', 'Busca na internet e responde com links e fontes; também abre páginas que você mandar')}${sw('chatImages', 'Gerar imagens', 'Cria ilustrações e fotos a partir de uma descrição')}${sw('chatFiles', 'Criar arquivos', 'Gera PDF, Word, planilha, CSV, texto e outros, com link para baixar')}</section>`;
  box.querySelectorAll('[data-av]').forEach((b) => { b.onclick = () => { patch({ assistantAvatar: b.dataset.av }); box.querySelectorAll('[data-av]').forEach((x) => x.classList.toggle('on', x === b)); }; });
  box.querySelectorAll('[data-pe]').forEach((b) => { b.onclick = () => { patch({ assistantPersonality: b.dataset.pe }); box.querySelectorAll('[data-pe]').forEach((x) => x.classList.toggle('on', x === b)); }; });
  box.querySelectorAll('#prov [data-v]').forEach((b) => { b.onclick = async () => {
    if (b.dataset.v === 'gemini' && !ai.gemini.configured) { toast('Falta a chave do Gemini', 'Cole a chave no quadro abaixo e clique em “Salvar e testar”.', 'error'); return; }
    const r = await api.put('/ai/config', { provider: b.dataset.v }); store.aiMode = r.mode; toast('Modo do assistente', `Agora: ${r.mode === 'local' ? 'sem IA' : r.mode}`, 'success'); assistantTab(box);
  }; });
  for (const n of ['groq', 'openrouter']) {
    const sel = box.querySelector(`[data-cmodel="${n}"]`);
    if (sel && ai.cloud[n].configured) api.get(`/ai/models/${n}`).then(({ models }) => {
      const cur = ai.cloud[n].model;
      sel.innerHTML = `<option value="">Automático (recomendado)</option>${models.map((m) => `<option value="${esc(m.id)}" ${m.id === cur ? 'selected' : ''}>${esc(m.id)}${m.ctx ? ` · ${Math.round(m.ctx / 1000)}k` : ''}</option>`).join('')}${cur && !models.some((m) => m.id === cur) ? `<option value="${esc(cur)}" selected>${esc(cur)}</option>` : ''}`;
    }).catch(() => {});
    sel?.addEventListener('change', async () => { await api.put('/ai/config', { [`${n}Model`]: sel.value }); toast('Modelo salvo', '', 'success'); });
    box.querySelector(`[data-cform="${n}"]`)?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const key = e.target.key.value.trim();
      if (!key) return toast('Cole a chave primeiro', '', 'error');
      const btn = e.target.querySelector('.btn.primary'); btn.disabled = true; btn.textContent = 'Testando...';
      try { const r = await api.put(`/ai/key/${n}`, { key }); store.aiMode = r.mode; toast(`${CLOUD_UI[n].label} conectado! ✨`, 'A chave foi testada e salva.', 'success'); assistantTab(box); }
      catch (err) { toast('Não funcionou', err.message, 'error'); btn.disabled = false; btn.textContent = 'Salvar e testar'; }
    });
    box.querySelector(`[data-cdel="${n}"]`)?.addEventListener('click', async () => {
      if (!(await confirmDialog(`Remover chave do ${CLOUD_UI[n].label}`, 'As outras IAs configuradas continuam funcionando.', 'Remover'))) return;
      const r = await api.del(`/ai/key/${n}`); store.aiMode = r.mode; toast('Chave removida'); assistantTab(box);
    });
  }
  box.querySelector('#gemModel')?.addEventListener('change', async (e) => { await api.put('/ai/config', { geminiModel: e.target.value }); toast('Modelo do Gemini salvo', '', 'success'); });
  box.querySelector('#gemForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const key = e.target.key.value.trim();
    if (!key) return toast('Cole a chave primeiro', '', 'error');
    const btn = box.querySelector('#gemSave'); btn.disabled = true; btn.textContent = 'Testando...';
    try { const r = await api.put('/ai/gemini-key', { key }); store.aiMode = r.mode; toast('Gemini conectado! ✨', 'O assistente agora conversa sobre qualquer assunto.', 'success'); assistantTab(box); }
    catch (err) { toast('Não funcionou', err.message, 'error'); btn.disabled = false; btn.textContent = 'Salvar e testar'; }
  });
  box.querySelector('#gemDel')?.addEventListener('click', async () => {
    if (!(await confirmDialog('Remover chave do Gemini', 'O assistente volta ao modo sem IA.', 'Remover'))) return;
    const r = await api.del('/ai/gemini-key'); store.aiMode = r.mode; toast('Chave removida'); assistantTab(box);
  });
  bindCommon(box);
  // memórias de longo prazo
  const mem = document.createElement('section');
  mem.className = 'card';
  mem.style.marginTop = 'var(--gap)';
  box.append(mem);
  const paintMem = async () => {
    const list = await api.get('/assistant/memories');
    mem.innerHTML = `<h3 class="title">${icon('sparkles', 15)} Memórias</h3><p class="sub">O que a IA guardou sobre você para conversas mais pessoais. Valem para todos os personagens. Apague o que não quiser.</p>
      <form class="inbox-input" id="memForm"><input class="input" name="t" maxlength="300" placeholder="Adicionar: ex. Tenho uma filha chamada Ana"><button class="btn sm primary">${icon('plus', 12)}</button></form>
      <div class="list">${list.map((m) => `<div class="row-item"><span class="kind-ico">🧠</span><div class="grow"><b style="white-space:normal">${esc(m.text)}</b><small>${m.source === 'usuario' ? 'você adicionou' : 'guardada pela IA'} · ${new Date(m.createdAt).toLocaleDateString('pt-BR')}</small></div><button class="icon-btn sm ghost" data-mdel="${m.id}" aria-label="Apagar">${icon('trash', 13)}</button></div>`).join('') || '<div class="empty-mini">Nenhuma memória ainda. Conte sobre você no chat (metas, gostos, rotina) e ela aparece aqui.</div>'}</div>`;
    mem.querySelector('#memForm').onsubmit = async (e) => { e.preventDefault(); const t = e.target.t.value.trim(); if (!t) return; await api.post('/assistant/memories', { text: t }); paintMem(); };
    mem.querySelectorAll('[data-mdel]').forEach((b) => { b.onclick = async () => { await api.del(`/assistant/memories/${b.dataset.mdel}`); paintMem(); }; });
  };
  paintMem();
}

// ---------------- Desenvolvedor: GitHub e alterações de código pela IA ----------------
async function devTab(box) {
  let st;
  try { st = await api.get('/dev/status'); } catch (e) { box.innerHTML = `<section class="card"><p class="muted">${esc(e.message)}</p></section>`; return; }
  const log = st.ready ? await api.get('/dev/log').catch(() => []) : [];
  box.innerHTML = `
    <section class="card"><h3 class="title">${icon('code', 15)} GitHub</h3>
      <p class="sub">Liga o Codeniac ao repositório do código-fonte. Com isso a IA do chat consegue <b>ler o código</b> e propor <b>pequenas alterações</b>, que só vão para o GitHub depois que você aprovar.</p>
      <ol class="steps"><li>No GitHub: <b>Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token</b>.</li>
        <li>Em <b>Repository access</b>, escolha só o repositório do Codeniac. Em <b>Permissions</b>, marque <b>Contents</b> e <b>Pull requests</b> como <b>Read and write</b>.</li><li>Copie o token (começa com <code>github_pat_</code>) e cole abaixo. Ele fica só neste computador (arquivo .env) e não entra nos backups.</li></ol>
      <form class="form" id="ghForm"><div class="form-row"><div class="field"><label>Repositório</label><input name="repo" value="${esc(st.repo)}" placeholder="dono/repositório" autocomplete="off"></div>
        <div class="field"><label>Branch principal</label><input name="branch" value="${esc(st.branch)}" placeholder="main" autocomplete="off"></div></div>
        <div class="field"><label>${st.tokenSet ? `Trocar o token (atual ${esc(st.tokenHint)})` : 'Token de acesso'}</label><input type="password" name="token" autocomplete="off" placeholder="${st.tokenSet ? 'Deixe vazio para manter' : 'github_pat_...'}"></div>
        <div class="form-actions">${st.tokenSet ? '<button type="button" class="btn danger" id="ghDel" style="margin-right:auto">Remover token</button>' : ''}<button class="btn primary" id="ghSave">Salvar e testar</button></div></form>
      ${st.ready ? '<div class="form-actions" style="margin-top:6px"><button class="btn sm outline" id="ghTest">Testar conexão</button></div>' : ''}</section>
    <section class="card" style="margin-top:var(--gap)"><h3 class="title">${icon('bot', 15)} Modo desenvolvedor</h3>
      <p class="sub">Quando ligado, o <b>Niac</b> (e personagens com a permissão “Código do sistema”) pode ler o código e propor alterações pelo chat. Peça, por exemplo: “troque a cor do botão de entrar” ou “mostre onde fica a tela de login”.</p>
      ${row('Ligar o modo desenvolvedor', st.ready ? 'Cada alteração aparece num cartão com o diff, e só vai para o GitHub quando você toca em Confirmar' : 'Salve o token e o repositório primeiro', `<label class="switch"><input type="checkbox" id="devOn" ${st.devMode ? 'checked' : ''} ${st.ready ? '' : 'disabled'}><span></span></label>`)}
      ${row('Como enviar', 'Pull request: vira uma proposta no GitHub para você revisar e mesclar (recomendado). Direto: grava na branch principal.', `<div class="seg" id="modeSeg">${[['pr', 'Pull request'], ['direct', 'Direto na branch']].map(([v, l]) => `<button type="button" data-m="${v}" class="${st.mode === v ? 'on' : ''}">${l}</button>`).join('')}</div>`)}
      <p class="hint" style="margin-top:10px">A IA só mexe em arquivos de texto das pastas server/, public/ e installer/ e nos arquivos principais. Nunca em senhas, chaves ou dados. Alterações em arquivos de segurança vêm com um aviso no cartão.</p></section>
    ${st.ready ? `<section class="card" style="margin-top:var(--gap)"><h3 class="title">${icon('download', 15)} Atualizar este computador</h3>
      <p class="sub">Depois que uma alteração é mesclada no GitHub, traga ela para cá. O Codeniac guarda cópia dos arquivos antigos (dá para desfazer) e reinicia sozinho.</p>
      <div class="form-actions" style="justify-content:flex-start;gap:8px"><button class="btn outline" id="upCheck">${icon('refresh', 13)} Ver diferenças</button>${st.backups.length ? '<button class="btn outline" id="upBack">Desfazer última atualização</button>' : ''}</div>
      <div id="upOut" style="margin-top:12px"></div></section>
      <section class="card" style="margin-top:var(--gap)"><h3 class="title">${icon('clock', 15)} O que a IA propôs no código</h3>
        ${log.length ? `<div class="list">${log.map((a) => `<div class="row-item"><span class="kind-ico">${a.status === 'done' ? '✅' : a.status === 'pending' ? '⏳' : '❌'}</span><div class="grow"><b style="white-space:normal">${esc(a.summary)}</b><small>${new Date(a.at).toLocaleString('pt-BR')} · ${a.status === 'done' ? 'enviado' : a.status === 'pending' ? 'aguardando você' : a.status === 'canceled' ? 'cancelado' : 'falhou'}</small></div>${a.link ? `<a class="btn sm outline" href="${esc(a.link)}" target="_blank" rel="noopener noreferrer">Abrir</a>` : ''}</div>`).join('')}</div>` : '<p class="muted">Nada ainda. Peça uma alteração no chat para ver aqui.</p>'}</section>` : ''}`;
  const redraw = () => devTab(box);
  box.querySelector('#ghForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target; const btn = box.querySelector('#ghSave'); btn.disabled = true; btn.textContent = 'Testando...';
    try {
      await api.put('/dev/config', { repo: f.repo.value.trim(), branch: f.branch.value.trim() || 'main' });
      if (f.token.value.trim()) await api.put('/dev/token', { token: f.token.value.trim() });
      const t = await api.post('/dev/test');
      toast('GitHub conectado! ✨', `${t.name}${t.private ? ' (privado)' : ''}`, 'success'); redraw();
    } catch (err) { toast('Não funcionou', err.message, 'error'); btn.disabled = false; btn.textContent = 'Salvar e testar'; }
  });
  box.querySelector('#ghDel')?.addEventListener('click', async () => { if (!(await confirmDialog('Remover token do GitHub', 'O modo desenvolvedor será desligado.', 'Remover'))) return; await api.del('/dev/token'); toast('Token removido'); redraw(); });
  box.querySelector('#ghTest')?.addEventListener('click', async () => { try { const t = await api.post('/dev/test'); toast('Conexão ok', `${t.name} · ${t.commits.length} commit(s) recentes · ${t.prs.length} pull request(s) abertos`, 'success'); } catch (err) { toast('Falhou', err.message, 'error'); } });
  box.querySelector('#devOn')?.addEventListener('change', async (e) => { try { await api.put('/dev/config', { devMode: e.target.checked }); toast(e.target.checked ? 'Modo desenvolvedor ligado' : 'Modo desenvolvedor desligado', '', 'success'); } catch (err) { toast('Erro', err.message, 'error'); e.target.checked = !e.target.checked; } });
  box.querySelectorAll('#modeSeg [data-m]').forEach((b) => b.addEventListener('click', async () => {
    box.querySelectorAll('#modeSeg [data-m]').forEach((x) => x.classList.toggle('on', x === b));
    try { await api.put('/dev/config', { mode: b.dataset.m }); toast('Salvo', '', 'success'); } catch (err) { toast('Erro', err.message, 'error'); }
  }));
  const out = box.querySelector('#upOut');
  box.querySelector('#upCheck')?.addEventListener('click', async () => {
    out.innerHTML = '<span class="typing"><i></i><i></i><i></i></span> Comparando com o GitHub...';
    try {
      const r = await api.get('/dev/changes');
      if (!r.changes.length) { out.innerHTML = '<div class="honest">Este computador já está igual ao GitHub. ✅</div>'; return; }
      out.innerHTML = `<div class="list">${r.changes.map((c) => `<div class="row-item"><span class="kind-ico">${c.status === 'novo' ? '🆕' : c.status === 'removido' ? '🗑️' : '✏️'}</span><div class="grow"><b style="white-space:normal">${esc(c.path)}</b><small>${c.status}</small></div></div>`).join('')}</div>
        ${r.depsChanged ? '<div class="honest" style="margin-top:10px">Essa versão muda as dependências do sistema. Instale o instalador novo em vez de atualizar por aqui.</div>' : `<div class="form-actions"><button class="btn primary" id="upGo">${icon('download', 13)} Atualizar ${r.changes.length} arquivo(s) e reiniciar</button></div>`}`;
      out.querySelector('#upGo')?.addEventListener('click', async () => {
        if (!(await confirmDialog('Atualizar este computador?', 'O Codeniac vai trocar os arquivos e reiniciar. Você pode desfazer depois.', 'Atualizar'))) return;
        try { const u = await api.post('/dev/update'); toast('Atualizado ✨', u.message, 'success'); setTimeout(() => location.reload(), 4500); } catch (err) { toast('Falhou', err.message, 'error'); }
      });
    } catch (err) { out.innerHTML = `<div class="honest">${esc(err.message)}</div>`; }
  });
  box.querySelector('#upBack')?.addEventListener('click', async () => {
    if (!(await confirmDialog('Desfazer a última atualização?', 'Os arquivos antigos voltam e o Codeniac reinicia.', 'Desfazer'))) return;
    try { await api.post('/dev/rollback', {}); toast('Atualização desfeita', 'Reiniciando...', 'success'); setTimeout(() => location.reload(), 4500); } catch (err) { toast('Falhou', err.message, 'error'); }
  });
}

// ---------------- Conexões: Telegram e app no celular ----------------
const b64ToBytes = (b64) => { const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64.length % 4)) % 4)); return Uint8Array.from(s, (c) => c.charCodeAt(0)); };
async function connectTab(box) {
  const [tgi, tsi] = await Promise.all([api.get('/telegram'), store.user.role === 'admin' ? api.get('/admin/tailscale').catch(() => null) : null]);
  const secure = window.isSecureContext;
  const reg = secure && 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
  const sub = await reg?.pushManager?.getSubscription().catch(() => null);
  const standalone = matchMedia('(display-mode: standalone)').matches;
  box.innerHTML = `
    <section class="card"><h3 class="title">${icon('send', 15)} Telegram</h3><p class="sub">Converse com o assistente e seus personagens pelo Telegram do celular, mesmo com o Codeniac fechado no navegador. As mensagens automáticas também chegam lá. O computador precisa estar ligado com o Codeniac aberto.</p>
      ${tgi.configured ? `<div class="kv" style="margin-bottom:14px"><div><span>Robô</span><b>${tgi.bot ? `@${esc(tgi.bot.username)}` : '—'} ${tgi.running ? '<span class="chip ok">ligado</span>' : '<span class="chip">parado</span>'}</b></div>${tgi.error ? `<div><span>Aviso</span><b style="color:var(--warn)">${esc(tgi.error)}</b></div>` : ''}</div>` : ''}
      ${!tgi.configured ? (tgi.isAdmin ? `<ol class="steps"><li>No Telegram, abra o <b>@BotFather</b>, envie <b>/newbot</b>, escolha um nome e um usuário terminado em “bot”.</li><li>Ele te manda um <b>token</b> (ex.: 123456789:AAH...). Cole abaixo.</li></ol>
          <form class="inbox-input" id="tgTok"><input class="input" type="password" name="t" placeholder="Token do @BotFather" autocomplete="off"><button class="btn primary sm">Salvar e testar</button></form>` : '<p class="muted">Peça ao administrador para configurar o robô do Telegram.</p>')
        : tgi.linked ? `<div class="setting-row"><div class="txt"><b>Conectado como ${esc(tgi.username || 'você')}</b><small>Comandos no Telegram: /com Nome (falar com um personagem), /quem, /desvincular</small></div><button class="btn sm outline" id="tgUnlink">Desconectar</button></div>
          ${row('Receber mensagens automáticas no Telegram', 'Rotinas, lembretes, revisão semanal, cápsulas e recados dos personagens', `<label class="switch"><input type="checkbox" id="tgFwd" ${tgi.forward ? 'checked' : ''}><span></span></label>`)}`
        : `<ol class="steps"><li>No Telegram, abra <b>${tgi.bot ? `@${esc(tgi.bot.username)}` : 'o seu robô'}</b> e toque em <b>Iniciar</b>.</li><li>Gere o código abaixo e envie para ele: <b>/vincular CÓDIGO</b> (vale 15 minutos).</li></ol>
          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="btn primary sm" id="tgCode">Gerar código</button><b id="tgCodeOut" style="font-size:22px;letter-spacing:4px"></b>${tgi.bot ? `<a class="btn sm outline" href="https://t.me/${esc(tgi.bot.username)}" target="_blank" rel="noopener">Abrir no Telegram</a>` : ''}</div>`}
      ${tgi.configured && tgi.isAdmin ? '<div class="form-actions"><button class="btn sm danger" id="tgOff">Remover robô</button></div>' : ''}
      ${tgi.configured && tgi.mode !== 'gemini' ? '<p class="hint" style="margin-top:10px">Dica: ligue o Gemini para conversas livres e ações pelo Telegram.</p>' : ''}</section>

    <section class="card" style="margin-top:var(--gap)"><h3 class="title">${icon('bell', 15)} App no celular e notificações</h3>
      <p class="sub">Instale o Codeniac como app no celular: ícone na tela inicial, atalhos (Capturar, Chat, Finanças, Turno) ao segurar o ícone e notificações de verdade, mesmo com a tela bloqueada. Os dados são os mesmos do computador, porque o app conversa com o Codeniac do seu PC.</p>
      ${secure ? `${row('Notificações neste aparelho', sub ? 'Ligadas: mensagens dos personagens e lembretes chegam aqui' : 'Desligadas', `<button class="btn sm ${sub ? 'outline' : 'primary'}" id="pushBtn">${sub ? 'Desligar' : 'Ligar notificações'}</button>`)}
          ${sub ? row('Testar', 'Manda uma notificação de teste para os aparelhos ligados', '<button class="btn sm outline" id="pushTest">Enviar teste</button>') : ''}
          ${row('Instalar o app', standalone ? 'Você já está usando o app instalado ✨' : 'Android (Chrome): menu ⋮ → “Instalar app” ou “Adicionar à tela inicial”. iPhone (Safari): Compartilhar → “Adicionar à Tela de Início”.', '')}`
        : `<div class="honest">Para instalar como app e receber notificações, o navegador exige uma conexão segura (HTTPS). Neste endereço (${esc(location.host)}) isso não está disponível. Use o endereço HTTPS do Tailscale abaixo no celular.</div>`}
      <p class="hint" style="margin-top:10px">Widget na tela inicial não é permitido para apps web no Android/iPhone; no lugar dele, use os atalhos do ícone e as notificações.</p></section>

    ${store.user.role === 'admin' ? `<section class="card" style="margin-top:var(--gap)"><h3 class="title">${icon('shield', 15)} Endereço seguro (HTTPS) pelo Tailscale</h3>
      <p class="sub">Cria um endereço https://… só para os seus aparelhos do Tailscale, com cadeado. É ele que permite instalar o app e receber notificações no celular, de qualquer lugar.</p>
      ${!tsi ? '<p class="muted">Não consegui verificar o Tailscale.</p>' : !tsi.installed ? '<div class="honest">O Tailscale não está instalado neste computador. Baixe em tailscale.com/download, entre na sua conta e volte aqui.</div>'
        : `<div class="kv"><div><span>Situação</span><b>${tsi.running ? 'conectado' : 'desconectado'}</b></div>${tsi.url ? `<div><span>Endereço</span><b>${esc(tsi.url)}</b></div>` : ''}<div><span>HTTPS</span><b>${tsi.serving ? '<span class="chip ok">ligado</span>' : 'desligado'}</b></div></div>
          <div class="form-actions" style="justify-content:flex-start;margin-top:12px">${tsi.serving ? `<a class="btn sm primary" href="${esc(tsi.url)}" target="_blank" rel="noopener">Abrir endereço seguro</a><button class="btn sm outline" id="tsOff">Desligar HTTPS</button>` : '<button class="btn sm primary" id="tsOn">Ligar HTTPS</button>'}</div>
          <p class="hint" style="margin-top:10px">Na primeira vez, o Tailscale pode pedir para ativar “HTTPS Certificates” no painel dele (login.tailscale.com → DNS). Se aparecer um link, abra, ative e clique em “Ligar HTTPS” de novo. No celular, use o endereço com o Tailscale ligado.</p>`}</section>` : ''}`;

  box.querySelector('#tgTok')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { const r = await api.put('/telegram/token', { token: e.target.t.value.trim() }); toast('Telegram conectado', `@${r.bot.username}`, 'success'); connectTab(box); } catch (err) { toast('Não funcionou', err.message, 'error'); }
  });
  box.querySelector('#tgCode')?.addEventListener('click', async () => {
    const r = await api.post('/telegram/code');
    box.querySelector('#tgCodeOut').textContent = r.code;
    const poll = setInterval(async () => { if (!document.body.contains(box)) return clearInterval(poll); const st = await api.get('/telegram'); if (st.linked) { clearInterval(poll); toast('Telegram conectado! 🎉', '', 'success'); connectTab(box); } }, 3000);
    setTimeout(() => clearInterval(poll), 15 * 60 * 1000);
  });
  box.querySelector('#tgUnlink')?.addEventListener('click', async () => { await api.del('/telegram/link'); connectTab(box); });
  box.querySelector('#tgFwd')?.addEventListener('change', (e) => api.put('/telegram/prefs', { forward: e.target.checked }));
  box.querySelector('#tgOff')?.addEventListener('click', async () => { if (await confirmDialog('Remover robô do Telegram', 'Ninguém mais vai conseguir conversar pelo Telegram até configurar de novo.', 'Remover')) { await api.del('/telegram/token'); connectTab(box); } });
  box.querySelector('#pushBtn')?.addEventListener('click', async (e) => {
    e.target.disabled = true;
    try {
      const r = reg || await navigator.serviceWorker.register('/sw.js');
      if (sub) { await api.post('/push/unsubscribe', { endpoint: sub.endpoint }); await sub.unsubscribe(); toast('Notificações desligadas neste aparelho'); return connectTab(box); }
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { toast('Permissão negada', 'Libere as notificações do site nas configurações do navegador.', 'error'); e.target.disabled = false; return; }
      const { publicKey } = await api.get('/push/key');
      const ns = await (await navigator.serviceWorker.ready).pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
      await api.post('/push/subscribe', { subscription: ns.toJSON(), device: navigator.userAgent.slice(0, 80) });
      toast('Notificações ligadas! 🔔', 'Mandei um teste.', 'success');
      api.post('/push/test');
      connectTab(box);
    } catch (err) { toast('Não deu para ligar', err.message, 'error'); e.target.disabled = false; }
  });
  box.querySelector('#pushTest')?.addEventListener('click', async () => { const r = await api.post('/push/test'); toast(r.sent ? 'Notificação enviada' : 'Nenhum aparelho recebeu', r.sent ? '' : 'Ligue as notificações de novo.', r.sent ? 'success' : 'error'); });
  box.querySelector('#tsOn')?.addEventListener('click', async (e) => {
    e.target.disabled = true; e.target.textContent = 'Ligando...';
    try { await api.post('/admin/tailscale/serve', { enable: true }); toast('HTTPS ligado', 'Use o endereço seguro no celular.', 'success'); connectTab(box); }
    catch (err) { modal({ title: 'O Tailscale pediu uma ação', body: `<p style="white-space:pre-wrap;font-size:12px">${esc(err.message)}</p><p class="muted" style="font-size:12px">Se apareceu um link, abra no navegador, ative e tente de novo.</p>` }); e.target.disabled = false; e.target.textContent = 'Ligar HTTPS'; }
  });
  box.querySelector('#tsOff')?.addEventListener('click', async () => { await api.post('/admin/tailscale/serve', { enable: false }); connectTab(box); });
}

// ---------------- Notificações ----------------
function notifTab(box) {
  box.innerHTML = `<section class="card"><h3 class="title">${icon('bell', 15)} Notificações</h3>
    ${sw('notifyTasks', 'Lembretes', 'Briefing, contas, assinaturas, documentos, manutenção, agenda e decisões a avaliar')}
    ${sw('notifySystem', 'Avisos do sistema e atualizações')}
    ${sw('notifySound', 'Som ao chegar notificação')}</section>`;
  box.querySelector('[data-sw="notifySound"]').checked = store.settings.notifySound === true;
  bindCommon(box);
}

// ---------------- Dados ----------------
function dataTab(box) {
  box.innerHTML = `<section class="card"><h3 class="title">${icon('download', 15)} Seus dados</h3><p class="sub">Tudo fica no seu computador, na pasta de dados do Codeniac.</p>
    <div class="form-actions" style="justify-content:flex-start"><button class="btn outline" id="exp">${icon('download', 14)} Exportar meus dados (JSON)</button>${store.user.role === 'admin' ? `<a class="btn outline" href="#/settings/admin">${icon('shield', 14)} Backup automático e restauração</a>` : ''}</div></section>
    <section class="card" style="margin-top:var(--gap)"><h3 class="title">${icon('globe', 15)} Acesso pelo celular</h3><p class="sub">Abra o Codeniac no celular pela mesma rede Wi-Fi ou, de qualquer lugar, com o Tailscale.</p><a class="btn outline" href="/celular" target="_blank">${icon('globe', 14)} Ver instruções e QR code</a></section>`;
  box.querySelector('#exp').onclick = async () => {
    const res = await fetch('/api/export', { headers: { Authorization: `Bearer ${auth.token}` } });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(await res.blob()), download: `codeniac-dados-${new Date().toISOString().slice(0, 10)}.json` });
    a.click();
  };
}

// ---------------- Administração ----------------
async function adminTab(box) {
  const [ov, users, sys, bk, net] = await Promise.all([api.get('/admin/overview'), api.get('/admin/users'), api.get('/admin/system'), api.get('/admin/backups'), api.get('/network')]);
  const up = Math.floor(ov.uptime / 3600);
  box.innerHTML = `
    <section class="admin-stats">${[['Versão', ov.version], ['Memória em uso', `${ov.memoryMb} MB`], ['Ligado há', up ? `${up} h ${Math.floor((ov.uptime % 3600) / 60)} min` : `${Math.floor(ov.uptime / 60)} min`], ['Banco de dados', fmtSize(ov.dbSize)], ['Arquivos enviados', `${ov.uploads.count} · ${fmtSize(ov.uploads.total)}`], ['Assistente', `${ov.aiMode === 'local' ? 'sem IA' : ov.aiMode} · ${ov.kbSize} respostas`]].map(([l, v]) => `<div class="card kpi"><span>${l}</span><b>${esc(String(v))}</b></div>`).join('')}</section>
    <section class="card" style="margin-top:var(--gap)"><div class="section-head"><h3>${icon('users', 14)} Usuários</h3><button class="btn sm primary" id="addU">${icon('plus', 12)} Usuário</button></div>
      <div class="table-wrap"><table class="table"><thead><tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>Projetos</th><th></th></tr></thead><tbody>${users.map((u) => `<tr data-u="${u.id}"><td>${esc(u.name)}${u.id === store.user.id ? ' <span class="chip">você</span>' : ''}</td><td>${esc(u.email)}</td><td><select class="input" data-role style="height:30px"><option value="user" ${u.role !== 'admin' ? 'selected' : ''}>Usuário</option><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Administrador</option></select></td><td>${u.projects}</td>
        <td style="white-space:nowrap"><button class="btn sm outline" data-reset>Nova senha</button>${u.id === store.user.id ? '' : `<button class="icon-btn sm ghost" data-del>${icon('trash', 13)}</button>`}</td></tr>`).join('')}</tbody></table></div></section>
    <section class="card" style="margin-top:var(--gap)"><h3 class="title">${icon('settings', 15)} Sistema</h3>
      <form class="form" id="sysForm"><div class="form-row"><div class="field"><label>Nome do sistema</label><input name="appName" value="${esc(sys.appName)}"></div><div class="field"><label>Tema padrão para novos usuários</label><select name="defaultTheme">${Object.entries(THEMES).map(([k, t]) => `<option value="${k}" ${sys.defaultTheme === k ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></div></div>
        <div class="field"><label>Mensagem na tela de login</label><input name="loginMessage" value="${esc(sys.loginMessage || '')}" maxlength="200" placeholder="Ex.: Bem-vindo de volta!"></div>
        <div class="setting-row"><div class="txt"><b>Permitir criar conta na tela de login</b><small>Desligado: só o administrador cria usuários</small></div><label class="switch"><input type="checkbox" name="allowRegistration" ${sys.allowRegistration ? 'checked' : ''}><span></span></label></div>
        <div class="form-actions"><button class="btn primary">Salvar</button></div></form></section>
    <section class="card" style="margin-top:var(--gap)"><h3 class="title">${icon('image', 15)} Imagens do sistema</h3><p class="sub">Troque o logo, a tela de login, o banner e as imagens dos cards. PNG, JPG, WEBP ou GIF até 8 MB.</p>
      <div class="img-slots">${Object.entries(sys.imageSlots).map(([k, l]) => `<div class="img-slot" data-slot="${k}"><div class="pv" style="${sys.images[k] ? `background-image:url('${esc(sys.images[k])}')${k === 'logo' ? ';background-size:contain;background-color:#111' : ''}` : ''}">${sys.images[k] ? '' : 'padrão'}</div><div class="meta"><span>${esc(l)}</span><span style="display:flex;gap:4px"><button class="icon-btn sm" data-up title="Enviar">${icon('upload', 13)}</button>${sys.images[k] ? `<button class="icon-btn sm" data-rm title="Voltar ao padrão">${icon('x', 13)}</button>` : ''}</span></div></div>`).join('')}</div></section>
    <section class="card" style="margin-top:var(--gap)"><h3 class="title">${icon('shield', 15)} Backup automático diário</h3><p class="sub">Uma cópia do banco e das imagens por dia. Aponte para uma pasta do OneDrive, Google Drive ou Dropbox para ter cópia na nuvem.</p>
      <form class="form" id="bkForm"><div class="setting-row"><div class="txt"><b>Backup diário ligado</b><small>${bk.config.lastAt ? `Último: ${new Date(bk.config.lastAt).toLocaleString('pt-BR')}` : 'Ainda não executado'}${bk.config.lastError ? ` · <span style="color:var(--danger)">erro: ${esc(bk.config.lastError)}</span>` : ''}</small></div><label class="switch"><input type="checkbox" name="enabled" ${bk.config.enabled ? 'checked' : ''}><span></span></label></div>
        <div class="form-row"><div class="field"><label>Pasta</label><input name="dir" value="${esc(bk.config.dir || '')}" placeholder="${esc(sys.backupDefault)}"><span class="hint">Vazio = ${esc(sys.backupDefault)}</span></div><div class="field"><label>Manter os últimos</label><select name="keep">${[7, 14, 30, 60, 90].map((n) => `<option value="${n}" ${Number(bk.config.keep) === n ? 'selected' : ''}>${n} backups</option>`).join('')}</select></div></div>
        <div class="form-actions"><button type="button" class="btn outline" id="runBk">${icon('refresh', 13)} Fazer backup agora</button><button class="btn primary">Salvar</button></div></form>
      <div class="list" style="margin-top:12px">${bk.list.slice(0, 10).map((b) => `<div class="row-item"><div class="grow"><b>${esc(b.date)}</b><small>${fmtSize(b.size)}</small></div><button class="btn sm outline" data-restore="${esc(b.name)}">Restaurar</button></div>`).join('') || '<div class="empty-mini">Nenhum backup na pasta ainda.</div>'}</div>
      <div class="form-actions" style="justify-content:flex-start"><a class="btn sm outline" id="dlBk" href="#">${icon('download', 12)} Baixar backup completo (JSON)</a></div></section>
    <section class="card" style="margin-top:var(--gap)"><h3 class="title">${icon('globe', 15)} Rede e celular</h3>
      ${row('Permitir acesso pela rede (celular)', net.enabled ? `Ligado · ${net.addresses.filter((a) => a.kind !== 'virtual').map((a) => a.url).join(' · ') || 'sem rede detectada'}` : 'Desligado: só este computador acessa', `<label class="switch"><input type="checkbox" id="netSw" ${net.enabled ? 'checked' : ''}><span></span></label>`)}
      <div class="form-actions" style="justify-content:flex-start"><a class="btn sm outline" href="/celular" target="_blank">${icon('globe', 12)} QR code e instruções</a><button class="btn sm outline" id="restart">${icon('refresh', 12)} Reiniciar o Codeniac</button></div></section>
    <section class="card" style="margin-top:var(--gap)"><h3 class="title">${icon('list', 15)} Menu lateral</h3><p class="sub">Esconda ou renomeie itens do menu para todos os usuários.</p>
      <div class="list" id="menuList">${NAV_KEYS.filter(([k]) => k !== 'settings').map(([k, l]) => `<div class="row-item" data-mk="${k}"><label class="switch"><input type="checkbox" ${sys.menu.hidden.includes(k) ? '' : 'checked'}><span></span></label><div class="grow"><b>${esc(l)}</b></div><input class="input" placeholder="Novo nome (opcional)" value="${esc(sys.menu.labels[k] || '')}" style="height:30px;max-width:200px"></div>`).join('')}</div>
      <div class="form-actions"><button class="btn primary" id="saveMenu">Salvar menu</button></div></section>
    <section class="card" style="margin-top:var(--gap)"><h3 class="title">${icon('code', 15)} Avançado: CSS personalizado</h3><p class="sub">Altere qualquer detalhe visual direto do sistema, sem editar arquivos. Ex.: <code>.nav-item { font-size: 14px; }</code></p>
      <textarea class="code-area" id="css" spellcheck="false">${esc(sys.customCss || '')}</textarea>
      <div class="form-actions"><button class="btn outline" id="cssTest">Pré-visualizar</button><button class="btn primary" id="cssSave">Salvar CSS</button></div></section>
    <section class="card" style="margin-top:var(--gap)"><div class="section-head"><h3>${icon('activity', 14)} Registro (log) do servidor</h3><button class="see-more" id="logBtn">${icon('refresh', 12)} Carregar</button></div><div class="log-box" id="logs">Clique em “Carregar”.</div></section>
    <section class="card" style="margin-top:var(--gap)"><h3 class="title">${icon('bell', 15)} Enviar aviso para todos</h3><form class="form" id="bcForm"><div class="field"><label>Título</label><input name="title" maxlength="120"></div><div class="field"><label>Mensagem</label><textarea name="message" rows="2" maxlength="1000"></textarea></div><div class="form-actions"><button class="btn primary">Enviar</button></div></form></section>
    <section class="card" style="margin-top:var(--gap)"><h3 class="title">${icon('folder', 15)} Pasta de dados</h3><div class="kv"><div><span>Local</span><b>${esc(ov.dataDir)}</b></div><div><span>Node.js</span><b>${esc(ov.node)}</b></div><div><span>Registros</span><b>${Object.entries(ov.counts).map(([k, v]) => `${k}: ${v}`).join(' · ')}</b></div></div></section>`;
  const reload = () => adminTab(box);
  // usuários
  box.querySelector('#addU').onclick = () => formModal({ title: 'Novo usuário', fields: [{ name: 'name', label: 'Nome' }, { name: 'email', label: 'E-mail', type: 'email' }, { name: 'password', label: 'Senha inicial', type: 'password' }, { name: 'role', label: 'Papel', type: 'select', value: 'user', options: [['user', 'Usuário'], ['admin', 'Administrador']] }],
    onSubmit: (d) => api.post('/admin/users', d) }).then(reload);
  box.querySelectorAll('[data-u]').forEach((tr) => {
    const id = tr.dataset.u;
    tr.querySelector('[data-role]').onchange = async (e) => { try { await api.put(`/admin/users/${id}`, { role: e.target.value }); toast('Papel alterado', '', 'success'); } catch (err) { toast('Erro', err.message, 'error'); reload(); } };
    tr.querySelector('[data-reset]').onclick = async () => { if (!(await confirmDialog('Gerar nova senha', 'Uma senha temporária será criada para este usuário.', 'Gerar'))) return; const r = await api.post(`/admin/users/${id}/reset-password`); modal({ title: 'Senha temporária', body: `<p>Passe esta senha ao usuário e peça para trocá-la no perfil:</p><p style="font-size:22px;font-family:monospace;text-align:center"><b>${esc(r.password)}</b></p>` }); };
    tr.querySelector('[data-del]')?.addEventListener('click', async () => { if (!(await confirmDialog('Excluir usuário', 'Todos os dados deste usuário serão apagados.'))) return; try { await api.del(`/admin/users/${id}`); reload(); } catch (err) { toast('Erro', err.message, 'error'); } });
  });
  // sistema
  box.querySelector('#sysForm').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    const r = await api.put('/admin/system', { appName: f.appName.value, defaultTheme: f.defaultTheme.value, loginMessage: f.loginMessage.value, allowRegistration: f.allowRegistration.checked });
    store.appName = r.appName; document.title = r.appName; emit('system', r); toast('Sistema salvo', '', 'success');
  };
  // imagens
  box.querySelectorAll('[data-slot]').forEach((s) => {
    s.querySelector('[data-up]').onclick = () => pickImage(async (file) => { if (!validateImage(file)) return; const images = await api.upload(`/admin/images/${s.dataset.slot}`, file); store.images = images; emit('system', { images }); toast('Imagem atualizada', '', 'success'); reload(); });
    s.querySelector('[data-rm]')?.addEventListener('click', async () => { const images = await api.del(`/admin/images/${s.dataset.slot}`); store.images = images; emit('system', { images }); reload(); });
  });
  // backup
  box.querySelector('#bkForm').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    try { await api.put('/admin/system', { backup: { enabled: f.enabled.checked, dir: f.dir.value.trim(), keep: Number(f.keep.value) } }); toast('Backup configurado', '', 'success'); reload(); } catch (err) { toast('Erro', err.message, 'error'); }
  };
  box.querySelector('#runBk').onclick = async (e) => { e.target.disabled = true; try { const r = await api.post('/admin/backups/run'); toast('Backup concluído', r.dir, 'success'); reload(); } catch (err) { toast('Erro no backup', err.message, 'error'); e.target.disabled = false; } };
  box.querySelectorAll('[data-restore]').forEach((b) => { b.onclick = async () => {
    if (!(await confirmDialog('Restaurar backup', `Os dados atuais serão substituídos pelos de ${b.dataset.restore.replace('_', ' ')}. Antes disso, uma cópia de segurança do estado atual é salva.`, 'Restaurar'))) return;
    await api.post(`/admin/backups/${encodeURIComponent(b.dataset.restore)}/restore`); toast('Backup restaurado', 'Recarregando...', 'success'); setTimeout(() => location.reload(), 1200);
  }; });
  box.querySelector('#dlBk').onclick = async (e) => {
    e.preventDefault();
    const res = await fetch('/api/admin/backup', { headers: { Authorization: `Bearer ${auth.token}` } });
    Object.assign(document.createElement('a'), { href: URL.createObjectURL(await res.blob()), download: `codeniac-backup-completo-${new Date().toISOString().slice(0, 10)}.json` }).click();
  };
  // rede e reinício
  const restart = async () => {
    await api.post('/admin/restart');
    toast('Reiniciando...', 'O Codeniac volta em alguns segundos.');
    const wait = async (n = 0) => { try { await fetch('/api/health').then((r) => { if (!r.ok) throw new Error(); }); location.reload(); } catch { if (n < 40) setTimeout(() => wait(n + 1), 1000); } };
    setTimeout(wait, 2500);
  };
  box.querySelector('#netSw').onchange = async (e) => {
    const r = await api.put('/admin/network', { enabled: e.target.checked });
    if (r.restartNeeded && await confirmDialog('Reiniciar agora?', `O acesso pela rede foi ${r.enabled ? 'ligado' : 'desligado'}. É preciso reiniciar o Codeniac para valer.`, 'Reiniciar')) restart();
  };
  box.querySelector('#restart').onclick = async () => { if (await confirmDialog('Reiniciar o Codeniac', 'A página recarrega sozinha quando ele voltar.', 'Reiniciar')) restart(); };
  // menu
  box.querySelector('#saveMenu').onclick = async () => {
    const hidden = []; const labels = {};
    box.querySelectorAll('[data-mk]').forEach((r) => { if (!r.querySelector('input[type=checkbox]').checked) hidden.push(r.dataset.mk); const v = r.querySelector('input.input').value.trim(); if (v) labels[r.dataset.mk] = v; });
    const s = await api.put('/admin/system', { menu: { hidden, labels } });
    store.menu = s.menu; emit('system', s); toast('Menu salvo', '', 'success');
  };
  // css
  const applyCss = (css) => { let st = document.getElementById('cssPreview'); if (!st) { st = Object.assign(document.createElement('style'), { id: 'cssPreview' }); document.head.append(st); } st.textContent = css; };
  box.querySelector('#cssTest').onclick = () => { applyCss(box.querySelector('#css').value); toast('Pré-visualização aplicada', 'Recarregue a página para descartar.'); };
  box.querySelector('#cssSave').onclick = async () => {
    await api.put('/admin/system', { customCss: box.querySelector('#css').value });
    document.querySelector('link[href^="/custom.css"]')?.setAttribute('href', `/custom.css?v=${Date.now()}`);
    document.getElementById('cssPreview')?.remove();
    toast('CSS salvo', 'Vale para todos os usuários.', 'success');
  };
  box.querySelector('#logBtn').onclick = async () => { const r = await api.get('/admin/logs'); const lb = box.querySelector('#logs'); lb.textContent = r.lines.length ? r.lines.join('\n') : `Sem registros${r.file ? '' : ' (o log em arquivo só existe na versão instalada)'}.`; lb.scrollTop = lb.scrollHeight; };
  box.querySelector('#bcForm').onsubmit = async (e) => { e.preventDefault(); try { const r = await api.post('/notifications/broadcast', { title: e.target.title.value, message: e.target.message.value }); toast('Aviso enviado', `${r.delivered} usuário(s)`, 'success'); e.target.reset(); } catch (err) { toast('Erro', err.message, 'error'); } };
}

export default async function render(el, [tab = 'aparencia']) {
  const tabs = TABS.filter(([k]) => !['admin', 'dev'].includes(k) || store.user.role === 'admin');
  const cur = tabs.find((t) => t[0] === tab) ? tab : 'aparencia';
  el.innerHTML = `<div class="page-head"><div><h1>Configurações</h1><p>Personalize o Codeniac do seu jeito</p></div></div>
    <div class="tabs settings-tabs" style="flex-wrap:wrap;width:auto">${tabs.map(([k, l, ic]) => `<button data-t="${k}" class="${k === cur ? 'on' : ''}">${icon(ic, 13)} ${l}</button>`).join('')}</div><div id="tab"></div>`;
  el.querySelectorAll('[data-t]').forEach((b) => { b.onclick = () => { location.hash = `#/settings/${b.dataset.t}`; }; });
  const box = el.querySelector('#tab');
  const fn = { aparencia: appearance, rotina: routine, assistente: assistantTab, conexoes: connectTab, dev: devTab, notificacoes: notifTab, dados: dataTab, admin: adminTab }[cur];
  await fn(box);
  return () => { if (Object.keys(pending).length) patch({}, true); };
}
