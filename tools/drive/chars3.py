"""Personagens animados (versão 3): uma folha desenhada por personagem em tools/drive/src/personagens/anim-<chave>.webp.

Formato das folhas (fundo preto):
  - em cima, 4 linhas × 19 quadros de movimento: frente, lado, lado, costas (algumas folhas repetem a frente na
    4ª linha). Colunas usadas: 0 parado, 1-2 passos, 12 braço levantado (irritado), 16-18 corrida;
  - embaixo, as reações na ordem da folha de referência: atropelado (7) + baleado, caído + ferido grave,
    morto deitado + morto sentado, morto de pé + com sangramento, reação de dor + quase morte.
Saída (public/assets/rpg/chr): <chave>.png (linhas: frente, direita, costas, esquerda × 4 passos; corrida direita
e esquerda × 4; extra: parado, irritado) e <chave>-rx.png (uma linha por reação, quadros de RXW×RXH com os pés na
mesma linha de base, mantendo a altura do corpo no ar). Também gera public/js/drive/chrmeta.js.
Uso: python3 tools/drive/chars3.py   (Pillow, numpy, scipy)
"""
import json, os
import numpy as np
from PIL import Image
from scipy import ndimage as nd

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'src', 'personagens')
OUT = os.path.join(ROOT, '..', '..', 'public', 'assets', 'rpg', 'chr')
H = 48; STAND = 45; RXW, RXH, RXB = 64, 56, 54  # altura do quadro, do personagem em pé; célula e linha de base das reações
CHARS = [  # chave, nome, papel, gênero
    ('barbudo', 'Barbudo de camisa polo', 'civil', 'm'),
    ('policial', 'Policial', 'policia', 'm'),
    ('policial2', 'Policial (f)', 'policia', 'f'),
    ('enfermeira', 'Enfermeira', 'saude', 'f'),
    ('executiva', 'Executiva', 'executivo', 'f'),
    ('vestido-azul', 'Ruiva de vestido azul', 'civil', 'f'),
    ('vestido-vinho', 'Moça de vestido vinho', 'civil', 'f'),
    ('moca-preto', 'Moça de roupa preta', 'civil', 'f'),
    ('regata-vermelha', 'Moça de regata vermelha', 'comercio', 'f'),
    ('plus-rabo', 'Moça de rabo de cavalo', 'civil', 'f'),
    ('regata-branca', 'Estudante de regata branca', 'estudante', 'f'),
]
# reações: (nome, linha embaixo, lado) — atropelado/baleado dividem a 1ª linha (7 quadros + o resto)
BACK = {'policial', 'moca-preto', 'regata-vermelha', 'plus-rabo'}  # folhas com a 4ª linha de costas (conferido a olho)
FLIP = set()  # folhas cuja linha de lado olha para a esquerda (conferido a olho)
RX_ORDER = ['atropelado', 'baleado', 'caido', 'ferido', 'morto', 'morto-sentado', 'morto-de-pe', 'sangramento', 'dor', 'quase-morte']
RX_ROWS = [('atropelado', 'baleado'), ('caido', 'ferido'), ('morto', 'morto-sentado'), ('morto-de-pe', 'sangramento'), ('dor', 'quase-morte')]


def load(key):
    a = np.array(Image.open(os.path.join(SRC, f'anim-{key}.webp')).convert('RGB'))
    dark = a.max(2) <= 12
    lab, _ = nd.label(dark); border = set(np.unique(np.r_[lab[0], lab[-1], lab[:, 0], lab[:, -1]])) - {0}
    fg = ~np.isin(lab, list(border))
    holes = nd.binary_fill_holes(fg) & ~fg; hl, hn = nd.label(holes)  # buracos pequenos (roupa preta) voltam a ser figura
    if hn: sz = nd.sum(holes, hl, range(1, hn + 1)); fg |= np.isin(hl, [i + 1 for i, z in enumerate(sz) if z < 40])
    fg = nd.binary_opening(fg, iterations=1)
    return a, fg


def runs(prof, gap):
    on = prof > 0; out = []; i = 0; n = len(on)
    while i < n:
        if on[i]:
            j = i
            while j < n and (on[j] or on[j:j + gap].any()): j += 1
            out.append((i, j)); i = j
        else: i += 1
    return out


