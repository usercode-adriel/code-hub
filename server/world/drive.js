// Mapa jogável (cidade 2D) — o que precisa ser real no servidor: veículos e aeronaves da garagem, onde ficaram
// estacionados, danos e reparo (reboque e oficina cobrados na economia), multas de trânsito e as ocorrências
// (atropelamento, acidente, queda de avião, perseguição) que viram notícia e afetam os moradores.
import { record, services } from './core.js';
import { account, addDebt, debit, bankOf, BankError } from './bank.js';
import { garage, VEHICLES, AIRCRAFT } from './vehicles.js';
import { residents, personById, bumpUser } from './agents.js';
import { peopleView } from './living.js';
import { remember, genderize } from '../social.js';
import { round2, nowIso, cap } from './util.js';
import { reformaPublic } from './construtora.js';
import { injure, treat } from './injuries.js';
import { photo } from './flights.js';
import { worldPost } from '../social.js';
import { MAX_BOUNDS as BOUNDS } from '../../public/js/drive/terreno.js';

export const MAP = { v: 'v4', w: 4096, h: 2816 }; // v4: cidade refeita (vagas salvas no traçado antigo são descartadas)
export const FINES = {
  sinal: { label: 'Avanço de sinal vermelho', amount: 293 },
  velocidade: { label: 'Excesso de velocidade', amount: 130 },
  'velocidade-grave': { label: 'Excesso de velocidade (grave)', amount: 195 },
  'velocidade-gravissima': { label: 'Excesso de velocidade (gravíssima)', amount: 880 },
  estacionamento: { label: 'Estacionamento irregular na via (veículo removido ao pátio)', amount: 195 },
  atropelamento: { label: 'Atropelamento de pedestre', amount: 1467 },
  colisao: { label: 'Colisão por direção perigosa', amount: 293 },
  fuga: { label: 'Fuga da abordagem policial', amount: 2934 },
  'acidente-aereo': { label: 'Acidente com aeronave (dano e investigação)', amount: 2500 },
};
const COOLDOWN = 45 * 1000; const PER_DAY = 8;

export function driveState(w) {
  const u = account(w);
  u.devices ??= {}; u.devices.parked ??= {};
  const all = garage(w);
  for (const id of Object.keys(u.devices.parked)) if (!all.some((c) => c.id === id)) delete u.devices.parked[id];
  const cars = all.map((c) => { const pk = u.devices.parked[c.id]; return { ...c, parked: pk && pk.map === MAP.v ? pk : null }; });
  const out = new Set(peopleView(w, { limit: 9999, horizon: 0 }).filter((p) => p.place !== 'em casa' && p.doing !== 'dormindo').map((p) => p.id));
  const people = residents(w).filter((p) => p.agent?.status === 'ativo' && !(p.agent.injuredUntil && p.agent.injuredUntil > nowIso()) && !(p.agent.health && ['ferido', 'ferido_grave', 'internado', 'em_recuperacao', 'morto'].includes(p.agent.health.state)))
    .sort((a, b) => out.has(b.id) - out.has(a.id)).map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, color: p.color, job: p.job, gender: p.gender === 'm' ? 'm' : p.gender === 'f' ? 'f' : null, out: out.has(p.id) }));
  const today = nowIso().slice(0, 10);
  return { map: MAP, reforma: reformaPublic(w), cars, main: u.devices.vehicle || null, people, fines: (u.trafficFines || []).filter((f) => f.at.slice(0, 10) === today).length, limits: { perDay: PER_DAY }, catalog: FINES, balance: bankOf(w).balance };
}

const mine = (w, itemId) => { const it = (account(w).inventory || []).find((x) => x.id === itemId); if (!it || !(VEHICLES[it.key] || AIRCRAFT[it.key])) throw new BankError('Esse veículo não é seu'); return it; };

export function park(w, { itemId, x, y, a }) {
  const u = account(w); mine(w, itemId);
  const n = (v, lo, hi) => Math.max(lo, Math.min(hi, Number(v) || 0));
  u.devices ??= {}; u.devices.parked ??= {};
  u.devices.parked[itemId] = { map: MAP.v, x: round2(n(x, BOUNDS.x0, BOUNDS.x1)), y: round2(n(y, BOUNDS.y0, BOUNDS.y1)), a: round2(n(a, -10, 10)), at: nowIso() };
  return u.devices.parked[itemId];
}

