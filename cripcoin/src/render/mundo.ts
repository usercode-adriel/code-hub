// RENDERER 2D (canvas): vista de cima, grid real. Arte em 2x desenhada a 0,5 (tile lógico = 32 px). Câmera com zoom e pan.
import { item } from '../dados/catalogo';
import { celulasDe, ehParede, idx, portaEm, temPiso } from '../nucleo/mapa';
import { alturaFace, ancora, apoioDe, escalaVisual, retSprite, RODAPE, spriteDe, tamanhoPegada, temFace, type Ret } from '../nucleo/superficie';
import type { Jogo } from '../nucleo/jogo';
import type { ItemDef, ObjetoColocado, Projeto } from '../tipos';
import { avatar, CORES_PAREDE, objeto, parede as spriteParede, paredeColorida, piso } from './arte';
import { estado, seca } from '../sistemas/objetos';

export const T = 32;                                          // pixels lógicos por tile (zoom 1)
export interface Camera { x: number; y: number; zoom: number }   // x,y = ponto do mundo (em tiles) no centro da tela
export interface Fantasma { obj: ObjetoColocado; ok: boolean; motivo: string; movendo?: string }
export interface VistaUI {
  construcao: boolean; mostrarGrade: boolean; mostrarColisao: boolean; mostrarSuperficies: boolean; selecionado: string | null; fantasma: Fantasma | null; hover: { x: number; y: number } | null;
  area: { x0: number; y0: number; x1: number; y1: number; cor: string } | null; funcSel: string | null;
}
export { spriteDe };
const corCateg = (d: ItemDef): string => (d.camada === 'sobre' ? '#6aa0ff' : d.camada === 'parede' ? '#c8a060' : '#a0a0a0');

export class Mundo {
  cam: Camera = { x: 0, y: 0, zoom: 2 }; w = 0; h = 0; dpr = 1; private tempo = 0;
  constructor(readonly canvas: HTMLCanvasElement) {}
  ajustar(): void {
    const r = this.canvas.getBoundingClientRect(); this.dpr = Math.min(2, window.devicePixelRatio || 1); this.w = r.width; this.h = r.height;
    this.canvas.width = Math.max(1, Math.floor(r.width * this.dpr)); this.canvas.height = Math.max(1, Math.floor(r.height * this.dpr));
  }
  enquadrar(p: Projeto): void { this.cam.x = p.largura / 2; this.cam.y = p.altura / 2; this.cam.zoom = Math.max(0.5, Math.min(4, Math.floor(Math.min(this.w / (p.largura * T + 40), this.h / (p.altura * T + 80)) * 4) / 4)); }
  zoom(f: number, sx = this.w / 2, sy = this.h / 2): void {
    const a = this.paraMundo(sx, sy); this.cam.zoom = Math.max(0.5, Math.min(6, Math.round(this.cam.zoom * f * 8) / 8));
    const b = this.paraMundo(sx, sy); this.cam.x += a.x - b.x; this.cam.y += a.y - b.y;
  }
  /** Tela (px CSS) -> mundo (tiles, fracionário). */
  paraMundo(sx: number, sy: number): { x: number; y: number } { const s = T * this.cam.zoom; return { x: this.cam.x + (sx - this.w / 2) / s, y: this.cam.y + (sy - this.h / 2) / s }; }
  paraTela(x: number, y: number): { x: number; y: number } { const s = T * this.cam.zoom; return { x: this.w / 2 + (x - this.cam.x) * s, y: this.h / 2 + (y - this.cam.y) * s }; }
  celula(sx: number, sy: number): { x: number; y: number } { const m = this.paraMundo(sx, sy); return { x: Math.floor(m.x), y: Math.floor(m.y) }; }

