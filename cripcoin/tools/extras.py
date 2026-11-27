# Recorta os assets extras: ícones do computador/celular, bebidas e energéticos, frigobar (fechado/aberto), colchonetes,
# personagens dormindo e os itens da bolsa. Fundo removido por preenchimento a partir das bordas; nada é desenhado à mão,
# exceto o ícone do banco (não existe na folha de ícones) — ele é gerado aqui em pixel art simples.
# Uso: python3 cripcoin/tools/extras.py      (depois de tools/arte.py e tools/logo.py; atualiza public/arte/manifesto.json)
import json, os, sys, numpy as np
from PIL import Image
from scipy import ndimage as ndi
sys.path.insert(0, os.path.dirname(__file__))
from comp import mascara, componentes

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), '..')); F = os.path.join(RAIZ, 'assets-fonte'); PUB = os.path.join(RAIZ, 'public', 'arte')
for d in ('objetos', 'icones', 'itens', 'personagens'): os.makedirs(os.path.join(PUB, d), exist_ok=True)
MAN = os.path.join(PUB, 'manifesto.json'); man = json.load(open(MAN)); man.setdefault('itens', {}); man.setdefault('icones', {})

def rgba_de(rgb, solido): return np.dstack([rgb, (solido * 255).astype(np.uint8)])
def salvar(img, caminho, largura=None, escala=None, metodo=Image.LANCZOS):
    if largura: escala = largura / img.width
    if escala and abs(escala - 1) > 1e-6: img = img.resize((max(1, round(img.width * escala)), max(1, round(img.height * escala))), metodo)
    a = np.array(img); a[..., 3] = np.where(a[..., 3] > 110, 255, 0); img = Image.fromarray(a); img.save(caminho); return img
def recortes(arquivo, tol, minimo, sementes=None, fechar=2):
    rgb = np.array(Image.open(os.path.join(F, arquivo)).convert('RGB')); s = mascara(rgb, tol, sementes); s = ndi.binary_opening(s, iterations=1)
    lab, cs = componentes(s, minimo, fechar); return rgb, s, lab, cs
def recorte(rgb, s, c, margem=0):
    y0, x0, y1, x1 = c[:4]; m = s[y0:y1, x0:x1]; return Image.fromarray(rgba_de(rgb[y0:y1, x0:x1], ndi.binary_fill_holes(m)))
def em_linhas(cs, tol=60): cs = sorted(cs, key=lambda c: c[0]); linhas = []
def ordenar(cs, faixa):
    cs = sorted(cs, key=lambda c: (c[0] + c[2]) / 2); linhas = []
    for c in cs:
        cy = (c[0] + c[2]) / 2
        if linhas and abs(cy - linhas[-1][0]) < faixa: linhas[-1][1].append(c)
        else: linhas.append([cy, [c]])
    return [sorted(l[1], key=lambda c: c[1]) for l in linhas]

# ---------- bebidas (fundo branco por fora, cinza-escuro por dentro; a assinatura do artista e as miniaturas ficam de fora) ----------
BEBIDAS = ['suco-vermelho', 'garrafa-pimenta', 'coquetel-laranja', 'suco-rosa', 'cha-gelado', 'shot-dourado', 'coquetel-azul', 'chopp-escuro', 'chopp-dourado', 'refrigerante-limao', 'coquetel-tropical', 'coquetel-rosa']
rgb, s, lab, cs = recortes('bebidas.jpg', 22, 900, [(2, 2), (40, 150), (470, 150), (40, 470)])
cs = [c for c in cs if c[0] > 150 and c[2] < 490 and c[4] < 40000]
lin = ordenar(cs, 40); grandes = [c for l in lin for c in l]
assert len(grandes) == 12, len(grandes)
for nome, c in zip(BEBIDAS, grandes):
    im = salvar(recorte(rgb, s, c), os.path.join(PUB, 'objetos', f'bebida-{nome}.png')); man['objetos'][f'bebida-{nome}'] = {'w': im.width, 'h': im.height}
