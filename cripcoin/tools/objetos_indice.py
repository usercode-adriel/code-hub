# Detecta as peças da folha de objetos (fundo bege liso) e gera uma folha numerada para conferência. Uso: python3 cripcoin/tools/objetos_indice.py
import numpy as np, json, os
from scipy import ndimage as ndi
from PIL import Image, ImageDraw
R = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
im = Image.open(os.path.join(R, 'assets-fonte', 'objetos.png')).convert('RGB'); a = np.array(im).astype(int)
bg = (np.abs(a - np.array([239, 236, 229])).max(2) <= 7); fg = ~bg
fg = ndi.binary_opening(fg, iterations=1)
lab, n = ndi.label(ndi.binary_closing(fg, iterations=3), structure=np.ones((3, 3)))
itens = []
for sl in ndi.find_objects(lab):
    h = sl[0].stop - sl[0].start; w = sl[1].stop - sl[1].start
    if h * w < 900: continue
    itens.append((sl[1].start, sl[0].start, w, h))
itens.sort(key=lambda t: (round((t[1] + t[3] / 2) / 215), t[0]))
json.dump(itens, open('/tmp/objetos_caixas.json', 'w'))
print(len(itens))
W = 1800; x = y = 6; lin = 0; sheet = Image.new('RGB', (W, 2600), (60, 60, 90)); d = ImageDraw.Draw(sheet)
for k, (bx, by, w, h) in enumerate(itens):
    t = im.crop((bx, by, bx + w, by + h)); s = min(1.0, 90 / max(w, h)); t = t.resize((max(1, int(w * s)), max(1, int(h * s))), Image.LANCZOS)
    if x + 100 > W: x = 6; y += lin + 18; lin = 0
    sheet.paste(t, (x, y + 12)); d.text((x, y), str(k), fill=(255, 255, 0)); x += 100; lin = max(lin, t.height + 12)
sheet.crop((0, 0, W, y + lin + 20)).save('/tmp/objetos_indice.png'); print(y + lin)
