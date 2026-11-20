// Manifestações no mapa: a agenda vem do servidor (/mundo/manifestacoes). Quando uma está acontecendo perto do
// jogador, a multidão chega andando de várias direções, ocupa calçadas, praça e gramado em volta do lugar, levanta
// cartazes e grita palavras de ordem; no fim, todos se dispersam e somem.
import { at, WALK, PLAZA, LOT, GRASS, SAND } from './world.js';

const OK = new Set([WALK, PLAZA, LOT, GRASS, SAND]);
export function createProtests({ world, pois, chrFor, mobile = false }) {
  const S = { list: [], crowds: new Map(), banner: null };
  const poiOf = (id) => pois.find((p) => p.id === id)?.at;
  function build(pr) {
    const c = poiOf(pr.place); if (!c) return null;
    const n = Math.min(pr.size, mobile ? 24 : 40); const spots = [];
    for (let k = 0; k < 900 && spots.length < n; k++) {
      const a = Math.random() * Math.PI * 2; const r = 18 + Math.random() * 95; const x = c[0] + Math.cos(a) * r; const y = c[1] - 30 + Math.sin(a) * r * 0.7;
      if (!OK.has(at(world, x, y)) || spots.some((s) => Math.hypot(s[0] - x, s[1] - y) < 8)) continue;
      spots.push([x, y]);
    }
    const center = spots.length ? [spots.reduce((s, p) => s + p[0], 0) / spots.length, spots.reduce((s, p) => s + p[1], 0) / spots.length] : c;
    const members = spots.map(([x, y], i) => { const a = Math.random() * Math.PI * 2; const d = 160 + Math.random() * 120;
      return { spr: chrFor({ id: `${pr.id}m${i}` }), x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, to: [x, y], v: 10 + Math.random() * 4, a: 0, t: 0, sign: Math.random() < 0.6 ? pr.signs[i % pr.signs.length] : null, phase: Math.random() * 6, delay: Math.random() * 6, state: 'chega' }; });
    return { pr, center, members, lt: 2, leaving: false };
  }
  S.set = (data) => { S.list = data?.active || []; S.next = data?.next || []; };
  S.step = (dt, view, hour) => {
    for (const pr of S.list) {
      if (S.crowds.has(pr.id) || hour >= pr.end) continue;
      const c = poiOf(pr.place); if (!c || Math.hypot(c[0] - view.x, c[1] - view.y) > view.r + 1400) continue;
      const cr = build(pr); if (cr) { S.crowds.set(pr.id, cr); S.banner = { text: `📣 Manifestação na ${pr.placeName}: ${pr.theme}`, until: performance.now() + 9000 }; }
    }
    for (const [id, cr] of S.crowds) {
      const still = S.list.some((p) => p.id === id) && hour < cr.pr.end;
      if (!still && !cr.leaving) { cr.leaving = true; for (const m of cr.members) { const a = Math.atan2(m.y - cr.center[1], m.x - cr.center[0]) + (Math.random() - 0.5); m.to = [m.x + Math.cos(a) * 260, m.y + Math.sin(a) * 260]; m.state = 'sai'; m.delay = Math.random() * 4; } }
      let alive = 0;
      for (const m of cr.members) {
        if (m.state === 'foi') continue; alive++;
        if (m.delay > 0) { m.delay -= dt; continue; }
        if (m.to) {
          const dx = m.to[0] - m.x; const dy = m.to[1] - m.y; const d = Math.hypot(dx, dy); const st = m.v * dt;
          if (d <= st) { m.x = m.to[0]; m.y = m.to[1]; m.to = null; if (m.state === 'sai') m.state = 'foi'; else m.state = 'protesta'; }
          else { m.x += (dx / d) * st; m.y += (dy / d) * st; m.a = Math.atan2(dy, dx); m.t += st; }
        } else m.a = Math.atan2(cr.center[1] - m.y, cr.center[0] - m.x);
      }
      // palavras de ordem
      cr.lt -= dt;
      if (cr.lt <= 0 && !cr.leaving) { cr.lt = 2 + Math.random() * 2; const ms = cr.members.filter((m) => m.state === 'protesta'); const m = ms[Math.floor(Math.random() * ms.length)]; if (m) m.say = { text: Math.random() < 0.6 ? cr.pr.chant : `${m.sign || cr.pr.signs[0]}!`, until: performance.now() + 2200 }; }
      if (!alive) S.crowds.delete(id);
    }
  };
  S.members = function* () { for (const cr of S.crowds.values()) for (const m of cr.members) if (m.state !== 'foi' && !(m.delay > 0 && m.state === 'chega')) yield m; };
  return S;
}