export function damage(w, { itemId, health }) {
  const it = mine(w, itemId);
  it.health = Math.max(0, Math.min(100, Math.round(Number(health) || 0)));
  if (it.health <= 0 && !it.history?.some((h) => h.text.startsWith('Inutilizado') && Date.now() - new Date(h.at).getTime() < 60000)) { it.history ??= []; it.history.push({ at: nowIso(), text: 'Inutilizado após batida forte. Precisa de reboque e reparo.' }); cap(it.history, 30); }
  return { health: it.health };
}

// reboque + oficina: custo depende do estrago e do valor do veículo; o dinheiro sai da conta (ou vira dívida)
export function tow(ctx, { itemId }) {
  const w = ctx.w; const it = mine(w, itemId); const u = account(w);
  const hp = it.health ?? 100;
  if (hp >= 100) throw new BankError('Esse veículo não precisa de reparo');
  if (it.repairUntil && new Date(it.repairUntil).getTime() > Date.now()) throw new BankError('O veículo já está na oficina');
  const spec = VEHICLES[it.key] || AIRCRAFT[it.key];
  const air = Boolean(AIRCRAFT[it.key]);
  const towFee = air ? 1200 : 180;
  const repair = round2(((100 - hp) / 100) * (spec.base || 20000) * (air ? 0.08 : 0.1));
  const total = round2(towFee + repair);
  const desc = `${air ? 'Resgate e manutenção' : 'Reboque e reparo'}: ${it.name}`;
  let paid = 'conta';
  try { debit(w, total, desc, ctx.at, 'oficina'); } catch (err) { if (err.code !== 'FUNDS') throw err; addDebt(w, { kind: 'servico', amount: total, desc, dueDays: 5, creditor: air ? 'Hangar Nexus Aviação' : 'Oficina Turbo', at: ctx.at }); paid = 'divida'; }
  const mins = hp <= 0 ? 8 : 4;
  it.repairUntil = new Date(Date.now() + mins * 60000).toISOString();
  it.history ??= []; it.history.push({ at: nowIso(), text: `${desc} — ${total.toLocaleString('pt-BR')} NXC. Pronto em ${mins} min.` }); cap(it.history, 30);
  if (u.devices?.parked) delete u.devices.parked[itemId];
  record(ctx, { type: 'reparo', cat: 'pessoal', title: `${it.name} foi ${air ? 'resgatado' : 'rebocado'} para ${air ? 'o hangar' : 'a oficina'}`, text: `${total.toLocaleString('pt-BR')} NXC (${paid === 'conta' ? 'pago na conta' : 'lançado em Pendências'})`, actors: ['me'], importance: 1 });
  return { total, towFee, repair, until: it.repairUntil, paid };
}

export function infraction(ctx, { tipo, kmh, limite, veiculo }) {
  const w = ctx.w; const u = account(w);
  const f = FINES[tipo]; if (!f) throw new BankError('Infração desconhecida');
  u.trafficFines ??= [];
  const now = Date.now(); const today = nowIso().slice(0, 10);
  if (u.trafficFines.some((x) => x.tipo === tipo && now - new Date(x.at).getTime() < COOLDOWN)) return { ok: false, reason: 'cooldown' };
  if (u.trafficFines.filter((x) => x.at.slice(0, 10) === today).length >= PER_DAY) return { ok: false, reason: 'limite' };
  const detail = tipo.startsWith('velocidade') ? ` — ${Math.round(Number(kmh) || 0)} km/h numa via de ${Math.round(Number(limite) || 0)} km/h` : '';
  const d = addDebt(w, { kind: 'multa', amount: f.amount, desc: `Multa de trânsito: ${f.label}${detail}`, dueDays: 5, creditor: 'Departamento de Trânsito de Nexus City', at: ctx.at });
  u.trafficFines.push({ tipo, at: nowIso(), amount: f.amount, debtId: d.id }); u.trafficFines = u.trafficFines.slice(-60);
  u.reputation = Math.max(0, (u.reputation || 50) - (tipo === 'velocidade' ? 1 : tipo === 'fuga' || tipo === 'atropelamento' ? 6 : 2));
  record(ctx, { type: 'multa-transito', cat: 'seguranca', title: `${f.label}: multa de ${f.amount} NXC`, text: `${veiculo ? `Veículo: ${String(veiculo).slice(0, 40)}.` : ''}${detail}`, actors: ['me'], importance: 1 });
  services.live?.(w, { kind: 'ocorrencia', personaId: 'me', name: 'Você', text: `Você levou uma multa de trânsito (${f.label.toLowerCase()})` });
  return { ok: true, fine: { label: f.label, amount: f.amount, debtId: d.id } };
}

