# Recorta objetos, paredes e pisos das folhas em cripcoin/assets-fonte/ e gera os PNGs do jogo em cripcoin/public/arte/ (arte em 2x: 1 tile = 64 px, o jogo desenha a 0,5).
# Requer: python3, pillow, numpy, scipy.   Uso: python3 cripcoin/tools/arte.py   (antes: python3 cripcoin/tools/objetos_indice.py para ver os índices)
import json, os, numpy as np
from scipy import ndimage as ndi
from PIL import Image
R = os.path.abspath(os.path.join(os.path.dirname(__file__), '..')); FONTE = os.path.join(R, 'assets-fonte'); PUB = os.path.join(R, 'public', 'arte')
for d in ('objetos', 'paredes', 'pisos'): os.makedirs(os.path.join(PUB, d), exist_ok=True)
PX = 64                                                                  # px por tile na arte (2x)
man = {'objetos': {}, 'paredes': {}, 'pisos': {}}

# ---------- objetos: índice (leitura da folha) -> (nome, largura em tiles) ----------
OBJ = {0: ('despertador', .5), 1: ('poltrona-grande', 1.8), 2: ('poltrona', 1.2), 6: ('poltrona-pequena', 1.0), 10: ('puff-verde', 1.0), 11: ('lixeira-reciclagem', .9), 12: ('lixeira', .8), 13: ('prateleira-pastas', 1.9),
  15: ('cadeira-escritorio-costas', 1.0), 17: ('cadeira-escritorio-lado', .9), 18: ('caixa-papelao', 1.0), 19: ('pilha-caixas', 1.3), 21: ('cadeira-azul', .8), 22: ('cadeira-azul-lado', .8), 24: ('arquivo-gavetas', 1.1),
  27: ('cadeira-azul-costas', .8), 28: ('relogio-parede', .9), 30: ('calendario', .9), 31: ('cafeteira', .9), 33: ('diploma', 1.1), 36: ('mural-cortica', 1.4), 37: ('cadeira-gamer', 1.1), 38: ('cadeira-gamer-lado', .9), 39: ('mesa-simples', 2.0),
  42: ('mesa-l', 2.6), 44: ('mesa-metal', 2.0), 45: ('cadeira-escritorio-b', 1.0), 46: ('cadeira-escritorio', 1.0), 51: ('kit-socorros', .8), 52: ('caneca', .35), 53: ('jarra-cafe', .45), 54: ('flipchart', 1.1), 55: ('frigobar', 1.0),
  57: ('aquecedor', 1.2), 60: ('mesa-baixa', 1.6), 64: ('abajur-chao', .6), 65: ('laptop', .9), 66: ('lata', .3), 67: ('latas', .4), 68: ('locker', .8), 69: ('placa-saida', 1.1), 70: ('microondas', 1.0), 71: ('monitor', 1.0), 72: ('ventilador', .8),
  73: ('monitor-duplo', 1.2), 74: ('monitor-curvo', 1.2), 75: ('extintor', .5), 76: ('mouse', .3), 77: ('caneca-2', .35), 78: ('copo-macarrao', .4), 79: ('caderno', .5), 81: ('papel-amassado', .4), 82: ('papeis', .6), 83: ('ampulheta', .4),
  84: ('torre-pc', .7), 85: ('teclado', .8), 86: ('porta-lapis', .4), 87: ('telefone', .6), 88: ('luminaria-mesa', .6), 89: ('almofada', .8), 90: ('laptop-fechado', .8), 91: ('caixa-pizza', .9), 93: ('pizza', .5), 94: ('planta-seca', .9),
  95: ('suculenta', .8), 96: ('planta-pendurada', .5), 97: ('planta-feliz', .9), 98: ('planta-vaso', .9), 99: ('quadro-paisagem', 1.2), 100: ('impressora', 1.5), 102: ('projetor', 1.0), 104: ('roteador', .7), 106: ('cofre', .9),
  107: ('tela-projecao', 2.0), 108: ('vitrine', 1.0), 109: ('estante', 1.9), 110: ('prateleira-livros', 1.7), 115: ('sofa-2', 2.0), 116: ('sofa-3', 3.0), 117: ('sofa-lado', 1.0), 120: ('quadro-postit', 1.3), 122: ('banco-alto', .7), 123: ('banco-alto-2', .7),
  126: ('mesa-lateral', 1.4), 127: ('mesa-redonda', 1.2), 128: ('mesa-digitalizadora', 1.0), 129: ('trofeu', .5), 130: ('grade-ventilacao', 1.0), 131: ('garrafa', .3), 132: ('bebedouro', .8), 133: ('webcam', .4), 134: ('quadro-branco', 1.5)}
im = Image.open(os.path.join(FONTE, 'objetos.png')).convert('RGB'); a = np.array(im).astype(int)
bg = np.abs(a - np.array([239, 236, 229])).max(2) <= 7; fg = ndi.binary_opening(~bg, iterations=1)
lab, n = ndi.label(ndi.binary_closing(fg, iterations=3), structure=np.ones((3, 3)))
caixas = []
for sl in ndi.find_objects(lab):
    h = sl[0].stop - sl[0].start; w = sl[1].stop - sl[1].start
    if h * w >= 900: caixas.append((sl[1].start, sl[0].start, w, h))
