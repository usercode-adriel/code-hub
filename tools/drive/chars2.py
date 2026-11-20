"""Personagens do mapa (versão 2) a partir das folhas de referência em tools/drive/src/personagens.

Cada folha tem o personagem em vistas paradas (frente, 3/4, lado, costas). O script:
  1. tira o fundo (crescimento de região a partir das bordas: o fundo é liso/desfocado e o contorno é escuro);
  2. separa cada figura (componentes conectados, em ordem de leitura);
  3. pega frente, lado e costas de cada personagem (tabela CHARS), vira o lado para a direita;
  4. reduz para 48 px de altura (pixel art nítido: alfa binário);
  5. gera a caminhada em 4 quadros por direção (passo alternado de frente/costas, passada aberta de lado, balanço
     do corpo), no mesmo formato das folhas antigas: 4 colunas (passos) × 4 linhas (frente, direita, costas, esquerda).
As reações (atropelado, caído, ferido, dor, baleado, morto) são animadas no jogo a partir destes quadros
(public/js/drive/reactions.js), seguindo as sequências da folha de referência "reacoes".

Uso: python3 tools/drive/chars2.py   (requer Pillow, numpy e scipy)
"""
import json, os
from collections import deque
import numpy as np
from PIL import Image
from scipy import ndimage as nd

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'src', 'personagens')
OUT = os.path.join(ROOT, '..', '..', 'public', 'assets', 'rpg', 'chr')
H = 48

# chave, nome, papel, gênero, folha, frente, lado, costas (índices das figuras em ordem de leitura; None = sem vista)
CHARS = [
    ('jovem', 'Jovem de camiseta', 'civil', 'm', 'profissoes', 0, 2, 6),
    ('jovem-bone', 'Jovem de boné', 'civil', 'm', 'profissoes', 7, 8, 9),
    ('garota', 'Garota de shorts', 'civil', 'f', 'profissoes', 3, 5, None),
    ('executiva', 'Executiva', 'executivo', 'f', 'profissoes', 10, 12, None),
    ('policial', 'Policial', 'policia', 'm', 'profissoes', 13, 14, 15),
    ('policial2', 'Policial (f)', 'policia', 'f', 'profissoes', 16, 17, 18),
    ('medico', 'Médico', 'saude', 'm', 'profissoes', 19, 21, 22),
    ('enfermeira', 'Enfermeira', 'saude', 'f', 'profissoes', 23, 25, None),
    ('entregador', 'Entregador', 'entrega', 'm', 'profissoes', 30, 29, 31),
    ('chef', 'Chef de cozinha', 'comercio', 'm', 'profissoes', 33, 35, 32),
    ('executivo', 'Executivo', 'executivo', 'm', 'profissoes', 36, 37, 38),
    ('idoso', 'Senhor', 'idoso', 'm', 'profissoes', 39, 40, None),
    ('idosa2', 'Senhora de casaco', 'idoso', 'f', 'profissoes', 41, 43, None),
    ('vestido-preto', 'Moça de vestido preto', 'executivo', 'f', 'profissoes', 46, 47, 48),
    ('construtor', 'Construtor', 'obra', 'm', 'uniformes', 0, 2, 3),
    ('bombeiro', 'Bombeiro', 'bombeiro', 'm', 'uniformes', 5, 7, 9),
    ('estudante', 'Estudante', 'estudante', 'm', 'casuais', 0, 2, None),
    ('garota-cargo', 'Garota de calça cargo', 'civil', 'f', 'casuais', 4, 8, 6),
    ('barbudo', 'Barbudo de camisa polo', 'civil', 'm', 'casuais', 11, 13, 16),
    ('cacheada', 'Cacheada de regata', 'civil', 'f', 'casuais', 17, 19, 18),
    ('nerd', 'Rapaz de óculos', 'estudante', 'm', 'casuais', 22, 26, 24),
    ('idosa', 'Vovó', 'idoso', 'f', 'casuais', 28, 31, 30),
    ('garoto-afro', 'Garoto do basquete', 'crianca', 'm', 'casuais', 33, 34, 35),
    ('afro-cacheada', 'Moça de cabelo crespo', 'civil', 'f', 'casuais', 39, 42, 41),
    ('vestido-vinho', 'Moça de vestido vinho', 'civil', 'f', 'vestidos', 0, 3, 4),
    ('vestido-noite', 'Moça de vestido de festa', 'civil', 'f', 'vestidos', 8, 13, 12),
    ('vestido-azul', 'Ruiva de vestido azul', 'civil', 'f', 'vestidos', 16, 21, 20),
    ('praia-f', 'Banhista (biquíni vermelho)', 'praia', 'f', 'praia', 0, 3, 4),
    ('praia-f2', 'Banhista (biquíni azul)', 'praia', 'f', 'praia', 8, 11, 12),
    ('praia-m', 'Garoto de bermuda de praia', 'praia', 'm', 'praia', 16, 18, 20),
    ('plus-rabo', 'Moça de rabo de cavalo', 'civil', 'f', 'plus', 0, 3, 4),
    ('plus-camiseta', 'Moça de camiseta branca', 'comercio', 'f', 'plus', 5, 7, None),
    ('plus-oculos', 'Moça de óculos', 'civil', 'f', 'plus', 10, 13, 14),
    ('plus-barba', 'Barbudo de camiseta verde', 'civil', 'm', 'plus', 20, 22, 24),
    ('plus-bone', 'Rapaz de boné e moletom', 'civil', 'm', 'plus', 25, 27, 28),
]
# lado que precisa ser espelhado para ficar virado para a direita (conferido na prévia; o automático erra pouco)
FLIP = {'vestido-azul': -1}


