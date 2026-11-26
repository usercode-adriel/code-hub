// GRADE DE COLISÃO: construída do projeto. Bloqueia paredes e objetos sólidos; portas e cadeiras/sofás deixam passar.
import { item } from '../dados/catalogo';
import type { Projeto } from '../tipos';
import { celulasDe, dentro, ehParede, idx, temPiso } from './mapa';

export class Grade {
  readonly largura: number; readonly altura: number; private bloq: Uint8Array;
  constructor(p: Projeto) {
    this.largura = p.largura; this.altura = p.altura; this.bloq = new Uint8Array(p.largura * p.altura);
    for (let y = 0; y < p.altura; y++) for (let x = 0; x < p.largura; x++) if (!temPiso(p, x, y) || ehParede(p, x, y)) this.bloq[idx(p, x, y)] = 1;
    for (const o of p.objetos) { const d = item(o.def); if (!d || !d.solido || d.camada === 'sobre' || d.camada === 'parede') continue; for (const c of celulasDe(o, d)) if (dentro(p, c.x, c.y)) this.bloq[idx(p, c.x, c.y)] = 1; }
  }
  livre(x: number, y: number): boolean { return x >= 0 && y >= 0 && x < this.largura && y < this.altura && this.bloq[y * this.largura + x] === 0; }
  bloquear(x: number, y: number): void { if (x >= 0 && y >= 0 && x < this.largura && y < this.altura) this.bloq[y * this.largura + x] = 1; }
}
