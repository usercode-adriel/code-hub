"""Traça a planta do mundo a partir das duas referências (só geometria; a arte vem da prancha de assets):
  - mapa da ilha  → contorno da terra, ilhotas, lagos e rio, areia, matas, montanhas, cânion, vilas, campos, árvores
  - cidade pronta → praias e água da cidade (contornos irregulares da referência)
Saída: public/js/drive/planta.js (coordenadas do mundo; 1 px da cidade = 1 unidade; 1 px da ilha = ESC unidades).
Uso: python3 tools/mundo/tracar_planta.py <mapa-da-ilha.png> <cidade-pronta.png>"""
import sys, json
import numpy as np, cv2
from PIL import Image
from scipy import ndimage

ESC = 4.8                       # unidades do mundo por pixel do mapa da ilha
ORIG = (960, 766)               # canto da cidade no mapa da ilha (a cidade ocupa 1402×1122 unidades a partir daí)
CW, CH = 1402, 1122
rng = np.random.default_rng(20261121)

def mundo(px, py): return [round((px - ORIG[0]) * ESC), round((py - ORIG[1]) * ESC)]
def dentro_cidade(px, py, m=0): x, y = mundo(px, py); return -m <= x <= CW + m and -m <= y <= CH + m

def contornos(mask, eps, min_area, conv, holes=False):
    m = (mask.astype(np.uint8) * 255)
    modo = cv2.RETR_CCOMP if holes else cv2.RETR_EXTERNAL
    cs, hier = cv2.findContours(m, modo, cv2.CHAIN_APPROX_NONE)
    fora, buracos = [], []
    for i, c in enumerate(cs):
        if cv2.contourArea(c) < min_area: continue
        a = cv2.approxPolyDP(c, eps, True).reshape(-1, 2)
        if len(a) < 3: continue
        pts = [conv(float(x), float(y)) for x, y in a]
        if holes and hier is not None and hier[0][i][3] >= 0:
            if cv2.contourArea(c) >= 90: buracos.append(pts)  # lagos e rio (pontinhos azuis do desenho ficam de fora)
        else: fora.append(pts)
    return fora, buracos

def main(ilha_png, cidade_png):
    a = np.asarray(Image.open(ilha_png).convert('RGB')).astype(int); R, G, B = a[..., 0], a[..., 1], a[..., 2]; H, W = R.shape
    agua = (B > R + 40) & (B > G - 5)
    for (x0, y0, x1, y1) in [(10, 990, 312, 1178), (1025, 8, 1312, 140), (10, 10, 145, 178), (1040, 1070, 1312, 1199)]: agua[y0:y1, x0:x1] = True
    terra = ndimage.binary_opening(~ndimage.binary_opening(agua, iterations=1), iterations=2)
    # a cidade substitui o desenho do mapa no retângulo dela (lá valem as máscaras da cidade pronta)
    cx0, cy0 = ORIG; cx1, cy1 = ORIG[0] + CW / ESC, ORIG[1] + CH / ESC
    # no retângulo da cidade: terra até a costa da referência (mar ao sul de y≈995 e a leste de x≈1336), o resto é mar
    terra_sem_cidade = terra.copy(); terra_sem_cidade[int(cy0):int(cy1) + 1, int(cx0):int(cx1) + 1] = False
    terra_sem_cidade[int(cy0):int(cy0 + 995 / ESC), int(cx0):int(cx0 + 1336 / ESC)] = True
    conv = lambda x, y: mundo(x, y)
    land, lakes = contornos(terra_sem_cidade, 1.2, 25, conv, holes=True)
    # areia (praias do mapa), mata densa (piso de folhagem) e campos claros
    areia = terra & (R > 190) & (G > 160) & (B < 160) & (R > B + 60)
    areia = ndimage.binary_closing(ndimage.binary_opening(areia, iterations=1), iterations=3)
    mata = terra & (G > R + 25) & (G < 150)
    dens = ndimage.uniform_filter(mata.astype(float), 15)
    mataReg = ndimage.binary_opening(dens > 0.42, iterations=2)
    campo = terra & (G >= 150) & (G > R + 15); campoReg = ndimage.binary_opening(ndimage.uniform_filter(campo.astype(float), 11) > 0.45, iterations=2)
    cidade = np.zeros_like(terra); cidade[int(cy0) - 8:int(cy1) + 8, int(cx0) - 8:int(cx1) + 8] = True
    sand, _ = contornos(areia & ~cidade, 1.5, 70, conv)
    matas, _ = contornos(mataReg & ~cidade, 2.0, 200, conv)
    campos, _ = contornos(campoReg & ~cidade & ~mataReg, 2.0, 120, conv)
    # árvores: grade com sorteio pela densidade da mata (longe da água, da areia e da cidade)
    perto_agua = ndimage.binary_dilation(agua, iterations=3)
    arvores = []
    for py in range(2, H - 2, 3):
        for px in range(2, W - 2, 3):
            if not terra[py, px] or perto_agua[py, px] or areia[py, px] or cidade[py, px]: continue
            p = 0.05 + 0.33 * dens[py, px]
            if rng.random() < p:
                x, y = mundo(px + rng.random() * 2.4, py + rng.random() * 2.4); arvores.append([x, y, int(rng.integers(0, 100))])
    # cidade pronta: praias e água com os contornos da referência
    c = np.asarray(Image.open(cidade_png).convert('RGB')).astype(int); r2, g2, b2 = c[..., 0], c[..., 1], c[..., 2]
    ca = (b2 > 150) & (b2 > r2 + 60)
    ca = ndimage.binary_opening(ndimage.binary_closing(ca, iterations=4), iterations=3)
    lab, n = ndimage.label(ca); sz = ndimage.sum(ca, lab, range(1, n + 1)); ca = np.isin(lab, [i + 1 for i, s in enumerate(sz) if s > 3000])  # mar e marina (tira piscinas e lago)
    car = (r2 > 200) & (g2 > 170) & (b2 < 170) & (r2 > b2 + 50)
    car = ndimage.binary_opening(ndimage.binary_closing(car, iterations=6), iterations=3)
    lab, n = ndimage.label(car); sz = ndimage.sum(car, lab, range(1, n + 1)); car = np.isin(lab, [i + 1 for i, s in enumerate(sz) if s > 4000])
    car[:820] = False
    idc = lambda x, y: [round(x), round(y)]
    cmar, _ = contornos(ca, 2.0, 2000, idc); careia, _ = contornos(car, 2.0, 3000, idc)
    out = {
        'esc': ESC, 'orig': ORIG, 'bounds': {'x0': mundo(0, 0)[0], 'y0': mundo(0, 0)[1], 'x1': mundo(W, H)[0], 'y1': mundo(W, H)[1]},
        'land': land, 'lakes': lakes, 'sand': sand, 'matas': matas, 'campos': campos, 'arvores': arvores,
        'cidadeMar': cmar, 'cidadeAreia': careia,
    }
    js = '// PLANTA DO MUNDO (gerado por tools/mundo/tracar_planta.py — não editar à mão): geometria traçada das referências\n'
    js += '// (mapa da ilha e cidade pronta). Coordenadas do mundo. A arte vem toda da prancha de assets.\n'
    js += 'export const PLANTA = ' + json.dumps(out, separators=(',', ':')) + ';\n'
    open('public/js/drive/planta.js', 'w').write(js)
    print({k: len(v) for k, v in out.items() if isinstance(v, list)}, 'bounds', out['bounds'], 'kb', len(js) // 1024)

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
