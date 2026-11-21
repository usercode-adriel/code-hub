// FROTA NOVA (gerado por tools/mundo/gerar_frota.py — não editar à mão): tamanho [largura, comprimento] de cada sprite
// em public/assets/mundo/veiculos, já com a frente para cima. 1 pixel da arte ≈ 0.13 unidade do mundo.
export const TAM = {
  'pickup': [86, 168],
  'benson': [92, 171],
  'jefferson': [86, 181],
  'taxi': [96, 177],
  'panto': [91, 164],
  'box-truck': [93, 179],
  'cop-car': [82, 170],
  'stinger': [85, 171],
  'stretch-limousine': [88, 281],
  'spritzer': [85, 159],
  'schmidt': [80, 143],
  'redneck': [84, 155],
  'wellard': [83, 169],
  'eddy': [83, 168],
  'bug': [85, 149],
  'bulwark': [85, 175],
  'jagular-xk': [90, 188],
  'shark': [83, 187],
  'tv-van': [95, 179],
  'morton': [89, 175],
  'medicar': [92, 226],
  'dementia': [81, 151],
  'truck-cab': [99, 164],
  'taxi-xpress': [101, 170],
  'minx': [81, 168],
  'maurice': [84, 173],
  'furore-gt': [85, 175],
  'trans-am': [82, 167],
  'meteor': [88, 184],
  'big-bug': [84, 168],
  'hachura': [84, 171],
  'arachnid': [84, 171],
  'z-type': [81, 168],
  'sports-limousine': [81, 304],
  'karma-bus': [106, 248],
  't-rex': [89, 175],
  'garbage-truck': [95, 249],
  'fire-truck': [100, 300],
  'truck-cab-sx': [88, 169],
  'romero': [86, 175],
  'michelli-roadster': [81, 174],
  'rumbler': [88, 170],
  'aniston-bd4': [88, 168],
  'beamer': [84, 165],
  'bus': [104, 358],
  'a-type': [83, 174],
  'ice-cream-van': [112, 244],
  'g4-bank-van': [92, 204],
  'van': [96, 201],
  'hot-dog-van': [100, 216],
  'land-roamer': [84, 168],
  'dementia-limousine': [88, 254],
  'u-jerk-truck': [91, 148],
  'b-type': [86, 168],
  'miara': [85, 163],
  'gt-a1': [84, 152],
  'armed-land-roamer': [88, 154],
  'special-agent-car': [92, 194],
  'swat-van': [103, 221],
  'pacifier': [119, 219],
  'tank': [121, 254],
};
export const ESCALA = 0.13;
// comprimento e largura no mundo, pela proporção real do sprite (limusine e ônibus ficam compridos, não achatados)
export const medidas = (spr) => { const t = TAM[spr]; return t ? { L: Math.round(t[1] * ESCALA), W: Math.max(6, Math.round(t[0] * ESCALA)) } : null; };
// grupos usados pelo trânsito, pelas lojas e pelos serviços
export const CIVIS = ['benson', 'jefferson', 'panto', 'stinger', 'spritzer', 'schmidt', 'wellard', 'eddy', 'bug', 'bulwark', 'jagular-xk', 'shark', 'morton',
  'dementia', 'minx', 'maurice', 'furore-gt', 'trans-am', 'meteor', 'big-bug', 'hachura', 'arachnid', 'z-type', 't-rex', 'romero', 'michelli-roadster', 'rumbler',
  'aniston-bd4', 'beamer', 'a-type', 'b-type', 'miara', 'gt-a1'];
