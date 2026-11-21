"""Recorta construções, vegetação, objetos e ladrilhos da prancha de cenário (6144×4096).
Caixas em coordenadas da prévia 2000×1333 (×ESC para a resolução original). Fundo da prancha = pintura desfocada:
dentro de cada caixa, o que tem gradiente baixo e encosta na borda é fundo; fica só a peça principal.
Ladrilhos: recorte espelhado 2×2 (repete sem emenda). Uso: python3 tools/mundo/recortar_cenario.py <prancha> <saida>"""
import json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage

ESC = 6144 / 2000
RED = 3  # a prancha é ~3× a arte: reduz com filtro de caixa
# nome: (x0, y0, x1, y1, pasta)
PECAS = {
  # construções e estabelecimentos
  'delegacia': (10, 458, 282, 666, 'construcoes'), 'hospital': (302, 452, 532, 666, 'construcoes'),
  'posto': (558, 498, 797, 666, 'construcoes'), 'lanchonete': (808, 466, 1068, 672, 'construcoes'),
  'casa-noturna': (1088, 466, 1382, 672, 'construcoes'), 'mercado-24h': (1393, 492, 1683, 678, 'construcoes'),
  'aeroporto': (1683, 450, 1968, 697, 'construcoes'),
  'torre-vidro': (8, 672, 212, 912, 'construcoes'), 'torre-cilindrica': (222, 672, 337, 908, 'construcoes'),
  'hotel': (348, 672, 497, 908, 'construcoes'), 'predio-branco': (530, 676, 702, 908, 'construcoes'),
  'predio-laranja': (708, 678, 852, 862, 'construcoes'), 'sobrado-vermelho': (866, 682, 1098, 862, 'construcoes'),
  'casa-azul': (1113, 686, 1302, 862, 'construcoes'), 'casa-cinza': (1308, 686, 1492, 862, 'construcoes'),
  'casa-vermelha': (1498, 686, 1683, 862, 'construcoes'), 'predio-azul-baixo': (712, 866, 872, 1028, 'construcoes'),
  'predio-bege': (886, 856, 1093, 1028, 'construcoes'), 'casa-branca': (1107, 856, 1272, 1012, 'construcoes'),
  'casa-ardosia': (1287, 862, 1478, 1012, 'construcoes'), 'farol': (1836, 692, 1993, 972, 'construcoes'),
  'quiosque-palafita': (1692, 856, 1822, 1018, 'construcoes'), 'cabana-palha': (1798, 982, 1993, 1102, 'construcoes'),
  # natureza e relevo
  'montanha': (1308, 8, 1706, 202, 'relevo'), 'penhasco-cascata': (1208, 166, 1372, 292, 'relevo'),
  'penhasco-grande': (1208, 278, 1378, 462, 'relevo'), 'penhasco-medio': (1383, 203, 1563, 334, 'relevo'),
  'penhasco-caverna': (1483, 203, 1703, 358, 'relevo'), 'penhasco-baixo': (1383, 333, 1563, 448, 'relevo'),
  'rochas': (1208, 22, 1343, 112, 'relevo'),
  'palmeira': (1118, 1028, 1192, 1162, 'vegetacao'), 'palmeira-2': (1188, 1018, 1258, 1158, 'vegetacao'),
  'palmeira-3': (1258, 1018, 1332, 1160, 'vegetacao'), 'palmeira-alta': (1108, 1158, 1182, 1316, 'vegetacao'),
  'arvore-grande': (1333, 1018, 1443, 1162, 'vegetacao'), 'ipe-rosa': (1538, 1030, 1642, 1162, 'vegetacao'),
  'arvore-pequena': (1648, 1038, 1732, 1112, 'vegetacao'), 'arvore-copa': (1198, 1150, 1290, 1280, 'vegetacao'),
  # objetos de rua e de praia
  'poste-luz': (1512, 1168, 1552, 1318, 'objetos'), 'poste-luz-2': (1562, 1168, 1602, 1318, 'objetos'),
  'guarda-sol': (672, 1038, 722, 1086, 'objetos'), 'guarda-sol-2': (732, 1038, 790, 1086, 'objetos'),
  'cadeira-praia': (686, 1088, 722, 1128, 'objetos'), 'salva-vidas': (1032, 1028, 1108, 1148, 'objetos'),
  'cabine-azul': (908, 1038, 962, 1148, 'objetos'), 'cabine-vermelha': (968, 1040, 1022, 1148, 'objetos'),
  'pranchas': (1012, 1158, 1102, 1242, 'objetos'), 'cerca-madeira': (718, 1138, 852, 1238, 'objetos'),
  'cerca-madeira-2': (868, 1158, 1003, 1242, 'objetos'), 'banca-mercado': (1728, 1228, 1792, 1312, 'objetos'),
  'banca-mercado-2': (1798, 1228, 1877, 1312, 'objetos'), 'banco-jardim': (1883, 1172, 1988, 1218, 'objetos'),
  'portal-jardim': (1798, 1108, 1872, 1168, 'objetos'), 'cerca-jardim': (1878, 1112, 1988, 1152, 'objetos'),
  'piscina': (1568, 860, 1667, 897, 'objetos'),
  # vegetação miúda (canto da prancha): arbustos, moitas, pedras e plantas
  'arbusto-1': (236, 310, 269, 346, 'vegetacao'), 'arbusto-2': (269, 310, 303, 346, 'vegetacao'), 'arbusto-3': (236, 344, 269, 382, 'vegetacao'),
  'arbusto-4': (269, 348, 304, 384, 'vegetacao'), 'moita-alta': (303, 393, 347, 452, 'vegetacao'), 'moita-alta-2': (351, 393, 397, 452, 'vegetacao'),
  'samambaia': (400, 393, 458, 452, 'vegetacao'), 'moita-flor': (504, 393, 534, 450, 'vegetacao'),
  'pedras': (316, 313, 388, 387, 'relevo'), 'pedras-roxas': (394, 313, 458, 387, 'relevo'), 'pedras-2': (468, 313, 532, 387, 'relevo'), 'pedras-3': (468, 396, 502, 450, 'relevo'),
}
LADRILHOS = {  # x0, y0, x1, y1 (área sem borda)
  'grama': (16, 14, 74, 72), 'grama-flores': (90, 14, 148, 72), 'areia': (246, 166, 300, 220), 'terra': (322, 246, 376, 300),
  'asfalto': (975, 408, 1160, 430), 'mata': (244, 16, 302, 72), 'grama-clara': (174, 12, 218, 58), 'grama-roxa': (398, 244, 452, 300), 'grama-florida': (474, 164, 528, 220), 'canteiro': (322, 16, 378, 72), 'calcada': (566, 336, 670, 440), 'pedra': (700, 340, 776, 440), 'agua': (1906, 22, 1984, 118),
}

