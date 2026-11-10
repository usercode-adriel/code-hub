// Configurações: aparência (temas + editor de cores/layout), rotina, assistente, notificações, dados
// e Administração (usuários, sistema, imagens, backup, rede/celular, CSS, menu, logs, reinício).
import { api, auth } from '../api.js';
import { store, applySettings, emit } from '../store.js';
import { icon } from '../icons.js';
import { esc, toast, confirmDialog, formModal, validateImage, pickImage, modal } from '../ui.js';
import { THEMES, COLOR_LABELS, resolveTheme, presetLayout } from '../theme.js';
import { PERSONA } from '../chatui.js';
import { NAV_KEYS } from '../app.js';

const TABS = [['aparencia', 'Aparência', 'palette'], ['rotina', 'Rotina', 'sun'], ['assistente', 'Assistente', 'bot'], ['notificacoes', 'Notificações', 'bell'], ['dados', 'Dados', 'download'], ['admin', 'Administração', 'shield']];
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
  box.innerHTML = `<section class="card"><h3 class="title">${icon('palette', 15)} Temas</h3><p class="sub">Cada tema muda cores, cantos e alguns efeitos. Você pode ajustar tudo abaixo.</p>
      <div class="theme-grid">${Object.entries(THEMES).map(([k, t]) => `<button class="theme-card ${s.theme === k ? 'on' : ''}" data-theme="${k}" style="--p-bg:${t.vars.bg};--p-side:${t.vars.sidebar};--p-card:${t.vars.card};--p-accent:${t.vars.accent};--p-text:${t.vars.text};--p-muted:${t.vars.muted};border-radius:${Math.min(t.radius ?? 14, 16)}px">
        <div class="preview"><div class="side"><i></i><i></i><i></i><i></i></div><div class="main"><div class="hero-p"><b></b></div><div class="row"><span></span><span></span><span></span></div></div></div><div class="label">${esc(t.name)}<small>${esc(t.desc)}</small></div></button>`).join('')}</div></section>
    <section class="card" style="margin-top:var(--gap)"><div class="section-head"><h3>${icon('edit', 14)} Cores personalizadas</h3><button class="see-more" id="resetColors">${icon('refresh', 12)} Restaurar cores do tema</button></div>
      <div class="color-grid">${Object.entries(COLOR_LABELS).map(([k, l]) => `<label class="color-field"><input type="color" data-color="${k}" value="${vars[k]}"><span>${l}<small>${vars[k]}</small></span></label>`).join('')}</div></section>
    <section class="card" style="margin-top:var(--gap)"><h3 class="title">${icon('columns', 15)} Layout</h3>
      ${row('Cantos arredondados', '', `<div class="range-row" style="width:240px"><input type="range" min="0" max="24" value="${s.radius}" data-range="radius"><output>${s.radius}px</output></div>`)}
      ${row('Tamanho do texto', '', `<div class="range-row" style="width:240px"><input type="range" min="85" max="120" step="5" value="${s.fontScale}" data-range="fontScale"><output>${s.fontScale}%</output></div>`)}
      ${row('Fonte', '', seg('fontFamily', [['poppins', 'Poppins'], ['system', 'Sistema'], ['mono', 'Mono'], ['serif', 'Serifada'], ['retro', 'Retrô']], s.fontFamily))}
      ${row('Densidade', '', seg('density', [['comfortable', 'Confortável'], ['compact', 'Compacta']], s.density))}
      ${row('Tela inicial', 'O que abre quando você entra', seg('homePage', [['hoje', 'Hoje'], ['dashboard', 'Dashboard']], s.homePage))}
      ${sw('effects', 'Efeitos do tema', 'Neve, chuva, neon, brilhos e animações')}${sw('showHero', 'Banner no dashboard')}${sw('heroAutoplay', 'Banner muda sozinho')}${sw('showAssistantPanel', 'Painel do assistente à direita')}</section>`;
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
  bindCommon(box);
}

