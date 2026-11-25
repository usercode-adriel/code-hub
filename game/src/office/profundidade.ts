// ORDENAÇÃO POR PROFUNDIDADE ISOMÉTRICA. Em 2:1, quem está "à frente" (mais perto da câmera) é desenhado depois.
// Somar x+y falha com objetos largos (uma pessoa na frente de uma mesa de 2 tiles). A regra correta usa caixas:
// A fica ATRÁS de B se A termina antes de B começar em x (A.x1 ≤ B.x0) ou em y (A.y1 ≤ B.y0). Só pares que se sobrepõem na tela importam.
// A ordem final vem de uma ordenação topológica; empates e ciclos raros caem na chave x+y.
export interface Corpo { x: number; y: number; largura?: number; profundidade?: number; camada?: number; z?: number }

/** Chave simples (maior = por cima). Serve de desempate e de plano B. */
export function chaveProfundidade(c: Corpo): number {
  const frente = (c.x + (c.largura ?? 0)) + (c.y + (c.profundidade ?? 0));
  return frente * 100 + (c.camada ?? 0) + (c.z ?? 0) * 0.01;
}
export function ordenarPorChave<T extends Corpo>(lista: T[]): T[] {
  return lista.map((c, i) => ({ c, i, k: chaveProfundidade(c) })).sort((a, b) => a.k - b.k || a.i - b.i).map((e) => e.c);
}

// camadas do escritório (índice = camada de renderização)
export const CAMADA = { fundo: 0, piso: 1, estrutura: 2, parede: 3, mobiliario: 4, objeto: 5, personagem: 6, efeito: 7, interativo: 8 } as const;

export interface CorpoIso { id: string; x0: number; y0: number; x1: number; y1: number; camada: number; tela: { l: number; t: number; r: number; b: number }; /** empurra o desempate: quem está sentado vai para a frente da própria cadeira */ vies?: number }

/** Caixa na grade [x, x+largura) × [y, y+profundidade) e o retângulo que ela ocupa na tela (altura em pixels). */
export function corpoIso(id: string, x: number, y: number, largura: number, profundidade: number, altura: number, camada: number): CorpoIso {
  return { id, x0: x, y0: y, x1: x + largura, y1: y + profundidade, camada, tela: { l: (x - (y + profundidade)) * 32, t: (x + y) * 16 - altura, r: (x + largura - y) * 32, b: (x + largura + y + profundidade) * 16 } };
}
const sobrepoe = (a: CorpoIso, b: CorpoIso): boolean => a.tela.l < b.tela.r && a.tela.r > b.tela.l && a.tela.t < b.tela.b && a.tela.b > b.tela.t;
const k = (c: CorpoIso): number => (c.x1 + c.y1) * 100 + c.camada + (c.vies ?? 0);

/** A deve ser desenhado antes de B? (null = indiferente) */
function antes(a: CorpoIso, b: CorpoIso): boolean | null {
  const chao = (c: CorpoIso): boolean => c.camada <= CAMADA.estrutura;
  if (chao(a) !== chao(b)) return chao(a);                    // chão e tapetes sempre por baixo
  const aAtras = a.x1 <= b.x0 || a.y1 <= b.y0; const bAtras = b.x1 <= a.x0 || b.y1 <= a.y0;
  if (aAtras && !bAtras) return true; if (bAtras && !aAtras) return false;
  return null;
}

/** Ordem de desenho (do fundo para a frente). */
export function ordenarIso(corpos: CorpoIso[]): CorpoIso[] {
  const n = corpos.length; const saida: number[][] = Array.from({ length: n }, () => []); const grau = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (!sobrepoe(corpos[i], corpos[j])) continue;
    const r = antes(corpos[i], corpos[j]);
    if (r === true) { saida[i].push(j); grau[j]++; } else if (r === false) { saida[j].push(i); grau[i]++; }
  }
  const prontos: number[] = []; for (let i = 0; i < n; i++) if (!grau[i]) prontos.push(i);
  const ordem: number[] = []; const feito = new Array<boolean>(n).fill(false);
  const menor = (): number => { let m = 0; for (let q = 1; q < prontos.length; q++) { const a = corpos[prontos[q]]; const b = corpos[prontos[m]]; if (k(a) < k(b) || (k(a) === k(b) && prontos[q] < prontos[m])) m = q; } return m; };
  for (;;) {
    while (prontos.length) { const idx = prontos.splice(menor(), 1)[0]; if (feito[idx]) continue; feito[idx] = true; ordem.push(idx); for (const j of saida[idx]) if (--grau[j] === 0) prontos.push(j); }
    if (ordem.length >= n) break;
    // ciclo ambíguo: libera o de menor chave entre os que sobraram
    let m = -1; for (let i = 0; i < n; i++) if (!feito[i] && (m < 0 || k(corpos[i]) < k(corpos[m]))) m = i;
    grau[m] = 0; prontos.push(m);
  }
  return ordem.map((i) => corpos[i]);
}