def top_cells(a, fg):
    """4 linhas de cima × 19 colunas: [(y0, y1, [(x0, x1) × 19])]. As linhas vêm da 1ª coluna (figuras paradas,
    sempre separadas); cada linha vai do meio do vão anterior ao meio do próximo."""
    bands = [r for r in runs(fg[:, :90].sum(1), 2) if r[1] - r[0] > 25]
    out = []
    for i in range(4):
        y0 = 0 if i == 0 else (bands[i - 1][1] + bands[i][0]) // 2; y1 = (bands[i][1] + bands[i + 1][0]) // 2
        prof = fg[y0:y1].sum(0); cols = [c for c in runs(prof, 2) if c[1] - c[0] > 6]
        while len(cols) < 19:  # quadros encostados: divide o mais largo no ponto mais vazio
            w = [c[1] - c[0] for c in cols]; j = int(np.argmax(w)); x0, x1 = cols[j]; q = (x1 - x0) // 4
            mid = x0 + q + int(np.argmin(prof[x0 + q:x1 - q])); cols[j:j + 1] = [(x0, mid), (mid, x1)]
        out.append((y0, y1, cols[:19]))
    return out, (bands[3][1] + bands[4][0]) // 2


def crop(a, fg, y0, y1, x0, x1):
    m = fg[y0:y1, x0:x1]; ys, xs = np.nonzero(m)
    if not len(ys): return None
    sl = (slice(ys.min() + y0, ys.max() + y0 + 1), slice(xs.min() + x0, xs.max() + x0 + 1))
    img = np.dstack([a[sl], np.where(fg[sl], 255, 0).astype(np.uint8)]); return img, ys.max() + y0 + 1


def bottom_seqs(a, fg, ystart):
    """reações: blobs (com os respingos) agrupados em linhas pela base e ordenados por x."""
    sub = fg[ystart:]
    grown = nd.binary_dilation(sub, structure=np.ones((3, 13), bool))
    lab, n = nd.label(grown); objs = nd.find_objects(lab); B = []
    for i, s in enumerate(objs):
        m = (lab[s] == i + 1) & sub[s]
        if m.sum() < 400 or s[0].stop - s[0].start < 22: continue
        img = np.dstack([a[ystart:][s], np.where(m, 255, 0).astype(np.uint8)])
        B.append({'x': s[1].start, 'xc': (s[1].start + s[1].stop) / 2, 'bot': s[0].stop + ystart, 'img': img})
    B.sort(key=lambda b: b['bot']); rows = []
    for b in B:
        if rows and b['bot'] - rows[-1][-1]['bot'] < 45: rows[-1].append(b)
        else: rows.append([b])
    if len(rows) != 5: raise SystemExit(f'esperava 5 linhas de reações, achei {len(rows)}')
    seq = {}
    for r, (left, right) in enumerate(RX_ROWS):
        row = sorted(rows[r], key=lambda b: b['x'])
        if r == 0: L, R = row[:7], row[7:]
        else: L = [b for b in row if b['xc'] < 745]; R = [b for b in row if b['xc'] >= 745]
        seq[left], seq[right] = L, R
    return seq


def skin_side(img):
    """+1 se o rosto está do lado direito da cabeça (olha para a direita)."""
    al = img[..., 3] > 0; h = img.shape[0]; head = img[: int(h * 0.25)].astype(int)
    r, g, b = head[..., 0], head[..., 1], head[..., 2]
    sk = (head[..., 3] > 0) & (r > g) & (g > b) & (r - b > 30) & (r > 120)
    ys, xs = np.nonzero(al[: int(h * 0.25)]); sy, sx = np.nonzero(sk)
    if len(sx) < 6: return 0, 0
    return (1 if sx.mean() >= xs.mean() else -1), len(sx) / max(1, len(xs))


def shrink(img, k):
    a = img.astype(np.float32); al = a[..., 3:4] / 255.0; pre = np.concatenate([a[..., :3] * al, al * 255], 2)
    h, w = img.shape[:2]; nh, nw = max(1, round(h * k)), max(1, round(w * k))
    p = np.array(Image.fromarray(pre.clip(0, 255).astype(np.uint8), 'RGBA').resize((nw, nh), Image.BOX)).astype(np.float32)
    A = p[..., 3:4]; rgb = np.where(A > 0, p[..., :3] * 255.0 / np.maximum(A, 1), 0)
    return np.concatenate([rgb, np.where(A > 110, 255, 0)], 2).clip(0, 255).astype(np.uint8)


def put(sheet, f, cx, base, x0, y0, cw, chh):
    """cola o quadro f com o centro em cx e os pés na linha base (dentro da célula)."""
    fh, fw = f.shape[:2]; X = x0 + int(round(cx - fw / 2)); Y = y0 + base - fh
    xa, ya = max(x0, X), max(y0, Y); xb, yb = min(x0 + cw, X + fw), min(y0 + chh, Y + fh)
    if xb <= xa or yb <= ya: return
    part = f[ya - Y:yb - Y, xa - X:xb - X]; m = part[..., 3] > 0
    sheet[ya:yb, xa:xb][m] = part[m]


