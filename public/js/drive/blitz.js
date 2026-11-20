// BLITZ — fiscalização policial em pontos e horários sorteados (Aurora e Rodovia Aurora).
// A cada dia da cidade, alguns pontos de blitz são sorteados com uma janela de horário. Na blitz: viatura parada no
// acostamento com giroflex, cones na pista e dois policiais. Quando o jogador passa dirigindo, o policial manda parar;
// se ele para, o policial vem até a janela e pede a habilitação (três respostas, decididas pelo servidor). Se não
// para e vai embora, é fuga: multa e perseguição. Sem DOM: dá para testar em Node.
const WINDOW_H = 2.5; // horas de jogo que cada blitz fica montada
const PER_DAY = 3; // blitzes por dia (pontos sorteados)
const SIGNAL_R = 120; // distância em que o policial manda parar
const STOP_R = 150; // parou até essa distância: abordagem
const FLEE_R = 260; // passou do ponto e se afastou disso sem parar: fuga

// sorteio determinístico por dia (todos os jogadores da mesma cidade veem a mesma agenda)
function rngOf(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function schedule(spots, day) {
  const R = rngOf(9973 * (day + 1)); const pool = spots.slice(); const out = []; const n = Math.min(PER_DAY, pool.length);
  for (let k = 0; k < n; k++) {
    const s = pool.splice(Math.floor(R() * pool.length), 1)[0];
    const from = 6 + Math.floor(R() * 15) + (R() < 0.5 ? 0.5 : 0); // entre 6h e 21h30
    out.push({ ...s, from, to: from + WINDOW_H });
  }
  return out.sort((a, b) => a.from - b.from);
}
export const activeAt = (list, hour) => list.filter((b) => hour >= b.from && hour < b.to);

// estado da abordagem do jogador numa blitz
export function createBlitz({ spots, notify = () => {}, onStop = () => {}, onFlee = () => {}, now = () => performance.now() }) {
  const S = { day: -1, list: [], active: [], stage: null, cool: new Map() };
  S.update = (day, hour) => {
    if (day !== S.day) { S.day = day; S.list = schedule(spots, day); }
    const act = activeAt(S.list, hour);
    for (const b of S.active) if (!act.some((x) => x.id === b.id)) b.off = true;
    S.active = act; return act;
  };
  // veículo do jogador passando: manda parar → espera parar → abordagem (o diálogo é aberto por onStop)
  S.step = (car) => {
    if (!car) { if (S.stage && S.stage.phase === 'sinal') S.stage = null; return S.stage; }
    const kmh = Math.abs(car.v) * 0.72;
    if (!S.stage) {
      for (const b of S.active) {
        if ((S.cool.get(b.id) || 0) > now()) continue;
        const d = Math.hypot(car.x - b.at[0], car.y - b.at[1]);
        if (d < SIGNAL_R) { S.stage = { blitz: b, phase: 'sinal', t: 0, minD: d }; notify('🚓 Blitz policial', 'O policial mandou você encostar. Pare o carro.', 'warning'); break; }
      }
      return S.stage;
    }
    const st = S.stage; const b = st.blitz; const d = Math.hypot(car.x - b.at[0], car.y - b.at[1]); st.t += 1; st.minD = Math.min(st.minD, d);
    if (st.phase === 'sinal') {
      if (kmh < 4 && d < STOP_R) { st.phase = 'abordagem'; onStop(b, car); }
      else if (d > FLEE_R && d > st.minD + 60) { st.phase = 'fuga'; S.cool.set(b.id, now() + 120000); S.stage = null; onFlee(b, car); }
    }
    return S.stage;
  };
  // fim da abordagem (liberado ou preso): a blitz não para o mesmo jogador de novo por 2 min
  S.finish = () => { if (S.stage) S.cool.set(S.stage.blitz.id, now() + 120000); S.stage = null; };
  return S;
}
