"""Gera a arte de inventário (96×96) de cada veículo a partir do sprite novo: carro deitado, centralizado."""
import re
from PIL import Image
src = open('server/world/vehicles.js').read()
pares = re.findall(r"'((?:car|rent)-[a-z0-9-]+)': \{[^\n]*?sprite: '([a-z0-9-]+)'", src)
for chave, spr in pares:
    im = Image.open(f'public/assets/mundo/veiculos/{spr}.png').rotate(90, expand=True)  # frente para a direita
    s = min(88 / im.width, 88 / im.height); im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.NEAREST)
    out = Image.new('RGBA', (96, 96), (0, 0, 0, 0)); out.alpha_composite(im, ((96 - im.width) // 2, (96 - im.height) // 2))
    out.save(f'public/assets/items/{chave}.png')
print('arte de itens:', len(pares))
