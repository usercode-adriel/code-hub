// ARMAS E PROJÉTEIS (fase 4) — a mesma mecânica para o jogador e para a polícia:
//  • MIRA AUTOMÁTICA: o disparo escolhe o alvo válido mais próximo que esteja ao alcance e com linha de visão livre
//    (sem parede, prédio ou objeto sólido entre os dois). Sem alvo, o tiro segue a direção em que a pessoa olha.
//  • PROJÉTIL: cada tiro é um corpo que anda no mapa (velocidade, alcance e vida próprios). Ele para na primeira
//    parede/objeto sólido, acerta a primeira pessoa ou carro no caminho e nunca atravessa paredes.
//  • Munição e recarga, cadência por arma, espalhamento (escopeta: vários projéteis).
// O módulo não sabe de gráficos nem de servidor: quem usa passa os alvos e recebe os eventos de acerto.
import { at, SOLID } from './world.js';

// alcance (unidades do mapa), velocidade (unid/s), dano, cadência (s entre tiros), pente, recarga (s)
export const ARMAS = {
  'w-pistol': { nome: 'Pistola', pente: 12, alcance: 190, vel: 340, dano: 30, cad: 0.32, recarga: 1.4 },
  'w-revolver': { nome: 'Revólver', pente: 6, alcance: 170, vel: 340, dano: 36, cad: 0.55, recarga: 2.0 },
  'w-uzi': { nome: 'Submetralhadora', pente: 30, alcance: 150, vel: 360, dano: 22, cad: 0.085, recarga: 1.8, espalha: 0.06 },
  'w-smg': { nome: 'SMG tática', pente: 30, alcance: 160, vel: 360, dano: 24, cad: 0.1, recarga: 1.9, espalha: 0.05 },
  'w-shotgun': { nome: 'Escopeta', pente: 6, alcance: 110, vel: 320, dano: 14, cad: 0.9, recarga: 2.4, pelotas: 5, espalha: 0.22 },
  'w-ak': { nome: 'Fuzil de assalto', pente: 30, alcance: 260, vel: 460, dano: 40, cad: 0.12, recarga: 2.2 },
  'w-m4': { nome: 'Fuzil tático', pente: 30, alcance: 250, vel: 460, dano: 40, cad: 0.11, recarga: 2.1 },
  'w-sniper': { nome: 'Rifle de precisão', pente: 5, alcance: 400, vel: 760, dano: 90, cad: 1.2, recarga: 2.6, espalha: 0.005 },
  'w-rifle-scope': { nome: 'Rifle com luneta', pente: 5, alcance: 360, vel: 700, dano: 80, cad: 1.0, recarga: 2.4, espalha: 0.01 },
};
const CAR_HALF = 7; const PED_R = 6;
export const COLISAO_RAIO = PED_R;

