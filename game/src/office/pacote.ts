// PACOTE DE ARTE DO ESCRITÓRIO: PNGs recortados das folhas fornecidas (game/assets-fonte → game/office/public/arte via game/tools/*.py).
// Objetos, paredes, pisos e os 5 avatares (8 direções) são carregados uma vez, em resolução 2x (a engine desenha com escala 0.5), e viram
// texturas com filtro suave. A imagem também fica em memória (PixelImage) para o clique acertar só onde há pixel opaco.
import { Texture } from 'pixi.js';
import { PixelImage } from '../assets/pixel';

export const ESCALA_ARTE = 0.5;
export interface Sprite2x { canvas: HTMLCanvasElement; tex: Texture; arte: PixelImage; w: number; h: number; ax: number; ay: number; }
interface ManObjeto { w: number; h: number }
interface ManParede { w: number; h: number; ax: number; ay: number; lado: 'N' | 'W' }
export interface Manifesto { objetos: Record<string, ManObjeto>; paredes: Record<string, ManParede>; pisos: Record<string, { w: number; h: number }> }

const carregarImagem = (url: string): Promise<HTMLImageElement> => new Promise((ok, falha) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => falha(new Error(`Falha ao carregar ${url}`)); i.src = url; });

function canvasDe(img: HTMLImageElement, espelhar = false): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; const g = c.getContext('2d')!;
  if (espelhar) { g.translate(c.width, 0); g.scale(-1, 1); }
  g.drawImage(img, 0, 0); return c;
}
function paraSprite(c: HTMLCanvasElement, ax: number, ay: number): Sprite2x {
  const dados = c.getContext('2d')!.getImageData(0, 0, c.width, c.height); const arte = new PixelImage(c.width, c.height); arte.data.set(dados.data);
  const tex = Texture.from(c); tex.source.scaleMode = 'linear';
  return { canvas: c, tex, arte, w: c.width, h: c.height, ax, ay };
}
/** x do ponto mais baixo do desenho (a "base" do objeto), usado para alinhar o sprite ao vértice da frente do espaço que ocupa. */
function baseX(arte: PixelImage): number {
  for (let y = arte.height - 1; y >= 0; y--) { let soma = 0; let n = 0; for (let x = 0; x < arte.width; x++) if (arte.data[(y * arte.width + x) * 4 + 3] > 40) { soma += x; n++; } if (n) return Math.round(soma / n); }
  return arte.width / 2;
}

export class Pacote {
  pronto = false; falhou: string | null = null;
  readonly objetos = new Map<string, Sprite2x>(); readonly paredes = new Map<string, Sprite2x & { lado: 'N' | 'W' }>(); readonly pisos = new Map<string, HTMLCanvasElement>(); readonly personagens = new Map<string, Sprite2x>();
  private readonly espelhos = new Map<string, Sprite2x>();
  constructor(private readonly base = '/escritorio/arte') {}

  async carregar(): Promise<void> {
    try {
      const man = (await (await fetch(`${this.base}/manifesto.json`)).json()) as Manifesto;
      const pm = (await (await fetch(`${this.base}/personagens/manifesto.json`)).json()) as { personagens: Record<string, { w: number; h: number }> };
      const tarefas: Promise<void>[] = [];
      for (const nome of Object.keys(man.objetos)) tarefas.push(carregarImagem(`${this.base}/objetos/${nome}.png`).then((i) => { const c = canvasDe(i); const a = paraSprite(c, 0, c.height); a.ax = baseX(a.arte); this.objetos.set(nome, a); }));
      for (const [nome, m] of Object.entries(man.paredes)) tarefas.push(carregarImagem(`${this.base}/paredes/${nome}.png`).then((i) => { const s = paraSprite(canvasDe(i), m.ax, m.ay); this.paredes.set(nome, { ...s, lado: m.lado }); }));
      for (const nome of Object.keys(man.pisos)) tarefas.push(carregarImagem(`${this.base}/pisos/${nome}.png`).then((i) => { this.pisos.set(nome, canvasDe(i)); }));
      for (const chave of Object.keys(pm.personagens)) for (const d of ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW'])
        tarefas.push(carregarImagem(`${this.base}/personagens/${chave}-${d}.png`).then((i) => { const c = canvasDe(i); const s = paraSprite(c, c.width / 2, c.height - 2); this.personagens.set(`${chave}-${d}`, s); }));
      await Promise.all(tarefas); this.pronto = true;
    } catch (e) { this.falhou = e instanceof Error ? e.message : String(e); }
  }
  objeto(nome: string, espelhar = false): Sprite2x | null {
    const s = this.objetos.get(nome); if (!s || !espelhar) return s ?? null;
    let e = this.espelhos.get(nome); if (!e) { const c = document.createElement('canvas'); c.width = s.w; c.height = s.h; const g = c.getContext('2d')!; g.translate(s.w, 0); g.scale(-1, 1); g.drawImage(s.canvas, 0, 0); e = paraSprite(c, 0, s.h); e.ax = baseX(e.arte); this.espelhos.set(nome, e); }
    return e;
  }
  personagem(chave: string, dir: string): Sprite2x | null { return this.personagens.get(`${chave}-${dir}`) ?? null; }
  temPersonagem(chave: string): boolean { return this.personagens.has(`${chave}-S`); }
}