# ---------- energéticos ----------
LATAS = ['verde', 'branco', 'azul', 'laranja', 'vermelho', 'rosa', 'limao']
rgb, s, lab, cs = recortes('energeticos.jpg', 14, 1500); cs = sorted(cs, key=lambda c: c[1]); assert len(cs) == 7, len(cs)
for nome, c in zip(LATAS, cs):
    # a sombra cinza-clara à direita da lata é parte do fundo: corta pixels muito claros e pouco saturados
    y0, x0, y1, x1 = c[:4]; parte = rgb[y0:y1, x0:x1].astype(int); m = s[y0:y1, x0:x1] & ~((parte.min(2) > 200) & ((parte.max(2) - parte.min(2)) < 12) & (np.arange(x1 - x0)[None, :] > (x1 - x0) * 0.62))
    lab2, n = ndi.label(m); m = lab2 == (1 + int(np.argmax(ndi.sum(m, lab2, range(1, n + 1))))) if n else m
    ys, xs = np.where(m); im = Image.fromarray(rgba_de(rgb[y0:y1, x0:x1], m)).crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    im = salvar(im, os.path.join(PUB, 'objetos', f'energetico-{nome}.png')); man['objetos'][f'energetico-{nome}'] = {'w': im.width, 'h': im.height}
# ---------- frigobar fechado / aberto (mesma escala; o corpo fica sempre no mesmo lugar da pegada: ox = centro do corpo) ----------
rgb, s, lab, cs = recortes('frigobar.png', 10, 5000); cs = sorted(cs, key=lambda c: c[1]); fech, aber = cs
esc = 64 / (fech[3] - fech[1])
a = salvar(recorte(rgb, s, fech), os.path.join(PUB, 'objetos', 'frigobar.png'), escala=esc); man['objetos']['frigobar'] = {'w': a.width, 'h': a.height}
b = salvar(recorte(rgb, s, aber), os.path.join(PUB, 'objetos', 'frigobar-aberto.png'), escala=esc)
man['objetos']['frigobar-aberto'] = {'w': b.width, 'h': b.height, 'ox': round((a.width / 2) / b.width, 4)}
# ---------- colchonetes (vazios) e personagens dormindo (mesma escala do colchonete) ----------
LARG_COLCHAO = 72
rgb, s, lab, cs = recortes('colchonetes.png', 10, 2000); cs = sorted(cs, key=lambda c: c[1])
for nome, c in zip(['colchonete-rosa', 'colchonete-vermelho'], cs):
    im = salvar(recorte(rgb, s, c), os.path.join(PUB, 'objetos', f'{nome}.png'), largura=LARG_COLCHAO); man['objetos'][nome] = {'w': im.width, 'h': im.height}
man['dormindo'] = {}
for chave in ['afro', 'cacheada', 'oculos']:
    rgb = np.array(Image.open(os.path.join(F, f'dormindo-{chave}.png')).convert('RGB')); s = ndi.binary_opening(mascara(rgb, 12), iterations=1)
    lab3, n = ndi.label(s); tam = ndi.sum(s, lab3, range(1, n + 1)); corpo = lab3 == (1 + int(np.argmax(tam)))        # colchonete + personagem; os "Z" soltos ficam de fora
    # "z" pequeno que encosta no colchonete: pixels brancos/pretos acima do topo do estofado, na metade direita
    ys, xs = np.where(corpo); topo = ys.min(); cor = rgb.astype(int)
    linhas_pad = np.where((corpo.sum(1) > (xs.max() - xs.min()) * 0.8))[0]; topo_pad = linhas_pad.min() if len(linhas_pad) else topo
    corpo[:topo_pad, :] = False                                     # tudo acima da borda de cima do colchonete é o "zzz" desenhado: o jogo anima o próprio
    corpo = ndi.binary_fill_holes(corpo); ys, xs = np.where(corpo)
    im = Image.fromarray(rgba_de(rgb, corpo)).crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    _l = np.where(corpo[topo_pad + 20])[0]; esc = LARG_COLCHAO / (_l.max() - _l.min() + 1)
    im = salvar(im, os.path.join(PUB, 'personagens', f'{chave}-dormindo.png'), escala=esc)
    # "z" pequeno que ficou sobre o travesseiro: brancos no topo viram a cor do estofado ao redor
    a = np.array(im); hh = a.shape[0]; zona = a[:int(hh * 0.14)]; branco = (zona[..., :3].min(2) > 215) & (zona[..., 3] > 0)
    if branco.any():
        ys, xs = np.where(branco); y0, y1, x0, x1 = max(0, ys.min() - 2), ys.max() + 3, max(0, xs.min() - 2), xs.max() + 3
        viz = zona[max(0, y0 - 3):y1 + 3, max(0, x0 - 6):x1 + 6].reshape(-1, 4); viz = viz[(viz[:, 3] > 0) & (viz[:, :3].max(1) > 120) & (viz[:, :3].min(1) < 215)]
        if len(viz): zona[y0:y1, x0:x1][zona[y0:y1, x0:x1, 3] > 0] = np.median(viz, 0).astype(np.uint8)
        im = Image.fromarray(a); im.save(os.path.join(PUB, 'personagens', f'{chave}-dormindo.png'))
    man['dormindo'][chave] = {'w': im.width, 'h': im.height}
