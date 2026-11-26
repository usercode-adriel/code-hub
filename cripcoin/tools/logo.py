# Logo Codeniac -> quadro de parede: recorta o fundo preto (fica só o branco do logo), centra num fundo cinza e emoldura.
# Saída: cripcoin/public/arte/objetos/quadro-codeniac.png (arte 2x: 128 px de largura = 2 tiles).  Uso: python3 cripcoin/tools/logo.py
import os, numpy as np
from PIL import Image
RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
src = Image.open(os.path.join(RAIZ, 'assets-fonte', 'logo-codeniac.png')).convert('RGBA'); a = np.array(src)
lum = a[..., :3].max(2)                                    # texto branco sobre preto => luminosidade vira a transparência (borda suave)
alfa = np.clip((lum.astype(int) - 40) * 255 // 180, 0, 255).astype(np.uint8)
logo = np.dstack([np.full(lum.shape + (3,), 255, np.uint8), alfa]); ys, xs = np.where(alfa > 20)
logo = Image.fromarray(logo[ys.min():ys.max() + 1, xs.min():xs.max() + 1])
LARG, ALT, BORDA = 128, 80, 5
q = Image.new('RGBA', (LARG, ALT), (0, 0, 0, 0)); px = q.load()
for y in range(ALT):
    for x in range(LARG):
        d = min(x, y, LARG - 1 - x, ALT - 1 - y)
        px[x, y] = (24, 20, 32, 255) if d < 2 else (122, 92, 60, 255) if d < BORDA else (105, 110, 120, 255) if d < BORDA + 1 else (118, 123, 134, 255)   # contorno, moldura de madeira, fundo cinza
miolo = LARG - 2 * (BORDA + 8); esc = miolo / logo.width; lg = logo.resize((miolo, max(1, round(logo.height * esc))), Image.LANCZOS)
q.alpha_composite(lg, ((LARG - lg.width) // 2, (ALT - lg.height) // 2))
saida = os.path.join(RAIZ, 'public', 'arte', 'objetos', 'quadro-codeniac.png'); q.save(saida); print(saida, q.size)
import json
mp = os.path.join(RAIZ, 'public', 'arte', 'manifesto.json'); m = json.load(open(mp)); m['objetos']['quadro-codeniac'] = {'w': LARG, 'h': ALT}; json.dump(m, open(mp, 'w'), indent=1, ensure_ascii=False)
