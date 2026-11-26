# Recorta os 5 avatares isométricos (8 direções, sentados na cadeira) das folhas em cripcoin/assets-fonte/avatar-*.webp.
# Saída: cripcoin/public/arte/personagens/<chave>-<DIR>.png (mesmo tamanho de tela, base alinhada) + manifesto.json.
# Requer: python3, pillow, numpy, scipy, opencv-python.   Uso: python3 cripcoin/tools/personagens.py
import json, os, sys, numpy as np, cv2
from scipy import ndimage as ndi
from PIL import Image

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
FONTE = os.path.join(RAIZ, 'assets-fonte'); SAIDA = os.path.join(RAIZ, 'public', 'arte', 'personagens')
os.makedirs(SAIDA, exist_ok=True)
ALTURA_ALVO = 130                      # px de altura do boneco (2x da resolução lógica; a engine desenha com escala 0.5)
# ordem dos rótulos nas folhas: S, SE, E, NE, N, NO, O, SO  →  nomes das direções da engine
DIRS = ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW']
PERSONAGENS = ['eleonor', 'lady', 'sophia', 'laurinda', 'lucya']

def tirar_fundo(rgb):
    h, w, _ = rgb.shape
    cinza = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    mask = np.zeros((h + 2, w + 2), np.uint8); out = rgb.copy()
    for sx, sy in [(2, 2), (w - 3, 2), (2, h - 3), (w - 3, h - 3), (w // 2, 2), (w // 2, h - 3)]:
        if mask[sy + 1, sx + 1]: continue
        cv2.floodFill(out, mask, (sx, sy), (0, 0, 0), (4, 4, 4), (4, 4, 4), cv2.FLOODFILL_MASK_ONLY | (255 << 8))
    return mask[1:-1, 1:-1] == 0           # True = personagem

def figuras(chave):
    im = Image.open(os.path.join(FONTE, f'avatar-{chave}.webp')).convert('RGBA'); a = np.array(im)
    if a[..., 3].min() < 255:               # já tem transparência
        solido = a[..., 3] > 16
        solido = solido & ~((a[..., :3].max(2) > 235) & (a[..., :3].min(2) > 235) & False)
    else:
        solido = tirar_fundo(a[..., :3])
    solido = ndi.binary_opening(solido, iterations=1)
    for y0, y1 in ((0, 118),) if chave == 'lucya' else ((0, 98), (500, 592)): solido[y0:y1, :] = False     # faixas dos rótulos de direção
    # rótulos ("SUDESTE (45°)" etc.): caixas largas e baixas, removidas antes de juntar os pedaços do boneco
    l0, n0 = ndi.label(solido)
    for i, sl in enumerate(ndi.find_objects(l0), 1):
        hh = sl[0].stop - sl[0].start; ww = sl[1].stop - sl[1].start
        if hh < 100 and ww / max(hh, 1) > 1.6: solido[sl] &= ~(l0[sl] == i)
    lab, n = ndi.label(ndi.binary_closing(solido, iterations=3))
    itens = []
    for i, sl in enumerate(ndi.find_objects(lab), 1):
        hh = sl[0].stop - sl[0].start; ww = sl[1].stop - sl[1].start
        if hh < 190 or ww < 90: continue     # rótulos e ruído
        itens.append((sl, i))
    return a, solido, lab, itens

def tirar_sombra(rgba):
    # elipse escura sob a cadeira (existe em algumas folhas): blob grande de pixels quase pretos na faixa de baixo
    h = rgba.shape[0]; lum = rgba[..., :3].max(2); escuro = (lum < 48) & (rgba[..., 3] > 0)
    k = np.zeros((13, 13), bool); yy, xx = np.ogrid[:13, :13]; k[((yy - 6) ** 2 + (xx - 6) ** 2) <= 36] = True
    blob = ndi.binary_opening(escuro, structure=k)
    faixa = np.zeros_like(blob); faixa[int(h * 0.80):, :] = True
    lab, n = ndi.label(blob & faixa)
    for i, sl in enumerate(ndi.find_objects(lab), 1):
        if (lab[sl] == i).sum() > 700 and (sl[1].stop - sl[1].start) > 0.55 * rgba.shape[1]:     # largo como o chão da cadeira
            rgba[ndi.binary_dilation(lab == i, iterations=2) & escuro, 3] = 0
    return rgba

def montar(chave):
    a, solido, lab, itens = figuras(chave)
    if chave == 'lucya':                    # folha de 16: usa só a fileira de cima (rótulos de cima)
        itens = [t for t in itens if t[0][0].start < 480]
    centros = sorted(itens, key=lambda t: ((t[0][0].start + t[0][0].stop) // 2 // 400, (t[0][1].start + t[0][1].stop) // 2))
    assert len(centros) == 8, f'{chave}: {len(centros)} figuras (esperado 8)'
    recortes = []
    for sl, i in centros:
        m = (lab[sl] == i) | (ndi.binary_dilation(solido[sl], iterations=0) & (lab[sl] == i))
        rgba = a[sl].copy(); rgba[..., 3] = np.where(solido[sl] & (ndi.binary_dilation(lab[sl] == i, iterations=3)), 255, 0)
        recortes.append(Image.fromarray(tirar_sombra(rgba) if chave == 'laurinda' else rgba, 'RGBA'))
    return recortes

todos = {}
for c in PERSONAGENS:
    todos[c] = montar(c)
manifesto = {'altura': ALTURA_ALVO, 'personagens': {}}
for c, rs in todos.items():
    esc = ALTURA_ALVO / float(np.median([r.height for r in rs]))      # cada folha tem escala própria: normaliza pela altura mediana
    rs = [r.resize((max(1, round(r.width * esc)), max(1, round(r.height * esc))), Image.LANCZOS) for r in rs]
    CW = max(r.width for r in rs) + 4; CH = max(r.height for r in rs) + 4
    manifesto['personagens'][c] = {'w': CW, 'h': CH}
    for d, r in zip(DIRS, rs):
        tela = Image.new('RGBA', (CW, CH), (0, 0, 0, 0))
        # base alinhada embaixo, centro horizontal pelo centro do bbox
        tela.alpha_composite(r, ((CW - r.width) // 2, CH - 2 - r.height))
        tela.save(os.path.join(SAIDA, f'{c}-{d}.png'))
json.dump(manifesto, open(os.path.join(SAIDA, 'manifesto.json'), 'w'), indent=1)
print('ok', manifesto)
