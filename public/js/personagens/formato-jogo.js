// FORMATO DO JOGO: converte a folha de andar do LPC (9 quadros × 4 direções, 64 px) para a folha do jogo
// (4 passos × 4 direções: frente, direita, costas, esquerda). LPC: linhas 0=cima, 1=esquerda, 2=baixo, 3=direita;
// quadro 0 é a pose parada, 1 a 8 são o andar. Usamos 4 quadros do andar (1, 3, 5, 7).
const QUADRO = 64;
const PASSOS = [1, 3, 5, 7];
const LINHA_DO_JOGO = [2, 3, 0, 1]; // frente, direita, costas, esquerda

export function folhaParaJogo(origem) {
  const saida = new OffscreenCanvas(PASSOS.length * QUADRO, LINHA_DO_JOGO.length * QUADRO);
  const g = saida.getContext('2d');
  g.imageSmoothingEnabled = false;
  LINHA_DO_JOGO.forEach((linhaLpc, linhaJogo) => {
    PASSOS.forEach((quadroLpc, passo) => {
      g.drawImage(origem, quadroLpc * QUADRO, linhaLpc * QUADRO, QUADRO, QUADRO, passo * QUADRO, linhaJogo * QUADRO, QUADRO, QUADRO);
    });
  });
  return saida;
}

export const PASSOS_USADOS = PASSOS;
export const ORDEM_DIRECOES = ['frente', 'direita', 'costas', 'esquerda'];