def build(key):
    a, fg = load(key)
    T, ys = top_cells(a, fg)
    cell = lambda r, c: crop(a, fg, T[r][0], T[r][1], *T[r][2][c])
    front = cell(0, 0); k = STAND / front[0].shape[0]
    back_row = 3 if key in BACK else None  # 4ª linha de costas (nas outras folhas ela repete a frente)
    full = lambda r, c: (cell(r, c) or cell(r, 0))[0]
    px0 = (front[0][..., 3] > 0).sum()
    def side(r, c):
        """quadro de lado virado para a direita (as duas linhas de lado da folha olham para o mesmo lado)."""
        img = full(r, c)
        if (img[..., 3] > 0).sum() < 0.5 * px0: img = full(r, 0)  # quadro cortado: usa o parado
        return img[:, ::-1] if key in FLIP else img
    def row(imgs, mirror=False): return [shrink(i, k)[:, ::-1] if mirror else shrink(i, k) for i in imgs]
    walk = [0, 1, 0, 2]; run = [16, 17, 18, 17]
    R = [side(1, c) for c in walk]
    # corrida: os dois quadros mais largos entre as colunas 13-18 (saltos) intercalados com o mais estreito;
    # cada salto é virado para onde a cabeça aponta (a cabeça vai à frente do corpo)
    cand = [(c, full(1, c)) for c in range(13, 19)]; cand = [t for t in cand if (t[1][..., 3] > 0).sum() > 0.6 * px0]
    leaps = sorted(cand, key=lambda t: -t[1].shape[1] / t[1].shape[0])[:2]; mid = min(cand, key=lambda t: t[1].shape[1] / t[1].shape[0])[1]
    def ahead(img):
        al = img[..., 3] > 0; h = img.shape[0]; ys, xs = np.nonzero(al); hy, hx = np.nonzero(al[: h // 4])
        return img if hx.mean() >= xs.mean() else img[:, ::-1]
    RR = [ahead(leaps[0][1]), side(1, 0), ahead(leaps[-1][1]), side(1, 0)]
    rows = [row([full(0, c) for c in walk]), row(R), row([full(back_row if back_row is not None else 0, c) for c in walk]),
            row(R, True), row(RR), row(RR, True), row([full(0, c) for c in [0, 12, 0, 0]])]
    W = min(48, max(f.shape[1] for row in rows for f in row) + 2)
    sheet = np.zeros((H * len(rows), W * 4, 4), np.uint8)
    for r, row in enumerate(rows):
        for c, f in enumerate(row): put(sheet, f, W / 2, H - 1, c * W, r * H, W, H)
    # reações
    seq = bottom_seqs(a, fg, ys); counts = {}
    rx = np.zeros((RXH * len(RX_ORDER), RXW * 7, 4), np.uint8)
    for r, name in enumerate(RX_ORDER):
        fr = seq[name][:7]; counts[name] = len(fr)
        base = max(b['bot'] for b in fr) if name == 'morto' else fr[0]['bot']
        for c, b in enumerate(fr):
            f = shrink(b['img'], k); lift = int(round((base - b['bot']) * k))
            put(rx, f, RXW / 2, RXB - lift, c * RXW, r * RXH, RXW, RXH)
    Image.fromarray(sheet, 'RGBA').save(os.path.join(OUT, key + '.png'), optimize=True)
    Image.fromarray(rx, 'RGBA').save(os.path.join(OUT, key + '-rx.png'), optimize=True)
    return {'w': W, 'h': H, 'rows': len(rows), 'rx': counts, **({} if back_row is not None else {'noBack': True})}


def main():
    os.makedirs(OUT, exist_ok=True); meta = {}
    for key, name, role, g in CHARS:
        meta[key] = {'name': name, 'role': role, 'g': g, **build(key)}
        print(key, meta[key]['w'], meta[key]['rx'], 'sem costas' if meta[key].get('noBack') else '')
    for f in os.listdir(OUT):
        if f.endswith('.png') and f[:-4].removesuffix('-rx') not in meta: os.remove(os.path.join(OUT, f))
    json.dump(meta, open(os.path.join(OUT, 'meta.json'), 'w'), ensure_ascii=False)
    open(os.path.join(ROOT, '..', '..', 'public', 'js', 'drive', 'chrmeta.js'), 'w').write(
        '// personagens animados — gerado por tools/drive/chars3.py\n'
        '// folha <chave>.png: linhas frente, direita, costas, esquerda (4 passos), corrida direita, corrida esquerda, extra (parado, irritado)\n'
        '// folha <chave>-rx.png: uma linha por reação (RX.order), quadros de RX.cell com os pés em RX.base\n'
        'export const CHR = ' + json.dumps(meta, ensure_ascii=False) + ';\n'
        'export const RX = ' + json.dumps({'cell': [RXW, RXH], 'base': RXB, 'stand': STAND, 'order': RX_ORDER}) + ';\n')


if __name__ == '__main__':
    main()
