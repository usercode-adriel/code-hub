"""Seleciona peças do Universal LPC Spritesheet Character Generator e copia só as que têm crédito explícito.

Regra de licença (opção escolhida: todas as licenças, com créditos e cópia-left):
  - só entra arquivo que tem linha própria em CREDITS.csv (sem crédito, a peça não é usada);
  - cada peça copiada leva autor e licença para o arquivo CREDITS.txt do jogo.
Regra técnica: todas as peças precisam ter o mesmo tamanho de folha (layout de andar 9×4 de 64 px).

Uso: python3 tools/personagens/selecionar.py <repo-lpc> <pasta-saida>
"""
import csv, json, os, shutil, sys
from PIL import Image

# (categoria, nome do item, prefixo da pasta no repo, filtro opcional)
SELECAO = [
    ('corpo', 'humano-masculino', 'body/bodies/male/walk.png'),
    ('corpo', 'humano-feminino', 'body/bodies/female/walk.png'),
]
# peças opcionais: qualquer walk.png com crédito cujo caminho contenha um destes trechos
CATEGORIAS = {
    'cabelo': ['hair/unkempt/adult/', 'hair/page/adult/', 'hair/high_ponytail/adult/'],
    'roupa-cima': ['torso/clothes/longsleeve/formal_striped/male/', 'torso/clothes/longsleeve/longsleeve2_buttoned/male/'],
    'roupa-baixo': ['legs/formal/male/', 'legs/pantaloons/male/'],
    'calcado': ['feet/boots/basic/male/', 'feet/boots/fold/male/'],
    'chapeu': ['hat/helmet/flattop/male/', 'hat/helmet/close/male/'],
}

def main(repo, saida):
    sheet = os.path.join(repo, 'spritesheets')
    creditos = {r['filename']: r for r in csv.DictReader(open(os.path.join(repo, 'CREDITS.csv'), encoding='utf-8'))}
    manifesto = {'tamanho_quadro': 64, 'animacao': 'walk', 'camadas': {}}
    usados = []
    tamanho_ref = Image.open(os.path.join(sheet, 'body/bodies/male/walk.png')).size
    def adicionar(cat, nome, rel):
        origem = os.path.join(sheet, rel)
        if not os.path.exists(origem): return False
        cred = creditos.get(rel)
        if not cred:
            print(f'sem crédito, ignorado: {rel}'); return False
        if Image.open(origem).size != tamanho_ref:
            print(f'tamanho diferente, ignorado: {rel}'); return False
        destino = os.path.join(saida, cat, nome, 'walk.png')
        os.makedirs(os.path.dirname(destino), exist_ok=True); shutil.copy2(origem, destino)
        manifesto['camadas'].setdefault(cat, []).append({'nome': nome, 'arquivo': f'{cat}/{nome}/walk.png', 'origem': rel,
            'autores': cred['authors'], 'licencas': [l.strip() for l in cred['licenses'].split(',') if l.strip()], 'url': cred['urls']})
        usados.append(cred); return True
    for cat, nome, rel in SELECAO:
        adicionar(cat, nome, rel)
    for cat, trechos in CATEGORIAS.items():
        for i, trecho in enumerate(trechos):
            for rel in sorted(creditos):
                if rel.startswith(trecho) and rel.endswith('walk.png'):
                    if adicionar(cat, f'{cat}-{i + 1}', rel): break
    os.makedirs(saida, exist_ok=True)
    json.dump(manifesto, open(os.path.join(saida, 'manifesto.json'), 'w'), ensure_ascii=False, indent=1)
    linhas = ['CRÉDITOS — personagens (Universal LPC Spritesheet Character Generator)', '']
    for c in usados:
        linhas.append(f"{c['filename']}\n  autores: {c['authors']}\n  licenças: {c['licenses']}\n  fonte: {c['urls'][:200]}\n")
    open(os.path.join(saida, 'CREDITS.txt'), 'w', encoding='utf-8').write('\n'.join(linhas))
    print('peças copiadas:', sum(len(v) for v in manifesto['camadas'].values()), 'categorias:', {k: len(v) for k, v in manifesto['camadas'].items()})

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
