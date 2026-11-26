# Recorta objetos, paredes e pisos das folhas em game/assets-fonte/ (fundo quadriculado falso -> transparência real) e gera os PNGs da engine.
# Saída: game/office/public/arte/{objetos,paredes,pisos}/*.png e manifesto.json. Resolução 2x (a engine desenha com escala 0.5).
# Requer: python3, pillow, numpy, scipy.   Uso: python3 game/tools/cenario.py
import json, os, numpy as np
from scipy import ndimage as ndi
from PIL import Image

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
FONTE = os.path.join(RAIZ, 'assets-fonte'); PUB = os.path.join(RAIZ, 'office', 'public', 'arte')
for d in ('objetos', 'paredes', 'pisos'): os.makedirs(os.path.join(PUB, d), exist_ok=True)

def sem_fundo(caminho):
    """Remove o quadriculado cinza/branco que veio "pintado" na imagem (só o que toca a borda e é neutro e claro)."""
    im = np.array(Image.open(caminho).convert('RGB')).astype(int); mx, mn = im.max(2), im.min(2)
    cand = ((mx - mn) <= 7) & (mn >= 208); lab, _ = ndi.label(cand)
    borda = (set(lab[0, :]) | set(lab[-1, :]) | set(lab[:, 0]) | set(lab[:, -1])) - {0}
    bg = np.isin(lab, list(borda)); bg = (ndi.binary_dilation(bg, iterations=1) & ((mx - mn) <= 14) & (mn >= 190)) | bg
    alpha = (~bg).astype(np.uint8) * 255
    l2, n2 = ndi.label(alpha > 0)
    for i, t in enumerate(ndi.sum(alpha > 0, l2, range(1, n2 + 1)), 1):
        if t < 60: alpha[l2 == i] = 0
    return Image.fromarray(np.dstack([im.astype(np.uint8), alpha]), 'RGBA')

def componentes(img):
    a = np.array(img)[..., 3] > 0; lab, n = ndi.label(ndi.binary_closing(a, iterations=2)); itens = []
    for sl in ndi.find_objects(lab):
        h = sl[0].stop - sl[0].start; w = sl[1].stop - sl[1].start
        if w * h >= 900: itens.append((sl[1].start, sl[0].start, w, h))
    itens.sort(key=lambda t: (round((t[1] + t[3] / 2) / 140), t[0])); return itens

def recorte(img, c):
    x, y, w, h = c; r = img.crop((x, y, x + w, y + h)); return r.crop(r.getbbox())

def redimensiona(r, largura):
    return r.resize((max(1, round(largura)), max(1, round(r.height * largura / r.width))), Image.LANCZOS)

