// Painel AO VIVO reutilizável (cidade, banco, delegacia, hospital, lojas...).
// Só mostra eventos reais do mundo (GET /mundo/ao-vivo), com rosto em pixel, nome, atividade, tempo relativo,
// ícone colorido por categoria, entrada/saída animadas e rolagem automática que pausa quando você passa o mouse.
import { api } from '../api.js';
import { icon } from '../icons.js';
import { esc, timeAgo } from '../ui.js';
import { on } from '../store.js';
import { myAvatar } from '../chrome.js';

export const LIVE_KIND = {
  entrada: ['pin', '#2fd27a', 'chegou'], saida: ['logout', '#8a91cc', 'saiu'], compra: ['cart', '#fb923c', 'compra'], promo: ['zap', '#f472b6', 'promoção'],
  devolucao: ['refresh', '#fbbf24', 'devolução'], reposicao: ['layers', '#38d6f5', 'estoque'], alerta: ['shield', '#ff4d5e', 'alerta'], noticia: ['news', '#60a5fa', 'notícia'],
  banco: ['wallet', '#a78bfa', 'banco'], emprestimo: ['wallet', '#f7c948', 'empréstimo'], pix: ['send', '#2fd27a', 'pix'], deposito: ['download', '#2fd27a', 'depósito'], saque: ['upload', '#fb923c', 'saque'],
  investimento: ['trending', '#34d399', 'investimento'], pagamento: ['check', '#38d6f5', 'pagamento'], prisao: ['lock', '#ff4d5e', 'prisão'], ocorrencia: ['flag', '#fb923c', 'ocorrência'],
  denuncia: ['bell', '#fbbf24', 'denúncia'], fianca: ['scale', '#f7c948', 'fiança'], atendimento: ['hospital', '#f87171', 'atendimento'],
};
const pxFace = (who, size = 38) => {
  if (!who) return `<span class="lv2-av lv2-ini" style="width:${size}px;height:${size}px">${icon('globe', 16)}</span>`;
  if (who.me) return `<img class="lv2-av" src="${esc(myAvatar())}" alt="" style="width:${size}px;height:${size}px">`;
  return who.avatar ? `<img class="lv2-av" src="${esc(who.avatar)}" alt="" loading="lazy" style="width:${size}px;height:${size}px">`
    : `<span class="lv2-av lv2-ini" style="width:${size}px;height:${size}px;--c:${esc(who.color || '#6c4cf5')}">${esc((who.name || '?')[0])}</span>`;
};
function row(x) {
  const [ic, c, label] = LIVE_KIND[x.kind] || ['bell', '#8a91cc', x.kind];
  const who = x.who?.name ? `<b ${x.who.id && !x.who.me ? `data-person="${esc(x.who.id)}"` : ''}>${esc(x.who.name)}</b> ` : '';
  const text = x.who?.name && x.text?.startsWith(x.who.name) ? esc(x.text.slice(x.who.name.length)) : esc(x.text || '');
  return `<li class="lv2-row" data-id="${esc(x.id)}">${pxFace(x.who)}<span class="lv2-k" style="--c:${c}" title="${esc(label)}">${icon(ic, 11)}</span>
    <div class="lv2-tx"><p>${who}${text}${x.placeName ? ` <em>${esc(x.placeName)}</em>` : ''}</p><small>${esc(timeAgo(x.at))}</small></div></li>`;
}

// host: elemento; scope: 'cidade' | 'banco' | 'policia' | 'saude' | 'comercio' | 'place:<id>'
export function livePanel(host, { scope = 'cidade', title = 'Live da Cidade', n = 14, art = '/assets/pixel/scene-cidade.png', every = 8000, empty = 'Assim que algo acontecer, aparece aqui.' } = {}) {
  host.classList.add('lv2');
  host.innerHTML = `<header class="lv2-h"><span class="lv2-rec"></span><h3>${esc(title)}</h3><span class="lv2-badge">AO VIVO</span></header>
    ${art ? `<div class="lv2-art"><img src="${esc(art)}" alt=""><span class="lv2-eye">${icon('eye', 13)} <b class="lv2-watch">—</b></span></div>` : ''}
    <ul class="lv2-list"><li class="lv2-empty"><div class="skeleton" style="height:120px"></div></li></ul>`;
  const list = host.querySelector('.lv2-list');
  const seen = new Set(); let timer = null; let alive = true; let paused = false; let first = true;
  list.addEventListener('mouseenter', () => { paused = true; }); list.addEventListener('mouseleave', () => { paused = false; });
  const load = async () => {
    if (!alive) return;
    try {
      const r = await api.get(`/mundo/ao-vivo?scope=${encodeURIComponent(scope)}&n=${n}`);
      if (!alive) return;
      const w = host.querySelector('.lv2-watch'); if (w) w.textContent = r.watching >= 1000 ? `${(r.watching / 1000).toFixed(1)} mil` : String(r.watching);
      if (first) {
        first = false;
        list.innerHTML = r.items.length ? r.items.map(row).join('') : `<li class="lv2-empty"><p>${esc(empty)}</p></li>`;
        r.items.forEach((x) => seen.add(x.id));
      } else {
        const fresh = r.items.filter((x) => !seen.has(x.id)).reverse();
        if (fresh.length) {
          list.querySelector('.lv2-empty')?.remove();
          for (const x of fresh) {
            seen.add(x.id);
            list.insertAdjacentHTML('afterbegin', row(x));
            const li = list.firstElementChild; li.classList.add('in');
            setTimeout(() => li.classList.remove('in'), 600);
          }
          const rows = [...list.querySelectorAll('.lv2-row')];
          for (const old of rows.slice(n)) { old.classList.add('out'); setTimeout(() => old.remove(), 400); }
          if (!paused) list.scrollTo({ top: 0, behavior: 'smooth' });
        }
        // atualiza o "há x min" sem redesenhar
        list.querySelectorAll('.lv2-row').forEach((li) => { const x = r.items.find((i) => i.id === li.dataset.id); if (x) li.querySelector('small').textContent = timeAgo(x.at); });
      }
    } catch { if (first) list.innerHTML = `<li class="lv2-empty"><p>${esc(empty)}</p></li>`; first = false; }
  };
  load();
  timer = setInterval(load, every);
  const off = on('world', () => { clearTimeout(host._lvT); host._lvT = setTimeout(load, 900); });
  return () => { alive = false; clearInterval(timer); off?.(); };
}
