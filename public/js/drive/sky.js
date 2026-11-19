// Tráfego aéreo da cidade em horários marcados (relógio da cidade: 1 dia = 40 min): pousos e decolagens no
// Aeroporto Nexus, sobrevoos, helicóptero da polícia patrulhando e a esquadrilha de jatos com fumaça. Cada voo é
// um roteiro (pontos com altitude e velocidade) seguido suavemente; a aeronave que pousa estaciona no pátio e
// fica lá até a decolagem seguinte. Só desenho e movimento: não interfere na física do jogador.
export const SCHEDULE = [
  { at: 6.5, kind: 'chegada', spr: 'av-airliner', L: 96, label: 'Voo NX 101 pousando' },
  { at: 8, kind: 'partida', spr: 'av-airliner', L: 96, label: 'Voo NX 102 decolando' },
  { at: 9.25, kind: 'patrulha', spr: 'av-heli-policia', L: 48, heli: true, label: 'Helicóptero da polícia em patrulha' },
  { at: 10.5, kind: 'sobrevoo', spr: 'av-biplano', L: 40, label: 'Biplano de passeio sobre a orla' },
  { at: 12, kind: 'chegada', spr: 'av-executivo', L: 60, label: 'Jato executivo pousando' },
  { at: 14, kind: 'esquadrilha', spr: 'av-jato-vermelho', L: 46, label: 'Esquadrilha de jatos sobre a cidade' },
  { at: 15.5, kind: 'partida', spr: 'av-executivo', L: 60, label: 'Jato executivo decolando' },
  { at: 16.75, kind: 'sobrevoo', spr: 'av-heli-resgate', L: 46, heli: true, label: 'Helicóptero de resgate a caminho do hospital' },
  { at: 17.5, kind: 'chegada', spr: 'av-airliner', L: 96, label: 'Voo NX 207 pousando' },
  { at: 19, kind: 'sobrevoo', spr: 'av-mono-azul', L: 42, label: 'Monomotor sobrevoando a cidade' },
  { at: 20.5, kind: 'partida', spr: 'av-airliner', L: 96, label: 'Voo NX 208 decolando' },
  { at: 21.5, kind: 'patrulha', spr: 'av-heli-policia', L: 48, heli: true, label: 'Helicóptero da polícia em patrulha noturna' },
  { at: 23, kind: 'sobrevoo', spr: 'av-caca-cinza', L: 54, label: 'Jato supersônico cruzando o céu' },
];
// pista: x 2880..4040, eixo y 428; pátio y ~870
const RW = { x0: 2880, x1: 4040, y: 428 }; const PARK = [3640, 870];

function route(kind, b, R) {
  const cx = 2000; const cy = 1400;
  if (kind === 'chegada') return [[RW.x1 + 3200, RW.y - 260, 300, 190], [RW.x1 + 900, RW.y, 120, 165], [RW.x1 - 40, RW.y, 0, 150], [RW.x0 + 380, RW.y, 0, 34], [RW.x0 + 300, RW.y + 30, 0, 26], [RW.x0 + 300, 640, 0, 26], [PARK[0], 660, 0, 26], [PARK[0], PARK[1], 0, 8]];
  if (kind === 'partida') return [[PARK[0], PARK[1], 0, 10], [PARK[0], 660, 0, 26], [RW.x0 + 60, 660, 0, 26], [RW.x0 + 60, RW.y, 0, 12], [RW.x0 + 640, RW.y, 0, 120], [RW.x1 - 120, RW.y, 0, 170], [RW.x1 + 900, RW.y - 200, 160, 200], [RW.x1 + 4000, RW.y - 1400, 340, 230]];
  const side = R() < 0.5;
  const from = side ? [b.x0 + 100, cy - 900 + R() * 1800] : [cx - 1600 + R() * 3200, b.y0 + 100];
  const to = side ? [b.x1 - 100, cy - 900 + R() * 1800] : [cx - 1600 + R() * 3200, b.y1 - 100];
  if (kind === 'patrulha') { const pts = [[from[0], from[1], 200, 120]]; for (let k = 0; k <= 16; k++) { const a = (k / 8) * Math.PI * 2; pts.push([cx + Math.cos(a) * 700, cy + Math.sin(a) * 450, 160, 90]); } pts.push([to[0], to[1], 220, 120]); return pts; }
  const h = kind === 'esquadrilha' ? 230 : 180 + R() * 120; const v = kind === 'esquadrilha' ? 260 : 150;
  return [[from[0], from[1], h, v], [cx + (R() - 0.5) * 800, cy + (R() - 0.5) * 600, h, v], [to[0], to[1], h, v]];
}

