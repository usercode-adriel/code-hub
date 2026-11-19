# Ferramentas da cidade 2D

Scripts usados para preparar os assets de `public/assets/drive` a partir das imagens originais (pixel art):

- `sprites.py` — recorta os veículos da folha de carros (sem os modelos com marcas reais) e gera as cores dos carros da concessionária.
- `mask.py` — desenha a máscara de ruas/calçadas a partir de `roads.json` sobre a imagem, para conferir o traçado.
- `inpaint.py` + `fill.py` — removem da imagem os carros "pintados" nas ruas (o trânsito agora é de verdade), copiando o asfalto vizinho no sentido da rua.

Os caminhos das imagens de origem estão no começo de cada script; ajuste antes de rodar. Requer Pillow, numpy e opencv-python-headless.
