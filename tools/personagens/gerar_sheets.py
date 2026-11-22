"""Gera os personagens do jogo (folhas no formato do jogo) a partir das peças do LPC em public/assets/personagens.

Saídas (em public/assets/rpg/chr/): <chave>.png (4 passos × 7 linhas: frente, direita, costas, esquerda,
correr direita, correr esquerda, parado) e <chave>-rx.png (7 colunas × 10 reações, células 64×56, pés na linha 54).
Quedas (caido, atropelado, baleado, morto) são procedurais: o personagem gira em torno dos pés, porque o LPC não traz queda.
Também grava meta.json (folhas) e atualiza public/js/drive/chrmeta.js (CHR e RX).

Uso: python3 tools/personagens/gerar_sheets.py
"""
import json, os, random
from PIL import Image

RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
PECAS = os.path.join(RAIZ, 'public/assets/personagens')
SAIDA = os.path.join(RAIZ, 'public/assets/rpg/chr')
QUADRO = 64           # quadro do LPC (o personagem ocupa ~32×48 px dentro dele)
ESCALA = 1.0          # quadro do jogo = 64 px: mesmo tamanho do LPC, o personagem fica do tamanho certo
FQ = int(QUADRO * ESCALA)
CELULA_RX = (112, 96); BASE_RX = 80  # célula maior para a queda girar sem cortar; pés nessa linha
ORDEM = ['corpo', 'roupa-baixo', 'roupa-cima', 'calcado', 'cabelo', 'chapeu']
REACOES = ['atropelado', 'baleado', 'caido', 'ferido', 'morto', 'morto-sentado', 'morto-de-pe', 'sangramento', 'dor', 'quase-morte']
QTD = {'atropelado': 7, 'baleado': 6, 'caido': 6, 'ferido': 7, 'morto': 4, 'morto-sentado': 4, 'morto-de-pe': 5, 'sangramento': 6, 'dor': 5, 'quase-morte': 7}
LPC_LINHA = {'cima': 0, 'esquerda': 1, 'baixo': 2, 'direita': 3}

def carregar_pecas():
    man = json.load(open(os.path.join(PECAS, 'manifesto.json'), encoding='utf-8'))
    cat = {}
    for c, itens in man['camadas'].items():
        cat[c] = [i['pasta'] for i in itens]
    return cat

def anim(pasta, nome):
    return Image.open(os.path.join(PECAS, pasta, nome + '.png')).convert('RGBA')

def quadro(img, linha, col, quadro_w=QUADRO, quadro_h=QUADRO):
    return img.crop((col * quadro_w, linha * quadro_h, (col + 1) * quadro_w, (linha + 1) * quadro_h))

def compor(pastas, nome, linha, col, qw=QUADRO, qh=QUADRO):
    """empilha as camadas (na ordem de desenho) do mesmo quadro"""
    base = Image.new('RGBA', (qw, qh), (0, 0, 0, 0))
    for pasta in pastas:
        if pasta is None: continue
        base.alpha_composite(quadro(anim(pasta, nome), linha, col, qw, qh))
    return base

