"""Biblioteca do Structure Studio: componentes que já existem no jogo, com metadados (categoria, perspectiva, pivô, colisão...).
Não copia arquivos: o manifesto aponta para os PNGs que já estão em public/assets (nada é duplicado).
Estes são os componentes de ORIGEM "existente". Os gerados por IA e os importados ficam na biblioteca do usuário.
Saída: public/assets/estudio/componentes/manifesto.json
Uso: python3 tools/estudio/componentes.py
"""
import json, math, os, re, hashlib
from PIL import Image

RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
A = os.path.join(RAIZ, 'public', 'assets')
SAIDA = os.path.join(A, 'estudio', 'componentes', 'manifesto.json')
GRADE = 32

# (pasta, regras: [(regex do nome, categoria, sub, material, perspectiva)])
FONTES = [
    ('mundo/vegetacao', [
        (r'^palmeira', 'externo', 'palmeira', 'vegetal', 'arq25d'),
        (r'^(arvore|ipe)', 'externo', 'arvore', 'vegetal', 'arq25d'),
        (r'.*', 'externo', 'vegetacao', 'vegetal', 'arq25d'),
    ]),
    ('mundo/objetos', [
        (r'^cerca', 'externo', 'cerca', 'madeira', 'arq25d'),
        (r'^poste', 'externo', 'poste', 'metal', 'arq25d'),
        (r'^portal', 'externo', 'portao', 'madeira', 'arq25d'),
        (r'^(banco|cadeira|guarda-sol|pranchas|salva-vidas)', 'externo', 'mobiliario', 'outro', 'arq25d'),
        (r'.*', 'equipamento', 'equipamento', 'outro', 'arq25d'),
    ]),
    ('mundo/construcoes', [(r'.*', 'construcao', 'referencia', 'misto', 'arq25d')]),
    ('mapas/inventario/3d', [
        (r'^predio-', 'construcao', 'referencia', 'misto', 'arq25d'),
        (r'^estrada-', 'via', 'reta', 'asfalto', 'topo'),
        (r'^calcada-curva', 'externo', 'calcada', 'pedra', 'topo'),
        (r'^calcada-', 'externo', 'calcada', 'pedra', 'topo'),
    ]),
    ('mundo/terreno', [(r'.*', 'material', 'textura', 'outro', 'ambas')]),
]

CAMADA_DA_SUB = {
    'textura': 'piso', 'reta': 'piso', 'calcada': 'solo', 'palmeira': 'externo', 'arvore': 'externo', 'vegetacao': 'externo',
    'cerca': 'externo', 'poste': 'externo', 'portao': 'externo', 'mobiliario': 'externo', 'equipamento': 'externo', 'referencia': 'base',
}

def colisao(sub, w, h):
    """Caixa de colisão no pé da peça (px relativos ao pivô, que fica na base, no centro)."""
    if sub in ('palmeira', 'arvore'): return {'tipo': 'caixa', 'x': -round(w * 0.1), 'y': -round(h * 0.15), 'w': round(w * 0.2), 'h': round(h * 0.15)}
    if sub == 'referencia': return {'tipo': 'caixa', 'x': -round(w * 0.44), 'y': -round(h * 0.86), 'w': round(w * 0.88), 'h': round(h * 0.74)}
    if sub in ('cerca', 'poste', 'portao', 'equipamento'): return {'tipo': 'caixa', 'x': -round(w * 0.4), 'y': -round(h * 0.2), 'w': round(w * 0.8), 'h': round(h * 0.2)}
    return {'tipo': 'nenhuma'}

def main():
    itens = []
    vistos = {}
    for pasta, regras in FONTES:
        base = os.path.join(A, pasta)
        if not os.path.isdir(base): continue
        for f in sorted(os.listdir(base)):
            if not f.endswith('.png'): continue
            nome = f[:-4]
            for rx, cat, sub, mat, persp in regras:
                if re.search(rx, nome): break
            caminho = os.path.join(base, f)
            w, h = Image.open(caminho).size
            h5 = hashlib.sha256(open(caminho, 'rb').read()).hexdigest()
            if h5 in vistos: continue   # o mesmo arquivo em duas pastas entra uma vez só
            vistos[h5] = True
            itens.append({
                'id': f'ex:{pasta.split("/")[-1]}/{nome}', 'nome': nome.replace('-', ' ').capitalize(),
                'categoria': cat, 'sub': sub, 'perspectiva': persp, 'material': mat, 'origem': 'existente',
                'arquivo': f'/assets/{pasta}/{f}', 'hash': h5, 'w': w, 'h': h,
                'pivo': {'x': 0.5, 'y': 1}, 'area': {'w': max(1, math.ceil(w / GRADE)), 'h': max(1, math.ceil(h * 0.3 / GRADE))},
                'colisao': colisao(sub, w, h), 'conectores': [], 'camada': CAMADA_DA_SUB.get(sub, 'externo'), 'tags': [],
            })
    os.makedirs(os.path.dirname(SAIDA), exist_ok=True)
    json.dump({'versao': 1, 'componentes': itens}, open(SAIDA, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    por = {}
    for i in itens: por[f"{i['categoria']}/{i['sub']}"] = por.get(f"{i['categoria']}/{i['sub']}", 0) + 1
    print('componentes:', len(itens), por)

if __name__ == '__main__':
    main()