// ocorrência do mapa: vira notícia/acontecimento real; moradores atropelados ficam feridos (internados) e lembram disso
const TITLES = {
  atropelamento: (n, r, c) => `${n || 'Pedestre'} é atropelado(a)${r ? ` em ${r}` : ''}${c ? ' — motorista era o(a) jogador(a)' : ''}`,
  acidente: (n, r) => (n ? `${n} se fere em batida de carros${r ? ` em ${r}` : ''}` : `Acidente de trânsito${r ? ` em ${r}` : ''}`),
  'queda-aviao': (n, r) => `Avião cai${r ? ` em ${r}` : ''}: bombeiros e ambulâncias no local`,
  'batida-policia': (n, r) => `Batida entre carros${r ? ` em ${r}` : ''}: polícia registra a ocorrência e veículos são guinchados`,
  'batida-guincho': (n, r) => `Batida entre carros${r ? ` em ${r}` : ''}: veículos são levados pelo guincho`,
  'perseguicao-presa': () => 'Polícia encerra perseguição e aborda motorista',
  'perseguicao-fuga': () => 'Motorista despista a polícia após perseguição',
};
export function incident(ctx, { tipo, personaId, nome, regiao, culpa, veiculo, npc, nomes, kmh }) {
  const w = ctx.w; const u = account(w);
  if (!TITLES[tipo]) throw new BankError('Ocorrência desconhecida');
  u.mapIncidents ??= []; const today = nowIso().slice(0, 10);
  if (u.mapIncidents.filter((x) => x.slice(0, 10) === today).length >= 40) return { ok: false, reason: 'limite' };
  u.mapIncidents.push(nowIso()); u.mapIncidents = u.mapIncidents.slice(-40);
  const p = personId(w, personaId);
  const reg = String(regiao || '').slice(0, 40);
  if ((tipo === 'atropelamento' || tipo === 'acidente') && p) {
    // gravidade pela velocidade do veículo (informada pelo mapa); ferimentos persistentes em agent.health
    const r = injure(ctx, p, { kmh: Number(kmh) || 30, causa: tipo === 'acidente' ? 'acidente' : 'atropelamento', local: reg });
    if (r?.state === 'morto') p.agent.injuredUntil = null;
    else if (r) { treat(ctx, p); }
    if (culpa) bumpUser(ctx, p, -12, { trust: -10, note: 'Me atropelou.' });
  }
  const imp = tipo === 'queda-aviao' ? 4 : tipo === 'atropelamento' ? 3 : 2;
  // nas redes: uma testemunha posta a foto do local (cena em pixel do mapa)
  if (['atropelamento', 'acidente', 'queda-aviao', 'batida-policia', 'batida-guincho'].includes(tipo)) {
    const wit = residents(w).filter((x) => x.id !== p?.id && x.agent?.status === 'ativo');
    const who = wit[Math.floor(Math.random() * wit.length)];
    const what = tipo.startsWith('batida') ? `Batida${reg ? ` em ${reg}` : ''} agora há pouco 🚗💥 ${tipo === 'batida-policia' ? 'a polícia veio e chamou o guincho' : 'os motoristas discutiram e o guincho levou os carros'}` : tipo === 'atropelamento' ? `Acabei de ver um atropelamento${reg ? ` em ${reg}` : ''} 😰 a ambulância já tá chegando` : tipo === 'acidente' ? `Batida feia${reg ? ` em ${reg}` : ''} agora há pouco 🚗💥 juntou gente e a ambulância veio` : `Um avião caiu${reg ? ` perto de ${reg}` : ''}!! 😱 bombeiros no local`;
    if (who) try { worldPost(ctx, who, genderize(who, `${what}${p ? `. Força, ${p.name.split(' ')[0]}! 🙏` : ''}`), { image: photo('acidente') }); } catch { /* sem rede */ }
  }
  const who = Array.isArray(nomes) ? nomes.map((x) => String(x).slice(0, 40)).slice(0, 2) : [];
  record(ctx, { type: `mapa-${tipo}`, cat: 'seguranca', title: TITLES[tipo](p?.name || nome, reg, culpa), text: [veiculo ? `Veículo envolvido: ${String(veiculo).slice(0, 40)}.` : '', who.length ? `Motoristas: ${who.join(' e ')}.` : ''].filter(Boolean).join(' '), actors: [...(culpa ? ['me'] : []), ...(p ? [p.id] : [])], importance: imp });
  services.live?.(w, { kind: tipo === 'atropelamento' || tipo === 'queda-aviao' ? 'atendimento' : 'ocorrencia', personaId: p?.id || (culpa ? 'me' : null), name: p?.name || (culpa ? 'Você' : null), text: TITLES[tipo](p?.name || nome, reg, false) });
  return { ok: true };
}
const personId = (w, id) => (id ? personById(w, id) : null);
