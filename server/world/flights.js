// Aeroporto Internacional Nexus — agenda de voos do dia (mesmos horários que o mapa mostra), com passageiros
// que são moradores de verdade. Antes da partida eles fazem check-in, embarcam e postam; no horário o avião
// decola e eles ficam "viajando" alguns dias; os que já cumpriram a viagem voltam no próximo voo de chegada,
// que pousa, desembarca e vira notícia. Fotos das postagens: cenas em pixel do próprio aeroporto.
import { onTick, record, services } from './core.js';
import { residents, agentOf } from './agents.js';
import { worldPost, genderize } from '../social.js';
import { gameNow, cityHour, SPEED } from './clock.js';
import { SCHEDULE } from '../../public/js/drive/sky.js';

const HOUR = 3600000; const DAY = 24 * HOUR; const TZ = -3 * HOUR;
const dayOf = (g) => Math.floor((g + TZ) / DAY);
const dayStart = (d) => d * DAY - TZ;
const DEST = ['São Paulo', 'Rio de Janeiro', 'Lisboa', 'Buenos Aires', 'Salvador', 'Recife', 'Santiago', 'Florianópolis', 'Fortaleza', 'Montevidéu', 'Madri', 'Cidade do México'];
const PLANES = { 'av-airliner': 'Nexus 320', 'av-executivo': 'Jato Executivo Aurora' };
const NUM = { 6.5: 101, 8: 102, 12: 315, 15.5: 316, 17.5: 207, 20.5: 208 };
export const PHOTOS = { aero: ['/assets/social/aero1.png', '/assets/social/aero2.png', '/assets/social/aero3.png', '/assets/social/aero4.png'], acidente: ['/assets/social/acidente1.png', '/assets/social/acidente2.png', '/assets/social/acidente3.png'] };
export const photo = (kind, seed = Math.random()) => { const l = PHOTOS[kind]; return l[Math.floor(Math.abs(seed) * 1000) % l.length]; };
const hash = (s) => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) / 4294967296; };

function F(w) { w.flights ??= { days: {}, lastG: null }; return w.flights; }
const flightSlots = () => SCHEDULE.filter((s) => s.kind === 'chegada' || s.kind === 'partida');

// agenda de um dia (fica guardada: os passageiros escolhidos não mudam)
function agendaDay(w, d) {
  const S = F(w); const key = String(d);
  if (S.days[key]) return S.days[key];
  const people = residents(w).filter((p) => p.agent?.status === 'ativo');
  // quem já está noutro voo (dias vizinhos) ou viajando não entra de novo
  const used = new Set(Object.values(S.days).flat().flatMap((f) => f.pax));
  const list = flightSlots().map((sl) => {
    const dep = sl.kind === 'partida'; const num = NUM[sl.at] || Math.round(sl.at * 100);
    const city = DEST[Math.floor(hash(`${d}${num}`) * DEST.length)];
    const f = { id: `NX${num}-${d}`, num: `NX ${num}`, kind: sl.kind, at: sl.at, g: dayStart(d) + sl.at * HOUR, city, plane: PLANES[sl.spr] || sl.spr, sprite: sl.spr, gate: dep ? `Portão ${1 + (num % 4)}` : `Esteira ${1 + (num % 3)}`, pax: [], visitors: 0, done: {} };
    if (dep) {
      const pool = people.filter((p) => !used.has(p.id) && (agentOf(w, p).cash ?? 0) > 1500).sort((a, b) => hash(`${d}${num}${a.id}`) - hash(`${d}${num}${b.id}`));
      for (const p of pool.slice(0, 2 + Math.floor(hash(`${num}${d}n`) * 4))) { used.add(p.id); f.pax.push(p.id); }
    }
    f.visitors = 20 + Math.floor(hash(`${d}${num}v`) * (sl.spr === 'av-airliner' ? 140 : 6));
    return f;
  });
  S.days[key] = list;
  for (const k of Object.keys(S.days)) if (Number(k) < d - 2) delete S.days[k];
  return list;
}

const brief = (w, id) => { const p = residents(w).find((x) => x.id === id); return p ? { id: p.id, name: p.name, avatar: p.avatar, job: p.job, gender: p.gender || null } : null; };
function statusOf(f, g) {
  const h = (f.g - g) / HOUR; // horas da cidade até o voo
  if (f.kind === 'partida') return h > 2 ? 'Programado' : h > 0.75 ? 'Check-in aberto' : h > 0.12 ? 'Embarque' : h > 0 ? 'Portas fechadas' : h > -0.6 ? 'Decolou' : 'Em voo';
  return h > 0.6 ? 'Previsto' : h > 0 ? 'Em aproximação' : h > -0.5 ? 'Pousou' : 'Desembarcado';
}