# ---------- itens da bolsa (a TV vai para a loja; as bolsas viram objetos de mesa) ----------
ITENS = [['colchonete-enrolado-rosa', 'colchonete-enrolado-vermelho', 'tv-netflix', 'celular', 'bolsa-rosa', 'escova', 'xuxinha'],
         ['moletom', 'cropped', 'shorts', 'saia', 'batom', 'po-compacto', 'paleta-sombras'],
         ['chapinha', 'perfume', 'garrafa-termica', 'hidratante', 'espelho', 'oculos-sol', 'fones-bluetooth'],
         ['headphone', 'mascara-dormir', 'garrafa-agua', 'necessaire', 'piranha-cabelo', 'colar', 'brincos', 'ecobag']]
rgb, s, lab, cs = recortes('itens-bolsa.png', 10, 300)
lin = ordenar(cs, 70); lin = [l for l in lin if l]
# brincos são 2 pedaços: junta componentes muito próximos na mesma linha
def juntar(l):
    out = []
    for c in l:
        if out and c[1] - out[-1][3] < 12 and abs(c[0] - out[-1][0]) < 30: p = out.pop(); out.append((min(p[0], c[0]), p[1], max(p[2], c[2]), c[3], p[4] + c[4]))
        else: out.append(c)
    return out
lin = [juntar(l) for l in lin]
assert [len(l) for l in lin] == [7, 7, 7, 8], [len(l) for l in lin]
for nomes, l in zip(ITENS, lin):
    for nome, c in zip(nomes, l):
        y0, x0, y1, x1 = c[:4]; im = Image.fromarray(rgba_de(rgb[y0:y1, x0:x1], ndi.binary_fill_holes(s[y0:y1, x0:x1])))
        it = salvar(im.copy(), os.path.join(PUB, 'itens', f'{nome}.png'), largura=None, escala=56 / max(im.width, im.height)); man['itens'][nome] = {'w': it.width, 'h': it.height}
        if nome in ('tv-netflix', 'bolsa-rosa', 'ecobag', 'necessaire'):
            ob = salvar(im.copy(), os.path.join(PUB, 'objetos', f'{nome}.png'), escala=(96 if nome == 'tv-netflix' else 44) / im.width); man['objetos'][nome] = {'w': ob.width, 'h': ob.height}
