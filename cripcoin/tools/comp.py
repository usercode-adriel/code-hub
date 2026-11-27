# utilitário: remove o fundo (preenchimento a partir das bordas) e lista os componentes de uma folha
import sys, numpy as np, cv2
from scipy import ndimage as ndi
from PIL import Image
def mascara(rgb, tol=12, sementes=None):
    h, w, _ = rgb.shape; mask = np.zeros((h + 2, w + 2), np.uint8)
    pts = sementes or [(2, 2), (w - 3, 2), (2, h - 3), (w - 3, h - 3), (w // 2, 2), (w // 2, h - 3), (2, h // 2), (w - 3, h // 2)]
    for sx, sy in pts:
        if mask[sy + 1, sx + 1]: continue
        cv2.floodFill(rgb.copy(), mask, (sx, sy), (0, 0, 0), (tol,) * 3, (tol,) * 3, cv2.FLOODFILL_MASK_ONLY | (255 << 8))
    return mask[1:-1, 1:-1] == 0
def componentes(solido, minimo=200, fechar=2):
    lab, n = ndi.label(ndi.binary_closing(solido, iterations=fechar) if fechar else solido)
    out = []
    for i, sl in enumerate(ndi.find_objects(lab), 1):
        area = int((lab[sl] == i).sum())
        if area >= minimo: out.append((sl[0].start, sl[1].start, sl[0].stop, sl[1].stop, area, i))
    return lab, out
if __name__ == '__main__':
    f, tol, mn = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
    rgb = np.array(Image.open(f).convert('RGB')); s = mascara(rgb, tol); lab, cs = componentes(s, mn)
    cs.sort(key=lambda c: (round(c[0] / 60), c[1]))
    print(len(cs)); [print(c[:5]) for c in cs]