// ---------------- Rotina ----------------
function routine(box) {
  const s = store.settings;
  const num = (k, min, max, step = 1) => `<input class="input" type="number" min="${min}" max="${max}" step="${step}" data-set="${k}" value="${s[k]}" style="width:90px">`;
  box.innerHTML = `<section class="card"><h3 class="title">${icon('sun', 15)} Briefing e rotina</h3><p class="sub">Tudo calculado no seu computador, sem IA e sem internet.</p>
    ${sw('briefingEnabled', 'Briefing automático', 'Todo dia, no horário abaixo, chega uma notificação com agenda, pendências, contas e prioridades')}
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
async function assistantTab(box) {
  const s = store.settings;
  let ai = null;
  try { ai = await api.get('/ai/status'); } catch { /* sem acesso */ }
  box.innerHTML = `<section class="card"><h3 class="title">${icon('bot', 15)} Assistente</h3><p class="sub">Responde sobre todo o sistema e executa comandos como /gasto, /corrida, /tarefa e /nota.</p>
      ${sw('assistantEnabled', 'Assistente ligado')}
      ${row('Nome', '', `<input class="input" data-set="assistantName" value="${esc(s.assistantName)}" maxlength="40" style="width:200px">`)}
      ${row('Como ele te chama', 'Apelido (opcional)', `<input class="input" data-set="assistantNickname" value="${esc(s.assistantNickname || '')}" maxlength="40" style="width:200px">`)}
      ${row('Avatar', '', `<div class="icon-pick">${AVATARS.map((a) => `<button type="button" data-av="${a}" class="${s.assistantAvatar === a ? 'on' : ''}" style="font-size:18px">${a}</button>`).join('')}</div>`)}
      ${row('Tamanho das respostas', '', seg('assistantLength', [['curta', 'Curtas'], ['media', 'Médias'], ['detalhada', 'Detalhadas']], s.assistantLength))}
      <div class="field" style="margin-top:14px"><label>Personalidade</label><div class="persona-grid">${Object.entries(PERSONA).map(([k, p]) => `<button class="persona ${s.assistantPersonality === k ? 'on' : ''}" data-pe="${k}"><span class="pe">${p.emoji}</span><b>${p.label}</b><small>${p.desc}</small></button>`).join('')}</div></div>
      <div class="field" style="margin-top:14px"><label>Instruções extras</label><textarea class="input" data-set="assistantInstructions" rows="3" maxlength="600" placeholder="Ex.: sempre me lembre de beber água; responda em tom motivador.">${esc(s.assistantInstructions || '')}</textarea></div></section>
    <section class="card" style="margin-top:var(--gap)"><h3 class="title">${icon('cpu', 15)} Modo de resposta</h3>
      <p class="sub">Atual: <b>${ai?.mode === 'ollama' ? 'IA local (Ollama)' : ai?.mode === 'claude' ? 'Claude (internet)' : 'Sem IA — base de conhecimento + comandos (rápido e leve)'}</b></p>
      ${ai?.isAdmin ? `<div class="seg" id="prov">${[['local', 'Sem IA (recomendado)'], ['ollama', 'IA local (Ollama)'], ['auto', 'Automático'], ['claude', 'Claude']].map(([v, l]) => `<button data-v="${v}" class="${ai.config.provider === v ? 'on' : ''}">${l}</button>`).join('')}</div>
        <p class="muted" style="font-size:11.5px;margin-top:10px">“Sem IA” não usa memória extra e responde na hora. A IA local precisa do Ollama instalado e de um modelo baixado (página <a href="/ia" style="color:var(--accent)">IA local</a>); ela é mais lenta e usa vários GB de RAM.${ai.claudeKey ? '' : ' Claude precisa de uma chave de API no arquivo .env.'}</p>` : '<p class="muted">Somente o administrador pode trocar o modo.</p>'}</section>`;
  box.querySelectorAll('[data-av]').forEach((b) => { b.onclick = () => { patch({ assistantAvatar: b.dataset.av }); box.querySelectorAll('[data-av]').forEach((x) => x.classList.toggle('on', x === b)); }; });
  box.querySelectorAll('[data-pe]').forEach((b) => { b.onclick = () => { patch({ assistantPersonality: b.dataset.pe }); box.querySelectorAll('[data-pe]').forEach((x) => x.classList.toggle('on', x === b)); }; });
  box.querySelectorAll('#prov [data-v]').forEach((b) => { b.onclick = async () => { const r = await api.put('/ai/config', { provider: b.dataset.v }); store.aiMode = r.mode; toast('Modo do assistente', `Agora: ${r.mode === 'local' ? 'sem IA' : r.mode}`, 'success'); assistantTab(box); }; });
  bindCommon(box);
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
  const tabs = TABS.filter(([k]) => k !== 'admin' || store.user.role === 'admin');
  const cur = tabs.find((t) => t[0] === tab) ? tab : 'aparencia';
  el.innerHTML = `<div class="page-head"><div><h1>Configurações</h1><p>Personalize o Codeniac do seu jeito</p></div></div>
    <div class="tabs settings-tabs" style="flex-wrap:wrap;width:auto">${tabs.map(([k, l, ic]) => `<button data-t="${k}" class="${k === cur ? 'on' : ''}">${icon(ic, 13)} ${l}</button>`).join('')}</div><div id="tab"></div>`;
  el.querySelectorAll('[data-t]').forEach((b) => { b.onclick = () => { location.hash = `#/settings/${b.dataset.t}`; }; });
  const box = el.querySelector('#tab');
  const fn = { aparencia: appearance, rotina: routine, assistente: assistantTab, notificacoes: notifTab, dados: dataTab, admin: adminTab }[cur];
  await fn(box);
  return () => { if (Object.keys(pending).length) patch({}, true); };
}