# ---------- ícones (folha em grade 15×9 sobre xadrez; fica só o componente do ícone no centro da célula) ----------
ICONES = {'arquivos': (1, 0), 'navegador': (2, 3), 'notas': (3, 0), 'calculadora': (0, 0), 'config': (8, 12), 'instagram': (7, 12), 'galeria': (3, 1), 'chrome': (5, 10), 'lixeira': (7, 2), 'terminal': (6, 3), 'musica': (2, 12)}
im = Image.open(os.path.join(F, 'icones-desktop.jpg')).convert('RGB'); A = np.array(im).astype(int)
AJUSTE = {(5, 10): 39, (7, 2): 38}                                     # células em que o ícone vizinho invade a janela: largura menor
def icone(j, i):
    x0 = int(12 + i * 47.6) - 1; y0 = int(25 + j * 51.0) - 3; c = A[y0:y0 + 52, x0:x0 + AJUSTE.get((j, i), 46)]
    mx, mn = c.max(2), c.min(2); xadrez = ((mx - mn) < 10) & (mn > 150) & (mx < 200)
    fg = ndi.binary_opening(~xadrez, iterations=1); lab4, n = ndi.label(fg)
    cy, cx = 26, 24; alvo = lab4[cy, cx] or (1 + int(np.argmax(ndi.sum(fg, lab4, range(1, n + 1)))))
    m = ndi.binary_fill_holes(lab4 == alvo); m2 = ndi.binary_opening(m, iterations=2); l5, n5 = ndi.label(m2)            # corta pontes finas com ícones vizinhos
    if n5: m = ndi.binary_dilation(l5 == (1 + int(np.argmax(ndi.sum(m2, l5, range(1, n5 + 1))))), iterations=2) & m
    col = m.sum(0); pico = col.max()                                                                      # tira lascas de ícones vizinhos coladas nas bordas
    for lado in (range(m.shape[1]), range(m.shape[1] - 1, -1, -1)):
        vistas = [x for x in lado if col[x] > 0]
        for x in vistas[:8]:
            if col[x] < pico * 0.45: m[:, x] = False
            else: break
    ys, xs = np.where(m)
    return Image.fromarray(rgba_de(c.astype(np.uint8), m)).crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
for nome, (j, i) in ICONES.items():
    ic = icone(j, i); ic.save(os.path.join(PUB, 'icones', f'{nome}.png')); man['icones'][nome] = {'w': ic.width, 'h': ic.height}
# ícone do banco: não existe na folha — pixel art simples gerada aqui (cartão verde com cifrão)
B = Image.new('RGBA', (24, 24), (0, 0, 0, 0)); px = B.load()
for y in range(4, 20):
    for x in range(1, 23): borda = y in (4, 19) or x in (1, 22); px[x, y] = (20, 30, 24, 255) if borda else ((46, 160, 90, 255) if y > 7 else (30, 110, 60, 255))
for (x, y) in [(11, 9), (12, 9), (13, 9), (10, 10), (10, 11), (11, 12), (12, 12), (13, 13), (13, 14), (10, 15), (11, 15), (12, 15), (12, 8), (11, 16)]: px[x, y] = (250, 240, 200, 255)
for x in range(3, 8): px[x, 17] = (250, 240, 200, 255)
B = B.resize((48, 48), Image.NEAREST); B.save(os.path.join(PUB, 'icones', 'banco.png')); man['icones']['banco'] = {'w': 48, 'h': 48}
# ícone da loja: a folha não tem sacola de compras — usa a bolsa rosa recortada dos itens (mesma arte do jogo) sobre um quadrado laranja
L = Image.new('RGBA', (48, 48), (0, 0, 0, 0)); lp = L.load()
for y in range(2, 46):
    for x in range(2, 46): lp[x, y] = (20, 16, 24, 255) if x in (2, 45) or y in (2, 45) else (240, 150, 60, 255) if y < 30 else (210, 110, 40, 255)
bolsa = Image.open(os.path.join(PUB, 'itens', 'bolsa-rosa.png')).convert('RGBA'); bolsa.thumbnail((34, 34), Image.LANCZOS); L.alpha_composite(bolsa, ((48 - bolsa.width) // 2, (48 - bolsa.height) // 2 + 1))
L.save(os.path.join(PUB, 'icones', 'loja.png')); man['icones']['loja'] = {'w': 48, 'h': 48}
json.dump(man, open(MAN, 'w'), indent=1, ensure_ascii=False)
print('ok', {k: len(v) for k, v in man.items() if isinstance(v, dict)})
