// Manifestações públicas — agenda por dia da cidade: em alguns dias, um grupo se reúne num lugar (Praça Central,
// Prefeitura, Parque do Lago, Estádio) por algumas horas com cartazes e palavras de ordem. Começo e fim viram
// notícia; o(a) organizador(a) e participantes postam (foto em pixel da multidão). O mapa desenha a multidão.
import { onTick, record, services } from './core.js';
import { residents } from './agents.js';
import { worldPost, genderize } from '../social.js';
import { gameNow, cityHour, SPEED } from './clock.js';

const HOUR = 3600000; const DAY = 24 * HOUR; const TZ = -3 * HOUR;
const dayOf = (g) => Math.floor((g + TZ) / DAY);
const hash = (s) => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); h ^= h >>> 15; h = Math.imul(h, 2246822507); h ^= h >>> 13; h = Math.imul(h, 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
export const PLACES = { praca: 'Praça Central', prefeitura: 'Prefeitura', parque: 'Parque do Lago', estadio: 'Estádio Nexus' };
export const THEMES = [
  { t: 'Mais ônibus e metrô', s: ['MAIS ÔNIBUS!', 'METRÔ JÁ', 'TRANSPORTE É DIREITO'], c: 'Queremos transporte de verdade!' },
  { t: 'Contra o aumento da tarifa', s: ['NÃO AO AUMENTO', 'TARIFA ZERO', 'R$ NÃO!'], c: 'Abaixa a tarifa!' },
  { t: 'Saúde pública de qualidade', s: ['SAÚDE JÁ', 'MAIS MÉDICOS', 'SUS FORTE'], c: 'Saúde não é mercadoria!' },
  { t: 'Educação e escolas melhores', s: ['EDUCAÇÃO JÁ', 'MAIS ESCOLAS', 'VALORIZE O PROFESSOR'], c: 'Educação em primeiro lugar!' },
  { t: 'Moradia digna para todos', s: ['MORADIA JÁ', 'TETO É DIREITO', 'ALUGUEL JUSTO'], c: 'Moradia digna já!' },
  { t: 'Preservem o Parque do Lago', s: ['SALVE O LAGO', 'MAIS VERDE', 'NATUREZA VIVA'], c: 'Fica, parque!' },
  { t: 'Mais segurança nos bairros', s: ['PAZ', 'SEGURANÇA JÁ', 'ILUMINE AS RUAS'], c: 'Queremos paz!' },
  { t: 'Ciclovias e ruas para pedestres', s: ['CICLOVIA JÁ', 'MENOS CARRO', 'RUA É DE GENTE'], c: 'Ciclovia já!' },
  { t: 'Trânsito mais seguro', s: ['RESPEITE A FAIXA', 'VIDA NO TRÂNSITO', 'MENOS ACIDENTES'], c: 'Trânsito seguro já!' },
];
const PHOTO = ['/assets/social/protesto1.png', '/assets/social/protesto2.png'];

// agenda do dia (determinística: todo mundo vê a mesma)
export function protestsOfDay(d) {
  const out = [];
  if (hash(`p${d}`) < 0.65) {
    const n = hash(`n${d}`) < 0.3 ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const keys = Object.keys(PLACES); const place = keys[Math.floor(hash(`l${d}${k}`) * keys.length)];
      if (out.some((o) => o.place === place)) continue;
      const th = THEMES[Math.floor(hash(`t${d}${k}`) * THEMES.length)];
      const start = 9 + Math.floor(hash(`h${d}${k}`) * 9) + (k ? 0.5 : 0); const dur = 1.5 + hash(`d${d}${k}`) * 2;
      out.push({ id: `pr${d}-${k}`, day: d, place, placeName: PLACES[place], theme: th.t, signs: th.s, chant: th.c, start, end: start + dur, size: 18 + Math.floor(hash(`s${d}${k}`) * 26) });
    }
  }
  return out;
}
const organizer = (w, pr) => { const rs = residents(w).filter((p) => p.agent?.status === 'ativo'); return rs[Math.floor(hash(pr.id) * rs.length)] || null; };

export function protestsView(w) {
  const g = gameNow(); const d = dayOf(g); const h = cityHour(g);
  const list = [...protestsOfDay(d), ...protestsOfDay(d + 1).map((p) => ({ ...p, tomorrow: true }))];
  const pub = (p) => { const o = organizer(w, p); return { ...p, organizer: o ? { id: o.id, name: o.name } : null }; };
  return { hour: h, active: list.filter((p) => !p.tomorrow && h >= p.start && h < p.end).map(pub), next: list.filter((p) => p.tomorrow || h < p.start).slice(0, 3).map(pub) };
}

function F(w) { w.protests ??= { lastG: null, done: {} }; return w.protests; }
onTick((ctx) => {
  const w = ctx.w; if (!w.city) return;
  const S = F(w); const g = gameNow(); const last = S.lastG || g; S.lastG = g;
  if (g - last > 6 * 60000 * SPEED || g <= last) return;
  const d = dayOf(g); const dayStart = d * DAY - TZ;
  for (const pr of protestsOfDay(d)) {
    const t0 = dayStart + pr.start * HOUR; const t1 = dayStart + pr.end * HOUR;
    const org = organizer(w, pr);
    if (!S.done[`${pr.id}a`] && g >= t0 && last < t1) {
      S.done[`${pr.id}a`] = 1;
      record(ctx, { type: 'manifestacao', cat: 'cidade', title: `Manifestação na ${pr.placeName}: "${pr.theme}"`, text: `Cerca de ${pr.size * 6} pessoas se reúnem com cartazes ("${pr.signs.join('", "')}").${org ? ` Organização: ${org.name}.` : ''}`, actors: org ? [org.id] : [], importance: 2 });
      services.live?.(w, { kind: 'cidade', text: `📣 Manifestação na ${pr.placeName}: ${pr.theme}` });
      if (org) try { worldPost(ctx, org, genderize(org, `Tô na ${pr.placeName} agora! ${pr.chant} 📣✊ #${pr.theme.split(' ')[0]}`), { image: PHOTO[Math.floor(hash(pr.id + 'f') * PHOTO.length)] }); } catch { /* sem rede */ }
    }
    if (!S.done[`${pr.id}b`] && g >= t1 && last < t1 + HOUR) {
      S.done[`${pr.id}b`] = 1;
      record(ctx, { type: 'manifestacao-fim', cat: 'cidade', title: `Manifestação na ${pr.placeName} termina de forma pacífica`, text: `O grupo pediu "${pr.theme.toLowerCase()}" e se dispersou no fim da tarde.`, actors: org ? [org.id] : [], importance: 1 });
    }
  }
  for (const k of Object.keys(S.done)) if (Number(k.slice(2).split('-')[0]) < d - 2) delete S.done[k];
});
