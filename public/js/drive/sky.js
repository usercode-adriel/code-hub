// Tráfego aéreo da cidade em horários marcados (relógio da cidade: 1 dia = 40 min): pousos e decolagens no
// Aeroporto Nexus, sobrevoos, helicóptero da polícia patrulhando e a esquadrilha de jatos com fumaça. Cada voo é
// um roteiro (pontos com altitude e velocidade) seguido suavemente; a aeronave que pousa estaciona no pátio e
// fica lá até a decolagem seguinte. Só desenho e movimento: não interfere na física do jogador.
export const SCHEDULE = [
  { at: 6.5, kind: 'chegada', spr: 'av-airliner', L: 96, label: 'Voo NX 101 pousando' },
  { at: 8, kind: 'partida', spr: 'av-airliner', L: 96, label: 'Voo NX 102 decolando' },
  { at: 9.25, kind: 'patrulha', spr: 'av-heli-policia', L: 48, heli: true, label: 'Helicóptero da polícia em patrulha' },
  { at: 10.5, kind: 'sobrevoo', spr: 'av-mono-branco', L: 40, label: 'Monomotor de passeio sobre a orla' },
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
let RW = { x0: 2880, x1: 4040, y: 428 }; let PARK = [3640, 870]; let TAXI = 660; let VIRA = 3460; let CEN = [2000, 1400]; let VAGAS = [];
// o aeroporto vem do mapa (pista, taxiway, portão e vagas de avião); sem ele, valem os valores acima
function configurar(ap, vagas, centro) {
  if (!ap) return;
  const [rx, ry, rw, rh] = ap.runway; RW = { x0: rx, x1: rx + rw, y: ry + rh / 2 };
  TAXI = ap.taxi[1] + ap.taxi[3] / 2; VAGAS = vagas || [];
  PARK = VAGAS.length > 2 ? [VAGAS[2][0], VAGAS[2][1]] : [ap.apron[0] + ap.apron[2] / 2, ap.apron[1] + ap.apron[3] / 2];
  VIRA = PARK[0] - 180; if (centro) CEN = centro;
  const [gx, gy, gw, gh] = ap.gate; DOORS = [0, 1, 2].map((k) => [gx + gw + 20 + k * 40, gy + gh / 2]); STAIR = [PARK[0] - 16, PARK[1] + 22];
}

function route(kind, b, R) {
  const cx = CEN[0]; const cy = CEN[1];
  if (kind === 'chegada') return [[RW.x1 + 3200, RW.y - 260, 300, 190], [RW.x1 + 900, RW.y, 120, 165], [RW.x1 - 40, RW.y, 0, 150], [VIRA, RW.y, 0, 34], [VIRA, RW.y + 36, 0, 26], [VIRA, TAXI, 0, 26], [PARK[0], TAXI, 0, 26], [PARK[0], PARK[1], 0, 8]];
  if (kind === 'partida') return [[PARK[0], PARK[1], 0, 10], [PARK[0], TAXI, 0, 26], [RW.x0 + 60, TAXI, 0, 26], [RW.x0 + 60, RW.y, 0, 12], [RW.x0 + 640, RW.y, 0, 120], [RW.x1 - 120, RW.y, 0, 170], [RW.x1 + 900, RW.y - 200, 160, 200], [RW.x1 + 4000, RW.y - 1400, 340, 230]];
  const side = R() < 0.5;
  const from = side ? [b.x0 + 100, cy - 900 + R() * 1800] : [cx - 1600 + R() * 3200, b.y0 + 100];
  const to = side ? [b.x1 - 100, cy - 900 + R() * 1800] : [cx - 1600 + R() * 3200, b.y1 - 100];
  if (kind === 'patrulha') { const pts = [[from[0], from[1], 200, 120]]; for (let k = 0; k <= 16; k++) { const a = (k / 8) * Math.PI * 2; pts.push([cx + Math.cos(a) * 700, cy + Math.sin(a) * 450, 160, 90]); } pts.push([to[0], to[1], 220, 120]); return pts; }
  const h = kind === 'esquadrilha' ? 230 : 180 + R() * 120; const v = kind === 'esquadrilha' ? 260 : 150;
  return [[from[0], from[1], h, v], [cx + (R() - 0.5) * 800, cy + (R() - 0.5) * 600, h, v], [to[0], to[1], h, v]];
}

// portas do terminal (frente do prédio, no pátio) e a escada do avião estacionado
let DOORS = [[3060, 1118], [3150, 1118], [3240, 1118], [3330, 1118], [3420, 1118]];
let STAIR = [PARK[0] - 16, PARK[1] + 22];

// chrFor(pessoa) → sprite animado do passageiro (o mapa passa a mesma escolha dos pedestres)
export function createSky(world, { chrFor = () => null, airport = null, planeSpots = null, centro = null } = {}) {
  configurar(airport, planeSpots, centro);
  const S = { flights: [], parked: [], lastHour: null, banner: null, seq: 0, walkers: [], board: null, boarded: new Set() };
  // agenda do servidor (número do voo, cidade, passageiros) para o horário de um voo do mapa
  const infoOf = (at) => S.board?.flights.find((f) => !f.tomorrow && f.at === at) || null;
  const label = (sl) => { const f = infoOf(sl.at); if (!f) return sl.label; return f.kind === 'partida' ? `Voo ${f.num} decolando rumo a ${f.city}` : `Voo ${f.num} pousando, vindo de ${f.city}`; };
  // passageiro andando entre o terminal e o avião (some ao chegar)
  const walker = (p, from, to, i) => S.walkers.push({ name: p?.name || null, real: Boolean(p?.id), spr: chrFor(p || { id: `vis${S.seq++}` }), x: from[0] + (Math.random() - 0.5) * 8, y: from[1], to: [to[0] + (Math.random() - 0.5) * 6, to[1]], v: 8 + Math.random() * 3, a: 0, delay: i * (1.4 + Math.random()), phase: Math.random() * 6 });
  const R = Math.random;
  S.spawn = (sl) => {
    const pts = route(sl.kind, world.bounds || { x0: 0, y0: 0, x1: world.W, y1: world.H }, R);
    const mk = (dx, dy, lead = 0) => ({ slotAt: sl.at, id: `sky${S.seq++}`, kind: 'aviao', ai: true, sprite: sl.spr, L: sl.L, W: sl.L, heli: Boolean(sl.heli), pts: pts.map((p) => [p[0] + dx, p[1] + dy, p[2], p[3]]), i: 0, t: 0, x: pts[0][0] + dx, y: pts[0][1] + dy, h: pts[0][2], v: pts[0][3], a: 0, ground: pts[0][2] <= 0, smoke: sl.kind === 'esquadrilha', lead, health: 100 });
    if (sl.kind === 'partida') { const i = S.parked.findIndex((p) => p.sprite === sl.spr); if (i >= 0) S.parked.splice(i, 1); }
    if (sl.kind === 'esquadrilha') { S.flights.push(mk(0, 0), mk(-60, -50, 1), mk(-60, 50, 1)); } else S.flights.push(mk(0, 0));
    S.banner = { text: label(sl), until: performance.now() + 9000 };
  };
  // aviões parados no pátio quando o mapa abre (alguns já "chegaram")
  const vaga = (k, dx, dy) => (VAGAS[k] ? [VAGAS[k][0], VAGAS[k][1]] : [PARK[0] + dx, PARK[1] + dy]);
  S.parked.push({ kind: 'aviao', ai: true, sprite: 'av-airliner', L: 96, W: 96, x: vaga(4, 150, 0)[0], y: vaga(4, 150, 0)[1], a: -Math.PI / 2, h: 0, ground: true, health: 100 });
  S.parked.push({ kind: 'aviao', ai: true, sprite: 'av-executivo', L: 60, W: 60, x: vaga(0, -400, 0)[0], y: vaga(0, -400, 0)[1], a: -Math.PI / 2, h: 0, ground: true, health: 100 });
  S.parked.push({ kind: 'aviao', ai: true, sprite: 'av-jato-vermelho', L: 46, W: 46, x: vaga(1, -220, 0)[0], y: vaga(1, -220, 0)[1], a: -Math.PI / 2, h: 0, ground: true, health: 100 });
  S.parked.push({ kind: 'aviao', ai: true, sprite: 'av-heli-policia', L: 48, W: 48, x: vaga(5, 360, 0)[0], y: vaga(5, 360, 0)[1], a: -Math.PI / 2, h: 0, ground: true, heli: true, health: 100 });

  S.step = (dt, hour) => {
    // embarque: entre 27 e 5 minutos antes da partida, passageiros saem do terminal até a escada do avião
    for (const sl of SCHEDULE) {
      if (sl.kind !== 'partida') continue;
      const h = (sl.at - hour + 24) % 24;
      if (h > 0.45 || h < 0.08 || S.boarded.has(sl.at)) { if (h > 1) S.boarded.delete(sl.at); continue; }
      S.boarded.add(sl.at);
      if (!S.parked.some((p) => p.sprite === sl.spr && Math.hypot(p.x - PARK[0], p.y - PARK[1]) < 40)) S.parked.push({ kind: 'aviao', ai: true, sprite: sl.spr, L: sl.L, W: sl.L, x: PARK[0], y: PARK[1], a: -Math.PI / 2, h: 0, ground: true, health: 100 });
      const info = infoOf(sl.at); const pax = info?.pax || [];
      const n = Math.min(14, pax.length + 5 + Math.floor(Math.random() * 6));
      for (let i = 0; i < n; i++) walker(pax[i] || null, DOORS[i % DOORS.length], STAIR, i * 1.6);
      S.banner = { text: info ? `Embarque do voo ${info.num} para ${info.city} · ${info.gate}` : 'Embarque no pátio', until: performance.now() + 9000 };
    }
    for (let i = S.walkers.length - 1; i >= 0; i--) {
      const w = S.walkers[i]; if (w.delay > 0) { w.delay -= dt; continue; }
      const dx = w.to[0] - w.x; const dy = w.to[1] - w.y; const d = Math.hypot(dx, dy); const st = w.v * dt;
      if (d <= st) { S.walkers.splice(i, 1); continue; }
      w.x += (dx / d) * st; w.y += (dy / d) * st; w.a = Math.atan2(dy, dx); w.t = (w.t || 0) + st;
    }
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
        if (f.h <= 1 && !f.lead) {
          S.parked.push({ ...f, pts: null, v: 0, ground: true, a: -Math.PI / 2 }); // chegou: estaciona
          // desembarque: passageiros descem a escada e vão para o terminal
          const info = infoOf(f.slotAt); const pax = info?.pax || [];
          const n = Math.min(12, pax.length + 4 + Math.floor(Math.random() * 5));
          for (let i = 0; i < n; i++) walker(pax[i] || null, STAIR, DOORS[i % DOORS.length], i);
          S.banner = { text: info ? `Desembarque do voo ${info.num} (${info.city}) no ${info.gate}` : 'Desembarque no pátio', until: performance.now() + 8000 };
        }
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
