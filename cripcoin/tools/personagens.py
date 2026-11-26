# Recorta as personagens sentadas na cadeira das folhas assets-fonte/personagem-*.png (4 vistas por folha).
# Layout da folha: [frente | costas] em cima, [lado esquerdo | lado direito] embaixo  →  S, N, W, E.
# Fundo cinza removido por preenchimento a partir das bordas. Todas as vistas usam a mesma escala (altura alvo) e a mesma âncora
# horizontal (centro do tronco/cabeça, que fica sobre a cadeira), base alinhada.
# Saída: cripcoin/public/arte/personagens/<chave>-<DIR>.png + manifesto.json.   Uso: python3 cripcoin/tools/personagens.py
import json, os, numpy as np, cv2
from scipy import ndimage as ndi
from PIL import Image

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
FONTE = os.path.join(RAIZ, 'assets-fonte'); SAIDA = os.path.join(RAIZ, 'public', 'arte', 'personagens'); os.makedirs(SAIDA, exist_ok=True)
CHAVES = ['cacheada', 'oculos', 'afro']
QUADRANTES = {'S': (0, 0), 'N': (1, 0), 'W': (0, 1), 'E': (1, 1)}
ESCALA = 0.27                                   # as folhas têm ~480 px de boneco; o jogo usa arte 2x (130 px de altura ≈ 4 tiles de pixel art)

def sem_fundo(rgb):
    h, w, _ = rgb.shape; mask = np.zeros((h + 2, w + 2), np.uint8); out = rgb.copy()
    for sx, sy in [(2, 2), (w - 3, 2), (2, h - 3), (w - 3, h - 3), (w // 2, 2), (w // 2, h - 3), (2, h // 2), (w - 3, h // 2)]:
        if mask[sy + 1, sx + 1]: continue
        cv2.floodFill(out, mask, (sx, sy), (0, 0, 0), (14, 14, 14), (14, 14, 14), cv2.FLOODFILL_MASK_ONLY | (255 << 8))
    solido = mask[1:-1, 1:-1] == 0
    solido = ndi.binary_opening(solido, iterations=1)
    lab, n = ndi.label(solido)
    if n:                                        # só o maior componente (o boneco); ruídos somem
        tam = ndi.sum(solido, lab, range(1, n + 1)); solido = lab == (1 + int(np.argmax(tam)))
    return ndi.binary_fill_holes(solido)

def recortar(chave):
    im = np.array(Image.open(os.path.join(FONTE, f'personagem-{chave}.png')).convert('RGB')); H, W, _ = im.shape; saida = {}
    for d, (cx, cy) in QUADRANTES.items():
        q = im[cy * H // 2:(cy + 1) * H // 2, cx * W // 2:(cx + 1) * W // 2]; m = sem_fundo(q)
        ys, xs = np.where(m); y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        rgba = np.dstack([q, (m * 255).astype(np.uint8)])[y0:y1, x0:x1]; mm = m[y0:y1, x0:x1]
        hh = mm.shape[0]; faixa = mm[int(hh * 0.1):int(hh * 0.55)]; yy, xx = np.where(faixa); ancora = xx.mean() if len(xx) else mm.shape[1] / 2
        saida[d] = (Image.fromarray(rgba), ancora, mm.shape[1], hh)
    # escala comum da personagem: altura máxima entre as vistas * ESCALA
    hmax = max(v[3] for v in saida.values()); esc = ESCALA * 480 / hmax if False else ESCALA
    info = {}
    for d, (img, ancora, w, h) in saida.items():
        nw, nh = max(1, round(w * esc)), max(1, round(h * esc)); r = img.resize((nw, nh), Image.LANCZOS)
        a = np.array(r); a[..., 3] = np.where(a[..., 3] > 127, 255, 0); r = Image.fromarray(a)
        # âncora horizontal no centro da imagem final: preenche com transparência o lado menor
        ax = ancora * esc; meia = max(ax, nw - ax); L = int(np.ceil(meia * 2)); tela = Image.new('RGBA', (L, nh), (0, 0, 0, 0)); tela.paste(r, (int(round(L / 2 - ax)), 0))
        tela.save(os.path.join(SAIDA, f'{chave}-{d}.png')); info[d] = (L, nh)
    return info

man = {c: {d: {'w': w, 'h': h} for d, (w, h) in recortar(c).items()} for c in CHAVES}
json.dump({'direcoes': ['S', 'N', 'W', 'E'], 'personagens': man}, open(os.path.join(SAIDA, 'manifesto.json'), 'w'), indent=1)
print(json.dumps(man))
