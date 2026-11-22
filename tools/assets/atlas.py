"""Pipeline de assets: valida os PNGs e empacota em atlas WebP (lossless, pixel art preservada) com um manifesto.

Uso:
  python3 tools/assets/atlas.py              # valida e gera public/assets/atlas/
  python3 tools/assets/atlas.py --so-validar # só valida (não grava nada)

Regras (falha com código 1 se alguma for violada):
  - nome: minúsculas, números, '-', '_', '.' e '/' (o caminho vira a chave do sprite)
  - tamanho: cada lado entre 1 e 1024 px
  - transparência: sprites precisam ter canal alfa (pixel art recortada tem fundo transparente);
    ladrilhos de chão (tiles/, terreno/) são opacos e só precisam ter pelo menos 8 px
  - não pode haver imagem vazia (tudo transparente)
  - chave duplicada não é permitida
Avisos (não falham): tamanho diferente do meta.json da pasta, para ver onde o desenho pode estar esticado.

Fontes: rpg (sprites do mapa, exceto 'extra', que continua carregado sob demanda) e mundo (cidade nova).
"""
import json, os, re, sys
from PIL import Image

RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
FONTES = [('public/assets/rpg', 'rpg', ['extra']), ('public/assets/mundo', 'mundo', [])]
SRC_NOME = re.compile(r'[a-z0-9][a-z0-9_\-./]*')
PAGINA = 2048
PAD = 2
LADO_MAX = 1024

def coletar():
    itens, erros, avisos = [], [], []
    vistos = set()
    for pasta, prefixo, excluir in FONTES:
        base = os.path.join(RAIZ, pasta)
        meta = {}
        for raiz, dirs, arquivos in os.walk(base):
            dirs[:] = [d for d in dirs if d not in excluir]
            if 'meta.json' in arquivos:
                try:
                    meta.update({os.path.join(os.path.relpath(raiz, base), k) if False else k: v for k, v in json.load(open(os.path.join(raiz, 'meta.json'))).items()})
                except Exception as e:
                    avisos.append(f'meta.json ilegível em {raiz}: {e}')
            for f in sorted(arquivos):
                if not f.endswith('.png'): continue
                rel = os.path.relpath(os.path.join(raiz, f), base)[:-4].replace(os.sep, '/')
                chave = f'{prefixo}/{rel}'
                if not SRC_NOME.fullmatch(rel): erros.append(f'nome inválido: {pasta}/{rel}.png'); continue
                if chave in vistos: erros.append(f'chave duplicada: {chave}'); continue
                vistos.add(chave)
                im = Image.open(os.path.join(raiz, f))
                ladrilho = rel.startswith(('tiles/', 'terreno/'))  # ladrilhos de chão são opacos por natureza
                if not ladrilho and im.mode not in ('RGBA', 'LA', 'P'): erros.append(f'sem transparência (alfa): {pasta}/{rel}.png'); continue
                im = im.convert('RGBA')
                w, h = im.size
                if not (1 <= w <= LADO_MAX and 1 <= h <= LADO_MAX): erros.append(f'tamanho fora do limite ({w}x{h}): {pasta}/{rel}.png'); continue
                if ladrilho and min(w, h) < 8: erros.append(f'ladrilho pequeno demais ({w}x{h}): {pasta}/{rel}.png'); continue
                if not ladrilho and im.getchannel('A').getbbox() is None: erros.append(f'imagem totalmente transparente: {pasta}/{rel}.png'); continue
                m = meta.get(rel) or meta.get(f'{rel}.png')
                if m and (m[0] != w or m[1] != h): avisos.append(f'tamanho {w}x{h} difere do meta {m}: {chave}')
                itens.append((chave, im))
    return itens, erros, avisos

def empacotar(itens):
    itens = sorted(itens, key=lambda t: (-t[1].height, t[0]))
    paginas, manifesto = [], {}
    atual = None
    def nova():
        return {'img': Image.new('RGBA', (PAGINA, PAGINA), (0, 0, 0, 0)), 'x': PAD, 'y': PAD, 'linha': 0}
    atual = nova()
    for chave, im in itens:
        w, h = im.size
        if atual['x'] + w + PAD > PAGINA:
            atual['x'] = PAD; atual['y'] += atual['linha'] + PAD; atual['linha'] = 0
        if atual['y'] + h + PAD > PAGINA:
            paginas.append(atual); atual = nova()
        atual['img'].paste(im, (atual['x'], atual['y']))
        manifesto[chave] = [len(paginas), atual['x'], atual['y'], w, h]
        atual['x'] += w + PAD; atual['linha'] = max(atual['linha'], h)
    paginas.append(atual)
    return paginas, manifesto

def main():
    so_validar = '--so-validar' in sys.argv
    itens, erros, avisos = coletar()
    for a in avisos[:20]: print('aviso:', a)
    if len(avisos) > 20: print(f'… e mais {len(avisos) - 20} avisos')
    if erros:
        for e in erros: print('ERRO:', e)
        print(f'{len(erros)} erro(s): nada foi gerado.')
        sys.exit(1)
    print(f'{len(itens)} sprites válidos, {len(avisos)} aviso(s).')
    if so_validar: return
    paginas, manifesto = empacotar(itens)
    saida = os.path.join(RAIZ, 'public/assets/atlas')
    os.makedirs(saida, exist_ok=True)
    nomes = []
    for i, p in enumerate(paginas):
        nome = f'pagina-{i}.webp'
        p['img'].save(os.path.join(saida, nome), 'WEBP', lossless=True, method=6)
        nomes.append(nome)
    json.dump({'paginas': nomes, 'sprites': manifesto}, open(os.path.join(saida, 'manifesto.json'), 'w'), separators=(',', ':'))
    tam = sum(os.path.getsize(os.path.join(saida, n)) for n in nomes)
    print(f'atlas: {len(paginas)} página(s), {len(manifesto)} sprites, {tam // 1024} KB')

if __name__ == '__main__':
    main()