  /** Objeto sob um ponto do mundo (tiles). Usa o retângulo real do sprite (já com escala): itens apoiados e de parede têm prioridade, depois o resto. */
  objetoEm(p: Projeto, mx: number, my: number): ObjetoColocado | null {
    const ordem = (o: ObjetoColocado): number => { const c = item(o.def)?.camada; return c === 'sobre' ? 0 : c === 'parede' ? 1 : c === 'objeto' ? 2 : 3; };
    const acertos = p.objetos.filter((o) => {
      const d = item(o.def); if (!d) return false; const r = retSprite(p, o, d); const cx = Math.floor(mx); const cy = Math.floor(my);
      if (d.camada === 'objeto' || d.camada === 'chao') { if (celulasDe(o, d).some((q) => q.x === cx && q.y === cy)) return true; }
      return mx >= r.left && mx <= r.left + r.w && my >= r.top && my <= r.top + r.h;
    });
    return acertos.sort((a, b) => ordem(a) - ordem(b))[0] ?? null;
  }
  /** Retângulo do sprite (tiles) de um objeto do projeto. */
  retDe(p: Projeto, o: ObjetoColocado): Ret | null { const d = item(o.def); return d ? retSprite(p, o, d) : null; }
  /** Alças de redimensionamento (cantos) do retângulo do sprite, em tiles. */
  alcas(p: Projeto, o: ObjetoColocado): { id: 'no' | 'ne' | 'so' | 'se'; x: number; y: number }[] {
    const r = this.retDe(p, o); if (!r) return []; return [{ id: 'no', x: r.left, y: r.top }, { id: 'ne', x: r.left + r.w, y: r.top }, { id: 'so', x: r.left, y: r.top + r.h }, { id: 'se', x: r.left + r.w, y: r.top + r.h }];
  }
  funcionarioEm(p: Projeto, mx: number, my: number): string | null {
    let melhor: string | null = null; let dm = 0.9;
    for (const f of p.funcionarios) { if (f.status !== 'ativo' || f.estado === 'ausente') continue; const d = Math.hypot(f.x - mx, f.y - 0.2 - my); if (d < dm) { dm = d; melhor = f.id; } }
    return melhor;
  }