def bgmask(a, tol=14):
    h, w = a.shape[:2]; rgb = a[..., :3].astype(np.int16); m = np.zeros((h, w), bool); q = deque()
    for x in range(w): q.extend([(0, x), (h - 1, x)])
    for y in range(h): q.extend([(y, 0), (y, w - 1)])
    for y, x in q: m[y, x] = True
    while q:
        y, x = q.popleft(); c = rgb[y, x]
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            yy, xx = y + dy, x + dx
            if 0 <= yy < h and 0 <= xx < w and not m[yy, xx] and np.abs(rgb[yy, xx] - c).sum() < tol:
                m[yy, xx] = True; q.append((yy, xx))
    return m


def figures(sheet):
    cache = os.path.join('/tmp', f'fig-{sheet}.npz')
    a = np.array(Image.open(os.path.join(SRC, sheet + '.webp')).convert('RGBA'))
    if os.path.exists(cache): fg = np.load(cache)['fg']
    else: fg = nd.binary_opening(~bgmask(a), iterations=1); np.savez_compressed(cache, fg=fg)
    lab, n = nd.label(fg); objs = nd.find_objects(lab); sizes = nd.sum(fg, lab, range(1, n + 1))
    keep = [(i + 1, s) for i, (s, z) in enumerate(zip(objs, sizes)) if z > 800]
    keep.sort(key=lambda t: (t[1][0].start // 60, t[1][1].start))
    out = []
    for li, s in keep:
        crop = a[s].copy(); crop[..., 3] = np.where(lab[s] == li, 255, 0); out.append(crop)
    return out


def facing(img):
    """+1 se a figura de lado olha para a direita: pele do rosto fica do lado para onde se olha."""
    a = img.astype(int); h = a.shape[0]; head = a[: int(h * 0.22)]
    r, g, b, al = head[..., 0], head[..., 1], head[..., 2], head[..., 3]
    skin = (al > 0) & (r > g) & (g > b) & (r - b > 35) & (r > 110)
    ys, xs = np.nonzero(al > 0); sy, sx = np.nonzero(skin)
    if len(sx) < 8: return 1
    return 1 if sx.mean() >= xs.mean() else -1


def shrink(img, k):
    """reduz com média pré-multiplicada e deixa o alfa binário (pixel art nítido)."""
    a = img.astype(np.float32); al = a[..., 3:4] / 255.0; pre = np.concatenate([a[..., :3] * al, al * 255], 2)
    h, w = img.shape[:2]; nh, nw = max(1, round(h * k)), max(1, round(w * k))
    im = Image.fromarray(pre.clip(0, 255).astype(np.uint8), 'RGBA').resize((nw, nh), Image.BOX)
    p = np.array(im).astype(np.float32); A = p[..., 3:4]
    rgb = np.where(A > 0, p[..., :3] * 255.0 / np.maximum(A, 1), 0)
    out = np.concatenate([rgb, np.where(A > 120, 255, 0)], 2).clip(0, 255).astype(np.uint8)
    return out


def place(fig, W):
    """figura no quadro W×H, centrada e apoiada no chão (linha H-1)."""
    fr = np.zeros((H, W, 4), np.uint8); h, w = fig.shape[:2]; h = min(h, H - 1); fig = fig[-h:]
    x0 = (W - w) // 2; y0 = H - 1 - h
    xa, xb = max(0, x0), min(W, x0 + w)
    fr[y0:y0 + h, xa:xb] = fig[:, xa - x0:xb - x0]
    return fr


def shift_rows(fr, rows, dx=0, dy=0, cols=None):
    """move um trecho (linhas × colunas) do quadro: dy < 0 sobe, dx > 0 vai para a direita."""
    out = fr.copy(); H2, W2 = fr.shape[:2]; cs = cols if cols is not None else slice(0, W2)
    part = np.zeros_like(fr); part[rows, cs] = fr[rows, cs]; out[rows, cs] = 0
    moved = np.roll(np.roll(part, dy, 0), dx, 1)
    m = moved[..., 3] > 0; out[m] = moved[m]
    return out


def walk(fr, side):
    """4 quadros: parado, passo, parado, passo (frente/costas: perna alternada; lado: passada aberta)."""
    al = fr[..., 3] > 0; ys, xs = np.nonzero(al)
    if not len(ys): return [fr] * 4
    top, bot = ys.min(), ys.max(); hh = bot - top + 1; leg0 = top + int(hh * 0.66); cx = int(xs.mean())
    legs = slice(leg0, H)
    def bob(f): return shift_rows(f, slice(0, H), dy=-1)
    if not side:
        f1 = shift_rows(fr, legs, dy=-2, cols=slice(0, cx)); f1 = shift_rows(f1, slice(0, leg0), dy=-1)
        f3 = shift_rows(fr, legs, dy=-2, cols=slice(cx, fr.shape[1])); f3 = shift_rows(f3, slice(0, leg0), dy=-1)
        return [fr, f1, fr, f3]
    # de lado: pés para a frente e para trás (cisalhamento crescente até os pés), corpo sobe 1 px
    def stride(f, k):
        o = np.zeros_like(f); o[:leg0] = f[:leg0]
        for r in range(leg0, H):
            t = (r - leg0) / max(1, H - leg0); d = int(round(k * t))
            row = f[r]; left = row.copy(); right = row.copy(); left[cx:] = 0; right[:cx] = 0
            o[r] = 0
            for part, dd in ((left, -d), (right, d)):
                rr = np.roll(part, dd, 0); m = rr[..., 3] > 0; o[r][m] = rr[m]
        return o
    s = stride(fr, 3)
    return [fr, bob(s), fr, bob(stride(fr, 2))]


# ---------------------------------------------------------------- reações (folha "reacoes": quadros desenhados)
# Sequências da folha de referência (índices das figuras em ordem de leitura) e para onde fica a cabeça em cada
# quadro ('u' em cima, 'l' à esquerda, 'r' à direita) — usado para pintar cabelo, rosto, roupa, calça e sapato.
RX_SEQ = {
    'atropelado': [0, 1, 2, 3, 9, 10], 'baleado': [4, 5, 6, 7, 8, 11, 12], 'caido': [13, 14, 15, 21, 22, 23],
    'ferido': [16, 17, 18, 19, 20, 24, 25], 'morto': [26, 27, 28, 29], 'morto-sentado': [30, 31, 32, 33],
    'morto-de-pe': [34, 35, 36, 37, 38], 'sangramento': [39, 40, 41, 42, 43, 44], 'dor': [45, 46, 49, 50, 51],
    'quase-morte': [47, 48, 52, 53, 54, 55, 56],
}
RX_HEAD = {3: 'r', 9: 'l', 10: 'l', 11: 'l', 12: 'r', 22: 'r', 23: 'r', 24: 'r', 25: 'r', 26: 'l', 27: 'l', 28: 'l', 29: 'l', 33: 'l', 44: 'l', 55: 'l', 56: 'l'}
RX_CELL = (52, 48)


def rx_frames():
    """os 57 quadros da folha de reações (fundo branco e rótulos escuros removidos), em ordem de leitura."""
    a = np.array(Image.open(os.path.join(SRC, 'reacoes.webp')).convert('RGB')).astype(int)
    mx = a.max(2); mn = a.min(2)
    bg = (mn > 225) & ((mx - mn) < 20); dark = mx < 60
    fg = ~bg & ~nd.binary_dilation(dark & (nd.uniform_filter(dark.astype(float), 9) > 0.6), iterations=3)
    fg = nd.binary_opening(fg, iterations=1)
    lab, n = nd.label(nd.binary_dilation(fg, iterations=6)); objs = nd.find_objects(lab); out = []
    for i, s in enumerate(objs):
        m = (lab[s] == i + 1) & fg[s]
        if m.sum() < 600 or (a[s].max(2)[m] < 70).mean() > 0.5: continue
        out.append((s[0].start, s[1].start, a[s], m))
    out.sort(key=lambda t: (t[0] // 110, t[1]))
    return [(img, m) for _, _, img, m in out]


def palette(front):
    """cores do personagem (cabelo, pele, camisa, calça, sapato) tiradas da vista de frente."""
    al = front[..., 3] > 0; ys, xs = np.nonzero(al); top, bot = ys.min(), ys.max(); hh = bot - top + 1; cx = int(xs.mean())
    def med(y0, y1, half=0.25):
        w = max(2, int((xs.max() - xs.min()) * half)); reg = front[top + int(hh * y0):top + int(hh * y1) + 1, max(0, cx - w):cx + w + 1]
        px = reg[reg[..., 3] > 0][:, :3].astype(int); px = px[px.max(1) > 45]
        return np.median(px, 0) if len(px) else np.array([120, 120, 120])
    # pele: pixels com tom de pele em qualquer parte da figura (rosto, braços, pernas); sem nenhum, um tom médio
    px = front[al][:, :3].astype(int); r, g, b = px[:, 0], px[:, 1], px[:, 2]; lum = 0.299 * r + 0.587 * g + 0.114 * b
    sk = px[(r > g) & (g > b) & (r - b > 35) & (r - b < 140) & (lum > 70) & (lum < 225) & (g - b > 8)]
    pele = np.median(sk, 0) if len(sk) > 10 else np.array([225, 175, 135])
    return {'cabelo': med(0.0, 0.06, 0.18), 'pele': pele, 'camisa': med(0.30, 0.45), 'calca': med(0.66, 0.82, 0.2), 'sapato': med(0.95, 1.0, 0.3)}


def recolor(img, m, head, pal):
    """pinta o corpo base da referência com as cores do personagem; sangue e contorno ficam como estão."""
    rgb = img[..., :3].astype(float); h, w = m.shape; ys, xs = np.nonzero(m)
    t = np.zeros((h, w))
    if head == 'u': t = (np.arange(h)[:, None] - ys.min()) / max(1, ys.max() - ys.min()) * np.ones((1, w))
    elif head == 'l': t = (np.arange(w)[None, :] - xs.min()) / max(1, xs.max() - xs.min()) * np.ones((h, 1))
    else: t = (xs.max() - np.arange(w)[None, :]) / max(1, xs.max() - xs.min()) * np.ones((h, 1))
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    blood = (r > 120) & (r - g > 70) & (r - b > 60)
    lum = 0.299 * r + 0.587 * g + 0.114 * b; outline = lum < 70
    k = np.clip(lum / 205.0, 0.35, 1.25)[..., None]  # sombreado do corpo base (pele média ≈ 205)
    band = np.select([t < 0.08, t < 0.27, t < 0.58, t < 0.93], [0, 1, 2, 3], 4)  # cabeça grande (~27% da altura)
    cols = np.stack([pal['cabelo'], pal['pele'], pal['camisa'], pal['calca'], pal['sapato']])
    new = np.clip(cols[band] * k, 0, 255)
    out = np.where((blood | outline)[..., None], rgb, new)
    return np.dstack([out, np.where(m, 255, 0)]).astype(np.uint8)


def rx_sheet(front, frames):
    pal = palette(front); CW, CH = RX_CELL
    rows = list(RX_SEQ.items()); sheet = np.zeros((CH * len(rows), CW * 7, 4), np.uint8)
    k = (H - 3) / frames[0][1].shape[0]  # mesma escala do personagem em pé (quadro 0 = de pé)
    for r, (name, idx) in enumerate(rows):
        for c, i in enumerate(idx):
            img, m = frames[i]; f = shrink(recolor(img, m, RX_HEAD.get(i, 'u'), pal), k)
            fh, fw = f.shape[:2]; fh = min(fh, CH - 1); fw = min(fw, CW); f = f[-fh:, :fw]
            x0 = (CW - fw) // 2; y0 = CH - 1 - fh
            sheet[r * CH + y0:r * CH + y0 + fh, c * CW + x0:c * CW + x0 + fw] = f
    return sheet


def main():
    os.makedirs(OUT, exist_ok=True)
    sheets = {}
    meta = {}; preview = []; rxf = None
    for key, name, role, g, sheet, fi, si, bi in CHARS:
        if sheet not in sheets: sheets[sheet] = figures(sheet)
        F = sheets[sheet]
        front, side, back = F[fi], F[si], F[bi] if bi is not None else None
        if facing(side) * FLIP.get(key, 1) < 0: side = side[:, ::-1]
        k = (H - 3) / front.shape[0]
        views = [shrink(v, k) for v in (front, side, back if back is not None else front)]
        W = max(v.shape[1] for v in views) + 6
        fr = [place(v, W) for v in views]
        rows = [walk(fr[0], False), walk(fr[1], True), walk(fr[2], False)]
        rows.append([f[:, ::-1] for f in rows[1]])  # esquerda = direita espelhada
        sheet_img = np.zeros((H * 4, W * 4, 4), np.uint8)
        for r, row in enumerate(rows):
            for c, f in enumerate(row): sheet_img[r * H:(r + 1) * H, c * W:(c + 1) * W] = f
        Image.fromarray(sheet_img, 'RGBA').save(os.path.join(OUT, key + '.png'), optimize=True)
        meta[key] = {'name': name, 'role': role, 'g': g, 'w': W, 'h': H, **({} if back is not None else {'noBack': True})}
        if rxf is None: rxf = rx_frames()
        Image.fromarray(rx_sheet(fr[0], rxf), 'RGBA').save(os.path.join(OUT, key + '-rx.png'), optimize=True)
        preview.append(sheet_img)
    # remove as folhas antigas que não existem mais
    for f in os.listdir(OUT):
        if f.endswith('.png') and f[:-4].removesuffix('-rx') not in meta: os.remove(os.path.join(OUT, f))
    json.dump(meta, open(os.path.join(OUT, 'meta.json'), 'w'), ensure_ascii=False)
    js = os.path.join(ROOT, '..', '..', 'public', 'js', 'drive', 'chrmeta.js')
    open(js, 'w').write('// personagens animados (folhas 4×4: frente, direita, costas, esquerda × 4 passos) — gerado por tools/drive/chars2.py\nexport const CHR = ' + json.dumps(meta, ensure_ascii=False) + ';\n'
                   + '// reações desenhadas (folha <chave>-rx.png): uma linha por sequência, quadros de ' + f'{RX_CELL[0]}×{RX_CELL[1]}' + '\nexport const RX = ' + json.dumps({'cell': RX_CELL, 'seq': {k: {'row': i, 'n': len(v)} for i, (k, v) in enumerate(RX_SEQ.items())}}) + ';\n')
    # prévia (para conferir a direção e os passos)
    Wm = max(p.shape[1] for p in preview); cols = 6; rows = (len(preview) + cols - 1) // cols
    pv = np.zeros((rows * H * 4, cols * Wm, 4), np.uint8)
    for i, p in enumerate(preview): r, c = divmod(i, cols); pv[r * H * 4:r * H * 4 + p.shape[0], c * Wm:c * Wm + p.shape[1]] = p
    Image.fromarray(pv, 'RGBA').save('/tmp/chars2-preview.png')
    print(len(meta), 'personagens')


if __name__ == '__main__':
    main()
