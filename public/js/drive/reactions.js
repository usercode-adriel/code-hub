// Reações do corpo — todos os personagens (moradores, passantes, motoristas, policiais e o jogador) fazem exatamente
// os movimentos da folha de referência tools/drive/src/personagens/reacoes.webp: atropelado, baleado, caído (normal),
// ferido (grave), morto (deitado, sentado e de pé), com sangramento, reação de dor e quase morte.
// Os quadros desenhados da folha são pintados com as cores de cada personagem (tools/drive/chars2.py → <chave>-rx.png,
// uma linha por sequência). Aqui fica só o tempo de cada quadro. Sem DOM: dá para testar em Node.
import { RX } from './chrmeta.js';

// duração de cada quadro (s); o último fica parado (deitado, de joelhos…)
export const TIMING = {
  atropelado: [0.1, 0.12, 0.14, 0.14, 0.2, 0], // de pé → impacto (braços para cima) → arremessado girando → cai → deitado com sangue
  baleado: [0.12, 0.25, 0.25, 0.25, 0.28, 0.35, 0], // tranco → mão no ferimento → joelhos → cai → poça
  caido: [0.14, 0.16, 0.16, 0.16, 0.2, 0], // tropeça → apoia → de quatro → deita
  ferido: [0.22, 0.28, 0.28, 0.3, 0.3, 0.35, 0], // mão na barriga → curva → joelhos → deita sangrando
  morto: [0.5, 0.5, 0.5, 0], // deitado, imóvel, sangue
  'morto-sentado': [0.4, 0.4, 0.45, 0], // sentado → tomba para a frente
  'morto-de-pe': [0.35, 0.35, 0.35, 0.4, 0], // ferido de pé → cabeça cai
  sangramento: [0.45, 0.45, 0.45, 0.45, 0.5, 0], // sangrando de pé → curva → joelhos → deita
  dor: [0.25, 0.3, 0.3, 0.3, 0], // mão na cabeça → curva → agachado
  'quase-morte': [0.25, 0.35, 0.35, 0.4, 0.4, 0.45, 0], // ferido → joelhos → rastejando → deitado
};
export const REACTIONS = Object.keys(TIMING);
// a partir de qual quadro a pessoa já está no chão (deitada)
const DOWN = { atropelado: 4, baleado: 5, caido: 4, ferido: 5, morto: 0, sangramento: 5, 'quase-morte': 5 };

// quadro da reação no instante t (s); 'levantando' é o caído de trás para a frente
export function frameAt(kind, t) {
  const back = kind === 'levantando'; const k = back ? 'caido' : kind; const T = TIMING[k]; if (!T) return { kind: k, i: 0, done: true };
  let acc = 0; let i = T.length - 1;
  for (let j = 0; j < T.length - 1; j++) { acc += T[j]; if (t < acc) { i = j; break; } }
  return { kind: k, i: back ? T.length - 1 - i : i, done: t >= acc };
}
export const lying = (kind, t) => { const f = frameAt(kind, t); return DOWN[f.kind] != null && f.i >= DOWN[f.kind]; };
export const rxCell = (kind, i) => ({ sx: i * RX.cell[0], sy: RX.seq[kind].row * RX.cell[1], w: RX.cell[0], h: RX.cell[1] });

// desenha o quadro da reação com os pés em (x, y); H = altura do personagem em pé; face -1 espelha (cai para a esquerda)
export function drawReaction(ctx, img, kind, t, x, y, H, face = 1) {
  if (!img) return false;
  const f = frameAt(kind, t); const c = rxCell(f.kind, f.i); const k = H / (RX.cell[1] - 3);
  const w = c.w * k; const h = c.h * k;
  // atropelado: o corpo é jogado para o lado do impacto enquanto voa
  const dx = f.kind === 'atropelado' ? face * 10 * Math.min(1, t / 0.6) : 0;
  ctx.save(); ctx.translate(x + dx, y); if (face < 0) ctx.scale(-1, 1);
  ctx.drawImage(img, c.sx, c.sy, c.w, c.h, -w / 2, -h + k, w, h);
  ctx.restore();
  return true;
}
