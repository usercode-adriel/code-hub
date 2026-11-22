// ESCOLHA DE PERSONAGEM (lógica pura, sem canvas): sorteio reproduzível por semente e ordem das camadas.
// Cada personagem é um registro pequeno: {corpo, roupa-cima, roupa-baixo, calcado, cabelo, chapeu, semente}.

// ordem de desenho (de baixo para cima): corpo, roupas, calçado, cabelo e por último o chapéu
export const ORDEM = ['corpo', 'roupa-baixo', 'roupa-cima', 'calcado', 'cabelo', 'chapeu'];

// gerador pequeno e reproduzível (mulberry32): mesma semente, mesmo personagem
export function aleatorio(semente) {
  let a = semente >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// sorteia uma peça por categoria; chapéu é opcional (1 em 3) e não exige cabelo específico
export function sortear(catalogo, semente) {
  const r = aleatorio(semente);
  const escolha = { semente };
  for (const cat of ORDEM) {
    const pecas = catalogo[cat] || [];
    if (!pecas.length) { escolha[cat] = null; continue; }
    if (cat === 'chapeu' && r() < 2 / 3) { escolha[cat] = null; continue; }
    escolha[cat] = pecas[Math.floor(r() * pecas.length)].arquivo;
  }
  return escolha;
}

// lista de camadas na ordem de desenho, sem as categorias vazias
export function camadas(escolha) {
  return ORDEM.filter((cat) => escolha[cat]).map((cat) => escolha[cat]);
}
