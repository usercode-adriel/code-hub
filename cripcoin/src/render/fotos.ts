// FOTOS EM PIXEL ART (celular): cenários desenhados em blocos de 2 px + a personagem (recorte de cima do sprite "de frente") ou produtos.
// Geradas no navegador e guardadas em cache por chave; nenhuma imagem externa.
import { aleatorio } from '../nucleo/rng';
import type { Foto } from '../sistemas/social';
import { avatar, dormindo, imgItem, objeto } from './arte';

const cache = new Map<string, string>(); const L = 96;
const px = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, cor: string): void => { c.fillStyle = cor; c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
function fundo(c: CanvasRenderingContext2D, f: Foto, r: () => number): void {
  switch (f.cena) {
    case 'praia': { ['#7ec8f0', '#94d4f4', '#aee0f7', '#c8eafa'].forEach((cor, i) => px(c, 0, i * 12, L, 12, cor)); px(c, 70, 8, 14, 14, '#ffe066'); ['#2e86c1', '#3a9ad9', '#5dade2'].forEach((cor, i) => px(c, 0, 48 + i * 6, L, 6, cor)); px(c, 0, 66, L, 30, '#f2d49b'); for (let i = 0; i < 18; i++) px(c, r() * L, 68 + r() * 26, 2, 2, '#e0bd7a'); break; }
    case 'cidade': { px(c, 0, 0, L, L, '#1b1d3a'); for (let i = 0; i < 14; i++) px(c, r() * L, r() * 30, 2, 2, '#ffffff'); for (let x = 0; x < L; x += 14) { const h = 30 + r() * 40; px(c, x, L - h, 12, h, ['#2c2f5a', '#3a3d6e', '#24264a'][Math.floor(r() * 3)]); for (let y = L - h + 4; y < L - 4; y += 6) for (let k = 2; k < 10; k += 4) if (r() < 0.5) px(c, x + k, y, 2, 3, '#ffd75e'); } break; }
    case 'escritorio': { px(c, 0, 0, L, 60, '#e9e2cf'); px(c, 0, 58, L, 4, '#9a94ad'); px(c, 8, 10, 30, 24, '#7ec8f0'); px(c, 8, 21, 30, 2, '#5a5f78'); px(c, 22, 10, 2, 24, '#5a5f78'); px(c, 0, 62, L, 34, '#b07a46'); break; }
    case 'cafe': { px(c, 0, 0, L, 64, '#6b4a3a'); for (let x = 0; x < L; x += 12) px(c, x, 0, 1, 64, '#5a3c2e'); px(c, 0, 64, L, 32, '#c69c6d'); px(c, 0, 64, L, 3, '#a47c52'); break; }
    case 'parque': { ['#8fd3f4', '#a6dcf6'].forEach((cor, i) => px(c, 0, i * 25, L, 25, cor)); px(c, 0, 50, L, 46, '#5fbf5a'); px(c, 66, 18, 22, 22, '#2e8b3e'); px(c, 75, 38, 5, 14, '#7a4b2a'); for (let i = 0; i < 20; i++) px(c, r() * L, 54 + r() * 40, 2, 2, '#4aa846'); break; }
    case 'quarto': { px(c, 0, 0, L, L, '#f4c6d6'); px(c, 0, 70, L, 26, '#d99ab0'); px(c, 60, 10, 26, 20, '#fff0f5'); px(c, 60, 10, 26, 2, '#c97a96'); break; }
    case 'festa': { px(c, 0, 0, L, L, '#24123a'); const cores = ['#ff5ab4', '#5ae0ff', '#ffe14d', '#7aff8a']; for (let i = 0; i < 26; i++) px(c, r() * L, r() * 50, 3, 3, cores[i % 4]); px(c, 0, 72, L, 24, '#3a1f58'); break; }
    case 'espelho': { px(c, 0, 0, L, L, '#d8d0f0'); px(c, 10, 4, 76, 88, '#8a6a4a'); px(c, 14, 8, 68, 80, '#cfe8f5'); px(c, 18, 12, 10, 30, '#e8f6fb'); break; }
    case 'produto': case 'unboxing': { const cores = ['#ffe3ec', '#e3f2ff', '#fff4d6', '#e8ffe8', '#f0e6ff']; px(c, 0, 0, L, L, cores[Math.floor(r() * cores.length)]); px(c, 0, 70, L, 26, '#ffffff'); px(c, 0, 70, L, 2, '#ddd'); break; }
  }
}
function personagem(c: CanvasRenderingContext2D, f: Foto): void {
  if (!f.avatar) return;
  if (f.cena === 'quarto') { const d = dormindo(f.avatar); if (d) { c.save(); c.translate(L / 2, 74); c.rotate(-Math.PI / 2); const s = 0.62; c.drawImage(d, -d.height * s / 4, -d.width * s / 4, d.width * s / 2, d.height * s / 2); c.restore(); } return; }
  const im = avatar(f.avatar, 'S'); if (!im) return; const corte = im.height * 0.5;                          // selfie: cabeça e tronco
  const h = 78; const w = (im.width / corte) * h; c.drawImage(im, 0, 0, im.width, corte, L / 2 - w / 2 + (f.cena === 'espelho' ? 4 : 0), L - h, w, h);
}
function produto(c: CanvasRenderingContext2D, f: Foto, r: () => number): void {
  if (!f.item) return; const im = imgItem(f.item); if (!im) return; const s = f.avatar ? 26 : f.cena === 'unboxing' ? 44 : 56; const k = s / Math.max(im.width, im.height);
  if (f.cena === 'unboxing') { const cx = objeto('caixa-papelao'); if (cx) c.drawImage(cx, 8, 50, 46, 42); }
  const x = f.avatar ? 66 : f.cena === 'unboxing' ? 46 : L / 2 - (im.width * k) / 2; const y = f.avatar ? L - 30 : f.cena === 'unboxing' ? 26 : 16 + r() * 4; c.drawImage(im, x, y, im.width * k, im.height * k);
  if (f.preco) { c.font = 'bold 9px monospace'; const tw = c.measureText(f.preco).width + 6; px(c, L - tw - 4, L - 16, tw, 12, '#ee4d2d'); c.fillStyle = '#fff'; c.fillText(f.preco, L - tw - 1, L - 7); }
}
/** dataURL da foto (96×96, mostrada ampliada com pixels nítidos). */
export function fotoURL(f: Foto): string {
  const k = `${f.cena}|${f.avatar ?? ''}|${f.item ?? ''}|${f.semente}|${f.preco ?? ''}`; const c0 = cache.get(k); if (c0) return c0;
  const cv = document.createElement('canvas'); cv.width = L; cv.height = L; const c = cv.getContext('2d')!; c.imageSmoothingEnabled = false; const r = aleatorio(f.semente || 1);
  fundo(c, f, r); personagem(c, f); produto(c, f, r); const url = cv.toDataURL('image/png'); cache.set(k, url); return url;
}
/** Foto de perfil: rosto recortado do sprite de frente sobre um círculo colorido. */
export function fotoPerfil(av: string | undefined, cor: string): string {
  const k = `perfil|${av ?? ''}|${cor}`; const c0 = cache.get(k); if (c0) return c0; const cv = document.createElement('canvas'); cv.width = 48; cv.height = 48; const c = cv.getContext('2d')!; c.imageSmoothingEnabled = false;
  c.fillStyle = cor; c.beginPath(); c.arc(24, 24, 24, 0, Math.PI * 2); c.fill();
  const im = av ? avatar(av, 'S') : null; if (im) { c.save(); c.beginPath(); c.arc(24, 24, 23, 0, Math.PI * 2); c.clip(); const corte = im.height * 0.32; const w = (im.width / corte) * 46; c.drawImage(im, 0, 0, im.width, corte, 24 - w / 2, 4, w, 46); c.restore(); }
  else { c.fillStyle = '#fff'; c.font = 'bold 22px monospace'; c.textAlign = 'center'; c.fillText('★', 24, 32); }
  const url = cv.toDataURL('image/png'); cache.set(k, url); return url;
}
