"""Gera public/js/drive/frota.js a partir de public/assets/mundo/veiculos/meta.json (tamanho de cada sprite)."""
import json

# cor de cada modelo (vista na folha de recortes) — usada na descrição do carro roubado para a denúncia
COR = {'pickup': 'amarelo', 'benson': 'vermelho', 'jefferson': 'branco', 'taxi': 'amarelo', 'panto': 'roxo', 'box-truck': 'verde', 'cop-car': 'branco e azul', 'stinger': 'vermelho',
 'stretch-limousine': 'preto', 'spritzer': 'turquesa', 'schmidt': 'vermelho', 'redneck': 'azul', 'wellard': 'branco', 'eddy': 'bege', 'bug': 'verde', 'bulwark': 'vermelho',
 'jagular-xk': 'laranja', 'shark': 'azul', 'tv-van': 'azul', 'morton': 'dourado', 'medicar': 'branco', 'dementia': 'verde', 'truck-cab': 'azul', 'taxi-xpress': 'amarelo',
 'minx': 'azul-marinho', 'maurice': 'roxo', 'furore-gt': 'vermelho', 'trans-am': 'preto', 'meteor': 'amarelo', 'big-bug': 'verde', 'hachura': 'vermelho', 'arachnid': 'azul',
 'z-type': 'preto', 'sports-limousine': 'branco', 'karma-bus': 'amarelo', 't-rex': 'laranja', 'garbage-truck': 'verde', 'fire-truck': 'vermelho', 'truck-cab-sx': 'verde',
 'romero': 'dourado', 'michelli-roadster': 'azul', 'rumbler': 'verde', 'aniston-bd4': 'azul', 'beamer': 'vermelho', 'bus': 'rosa', 'a-type': 'amarelo', 'ice-cream-van': 'marrom',
 'g4-bank-van': 'cinza', 'van': 'verde', 'hot-dog-van': 'laranja', 'land-roamer': 'verde-oliva', 'dementia-limousine': 'laranja', 'u-jerk-truck': 'laranja', 'b-type': 'verde-limão',
 'miara': 'azul', 'gt-a1': 'preto', 'armed-land-roamer': 'verde-oliva', 'special-agent-car': 'preto', 'swat-van': 'azul-marinho', 'pacifier': 'verde-oliva', 'tank': 'verde-oliva'}
nome = lambda k: ' '.join(p.upper() if len(p) <= 2 or any(ch.isdigit() for ch in p) else p.capitalize() for p in k.split('-'))
meta = json.load(open('public/assets/mundo/veiculos/meta.json'))
tam = {k.split('/')[1]: v for k, v in meta.items()}
linhas = ',\n  '.join(f"'{k}': [{w}, {h}]" for k, (w, h) in tam.items())
open('public/js/drive/frota.js', 'w').write(f"""// FROTA NOVA (gerado por tools/mundo/gerar_frota.py — não editar à mão): tamanho [largura, comprimento] de cada sprite
// em public/assets/mundo/veiculos, já com a frente para cima. 1 pixel da arte ≈ {0.13} unidade do mundo.
export const TAM = {{
  {linhas},
}};
export const ESCALA = 0.13;
// comprimento e largura no mundo, pela proporção real do sprite (limusine e ônibus ficam compridos, não achatados)
export const medidas = (spr) => {{ const t = TAM[spr]; return t ? {{ L: Math.round(t[1] * ESCALA), W: Math.max(6, Math.round(t[0] * ESCALA)) }} : null; }};
// grupos usados pelo trânsito, pelas lojas e pelos serviços
export const CIVIS = ['benson', 'jefferson', 'panto', 'stinger', 'spritzer', 'schmidt', 'wellard', 'eddy', 'bug', 'bulwark', 'jagular-xk', 'shark', 'morton',
  'dementia', 'minx', 'maurice', 'furore-gt', 'trans-am', 'meteor', 'big-bug', 'hachura', 'arachnid', 'z-type', 't-rex', 'romero', 'michelli-roadster', 'rumbler',
  'aniston-bd4', 'beamer', 'a-type', 'b-type', 'miara', 'gt-a1'];
export const UTILITARIOS = ['pickup', 'redneck', 'van', 'box-truck', 'u-jerk-truck', 'land-roamer'];
export const CAMINHOES = ['truck-cab', 'truck-cab-sx', 'box-truck'];
export const TAXIS = ['taxi', 'taxi-xpress'];
export const ESPECIAIS = ['stretch-limousine', 'sports-limousine', 'dementia-limousine', 'karma-bus', 'ice-cream-van', 'hot-dog-van', 'tv-van'];
export const SERVICO = {{ policia: 'cop-car', ambulancia: 'medicar', bombeiros: 'fire-truck', coleta: 'garbage-truck', onibus: 'bus', forte: 'g4-bank-van', swat: 'swat-van', federal: 'special-agent-car' }};
export const MILITARES = ['armed-land-roamer', 'pacifier', 'tank'];
// nome do modelo e cor (descrição do carro roubado na denúncia)
export const MODELO = {{ {', '.join(f"'{k}': '{nome(k)}'" for k in tam)} }};
export const COR = {{ {', '.join(f"'{k}': '{COR[k]}'" for k in tam)} }};
""")
print('frota.js', len(tam))
