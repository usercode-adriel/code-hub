// Utilidades da simulação.
import crypto from 'node:crypto';

export const rnd = (n) => Math.floor(Math.random() * n);
export const pick = (a) => (a && a.length ? a[rnd(a.length)] : undefined);
export const chance = (p) => Math.random() < p;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const uid = () => crypto.randomUUID();
export const nowIso = () => new Date().toISOString();
export const MIN = 60 * 1000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;
export const ago = (iso) => Date.now() - new Date(iso || 0).getTime();
export const str = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
export const shuffle = (a) => a.map((x) => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map((x) => x[1]);
export const weighted = (items) => {
  const total = items.reduce((s, [, w]) => s + Math.max(0, w), 0);
  if (total <= 0) return null;
  let r = Math.random() * total;
  for (const [v, w] of items) { r -= Math.max(0, w); if (r <= 0) return v; }
  return items.at(-1)[0];
};
// distribuição normal aproximada (soma de uniformes)
export const gauss = (mean = 0, sd = 1) => mean + sd * ((Math.random() + Math.random() + Math.random() + Math.random() - 2) / 0.8165);
export const poisson = (lambda) => { let k = 0; let p = 1; const L = Math.exp(-lambda); do { k++; p *= Math.random(); } while (p > L); return k - 1; };
export const money = (v) => `${(Math.round(v * 100) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} NXC`;
export const round2 = (v) => Math.round(v * 100) / 100;
export const hourKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}`;
export const dayKey = (d = new Date()) => hourKey(d).slice(0, 10);
export const cap = (arr, n) => { if (arr.length > n) arr.splice(0, arr.length - n); return arr; };
export const slug = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'x';
export const fold = (t) => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