caixas.sort(key=lambda t: (round((t[1] + t[3] / 2) / 215), t[0])); assert len(caixas) == 135, len(caixas)
for i, (nome, larg) in OBJ.items():
    x, y, w, h = caixas[i]; sub = a[y:y + h, x:x + w]; b = np.abs(sub - np.array([239, 236, 229])).max(2) <= 7
    lb, nn = ndi.label(b); borda = (set(lb[0]) | set(lb[-1]) | set(lb[:, 0]) | set(lb[:, -1])) - {0}; fora = np.isin(lb, list(borda))
    alfa = ((~fora) * 255).astype(np.uint8); rgba = np.dstack([sub.astype(np.uint8), alfa]); img = Image.fromarray(rgba, 'RGBA'); img = img.crop(img.getbbox())
    W = max(2, round(larg * PX)); img = img.resize((W, max(1, round(img.height * W / img.width))), Image.LANCZOS)
    img.save(os.path.join(PUB, 'objetos', f'{nome}.png')); man['objetos'][nome] = {'w': img.width, 'h': img.height}

# ---------- paredes e pisos (folha de tiles) ----------
T = Image.open(os.path.join(FONTE, 'paredes-pisos.png')).convert('RGB'); ta = np.array(T).astype(int)
def caixa_escura(x0, y0, x1, y1):
    sub = ta[y0:y1, x0:x1]; esc = sub.max(2) < 60; ys, xs = np.where(esc); return (x0 + xs.min(), y0 + ys.min(), x0 + xs.max() + 1, y0 + ys.max() + 1)
def salvar(img, pasta, nome, extra=None):
    img.save(os.path.join(PUB, pasta, f'{nome}.png')); man[pasta][nome] = {'w': img.width, 'h': img.height, **(extra or {})}
ALT = 88                                                                  # altura da face da parede em px (2x): 1,4 tile
# parede lisa: fatia central (sem as pontas), que se repete na horizontal sem emenda
x0, y0, x1, y1 = caixa_escura(20, 20, 535, 255); wall = T.crop((x0, y0, x1, y1)); esc = ALT / wall.height; fat = round(PX / esc)
cx = wall.width // 2; salvar(wall.crop((cx - fat // 2, 0, cx - fat // 2 + fat, wall.height)).resize((PX, ALT), Image.LANCZOS).convert('RGBA'), 'paredes', 'parede')
# porta (1 tile de largura) e janela (3 tiles) e demais enfeites de parede (objetos presos à parede)
x0, y0, x1, y1 = caixa_escura(1325, 20, 1518, 275); salvar(T.crop((x0, y0, x1, y1)).resize((PX, ALT), Image.LANCZOS).convert('RGBA'), 'paredes', 'porta')
x0, y0, x1, y1 = caixa_escura(18, 300, 330, 540); j = T.crop((x0, y0, x1, y1)); salvar(j.resize((PX * 3, round(j.height * PX * 3 / j.width)), Image.LANCZOS).convert('RGBA'), 'paredes', 'janela')
x0, y0, x1, y1 = caixa_escura(338, 300, 615, 540); j = T.crop((x0, y0, x1, y1)); salvar(j.resize((PX * 3, round(j.height * PX * 3 / j.width)), Image.LANCZOS).convert('RGBA'), 'paredes', 'parede-tela')
x0, y0, x1, y1 = caixa_escura(850, 20, 1195, 255); j = T.crop((x0, y0, x1, y1)); salvar(j.resize((PX * 3, round(j.height * PX * 3 / j.width)), Image.LANCZOS).convert('RGBA'), 'paredes', 'parede-grade')
# pisos: miolo de um ladrilho de 64x64 (2x)
PISOS = {'xadrez-azul': (27, 583, 295, 757), 'ceramica-creme': (317, 583, 580, 757), 'madeira': (604, 583, 875, 757), 'metal': (899, 583, 1198, 757), 'concreto-escuro': (1224, 583, 1509, 757),
         'ceramica-azul': (27, 790, 294, 978), 'ceramica-branca': (317, 790, 580, 978), 'ceramica-verde': (604, 790, 875, 978), 'tapete-escuro': (899, 790, 1198, 978), 'parquet': (1224, 790, 1509, 978)}
for nome, (x0, y0, x1, y1) in PISOS.items():
    w = x1 - x0; h = y1 - y0; lado = int(min(w, h) * 0.62); cx = x0 + w // 2; cy = y0 + h // 2
    salvar(T.crop((cx - lado // 2, cy - lado // 2, cx + lado // 2, cy + lado // 2)).resize((PX, PX), Image.LANCZOS).convert('RGBA'), 'pisos', nome)
json.dump(man, open(os.path.join(PUB, 'manifesto.json'), 'w'), indent=1, ensure_ascii=False); print({k: len(v) for k, v in man.items()})
