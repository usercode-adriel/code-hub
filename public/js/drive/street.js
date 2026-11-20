// OCORRÊNCIAS DE RUA — o jogador e os moradores seguem as mesmas regras.
//  • Esbarrão andando: o morador fica irritado e discute (caixa de diálogo); conforme a resposta, chama a polícia
//    (a viatura vem e o policial registra a reclamação: multa por perturbação).
//  • Derrubar alguém correndo: um de três desfechos — inconsciente (caído), sentado sangrando (discute com raiva) ou
//    morte. Juntam-se de 5 a 20 curiosos comentando; quem se sente ameaçado chama a polícia ou foge. A ambulância
//    chega 1 min depois, a polícia 20 s depois dela (paradas afastadas uma da outra). A enfermeira atende e pergunta;
//    a vítima (ou as testemunhas) responde. O policial investiga, a vítima/testemunhas apontam o culpado e a polícia
//    persegue: preso(a) = 1 dia de cela ou fiança. A cena toda dura de 3 a 5 min.
//  • Esbarrar num policial: agressão a policial, 2 dias de cela ou fiança.
//  • Crime entre moradores (raro): um passante ataca outro (baleado → morto) e foge; mesma cena de socorro.
// O conteúdo persistente (ferimento, crime, ficha, prisão) vai ao servidor (/mundo/rua/*). Sem DOM.
import { nearestLane, along } from './world.js';
import { CHR } from './chrmeta.js';
import { DUR } from './reactions.js';

