// GRADE LÓGICA DE COLISÃO E NAVEGAÇÃO. Construída a partir do layout: células sem piso, móveis sólidos, colisões manuais e paredes.
// Paredes ficam nas ARESTAS entre células: 'N' separa (x, y−1) de (x, y); 'W' separa (x−1, y) de (x, y). Porta deixa passar; janela não.
import { dentro, indice, type Layout, type ObjetoLayout } from './modelo';
import { dimensoes, objetoPorTipo, type TipoObjeto } from './catalogo';

export type ResolveTipo = (o: ObjetoLayout) => TipoObjeto | undefined;
export const resolvePadrao: ResolveTipo = (o) => objetoPorTipo(o.tipo);

export class Grade {
  readonly largura: number; readonly altura: number;
  private bloq: Uint8Array;            // 1 = célula não andável
  private arestaN: Uint8Array;         // 1 = parede entre (x,y−1) e (x,y)
  private arestaW: Uint8Array;         // 1 = parede entre (x−1,y) e (x,y)

  constructor(l: Layout, resolve: ResolveTipo = resolvePadrao) {
    this.largura = l.largura; this.altura = l.altura;
    const n = l.largura * l.altura;
    this.bloq = new Uint8Array(n); this.arestaN = new Uint8Array(n); this.arestaW = new Uint8Array(n);
    for (let i = 0; i < n; i++) if (!l.piso[i]) this.bloq[i] = 1;
    for (const c of l.colisoes) if (dentro(l, c.x, c.y)) this.bloq[indice(l, c.x, c.y)] = 1;
    for (const o of l.objetos) {
      const t = resolve(o); if (!t || !t.solido) continue;
      const { w, d } = dimensoes(t, o.rot ?? 0);
      for (let dy = 0; dy < d; dy++) for (let dx = 0; dx < w; dx++) if (dentro(l, o.x + dx, o.y + dy)) this.bloq[indice(l, o.x + dx, o.y + dy)] = 1;
    }
    for (const p of l.paredes) {
      if (!dentro(l, p.x, p.y) || p.abertura === 'porta') continue;
      (p.lado === 'N' ? this.arestaN : this.arestaW)[indice(l, p.x, p.y)] = 1;
    }
  }

  livre(x: number, y: number): boolean { return x >= 0 && y >= 0 && x < this.largura && y < this.altura && this.bloq[y * this.largura + x] === 0; }
  bloquear(x: number, y: number): void { if (dentro(this, x, y)) this.bloq[y * this.largura + x] = 1; }

  /** Há parede na aresta entre duas células vizinhas ortogonais? */
  paredeEntre(x0: number, y0: number, x1: number, y1: number): boolean {
    if (x1 === x0 + 1 && y1 === y0) return Boolean(this.noIndice(this.arestaW, x1, y1));        // vizinho à direita: aresta W dele
    if (x1 === x0 - 1 && y1 === y0) return Boolean(this.noIndice(this.arestaW, x0, y0));
    if (y1 === y0 + 1 && x1 === x0) return Boolean(this.noIndice(this.arestaN, x1, y1));
    if (y1 === y0 - 1 && x1 === x0) return Boolean(this.noIndice(this.arestaN, x0, y0));
    return false;
  }
  private noIndice(a: Uint8Array, x: number, y: number): number { return dentro(this, x, y) ? a[y * this.largura + x] : 1; }

  /** Pode andar de (x0,y0) para a célula vizinha (x1,y1)? Diagonal só se os dois lados ortogonais estiverem livres (sem cortar quina). */
  passo(x0: number, y0: number, x1: number, y1: number): boolean {
    if (!this.livre(x1, y1)) return false;
    const dx = x1 - x0; const dy = y1 - y0;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1 || (dx === 0 && dy === 0)) return false;
    if (dx === 0 || dy === 0) return !this.paredeEntre(x0, y0, x1, y1);
    return this.passo(x0, y0, x0 + dx, y0) && this.passo(x0, y0, x0, y0 + dy) && this.passo(x0 + dx, y0, x1, y1) && this.passo(x0, y0 + dy, x1, y1);
  }
}
