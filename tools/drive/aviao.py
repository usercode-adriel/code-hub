# Recorta a folha "Aviação — variações & danificados": cada aeronave (vista de cima, nariz para cima) e a sua
# versão danificada (queimada, com fumaça). Os helicópteros sem versão danificada na folha ganham uma gerada
# (escurecida com marcas de queimado). Gera public/assets/rpg/air/<chave>.png e <chave>-dmg.png, atualiza
# public/assets/rpg/meta.json e cria a arte da loja em public/assets/items/air-<chave>.png.
# O cargueiro camuflado da folha já vem pegando fogo (sem versão inteira): não entra.
import numpy as np, json, sys, os
from PIL import Image, ImageEnhance
from collections import deque
from scipy import ndimage

SRC = sys.argv[1] if len(sys.argv) > 1 else '/root/.claude/uploads/ecd13ed2-02c5-5b53-9ec4-04b4e1b3ffd5/42d8dc79-image.jpg'
ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
AIR = os.path.join(ROOT, 'public/assets/rpg/air/'); ITEMS = os.path.join(ROOT, 'public/assets/items/')
# chave: (retângulo inteiro, retângulo danificado ou None)
R = {
    'av-airliner': ((13, 145, 233, 341), (14, 430, 200, 601)),
    'av-jato-vermelho': ((237, 138, 347, 308), (192, 452, 280, 588)),
    'av-caca-cinza': ((349, 152, 470, 338), (288, 454, 373, 590)),
    'av-caca-verde': ((496, 157, 593, 344), (387, 446, 462, 598)),
    'av-mono-branco': ((574, 128, 697, 240), (461, 486, 578, 576)),
    'av-biplano': ((634, 241, 791, 349), (592, 470, 714, 567)),
    'av-mono-azul': ((752, 144, 909, 259), (728, 473, 856, 571)),
    'av-executivo': ((871, 173, 1040, 351), (858, 450, 995, 588)),
    'av-heli-policia': ((17, 668, 147, 826), (942, 663, 1046, 821)),
    'av-heli-resgate': ((163, 671, 283, 827), (1057, 681, 1152, 824)),
    'av-heli-verde': ((297, 661, 428, 825), (1163, 659, 1255, 825)),
    'av-heli-amarelo': ((448, 657, 579, 828), None),
    'av-heli-preto': ((598, 660, 732, 816), None),
    'av-heli-azul': ((748, 652, 896, 827), None),
}


def knock(c, thr=42):
    a = np.asarray(c.convert('RGBA')).copy(); H, W = a.shape[:2]
    dark = a[..., :3].astype(int).max(-1) < thr
    seen = np.zeros((H, W), bool); q = deque()
    for x in range(W): q.append((x, 0)); q.append((x, H - 1))
    for y in range(H): q.append((0, y)); q.append((W - 1, y))
    while q:
        x, y = q.popleft()
        if x < 0 or y < 0 or x >= W or y >= H or seen[y, x] or not dark[y, x]: continue
        seen[y, x] = True; a[y, x, 3] = 0
        q.extend([(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)])
    lab, n = ndimage.label(a[..., 3] > 0)
    sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1)); big = sizes.max()
    keep = np.isin(lab, [i + 1 for i, v in enumerate(sizes) if v >= big * 0.1])
    a[~keep, 3] = 0
    ys, xs = np.nonzero(a[..., 3])
    return Image.fromarray(a).crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))


def scorched(im):
    # versão danificada gerada: escurece, puxa para o marrom e espalha marcas de queimado
    a = np.asarray(im).astype(float).copy(); H, W = a.shape[:2]
    a[..., :3] = a[..., :3] * 0.62 + np.array([28, 14, 6]) * 0.38
    rng = np.random.default_rng(7)
    for _ in range(9):
        cx, cy, r = rng.integers(W * 0.2, W * 0.8), rng.integers(H * 0.2, H * 0.85), rng.integers(4, max(6, W // 8))
        yy, xx = np.ogrid[:H, :W]; m = ((xx - cx) ** 2 + (yy - cy) ** 2) < r * r
        a[m, :3] *= 0.35
    return Image.fromarray(a.clip(0, 255).astype(np.uint8))


sheet = Image.open(SRC).convert('RGB')
meta_p = os.path.join(ROOT, 'public/assets/rpg/meta.json'); meta = json.load(open(meta_p))
for k, (r1, r2) in R.items():
    thr = {'av-heli-preto': 16, 'av-heli-verde': 22, 'av-caca-cinza': 30}.get(k, 42)
    im = knock(sheet.crop(r1), thr); im.save(AIR + k + '.png', optimize=True); meta['air/' + k] = [im.width, im.height]
    dm = knock(sheet.crop(r2), thr) if r2 else scorched(im)
    dm.save(AIR + k + '-dmg.png', optimize=True); meta['air/' + k + '-dmg'] = [dm.width, dm.height]
    # arte da loja: 96×96, centralizada, deitada como num cartão (nariz para cima)
    card = Image.new('RGBA', (96, 96), (0, 0, 0, 0)); t = im.copy(); t.thumbnail((88, 88), Image.LANCZOS)
    card.paste(t, ((96 - t.width) // 2, (96 - t.height) // 2), t); card.save(ITEMS + 'aero-' + k[3:] + '.png', optimize=True)
json.dump(meta, open(meta_p, 'w'))
print(len(R), 'aeronaves')
