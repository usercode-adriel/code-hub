import sys, numpy as np, cv2
from scipy import ndimage as ndi
from PIL import Image
src, out = sys.argv[1], sys.argv[2]
im = np.array(Image.open(src).convert('RGB')).astype(int)
mx, mn = im.max(2), im.min(2)
cand = ((mx - mn) <= 7) & (mn >= 208)
lab, n = ndi.label(cand)
borda = set(lab[0, :]) | set(lab[-1, :]) | set(lab[:, 0]) | set(lab[:, -1]); borda.discard(0)
bg = np.isin(lab, list(borda))
# dilata o fundo 1px para comer o halo claro e guarda o alfa
bg = ndi.binary_dilation(bg, iterations=1) & ((mx - mn) <= 14) & (mn >= 190) | bg
alpha = (~bg).astype(np.uint8) * 255
# remove ruído pequeno
lab2, n2 = ndi.label(alpha > 0)
tam = ndi.sum(alpha > 0, lab2, range(1, n2 + 1))
for i, t in enumerate(tam, 1):
    if t < 60: alpha[lab2 == i] = 0
rgba = np.dstack([im.astype(np.uint8), alpha])
Image.fromarray(rgba, 'RGBA').save(out)
# prévia sobre magenta
prev = np.array(Image.fromarray(rgba, 'RGBA').convert('RGBA'))
bgm = np.zeros_like(prev); bgm[..., :3] = (255, 0, 255); bgm[..., 3] = 255
a = prev[..., 3:4] / 255
comp = (prev[..., :3] * a + bgm[..., :3] * (1 - a)).astype(np.uint8)
Image.fromarray(comp).save(out.replace('.png', '-prev.png'))
print(src, rgba.shape, int((alpha > 0).sum()))
