# Recorta os assets enviados em 3 folhas (game/assets-fonte/inv-*.png): computadores/periféricos, servidores/armários e a baia dupla.
# Gera game/office/public/arte/objetos/<nome>.png (arte em 2x, a engine desenha a 0,5) e acrescenta ao manifesto.json com "extra": true.
# Requer: python3, pillow, numpy, scipy, opencv-python.   Uso: python3 game/tools/inventario.py
import json, os, numpy as np, cv2
from scipy import ndimage as ndi
from PIL import Image
RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), '..')); FONTE = os.path.join(RAIZ, 'assets-fonte'); PUB = os.path.join(RAIZ, 'office', 'public', 'arte')
MAN = os.path.join(PUB, 'manifesto.json'); man = json.load(open(MAN))

def fundo_plano(rgb, tol):
    h, w, _ = rgb.shape; mask = np.zeros((h + 2, w + 2), np.uint8); out = rgb.copy()
    for sx, sy in [(1, 1), (w - 2, 1), (1, h - 2), (w - 2, h - 2), (w // 2, 1), (w // 2, h - 2), (1, h // 2), (w - 2, h // 2)]:
        if not mask[sy + 1, sx + 1]: cv2.floodFill(out, mask, (sx, sy), (0, 0, 0), (tol,) * 3, (tol,) * 3, cv2.FLOODFILL_MASK_ONLY | (255 << 8))
    return mask[1:-1, 1:-1] == 0

def pecas(rgba, solido, minimo):
    solido = ndi.binary_opening(solido, iterations=1); lab, n = ndi.label(ndi.binary_closing(solido, iterations=2), structure=np.ones((3, 3)))
    itens = []
    for i, sl in enumerate(ndi.find_objects(lab), 1):
        h = sl[0].stop - sl[0].start; w = sl[1].stop - sl[1].start
        if h * w < minimo: continue
        m = ndi.binary_fill_holes((lab[sl] == i) & solido[sl]) | ((lab[sl] == i) & solido[sl])
        out = rgba[sl].copy(); out[..., 3] = np.where(m, 255, 0); itens.append((sl, Image.fromarray(out, 'RGBA')))
    banda = max(h for _, im in itens for h in [im.height]) * 0.7
    itens.sort(key=lambda t: (round(((t[0][0].start + t[0][0].stop) / 2) / banda), t[0][1].start)); return [im for _, im in itens]

def salvar(nome, img, largura2x=None, caixa=False):
    if largura2x: img = img.resize((largura2x, max(1, round(img.height * largura2x / img.width))), Image.LANCZOS)
    bb = img.getbbox(); img = img.crop(bb); img.save(os.path.join(PUB, 'objetos', f'{nome}.png')); man['objetos'][nome] = {'w': img.width, 'h': img.height, 'extra': True}

# ---- computadores e periféricos (arte pequena: já está em ~2x do tamanho lógico) ----
a = np.array(Image.open(os.path.join(FONTE, 'inv-computadores.png')).convert('RGBA')); sol = fundo_plano(a[..., :3], 9)
nomes = ['imac-g3', 'imac-aluminio', 'pc-retro-bege', 'monitor-curvo', 'monitor-preto', 'monitor-widescreen', 'monitor-lateral', 'teclado-cinza', 'mouse-cinza', 'teclado-retro-bege', 'tablet-grafico', 'torre-pc-preta-2']
ps = pecas(a, sol, 160); assert len(ps) == len(nomes), (len(ps), 'computadores')
for n, im in zip(nomes, ps): salvar(n, im)
# ---- servidores e armários (arte grande: reduz para ~2x do tamanho lógico) ----
a = np.array(Image.open(os.path.join(FONTE, 'inv-servidores.png')).convert('RGBA')); sol = fundo_plano(a[..., :3], 5)
nomes = ['servidor-torre-1', 'rack-aberto', 'ups-modulos', 'servidor-torre-2', 'armario-bege-racks', 'porta-metal']
ps = pecas(a, sol, 4000); assert len(ps) == len(nomes), (len(ps), 'servidores')
for n, im in zip(nomes, ps): salvar(n, im, largura2x=max(60, round(im.width * 0.42)))
# ---- baia dupla (arte grande e suave, com brilho laranja ao fundo: usa o canal alfa) ----
a = np.array(Image.open(os.path.join(FONTE, 'inv-baia-dupla.png')).convert('RGBA')); sol = a[..., 3] >= 235
sol &= ~((a[..., :3].astype(int).max(2) < 14) & (a[..., 3] < 255)); ps = pecas(a, sol, 20000); assert ps, 'baia'
salvar('baia-dupla', max(ps, key=lambda i: i.width * i.height), largura2x=300)
json.dump(man, open(MAN, 'w'), indent=1, ensure_ascii=False); print('ok', [k for k, v in man['objetos'].items() if v.get('extra')])
