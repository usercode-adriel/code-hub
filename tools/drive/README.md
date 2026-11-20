# Ferramentas da cidade 2D

Scripts usados para preparar os assets de `public/assets/drive` a partir das imagens originais (pixel art):

- `sprites.py` — recorta os veículos da folha de carros (sem os modelos com marcas reais) e gera as cores dos carros da concessionária.
- `mask.py` — desenha a máscara de ruas/calçadas a partir de `roads.json` sobre a imagem, para conferir o traçado.
- `inpaint.py` + `fill.py` — removem da imagem os carros "pintados" nas ruas (o trânsito agora é de verdade), copiando o asfalto vizinho no sentido da rua.

Os caminhos das imagens de origem estão no começo de cada script; ajuste antes de rodar. Requer Pillow, numpy e opencv-python-headless.
- `chars2.py` — personagens do mapa a partir das folhas em `src/personagens` (vistas paradas): tira o fundo, separa as figuras, reduz para 48 px e gera a caminhada (4 direções × 4 passos) em `public/assets/rpg/chr`, além de `public/js/drive/chrmeta.js`. Requer Pillow, numpy e scipy.
- `prisao.py` — peças do sistema prisional (cela, delegacia, cone da blitz) recortadas de `src/personagens/prisao.webp` para `public/assets/rpg/prisao`.
