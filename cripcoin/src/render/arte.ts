// ARTE: carrega os sprites recortados (public/arte). Arquivo ausente => `null` e o desenho usa um placeholder identificável (nada é inventado).
import { ITENS } from '../dados/catalogo';
import { AVATARES, VISTAS } from '../dados/pessoas';

const base = (): string => `${import.meta.env.BASE_URL}arte/`;
const cache = new Map<string, HTMLImageElement | null>();
const carregar = (chave: string, url: string): Promise<void> => new Promise((ok) => {
  const im = new Image(); im.onload = () => { cache.set(chave, im); ok(); }; im.onerror = () => { cache.set(chave, null); ok(); }; im.src = url;
});
export const PISOS = ['madeira', 'parquet', 'ceramica-creme', 'ceramica-branca', 'ceramica-azul', 'ceramica-verde', 'xadrez-azul', 'metal', 'concreto-escuro', 'tapete-escuro'];
export const CORES_PAREDE: Record<string, { nome: string; cor: string | null }> = {
  creme: { nome: 'Creme (original)', cor: null }, branco: { nome: 'Branco', cor: '#fbfbff' }, azul: { nome: 'Azul', cor: '#7fa8e0' }, verde: { nome: 'Verde', cor: '#8fcf9a' }, rosa: { nome: 'Rosa', cor: '#e8a0b8' },
  cinza: { nome: 'Cinza', cor: '#aab0b8' }, escuro: { nome: 'Grafite', cor: '#5a5f78' }, amarelo: { nome: 'Amarelo', cor: '#f0d878' }, laranja: { nome: 'Laranja', cor: '#f0a868' }, lilas: { nome: 'Lilás', cor: '#b8a0e0' }, vinho: { nome: 'Vinho', cor: '#a85860' }, menta: { nome: 'Menta', cor: '#a0e0cc' },
};

let pronto: Promise<void> | null = null;
export function carregarArte(): Promise<void> {
  pronto ??= (async () => {
    const t: Promise<void>[] = [];
    for (const s of new Set(ITENS.flatMap((i) => [i.sprite, ...Object.values(i.variantes ?? {}).map((v) => v!.sprite)]))) t.push(carregar(`o:${s}`, `${base()}objetos/${s}.png`));
    for (const p of PISOS) t.push(carregar(`p:${p}`, `${base()}pisos/${p}.png`));
    for (const w of ['parede', 'porta', 'janela', 'parede-tela', 'parede-grade']) t.push(carregar(`w:${w}`, `${base()}paredes/${w}.png`));
    for (const a of AVATARES) for (const d of VISTAS) t.push(carregar(`a:${a}-${d}`, `${base()}personagens/${a}-${d}.png`));
    await Promise.all(t);
  })();
  return pronto;
}
export const objeto = (s: string): HTMLImageElement | null => cache.get(`o:${s}`) ?? null;
export const piso = (s: string): HTMLImageElement | null => cache.get(`p:${s}`) ?? null;
export const parede = (s: string): HTMLImageElement | null => cache.get(`w:${s}`) ?? null;
/** Só há 4 vistas (frente, costas, lados): diagonais usam a vista cardeal mais próxima. */
const CARDEAL: Record<string, string> = { N: 'N', S: 'S', E: 'E', W: 'W', NE: 'N', NW: 'N', SE: 'S', SW: 'S' };
export const avatar = (a: string, d: string): HTMLImageElement | null => cache.get(`a:${a}-${CARDEAL[d] ?? 'S'}`) ?? null;
export const urlAvatar = (a: string, d = 'S'): string => `${base()}personagens/${a}-${d}.png`;
export const urlObjeto = (s: string): string => `${base()}objetos/${s}.png`;
export const urlPiso = (s: string): string => `${base()}pisos/${s}.png`;

const tintas = new Map<string, HTMLCanvasElement>();
/** Parede pintada: multiplica a cor sobre o sprite original (cacheado). */
export function paredeColorida(nome: string, cor: string | null): CanvasImageSource | null {
  const im = parede(nome); if (!im || !cor) return im; const k = `${nome}|${cor}`; let c = tintas.get(k);
  if (!c) { c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d')!; g.drawImage(im, 0, 0); g.globalCompositeOperation = 'multiply'; g.fillStyle = cor; g.fillRect(0, 0, c.width, c.height); g.globalCompositeOperation = 'destination-in'; g.drawImage(im, 0, 0); tintas.set(k, c); }
  return c;
}
