// COMPOSIÇÃO DO PERSONAGEM (canvas): sobrepõe as camadas escolhidas numa folha de andar só (576×256, 9 quadros × 4 direções).
// A folha composta é guardada por personagem (uma imagem por personagem, em vez de uma por camada).
import { camadas } from './escolha.js';

export async function carregarPeca(url) {
  const r = await fetch(url); if (!r.ok) throw new Error(`peça não encontrada: ${url}`);
  return createImageBitmap(await r.blob());
}

// monta a folha: escolha = {corpo, cabelo, ...} com os caminhos relativos a /assets/personagens/
export async function comporFolha(escolha, base = '/assets/personagens/') {
  const lista = camadas(escolha);
  const imagens = await Promise.all(lista.map((rel) => carregarPeca(base + rel)));
  const w = imagens[0].width; const h = imagens[0].height;
  const tela = new OffscreenCanvas(w, h); const g = tela.getContext('2d');
  g.imageSmoothingEnabled = false;
  for (const im of imagens) { if (im.width !== w || im.height !== h) throw new Error('camadas com tamanhos diferentes'); g.drawImage(im, 0, 0); }
  return tela;
}
