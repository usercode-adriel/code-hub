"""Peças do sistema prisional (cela, delegacia e blitz) recortadas da folha tools/drive/src/personagens/prisao.webp.

O fundo da folha é um xadrez claro (falso transparente): vira transparente a região clara e sem cor ligada às bordas.
Cada peça é a figura de índice N (ordem de leitura) e sai em public/assets/rpg/prisao/<nome>.png, reduzida à metade.
Uso: python3 tools/drive/prisao.py
"""
import json, os
import numpy as np
from PIL import Image
from scipy import ndimage as nd

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, '..', '..', 'public', 'assets', 'rpg', 'prisao')
META = os.path.join(ROOT, '..', '..', 'public', 'assets', 'rpg', 'meta.json')
PIECES = {
    'piso': 2, 'piso-escuro': 21, 'piso-claro': 20, 'parede': 17, 'parede2': 44, 'grade': 36, 'porta-grade': 35,
    'porta': 32, 'cama': 71, 'cama2': 72, 'vaso': 105, 'pia': 109, 'camera': 8, 'camera2': 9, 'sirene': 19,
    'banco': 114, 'planta': 100, 'cone': 116, 'cavalete': 117, 'barreira': 118, 'mesa': 61, 'cadeira': 58,
    'armarios': 67, 'bebedouro': 68, 'extintor': 52, 'primeiros-socorros': 53, 'quadro': 56, 'janela-grade': 49,
    'luminaria': 102, 'relogio-ponto': 54, 'mesa-metal': 78,
}


def main():
    a = np.array(Image.open(os.path.join(ROOT, 'src', 'personagens', 'prisao.webp')).convert('RGB')).astype(int)
    mx = a.max(2); mn = a.min(2)
    lab, n = nd.label((mn > 200) & ((mx - mn) < 14))
    border = set(np.unique(np.r_[lab[0], lab[-1], lab[:, 0], lab[:, -1]])) - {0}
    fg = nd.binary_opening(~np.isin(lab, list(border)), iterations=1)
    lab, n = nd.label(fg); objs = nd.find_objects(lab); sizes = nd.sum(fg, lab, range(1, n + 1))
    keep = [(i + 1, s) for i, (s, z) in enumerate(zip(objs, sizes)) if z > 150]
    keep.sort(key=lambda t: (t[1][0].start // 40, t[1][1].start))
    os.makedirs(OUT, exist_ok=True)
    meta = json.load(open(META))
    for name, idx in PIECES.items():
        li, s = keep[idx]
        crop = np.dstack([a[s].astype(np.uint8), np.where(lab[s] == li, 255, 0).astype(np.uint8)])
        im = Image.fromarray(crop, 'RGBA'); im = im.resize((max(1, im.width // 2), max(1, im.height // 2)), Image.LANCZOS)
        p = np.array(im); p[..., 3] = np.where(p[..., 3] > 110, 255, 0); im = Image.fromarray(p, 'RGBA')
        im.save(os.path.join(OUT, name + '.png'), optimize=True)
        meta[f'prisao/{name}'] = [im.width, im.height]
    json.dump(meta, open(META, 'w'), ensure_ascii=False)
    print(len(keep), 'peças na folha;', len(PIECES), 'salvas')


if __name__ == '__main__':
    main()
