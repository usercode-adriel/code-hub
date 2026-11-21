"""Recorta os veículos da prancha (fundo verde texturizado + legendas) em sprites individuais.
Uso: python3 tools/mundo/recortar_veiculos.py <prancha.png> <pasta-saida>
- fundo: verde escuro ligado à borda (preenchimento por região); o contorno escuro protege o interior do carro
- legendas (texto claro) ficam de fora: só componentes grandes e não-brancos são veículos
- a prancha em alta resolução é 4× da arte: reduz com filtro de caixa (pixels nítidos)
- a frente do veículo fica à esquerda na prancha: gira para a frente ficar em cima (formato do jogo)"""
import json, sys, os
import numpy as np
from PIL import Image
from scipy import ndimage

NOMES = [
 ['pickup','benson','jefferson','taxi','panto','box-truck'],
 ['cop-car','stinger','stretch-limousine','spritzer','schmidt','redneck'],
 ['wellard','eddy','bug','bulwark','jagular-xk','shark'],
 ['tv-van','morton','medicar','dementia','truck-cab','taxi-xpress'],
 ['minx','maurice','furore-gt','trans-am','meteor','big-bug'],
 ['hachura','arachnid','z-type','sports-limousine','karma-bus'],
 ['t-rex','garbage-truck','fire-truck','truck-cab-sx','romero'],
 ['michelli-roadster','rumbler','aniston-bd4','beamer','bus'],
 ['a-type','ice-cream-van','g4-bank-van','van','hot-dog-van'],
 ['land-roamer','dementia-limousine','u-jerk-truck','b-type','miara','gt-a1'],
 ['armed-land-roamer','special-agent-car','swat-van','pacifier','tank'],
]

def main(src, out):
    im = Image.open(src).convert('RGB')
    a = np.asarray(im).astype(np.int16)
    R, G, B = a[..., 0], a[..., 1], a[..., 2]
    # fundo: verde escuro pouco saturado (o tecido da prancha) e sombras projetadas dele
    # (o azul alto separa o tecido dos carros verdes e oliva, que quase não têm azul; tons escuros esverdeados são a sombra)
    fundo = ((G > R + 12) & (G > B + 4) & (G < 120) & (R < 70) & (B > 0.55 * G) & (B >= 30)) | ((G > R + 5) & (G > B) & (G < 70) & (B > 0.5 * G))
    lab, _ = ndimage.label(fundo)
    borda = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    bg = np.isin(lab, borda[borda > 0])
    # legendas: letras são manchas brancas pequenas (as partes brancas dos carros são grandes); apaga letra + contorno
    branco = (a.min(axis=2) > 200)
    lb, nb = ndimage.label(branco)
    tam = ndimage.sum(branco, lb, range(1, nb + 1))
    caixas = ndimage.find_objects(lb)
    letras = np.zeros_like(branco)
    for k, (t, sl) in enumerate(zip(tam, caixas), 1):
        if t < 6000 and (sl[0].stop - sl[0].start) < 90 and (sl[1].stop - sl[1].start) < 140: letras[sl] |= lb[sl] == k
    escuro = a.max(axis=2) < 80
    apagar = ndimage.binary_dilation(letras, iterations=10) & (escuro | branco | letras)
    bg = bg | apagar
    fg = ndimage.binary_opening(~bg, iterations=3)
    # peças do mesmo veículo (ex.: cabine separada da caixa por um traço escuro) são agrupadas pela proximidade
    grupo, n = ndimage.label(ndimage.binary_dilation(fg, iterations=6))
    comp = np.where(fg, grupo, 0)
    objs = ndimage.find_objects(comp)
    H, W = fg.shape
    cand = []
    for i, sl in enumerate(objs, 1):
        h = sl[0].stop - sl[0].start; w = sl[1].stop - sl[1].start
        if h < H * 0.045 or w < W * 0.08: continue  # legendas (≈3% da altura), letras e ruído
        area = (comp[sl] == i).sum()
        pix = a[sl][comp[sl] == i]
        branco = ((pix.min(axis=1)) > 200).mean()
        if branco > 0.5: continue  # legenda
        cand.append((sl, i, area))
    # ordena em linhas: agrupa por centro vertical
    cand.sort(key=lambda c: (c[0][0].start + c[0][0].stop) / 2)
    linhas = []
    for c in cand:
        cy = (c[0][0].start + c[0][0].stop) / 2
        if linhas and abs(cy - linhas[-1][0]) < H * 0.04: linhas[-1][1].append(c)
        else: linhas.append([cy, [c]])
    print('linhas detectadas:', [len(l[1]) for l in linhas])
    esperado = [len(r) for r in NOMES]
    if [len(l[1]) for l in linhas] != esperado:
        raise SystemExit(f'contagem diferente do esperado {esperado}')
    os.makedirs(out, exist_ok=True)
    meta = {}
    alpha_full = np.where(bg, 0, 255).astype(np.uint8)
    for (cy, row), nomes in zip(linhas, NOMES):
        row.sort(key=lambda c: c[0][1].start)
        for (sl, i, _), nome in zip(row, nomes):
            y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
            rgb = np.asarray(im)[y0:y1, x0:x1]
            al = np.where(comp[y0:y1, x0:x1] == i, 255, 0).astype(np.uint8)
            spr = Image.fromarray(np.dstack([rgb, al]), 'RGBA')
            spr = spr.resize((max(1, spr.width // 4), max(1, spr.height // 4)), Image.BOX)
            # limpa a borda semitransparente da redução (pixel art: alfa binário)
            px = np.asarray(spr).copy(); px[..., 3] = np.where(px[..., 3] >= 128, 255, 0); spr = Image.fromarray(px, 'RGBA')
            # descarta fragmentos soltos (restos de contorno de letra): fica só o que tem ≥ 2% da maior peça
            al2 = np.asarray(spr)[..., 3] > 0; pl, pn = ndimage.label(al2)
            if pn > 1:
                ar = ndimage.sum(al2, pl, range(1, pn + 1)); manter = np.isin(pl, [k + 1 for k, v in enumerate(ar) if v >= 0.02 * ar.max()])
                px = np.asarray(spr).copy(); px[..., 3] = np.where(manter, px[..., 3], 0); spr = Image.fromarray(px, 'RGBA')
            spr = spr.rotate(-90, expand=True)  # frente (esquerda) para cima
            spr = spr.crop(spr.getchannel('A').getbbox())
            spr.save(f'{out}/{nome}.png')
            meta[f'veiculos/{nome}'] = [spr.width, spr.height]
    json.dump(meta, open(f'{out}/meta.json', 'w'), indent=0)
    print('salvos', len(meta))

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
