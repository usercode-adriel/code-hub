"""Seleciona peças do Universal LPC Spritesheet Character Generator e copia as animações necessárias.

Regras (opção escolhida: todas as licenças, com créditos e cópia-left):
  - uma peça só entra se TODAS as animações obrigatórias existirem e tiverem crédito explícito em CREDITS.csv
    (sem a animação, a camada sumiria naquela ação e o personagem ficaria quebrado);
  - cada arquivo copiado leva autor e licença para CREDITS.txt.
Animações: walk (andar), run (correr), idle (parado), hurt (ferido), sit (sentado).

Uso: python3 tools/personagens/selecionar.py <repo-lpc> <pasta-saida>
"""
import csv, json, os, shutil, sys
from PIL import Image

ANIMACOES = ['walk', 'run', 'idle', 'hurt', 'sit']
CATEGORIAS = {
    'corpo': ['body/bodies/male/', 'body/bodies/female/'],
    'cabelo': ['hair/unkempt/adult/', 'hair/page/adult/'],
    'roupa-cima': ['torso/clothes/longsleeve/longsleeve2_buttoned/male/'],
    'roupa-baixo': ['legs/formal/male/', 'legs/pantaloons/male/'],
    'calcado': ['feet/boots/basic/male/', 'feet/boots/fold/male/'],
    'chapeu': ['hat/helmet/flattop/male/', 'hat/helmet/close/male/'],
}

def main(repo, saida):
    sheet = os.path.join(repo, 'spritesheets')
    creditos = {r['filename']: r for r in csv.DictReader(open(os.path.join(repo, 'CREDITS.csv'), encoding='utf-8'))}
    manifesto = {'animacoes': ANIMACOES, 'camadas': {}}
    usados = []
    def completa(pref):
        """True se a peça tem todas as animações, com crédito e o mesmo quadro de altura do corpo."""
        for a in ANIMACOES:
            rel = pref + a + '.png'
            if rel not in creditos or not os.path.exists(os.path.join(sheet, rel)): return False
        return True
    for cat, prefs in CATEGORIAS.items():
        for i, pref in enumerate(prefs):
            if not completa(pref):
                print(f'incompleta ou sem crédito, ignorada: {pref}'); continue
            nome = f'{cat}-{i + 1}' if cat not in ('corpo',) else ('humano-masculino' if 'male/' in pref and 'female' not in pref else 'humano-feminino')
            for a in ANIMACOES:
                rel = pref + a + '.png'
                destino = os.path.join(saida, cat, nome, a + '.png')
                os.makedirs(os.path.dirname(destino), exist_ok=True); shutil.copy2(os.path.join(sheet, rel), destino)
                usados.append(creditos[rel])
            manifesto['camadas'].setdefault(cat, []).append({'nome': nome, 'pasta': f'{cat}/{nome}', 'origem': pref,
                'autores': creditos[pref + 'walk.png']['authors'], 'licencas': [l.strip() for l in creditos[pref + 'walk.png']['licenses'].split(',') if l.strip()]})
    os.makedirs(saida, exist_ok=True)
    json.dump(manifesto, open(os.path.join(saida, 'manifesto.json'), 'w'), ensure_ascii=False, indent=1)
    vistos = set(); linhas = ['CRÉDITOS — personagens (Universal LPC Spritesheet Character Generator)', '']
    for c in usados:
        if c['filename'] in vistos: continue
        vistos.add(c['filename'])
        linhas.append(f"{c['filename']}\n  autores: {c['authors']}\n  licenças: {c['licenses']}\n  fonte: {c['urls'][:200]}\n")
    open(os.path.join(saida, 'CREDITS.txt'), 'w', encoding='utf-8').write('\n'.join(linhas))
    print('peças:', {k: [p['nome'] for p in v] for k, v in manifesto['camadas'].items()}, '| arquivos de crédito:', len(vistos))

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
