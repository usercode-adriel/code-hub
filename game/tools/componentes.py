import sys, json, numpy as np
from scipy import ndimage as ndi
from PIL import Image, ImageDraw
src = sys.argv[1]; nome = sys.argv[2]
im = Image.open(src).convert('RGBA'); a = np.array(im)[..., 3] > 0
a = ndi.binary_closing(a, iterations=2)
lab, n = ndi.label(a)
objs = ndi.find_objects(lab)
itens = []
for i, sl in enumerate(objs, 1):
    h = sl[0].stop - sl[0].start; w = sl[1].stop - sl[1].start
    if w * h < 900: continue
    itens.append({'i': i, 'x': sl[1].start, 'y': sl[0].start, 'w': w, 'h': h})
# ordena em linhas (tolerância vertical) e depois por x
itens.sort(key=lambda t: (round((t['y'] + t['h'] / 2) / 140), t['x']))
for k, t in enumerate(itens): t['n'] = k
prev = Image.new('RGBA', im.size, (60, 60, 90, 255)); prev.alpha_composite(im)
d = ImageDraw.Draw(prev)
for t in itens:
    d.rectangle([t['x'], t['y'], t['x'] + t['w'], t['y'] + t['h']], outline=(255, 255, 0, 255))
    d.rectangle([t['x'], t['y'], t['x'] + 34, t['y'] + 16], fill=(0, 0, 0, 255)); d.text((t['x'] + 2, t['y'] + 2), str(t['n']), fill=(255, 255, 0, 255))
prev.convert('RGB').save(f'{nome}-num.png')
json.dump(itens, open(f'{nome}-comps.json', 'w'))
print(nome, len(itens))