export function createSky(world) {
  const S = { flights: [], parked: [], lastHour: null, banner: null, seq: 0 };
  const R = Math.random;
  S.spawn = (sl) => {
    const pts = route(sl.kind, world.bounds || { x0: 0, y0: 0, x1: world.W, y1: world.H }, R);
    const mk = (dx, dy, lead = 0) => ({ id: `sky${S.seq++}`, kind: 'aviao', ai: true, sprite: sl.spr, L: sl.L, W: sl.L, heli: Boolean(sl.heli), pts: pts.map((p) => [p[0] + dx, p[1] + dy, p[2], p[3]]), i: 0, t: 0, x: pts[0][0] + dx, y: pts[0][1] + dy, h: pts[0][2], v: pts[0][3], a: 0, ground: pts[0][2] <= 0, smoke: sl.kind === 'esquadrilha', lead, health: 100 });
    if (sl.kind === 'partida') { const i = S.parked.findIndex((p) => p.sprite === sl.spr); if (i >= 0) S.parked.splice(i, 1); }
    if (sl.kind === 'esquadrilha') { S.flights.push(mk(0, 0), mk(-60, -50, 1), mk(-60, 50, 1)); } else S.flights.push(mk(0, 0));
    S.banner = { text: sl.label, until: performance.now() + 9000 };
  };
  // aviões parados no pátio quando o mapa abre (alguns já "chegaram")
  S.parked.push({ kind: 'aviao', ai: true, sprite: 'av-airliner', L: 96, W: 96, x: PARK[0] + 150, y: PARK[1] + 130, a: -Math.PI / 2, h: 0, ground: true, health: 100 });
  S.parked.push({ kind: 'aviao', ai: true, sprite: 'av-executivo', L: 60, W: 60, x: 3240, y: 870, a: -Math.PI / 2, h: 0, ground: true, health: 100 });
  S.parked.push({ kind: 'aviao', ai: true, sprite: 'av-jato-vermelho', L: 46, W: 46, x: 3420, y: 870, a: -Math.PI / 2, h: 0, ground: true, health: 100 });
  S.parked.push({ kind: 'aviao', ai: true, sprite: 'av-heli-policia', L: 48, W: 48, x: 2960, y: 870, a: -Math.PI / 2, h: 0, ground: true, heli: true, health: 100 });

  S.step = (dt, hour) => {
    // horários: dispara quando o relógio da cidade passa por um horário marcado
    if (S.lastHour != null) {
      const crossed = (t) => (S.lastHour <= hour ? t > S.lastHour && t <= hour : t > S.lastHour || t <= hour);
      if (Math.abs(hour - S.lastHour) < 2 || hour < S.lastHour) for (const sl of SCHEDULE) if (crossed(sl.at)) S.spawn(sl);
    }
    S.lastHour = hour;
    for (let k = S.flights.length - 1; k >= 0; k--) {
      const f = S.flights[k]; const b = f.pts[f.i + 1];
      if (!b) {
        S.flights.splice(k, 1);
        if (f.h <= 1 && !f.lead) S.parked.push({ ...f, pts: null, v: 0, ground: true, a: -Math.PI / 2 }); // chegou: estaciona
        continue;
      }
      const a = f.pts[f.i]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const vt = a[3] + (b[3] - a[3]) * f.t; f.v += (vt - f.v) * Math.min(1, dt * 1.5);
      f.t += (f.v * dt) / L;
      if (f.t >= 1) { f.i++; f.t = 0; continue; }
      const nx = a[0] + (b[0] - a[0]) * f.t; const ny = a[1] + (b[1] - a[1]) * f.t;
      const want = Math.atan2(ny - f.y, nx - f.x); if (Math.hypot(nx - f.x, ny - f.y) > 0.01) { let d = want - f.a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; f.a += d * Math.min(1, dt * (f.heli ? 3 : 4)); }
      f.x = nx; f.y = ny; f.h = a[2] + (b[2] - a[2]) * f.t; f.ground = f.h <= 0.5;
    }
  };
  S.next = (hour) => { const s = SCHEDULE.map((x) => [((x.at - hour + 24) % 24), x]).sort((p, q) => p[0] - q[0])[0]; return s?.[1]; };
  return S;
}
