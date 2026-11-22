// COMPOSIÇÃO DO PERSONAGEM (canvas): sobrepõe as camadas escolhidas numa folha de andar só (576×256, 9 quadros × 4 direções).
// A folha composta é guardada por personagem (uma imagem por personagem, em vez de uma por camada).
import { camadas } from './escolha.js';
import { folhaParaJogo } from './formato-jogo.js';

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

// folha no formato do jogo (4 passos × 4 direções, 256×256)
export async function comporFolhaJogo(escolha, base) {
  return folhaParaJogo(await comporFolha(escolha, base));
}

// ----- animações (prévia): cada peça tem a própria folha da animação; o quadro é montado camada por camada
const cacheImg = new Map();
async function imagemDe(url) {
  if (!cacheImg.has(url)) cacheImg.set(url, carregarPeca(url));
  return cacheImg.get(url);
}
// monta um quadro (64×64) da animação `anim` na linha `linha` e coluna `coluna` (formato da folha LPC)
export async function quadroAnimacao(escolha, anim, linha, coluna, base = '/assets/personagens/') {
  const out = new OffscreenCanvas(64, 64); const g = out.getContext('2d'); g.imageSmoothingEnabled = false;
  for (const rel of camadas(escolha)) {
    const pasta = rel.replace(/\/walk\.png$/, '');
    const im = await imagemDe(`${base}${pasta}/${anim}.png`);
    g.drawImage(im, coluna * 64, linha * 64, 64, 64, 0, 0, 64, 64);
  }
  return out;
}
