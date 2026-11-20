// CELA — sala onde o jogador fica quando é preso (Delegacia de Aurora). Montada com as peças da folha do sistema
// prisional (public/assets/rpg/prisao): piso, parede com janela gradeada, cama, vaso, pia, câmera e a grade com a
// porta trancada; no corredor, um carcereiro faz a ronda. O jogador anda dentro da cela, mas não há saída: a porta
// só abre quando o tempo da detenção acaba (relógio do servidor).
const T = 40; // tamanho do ladrilho do piso
export const ROOM = { w: 10 * T, h: 6 * T, wall: 70, corr: 86 }; // área interna, parede de cima, corredor embaixo

// obstáculos dentro da cela (retângulos no espaço da sala: x, y, w, h)
export const SOLIDS = [
  { id: 'cama', x: 8, y: 6, w: 56, h: 92 },
  { id: 'vaso', x: ROOM.w - 54, y: 4, w: 40, h: 34 },
  { id: 'pia', x: ROOM.w - 110, y: 4, w: 40, h: 28 },
];
export const DOOR = { x: ROOM.w / 2 - 30, w: 60 };
const LIMIT = ROOM.h - 68; // até onde dá para chegar perto da grade (a grade fica na frente)

export function createCela() {
  const S = { x: ROOM.w / 2, y: ROOM.h * 0.6, a: Math.PI / 2, moving: false, walkT: 0, msg: '', msgUntil: 0, guard: { x: 40, dir: 1, t: 0 } };
  const free = (x, y) => x > 10 && x < ROOM.w - 10 && y > 26 && y < LIMIT && !SOLIDS.some((o) => x > o.x - 6 && x < o.x + o.w + 6 && y > o.y && y < o.y + o.h + 10);
  // movimento do jogador (mesmo controle do mapa); encostar na grade da porta mostra o aviso
  S.step = (dt, inp, now) => {
    const mx = inp.mx || 0; const my = inp.my || 0; const len = Math.hypot(mx, my);
    S.moving = len > 0.15;
    if (S.moving) {
      const sp = 70 * Math.min(1, len); const nx = S.x + (mx / len) * sp * dt; const ny = S.y + (my / len) * sp * dt;
      if (free(nx, S.y)) S.x = nx; if (free(S.x, ny)) S.y = ny;
      S.a = Math.atan2(my, mx); S.walkT += (sp * dt) / 9;
      if (ny >= LIMIT - 1) { S.msg = S.x > DOOR.x && S.x < DOOR.x + DOOR.w ? '🔒 A porta está trancada. Aguarde a liberação.' : 'Grades da cela.'; S.msgUntil = now + 2000; }
    }
    // carcereiro anda de um lado para o outro no corredor
    const g = S.guard; g.t += dt; g.x += g.dir * 22 * dt; if (g.x > ROOM.w - 30) g.dir = -1; if (g.x < 30) g.dir = 1;
  };
  // desenho: img(key) → imagem; chr(key, x, y, row, frame, H) desenha um personagem com os pés em (x, y)
  S.draw = (ctx, { W, H, img, chr, mySpr, guardSpr, t }) => {
    const totalW = ROOM.w + 40; const totalH = ROOM.wall + ROOM.h + ROOM.corr + 20;
    const k = Math.min(W / totalW, H / totalH) * 0.96; const ox = (W - ROOM.w * k) / 2; const oy = (H - totalH * k) / 2 + ROOM.wall * k + 10 * k;
    ctx.fillStyle = '#0d1020'; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.translate(ox, oy); ctx.scale(k, k); ctx.imageSmoothingEnabled = false;
    const im = (n) => img(`prisao/${n}`);
    // corredor (piso escuro) e piso da cela
    const tile = (key, x0, y0, x1, y1) => { const p = im(key); for (let y = y0; y < y1; y += T) for (let x = x0; x < x1; x += T) { if (p) ctx.drawImage(p, x, y, T, T); else { ctx.fillStyle = '#8a8f99'; ctx.fillRect(x, y, T - 1, T - 1); } } };
    tile('piso-escuro', -20, ROOM.h, ROOM.w + 20, ROOM.h + ROOM.corr);
    tile('piso', 0, 0, ROOM.w, ROOM.h);
    // paredes: em cima a parede de tijolos com janela gradeada; nos lados, concreto
    const pw = im('parede'); for (let x = -20; x < ROOM.w + 20; x += 112) { if (pw) ctx.drawImage(pw, x, -ROOM.wall, 112, ROOM.wall); else { ctx.fillStyle = '#c9ccd2'; ctx.fillRect(x, -ROOM.wall, 112, ROOM.wall); } }
    const jn = im('janela-grade'); if (jn) ctx.drawImage(jn, ROOM.w / 2 - 34, -ROOM.wall + 10, 68, 34);
    ctx.fillStyle = '#3a3f4b'; ctx.fillRect(-20, -ROOM.wall, 20, ROOM.h + ROOM.wall); ctx.fillRect(ROOM.w, -ROOM.wall, 20, ROOM.h + ROOM.wall);
    ctx.fillStyle = '#5b6170'; ctx.fillRect(-2, -ROOM.wall, 2, ROOM.h + ROOM.wall); ctx.fillRect(ROOM.w, -ROOM.wall, 2, ROOM.h + ROOM.wall);
    // móveis
    const put = (key, x, y, w, h) => { const p = im(key); if (p) ctx.drawImage(p, x, y, w, h); };
    put('cama', 8, -6, 58, 104);
    put('pia', ROOM.w - 112, -14, 44, 44); put('vaso', ROOM.w - 56, -12, 44, 50);
    put('camera', ROOM.w - 34, -ROOM.wall + 4, 26, 26); put('sirene', 14, -ROOM.wall + 6, 14, 14);
    // jogador e carcereiro (o de trás é desenhado primeiro)
    const drawMe = () => { const row = S.moving ? rowOf(S.a) : S.row ?? 0; S.row = row; chr(mySpr, S.x, S.y, row, S.moving ? Math.floor(S.walkT) % 4 : 0, 52); };
    ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(S.x, S.y, 11, 4, 0, 0, Math.PI * 2); ctx.fill();
    drawMe();
    // grade com a porta trancada (na frente do jogador)
    const gr = im('grade'); const pg = im('porta-grade');
    for (let x = 0; x < ROOM.w; x += 50) { if (x >= DOOR.x - 10 && x < DOOR.x + DOOR.w) continue; if (gr) ctx.drawImage(gr, x, ROOM.h - 64, 50, 72); }
    if (pg) ctx.drawImage(pg, DOOR.x, ROOM.h - 70, DOOR.w, 78);
    ctx.fillStyle = '#f7c948'; ctx.fillRect(DOOR.x + DOOR.w - 12, ROOM.h - 34, 6, 8); // cadeado
    put('banco', 20, ROOM.h + 22, 90, 26); put('extintor', ROOM.w - 26, ROOM.h + 14, 14, 30);
    const g = S.guard; ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(g.x, ROOM.h + 70, 11, 4, 0, 0, Math.PI * 2); ctx.fill();
    chr(guardSpr, g.x, ROOM.h + 70, g.dir > 0 ? 1 : 3, Math.floor(g.t * 2.6) % 4, 52);
    ctx.restore();
    void t;
  };
  return S;
}
// linha da folha pela direção (0 frente, 1 direita, 2 costas, 3 esquerda)
function rowOf(a) { const dx = Math.cos(a); const dy = Math.sin(a); return Math.abs(dy) > Math.abs(dx) * 0.85 ? (dy > 0 ? 0 : 2) : dx > 0 ? 1 : 3; }