export const TIMES = { ambulance: 60, police: 80, lead: 34, minDur: 180, maxDur: 300 }; // lead: tempo médio da viatura até o local (medido no mapa)
const pickR = (a, r) => a[Math.floor(r() * a.length)];
// gênero na fala: "{o|a}" escolhe pela pessoa de quem se fala
export const gz = (text, g) => String(text).replace(/\{([^|}]*)\|([^}]*)\}/g, (_, m, f) => (g === 'f' ? f : m));
const genderOf = (spr) => CHR[String(spr || '').replace(/^chr\//, '')]?.g || 'm';
export const looksOf = (spr) => { const c = CHR[String(spr || '').replace(/^chr\//, '')]; return c ? `${c.g === 'f' ? 'aquela' : 'aquele'} ${c.name.toLowerCase().replace(/ \(f\)$/, '')}` : 'aquela pessoa'; };

// falas dos curiosos por tipo de ocorrência ({o|a} = vítima)
export const CROWD = {
  inconsciente: ['{Ele|Ela} desmaiou! Alguém chama uma ambulância!', 'Tá respirando? Acho que bateu a cabeça no chão.', 'Eu vi tudo: veio alguém correndo e derrubou {ele|ela}.', 'Não mexe {nele|nela}! Espera o socorro.', 'Correndo assim na calçada... dava pra ver que ia dar nisso.', 'Já liguei pro 192, a ambulância tá vindo.', 'Coitad{o|a}, nem viu de onde veio.'],
  sangrando: ['Tá sangrando muito! Aperta o machucado.', 'Calma, a ambulância já tá vindo.', 'Foi aquela pessoa ali que derrubou!', 'Alguém tem um pano limpo? Tá sangrando.', 'Não deixa ir embora, a polícia tem que ver isso.', 'Que violência... e ainda fica aí parado.', '{Ele|Ela} bateu a cabeça no meio-fio.'],
  morte: ['Meu Deus... não tá respirando!', 'Chama a polícia, rápido!', 'Eu vi quem foi! Não deixa fugir!', 'Ninguém mexe no corpo até a polícia chegar.', 'Que tragédia...', 'Sai da frente, deixa o socorro passar!', 'Alguém sabe fazer massagem cardíaca?'],
  assassinato: ['Foi um tiro! {Ele|Ela} caiu na hora!', 'O atirador saiu correndo pra lá!', 'Chama a polícia! Agora!', 'Abaixa! Pode ter mais tiro!', 'Não toca em nada, é cena de crime.', 'Meu Deus, foi do nada...', 'Eu vi o rosto dele, dá pra reconhecer.'],
  ambulancia: ['Graças a Deus, a ambulância chegou.', 'Abre espaço pra enfermeira!', 'Demorou, hein...'],
  policia: ['Finalmente a polícia.', 'Conta pra ele o que você viu!', 'Agora quero ver fugir.'],
};
const CALL = ['Alô, polícia? Tem uma pessoa caída aqui, mandem alguém!', '190? Aconteceu uma coisa grave aqui na rua!', 'Tô ligando pra polícia agora mesmo.', 'Alô? Preciso de uma viatura aqui, urgente!'];
const FLEE = ['Sai daqui, é perigoso!', 'Vou embora, não quero confusão!', 'Corre!', 'Isso não é comigo...'];
const BUMP = ['Ei! Olha por onde anda!', 'Ai! Você me empurrou!', 'Ô, cuidado aí!', 'Tá ceg{o|a}? Quase me derrubou!'];

export function createStreet(D) {
  const { P, INC, ACC, world, me, post = async () => null, notify = () => {}, ui = {}, regionAt = () => 'na rua', rand = Math.random, now = () => performance.now() } = D;
  const S = { scenes: [], cool: new Map(), lastBump: -1e9, murderT: 480 + rand() * 360, complaints: [] };
  const pick = (a) => pickR(a, rand);
  const say = (o, text, emo = 'neutro', secs = null) => { if (!o) return; const tx = String(text); o.say = { text: tx, emo, until: now() + (secs ?? Math.min(6.5, Math.max(2.4, 1.6 + tx.length * 0.06))) * 1000 }; };
  const actor = (spr, x, y, name) => { const a = { spr, x, y, a: Math.PI / 2, to: null, v: 11, face: null, say: null, name, t: 0, gone: false, onArrive: null, street: true }; ACC.S.actors.push(a); return a; };
  const meXY = () => me.car || me;
  const mePlace = () => regionAt(meXY());
  const busy = (p) => !['walk', 'wait', 'cross', 'olhando', 'conversa'].includes(p.state);
  const isPolice = (spr) => /chr\/policial/.test(spr || '');

  // ---------------------------------------------------------------- reações e fuga
  function react(p, kind, then = null) { p.state = 'vitima'; p.react = { kind, t0: now(), face: (p.x >= meXY().x ? 1 : -1), then }; p.talk = null; }
  function flee(p, from, secs = 5 + rand() * 3) {
    if (p.state === 'vitima') return;
    const a = Math.atan2(p.y - from[1], p.x - from[0]) + (rand() - 0.5) * 0.8;
    p.state = 'foge'; p.flee = { t: secs, a }; p.v0 = p.v0 || p.v; say(p, pick(FLEE), 'surpresa', 2.2);
  }
  function backToWalk(p) { const q = along(p.walk.path, Math.max(0, Math.min(p.walk.path.len, p.s))); p.roda = { to: [q.x, q.y], at: [q.x, q.y], back: [q.x, q.y] }; p.state = 'volta'; }

  // ---------------------------------------------------------------- cena (queda ou crime)
  function crowdOf(sc, n) {
    const [x, y] = sc.at;
    const cand = P.peds.filter((q) => q !== sc.victim && q !== sc.attacker && !busy(q) && Math.hypot(q.x - x, q.y - y) < 360).sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y)).slice(0, n);
    cand.forEach((q, i) => {
      const ang = (i / Math.max(1, cand.length)) * Math.PI * 2 + rand() * 0.4; const r = 20 + (i % 3) * 8 + rand() * 6;
      Object.assign(q, { state: 'roda', roda: { to: [x + Math.cos(ang) * r, y + Math.sin(ang) * r * 0.75], at: [x, y] }, cross: null, talk: null, crowd: sc, nextSay: 1.5 + rand() * 6 });
    });
    return cand;
  }
  // quem está na roda decide diante de uma ameaça: chamar a polícia ou correr
  function threat(sc, q, from, fleeBias = 0.35) {
    if (q.decided) return; q.decided = true;
    if (rand() < fleeBias) { flee(q, from); sc.fled++; } else { say(q, gz(pick(CALL), sc.g), 'surpresa', 3.2); sc.calls++; }
  }
  function startScene(kind, victim, extra = {}) {
    const g = genderOf(victim.spr);
    const sc = { id: Math.random().toString(36).slice(2), kind, victim, g, at: [victim.x, victim.y], t: 0, dur: TIMES.minDur + rand() * (TIMES.maxDur - TIMES.minDur), q: [], calls: 0, fled: 0, done: false, place: mePlace(), ...extra };
    sc.inc = INC.create('rua', sc.at[0], sc.at[1], { units: [], noCrowd: true, scene: { active: true } });
    sc.crowd = crowdOf(sc, 5 + Math.floor(rand() * 16)); // de 5 a 20 curiosos
    // ameaça: quem está perto decide na hora (morte e tiro assustam mais)
    const scary = kind === 'morte' || kind === 'assassinato';
    for (const q of sc.crowd) if (rand() < (scary ? 0.55 : 0.25)) threat(sc, q, extra.attacker ? [extra.attacker.x, extra.attacker.y] : [meXY().x, meXY().y], scary ? 0.45 : 0.3);
    // paradas da ambulância e da viatura: na mesma faixa, uma atrás da outra, com folga entre elas
    const ln = nearestLane(world, sc.at[0], sc.at[1], (l) => !l.narrow);
    if (ln) {
      const len = ln.lane.path.len; const sA = Math.max(30, Math.min(len - 6, ln.s + 10)); const sP = sA - 62;
      const pa = along(ln.lane.path, sA); sc.ambAt = [pa.x, pa.y];
      if (sP >= 8) { const pp = along(ln.lane.path, sP); sc.polAt = [pp.x, pp.y]; }
      else { const rev = world.lanes.find((l) => l.edge === ln.lane.edge && l.from === ln.lane.to && !l.inner); const q = rev ? along(rev.path, Math.max(8, rev.path.len - sA)) : null; sc.polAt = q ? [q.x, q.y] : [pa.x + 70, pa.y]; }
    }
    S.scenes.push(sc);
    return sc;
  }
  const line = (sc, delay, who, text, emo = 'neutro') => { const last = sc.q.length ? sc.q[sc.q.length - 1].t : sc.t; sc.q.push({ t: Math.max(sc.t, last) + delay, who, text: gz(text, sc.g), emo }); };
  const witness = (sc) => sc.crowd.filter((q) => q.state === 'roda' || q.state === 'olhando').sort((a, b) => Math.hypot(a.x - sc.at[0], a.y - sc.at[1]) - Math.hypot(b.x - sc.at[0], b.y - sc.at[1]))[0] || null;

  // o jogador derrubou alguém correndo: um dos três desfechos
  S.knock = (p) => {
    if (busy(p) && p.state !== 'olhando') return null;
    if ((S.cool.get(p.id) || 0) > now()) return null;
    if (isPolice(p.spr)) return S.officer(p);
    S.cool.set(p.id, now() + 60000);
    const r = rand(); const res = r < 0.45 ? 'inconsciente' : r < 0.85 ? 'sangrando' : 'morte';
    if (res === 'inconsciente') react(p, 'inconsciente');
    else if (res === 'sangrando') react(p, 'dor', { kind: 'sentado', at: DUR.dor });
    else react(p, 'sangramento', { kind: 'morto', at: DUR.sangramento });
    const sc = startScene(res, p);
    post('queda', { resultado: res, personaId: p.real ? p.id : null, local: sc.place }).then((x) => { if (x?.estado === 'morto' && res !== 'morte') sc.serverDead = true; });
    if (res === 'sangrando') {
      line(sc, 1.6, p, 'Ai! Você me derrubou! Olha o que você fez, tô sangrando!', 'irritado');
      ui.discuss?.({ ped: p, situacao: 'sangrando', opening: 'Você me derrubou! Tô sangrando!', onResult: (x) => { if (x) say(p, x.fala, x.emo); } });
    }
    notify(res === 'morte' ? '💀 Você derrubou uma pessoa' : '⚠️ Você derrubou uma pessoa', res === 'inconsciente' ? `${p.real ? p.name : 'O pedestre'} ficou inconsciente no chão.` : res === 'sangrando' ? `${p.real ? p.name : 'O pedestre'} está sangrando e muito irritado(a).` : `${p.real ? p.name : 'O pedestre'} não resistiu à queda.`, 'error');
    return sc;
  };

  // esbarrão andando: discussão; pode chamar a polícia
  S.bump = (p) => {
    if (busy(p) || (S.cool.get(p.id) || 0) > now() || now() - S.lastBump < 6000) return null;
    if (isPolice(p.spr)) return S.officer(p);
    S.cool.set(p.id, now() + 25000); S.lastBump = now();
    const g = genderOf(me.spr); p.state = 'discute'; p.disc = { t: 14 }; p.talk = null;
    const open = gz(pick(BUMP), g); say(p, open, 'irritado');
    ui.discuss?.({ ped: p, situacao: 'esbarrao', opening: open, onResult: (x) => {
      if (!x) { p.disc.t = 2; return; }
      say(p, x.fala, x.emo);
      if (x.chamaPolicia) { p.disc.t = 6; setTimeoutSafe(() => say(p, 'Alô, polícia? Uma pessoa me empurrou e ainda me ofendeu!', 'irritado', 3.5), 2200); S.complaint(p); }
      else p.disc.t = 3;
    } });
    return p;
  };
  const setTimeoutSafe = (f, ms) => (typeof setTimeout === 'function' ? setTimeout(f, ms) : f());

  // reclamação: a viatura vem até o morador; se o jogador ainda está perto, o policial registra e multa
  S.complaint = (p) => {
    const inc = INC.create('reclamacao', p.x, p.y, { units: [], noCrowd: true, scene: { active: true } });
    const c = { p, inc, at: [p.x, p.y], t: 0, unit: null, officer: null, done: false };
    c.unit = INC.dispatch('policia', inc, { near: [300, 450] }); if (c.unit) c.unit.release = false;
    S.complaints.push(c); notify('📞 Chamaram a polícia', 'O morador ligou reclamando de você. Uma viatura está a caminho.', 'warning');
  };

  // esbarrar num policial: agressão a policial → 2 dias ou fiança
  S.officer = (p) => {
    if ((S.cool.get(p.id || p.name) || 0) > now()) return null;
    S.cool.set(p.id || p.name, now() + 30000);
    if (P.peds.includes(p)) { react(p, 'caido'); p.react.then = { kind: 'levantando', at: 1.6, until: 2.6 }; }
    say(p, gz('Você derrubou um policial! Está pres{o|a} por agressão!', genderOf(me.spr)), 'irritado', 4);
    post('policial', { local: mePlace() }).then((x) => { if (x) ui.arrest?.({ ...x, motivo: 'Agressão a policial' }); });
    return p;
  };

  // crime entre moradores: um passante ataca outro e foge
  function murder(view) {
    const L = P.peds.filter((q) => !q.real && q.state === 'walk' && Math.hypot(q.x - view.x, q.y - view.y) < view.r * 0.75);
    for (const v of L) {
      const a = L.find((q) => q !== v && Math.hypot(q.x - v.x, q.y - v.y) > 25 && Math.hypot(q.x - v.x, q.y - v.y) < 110);
      if (!a) continue;
      a.state = 'ataca'; a.attack = { target: v }; v.pause = 99; // a vítima para (olhando o celular)
      return true;
    }
    return false;
  }
  function shot(a, v) {
    a.attack = null; say(a, '💥 BANG!', 'irritado', 1.5);
    react(v, 'baleado', { kind: 'morto', at: DUR.baleado });
    const sc = startScene('assassinato', v, { attacker: a });
    flee(a, [v.x, v.y], 12); a.flee.attacker = true; a.v0 = a.v0 || a.v;
    post('assassinato', { local: sc.place });
  }

  // ---------------------------------------------------------------- passo de simulação
  S.step = (dt, view) => {
    // assassinato raro (com a cena livre e gente na tela)
    S.murderT -= dt;
    if (S.murderT <= 0) S.murderT = !S.scenes.length && view && murder(view) ? 480 + rand() * 360 : 30; // sem dupla na tela: tenta de novo em 30 s
    for (const p of P.peds) {
      if (p.state === 'foge') {
        const f = p.flee; f.t -= dt; const sp = 30; p.x += Math.cos(f.a) * sp * dt; p.y += Math.sin(f.a) * sp * dt; p.a = f.a; p.v = sp;
        if (f.t <= 0) { p.v = p.v0 || 9; p.flee = null; if (f.attacker) { p.state = 'walk'; p.far = 99; p.x = -9999; } else backToWalk(p); }
      } else if (p.state === 'ataca') {
        const v = p.attack?.target; if (!v || v.state !== 'walk') { p.state = 'walk'; p.attack = null; if (v) v.pause = 0; continue; }
        const dx = v.x - p.x; const dy = v.y - p.y; const d = Math.hypot(dx, dy);
        if (d < 12) shot(p, v); else { p.x += (dx / d) * 16 * dt; p.y += (dy / d) * 16 * dt; p.a = Math.atan2(dy, dx); }
      } else if (p.state === 'discute') {
        const m = meXY(); p.a = Math.atan2(m.y - p.y, m.x - p.x); p.disc.t -= dt;
        if (p.disc.t <= 0) { p.disc = null; backToWalk(p); }
      } else if (p.state === 'vitima' && p.react?.then && p.react.then.kind !== 'end' && (now() - p.react.t0) / 1000 >= p.react.then.at) {
        const th = p.react.then; p.react = { kind: th.kind, t0: now(), face: p.react.face, then: th.until ? { kind: 'end', at: th.until - th.at } : null };
      } else if (p.state === 'vitima' && p.react?.kind === 'levantando' && p.react.then?.kind === 'end' && (now() - p.react.t0) / 1000 >= p.react.then.at) { p.react = null; backToWalk(p); }
    }
    // ameaça ao vivo: o jogador correndo perto da roda assusta (alguém foge ou liga para a polícia)
    const m = meXY();
    for (const sc of S.scenes) {
      sc.t += dt;
      if (me.run && me.moving) for (const q of sc.crowd) if (q.state === 'roda' && Math.hypot(q.x - m.x, q.y - m.y) < 34) threat(sc, q, [m.x, m.y], 0.6);
      // falas da roda
      for (const q of sc.crowd) {
        if (q.state !== 'roda') continue; q.nextSay -= dt;
        if (q.nextSay <= 0) { q.nextSay = 6 + rand() * 10; const pool = sc.pol?.arrived ? CROWD.policia : sc.amb?.arrived ? CROWD.ambulancia : CROWD[sc.kind]; if (!sc.q.some((x) => x.t > sc.t && x.t - sc.t < 3)) say(q, gz(pick(pool), sc.g)); }
      }
      // linha do tempo: ambulância (1 min), polícia (20 s depois), atendimento, investigação e fim
      if (!sc.amb && sc.t >= TIMES.ambulance - TIMES.lead && sc.ambAt) { const u = INC.dispatch('ambulancia', sc.inc, { at: sc.ambAt, back: 0, near: [320, 420] }); sc.amb = { unit: u }; if (u) u.release = false; }
      if (!sc.pol && sc.t >= TIMES.police - TIMES.lead && sc.polAt) { const u = INC.dispatch('policia', sc.inc, { at: sc.polAt, back: 0, near: [320, 420] }); sc.pol = { unit: u }; if (u) u.release = false; }
      // chegada na hora marcada: a viatura acerta a velocidade pela distância que falta (o trânsito pode atrasar ou adiantar)
      for (const [k, eta] of [['amb', TIMES.ambulance], ['pol', TIMES.police]]) {
        const u = sc[k]?.unit; const to = k === 'amb' ? sc.ambAt : sc.polAt; if (!u || sc[k].arrived || !to || u.job?.phase !== 'indo') continue;
        const left = Math.hypot(u.x - to[0], u.y - to[1]) * 1.3; const tl = eta + 0.4 - sc.t; // inclui a frenagem (medido: chega no segundo marcado)
        u.maxV = tl <= 1 ? 60 : Math.max(16, Math.min(60, (left / tl) * 1.1));
        if (left < 110 && tl > 2) u.maxV = Math.max(4, left / tl); // adiantada: chega devagar, na hora
      }
      for (const [k, spr] of [['amb', 'chr/enfermeira'], ['pol', pickR(['chr/policial', 'chr/policial2'], rand)]]) {
        const o = sc[k]; if (!o?.unit || o.arrived) continue;
        if (o.unit.job?.phase === 'atendendo') {
          o.arrived = sc.t; const u = o.unit; const [dx, dy] = [Math.cos(u.a + Math.PI / 2) * 10, Math.sin(u.a + Math.PI / 2) * 10];
          const who = actor(spr, u.x + dx, u.y + dy, k === 'amb' ? 'Enfermeira' : 'Policial'); o.who = who;
          const v = sc.victim; const side = k === 'amb' ? -1 : 1;
          who.to = [v.x + side * 9, v.y + 4]; who.onArrive = () => { who.face = [v.x, v.y]; (k === 'amb' ? nurseTalk : policeTalk)(sc); };
        }
      }
      // falas agendadas
      while (sc.q.length && sc.q[0].t <= sc.t) { const l = sc.q.shift(); if (typeof l.who === 'function') l.who(); else if (l.who && !l.who.gone) say(l.who, l.text, l.emo); }
      // a vítima vai para a ambulância depois do atendimento e da conversa com a polícia
      if (!sc.taken && sc.amb?.talked && (sc.pol?.talked || sc.t > TIMES.police + 60)) {
        sc.taken = true; const v = sc.victim; v.state = 'levado'; v.x = -999; v.react = null; v.hosp = sc.kind === 'morte' || sc.kind === 'assassinato' || sc.serverDead ? 1e9 : 150;
        if (sc.amb.who) { const u = sc.amb.unit; sc.amb.who.to = [u.x, u.y]; sc.amb.who.onArrive = () => { sc.amb.who.gone = true; u.release = true; }; }
      }
      if (sc.pol?.talked && !sc.polBack && sc.t > (sc.pol.talkedAt || 0) + 8) { sc.polBack = true; const u = sc.pol.unit; sc.pol.who.to = [u.x, u.y]; sc.pol.who.onArrive = () => { sc.pol.who.gone = true; u.release = true; }; }
      if (sc.t >= sc.dur) {
        sc.done = true; sc.inc.scene.active = false;
        for (const q of sc.crowd) { q.crowd = null; q.decided = false; if (q.state === 'roda') q.state = 'volta'; }
        for (const k of ['amb', 'pol']) { if (sc[k]?.unit) sc[k].unit.release = true; if (sc[k]?.who) sc[k].who.gone = true; }
        if (!sc.taken && sc.victim.state === 'vitima') { sc.victim.state = 'levado'; sc.victim.x = -999; sc.victim.hosp = sc.kind === 'morte' || sc.kind === 'assassinato' ? 1e9 : 150; }
      }
    }
    S.scenes = S.scenes.filter((s) => !s.done);
    // reclamações (esbarrão): policial vem até o morador e procura o jogador
    for (const c of S.complaints) {
      c.t += dt; const u = c.unit;
      if (!u || c.t > 120) { c.done = true; if (u) u.release = true; c.inc.scene.active = false; continue; }
      if (!c.officer && u.job?.phase === 'atendendo') {
        c.officer = actor('chr/policial', u.x + 8, u.y + 8, 'Policial'); const near = Math.hypot(m.x - c.at[0], m.y - c.at[1]) < 260;
        const o = c.officer; o.to = near ? [m.x - 8, m.y + 3] : [c.at[0] + 8, c.at[1]];
        o.onArrive = () => {
          const g = genderOf(me.spr);
          if (near) { say(o, gz('Recebemos uma reclamação: você empurrou e ofendeu um morador. Vou registrar a ocorrência e aplicar a multa.', g), 'neutro', 5); post('reclamacao', { local: mePlace(), presente: true }).then((x) => { if (x?.multa) notify('🚔 Multa por perturbação', `${x.multa.amount} NXC (Banco → Pendências). A reclamação foi para a sua ficha.`, 'error'); }); }
          else { say(o, 'A pessoa já foi embora. Fica registrado, vamos investigar.', 'neutro', 4); post('reclamacao', { local: c.p ? regionAt(c.p) : mePlace(), presente: false }); }
          setTimeoutSafe(() => { o.to = [u.x, u.y]; o.onArrive = () => { o.gone = true; u.release = true; c.done = true; c.inc.scene.active = false; }; }, 5000);
        };
      }
    }
    S.complaints = S.complaints.filter((c) => !c.done);
  };

  // ---------------------------------------------------------------- conversas do atendimento
  function nurseTalk(sc) {
    const n = sc.amb.who; const v = sc.victim; const w = () => witness(sc); const nm = v.real ? v.name.split(' ')[0] : null;
    if (sc.kind === 'sangrando') {
      line(sc, 0.5, n, 'Sou da equipe de resgate. Onde está doendo? Consegue me dizer seu nome?');
      line(sc, 3.2, v, nm ? `Meu nome é ${nm}... dói a cabeça e o braço, tá sangrando muito.` : 'Dói muito a cabeça... e o braço. Tá sangrando.', 'triste');
      line(sc, 3.2, n, 'Vou estancar o sangramento. Como foi que aconteceu?');
      line(sc, 3.2, v, 'Alguém veio correndo e me jogou no chão! Nem pediu desculpa!', 'irritado');
      line(sc, 3.2, n, 'Fica calm{o|a}. Vamos te levar para o hospital.');
    } else if (sc.kind === 'inconsciente') {
      line(sc, 0.5, n, 'Senhor{|a}? Está me ouvindo? Aperta minha mão!');
      line(sc, 3, () => { const x = w(); if (x) say(x, gz('{Ele|Ela} caiu e bateu a cabeça. Não acordou mais.', sc.g), 'triste'); });
      line(sc, 3.2, n, 'Está respirando, pulso fraco. Prancha e colar cervical, vamos levar.');
      line(sc, 3.2, n, 'Alguém viu como aconteceu?');
      line(sc, 3, () => { const x = w(); if (x) say(x, gz('Uma pessoa veio correndo e derrubou {ele|ela}!', sc.g), 'irritado'); });
    } else {
      line(sc, 0.5, n, 'Sem pulso... sem respiração. Iniciando reanimação!');
      line(sc, 3.2, () => { const x = w(); if (x) say(x, 'Meu Deus... foi tudo muito rápido.', 'triste'); });
      line(sc, 4, n, sc.kind === 'assassinato' ? 'Ferimento por arma de fogo. Infelizmente não resistiu.' : 'Infelizmente não resistiu. Vou registrar o horário do óbito.', 'triste');
    }
    line(sc, 0.1, () => { sc.amb.talked = true; });
  }
  function policeTalk(sc) {
    const o = sc.pol.who; const v = sc.victim; const w = () => witness(sc); const m = meXY();
    const near = Math.hypot(m.x - sc.at[0], m.y - sc.at[1]) < 520; const look = looksOf(me.spr);
    line(sc, 0.5, o, 'Polícia. O que aconteceu aqui? Quem viu?');
    if (sc.kind === 'assassinato') {
      line(sc, 3, () => { const x = w(); if (x) say(x, 'Um homem veio andando, atirou e saiu correndo pra lá!', 'surpresa'); });
      line(sc, 3.2, o, 'Isolem a área. Vamos abrir investigação e procurar o suspeito.');
      line(sc, 0.1, () => { sc.pol.talked = true; sc.pol.talkedAt = sc.t; });
      return;
    }
    const acc = near ? `Foi ${look}! Tá bem ali!` : `Foi ${look}! Saiu correndo pra lá!`;
    if (sc.kind === 'sangrando') line(sc, 3, v, acc, 'irritado'); else line(sc, 3, () => { const x = w(); if (x) say(x, acc, 'irritado'); });
    line(sc, 3, () => { const x = sc.crowd.find((q) => q.state === 'roda' && q !== w()); if (x) say(x, 'É verdade, eu também vi!', 'irritado'); });
    line(sc, 3, o, 'Entendido. Vamos abrir uma investigação.');
    line(sc, 2.6, () => {
      sc.pol.talked = true; sc.pol.talkedAt = sc.t;
      const g = genderOf(me.spr); if (near) say(o, gz('Você aí! Parad{o|a}! Está pres{o|a}!', g), 'irritado', 3);
      post('acusacao', { resultado: sc.kind, personaId: sc.victim.real ? sc.victim.id : null, local: sc.place, testemunhas: sc.crowd.length }).then((x) => {
        if (!x) return;
        notify('🚨 Você foi acusad' + (genderOf(me.spr) === 'f' ? 'a' : 'o'), `Testemunhas apontaram você. ${x.dias} dia(s) de prisão ou fiança de ${x.fianca} NXC.`, 'error');
        INC.startChase(2, 'Acusação de testemunhas', meXY(), (res) => { if (res === 'preso') ui.arrest?.({ ...x, motivo: sc.kind === 'morte' ? 'Homicídio culposo' : sc.kind === 'sangrando' ? 'Lesão corporal grave' : 'Lesão corporal' }); else notify('Você despistou a polícia', 'O inquérito continua aberto na Delegacia.', 'warning'); });
      });
    });
  }
  S.active = () => S.scenes.length > 0;
  return S;
}
