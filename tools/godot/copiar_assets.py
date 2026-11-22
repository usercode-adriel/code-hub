"""Copia para godot/assets só os sprites que o protótipo usa.
Lê a cidade exportada pela API (GET /api/godot/cidade) e copia as construções de public/assets/mundo
e a folha do personagem de public/assets/rpg/chr. Uso: python3 tools/godot/copiar_assets.py <cidade.json>"""
import json, os, shutil, sys

RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
DESTINO = os.path.join(RAIZ, 'godot', 'assets')

def main(arquivo_cidade):
    cidade = json.load(open(arquivo_cidade, encoding='utf-8'))
    copiados = 0; faltam = []
    for c in cidade['construcoes']:
        origem = os.path.join(RAIZ, 'public', 'assets', 'mundo', c['sprite'] + '.png')
        destino = os.path.join(DESTINO, c['sprite'] + '.png')
        if not os.path.exists(origem): faltam.append(c['sprite']); continue
        os.makedirs(os.path.dirname(destino), exist_ok=True); shutil.copy2(origem, destino); copiados += 1
    personagem = os.path.join(RAIZ, 'public', 'assets', 'rpg', 'chr', 'policial.png')
    os.makedirs(os.path.join(DESTINO, 'personagens'), exist_ok=True)
    shutil.copy2(personagem, os.path.join(DESTINO, 'personagens', 'policial.png'))
    print(f'construções copiadas: {copiados}; faltando: {faltam or "nenhuma"}; personagem: ok')

if __name__ == '__main__':
    main(sys.argv[1])
