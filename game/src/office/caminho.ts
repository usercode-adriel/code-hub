// A* NA GRADE LÓGICA, com 8 vizinhos, sem cortar quinas e respeitando paredes. Devolve as células do caminho (sem a de partida).
import type { Grade } from './grade';

export interface Celula { x: number; y: number }

class Heap {
  private a: { k: number; f: number; i: number }[] = [];
  get tamanho(): number { return this.a.length; }
  push(k: number, f: number, i: number): void { const a = this.a; a.push({ k, f, i }); let n = a.length - 1; while (n > 0) { const p = (n - 1) >> 1; if (this.menor(n, p)) { [a[n], a[p]] = [a[p], a[n]]; n = p; } else break; } }
  pop(): number {
    const a = this.a; const topo = a[0].k; const ult = a.pop()!;
    if (a.length) { a[0] = ult; let n = 0; for (;;) { const l = 2 * n + 1; const r = l + 1; let m = n; if (l < a.length && this.menor(l, m)) m = l; if (r < a.length && this.menor(r, m)) m = r; if (m === n) break; [a[n], a[m]] = [a[m], a[n]]; n = m; } }
    return topo;
  }
  private menor(x: number, y: number): boolean { const a = this.a; return a[x].f < a[y].f || (a[x].f === a[y].f && a[x].i > a[y].i); }
}

const VIZ: [number, number, number][] = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
const octil = (dx: number, dy: number): number => { const a = Math.abs(dx); const b = Math.abs(dy); return Math.max(a, b) + (Math.SQRT2 - 1) * Math.min(a, b); };

/** Caminho de `de` até `para`. Se `para` não for livre e `aproximar` for verdadeiro, vai até a célula livre mais próxima. null = sem caminho. */
export function acharCaminho(g: Grade, de: Celula, para: Celula, { aproximar = false, limite = g.largura * g.altura } = {}): Celula[] | null {
  if (!g.livre(de.x, de.y) && !(de.x === para.x && de.y === para.y)) { /* partindo de célula bloqueada (ex.: cadeira sólida): ainda tentamos sair */ }
  let alvo = para;
  if (!g.livre(alvo.x, alvo.y)) { if (!aproximar) return null; const a = livreMaisProxima(g, para); if (!a) return null; alvo = a; }
  if (de.x === alvo.x && de.y === alvo.y) return [];
  const W = g.largura; const n = W * g.altura;
  const custo = new Float64Array(n).fill(Infinity); const pai = new Int32Array(n).fill(-1); const fechado = new Uint8Array(n);
  const ini = de.y * W + de.x; const fim = alvo.y * W + alvo.x;
  custo[ini] = 0; const h = new Heap(); let ordem = 0; h.push(ini, octil(alvo.x - de.x, alvo.y - de.y), ordem++);
  let visitados = 0;
  while (h.tamanho && visitados++ < limite * 2) {
    const k = h.pop(); if (fechado[k]) continue; fechado[k] = 1;
    if (k === fim) { const rota: Celula[] = []; for (let c = fim; c !== ini; c = pai[c]) rota.push({ x: c % W, y: Math.floor(c / W) }); return rota.reverse(); }
    const x = k % W; const y = Math.floor(k / W);
    for (const [dx, dy, c] of VIZ) {
      const nx = x + dx; const ny = y + dy;
      if (!g.passo(x, y, nx, ny)) continue;
      const j = ny * W + nx; const novo = custo[k] + c;
      if (novo < custo[j]) { custo[j] = novo; pai[j] = k; h.push(j, novo + octil(alvo.x - nx, alvo.y - ny), ordem++); }
    }
  }
  return null;
}

/** Célula livre mais próxima de `p` (busca em anéis crescentes). */
export function livreMaisProxima(g: Grade, p: Celula, raioMax = 12): Celula | null {
  for (let r = 0; r <= raioMax; r++) {
    let melhor: Celula | null = null; let md = Infinity;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = p.x + dx; const y = p.y + dy;
      if (g.livre(x, y) && dx * dx + dy * dy < md) { md = dx * dx + dy * dy; melhor = { x, y }; }
    }
    if (melhor) return melhor;
  }
  return null;
}
