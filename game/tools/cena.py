# Recorta, um a um, os objetos da cena isométrica "Office" (@pixel_salvaje) — game/assets-fonte/cena-office-pixel_salvaje.gif (frame 0).
# Método: pixels de 2x2 voltam ao tamanho nativo; as 5 cores de fundo (fundo escuro, 2 paredes, 2 pisos) são removidas; cada bloco de pixels
# restante, conectado, vira um recorte (buracos preenchidos com as cores originais). Blocos de objetos encostados uns nos outros (baias, mesas+cadeiras)
# saem juntos; peças menores soltas (quadros, extintor, etc.) saem separadas. Saída: game/office/public/arte/cena/*.png + manifesto.json.
# ATENÇÃO: a arte é de terceiros; a licença NÃO foi informada. Confirme com o autor antes de uso público/comercial.
import json, os, sys, numpy as np
from collections import deque
from scipy import ndimage as ndi
from PIL import Image
RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SAIDA = os.path.join(RAIZ, 'office', 'public', 'arte', 'cena'); os.makedirs(SAIDA, exist_ok=True)
im = Image.open(os.path.join(RAIZ, 'assets-fonte', 'cena-office-pixel_salvaje.gif')); im.seek(0)
nat = im.convert('RGB').resize((im.width // 2, im.height // 2), Image.NEAREST); A = np.array(nat).astype(int)
BG = np.array([(37, 38, 41), (203, 201, 202), (224, 224, 224), (39, 136, 185), (3, 116, 158)])
# (nome, x0, y0, x1, y1) na imagem inteira (1480x1024). Cada caixa abraça um objeto; o fundo sai por preenchimento a partir da borda da caixa.
OBJ = [
 ('relogio-parede', 690, 144, 758, 216), ('placa-saida', 543, 110, 604, 182), ('diploma-moldura', 378, 180, 458, 278), ('mural-cortica', 468, 203, 588, 304),
 ('grade-ventilacao', 182, 246, 294, 347), ('tv-preta-parede', 266, 286, 392, 397), ('placa-extintor', 181, 370, 222, 420), ('quadro-flipchart', 220, 378, 322, 562),
 ('extintor', 178, 536, 217, 614), ('multifuncional-branca', 320, 418, 432, 562), ('caixa-arquivo-branca', 220, 576, 292, 636), ('projetor-tripe', 288, 543, 367, 670),
 ('armario-madeira', 398, 270, 522, 522), ('pastas-coloridas', 400, 270, 486, 352), ('mesinha-cafe', 518, 326, 640, 424), ('bebedouro', 594, 276, 672, 374),
 ('cadeira-preta-dobravel', 574, 394, 642, 494), ('lixeira-cinza', 522, 438, 568, 496), ('robo-aspirador', 564, 512, 620, 574),
 ('porta-azul', 666, 216, 774, 362), ('quadro-fluxograma', 784, 232, 876, 388), ('quadro-grafico-barras', 882, 296, 950, 394), ('ar-condicionado', 922, 240, 1032, 328),
 ('quadro-branco-parede', 994, 344, 1122, 506), ('poster-laranja', 1084, 320, 1164, 422), ('quadro-escala', 1188, 390, 1266, 482), ('placa-primeiros-socorros', 1286, 416, 1322, 468),
 ('estante-metal-caixas', 1164, 488, 1334, 742), ('arquivo-cinza-4-gavetas', 1114, 494, 1172, 686), ('planta-sobre-livros', 1146, 434, 1212, 510),
 ('baia-1-monitor-curvo', 674, 318, 922, 562), ('baia-2-prancheta-desenho', 858, 412, 1092, 700), ('baia-3-monitores', 572, 558, 792, 806), ('baia-4-computador-antigo', 758, 648, 1002, 900),
 ('mesa-escura-mac-tapete', 378, 528, 572, 742), ('cadeira-escritorio', 690, 440, 772, 562),
 ('copiadora-preta-grande', 1002, 692, 1120, 858), ('impressora-pequena', 946, 828, 1036, 902), ('lixeira-com-latas', 888, 860, 944, 942), ('torre-pc-preta', 710, 788, 754, 872),
 ('banqueta-metal', 1112, 756, 1166, 826), ('cadeira-fina-metal', 1176, 712, 1232, 796), ('caixa-papelao', 536, 690, 590, 752), ('lata-vermelha', 868, 918, 892, 946),
]
def sem_fundo(sub):
    h, w, _ = sub.shape; ok = np.zeros((h, w), bool)
    for c in BG: ok |= (sub == c).all(2)
    visto = np.zeros((h, w), bool); fila = deque()
    for x in range(w):
        for y in (0, h - 1):
            if ok[y, x] and not visto[y, x]: visto[y, x] = True; fila.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if ok[y, x] and not visto[y, x]: visto[y, x] = True; fila.append((y, x))
    while fila:
        y, x = fila.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and ok[ny, nx] and not visto[ny, nx]: visto[ny, nx] = True; fila.append((ny, nx))
    fg = ~visto
    lab, n = ndi.label(fg, structure=np.ones((3, 3)))              # fica só o maior bloco conectado (descarta pedaços de vizinhos soltos)
    if n > 1:
        tam = ndi.sum(fg, lab, range(1, n + 1)); fg = lab == (1 + int(np.argmax(tam)))
    return ndi.binary_fill_holes(fg)

man = {'origem': 'cena "Office" de @pixel_salvaje (gif fornecido pelo usuário, frame 0)', 'licenca': 'não informada — confirmar com o autor antes de uso público/comercial', 'pixel': '2x2 → nativo', 'itens': {}}
for nome, x0, y0, x1, y1 in OBJ:
    sub = A[y0 // 2:y1 // 2, x0 // 2:x1 // 2]; mask = sem_fundo(sub)
    rgba = np.dstack([sub.astype(np.uint8), (mask * 255).astype(np.uint8)])
    img = Image.fromarray(rgba, 'RGBA'); bb = img.getbbox()
    if not bb: print('vazio', nome); continue
    img = img.crop(bb); img.save(os.path.join(SAIDA, f'{nome}.png')); man['itens'][nome] = {'w': img.width, 'h': img.height, 'caixa': [x0, y0, x1, y1]}
json.dump(man, open(os.path.join(SAIDA, 'manifesto.json'), 'w'), indent=1, ensure_ascii=False)
print(len(man['itens']), 'recortes')