def recorta(im, caixa):
    x0, y0, x1, y1 = [round(v * ESC) for v in caixa]
    return im.crop((x0, y0, x1, y1))

def sem_fundo(img):
    a = np.asarray(img.convert('RGB')).astype(float); g = a.mean(axis=2)
    mag = np.hypot(ndimage.sobel(g, 1), ndimage.sobel(g, 0))
    liso = ndimage.uniform_filter(mag, 9) < 26
    lab, _ = ndimage.label(liso); b = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    fg = ~np.isin(lab, b[b > 0])
    fg = ndimage.binary_opening(ndimage.binary_fill_holes(ndimage.binary_closing(fg, iterations=3)), iterations=4)
    pl, pn = ndimage.label(fg)
    if pn == 0: return None
    ar = ndimage.sum(fg, pl, range(1, pn + 1)); fg = pl == (int(np.argmax(ar)) + 1)
    out = np.dstack([np.asarray(img.convert('RGB')), np.where(fg, 255, 0).astype(np.uint8)])
    o = Image.fromarray(out, 'RGBA'); return o.crop(o.getchannel('A').getbbox())

def main(src, dst):
    im = Image.open(src).convert('RGBA'); meta = {}
    for nome, (x0, y0, x1, y1, pasta) in PECAS.items():
        p = sem_fundo(recorta(im, (x0, y0, x1, y1)))
        if p is None: print('falhou', nome); continue
        p = p.resize((max(1, p.width // RED), max(1, p.height // RED)), Image.BOX)
        px = np.asarray(p).copy(); px[..., 3] = np.where(px[..., 3] >= 128, 255, 0); p = Image.fromarray(px, 'RGBA')
        os.makedirs(f'{dst}/{pasta}', exist_ok=True); p.save(f'{dst}/{pasta}/{nome}.png'); meta[f'{pasta}/{nome}'] = [p.width, p.height]
    for nome, caixa in LADRILHOS.items():
        t = recorta(im, caixa).convert('RGB'); t = t.resize((max(8, t.width // RED), max(8, t.height // RED)), Image.BOX)
        w, h = t.size; m = Image.new('RGB', (w * 2, h * 2))
        m.paste(t, (0, 0)); m.paste(t.transpose(Image.FLIP_LEFT_RIGHT), (w, 0)); m.paste(t.transpose(Image.FLIP_TOP_BOTTOM), (0, h)); m.paste(t.transpose(Image.ROTATE_180), (w, h))
        os.makedirs(f'{dst}/terreno', exist_ok=True); m.save(f'{dst}/terreno/{nome}.png'); meta[f'terreno/{nome}'] = [m.width, m.height]
    json.dump(meta, open(f'{dst}/cenario.json', 'w'), indent=0); print('peças', len(meta))

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