def ancoragem(im):
    """ponto dos pés (centro horizontal da base do desenho)"""
    bb = im.getchannel('A').getbbox()
    if bb is None: return (QUADRO // 2, QUADRO - 4)
    return ((bb[0] + bb[2]) // 2, bb[3])

def redimensionar(im):
    return im.resize((FQ, FQ), Image.NEAREST)

def montar_principal(pastas):
    folha = Image.new('RGBA', (4 * FQ, 7 * FQ), (0, 0, 0, 0))
    # andar: frente, direita, costas, esquerda (linhas LPC baixo, direita, cima, esquerda); passos 1,3,5,7
    ordem_andar = [LPC_LINHA['baixo'], LPC_LINHA['direita'], LPC_LINHA['cima'], LPC_LINHA['esquerda']]
    for linha_jogo, linha_lpc in enumerate(ordem_andar):
        for passo, col in enumerate([1, 3, 5, 7]):
            folha.paste(redimensionar(compor(pastas, 'walk', linha_lpc, col)), (passo * FQ, linha_jogo * FQ))
    # correr: a folha 'run' do LPC tem 8 quadros por direção; direita (linha 3) e esquerda (linha 1)
    for linha_jogo, linha_lpc in [(4, LPC_LINHA['direita']), (5, LPC_LINHA['esquerda'])]:
        for passo, col in enumerate([0, 2, 4, 6]):
            folha.paste(redimensionar(compor(pastas, 'run', linha_lpc, col)), (passo * FQ, linha_jogo * FQ))
    # parado (extra): baixo, quadro 0, repetido nos 4 passos
    # parado: a folha 'idle' do LPC tem um quadro por direção (coluna 0); cada direção parada vai para o passo certo
    for passo, linha_lpc in enumerate([LPC_LINHA['baixo'], LPC_LINHA['direita'], LPC_LINHA['cima'], LPC_LINHA['esquerda']]):
        folha.paste(redimensionar(compor(pastas, 'idle', linha_lpc, 0)), (passo * FQ, 6 * FQ))
    return folha

def celula_queda(parado_img, angulo, pivo_x=None, pivo_y=BASE_RX):
    """personagem parado girado em torno dos pés: 0° em pé, 90° deitado para a direita"""
    pivo_x = CELULA_RX[0] // 2 if pivo_x is None else pivo_x
    # gira num canvas do dobro do tamanho (sem corte) e depois recorta de volta, centralizado nos pés
    grande = Image.new('RGBA', (CELULA_RX[0] * 2, CELULA_RX[1] * 2), (0, 0, 0, 0))
    ax, ay = ancoragem(parado_img)
    ox = CELULA_RX[0] - int(round(ax * ESCALA))
    grande.alpha_composite(parado_img, (ox, pivo_y + CELULA_RX[1] // 2 - int(round(ay * ESCALA))))
    cx, cy = CELULA_RX[0], pivo_y + CELULA_RX[1] // 2
    if angulo:
        grande = grande.rotate(-angulo, resample=Image.NEAREST, center=(cx, cy), fillcolor=(0, 0, 0, 0))
    return grande.crop((cx - pivo_x, cy - pivo_y, cx - pivo_x + CELULA_RX[0], cy - pivo_y + CELULA_RX[1]))

def montar_rx(pastas):
    folha = Image.new('RGBA', (7 * CELULA_RX[0], 10 * CELULA_RX[1]), (0, 0, 0, 0))
    parado = redimensionar(compor(pastas, 'idle', LPC_LINHA['baixo'], 0))
    sit = [redimensionar(compor(pastas, 'sit', LPC_LINHA['baixo'], c)) for c in range(3)]
    hurt = [redimensionar(compor(pastas, 'hurt', 0, c, QUADRO, QUADRO)) for c in range(6)]
    # cada célula tem o mesmo sistema de pés: o desenho do quadro LPC vai para a base do quadro do jogo
    for linha, nome in enumerate(REACOES):
        n = QTD[nome]
        for i in range(n):
            if nome in ('ferido', 'dor', 'sangramento', 'quase-morte'):
                cel = celula_queda(hurt[i % len(hurt)], 0)
            elif nome == 'morto-sentado':
                cel = celula_queda(sit[i % len(sit)], 0)
            elif nome == 'morto-de-pe':
                cel = celula_queda(parado, -4 - 5 * i)  # inclina para trás aos poucos
            else:
                # quedas: angulo cresce até 90° (caido/baleado mais rápido; atropelado já voa; morto fica no chão)
                passos = {'caido': [0, 15, 35, 60, 80, 90], 'baleado': [0, 30, 60, 75, 90, 90, 90], 'atropelado': [0, 45, 80, 90, 90, 90, 90], 'morto': [90, 90, 90, 90]}[nome]
                cel = celula_queda(parado, passos[min(i, len(passos) - 1)])
            folha.paste(cel, (i * CELULA_RX[0], linha * CELULA_RX[1]))
    return folha

def personagens():
    cat = carregar_pecas()
    rng = random.Random(20261122)
    lista = []
    # nomes usados pelo código (policia, saude, civil) mantêm as chaves antigas
    fixos = [('policial', 'Policial', 'policia', 'm', 0), ('policial2', 'Policial (f)', 'policia', 'f', 1), ('enfermeira', 'Enfermeira', 'saude', 'f', 1), ('barbudo', 'Barbudo de camisa polo', 'civil', 'm', 0)]
    for chave, nome, papel, g, corpo in fixos:
        lista.append((chave, nome, papel, g, corpo))
    for i in range(1, 9):
        g = rng.choice([0, 1])
        lista.append((f'civil-{i}', f'Morador {i}', 'civil', 'm' if g == 0 else 'f', g))
    return cat, lista

def escolher(cat, corpo_idx, rng):
    pecas = {'corpo': cat['corpo'][corpo_idx]}
    for c in ['roupa-baixo', 'roupa-cima', 'calcado', 'cabelo', 'chapeu']:
        opcoes = cat.get(c, [])
        pecas[c] = rng.choice(opcoes) if opcoes and (c != 'chapeu' or rng.random() < 0.4) else None
    return [pecas[c] for c in ORDEM]

def main():
    cat, lista = personagens()
    rng = random.Random(7)
    os.makedirs(SAIDA, exist_ok=True)
    meta = {}; chr_py = {}; rx = {'cell': list(CELULA_RX), 'base': BASE_RX, 'stand': 45, 'order': REACOES}
    for chave, nome, papel, g, corpo in lista:
        pastas = escolher(cat, corpo, rng)
        principal = montar_principal(pastas); principal.save(os.path.join(SAIDA, f'{chave}.png'))
        rxf = montar_rx(pastas); rxf.save(os.path.join(SAIDA, f'{chave}-rx.png'))
        entrada = {'name': nome, 'role': papel, 'g': g, 'w': FQ, 'h': FQ, 'rows': 7, 'rx': dict(QTD), 'camadas': [p for p in pastas if p]}
        chr_py[chave] = {k: v for k, v in entrada.items() if k != 'camadas'}
        meta[f'{chave}'] = {k: v for k, v in entrada.items() if k != 'camadas'}
        print(chave, papel, [p for p in pastas if p])
    # limpa os personagens antigos (qualquer PNG de chr que não é deste conjunto)
    novos = {f'{c}.png' for c, *_ in lista} | {f'{c}-rx.png' for c, *_ in lista}
    for f in os.listdir(SAIDA):
        if f.endswith('.png') and f not in novos: os.remove(os.path.join(SAIDA, f))
    json.dump(meta, open(os.path.join(SAIDA, 'meta.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    js = ('// personagens animados — gerado por tools/personagens/gerar_sheets.py (não editar à mão)\n'
          '// folha <chave>.png: linhas frente, direita, costas, esquerda (4 passos), corrida direita, corrida esquerda, parado\n'
          '// folha <chave>-rx.png: uma linha por reação (RX.order), quadros de RX.cell com os pés em RX.base\n'
          f'export const CHR = {json.dumps(chr_py, ensure_ascii=False)};\n'
          f'export const RX = {json.dumps(rx, ensure_ascii=False)};\n')
    open(os.path.join(RAIZ, 'public/js/drive/chrmeta.js'), 'w', encoding='utf-8').write(js)
    print('personagens:', len(lista))

if __name__ == '__main__':
    main()
