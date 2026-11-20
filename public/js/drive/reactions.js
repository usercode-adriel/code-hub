// Reações do corpo — cada personagem tem a própria folha desenhada (<chave>-rx.png, tools/drive/chars3.py) com as
// sequências da folha de referência: atropelado, baleado, caído, ferido grave, morto (deitado, sentado, de pé), com
// sangramento, reação de dor e quase morte. Aqui fica só o tempo: quanto dura cada sequência e em que quadro está.
// Poses derivadas: 'sentado' (primeiro quadro do morto sentado, parado: ferido sentado na calçada), 'inconsciente'
// (caído até o fim) e 'levantando' (caído de trás para a frente). Sem DOM: dá para testar em Node.
import { RX, CHR } from './chrmeta.js';

// duração total (s) de cada sequência até o último quadro (que fica parado)
export const DUR = { atropelado: 0.95, baleado: 1.5, caido: 0.9, ferido: 1.8, morto: 1.5, 'morto-sentado': 1.3, 'morto-de-pe': 1.6, sangramento: 2.4, dor: 1.2, 'quase-morte': 2.4 };
export const REACTIONS = [...RX.order];
const ALIAS = { inconsciente: 'caido', levantando: 'caido', sentado: 'morto-sentado' };
// a partir de qual fração da sequência a pessoa já está no chão
const DOWN = { atropelado: 0.6, baleado: 0.75, caido: 0.6, ferido: 0.75, morto: 0, sangramento: 0.8, 'quase-morte': 0.6 };

export const framesOf = (spr, kind) => CHR[String(spr).replace(/^chr\//, '')]?.rx?.[ALIAS[kind] || kind] || 1;
// quadro da reação no instante t (s), para um personagem com n quadros nessa sequência
export function frameAt(kind, t, n) {
  const k = ALIAS[kind] || kind; n = Math.max(1, n || 1);
  if (kind === 'sentado') return { kind: k, i: 0, done: true };
  const dur = DUR[k] || 1; const i = n === 1 ? 0 : Math.min(n - 1, Math.floor((Math.max(0, t) / dur) * (n - 1)));
  return { kind: k, i: kind === 'levantando' ? n - 1 - i : i, done: t >= dur };
}
export const lying = (kind, t, n) => { const k = ALIAS[kind] || kind; if (kind === 'levantando') return t < (DUR.caido * 0.4); if (DOWN[k] == null) return false; return frameAt(kind, t, n).i >= Math.ceil(DOWN[k] * (n - 1)); };
export const rxCell = (kind, i) => ({ sx: i * RX.cell[0], sy: RX.order.indexOf(ALIAS[kind] || kind) * RX.cell[1], w: RX.cell[0], h: RX.cell[1] });

// desenha a reação com os pés em (x, y); H = altura do personagem em pé (como na caminhada); face -1 espelha
export function drawReaction(ctx, img, spr, kind, t, x, y, H, face = 1) {
  if (!img) return false;
  const f = frameAt(kind, t, framesOf(spr, kind)); const c = rxCell(f.kind, f.i);
  const k = H / 48; const w = c.w * k; const h = c.h * k; // mesma escala da folha de caminhada (quadro de 48 px)
  const dx = f.kind === 'atropelado' && kind === 'atropelado' ? face * 10 * Math.min(1, t / 0.6) : 0; // arremessado para o lado do impacto
  ctx.save(); ctx.translate(x + dx, y); if (face < 0) ctx.scale(-1, 1);
  if (kind === 'sentado') { ctx.fillStyle = 'rgba(140,10,18,.75)'; ctx.beginPath(); ctx.ellipse(1, -0.3, 5.5 * k * 3, 1.8 * k * 3, 0, 0, Math.PI * 2); ctx.fill(); } // poça de sangue embaixo de quem está sentado
  ctx.drawImage(img, c.sx, c.sy, c.w, c.h, -w / 2, -(RX.base) * k, w, h);
  ctx.restore();
  return true;
}
