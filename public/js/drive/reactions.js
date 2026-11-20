// Reações do corpo (todos os personagens, moradores e jogador), seguindo as sequências da folha de referência
// tools/drive/src/personagens/reacoes.webp: atropelado, baleado, caído, ferido (grave), morto, sangramento, dor e quase
// morte. As folhas dos personagens só têm as vistas paradas e a caminhada, então cada reação é uma linha do tempo de
// poses aplicada sobre o quadro do próprio personagem: inclinação, joelhos (achatamento), arremesso, queda deitado
// e poça de sangue crescendo. Sem DOM: dá para testar em Node.
const lerp = (a, b, k) => a + (b - a) * Math.max(0, Math.min(1, k));
const ease = (k) => { const x = Math.max(0, Math.min(1, k)); return x * x * (3 - 2 * x); };
const LIE = Math.PI / 2; // deitado de lado

// cada fase: [duração em s, pose final]; a pose interpola da fase anterior para esta
// pose: { rot (rad, + = cai para a frente/direita), sy (altura: 1 em pé, ~0.6 de joelhos), dy (salto, unidades),
//         dx (deslocamento na direção do impacto), blood (0..1), flash (0..1 branco no impacto), shake }
const P0 = { rot: 0, sy: 1, dy: 0, dx: 0, blood: 0, flash: 0, shake: 0 };
export const SEQ = {
  // de pé → braços para cima no impacto → arremessado girando → bate no chão → deitado com sangue
  atropelado: [[0.1, { rot: -0.35, sy: 1, flash: 1 }], [0.25, { rot: -1.4, dy: 8, dx: 6 }], [0.25, { rot: LIE * 1.0 + 0.2, dy: 2, dx: 12 }], [0.15, { rot: LIE, dy: 0, dx: 14 }], [2.2, { rot: LIE, dx: 14, blood: 1 }]],
  // de pé → tranco para trás → mão no peito → joelhos → cai de bruços → sangue
  baleado: [[0.08, { rot: -0.25, flash: 0.8 }], [0.35, { rot: 0.15, sy: 0.96 }], [0.4, { rot: 0.3, sy: 0.7 }], [0.35, { rot: LIE, sy: 0.9, dx: 3 }], [2.5, { rot: LIE, dx: 3, blood: 1 }]],
  // tropeça → apoia nos joelhos → deita (sem sangue)
  caido: [[0.2, { rot: 0.3 }], [0.3, { rot: 0.25, sy: 0.72 }], [0.3, { rot: LIE, sy: 0.9, dx: 2 }], [99, { rot: LIE, dx: 2 }]],
  // levanta (o contrário de caído)
  levantando: [[0.01, { rot: LIE, dx: 2 }], [0.3, { rot: 0.25, sy: 0.72, dx: 1 }], [0.3, { rot: 0, sy: 1 }]],
  // mão na barriga → curva → joelhos → deita com sangue pequeno
  ferido: [[0.3, { rot: 0.18, sy: 0.95 }], [0.4, { rot: 0.3, sy: 0.7 }], [0.4, { rot: LIE, sy: 0.9, dx: 2 }], [3, { rot: LIE, dx: 2, blood: 0.6 }]],
  // já deitado, imóvel, poça grande
  morto: [[0.01, { rot: LIE, dx: 2, blood: 1 }], [99, { rot: LIE, dx: 2, blood: 1 }]],
  // de pé sangrando → curva → joelhos → cai
  sangramento: [[0.8, { rot: 0.1, blood: 0.3 }], [0.8, { rot: 0.35, sy: 0.9, blood: 0.45 }], [0.6, { rot: 0.3, sy: 0.65, blood: 0.6 }], [0.5, { rot: LIE, dx: 2, blood: 0.8 }], [3, { rot: LIE, dx: 2, blood: 1 }]],
  // mão na cabeça → curva → agachado, tremendo (volta a ficar de pé no fim, se a reação tiver duração)
  dor: [[0.25, { rot: -0.1, shake: 0.6 }], [0.3, { rot: 0.35, sy: 0.9, shake: 0.6 }], [0.4, { rot: 0.4, sy: 0.65, shake: 0.4 }], [99, { rot: 0.4, sy: 0.65, shake: 0.4 }]],
  // de joelhos → rastejando → deitado, com leves espasmos
  'quase-morte': [[0.3, { rot: 0.2, sy: 0.9, blood: 0.2 }], [0.5, { rot: 0.4, sy: 0.6, blood: 0.4 }], [0.7, { rot: 1.1, sy: 0.6, dx: 2, blood: 0.6 }], [0.6, { rot: LIE, dx: 3, blood: 0.8 }], [99, { rot: LIE, dx: 3, blood: 1, shake: 0.25 }]],
};
export const REACTIONS = Object.keys(SEQ);

// pose no instante t (s desde o começo da reação)
export function pose(kind, t) {
  const seq = SEQ[kind]; if (!seq) return { ...P0 };
  let prev = { ...P0 }; let acc = 0;
  for (const [dur, to] of seq) {
    const full = { ...prev, flash: 0, ...to };
    if (dur <= 0.02) { prev = full; acc += dur; continue; } // fase instantânea: a reação já começa nessa pose
    if (t <= acc + dur) {
      const k = ease((t - acc) / dur); const out = {};
      for (const key of Object.keys(P0)) out[key] = lerp(prev[key] ?? P0[key], full[key] ?? P0[key], k);
      if (kind === 'atropelado' && t > 0.1 && t < 0.6) out.dy = 8 * Math.sin(((t - 0.1) / 0.5) * Math.PI); // arco do arremesso
      return out;
    }
    acc += dur; prev = full;
  }
  return { ...prev, flash: 0 };
}
// já terminou de cair (deitado)
export const lying = (kind, t) => Math.abs(pose(kind, t).rot) > 1.3;

// desenha o personagem na pose: drawFrame(ctx) desenha o quadro com os pés em (0,0); face = +1/-1 lado da queda
export function drawPose(ctx, p, H, drawFrame, face = 1, now = 0) {
  const sh = p.shake ? Math.sin(now * 55) * p.shake : 0;
  // poça de sangue embaixo do corpo (cresce com a reação)
  if (p.blood > 0.02) {
    const cx = face * (p.rot > 1 ? H * 0.35 + p.dx : p.dx * 0.5);
    ctx.fillStyle = 'rgba(120,8,14,.78)'; ctx.beginPath(); ctx.ellipse(cx, 1, 2 + 7 * p.blood, 1 + 2.6 * p.blood, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(170,20,28,.65)'; ctx.beginPath(); ctx.ellipse(cx - face * 1.5, 0.5, 1 + 4 * p.blood, 0.6 + 1.4 * p.blood, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.save();
  ctx.translate(face * p.dx + sh, -p.dy);
  ctx.rotate(face * p.rot);
  ctx.scale(1, p.sy);
  drawFrame(ctx);
  if (p.flash > 0.05) { ctx.globalAlpha = p.flash * 0.6; ctx.globalCompositeOperation = 'lighter'; drawFrame(ctx); }
  ctx.restore();
}
