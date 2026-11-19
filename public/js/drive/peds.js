// PedestrianSystem — moradores reais da cidade (nome e rosto em pixel) andando pelas calçadas.
// Seguem a calçada de cada rua; no cruzamento escolhem outra rua e, quando precisam atravessar, usam a faixa:
// com semáforo esperam o vermelho dos carros; sem semáforo esperam não vir carro.
import { along, lightState, at, ROAD, canWalk } from './world.js';

export function createPeds(world, people) {
  const walks = [];
  // só calçadas de verdade: ao menos 92% do trajeto sobre calçada/faixa (descarta lados fora do mapa ou colados em prédios)
  const ok = (w) => { let n = 0; let t = 0; for (let s = 0; s < w.len; s += 3) { const q = along(w, s); t++; if (canWalk(at(world, q.x, q.y))) n++; } return t && n / t >= 0.92; };
  for (const e of world.edges) e.walks.forEach((w, i) => { if (w && w.len > 20 && ok(w)) walks.push({ e, side: i, path: w }); else e.walks[i] = null; });
  const peds = people.map((p, i) => {
    const w = walks[Math.floor(Math.random() * walks.length)];
    const dir = Math.random() < 0.5 ? 1 : -1;
    return { id: p.id, name: p.name, avatar: p.avatar, color: p.color || '#8b7bff', walk: w, dir, s: Math.random() * w.path.len, v: 7 + Math.random() * 4, x: 0, y: 0, a: 0, state: 'walk', cross: null, pause: 0, W: 5, L: 5, i };
  });
  for (const p of peds) place(p);
  return { peds, walks };
}
function place(p) { const q = along(p.walk.path, p.s); p.x = q.x; p.y = q.y; p.a = q.a + (p.dir < 0 ? Math.PI : 0); }

// a calçada termina no nó n: escolhe a próxima (outra rua) e, se for do outro lado, atravessa
function nextWalk(world, P, p, n) {
  const end = [p.x, p.y];
  const cand = [];
  for (const e of n.edges) e.walks.forEach((w, i) => {
    if (!w || w.len < 20) return;
    const startAtN = e.a === n; // a calçada começa no nó n?
    const sPt = startAtN ? w.pts[0] : w.pts.at(-1);
    cand.push({ walk: P.walks.find((x) => x.path === w), dir: startAtN ? 1 : -1, pt: sPt, d: Math.hypot(sPt[0] - end[0], sPt[1] - end[1]), same: e === p.walk.e });
  });
  const others = cand.filter((c) => c.walk && !(c.same && c.walk === p.walk));
  if (!others.length) return null;
  // na maioria das vezes segue pela mesma calçada (sem atravessar); às vezes atravessa
  others.sort((a, b) => a.d - b.d);
  const near = others.filter((c) => c.d < 40);
  return near.length && Math.random() < 0.72 ? near[Math.floor(Math.random() * near.length)] : others[Math.floor(Math.random() * others.length)];
}
function crossesRoad(world, a, b) {
  let n = 0;
  for (let k = 1; k < 8; k++) { const t = k / 8; if (at(world, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t) >= ROAD) n++; }
  return n >= 2;
}

export function stepPeds(P, world, dt, t, cars) {
  const crossing = new Set();
  for (const p of P.peds) {
    if (p.pause > 0) { p.pause -= dt; continue; }
    if (p.state === 'wait' || p.state === 'cross') {
      const c = p.cross;
      if (p.state === 'wait') {
        let go;
        if (c.node.light) go = lightState(c.node, c.axis, t) === 'red' && lightState(c.node, c.axis, t + 2.5) === 'red';
        else go = !cars.some((k) => Math.hypot(k.x - c.mid[0], k.y - c.mid[1]) < 55 && k.v > 3);
        c.waited += dt;
        if (go || c.waited > 25) p.state = 'cross';
        else continue;
      }
      if (c.road) crossing.add(c.node.id);
      const dx = c.to[0] - p.x; const dy = c.to[1] - p.y; const d = Math.hypot(dx, dy);
      const step = p.v * 1.25 * dt;
      if (d <= step) { p.walk = c.walk; p.dir = c.dir; p.s = c.dir > 0 ? 0 : c.walk.path.len; p.state = 'walk'; p.cross = null; place(p); }
      else { p.x += (dx / d) * step; p.y += (dy / d) * step; p.a = Math.atan2(dy, dx); }
      continue;
    }
    p.s += p.v * dt * p.dir;
    const L = p.walk.path.len;
    if (p.s < 0 || p.s > L) {
      p.s = Math.max(0, Math.min(L, p.s)); place(p);
      const n = p.dir > 0 ? p.walk.e.b : p.walk.e.a;
      if (n.kind === 'exit') { p.dir = -p.dir; continue; }
      const nx = nextWalk(world, P, p, n);
      if (!nx) { p.dir = -p.dir; continue; }
      const to = nx.pt;
      if (crossesRoad(world, [p.x, p.y], to)) {
        // atravessa a rua: andando na horizontal cruza uma rua vertical (eixo V), e vice-versa
        const axis = Math.abs(to[0] - p.x) > Math.abs(to[1] - p.y) ? 'V' : 'H';
        p.cross = { node: n, axis, to, walk: nx.walk, dir: nx.dir, mid: [(p.x + to[0]) / 2, (p.y + to[1]) / 2], waited: 0, road: true };
        p.state = 'wait'; p.pause = 0.3 + Math.random();
      } else { p.cross = { node: n, axis: 'H', to, walk: nx.walk, dir: nx.dir, mid: to, waited: 0 }; p.state = 'cross'; }
      continue;
    }
    place(p);
    if (Math.random() < dt * 0.02) p.pause = 1 + Math.random() * 3; // para de vez em quando (olha vitrine, celular...)
  }
  return crossing;
}
