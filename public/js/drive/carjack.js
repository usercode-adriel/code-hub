// ROUBO DE VEÍCULOS E NÍVEL DE PROCURADO — inspirado em GTA, ligado à IA de trânsito, à polícia e aos crimes.
//  • Jogador: perto de qualquer carro da cidade (andando devagar ou parado), a interação (E) faz o carro parar, o
//    jogador vai até a porta do motorista, o motorista reage (mãos para cima, fala com medo), sai correndo e só então
//    o jogador entra e assume o volante (o carro sai do trânsito e vira um veículo do jogador, sem dono no servidor).
//  • Denúncia: segundos depois o motorista (e testemunhas por perto) liga para a polícia com modelo, cor, aparência e
//    direção de fuga → ocorrência no servidor e procurado nível 1. A polícia vai até o local.
//  • Procurado: 1★ denúncia; 2★ uma viatura viu o jogador e começa a perseguir; 3★ fuga longa: reforço e bloqueio
//    policial (viaturas atravessadas na via à frente); 4★ operação intensa: mais reforço e outro bloqueio. Despistar a
//    polícia derruba o nível aos poucos. Prisão SÓ quando a polícia alcança: abordagem, mensagem e pena (1 dia ou fiança).
//  • Moradores também roubam (raro, perfil criminoso): o ladrão tira o motorista do carro, foge dirigindo de forma
//    imprudente; o dono chama a polícia, que persegue; o ladrão é preso ou abandona o carro e foge a pé.
import { nearestLane, along } from './world.js';
import { lengthOf, spriteOf } from './traffic.js';
import { CITY } from './cityevents.js';

export const WANTED = { seen: 230, lvl3: 45, lvl4: 100, forget: 60, npcEvery: [360, 600] }; // distâncias em unidades, tempos em s
export const FEAR = ['Pode levar! Não faz nada comigo!', 'Calma! Já estou saindo!', 'Meu carro! O que você está fazendo?', 'Ei! Sai de perto!', 'Socorro! Estão roubando meu carro!', 'Por favor, não me machuca!', 'Pode ficar com ele, só me deixa em paz!', 'Tá bom, tá bom! Leva!', 'Não atira! Eu saio!'];
const CALL = (d) => `Alô, polícia? Roubaram meu carro! ${d.modelo} ${d.cor}${d.direcao ? `, foi ${d.direcao}` : ''}!`;
const COR = { azul: 'azul', verde: 'verde', laranja: 'laranja', branco: 'branco', preto: 'preto', roxo: 'roxo', amarelo: 'amarelo', vermelho: 'vermelho', taxi: 'amarelo', policia: 'branco e azul', suv: 'prata', bege: 'bege' };
export function describeCar(c) {
  const sp = String(c.sprite || ''); const cor = Object.keys(COR).find((k) => sp.includes(k)); const k = c.kind;
  return { modelo: k === 'taxi' ? 'Táxi' : k === 'van' ? 'Van' : k === 'caminhao' || k === 'coleta' ? 'Caminhão' : k === 'policia' ? 'Viatura' : sp.includes('suv') ? 'SUV' : sp.includes('esportivo') ? 'Esportivo' : sp.includes('picape') ? 'Picape' : 'Carro', cor: COR[cor] || 'prata' };
}
const dirOf = (a) => { const d = ['para o leste', 'para o sul', 'para o oeste', 'para o norte']; return d[((Math.round(a / (Math.PI / 2)) % 4) + 4) % 4]; };

