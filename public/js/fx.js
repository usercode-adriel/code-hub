// Efeitos visuais: entrada das telas, cartões em cascata e números que "contam" até o valor final.
import { store } from './store.js';

const reduced = () => store.settings?.effects === false || matchMedia('(prefers-reduced-motion: reduce)').matches;
const CASCADE = '.card, .kpi, .row-card, .pcard, .bk-card, .stat-card, .hero2, .bk-hero, .project-card, .bot-card, .feed-item, .notif, .theme-card, .bk-item, .shelf .book, .lesson, .poster, .news-card, .dl-row';
const NUMBERS = '.kpi b, .stat-mini a, .blob-in b, .bk-kpis b, .fin-kpi b, .big-num, .stat b, .level-badge, .shift-card .clock';

export function animateView(el) {
  if (!el || reduced()) return;
  el.classList.add('view-in');
  [...el.querySelectorAll(CASCADE)].slice(0, 24).forEach((c, i) => { c.style.setProperty('--i', i); c.classList.add('fx-in'); });
  countUp(el);
  parallax(el);
}

// Os avatares seguem o mouse de leve (efeito 3D sutil). Só em telas com mouse e sem "reduzir movimento".
function parallax(root) {
  if (reduced() || !matchMedia('(hover: hover)').matches) return;
  for (const av of root.querySelectorAll('.av-pop')) {
    const host = av.parentElement;
    if (!host || host._par) continue;
    host._par = true;
    host.addEventListener('pointermove', (e) => {
      const r = host.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5; const y = (e.clientY - r.top) / r.height - 0.5;
      av.style.setProperty('--px', `${(x * -10).toFixed(1)}px`); av.style.setProperty('--py', `${(y * -6).toFixed(1)}px`); av.style.setProperty('--rz', `${(x * 2.2).toFixed(2)}deg`);
    });
    host.addEventListener('pointerleave', () => { av.style.setProperty('--px', '0px'); av.style.setProperty('--py', '0px'); av.style.setProperty('--rz', '0deg'); });
  }
}

const FMT = /^(-?)(R\$\s?)?(-?)(\d{1,3}(?:\.\d{3})*|\d+)(,\d+)?(%|h| km\/l| min)?$/;
export function countUp(root) {
  if (reduced()) return;
  for (const el of root.querySelectorAll(NUMBERS)) {
    // anima só o primeiro texto numérico do elemento
    const node = [...el.childNodes].find((n) => n.nodeType === 3 && FMT.test(n.textContent.trim()));
    if (!node) continue;
    const txt = node.textContent.trim();
    const m = FMT.exec(txt);
    const decimals = m[5] ? m[5].length - 1 : 0;
    const target = Number(m[4].replace(/\./g, '') + (m[5] ? `.${m[5].slice(1)}` : ''));
    if (!target || target < 2) continue;
    const sign = m[1] || m[3] ? '-' : '';
    const fmt = (v) => `${m[1] || ''}${m[2] || ''}${m[3] || ''}${v.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${m[6] || ''}`;
    const start = performance.now();
    const dur = 650 + Math.min(500, target / 10);
    const lead = node.textContent.match(/^\s*/)[0];
    const tick = (t) => {
      const k = Math.min(1, (t - start) / dur);
      const e = 1 - (1 - k) ** 3;
      node.textContent = lead + fmt(k < 1 ? target * e : target);
      if (k < 1) requestAnimationFrame(tick);
    };
    void sign;
    requestAnimationFrame(tick);
  }
}