manifesto = {'objetos': {}, 'paredes': {}, 'pisos': {}}
# ---------------- objetos: índice na folha (ordem de leitura) -> (nome, largura em px lógicos) ----------------
OBJ = {0: ('mesa', 100), 1: ('mesa-l', 120), 2: ('mesa-l2', 120), 3: ('mesa-reuniao', 128), 4: ('cadeira-preta', 50), 5: ('cadeira-preta-2', 50), 6: ('cadeira-azul', 50), 7: ('cadeira-preta-3', 50), 8: ('cadeira-visita', 40),
  9: ('monitor', 40), 10: ('monitor-duplo', 50), 11: ('torre-pc', 34), 12: ('mini-servidor', 34), 13: ('torre-pc-2', 32), 14: ('laptop', 40), 15: ('torre-pc-3', 32), 16: ('torre-pc-4', 36), 17: ('torre-pc-5', 34), 18: ('scanner', 56), 19: ('banco-redondo', 30),
  20: ('roteador', 30), 21: ('multifuncional', 62), 22: ('impressora', 58), 23: ('impressora-etiquetas', 48), 24: ('copiadora', 60), 25: ('switch', 32), 26: ('rack-1', 40), 27: ('rack-2', 40), 28: ('rack-3', 46), 29: ('mini-pc', 28), 30: ('webcam', 24), 31: ('bebedouro', 36),
  32: ('arquivo-4', 38), 33: ('armario-aco', 42), 34: ('locker', 40), 35: ('estante-livros', 66), 36: ('vitrine', 46), 37: ('armario-madeira', 68), 38: ('arquivo-3', 32), 39: ('arquivo-madeira', 30), 40: ('balcao', 130), 41: ('cameras', 40), 42: ('flipchart', 42), 43: ('mural', 58), 44: ('quadro-branco', 46),
  45: ('planta-1', 30), 46: ('planta-2', 34), 47: ('planta-3', 34), 48: ('arvore-1', 46), 49: ('arvore-2', 40), 50: ('planta-alta', 28), 51: ('luminaria-mesa-1', 24), 52: ('luminaria-mesa-2', 26), 53: ('luminaria-chao', 26), 54: ('sofa', 108), 55: ('poltrona', 52), 56: ('mesa-centro', 70), 57: ('banco', 22),
  58: ('cafeteira', 38), 59: ('caneca-1', 12), 60: ('caneca-2', 14), 61: ('lata', 12), 62: ('caixa-azul', 14), 63: ('pastas-1', 20), 64: ('pastas-2', 24), 65: ('planta-4', 26), 66: ('planta-5', 28), 67: ('planta-6', 24), 68: ('planta-7', 24), 69: ('quadro-cidade', 50), 70: ('quadro-praia', 50), 71: ('quadro-mapa', 48),
  72: ('relogio', 28), 73: ('trofeu', 24), 74: ('caixa-metal-1', 30), 75: ('xicara', 9), 76: ('arquivo-2', 32), 77: ('caixa-m', 36), 78: ('pastas-3', 22), 79: ('caixa-p', 28), 80: ('pastas-4', 24), 81: ('caixa-g', 42), 82: ('kit-socorros', 24), 83: ('extintor', 14), 84: ('lixeira-grande', 30),
  85: ('caixa-organizadora', 30), 86: ('lixeira-reciclagem', 26), 87: ('lixeira-2', 26), 88: ('maleta', 30), 89: ('arquivo-pequeno', 28)}
obj = sem_fundo(os.path.join(FONTE, 'objetos-escritorio.webp')); comps = componentes(obj)
assert len(comps) == 90, len(comps)
for i, (nome, larg) in OBJ.items():
    r = redimensiona(recorte(obj, comps[i]), larg * 2); r.save(os.path.join(PUB, 'objetos', f'{nome}.png')); manifesto['objetos'][nome] = {'w': r.width, 'h': r.height}

