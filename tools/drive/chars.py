# Recorta as folhas de personagens (4 painéis de profissões/estilos, cada painel com 4 linhas × 4 quadros de
# caminhada) e monta, para cada personagem, uma folha 4×4 com os quadros alinhados pelos pés:
#   linha 0 = de frente (descendo), 1 = andando para a direita, 2 = de costas (subindo), 3 = para a esquerda.
# Saída: public/assets/rpg/chr/<chave>.png, public/assets/rpg/chr/meta.json e public/js/drive/chrmeta.js.
# Uso: python3 tools/drive/chars.py <pasta com 7.webp 8.webp 9.webp 10.webp>
import numpy as np, json, sys, os, cv2
from PIL import Image
from collections import deque
from scipy import ndimage

SRC = sys.argv[1] if len(sys.argv) > 1 else '/tmp/claude-0/-home-user-code-hub/ecd13ed2-02c5-5b53-9ec4-04b4e1b3ffd5/images/'
ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
OUT = os.path.join(ROOT, 'public/assets/rpg/chr/'); os.makedirs(OUT, exist_ok=True)
# painéis em ordem de leitura: (chave, nome, papel)
SHEETS = {
    '7.webp': [('policial', 'Policial', 'policia'), ('medico', 'Médico', 'saude'), ('enfermeira', 'Enfermeira', 'saude'), ('bombeiro', 'Bombeiro', 'bombeiro'), ('comerciante', 'Comerciante', 'comercio'), ('entregador', 'Entregador', 'entrega'),
               ('construtor', 'Construtor', 'obra'), ('garcom', 'Garçom', 'comercio'), ('estudante-f', 'Estudante', 'estudante'), ('estudante-m', 'Estudante', 'estudante'), ('executiva', 'Executiva', 'executivo'), ('executivo', 'Executivo', 'executivo'),
               ('padre', 'Padre', 'religioso'), ('freira', 'Freira', 'religioso'), ('ciclista', 'Ciclista', 'civil'), ('idosa', 'Idosa', 'idoso'), ('crianca', 'Criança', 'crianca'), ('cadeirante', 'Cadeirante', 'civil')],
    '8.webp': [('executivo-terno', 'Executivo', 'executivo'), ('mulher', 'Mulher', 'civil'), ('idoso', 'Idoso', 'idoso'), ('turista', 'Turista', 'turista'),
               ('estudante-mochila', 'Estudante', 'estudante'), ('trabalhador', 'Trabalhador', 'obra'), ('jovem', 'Jovem', 'civil'), ('empresaria', 'Empresária', 'executivo')],
    '9.webp': [('executivo2', 'Executivo', 'executivo'), ('entregador2', 'Entregador', 'entrega'), ('estudante2', 'Estudante', 'estudante'), ('policial2', 'Policial', 'policia'),
               ('faxineira', 'Faxineira', 'limpeza'), ('medica', 'Médica', 'saude'), ('vendedora', 'Vendedora', 'comercio'), ('motoboy', 'Motoboy', 'entrega')],
    '10.webp': [('aventureiro', 'Aventureiro', 'fantasia'), ('cavaleiro', 'Cavaleiro', 'fantasia'), ('mago', 'Mago', 'fantasia'), ('arqueiro', 'Arqueiro', 'fantasia'),
                ('samurai', 'Samurai', 'fantasia'), ('mercenario', 'Mercenário', 'fantasia'), ('nobre', 'Nobre', 'fantasia'), ('ladino', 'Ladino', 'fantasia')],
}


def load(f):
    im = Image.open(SRC + f).convert('RGBA'); bg = Image.new('RGBA', im.size, (255, 255, 255, 255)); bg.alpha_composite(im)
    return np.asarray(bg.convert('RGB')).astype(int)


def groups(vals, n):
    # agrupa coordenadas em n grupos pelos maiores vãos
    s = sorted(vals); gaps = sorted(range(1, len(s)), key=lambda i: s[i] - s[i - 1], reverse=True)[:n - 1]
    cuts = sorted(s[i] for i in gaps)
    return lambda v: sum(v >= c for c in cuts)