export function createCarjack(D) {
  const { T, P, INC, ACC, world, me, own, post = async () => null, notify = () => {}, ui = {}, regionAt = () => 'na rua', looks = () => '', chrFor = () => 'chr/barbudo', rand = Math.random, now = () => performance.now() } = D;
  const S = { jack: null, level: 0, reason: '', heat: 0, unseen: 0, chaseT: 0, extra: [], blocks: [], npc: null, npcT: WANTED.npcEvery[0] + rand() * (WANTED.npcEvery[1] - WANTED.npcEvery[0]), lastFear: [] };
  const say = (o, text, secs = 2.8) => { if (o) o.say = { text, emo: 'surpresa', until: now() + secs * 1000 }; };
  const actor = (spr, x, y, name) => { const a = { spr, x, y, a: Math.PI / 2, to: null, v: 10, face: null, say: null, name, t: 0, gone: false, onArrive: null }; ACC.S.actors.push(a); return a; };
  const door = (c, out = 7) => { const ca = Math.cos(c.a); const sa = Math.sin(c.a); const lx = c.L * 0.05; const ly = -(c.W / 2 + out); return [c.x + lx * ca - ly * sa, c.y + lx * sa + ly * ca]; };
  const fear = () => { const pool = FEAR.filter((f) => !S.lastFear.includes(f)); const f = pool[Math.floor(rand() * pool.length)]; S.lastFear.push(f); if (S.lastFear.length > 4) S.lastFear.shift(); return f; };
  const runAway = (a, from, secs = 5) => { const ang = Math.atan2(a.y - from[1], a.x - from[0]) + (rand() - 0.5) * 0.6; a.run = true; a.v = 26; a.to = [a.x + Math.cos(ang) * 26 * secs, a.y + Math.sin(ang) * 26 * secs]; a.onArrive = () => { a.gone = true; }; };

  // ---------------------------------------------------------------- jogador rouba um carro
  S.canJack = () => {
    if (S.jack || me.mode !== 'foot') return null;
    let best = null; let bd = 34;
    for (const c of T.cars) {
      if (c.siren || c.temp || c.towedBy || c.sceneHold || c.mode || c.wrecked > 0 || c.kind === 'policia' || c.thief) continue;
      const d = Math.hypot(c.x - me.x, c.y - me.y); if (d < bd && c.v < 30) { bd = d; best = c; }
    }
    return best;
  };
  S.tryJack = () => {
    const c = S.canJack(); if (!c) return false;
    c.sceneHold = true; c.v = 0; c.jacked = true; // o motorista freia
    S.jack = { car: c, phase: 'vai', t: 0, desc: describeCar(c), where: regionAt(c) };
    me.jacking = true; return true;
  };
  function stepJack(dt) {
    const J = S.jack; if (!J) return; J.t += dt; const c = J.car;
    if (J.phase === 'vai') { // jogador anda até a porta do motorista
      const [dx, dy] = door(c, 9); const d = Math.hypot(dx - me.x, dy - me.y); const st = 34 * dt;
      if (d > st) { me.x += ((dx - me.x) / d) * st; me.y += ((dy - me.y) / d) * st; me.a = Math.atan2(dy - me.y, dx - me.x); me.moving = true; me.walkT += st / 3.2; }
      else { me.moving = false; J.phase = 'sai'; J.t = 0; const [x, y] = door(c, 3); J.driver = actor(chrFor(c), x, y, 'Motorista'); J.driver.pose = 'maos'; J.driver.face = [me.x, me.y]; say(J.driver, fear(), 3); c.door = 1; }
      if (J.t > 6) { me.x = dx; me.y = dy; } // nunca fica preso no caminho
    } else if (J.phase === 'sai') { // motorista sai com as mãos para cima e corre
      if (J.t > 1.6 && !J.ran) { J.ran = true; J.driver.pose = null; runAway(J.driver, [me.x, me.y], 6); J.driver.onArrive = null; }
      if (J.ran && Math.hypot(J.driver.x - c.x, J.driver.y - c.y) > 14) { J.phase = 'entra'; enterStolen(J); }
    }
  }
  function enterStolen(J) {
    const c = J.car; const i = T.cars.indexOf(c); if (i >= 0) T.cars.splice(i, 1);
    c.lane?.to?.box?.delete(c);
    const o = { own: true, stolen: true, kind: 'carro', id: `roubo-${c.id}`, key: null, name: `${J.desc.modelo} ${J.desc.cor} (roubado)`, sprite: c.sprite, speed: 1, x: c.x, y: c.y, a: c.a, v: 0, steer: 0, gear: 'D', L: c.L, W: c.W, health: 100, door: 1, color: '#888' };
    own.push(o); me.jacking = false; S.jack = null;
    ui.enter?.(o); // entra (animação de entrada do mapa)
    // denúncia: o motorista liga para a polícia; quem viu também
    const drv = J.driver; const witnesses = P.peds.filter((p) => ['walk', 'olhando', 'wait'].includes(p.state) && Math.hypot(p.x - c.x, p.y - c.y) < 180);
    for (const p of witnesses.slice(0, 4)) { if (rand() < 0.4) { p.state = 'olhando'; p.look = 6; p.lookS = p.s; p.lookAt = [c.x, c.y]; p.say = { text: rand() < 0.5 ? 'Meu Deus, roubaram o carro dele!' : 'Alguém chama a polícia!', emo: 'surpresa', until: now() + 3000 }; } }
    setTimeout(() => {
      const d = { ...J.desc, direcao: dirOf(o.a) }; if (drv && !drv.gone) say(drv, CALL(d), 4.5);
      report(1, 'Roubo de veículo denunciado', { x: c.x, y: c.y, desc: d });
      post('roubo', { veiculo: d.modelo, cor: d.cor, local: J.where, testemunhas: 1 + witnesses.length, aparencia: looks(), direcao: d.direcao });
      CITY.emit('roubo', { x: c.x, y: c.y, suspeito: 'jogador', desc: d });
    }, 3500 + rand() * 2500);
  }

  // ---------------------------------------------------------------- nível de procurado
  function report(level, reason, at) {
    if (level > S.level) { S.level = level; S.reason = reason; CITY.emit('procurado', { nivel: level, motivo: reason }); }
    S.unseen = 0;
    if (level === 1 && at) { // a polícia vai até o local da denúncia
      const inc = INC.create('roubo', at.x, at.y, { units: [], noCrowd: true, scene: { active: true } });
      const u = INC.dispatch('policia', inc, { near: [300, 600] }); if (u) { u.release = false; u.patrol = true; S.extra.push(u); setTimeout(() => { u.release = true; inc.scene.active = false; }, 45000); }
      notify('🚨 Procurado ★☆☆☆', `${reason}. A polícia recebeu a descrição: ${at.desc.modelo} ${at.desc.cor}.`, 'warning');
    }
  }
  S.report = report;
  const meXY = () => me.car || me;
  function stepWanted(dt) {
    if (!S.level) return;
    const m = meXY(); const ch = INC.chase;
    // alguma viatura viu o jogador (sem perseguição ainda): começa a perseguir (2★)
    if (!ch.on && S.level >= 1) {
      const seen = T.cars.some((c) => c.kind === 'policia' && !c.wrecked && Math.hypot(c.x - m.x, c.y - m.y) < WANTED.seen);
      if (seen) {
        S.level = Math.max(S.level, 2); S.chaseT = 0; S.unseen = 0;
        notify('🚨 Procurado ★★☆☆', 'Uma viatura identificou você e iniciou a perseguição.', 'error');
        INC.startChase(2, S.reason || 'Procurado pela polícia', m, (res) => onChaseEnd(res));
      } else { S.unseen += dt; if (S.unseen > WANTED.forget) { notify('Você não é mais procurado(a)', 'A polícia perdeu o seu rastro.', 'success'); clearWanted(); } }
    }
    if (ch.on) {
      S.chaseT += dt; ch.level = Math.max(ch.level, S.level);
      if (S.level < 3 && S.chaseT > WANTED.lvl3) { S.level = 3; ch.level = 3; reinforce(1); roadblock(); notify('🚨 Procurado ★★★☆', 'Reforço policial e bloqueio na via à frente!', 'error'); }
      if (S.level < 4 && S.chaseT > WANTED.lvl4) { S.level = 4; ch.level = 4; reinforce(2); roadblock(); notify('🚨 Procurado ★★★★', 'Operação policial intensificada!', 'error'); }
      // reforços seguem o jogador pelas ruas (rota refeita a cada 1,5 s)
      for (const u of S.extra) { if (!u.pursuit || u.done) continue; u.replan = (u.replan || 0) - dt; if (u.replan <= 0) { u.replan = 1.5; const ln = nearestLane(world, m.x, m.y, (l) => !l.narrow); if (ln) { u.dest = ln.lane.from.id; u.route = []; u.target = Math.hypot(u.x - m.x, u.y - m.y) < 200 ? { lane: ln.lane, s: Math.max(4, ln.s - 30) } : null; } } }
    }
  }
  function reinforce(n) {
    const m = meXY();
    for (let k = 0; k < n; k++) {
      const inc = INC.create('perseguicao', m.x, m.y, { units: [], noCrowd: true, scene: { active: true } });
      const u = INC.dispatch('policia', inc, { near: [280, 520] }); if (u) { u.pursuit = true; u.release = false; u.maxV = 66; S.extra.push(u); }
    }
  }
  // bloqueio: duas viaturas atravessadas numa via à frente do jogador; a faixa fica fechada para o trânsito
  function roadblock() {
    const m = meXY(); const a = m.a || 0; const px = m.x + Math.cos(a) * 320; const py = m.y + Math.sin(a) * 320;
    const ln = nearestLane(world, px, py, (l) => !l.narrow && l.path.len > 60); if (!ln) return;
    const lanes = [ln.lane, ln.lane.rev, ln.lane.sib].filter(Boolean); const cars = [];
    for (const [i, L] of lanes.entries()) {
      const s = Math.max(10, Math.min(L.path.len - 10, L === ln.lane ? ln.s : L.path.len - ln.s)); const q = along(L.path, s);
      if (T.cars.some((o) => Math.hypot(o.x - q.x, o.y - q.y) < 26)) continue;
      const c = { id: `blq${Date.now()}${i}`, sprite: spriteOf('policia'), kind: 'policia', L: lengthOf('policia'), W: 12, x: q.x, y: q.y, a: q.a + Math.PI / 2, v: 0, mode: 'parked', hold: true, siren: true, beacon: false, temp: true, lane: L, s };
      T.cars.push(c); cars.push(c); CITY.close(L, 'bloqueio policial');
    }
    S.blocks.push({ cars, lanes, until: now() + 90000 });
  }
  function clearWanted() {
    S.level = 0; S.reason = ''; S.chaseT = 0; S.unseen = 0;
    for (const u of S.extra) { u.release = true; u.pursuit = false; }
    S.extra = [];
    for (const b of S.blocks) { for (const c of b.cars) c.done = true; for (const l of b.lanes) CITY.open(l); }
    S.blocks = [];
    CITY.emit('procurado', { nivel: 0 });
  }
  function onChaseEnd(res) {
    if (res === 'preso') { capture(); return; }
    // despistou: perde uma estrela por vez, até sumir (se nenhuma viatura vir de novo)
    S.level = Math.max(1, S.level - 1); S.unseen = 0;
    for (const u of S.extra) { u.pursuit = false; u.release = true; } S.extra = [];
    notify('Você despistou a polícia', `Ainda procurado(a) ${'★'.repeat(S.level)}. Fique longe das viaturas.`, 'warning');
  }
  // abordagem: o jogador sai do carro, o policial vem, anuncia a prisão e aplica a pena
  function capture() {
    const m = meXY(); ui.exitCar?.();
    const pol = INC.chase.car || T.cars.find((c) => c.kind === 'policia');
    const [x, y] = pol ? door(pol, 4) : [m.x + 20, m.y];
    const o = actor('chr/policial', x, y, 'Policial'); o.to = [me.x + 7, me.y + 2];
    o.onArrive = () => { o.face = [me.x, me.y]; say(o, 'Mãos na cabeça! Você está preso por roubo de veículo.', 3.5); setTimeout(() => { o.gone = true; }, 6000); };
    notify('🚔 Você foi capturado(a)', 'A polícia alcançou você. Abordagem em andamento.', 'error');
    setTimeout(() => { post('captura', { local: regionAt(me) }).then((x2) => { if (x2) ui.arrest?.({ ...x2, motivo: 'Roubo de veículo' }); }); clearWanted(); CITY.emit('prisao', { quem: 'jogador', motivo: 'roubo de veículo' }); }, 3200);
  }

  // ---------------------------------------------------------------- moradores também roubam (raro)
  function npcTheft(view) {
    if (S.npc || S.level) return false;
    const cars = T.cars.filter((c) => !c.siren && !c.temp && !c.mode && !c.sceneHold && c.v < 2 && !c.turn && c.kind !== 'policia' && Math.hypot(c.x - view.x, c.y - view.y) < view.r * 0.8);
    for (const c of cars) {
      const thief = P.peds.find((p) => !p.real && p.state === 'walk' && Math.hypot(p.x - c.x, p.y - c.y) < 90);
      if (!thief) continue;
      thief.state = 'cena'; const a = actor(thief.spr, thief.x, thief.y, 'Ladrão'); a.v = 22; a.run = true;
      const [dx, dy] = door(c, 9); a.to = [dx, dy];
      c.sceneHold = true; c.v = 0;
      S.npc = { car: c, thief, actor: a, phase: 'vai', t: 0, where: regionAt(c), desc: describeCar(c) };
      return true;
    }
    return false;
  }
  function stepNpc(dt, view) {
    S.npcT -= dt;
    if (S.npcT <= 0) { S.npcT = npcTheft(view) ? WANTED.npcEvery[0] + rand() * (WANTED.npcEvery[1] - WANTED.npcEvery[0]) : 40; }
    const N = S.npc; if (!N) return; N.t += dt; const c = N.car;
    if (N.phase === 'vai' && !N.actor.to) {
      N.phase = 'tira'; N.t = 0; const [x, y] = door(c, 3); N.owner = actor(chrFor(c), x, y, 'Motorista'); N.owner.pose = 'maos'; say(N.owner, fear(), 3); say(N.actor, 'Desce do carro! Agora!', 2.5);
    }
    if (N.phase === 'tira' && N.t > 1.8) {
      N.phase = 'foge'; N.t = 0; N.owner.pose = null; runAway(N.owner, [c.x, c.y], 3); N.owner.onArrive = () => { N.owner.to = null; };
      N.actor.gone = true; // o ladrão entra no carro
      Object.assign(c, { sceneHold: false, thief: true, prof: 'imprudente', maxV: 62 });
      const far = Object.values(world.nodes).filter((n) => n.out.length && Math.hypot(n.x - c.x, n.y - c.y) > 900); const dest = far[Math.floor(rand() * far.length)]; if (dest) { c.dest = dest.id; c.route = []; }
    }
    if (N.phase === 'foge') {
      if (N.t > 4 && !N.called) { N.called = true; say(N.owner, CALL({ ...N.desc, direcao: dirOf(c.a) }), 4.5); CITY.emit('roubo', { x: c.x, y: c.y, ladrao: 'morador', desc: N.desc });
        const inc = INC.create('roubo', c.x, c.y, { units: [], noCrowd: true, scene: { active: true } }); N.inc = inc;
        const u = INC.dispatch('policia', inc, { near: [250, 450] }); if (u) { u.release = false; u.maxV = 64; N.pol = u; } }
      const u = N.pol;
      if (u) { // viatura persegue o carro roubado pelas ruas
        u.replan = (u.replan || 0) - dt;
        if (u.replan <= 0 && !N.caught) { u.replan = 1.2; const L = c.turn ? c.turn.next : c.lane; if (L) { u.dest = L.from.id; u.route = []; u.target = u.lane === L ? { lane: L, s: Math.max(4, c.s - 30) } : null; } }
        if (!N.caught && Math.hypot(u.x - c.x, u.y - c.y) < 48) { N.caught = true; N.phase = 'preso'; N.t = 0; c.sceneHold = true; c.v = 0; u.target = null; u.hold = true; u.v = 0; }
      }
      if (!N.caught && N.t > 55) { // ladrão abandona o carro e foge a pé
        N.phase = 'abandona'; N.t = 0; c.sceneHold = true; c.v = 0; const [x, y] = door(c, 3); const a = actor(N.thief.spr, x, y, 'Ladrão'); runAway(a, [c.x, c.y], 8);
        if (u) { const [ox, oy] = door(u, 3); const o = actor('chr/policial', ox, oy, 'Policial'); o.to = [c.x + 10, c.y]; o.onArrive = () => { say(o, 'Ele fugiu a pé! Atenção, todas as viaturas!', 3); setTimeout(() => { o.gone = true; u.release = true; u.hold = false; }, 4000); }; }
        post('roubo-npc', { local: N.where, preso: false });
      }
    }
    if (N.phase === 'preso' && !N.cuffs && N.t > 1) { // abordagem: ladrão sai com as mãos para cima e vai na viatura
      N.cuffs = true; const u = N.pol; const [x, y] = door(c, 3); const a = actor(N.thief.spr, x, y, 'Ladrão'); a.pose = 'maos'; say(a, 'Tá bom, tá bom! Não atira!', 2.5);
      const [ox, oy] = door(u, 3); const o = actor('chr/policial', ox, oy, 'Policial'); o.to = [x + 8, y]; o.onArrive = () => { o.face = [a.x, a.y]; say(o, 'Encosta no carro! Você está preso.', 3); setTimeout(() => { a.pose = null; a.to = door(u, 3); a.onArrive = () => { a.gone = true; }; o.to = door(u, 3); o.onArrive = () => { o.gone = true; u.release = true; u.hold = false; }; }, 3500); };
      post('roubo-npc', { local: N.where, preso: true });
    }
    // fim: o carro recuperado volta ao trânsito; o ladrão (morador) volta a andar longe dali
    if ((N.phase === 'preso' && N.t > 20) || (N.phase === 'abandona' && N.t > 20) || N.t > 120) {
      Object.assign(c, { sceneHold: false, thief: false, prof: 'comum', dest: null, route: [] });
      if (N.inc) N.inc.scene.active = false; if (N.pol) { N.pol.release = true; N.pol.hold = false; }
      N.thief.state = 'walk'; N.thief.far = 99; if (N.owner) N.owner.gone = true; S.npc = null;
    }
  }

  // ---------------------------------------------------------------- passo
  S.step = (dt, view) => {
    stepJack(dt); stepWanted(dt); if (view) stepNpc(dt, view);
    for (const b of S.blocks) if (b.until < now() && !INC.chase.on) { for (const c of b.cars) c.done = true; for (const l of b.lanes) CITY.open(l); b.done = true; }
    S.blocks = S.blocks.filter((b) => !b.done);
    S.extra = S.extra.filter((u) => !u.done);
  };
  S.clear = clearWanted;
  return S;
}
