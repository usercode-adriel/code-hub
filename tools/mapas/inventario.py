"""Inventário do criador de mapas: lista os assets enviados (e os personagens) por categoria, com tamanho e tipo.
Não copia arquivos: o manifesto aponta para os PNGs que já estão em public/assets.
Saída: public/assets/mapas/inventario/manifesto.json
Uso: python3 tools/mapas/inventario.py
"""
import json, os
from PIL import Image

RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
A = os.path.join(RAIZ, 'public', 'assets')
SAIDA = os.path.join(A, 'mapas', 'inventario', 'manifesto.json')

# categoria: (pasta, tipo, prefixo da chave)
CATEGORIAS = {
    'terreno': ('mundo/terreno', 'tile'),
    'construcoes': ('mundo/construcoes', 'objeto'),
    'objetos': ('mundo/objetos', 'objeto'),
    'vegetacao': ('mundo/vegetacao', 'objeto'),
    'relevo': ('mundo/relevo', 'objeto'),
    'veiculos': ('mundo/veiculos', 'veiculo'),
    'aeronaves': ('mundo/aeronaves', 'veiculo'),
}

def main():
    itens = []
    for cat, (pasta, tipo) in CATEGORIAS.items():
        base = os.path.join(A, pasta)
        if not os.path.isdir(base): continue
        for f in sorted(os.listdir(base)):
            if not f.endswith('.png'): continue
            nome = f[:-4]
            w, h = Image.open(os.path.join(base, f)).size
            itens.append({'chave': f'{cat}/{nome}', 'categoria': cat, 'tipo': tipo, 'nome': nome.replace('-', ' ').capitalize(),
                          'arquivo': f'/assets/{pasta}/{f}', 'w': w, 'h': h})
    # terreno base do criador (grama da foto): todo mapa novo começa com ela
    itens.insert(0, {'chave': 'terreno/grama-base', 'categoria': 'terreno', 'tipo': 'tile', 'nome': 'Grama (base)',
                     'arquivo': '/assets/mapas/inventario/terreno/grama-base.png', 'w': 1536, 'h': 1024, 'base': True})
    # personagens: as folhas geradas (rpg/chr); cada um tem andar, correr, reações
    chr_dir = os.path.join(A, 'rpg', 'chr')
    for f in sorted(os.listdir(chr_dir)):
        if f.endswith('.png') and not f.endswith('-rx.png'):
            nome = f[:-4]
            itens.append({'chave': f'personagens/{nome}', 'categoria': 'personagens', 'tipo': 'personagem', 'nome': nome.replace('-', ' ').capitalize(),
                          'arquivo': f'/assets/rpg/chr/{f}', 'w': 256, 'h': 448})
    os.makedirs(os.path.dirname(SAIDA), exist_ok=True)
    json.dump({'versao': 1, 'categorias': list(CATEGORIAS) + ['personagens'], 'itens': itens}, open(SAIDA, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    por = {}
    for i in itens: por[i['categoria']] = por.get(i['categoria'], 0) + 1
    print('itens:', len(itens), por)

if __name__ == '__main__':
    main()