def cut_out(rgb):
    # fundo claro ligado às bordas do recorte vira transparente
    H, W = rgb.shape[:2]; light = rgb.min(-1) > 214
    a = np.full((H, W), 255, np.uint8); seen = np.zeros((H, W), bool); q = deque()
    for x in range(W): q += [(x, 0), (x, H - 1)]
    for y in range(H): q += [(0, y), (W - 1, y)]
    while q:
        x, y = q.popleft()
        if x < 0 or y < 0 or x >= W or y >= H or seen[y, x] or not light[y, x]: continue
        seen[y, x] = True; a[y, x] = 0; q.extend([(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)])
    # só as partes grandes (restos dos pés/cabeças dos quadros vizinhos ficam de fora)
    lab, n = ndimage.label(a > 0)
    if n > 1:
        sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1)); keep = np.isin(lab, [i + 1 for i, v in enumerate(sizes) if v >= sizes.max() * 0.15]); a[~keep] = 0
    return np.dstack([rgb.astype(np.uint8), a])


meta = {}
for f, names in SHEETS.items():
    rgb = load(f); fg = (rgb.min(-1) <= 200).astype(np.uint8)
    n, lb, st, _ = cv2.connectedComponentsWithStats(fg, 8)
    panels = sorted([[int(v) for v in st[i][:4]] for i in range(1, n) if st[i, 2] > 180 and st[i, 3] > 200], key=lambda b: (b[1] // 150, b[0]))
    assert len(panels) == len(names), (f, len(panels))
    for (px, py, pw, ph), (key, name, role) in zip(panels, names):
        # interior do painel (sem a borda e sem o título no topo)
        x0, y0, x1, y1 = px + 6, py + 26, px + pw - 6, py + ph - 6
        sub = rgb[y0:y1, x0:x1]; m = (sub.min(-1) <= 205).astype(np.uint8)
        m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
        def runs(prof, n):
            # faixas ocupadas; junta as separadas pelos menores vãos até sobrarem n
            occ = prof > max(4, 0.025 * len(prof)); rs = []; st0 = None
            for t, v in enumerate(list(occ) + [False]):
                if v and st0 is None: st0 = t
                if not v and st0 is not None: rs.append([st0, t]); st0 = None
            rs = [r for r in rs if r[1] - r[0] > 12]
            a0, a1 = rs[0][0], rs[-1][1]; step = (a1 - a0) / n  # grade uniforme: divide o espaço ocupado em n partes iguais
            return [[int(a0 + k * step), int(a0 + (k + 1) * step)] for k in range(n)]
        cols = runs(m.sum(0), 4); rws = runs(m.sum(1), 4)
        cells = {(r, cc): [cols[cc][0], rws[r][0], cols[cc][1], rws[r][1]] for r in range(4) for cc in range(4)}
        frames = {}
        for (r, cc), (a0, b0, a1, b1) in cells.items():
            fr = cut_out(sub[max(0, b0 - 2):b1 + 2, max(0, a0 - 2):a1 + 2]); al = fr[..., 3]
            ys, xs = np.nonzero(al); frames[(r, cc)] = fr[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
        cw = max(fr.shape[1] for fr in frames.values()) + 2; ch = max(fr.shape[0] for fr in frames.values()) + 1
        sheet = np.zeros((ch * 4, cw * 4, 4), np.uint8)
        for (r, cc), fr in frames.items():
            h, w = fr.shape[:2]; ox = cc * cw + (cw - w) // 2; oy = r * ch + ch - h  # pés no fundo da célula
            sheet[oy:oy + h, ox:ox + w] = fr
        # quadros reduzidos para 48 px de altura (no mapa ficam bem menores que isso; a folha fica leve)
        k = 48 / ch; cw2 = max(1, round(cw * k)); ch2 = 48
        img = Image.fromarray(sheet).resize((cw2 * 4, ch2 * 4), Image.LANCZOS)
        a = np.asarray(img).copy(); a[..., 3] = np.where(a[..., 3] > 110, 255, 0); img = Image.fromarray(a)
        img.quantize(256, method=Image.Quantize.FASTOCTREE).save(OUT + key + '.png', optimize=True); cw, ch = cw2, ch2  # paleta: arquivo leve
        # flip: true se a linha 1 olha para a esquerda (aí a linha 3 olha para a direita)
        meta[key] = {'name': name, 'role': role, 'w': cw, 'h': ch}
json.dump(meta, open(OUT + 'meta.json', 'w'), ensure_ascii=False)
with open(os.path.join(ROOT, 'public/js/drive/chrmeta.js'), 'w') as fh:
    fh.write('// personagens animados (folhas 4×4: frente, direita, costas, esquerda) — gerado por tools/drive/chars.py\n')
    fh.write('export const CHR = ' + json.dumps(meta, ensure_ascii=False) + ';\n')
print(len(meta), 'personagens')