export const UTILITARIOS = ['pickup', 'redneck', 'van', 'box-truck', 'u-jerk-truck', 'land-roamer'];
export const CAMINHOES = ['truck-cab', 'truck-cab-sx', 'box-truck'];
export const TAXIS = ['taxi', 'taxi-xpress'];
export const ESPECIAIS = ['stretch-limousine', 'sports-limousine', 'dementia-limousine', 'karma-bus', 'ice-cream-van', 'hot-dog-van', 'tv-van'];
export const SERVICO = { policia: 'cop-car', ambulancia: 'medicar', bombeiros: 'fire-truck', coleta: 'garbage-truck', onibus: 'bus', forte: 'g4-bank-van', swat: 'swat-van', federal: 'special-agent-car' };
export const MILITARES = ['armed-land-roamer', 'pacifier', 'tank'];
// nome do modelo e cor (descrição do carro roubado na denúncia)
export const MODELO = { 'pickup': 'Pickup', 'benson': 'Benson', 'jefferson': 'Jefferson', 'taxi': 'Taxi', 'panto': 'Panto', 'box-truck': 'Box Truck', 'cop-car': 'Cop Car', 'stinger': 'Stinger', 'stretch-limousine': 'Stretch Limousine', 'spritzer': 'Spritzer', 'schmidt': 'Schmidt', 'redneck': 'Redneck', 'wellard': 'Wellard', 'eddy': 'Eddy', 'bug': 'Bug', 'bulwark': 'Bulwark', 'jagular-xk': 'Jagular XK', 'shark': 'Shark', 'tv-van': 'TV Van', 'morton': 'Morton', 'medicar': 'Medicar', 'dementia': 'Dementia', 'truck-cab': 'Truck Cab', 'taxi-xpress': 'Taxi Xpress', 'minx': 'Minx', 'maurice': 'Maurice', 'furore-gt': 'Furore GT', 'trans-am': 'Trans AM', 'meteor': 'Meteor', 'big-bug': 'Big Bug', 'hachura': 'Hachura', 'arachnid': 'Arachnid', 'z-type': 'Z Type', 'sports-limousine': 'Sports Limousine', 'karma-bus': 'Karma Bus', 't-rex': 'T Rex', 'garbage-truck': 'Garbage Truck', 'fire-truck': 'Fire Truck', 'truck-cab-sx': 'Truck Cab SX', 'romero': 'Romero', 'michelli-roadster': 'Michelli Roadster', 'rumbler': 'Rumbler', 'aniston-bd4': 'Aniston BD4', 'beamer': 'Beamer', 'bus': 'Bus', 'a-type': 'A Type', 'ice-cream-van': 'Ice Cream Van', 'g4-bank-van': 'G4 Bank Van', 'van': 'Van', 'hot-dog-van': 'Hot Dog Van', 'land-roamer': 'Land Roamer', 'dementia-limousine': 'Dementia Limousine', 'u-jerk-truck': 'U Jerk Truck', 'b-type': 'B Type', 'miara': 'Miara', 'gt-a1': 'GT A1', 'armed-land-roamer': 'Armed Land Roamer', 'special-agent-car': 'Special Agent Car', 'swat-van': 'Swat Van', 'pacifier': 'Pacifier', 'tank': 'Tank' };
export const COR = { 'pickup': 'amarelo', 'benson': 'vermelho', 'jefferson': 'branco', 'taxi': 'amarelo', 'panto': 'roxo', 'box-truck': 'verde', 'cop-car': 'branco e azul', 'stinger': 'vermelho', 'stretch-limousine': 'preto', 'spritzer': 'turquesa', 'schmidt': 'vermelho', 'redneck': 'azul', 'wellard': 'branco', 'eddy': 'bege', 'bug': 'verde', 'bulwark': 'vermelho', 'jagular-xk': 'laranja', 'shark': 'azul', 'tv-van': 'azul', 'morton': 'dourado', 'medicar': 'branco', 'dementia': 'verde', 'truck-cab': 'azul', 'taxi-xpress': 'amarelo', 'minx': 'azul-marinho', 'maurice': 'roxo', 'furore-gt': 'vermelho', 'trans-am': 'preto', 'meteor': 'amarelo', 'big-bug': 'verde', 'hachura': 'vermelho', 'arachnid': 'azul', 'z-type': 'preto', 'sports-limousine': 'branco', 'karma-bus': 'amarelo', 't-rex': 'laranja', 'garbage-truck': 'verde', 'fire-truck': 'vermelho', 'truck-cab-sx': 'verde', 'romero': 'dourado', 'michelli-roadster': 'azul', 'rumbler': 'verde', 'aniston-bd4': 'azul', 'beamer': 'vermelho', 'bus': 'rosa', 'a-type': 'amarelo', 'ice-cream-van': 'marrom', 'g4-bank-van': 'cinza', 'van': 'verde', 'hot-dog-van': 'laranja', 'land-roamer': 'verde-oliva', 'dementia-limousine': 'laranja', 'u-jerk-truck': 'laranja', 'b-type': 'verde-limão', 'miara': 'azul', 'gt-a1': 'preto', 'armed-land-roamer': 'verde-oliva', 'special-agent-car': 'preto', 'swat-van': 'azul-marinho', 'pacifier': 'verde-oliva', 'tank': 'verde-oliva' };