// painel de voos (mapa e celular)
export function flightBoard(w) {
  const g = gameNow(); const d = dayOf(g);
  const list = [...agendaDay(w, d), ...agendaDay(w, d + 1).filter((f) => f.at < 9)];
  const due = returning(w, g);
  return {
    hour: cityHour(g), day: d,
    flights: list.filter((f) => f.g > g - 1.2 * HOUR).slice(0, 10).map((f) => ({
      id: f.id, num: f.num, kind: f.kind, at: f.at, tomorrow: dayOf(f.g) > d, city: f.city, plane: f.plane, sprite: f.sprite, gate: f.gate, status: statusOf(f, g),
      pax: (f.kind === 'partida' ? f.pax : due.slice(0, 6).map((p) => p.id)).map((id) => brief(w, id)).filter(Boolean), visitors: f.visitors,
    })),
  };
}
// quem está viajando e já pode voltar
function returning(w, g) { return residents(w).filter((p) => { const a = p.agent; return a?.status === 'viajando' && a.trip && a.trip.back <= g; }).sort((a, b) => a.agent.trip.back - b.agent.trip.back); }

function post(ctx, p, text, kind = 'aero') {
  try { return worldPost(ctx, p, genderize(p, text), { image: photo(kind, hash(p.id + text)) }); } catch { return null; }
}

// eventos do voo no relógio da cidade: embarque (posts), partida (viajantes saem) e chegada (voltam)
onTick((ctx) => {
  const w = ctx.w; if (!w.city) return;
  const S = F(w); const g = gameNow(); const last = S.lastG || g; S.lastG = g;
  if (g - last > 6 * 60000 * SPEED || g <= last) return; // depois de ficar fora, não despeja tudo de uma vez
  const d = dayOf(g);
  for (const f of [...agendaDay(w, d - 1), ...agendaDay(w, d)]) {
    const people = () => f.pax.map((id) => residents(w).find((p) => p.id === id)).filter((p) => p && p.agent?.status === 'ativo');
    if (f.kind === 'partida') {
      if (!f.done.board && g >= f.g - 0.5 * HOUR && last < f.g) {
        f.done.board = true; const pax = people();
        if (pax[0]) post(ctx, pax[0], pickOf([`Embarcando no ${f.num} pra ${f.city}! ✈️`, `Portão de embarque, ${f.city} me espera 🧳`, `Check-in feito, partiu ${f.city}!`], f.id));
        if (pax[1] && hash(f.id + 'b') < 0.6) post(ctx, pax[1], pickOf(['Aeroporto lotado hoje, mas tô animada(o) 😄', 'Janelinha garantida 🛫', 'Café de aeroporto antes do voo ☕✈️'], f.id + '2'));
      }
      if (!f.done.go && g >= f.g && last < f.g + 0.5 * HOUR) {
        f.done.go = true; const pax = people();
        for (const p of pax) { const a = agentOf(w, p); a.status = 'viajando'; a.trip = { city: f.city, back: f.g + (1.5 + hash(p.id + f.id) * 3) * DAY, flight: f.num }; a.statusUntil = new Date(Date.now() + 7 * 86400000).toISOString(); a.cash = Math.max(0, (a.cash || 0) - 900); }
        record(ctx, { type: 'voo-partida', cat: 'cidade', title: `Voo ${f.num} decola do Aeroporto Nexus rumo a ${f.city}`, text: pax.length ? `A bordo: ${pax.map((p) => p.name).join(', ')}${f.visitors ? ` e mais ${f.visitors} passageiros` : ''}.` : `${f.visitors} passageiros a bordo.`, actors: pax.map((p) => p.id), importance: pax.length ? 2 : 1 });
        services.live?.(w, { kind: 'cidade', text: `✈️ Voo ${f.num} decolou rumo a ${f.city}` });
        if (pax.length > 2) post(ctx, pax[2], pickOf([`Decolamos! Tchau, Nexus City 👋✈️`, `Vista lá de cima é outra coisa 🌆`], f.id + '3'));
      }
    } else if (!f.done.land && g >= f.g && last < f.g + 0.5 * HOUR) {
      f.done.land = true; const back = returning(w, g).slice(0, 6);
      for (const p of back) { const a = agentOf(w, p); a.status = 'ativo'; a.statusUntil = null; a.trip = null; }
      record(ctx, { type: 'voo-chegada', cat: 'cidade', title: `Voo ${f.num} pousa no Aeroporto Nexus vindo de ${f.city}`, text: back.length ? `Voltaram para casa: ${back.map((p) => p.name).join(', ')}.` : `${f.visitors} passageiros desembarcaram.`, actors: back.map((p) => p.id), importance: back.length ? 2 : 1 });
      services.live?.(w, { kind: 'cidade', text: `✈️ Voo ${f.num} pousou vindo de ${f.city}` });
      if (back[0]) post(ctx, back[0], pickOf(['De volta a Nexus City! Saudade de casa 🏠', 'Pousamos! Viagem incrível, mas nada como voltar ✈️', 'Cheguei! Quem quer ver as fotos da viagem? 📸'], f.id));
    }
  }
});
const pickOf = (list, seed) => list[Math.floor(hash(seed) * list.length)];