// linha de visão: amostra o trecho a cada 3 unidades; qualquer ponto sólido bloqueia
// o cano da arma fica fora de objetos encostados em quem atira: nos primeiros MUZZLE unidades não há bloqueio
export const MUZZLE = 6;
export function linhaLivre(world, x0, y0, x1, y1, bloqueado = (x, y) => at(world, x, y) === SOLID) {
  const L = Math.hypot(x1 - x0, y1 - y0); const n = Math.max(1, Math.ceil(L / 3));
  for (let k = 1; k < n; k++) { const d = (L * k) / n; if (d < MUZZLE) continue; const t = k / n; if (bloqueado(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return false; }
  return true;
}

// alvo automático: o mais próximo que pode ser atingido (alcance + linha de visão). `candidatos` = lista de {x,y,id,...}
export function alvoMaisProximo(world, origem, alcance, candidatos, bloqueado) {
  let best = null; let bd = Infinity;
  for (const c of candidatos) {
    const d = Math.hypot(c.x - origem.x, c.y - origem.y);
    if (d > alcance || d >= bd) continue;
    if (!linhaLivre(world, origem.x, origem.y, c.x, c.y, bloqueado)) continue;
    best = c; bd = d;
  }
  return best;
}

export function createWeapons({ world, rand = Math.random, bloqueado = null, now = () => performance.now() } = {}) {
  const S = { arma: null, desenhada: false, pente: 0, cad: 0, recarga: 0, flash: 0, tiros: [], ultimo: 0, mira: null };
  const bloq = bloqueado || ((x, y) => at(world, x, y) === SOLID);

  // sacar / guardar
  S.toggle = () => { if (!S.arma) return false; S.desenhada = !S.desenhada; return S.desenhada; };
  S.equipar = (key) => { const st = ARMAS[key]; if (!st) return false; S.arma = key; S.pente = st.pente; S.cad = 0; S.recarga = 0; return true; };
  S.recarregar = () => {
    const st = S.arma && ARMAS[S.arma]; if (!st || S.recarga > 0 || S.pente === st.pente) return false;
    S.recarga = st.recarga; return true;
  };
  S.munição = () => (S.arma ? { pente: S.pente, max: ARMAS[S.arma].pente, recarregando: S.recarga > 0 } : null);

  // dispara: origem (x,y), ângulo de fallback (quando não há alvo), candidatos a alvo (já filtrados pelo chamador)
  S.disparar = ({ dono, x, y, a, candidatos = [] }) => {
    const st = S.arma && ARMAS[S.arma];
    if (!st) return { ok: false, motivo: 'sem-arma' };
    if (S.recarga > 0) return { ok: false, motivo: 'recarregando' };
    if (S.cad > 0) return { ok: false, motivo: 'cadencia' };
    if (S.pente <= 0) return { ok: false, motivo: 'vazio' };
    const alvo = alvoMaisProximo(world, { x, y }, st.alcance, candidatos, bloq);
    const ang = alvo ? Math.atan2(alvo.y - y, alvo.x - x) : a;
    const n = st.pelotas || 1;
    for (let k = 0; k < n; k++) {
      const da = (rand() - 0.5) * 2 * (st.espalha || 0) + (n > 1 ? (k / (n - 1) - 0.5) * 0.25 : 0);
      const aa = ang + da;
      S.tiros.push({ dono, arma: S.arma, x, y, vx: Math.cos(aa) * st.vel, vy: Math.sin(aa) * st.vel, percorrido: 0, alcance: st.alcance, dano: st.dano / (n > 1 ? 2 : 1), alvo: alvo?.id ?? null, vida: 3 });
    }
    S.pente -= 1; S.cad = st.cad; S.flash = 0.08; S.ultimo = now();
    if (S.pente === 0) S.recarregar();
    return { ok: true, alvo: alvo ? alvo.id : null, tiros: n };
  };

  // tiro de viatura (polícia): mesma mira automática e mesmo projétil, mas com a própria cadência e erro de pontaria
  // (cada viatura guarda o seu `fogo`; não usa o pente nem a recarga do jogador)
  S.tiroDirecto = ({ dono, x, y, a, candidatos = [], alcance = 170, vel = 320, dano = 22, erro = 0.08, origem = null }) => {
    const alvo = alvoMaisProximo(world, { x, y }, alcance, candidatos, bloq);
    if (!alvo) return { ok: false, motivo: 'sem-alvo' };
    const aa = Math.atan2(alvo.y - y, alvo.x - x) + (rand() - 0.5) * 2 * erro;
    S.tiros.push({ dono, arma: 'policia', origem, x, y, vx: Math.cos(aa) * vel, vy: Math.sin(aa) * vel, percorrido: 0, alcance, dano, alvo: alvo.id ?? null, vida: 3 });
    return { ok: true, alvo: alvo.id };
  };

  // passo: anda os projéteis; acerto em pessoa/carro/parede é avisado por `on` (ped, carro, parede, tiro)
  S.passo = (dt, { pessoas = [], carros = [], alvos = [], on = {} } = {}) => {
    S.cad = Math.max(0, S.cad - dt); S.flash = Math.max(0, S.flash - dt);
    if (S.recarga > 0) { S.recarga -= dt; if (S.recarga <= 0) { S.recarga = 0; S.pente = ARMAS[S.arma]?.pente || 0; } }
    for (let i = S.tiros.length - 1; i >= 0; i--) {
      const t = S.tiros[i]; const L = Math.hypot(t.vx, t.vy) * dt; const steps = Math.max(1, Math.ceil(L / 2)); let removido = false;
      for (let s = 0; s < steps && !removido; s++) {
        t.x += t.vx * dt / steps; t.y += t.vy * dt / steps; t.percorrido += L / steps;
        if (t.percorrido > MUZZLE && bloq(t.x, t.y)) { on.parede?.(t); removido = true; break; }
        for (const p of pessoas) { if (p.id === t.dono || Math.abs(p.x - t.x) > PED_R || Math.abs(p.y - t.y) > PED_R) continue; if (Math.hypot(p.x - t.x, p.y - t.y) < PED_R) { on.pessoa?.(p, t); removido = true; break; } }
        if (removido) break;
        for (const c of carros) { if (c === t.origem) continue; if (ponteNoCarro(c, t)) { on.carro?.(c, t); removido = true; break; } } // o veículo de onde saiu o tiro não se acerta
        if (removido) break;
        for (const q of alvos) { if (q.id === t.dono) continue; if (Math.hypot(q.x - t.x, q.y - t.y) < PED_R + 1) { on.alvo?.(q, t); removido = true; break; } } // jogador (ou viatura) que não é o atirador
        if (removido) break;
      }
      if (!removido && t.percorrido >= t.alcance) removido = true;
      if (removido) S.tiros.splice(i, 1);
    }
  };
  return S;
}
// o ponto do tiro está dentro do retângulo orientado do carro (L×W)
export function ponteNoCarro(c, p) {
  const L = (c.L || 22) / 2; const W = (c.W || 12) / 2; const dx = p.x - c.x; const dy = p.y - c.y;
  const ca = Math.cos(c.a || 0); const sa = Math.sin(c.a || 0);
  const lx = dx * ca + dy * sa; const ly = -dx * sa + dy * ca;
  return Math.abs(lx) <= L && Math.abs(ly) <= W;
}
