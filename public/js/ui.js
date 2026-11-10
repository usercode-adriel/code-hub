import { icon } from './icons.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Chat: blocos ```código```, **negrito** e `código` (sempre escapando o texto antes).
export function chatMd(text) {
  return String(text ?? '').split('```').map((part, i) => {
    if (i % 2) return `<pre class="chat-code"><code>${esc(part.replace(/^[\w+#.-]*\n/, '').replace(/\n$/, ''))}</code></pre>`;
    return esc(part).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`([^`\n]+)`/g, '<code>$1</code>');
  }).join('');
}

export function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';
}

export function avatar(user, cls = '', size = 0) {
  const st = size ? ` style="--s:${size}px"` : '';
  if (!user) return `<div class="avatar ${cls}"${st}></div>`;
  return user.avatar
    ? `<div class="avatar ${cls}"${st}><img src="${esc(user.avatar)}" alt="Foto de ${esc(user.name)}"></div>`
    : `<div class="avatar ${cls}"${st} aria-label="${esc(user.name)}">${esc(initials(user.name))}</div>`;
}

export const notifIcon = (type) => (type === 'update' ? 'rocket' : type === 'task' ? 'check' : 'bell');

const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });
export function timeAgo(iso) {
  const diff = (new Date(iso) - Date.now()) / 1000;
  const units = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
  for (const [u, s] of units) if (Math.abs(diff) >= s) return rtf.format(Math.round(diff / s), u);
  return 'agora';
}

export function fmtDate(d) {
  if (!d) return '';
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}
export const dmy = (d) => (d ? d.split('-').reverse().join('/') : '');
export const brl = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const todayISO = (offset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const isLate = (t) => t.status !== 'done' && t.dueDate && t.dueDate < todayISO();

export const PRIORITY = { high: 'Alta', medium: 'Média', low: 'Baixa' };
export const STATUS = { todo: 'A fazer', doing: 'Em andamento', done: 'Concluído' };
export const STATUS_COLOR = { todo: '#7d828c', doing: '#1f8fff', done: '#22c55e' };

// Leitura em voz alta com a voz do próprio navegador (funciona offline, sem IA).
export function speak(text, lang = 'pt-BR', rate = 1) {
  if (!('speechSynthesis' in window)) { toast('Voz indisponível', 'Seu navegador não tem leitura em voz alta.', 'error'); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/\*\*/g, ''));
  u.lang = lang; u.rate = rate;
  const v = speechSynthesis.getVoices().find((x) => x.lang?.replace('_', '-').startsWith(lang.slice(0, 2)) && /natural|google|microsoft/i.test(x.name))
    || speechSynthesis.getVoices().find((x) => x.lang?.startsWith(lang.slice(0, 2)));
  if (v) u.voice = v;
  speechSynthesis.speak(u);
}

// ---------- Toasts ----------
export function toast(title, message = '', type = 'info') {
  let box = $('.toasts');
  if (!box) { box = document.createElement('div'); box.className = 'toasts'; box.setAttribute('role', 'status'); document.body.append(box); }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `${icon(type === 'error' ? 'x' : type === 'success' ? 'check' : 'bell', 16)}<div><b>${esc(title)}</b>${message ? `<span>${esc(message)}</span>` : ''}</div>`;
  box.append(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, 3800);
}

// ---------- Modal ----------
export function modal({ title, body, wide = false, onMount }) {
  const back = document.createElement('div');
  back.className = 'modal-backdrop';
  back.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn sm ghost" data-close aria-label="Fechar">${icon('x', 16)}</button></div>
    <div class="modal-body">${body}</div></div>`;
  const prevFocus = document.activeElement;
  const close = () => { back.remove(); document.removeEventListener('keydown', onKey); prevFocus?.focus?.(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
  back.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', onKey);
  document.body.append(back);
  back.querySelector('input, textarea, select, button:not([data-close])')?.focus();
  onMount?.(back.querySelector('.modal'), close);
  return close;
}

export function confirmDialog(title, message, okLabel = 'Excluir') {
  return new Promise((resolve) => {
    let answered = false;
    const close = modal({
      title,
      body: `<p class="muted" style="margin:0 0 18px;line-height:1.6">${esc(message)}</p>
        <div class="form-actions"><button class="btn outline" data-no>Cancelar</button><button class="btn danger" data-yes>${esc(okLabel)}</button></div>`,
      onMount: (m) => {
        m.querySelector('[data-yes]').onclick = () => { answered = true; close(); resolve(true); };
        m.querySelector('[data-no]').onclick = () => { answered = true; close(); resolve(false); };
        new MutationObserver((_, obs) => { if (!document.body.contains(m)) { obs.disconnect(); if (!answered) resolve(false); } }).observe(document.body, { childList: true });
      },
    });
  });
}

export function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

// Formulário genérico em modal (usado pelas abas novas). fields: [{name,label,type,options,value,placeholder,hint,full}]
export function formModal({ title, fields, submit = 'Salvar', onSubmit, onDelete, wide = false }) {
  const input = (f) => {
    const v = f.value ?? '';
    if (f.type === 'textarea') return `<textarea id="ff_${f.name}" name="${f.name}" placeholder="${esc(f.placeholder || '')}" ${f.rows ? `rows="${f.rows}"` : ''}>${esc(v)}</textarea>`;
    if (f.type === 'select') return `<select id="ff_${f.name}" name="${f.name}">${f.options.map(([k, l]) => `<option value="${esc(k)}" ${String(k) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    if (f.type === 'checkbox') return `<label class="switch"><input type="checkbox" id="ff_${f.name}" name="${f.name}" ${v ? 'checked' : ''}><span></span></label>`;
    return `<input id="ff_${f.name}" name="${f.name}" type="${f.type || 'text'}" value="${esc(v)}" placeholder="${esc(f.placeholder || '')}" ${f.inputmode ? `inputmode="${f.inputmode}"` : ''} ${f.step ? `step="${f.step}"` : ''}>`;
  };
  return new Promise((resolve) => {
    modal({
      title, wide,
      body: `<form class="form"><div class="form-row">${fields.map((f) => `<div class="field" ${f.full ? 'style="grid-column:1/-1"' : ''}><label for="ff_${f.name}">${esc(f.label)}</label>${input(f)}${f.hint ? `<span class="hint">${esc(f.hint)}</span>` : ''}</div>`).join('')}</div>
        <div class="form-actions">${onDelete ? `<button type="button" class="btn danger" data-del style="margin-right:auto">${icon('trash', 13)} Excluir</button>` : ''}
        <button type="button" class="btn outline" data-close>Cancelar</button><button class="btn primary">${esc(submit)}</button></div></form>`,
      onMount: (m, close) => {
        m.querySelector('form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const data = formData(e.target);
          for (const f of fields) if (f.type === 'checkbox') data[f.name] = e.target[f.name].checked;
          try { const r = await onSubmit(data); close(); resolve(r ?? data); } catch (err) { toast('Erro', err.message, 'error'); }
        });
        m.querySelector('[data-del]')?.addEventListener('click', async () => { close(); await onDelete(); resolve(null); });
      },
    });
  });
}

export function bindUploadZone(zone, input, onFile) {
  zone.addEventListener('click', () => input.click());
  zone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  input.addEventListener('change', () => { if (input.files[0]) onFile(input.files[0]); input.value = ''; });
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('over'));
  zone.addEventListener('drop', (e) => { e.preventDefault(); zone.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) onFile(f); });
}

export function validateImage(file) {
  if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) { toast('Formato inválido', 'Use PNG, JPG, WEBP ou GIF.', 'error'); return false; }
  if (file.size > 8 * 1024 * 1024) { toast('Imagem muito grande', 'O limite é 8 MB.', 'error'); return false; }
  return true;
}

export function pickImage(onFile) {
  const input = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif' });
  input.onchange = async () => {
    const f = input.files[0];
    if (!f || !validateImage(f)) return;
    try { await onFile(f); } catch (err) { toast('Erro no upload', err.message, 'error'); }
  };
  input.click();
}
