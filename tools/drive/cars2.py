# Recorta os carros "City Cars" (10 veículos: civis, táxi, polícia, ambulância) e o esportivo vermelho da locadora,
# tira o fundo branco e a sombra cinza, reduz para o tamanho dos sprites de carro do mapa (nariz para cima) com
# paleta curta (cara de pixel art) e gera a versão danificada (amassado, queimado). Atualiza assets/rpg/meta.json.
import numpy as np, json, sys, os
from PIL import Image
from collections import deque
from scipy import ndimage

SRC = sys.argv[1] if len(sys.argv) > 1 else '/tmp/claude-0/-home-user-code-hub/ecd13ed2-02c5-5b53-9ec4-04b4e1b3ffd5/images/'
ROOT = os.path.join(os.path.dirname(__file__), '..', '..'); OUT = os.path.join(ROOT, 'public/assets/rpg/cars/')
R = {'13.jpg': {'city-vermelho': (27, 28, 134, 243), 'city-van': (147, 28, 252, 265), 'city-suv': (262, 28, 368, 245), 'city-picape': (380, 28, 490, 266), 'city-taxi': (498, 26, 610, 244),
                'city-ambulancia': (26, 278, 136, 512), 'city-verde': (145, 324, 252, 478), 'city-policia': (262, 288, 372, 506), 'city-roxo': (382, 302, 490, 496), 'city-azul': (498, 292, 610, 512)},
     '12.jpg': {'aluguel-vermelho': (120, 50, 616, 1004)}}


def cut(c, body=None):
    a = np.asarray(c.convert('RGB')).astype(int); H, W = a.shape[:2]
    mx = a.max(-1); mn = a.min(-1); bg = (mn > 247) | ((mn > 150) & (mn < 222) & (mx - mn < 30))  # branco puro e sombra cinza (carroceria branca fica)
    al = np.full((H, W), 255, np.uint8); seen = np.zeros((H, W), bool); q = deque()
    for x in range(W): q += [(x, 0), (x, H - 1)]
    for y in range(H): q += [(0, y), (W - 1, y)]
    while q:
        x, y = q.popleft()
        if x < 0 or y < 0 or x >= W or y >= H or seen[y, x] or not bg[y, x]: continue
        seen[y, x] = True; al[y, x] = 0; q.extend([(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)])
    lab, n = ndimage.label(al > 0); sz = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1)); al[~np.isin(lab, [i + 1 for i, v in enumerate(sz) if v >= sz.max() * 0.08])] = 0
    al = ndimage.binary_closing(al > 0, iterations=4)  # junta cabine e baú (ambulância)
    if body:  # carroceria branca sem contorno (ambulância): retângulo arredondado da carroceria
        x0, y0, x1, y1, rr = body; yy, xx = np.mgrid[:H, :W]
        dx = np.maximum(0, np.maximum(x0 + rr - xx, xx - (x1 - rr))); dy = np.maximum(0, np.maximum(y0 + rr - yy, yy - (y1 - rr)))
        al = al | ((xx >= x0) & (xx <= x1) & (yy >= y0) & (yy <= y1) & (dx * dx + dy * dy <= rr * rr))
    al = ndimage.binary_erosion(ndimage.binary_fill_holes(al), iterations=2).astype(np.uint8) * 255  # tira a franja clara da borda
    ys, xs = np.nonzero(al); out = np.dstack([a.astype(np.uint8), al])[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    return Image.fromarray(out)


def pixelize(im, W=56):
    h = round(im.height * W / im.width); sm = im.resize((W, h), Image.LANCZOS)
    a = np.asarray(sm).copy(); a[..., 3] = np.where(a[..., 3] > 120, 255, 0); sm = Image.fromarray(a)
    rgb = sm.convert('RGB').quantize(40, method=Image.Quantize.MEDIANCUT).convert('RGB'); out = rgb.convert('RGBA'); out.putalpha(sm.getchannel('A'))
    return out.resize((W * 2, h * 2), Image.NEAREST)  # 2× para nitidez ao girar


def damaged(im, seed):
    a = np.asarray(im).astype(float).copy(); H, W = a.shape[:2]; rng = np.random.default_rng(seed)
    a[..., :3] = a[..., :3] * 0.72 + np.array([40, 30, 25]) * 0.28
    yy, xx = np.ogrid[:H, :W]
    for _ in range(5):  # marcas de amassado/queimado, suaves
        cx, cy, r = rng.integers(W * 0.2, W * 0.8), rng.integers(H * 0.05, H * 0.45), rng.integers(3, max(5, W // 11))
        m = ((xx - cx) ** 2 + (yy - cy) ** 2) < r * r; a[m, :3] = a[m, :3] * 0.5 + np.array([30, 22, 18]) * 0.5
    # para-choque dianteiro amassado: some uma lasca do bico
    a[: int(H * 0.06), int(W * 0.55):, 3] = 0
    for _ in range(5):  # rachaduras claras no vidro
        x0, y0 = rng.integers(W * 0.3, W * 0.7), rng.integers(H * 0.2, H * 0.35)
        for t in range(10): x, y = x0 + t * rng.choice([-1, 1]), y0 + t
        a[y0:y0 + 10, x0:x0 + 1, :3] = 200
    return Image.fromarray(a.clip(0, 255).astype(np.uint8))


meta_p = os.path.join(ROOT, 'public/assets/rpg/meta.json'); meta = json.load(open(meta_p))
for f, items in R.items():
    sheet = Image.open(SRC + f)
    for i, (k, box) in enumerate(items.items()):
        body = (36 - box[0], 278 - box[1], 122 - box[0], 512 - box[1], 14) if k == 'city-ambulancia' else None
        im = pixelize(cut(sheet.crop(box), body), 60 if k == 'aluguel-vermelho' else 56)
        im.save(OUT + k + '.png', optimize=True); meta['cars/' + k] = [im.width, im.height]
        dm = damaged(im, i + 3); dm.save(OUT + k + '-dmg.png', optimize=True); meta['cars/' + k + '-dmg'] = [dm.width, dm.height]
json.dump(meta, open(meta_p, 'w'))
print('ok', sum(len(v) for v in R.values()))
