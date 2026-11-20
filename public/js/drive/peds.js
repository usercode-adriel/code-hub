// PedestrianSystem — moradores reais (nome, profissão, rosto) e passantes andando só pelas calçadas.
// No cruzamento escolhem outra rua; para atravessar usam a faixa e esperam o sinal (ou a rua livre).
// Reagem ao que acontece: curiosos se juntam perto de acidentes; atropelados ficam caídos até a ambulância.
import { along, lightState, at, ROAD, canWalk } from './world.js';

// personagem por profissão (folhas animadas em public/assets/rpg/chr); quem não tem profissão marcada vira um
// morador comum variado. O gênero do morador, quando conhecido, escolhe a versão feminina ou masculina.
import { CHR } from './chrmeta.js';
// gênero e papel vêm dos metadados das folhas (tools/drive/chars2.py)
const FEM = new Set(Object.entries(CHR).filter(([, v]) => v.g === 'f').map(([k]) => k));
const BY = {}; for (const [k, v] of Object.entries(CHR)) (BY[v.role] ??= []).push(k);
const RULES = [
  [/polic|delegad|guarda|investigador|detetive|seguran/, 'policia'], [/m[ée]dic|enfermeir|param[ée]dic|farmac|dentist|fisioterap|veterin|psic[óo]log/, 'saude'], [/bombeir/, 'bombeiro'],
  [/pedreir|obra|eletricist|encanador|mec[âa]nic|constru|oper[áa]rio|engenheir|pintor|marceneir|carpinteir|serralheir/, 'obra'],
  [/entreg|motoboy|carteir|motorista|taxist|caminhoneir|courier/, 'entrega'],
  [/vendedor|comerci|caixa|lojist|gar[çc]|cozinh|chef|padeir|barista|atendente|feirant|a[çc]ougu|confeiteir|recepcionist/, 'comercio'],
  [/estudant|alun|estagi[áa]ri|universit/, 'estudante'], [/aposentad|idos/, 'idoso'],
  [/\bceo\b|dono|dona\b|s[óo]ci[oa]|fundador|governador|presidente|ministr|secret[áa]ri|editor|apresentador|influenc|execut|empres[áa]ri|gerent|diretor|advogad|banc[áa]ri|contador|economist|corretor|consultor|analist|programad|desenvolvedor|designer|jornalist|pol[íi]tic|prefeit|vereador|juiz|promotor|arquitet|professor|cientist|investidor/, 'executivo'],
];
// morador comum: roupas do dia a dia (sem uniforme nem roupa de praia)
const EVERYDAY = Object.entries(CHR).filter(([k, v]) => ['civil', 'estudante', 'crianca', 'idoso', 'executivo', 'comercio'].includes(v.role) && k !== 'chef').map(([k]) => k);
export const CHR_KEYS = Object.keys(CHR);
export function spriteFor(p, roles, seed) {
  const job = String(p.job || '').toLowerCase();
  const role = (RULES.find(([re]) => re.test(job)) || [])[1];
  // morador com profissão que não está na lista: adulto comum (criança só entre os passantes sem profissão)
  let pool = role && BY[role] ? BY[role] : job ? EVERYDAY.filter((k) => CHR[k].role !== 'crianca') : EVERYDAY;
  if (p.gender) { const g = pool.filter((k) => (p.gender === 'f') === FEM.has(k)); if (g.length) pool = g; }
  let h = 0; for (const ch of String(p.id || seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `chr/${pool[h % pool.length]}`;
}
// linha da folha pela direção do movimento: 0 frente (descendo), 1 direita, 2 costas (subindo), 3 esquerda
export const chrRow = (a) => { const dx = Math.cos(a); const dy = Math.sin(a); return Math.abs(dy) > Math.abs(dx) * 0.85 ? (dy > 0 ? 0 : 2) : dx > 0 ? 1 : 3; };

export function createPeds(world, people, roles) {
  const walks = [];
  // só calçadas de verdade: ao menos 92% do trajeto sobre calçada/faixa
  const ok = (w) => { let n = 0; let t = 0; for (let s = 0; s < w.len; s += 4) { const q = along(w, s); t++; if (canWalk(at(world, q.x, q.y))) n++; } return t && n / t >= 0.92; };
  for (const e of world.edges) e.walks.forEach((w, i) => { if (w && w.len > 20 && ok(w)) walks.push({ e, side: i, path: w }); else e.walks[i] = null; });
  const peds = people.map((p, i) => {
    const w = walks[Math.floor(Math.random() * walks.length)];
    const dir = Math.random() < 0.5 ? 1 : -1;
    return { id: p.id, name: p.name, real: Boolean(p.real), avatar: p.avatar, job: p.job, spr: p.spr || spriteFor(p, roles, i), walk: w, dir, s: Math.random() * w.path.len, v: 7 + Math.random() * 4, x: 0, y: 0, a: 0, face: 1, state: 'walk', cross: null, pause: 0, W: 5, L: 5, i, phase: Math.random() * 6 };
  });
  for (const p of peds) place(p);
  return { peds, walks };
}
// lat: desvio lateral (passar ao lado de quem vem de frente), sempre pela direita de quem anda
function place(p) { const q = along(p.walk.path, p.s); p.a = q.a + (p.dir < 0 ? Math.PI : 0); const la = p.lat || 0; p.x = q.x - Math.sin(p.a) * la; p.y = q.y + Math.cos(p.a) * la; p.face = Math.cos(p.a) < -0.2 ? -1 : Math.cos(p.a) > 0.2 ? 1 : p.face; }

// espalha passantes perto de um ponto (mantém a cidade viva onde o jogador está)
export function respawnNear(P, p, view) {
  for (let k = 0; k < 30; k++) {
    const w = P.walks[Math.floor(Math.random() * P.walks.length)];
    const s = Math.random() * w.path.len; const q = along(w.path, s);
    const d = Math.hypot(q.x - view.x, q.y - view.y);
    if (d < view.r * 0.8 || d > view.r + 700) continue;
    Object.assign(p, { walk: w, s, state: 'walk', cross: null, pause: 0, far: 0 }); place(p); return;
  }
}

function nextWalk(P, p, n) {
  const end = [p.x, p.y]; const cand = [];
  for (const e of n.edges) e.walks.forEach((w) => {
    if (!w || w.len < 20) return;
    const startAtN = e.a === n; const sPt = startAtN ? w.pts[0] : w.pts.at(-1);
    cand.push({ walk: P.walks.find((x) => x.path === w), dir: startAtN ? 1 : -1, pt: sPt, d: Math.hypot(sPt[0] - end[0], sPt[1] - end[1]), same: e === p.walk.e });
  });
  const others = cand.filter((c) => c.walk && !(c.same && c.walk === p.walk));
  if (!others.length) return null;
  others.sort((a, b) => a.d - b.d);
  const near = others.filter((c) => c.d < 44);
  return near.length && Math.random() < 0.72 ? near[Math.floor(Math.random() * near.length)] : others[Math.floor(Math.random() * others.length)];
}
function crossesRoad(world, a, b) { let n = 0; for (let k = 1; k < 8; k++) { const t = k / 8; if (at(world, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t) >= ROAD && at(world, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t) <= 4) n++; } return n >= 2; }

export function stepPeds(P, world, dt, t, cars, view) {
  const crossing = new Set();
  for (const p of P.peds) {
    if (p.state === 'ferido' || p.state === 'levado' || p.state === 'cena') continue;
    if (p.state === 'conversa') continue; // conversando: parado, virado para quem fala (talk.js controla)
    if (p.state === 'caido') { p.fall -= dt; if (p.fall <= 0) { p.state = 'walk'; p.say = { text: 'Olha por onde anda!', until: performance.now() + 2200 }; place(p); } continue; }
    if (p.state === 'roda' || p.state === 'volta') { // roda em volta de quem foi atropelado / voltando para a calçada
      const r = p.roda; const to = p.state === 'roda' ? r.to : r.back || r.to;
      if (p.state === 'volta' && !r.back) { r.back = [p.x, p.y]; const q = along(p.walk.path, p.s); r.back = [q.x, q.y]; }
      const dx = to[0] - p.x; const dy = to[1] - p.y; const d = Math.hypot(dx, dy); const st = p.v * (d > 40 ? 2.4 : 1.1) * dt; // longe: vem correndo
      if (d > st) { p.x += (dx / d) * st; p.y += (dy / d) * st; p.a = Math.atan2(dy, dx); p.rmove = true; }
      else { p.rmove = false; if (p.state === 'volta') { p.state = 'walk'; p.roda = null; place(p); } else p.a = Math.atan2(r.at[1] - p.y, r.at[0] - p.x); }
      if (p.state === 'roda' && !r.back) r.back = (() => { const q = along(p.walk.path, p.s); return [q.x, q.y]; })();
      continue;
    }
    if (p.state === 'olhando') { // curioso: anda até o ponto da calçada mais perto da ocorrência e fica olhando
      p.look -= dt;
      if (p.look <= 0) { p.state = 'walk'; continue; }
      const diff = p.lookS - p.s;
      if (Math.abs(diff) > 1) { p.s += Math.sign(diff) * Math.min(Math.abs(diff), p.v * 1.3 * dt); place(p); }
      p.face = p.lookAt[0] < p.x ? -1 : 1;
      continue;
    }
    if (p.state === 'jay') { // atravessando fora da faixa (sem olhar)
      const j = p.jay; const dx = j.to[0] - p.x; const dy = j.to[1] - p.y; const d = Math.hypot(dx, dy); const st = j.v * dt;
      if (d <= st) { p.state = 'walk'; p.jay = null; place(p); } else { p.x += (dx / d) * st; p.y += (dy / d) * st; p.a = Math.atan2(dy, dx); }
      continue;
    }
    if (p.pause > 0) { p.pause -= dt; continue; }
    if (p.state === 'wait' || p.state === 'cross') {
      const c = p.cross;
      if (p.state === 'wait') {
        let go;
        if (c.node.light) go = lightState(c.node, c.axis, t) === 'red' && lightState(c.node, c.axis, t + 2.5) === 'red';
        else go = !cars.some((k) => Math.hypot(k.x - c.mid[0], k.y - c.mid[1]) < 60 && k.v > 3);
        c.waited += dt;
        if (go || c.waited > 25) p.state = 'cross'; else continue;
      }
      if (c.road) crossing.add(c.node.id);
      const dx = c.to[0] - p.x; const dy = c.to[1] - p.y; const d = Math.hypot(dx, dy); const step = p.v * 1.25 * dt;
      if (d <= step) { p.walk = c.walk; p.dir = c.dir; p.s = c.dir > 0 ? 0 : c.walk.path.len; p.state = 'walk'; p.cross = null; place(p); }
      else { p.x += (dx / d) * step; p.y += (dy / d) * step; p.a = Math.atan2(dy, dx); p.face = dx < 0 ? -1 : 1; }
      continue;
    }
    p.s += p.v * dt * p.dir;
    const L = p.walk.path.len;
    if (p.s < 0 || p.s > L) {
      p.s = Math.max(0, Math.min(L, p.s)); place(p);
      const n = p.dir > 0 ? p.walk.e.b : p.walk.e.a;
      if (n.kind === 'exit') { p.dir = -p.dir; continue; }
      const nx = nextWalk(P, p, n);
      if (!nx) { p.dir = -p.dir; continue; }
      const to = nx.pt;
      if (crossesRoad(world, [p.x, p.y], to)) {
        const axis = Math.abs(to[0] - p.x) > Math.abs(to[1] - p.y) ? 'V' : 'H';
        p.cross = { node: n, axis, to, walk: nx.walk, dir: nx.dir, mid: [(p.x + to[0]) / 2, (p.y + to[1]) / 2], waited: 0, road: true };
        p.state = 'wait'; p.pause = 0.3 + Math.random();
      } else { p.cross = { node: n, axis: 'H', to, walk: nx.walk, dir: nx.dir, mid: to, waited: 0 }; p.state = 'cross'; }
      continue;
    }
    // desvio: perto do jogador, quem vem de frente passa pela direita; atrás de alguém mais lento, acompanha o passo
    if (view && Math.abs(p.x - view.x) < view.r && Math.abs(p.y - view.y) < view.r) {
      let want = 0;
      for (const o of P.peds) {
        if (o === p || o.state !== 'walk' || Math.abs(o.x - p.x) > 7 || Math.abs(o.y - p.y) > 7) continue;
        const d = Math.hypot(o.x - p.x, o.y - p.y); if (d > 6) continue;
        const ahead = (o.x - p.x) * Math.cos(p.a) + (o.y - p.y) * Math.sin(p.a);
        if (ahead <= 0) continue;
        if (o.walk === p.walk && o.dir === p.dir) { if (d < 4.5) p.s -= p.v * dt * p.dir * 0.8; } else want = 2.4;
      }
      p.latT = want ? want : Math.max(0, (p.latT || 0) - dt * 2);
      p.lat = (p.lat || 0) + ((p.latT || 0) - (p.lat || 0)) * Math.min(1, dt * 6);
    } else p.lat = 0;
    place(p);
    if (Math.random() < dt * 0.02) p.pause = 1 + Math.random() * 3;
    // passante longe da câmera reaparece perto (fora da tela). Moradores com nome também, mas só depois de 10 s
    // longe: assim eles circulam onde o jogador está e se encontram na rua (conversas)
    if (view) { p.far = Math.hypot(p.x - view.x, p.y - view.y) > view.r + 900 ? (p.far || 0) + dt : 0; if (p.far > (p.real ? 10 : 5)) respawnNear(P, p, view); }
  }
  return crossing;
}

// curiosos: quem está perto de uma ocorrência vai para o ponto mais próximo da própria calçada e fica olhando
export function gather(P, x, y, radius = 160, secs = 22) {
  let n = 0;
  for (const p of P.peds) {
    if (p.state !== 'walk' && p.state !== 'wait' && p.state !== 'cross' && p.state !== 'olhando') continue;
    if (Math.hypot(p.x - x, p.y - y) > radius) continue;
    let best = p.s; let bd = Infinity;
    for (let s = 0; s <= p.walk.path.len; s += 6) { const q = along(p.walk.path, s); const d = Math.hypot(q.x - x, q.y - y); if (d < bd) { bd = d; best = s; } }
    Object.assign(p, { state: 'olhando', look: secs + Math.random() * 8, lookS: Math.max(0, Math.min(p.walk.path.len, best + (Math.random() - 0.5) * 30)), lookAt: [x, y], cross: null });
    n++;
  }
  return n;
}