# ---------------- paredes: peças de 1 aresta (35 px lógicos de comprimento, 60 de altura), cisalhadas para a inclinação 2:1 ----------------
tl = sem_fundo(os.path.join(FONTE, 'tiles-paredes-pisos.webp')); tc = componentes(tl)
assert len(tc) == 56, len(tc)
COMP, ALT = 35 * 2, 60 * 2
def contorno_base(r):
    a = np.array(r)[..., 3] > 0; w = a.shape[1]; k = max(3, w // 12)
    def b(x0, x1): ys = [np.where(a[:, x])[0].max() for x in range(x0, x1) if a[:, x].any()]; return float(np.mean(ys))
    return b(0, k), b(w - k, w)
def parede(idx, nome, espelhar=False):
    r = recorte(tl, tc[idx]).resize((COMP, ALT), Image.LANCZOS)
    if espelhar: r = r.transpose(Image.FLIP_LEFT_RIGHT)
    esq, dir_ = contorno_base(r); incl = (esq - dir_) / COMP          # >0: a base sobe para a direita (aresta W); <0: desce (aresta N)
    tipo = 'W' if incl > 0 else 'N'; cis = (0.5 if incl > 0 else -0.5) - incl   # ajusta a base para a inclinação 2:1 da grade
    pad = int(np.ceil(abs(cis) * COMP)) + 2; arr = np.array(r); H = arr.shape[0]; out = np.zeros((H + pad, COMP, 4), np.uint8)
    for x in range(COMP):
        sft = int(round(cis * x)) + (pad if cis < 0 else 0); out[sft:sft + H, x] = arr[:, x]
    img = Image.fromarray(out, 'RGBA'); box = img.getbbox(); img = img.crop(box)
    a = np.array(img)[..., 3] > 0
    ys = np.array([np.where(a[:, x])[0].max() if a[:, x].any() else np.nan for x in range(a.shape[1])])
    m = np.nanmean(np.diff(ys[3:-3])) if a.shape[1] > 8 else 0
    ax = 3 if tipo == 'N' else img.width - 3; ay = float(ys[ax]) if not np.isnan(ys[ax]) else float(np.nanmax(ys))
    img.save(os.path.join(PUB, 'paredes', f'{nome}.png')); manifesto['paredes'][nome] = {'w': img.width, 'h': img.height, 'ax': ax, 'ay': round(ay, 1), 'lado': tipo, 'inclinacao': round(float(m), 2)}
parede(1, 'parede-W'); parede(1, 'parede-N', True); parede(4, 'janela-W'); parede(8, 'janela-N'); parede(22, 'porta-W'); parede(22, 'porta-N', True)

# ---------------- pisos: um ladrilho (sub-losango da face de cima) 64x32, que se repete sem emendas visíveis ----------------
PISOS = {40: 'madeira', 43: 'carpete', 45: 'ceramica-cinza', 46: 'ceramica-azul', 52: 'ceramica-creme', 53: 'concreto-escuro', 54: 'ceramica-branca'}
for idx, nome in PISOS.items():
    r = recorte(tl, tc[idx]); W = r.width; hf = W / 2                                   # a face de cima é um losango 2:1 de largura W
    cxs, cys, hw, hh = W / 4, hf / 2, 0.7 * W / 4, 0.7 * hf / 4
    if nome == 'carpete': cxs, cys, hw, hh = W / 2, hf / 2, 0.22 * W, 0.22 * hf / 2          # carpete: só o miolo liso (sem a barra dourada)                         # miolo (70%) do sub-losango da esquerda: sem bordas nem emendas
    sub = r.crop((int(cxs - hw), int(cys - hh), int(cxs + hw) + 1, int(cys + hh) + 1)).convert('RGBA')
    out = sub.resize((64, 32), Image.LANCZOS)
    if nome == 'madeira':                                                                  # a madeira original é muito laranja: tom mais natural, que deixa os móveis aparecerem
        from PIL import ImageEnhance; rgb = ImageEnhance.Brightness(ImageEnhance.Color(out.convert('RGB')).enhance(0.55)).enhance(0.9); rgb.putalpha(255); out = rgb
    a2 = np.array(out); yy, xx = np.mgrid[0:32, 0:64]
    dist = np.abs(xx + 0.5 - 32) / 32 + np.abs(yy + 0.5 - 16) / 16
    a2[..., 3] = np.where(dist <= 1.0, 255, 0)
    if nome.startswith(('ceramica', 'concreto')):                                         # fio de rejunte nas duas bordas de cima, como num piso de ladrilhos
        borda = (dist > 0.88) & (dist <= 1.0) & (yy < 16)
        a2[borda, :3] = (a2[borda, :3] * 0.78).astype(np.uint8)
    Image.fromarray(a2, 'RGBA').save(os.path.join(PUB, 'pisos', f'{nome}.png')); manifesto['pisos'][nome] = {'w': 64, 'h': 32}
json.dump(manifesto, open(os.path.join(PUB, 'manifesto.json'), 'w'), indent=1, ensure_ascii=False)
print({k: len(v) for k, v in manifesto.items()}); print(json.dumps(manifesto['paredes']))
