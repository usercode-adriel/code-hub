"""Recorta o avião (fundo preto) para public/assets/mundo/aeronaves/aviao.png. Uso: python3 tools/mundo/recortar_aviao.py <imagem> <pasta>"""
import sys, os, json
import numpy as np
from PIL import Image
from scipy import ndimage
im = Image.open(sys.argv[1]).convert('RGB'); a = np.asarray(im).astype(int)
fundo = a.max(axis=2) < 28
lab, _ = ndimage.label(fundo); b = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
bg = np.isin(lab, b[b > 0])
fg = ndimage.binary_opening(~bg, iterations=1); pl, pn = ndimage.label(fg); ar = ndimage.sum(fg, pl, range(1, pn + 1))
fg = pl == (int(np.argmax(ar)) + 1)
spr = Image.fromarray(np.dstack([np.asarray(im), np.where(fg, 255, 0).astype(np.uint8)]), 'RGBA')
spr = spr.crop(spr.getchannel('A').getbbox())
os.makedirs(sys.argv[2], exist_ok=True); spr.save(f'{sys.argv[2]}/aviao.png')
json.dump({'aeronaves/aviao': [spr.width, spr.height]}, open(f'{sys.argv[2]}/meta.json', 'w'))
print('aviao', spr.size)
