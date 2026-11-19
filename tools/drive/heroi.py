# Recorta a folha do personagem do jogador (parado + caminhada nas 4 direções e corrida para os dois lados) e
# monta uma folha uniforme de 6 linhas × 7 colunas, com os pés alinhados na base de cada célula:
#   0 frente, 1 costas, 2 direita, 3 esquerda  → coluna 0 parado, colunas 1–4 caminhada
#   4 corrida direita, 5 corrida esquerda       → coluna 0 parado, colunas 1–5 corrida
# Saída: public/assets/rpg/chr/heroi.png e a entrada "heroi" em chr/meta.json e chrmeta.js.
import numpy as np, json, sys, os
from PIL import Image
from collections import deque
from scipy import ndimage

SRC = sys.argv[1] if len(sys.argv) > 1 else '/tmp/claude-0/-home-user-code-hub/ecd13ed2-02c5-5b53-9ec4-04b4e1b3ffd5/images/11.webp'
ROOT = os.path.join(os.path.dirname(__file__), '..', '..'); OUT = os.path.join(ROOT, 'public/assets/rpg/chr/')
BANDS = [(5, 200), (208, 405), (413, 612), (620, 820), (836, 1040), (1062, 1272)]
COUNT = [5, 5, 5, 5, 6, 6]
rgb = np.asarray(Image.open(SRC).convert('RGB')).astype(int)


def cut_out(c):
    H, W = c.shape[:2]; light = c.min(-1) > 196
    a = np.full((H, W), 255, np.uint8); seen = np.zeros((H, W), bool); q = deque()
    for x in range(W): q += [(x, 0), (x, H - 1)]
    for y in range(H): q += [(0, y), (W - 1, y)]
    while q:
        x, y = q.popleft()
        if x < 0 or y < 0 or x >= W or y >= H or seen[y, x] or not light[y, x]: continue
        seen[y, x] = True; a[y, x] = 0; q.extend([(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)])
    lab, n = ndimage.label(a > 0)
    if n > 1:
        sz = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1)); a[~np.isin(lab, [i + 1 for i, v in enumerate(sz) if v >= sz.max() * 0.15])] = 0
    ys, xs = np.nonzero(a)
    return np.dstack([c.astype(np.uint8), a])[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


frames = []
for (y0, y1), n in zip(BANDS, COUNT):
    sub = rgb[y0 + 40:y1 - 3, 164:1192]; m = sub.min(-1) <= 190
    prof = m.sum(0) > 4; runs = []; st = None
    for x, v in enumerate(list(prof) + [False]):
        if v and st is None: st = x
        if not v and st is not None:
            if x - st > 15: runs.append((st, x))
            st = None
    assert len(runs) == n, (y0, len(runs), runs)
    # a figura parada (1ª) fica fora da faixa do título: recorta pela altura inteira da linha
    frames.append([cut_out(rgb[y0 + 6:y1 - 3, 164 + max(0, a - 3):164 + b + 3] if i == 0 else sub[:, max(0, a - 3):b + 3]) for i, (a, b) in enumerate(runs)])
cw = max(f.shape[1] for r in frames for f in r) + 2; ch = max(f.shape[0] for r in frames for f in r) + 1
sheet = np.zeros((ch * 6, cw * 7, 4), np.uint8)
for r, row in enumerate(frames):
    for c, f in enumerate(row):
        h, w = f.shape[:2]; ox = c * cw + (cw - w) // 2; oy = r * ch + ch - h; sheet[oy:oy + h, ox:ox + w] = f
k = 60 / ch; cw2 = max(1, round(cw * k)); ch2 = 60
img = Image.fromarray(sheet).resize((cw2 * 7, ch2 * 6), Image.LANCZOS)
a = np.asarray(img).copy(); a[..., 3] = np.where(a[..., 3] > 110, 255, 0)
Image.fromarray(a).quantize(256, method=Image.Quantize.FASTOCTREE).save(OUT + 'heroi.png', optimize=True)
meta_p = OUT + 'meta.json'; meta = json.load(open(meta_p))
meta = {'heroi': {'name': 'Você (padrão)', 'role': 'jogador', 'w': cw2, 'h': ch2, 'layout': 'heroi'}, **{k2: v for k2, v in meta.items() if k2 != 'heroi'}}
json.dump(meta, open(meta_p, 'w'), ensure_ascii=False)
with open(os.path.join(ROOT, 'public/js/drive/chrmeta.js'), 'w') as fh:
    fh.write('// personagens animados (folhas 4×4: frente, direita, costas, esquerda; "heroi": 6×7 com parado e corrida) — gerado por tools/drive/chars.py e heroi.py\n')
    fh.write('export const CHR = ' + json.dumps(meta, ensure_ascii=False) + ';\n')
print('heroi', cw2, ch2, [len(r) for r in frames])