  desenhar(jogo: Jogo, ui: VistaUI, dt: number): void {
    this.tempo += dt; const p = jogo.p; const c = this.canvas.getContext('2d')!; const z = this.cam.zoom; const s = T * z;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); c.imageSmoothingEnabled = false; c.fillStyle = '#16131f'; c.fillRect(0, 0, this.w, this.h);
    c.save(); c.translate(Math.round(this.w / 2 - this.cam.x * s), Math.round(this.h / 2 - this.cam.y * s)); c.scale(z, z);
    // piso
    for (let y = 0; y < p.altura; y++) for (let x = 0; x < p.largura; x++) {
      const nome = p.piso[idx(p, x, y)]; if (!nome) continue; const im = piso(nome);
      if (im) c.drawImage(im, x * T, y * T, T, T); else { c.fillStyle = (x + y) % 2 ? '#b08850' : '#a07a46'; c.fillRect(x * T, y * T, T, T); }
    }
    this.sombrasDoPiso(c, p);
    // objetos de chão (tapetes)
    for (const o of p.objetos) { const d = item(o.def); if (d?.camada === 'chao') this.objeto(c, p, o, d); }
    // camada ordenada por profundidade: paredes, objetos, itens sobre mesas e funcionários
    type Cena = { z: number; f: () => void };
    const cena: Cena[] = [];
    const corP = CORES_PAREDE[p.corParede]?.cor ?? null;
    for (let y = 0; y < p.altura; y++) for (let x = 0; x < p.largura; x++) {
      if (ehParede(p, x, y)) cena.push({ z: y + 1, f: () => this.parede(c, p, x, y, corP) });
      else { const q = portaEm(p, x, y); if (q) cena.push({ z: y + 1, f: () => this.porta(c, p, q.x, q.y, q.aberta) }); }
    }
    const sentados = new Set(p.funcionarios.filter((f) => f.status === 'ativo' && f.estado === 'trabalhando').map((f) => `${Math.floor(f.x)},${Math.floor(f.y)}`));
    for (const o of p.objetos) {
      const d = item(o.def); if (!d || d.camada === 'chao') continue;
      if (d.sentavel && sentados.has(`${o.x},${o.y}`)) continue;                                    // o sprite do funcionário já inclui a cadeira
      const mesa = apoioDe(p, o); const md = mesa && item(mesa.def); const an = d.camada === 'sobre' ? ancora(p, o) : null;
      const zz = d.camada === 'parede' ? o.y + 1.02 : d.camada === 'sobre' ? (mesa && md ? mesa.y + tamanhoPegada(mesa, md).h + 0.01 + (an ? an.y * 0.0005 : 0) : o.y + 1) : o.y + tamanhoPegada(o, d).h;
      cena.push({ z: zz, f: () => this.objeto(c, p, o, d) });
    }
    for (const f of p.funcionarios) if (f.status === 'ativo' && f.estado !== 'ausente') cena.push({ z: f.y + 0.5 + (f.estado === 'trabalhando' ? 0.02 : 0), f: () => this.funcionario(c, f, ui.funcSel === f.id) });
    cena.sort((a, b) => a.z - b.z); for (const e of cena) e.f();
    // sobreposições do editor
    if (ui.construcao) this.sobreposicoes(c, p, ui);
    if (ui.fantasma) this.fantasma(c, p, ui.fantasma);
    // balões de fala por cima de tudo
    for (const f of p.funcionarios) if (f.status === 'ativo' && f.estado !== 'ausente' && f.fala) this.balao(c, f.x * T, (f.y - 1.25) * T, f.fala);
    c.restore();
  }
  private sombrasDoPiso(c: CanvasRenderingContext2D, p: Projeto): void {
    // escurece o piso encostado na parede norte, para dar profundidade (sombra projetada pela parede)
    c.fillStyle = 'rgba(0,0,0,0.16)';
    for (let x = 0; x < p.largura; x++) for (let y = 1; y < p.altura; y++) if (ehParede(p, x, y - 1) && temPiso(p, x, y) && !ehParede(p, x, y)) c.fillRect(x * T, y * T, T, 5);
  }
  private parede(c: CanvasRenderingContext2D, p: Projeto, x: number, y: number, cor: string | null): void {
    const im = paredeColorida('parede', cor) as (HTMLImageElement | HTMLCanvasElement | null); const baixo = y + 1 < p.altura && (ehParede(p, x, y + 1));
    // topo da parede (visto de cima): bloco cinza-arroxeado com aresta clara
    c.fillStyle = '#8f89a3'; c.fillRect(x * T, y * T, T, T); c.fillStyle = '#b3aec4'; c.fillRect(x * T, y * T, T, 3); c.fillStyle = '#6f6985'; c.fillRect(x * T, y * T + T - 2, T, 2);
    if (baixo) return;                                                                   // só aparece a face frontal quando há chão logo abaixo
    const hFace = Math.round(p.alturaParede * T);
    if (!im) { c.fillStyle = '#d8cfb8'; c.fillRect(x * T, (y + 1) * T - hFace, T, hFace); return; }
    const W = im.width; const H = im.height; const tampa = 24; const corpo = H - tampa; const srcH = Math.min(corpo, hFace * 2); const dstH = srcH / 2;
    c.drawImage(im, 0, H - srcH, W, srcH, x * T, (y + 1) * T - dstH, T, dstH);              // base (rodapé) nativa
    for (let falta = hFace - dstH, topo = (y + 1) * T - dstH; falta > 0; ) { const h = Math.min(falta, 8); c.drawImage(im, 0, tampa + 6, W, h * 2, x * T, topo - h, T, h); topo -= h; falta -= h; }   // completa a altura com o trecho liso
    c.fillStyle = '#9a94ad'; c.fillRect(x * T, (y + 1) * T - hFace - 2, T, 2);
  }
  private porta(c: CanvasRenderingContext2D, p: Projeto, x: number, y: number, aberta: boolean): void {
    const im = spriteParede('porta'); const T2 = T; const hFace = Math.round(p.alturaParede * T2);
    if (aberta) { c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(x * T2, y * T2, T2, T2); }
    if (im && !aberta) { const W = im.width; const H = im.height; c.drawImage(im, 0, 0, W, H, x * T2, (y + 1) * T2 - Math.max(hFace, H / 2), T2, Math.max(hFace, H / 2)); }
    else if (!im) { c.fillStyle = '#8a5a3a'; c.fillRect(x * T2, y * T2 - 8, T2, T2 + 8); }
  }
  private objeto(c: CanvasRenderingContext2D, p: Projeto, o: ObjetoColocado, d: ItemDef): void {
    const sp = spriteDe(d, o.rot); if (d.interacao === 'planta' && seca(o) && objeto('planta-seca')) sp.nome = 'planta-seca'; const im = objeto(sp.nome);
    const r = retSprite(p, o, d); const L = r.left * T; const Tp = r.top * T; const W = r.w * T; const H = r.h * T;
    const ligada = d.interacao === 'tv' && !!estado(o, 'ligada', false);
    if (im) {
      c.save(); if (sp.espelhar) { c.translate(L + W, Tp); c.scale(-1, 1); c.drawImage(im, 0, 0, W, H); } else c.drawImage(im, L, Tp, W, H); c.restore();
      if (ligada) { c.fillStyle = 'rgba(120,200,255,0.25)'; c.fillRect(L + 3, Tp + 3, W - 6, H * 0.55); }
    } else this.placeholder(c, d, L, Tp, W, H);
  }
  private placeholder(c: CanvasRenderingContext2D, d: ItemDef, L: number, Tp: number, W: number, H: number): void {
    c.fillStyle = corCateg(d) + 'cc'; c.fillRect(L + 1, Tp + 1, W - 2, H - 2); c.strokeStyle = '#000'; c.strokeRect(L + 1.5, Tp + 1.5, W - 3, H - 3);
    c.fillStyle = '#000'; c.font = '7px monospace'; c.textAlign = 'center'; c.fillText(d.nome.slice(0, 9), L + W / 2, Tp + H / 2 + 2);
  }
  private funcionario(c: CanvasRenderingContext2D, f: ProjetoFunc, sel: boolean): void {
    const dirSprite = f.dir; const im = avatar(f.avatar, dirSprite); const andando = f.caminho.length > 0;
    const balanco = andando ? Math.sin(this.tempo * 9) * 1.2 : 0; const cx = f.x * T; const by = (f.y + 0.5) * T + 2 + (f.estado === 'descansando' ? 4 : 0) + balanco;
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.beginPath(); c.ellipse(cx, by - 2, 11, 4, 0, 0, Math.PI * 2); c.fill();
    if (im) { const sw = im.width / 2; const sh = im.height / 2; c.drawImage(im, cx - sw / 2, by - sh, sw, sh); }
    else { c.fillStyle = '#d98'; c.fillRect(cx - 8, by - 36, 16, 34); }
    if (f.estado === 'descansando') { c.fillStyle = '#fff'; c.font = 'bold 8px monospace'; c.textAlign = 'center'; c.fillText('z' + 'z'.repeat(Math.floor(this.tempo * 1.5) % 3), cx + 12, by - 38 - (this.tempo * 6) % 4); }
    if (sel) { c.strokeStyle = '#ffe14d'; c.lineWidth = 1.5; c.strokeRect(cx - 14, by - 62, 28, 62); }
    c.fillStyle = 'rgba(0,0,0,0.6)'; c.font = 'bold 7px monospace'; c.textAlign = 'center'; const nome = f.apelido || f.nome; const tw = c.measureText(nome).width + 4; c.fillRect(cx - tw / 2, by + 1, tw, 9); c.fillStyle = '#fff'; c.fillText(nome, cx, by + 8);
  }
  private balao(c: CanvasRenderingContext2D, x: number, y: number, texto: string): void {
    c.font = 'bold 7px monospace'; c.textAlign = 'center'; const tw = Math.min(150, c.measureText(texto).width + 8); c.fillStyle = '#fffbe8'; c.strokeStyle = '#222'; c.lineWidth = 1;
    c.fillRect(x - tw / 2, y - 18, tw, 12); c.strokeRect(x - tw / 2 + 0.5, y - 18 + 0.5, tw - 1, 11); c.fillStyle = '#222'; c.fillText(texto.slice(0, 26), x, y - 9);
  }
  private sobreposicoes(c: CanvasRenderingContext2D, p: Projeto, ui: VistaUI): void {
    if (ui.mostrarGrade) { c.strokeStyle = 'rgba(255,255,255,0.18)'; c.lineWidth = 1; c.beginPath(); for (let x = 0; x <= p.largura; x++) { c.moveTo(x * T + 0.5, 0); c.lineTo(x * T + 0.5, p.altura * T); } for (let y = 0; y <= p.altura; y++) { c.moveTo(0, y * T + 0.5); c.lineTo(p.largura * T, y * T + 0.5); } c.stroke(); }
    const face = alturaFace(p);
    if (ui.mostrarColisao) {
      // colisão FÍSICA: a parede inteira (cap + face visível) e os móveis sólidos; a fixação de objetos é outra coisa (ver "Superfícies")
      for (let y = 0; y < p.altura; y++) for (let x = 0; x < p.largura; x++) { if (ehParede(p, x, y)) { c.fillStyle = 'rgba(255,60,60,0.35)'; c.fillRect(x * T, y * T, T, T); if (temFace(p, x, y)) c.fillRect(x * T, (y + 1 - face) * T, T, (face - 1 > 0 ? face - 1 : 0) * T + 0.0001); } else if (!temPiso(p, x, y)) { c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(x * T, y * T, T, T); } }
      for (const o of p.objetos) { const d = item(o.def); if (!d || d.camada === 'sobre' || d.camada === 'parede') continue; c.fillStyle = d.solido ? 'rgba(255,60,60,0.35)' : 'rgba(255,200,40,0.28)'; for (const q of celulasDe(o, d)) c.fillRect(q.x * T, q.y * T, T, T); }
    }
    if (ui.mostrarSuperficies || ui.fantasma?.obj.sobre || (ui.fantasma && item(ui.fantasma.obj.def)?.camada === 'parede')) {
      // superfícies de fixação: faces de parede (verde-água) e áreas úteis dos móveis (azul)
      c.fillStyle = 'rgba(60,220,200,0.22)'; c.strokeStyle = 'rgba(60,220,200,0.9)'; c.lineWidth = 1;
      for (let y = 0; y < p.altura; y++) for (let x = 0; x < p.largura; x++) if (temFace(p, x, y)) { c.fillRect(x * T, (y + 1 - face) * T, T, face * T - RODAPE * T); c.strokeRect(x * T + 0.5, (y + 1 - face) * T + 0.5, T - 1, face * T - RODAPE * T - 1); }
      for (const o of p.objetos) { const d = item(o.def); if (!d?.superficie) continue; const r = retSprite(p, o, d);
        for (const n of d.superficie.niveis) { c.fillStyle = 'rgba(90,150,255,0.35)'; c.fillRect((r.left + n.x0 * r.w) * T, (r.top + n.y0 * r.h) * T, (n.x1 - n.x0) * r.w * T, (n.y1 - n.y0) * r.h * T); c.strokeStyle = 'rgba(150,190,255,0.95)'; c.strokeRect((r.left + n.x0 * r.w) * T + 0.5, (r.top + n.y0 * r.h) * T + 0.5, (n.x1 - n.x0) * r.w * T - 1, (n.y1 - n.y0) * r.h * T - 1); } }
    }
    const sel = ui.selecionado ? p.objetos.find((o) => o.id === ui.selecionado) : null;
    if (sel) this.selecao(c, p, sel);
    if (ui.area) { const { x0, y0, x1, y1, cor } = ui.area; c.fillStyle = cor; c.fillRect(Math.min(x0, x1) * T, Math.min(y0, y1) * T, (Math.abs(x1 - x0) + 1) * T, (Math.abs(y1 - y0) + 1) * T); }
    else if (ui.hover && !ui.fantasma) { c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 1; c.strokeRect(ui.hover.x * T + 0.5, ui.hover.y * T + 0.5, T - 1, T - 1); }
  }
  /** Seleção: contorno do sprite, colisão (pegada), área de suporte, âncora, dimensões e alças de redimensionamento. */
  private selecao(c: CanvasRenderingContext2D, p: Projeto, o: ObjetoColocado): void {
    const d = item(o.def); if (!d) return; const r = retSprite(p, o, d);
    c.fillStyle = 'rgba(255,225,77,0.16)'; for (const q of celulasDe(o, d)) if (d.camada !== 'sobre' && d.camada !== 'parede') c.fillRect(q.x * T, q.y * T, T, T);
    c.strokeStyle = '#ffe14d'; c.lineWidth = 1.5; c.strokeRect(r.left * T, r.top * T, r.w * T, r.h * T);
    const an = d.camada === 'sobre' ? ancora(p, o) : d.camada === 'parede' ? { x: r.left + r.w / 2, y: r.top + r.h } : { x: r.left + r.w / 2, y: r.top + r.h };
    if (an) { c.strokeStyle = '#ff5ab4'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(an.x * T - 4, an.y * T); c.lineTo(an.x * T + 4, an.y * T); c.moveTo(an.x * T, an.y * T - 4); c.lineTo(an.x * T, an.y * T + 4); c.stroke(); }
    c.fillStyle = '#ffe14d'; for (const a of this.alcas(p, o)) c.fillRect(a.x * T - 3, a.y * T - 3, 6, 6);
    const sc = escalaVisual(o, d); c.font = 'bold 7px monospace'; c.textAlign = 'left'; const txt = `${(r.w).toFixed(2)}×${(r.h).toFixed(2)} t · ${sc.sx.toFixed(2)}×${sc.sy.toFixed(2)}`; const tw = c.measureText(txt).width + 6;
    c.fillStyle = 'rgba(0,0,0,0.75)'; c.fillRect(r.left * T, r.top * T - 11, tw, 10); c.fillStyle = '#ffe14d'; c.fillText(txt, r.left * T + 3, r.top * T - 3);
  }
  private fantasma(c: CanvasRenderingContext2D, p: Projeto, f: Fantasma): void {
    const d = item(f.obj.def); if (!d) return; c.save(); c.globalAlpha = 0.78; this.objeto(c, p, f.obj, d); c.restore();
    const r = retSprite(p, f.obj, d); c.strokeStyle = f.ok ? 'rgba(80,255,120,0.95)' : 'rgba(255,70,70,0.95)'; c.lineWidth = 1.5; c.strokeRect(r.left * T, r.top * T, r.w * T, r.h * T);
    c.fillStyle = f.ok ? 'rgba(80,255,120,0.28)' : 'rgba(255,60,60,0.4)'; if (d.camada === 'sobre') { const an = ancora(p, f.obj); if (an) c.fillRect(an.x * T - 4, an.y * T - 2, 8, 4); } else if (d.camada !== 'parede') for (const q of celulasDe(f.obj, d)) c.fillRect(q.x * T, q.y * T, T, T);
  }
}
type ProjetoFunc = Projeto['funcionarios'][number];
