# Recorta os sprites das folhas extras (cidade filipina, natureza, cidade 16 bit, prédios modernos) para a
# Construtora / modo Reforma. Cada item: retângulo na folha, nome, categoria, tipo e escala (unidades do mundo
# por pixel da folha). Tipos: B prédio (sólido), P objeto sólido, S objeto decorativo (passa por cima),
# D peça plana no chão (lagos, praças, quadras), F piso pintável (textura repetida em blocos de 32×32).
# Fundo removido por preenchimento a partir das bordas do recorte (pixels escuros ligados à borda).
# Uso: python3 tools/drive/extra.py [pasta das folhas]
import numpy as np, json, sys, os
from PIL import Image
from collections import deque
from scipy import ndimage

U = sys.argv[1] if len(sys.argv) > 1 else '/root/.claude/uploads/ecd13ed2-02c5-5b53-9ec4-04b4e1b3ffd5/'
ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
OUT = os.path.join(ROOT, 'public/assets/rpg/extra/')
os.makedirs(OUT, exist_ok=True)
SHEETS = {'ph1': ('3bcce08a-image.png', 66), 'ph2': ('51e6a3f4-image.png', 34), 'nat': ('2fd2bd72-image.jpg', 40),
          'fil': ('c387fb38-image.png', 34), 'cty': ('efd4a5ca-image.png', 30), 'mod': ('fb42d4d2-image.jpg', 40)}

# chave: (folha, (x0, y0, x1, y1), nome, categoria, tipo, escala[, material do piso])
I = {}
def add(sheet, items, cat, kind, f, mat=None):
    for k, r, name in items:
        if sheet == 'ph1' and kind != 'F': r = (r[0] + 4, r[1] + 4, r[2] - 4, r[3] - 3)  # por dentro da moldura do painel
        I[k] = (sheet, r, name, cat, kind, f, mat)

# ---------------- cidade filipina 1 (ph1)
add('ph1', [('bahay-kubo', (8, 57, 107, 168), 'Bahay kubo'), ('casa-tradicional', (117, 57, 222, 168), 'Casa tradicional'), ('casa-moderna-ph', (232, 57, 338, 168), 'Casa moderna'),
            ('apartamento-ph', (357, 40, 440, 168), 'Prédio de apartamentos'), ('barangay-hall', (460, 58, 588, 168), 'Sede do bairro (barangay)'), ('igreja-ph', (597, 38, 722, 168), 'Igreja'),
            ('sari-sari', (730, 58, 850, 168), 'Mercearia sari-sari'), ('palengke', (858, 55, 1020, 168), 'Mercado palengke'),
            ('terminal-jeepney', (8, 207, 155, 315), 'Terminal de jeepney'), ('escola-ph', (163, 213, 276, 315), 'Escola'), ('hospital-ph', (287, 207, 402, 315), 'Hospital'),
            ('policia-ph', (411, 207, 522, 315), 'Delegacia'), ('bombeiros-ph', (531, 207, 655, 315), 'Bombeiros'), ('banco-ph', (665, 207, 758, 315), 'Banco'),
            ('hotel-ph', (768, 195, 850, 315), 'Hotel'), ('prefeitura-ph', (858, 205, 1018, 315), 'Prefeitura municipal'), ('telhado-caixa', (285, 905, 375, 990), 'Casa com caixa-d’água'),
            ('cemiterio', (700, 905, 773, 990), 'Capela do cemitério'), ('pagode', (782, 905, 845, 990), 'Pagode / santuário')], 'predios', 'B', 0.55)
add('ph1', [('palmeira-ph', (8, 530, 95, 615), 'Palmeira'), ('coqueiro-ph', (104, 530, 181, 615), 'Coqueiro'), ('bananeira', (190, 530, 265, 615), 'Bananeira'), ('bambu', (272, 530, 343, 615), 'Bambuzal')], 'natureza', 'P', 0.5)
add('ph1', [('flor-arbusto', (477, 532, 552, 615), 'Arbusto florido')], 'natureza', 'S', 0.4)
add('ph1', [('banco-ph', (562, 545, 642, 600), 'Banco de madeira'), ('lampiao', (651, 532, 716, 615), 'Lampião'), ('mastro', (721, 532, 782, 615), 'Mastro com bandeira'),
            ('cerca-bambu', (789, 532, 878, 615), 'Cerca de bambu'), ('lixeira-ph', (960, 545, 1018, 610), 'Lixeira verde'), ('placa-bemvindo', (948, 905, 1020, 990), 'Placa de boas-vindas'),
            ('parol', (382, 905, 447, 990), 'Lanterna parol'), ('cesta', (530, 905, 603, 990), 'Cesta de frutas')], 'mobiliario', 'S', 0.4)
add('ph1', [('poco', (887, 532, 952, 615), 'Poço'), ('carrinho-comida', (455, 905, 522, 990), 'Carrinho de comida')], 'comercio', 'P', 0.42)
add('ph1', [('arrozal', (350, 532, 468, 615), 'Arrozal'), ('praia-ph', (193, 905, 275, 990), 'Faixa de praia'), ('pier-madeira', (612, 905, 690, 990), 'Píer de madeira'), ('quadra-basquete', (858, 905, 940, 990), 'Quadra de basquete')], 'natureza', 'D', 0.8)
add('ph1', [('montanha-ph', (5, 905, 95, 990), 'Montanha'), ('vulcao', (100, 905, 185, 990), 'Vulcão')], 'relevo', 'P', 1.4)
add('ph1', [('jeepney', (8, 665, 115, 735), 'Jeepney'), ('triciclo', (125, 682, 200, 735), 'Triciclo'), ('habal-habal', (210, 682, 280, 735), 'Moto habal-habal'), ('carroca', (291, 675, 395, 735), 'Carroça de búfalo'),
            ('bangka', (402, 680, 497, 735), 'Barco bangka'), ('barco-pesca', (503, 668, 600, 735), 'Barco de pesca'), ('van-ph', (603, 682, 676, 735), 'Van'), ('caminhao-ph', (683, 677, 760, 735), 'Caminhão'),
            ('onibus-ph', (770, 670, 840, 735), 'Ônibus'), ('taxi-ph', (846, 682, 897, 735), 'Táxi'), ('moto-ph', (903, 682, 958, 735), 'Moto'), ('bicicleta-ph', (965, 682, 1020, 735), 'Bicicleta')], 'veiculos', 'P', 0.38)
add('ph1', [('rua-reta', (12, 372, 96, 464), 'Rua reta'), ('rua-cruzamento', (110, 372, 210, 464), 'Cruzamento'), ('rua-curva', (224, 372, 310, 464), 'Rua em curva'), ('rua-t', (324, 372, 412, 464), 'Rua em T')], 'pisos', 'F', 1, 'road')
add('ph1', [('passeio', (426, 372, 484, 464), 'Passeio de lajotas')], 'pisos', 'F', 1, 'walk')
add('ph1', [('rio-canal', (600, 372, 686, 464), 'Rio / canal')], 'pisos', 'F', 1, 'pond')
add('ph1', [('terra', (700, 372, 766, 464), 'Estrada de terra')], 'pisos', 'F', 1, 'lot')
add('ph1', [('grama-ph', (779, 372, 844, 464), 'Grama alta')], 'pisos', 'F', 1, 'grass')
add('ph1', [('areia-ph', (857, 372, 918, 464), 'Areia fina')], 'pisos', 'F', 1, 'sand')
add('ph1', [('piso-praca', (932, 372, 1016, 464), 'Piso de praça decorado')], 'pisos', 'F', 1, 'plaza')
add('ph1', [('ponte-ph', (496, 370, 588, 466), 'Ponte de pedra')], 'pisos', 'D', 0.8)

# ---------------- cidade filipina 2 (ph2) — sem o shopping com logotipo de marca e sem o caixa eletrônico de órgão real
add('ph2', [('casa-residencial', (10, 60, 83, 153), 'Casa residencial'), ('apartamento-ph2', (100, 45, 165, 153), 'Apartamentos'), ('condominio', (183, 35, 245, 153), 'Condomínio'),
            ('predio-comercial-ph', (262, 55, 323, 153), 'Prédio comercial'), ('sari-sari2', (462, 82, 516, 153), 'Mercearia'), ('carinderia', (530, 72, 598, 153), 'Restaurante carinderia'),
            ('terminal-jeepney2', (610, 68, 702, 153), 'Terminal de jeepney 2'), ('igreja-ph2', (716, 48, 778, 153), 'Igreja de pedra'), ('escola-ph2', (872, 48, 940, 153), 'Escola com bandeira'),
            ('hospital-ph2', (952, 62, 1016, 153), 'Hospital 2'), ('prefeitura-ph2', (8, 197, 85, 302), 'Prefeitura'), ('policia-ph2', (98, 205, 170, 302), 'Polícia'), ('bombeiros-ph2', (183, 205, 252, 302), 'Bombeiros 2'),
            ('mercado-ph2', (266, 208, 347, 302), 'Mercado coberto'), ('porto-pier', (356, 195, 448, 302), 'Porto / píer'), ('armazem', (458, 208, 519, 302), 'Armazém'), ('fabrica-ph', (536, 205, 598, 302), 'Fábrica'),
            ('terminal-onibus', (612, 208, 701, 302), 'Terminal de ônibus'), ('estacao-trem', (713, 195, 779, 302), 'Estação de trem'), ('engenho-arroz', (790, 207, 865, 302), 'Engenho de arroz'),
            ('usina', (880, 205, 950, 302), 'Usina de energia'), ('favela', (8, 337, 92, 428), 'Casas de zinco'), ('bahay-kubo2', (105, 345, 168, 428), 'Bahay kubo 2'), ('casa-moderna-ph2', (182, 340, 256, 428), 'Casa moderna 2'),
            ('posto-ph', (272, 345, 342, 428), 'Posto de combustível'), ('correios-ph', (440, 345, 510, 428), 'Correios'), ('biblioteca', (525, 340, 597, 428), 'Biblioteca')], 'predios', 'B', 0.6)
add('ph2', [('torre-tv', (973, 195, 1008, 302), 'Torre de TV')], 'predios', 'B', 0.7)
add('ph2', [('quadra-ph2', (795, 80, 858, 153), 'Quadra poliesportiva'), ('patio-trens', (609, 342, 701, 428), 'Pátio de trens'), ('parque-ph', (711, 342, 782, 428), 'Parque com chafariz'),
            ('praca-ph', (790, 342, 862, 428), 'Praça com fonte'), ('beira-rio', (870, 342, 943, 428), 'Beira-rio'), ('praia-costa', (948, 342, 1020, 428), 'Praia com coqueiros')], 'natureza', 'D', 1.0)
add('ph2', [('ferrovia', (524, 478, 594, 558), 'Ferrovia')], 'pisos', 'F', 1, 'lot')
add('ph2', [('estacionamento-vagas', (686, 478, 774, 558), 'Estacionamento com vagas')], 'pisos', 'F', 1, 'lot')
add('ph2', [('terra-ph2', (870, 478, 936, 558), 'Terra batida')], 'pisos', 'F', 1, 'grass')
add('ph2', [('piso-pedra', (950, 478, 1016, 558), 'Piso de pedra')], 'pisos', 'F', 1, 'plaza')
add('ph2', [('poste-luz-ph', (133, 612, 153, 688), 'Poste de luz'), ('poste-luz-ph2', (166, 612, 190, 688), 'Poste de luz 2'), ('banco-ph2', (208, 630, 260, 668), 'Banco'), ('cone-ph', (352, 648, 377, 688), 'Cone'),
            ('placa-stop-ph', (393, 612, 418, 688), 'Placa PARE'), ('placa-aviso', (428, 612, 458, 688), 'Placas de aviso'), ('lixeiras-3', (775, 632, 840, 668), 'Lixeiras de reciclagem')], 'sinalizacao', 'S', 0.45)
add('ph2', [('barricada', (277, 635, 336, 665), 'Barricada'), ('cerca-tela', (597, 630, 677, 672), 'Cerca de tela'), ('poste-energia', (705, 605, 742, 688), 'Poste de energia'), ('outdoor-bayanihan', (482, 612, 577, 688), 'Outdoor “Bayanihan”'),
            ('barraca-guarda-sol', (870, 603, 932, 688), 'Barraca com guarda-sol')], 'obras', 'P', 0.45)
add('ph2', [('palmeira-ph2', (962, 605, 1012, 688), 'Palmeira alta')], 'natureza', 'P', 0.5)
add('ph2', [('jeepneys', (12, 725, 75, 800), 'Jeepneys'), ('onibus-ph2', (110, 727, 165, 797), 'Ônibus 2'), ('van-ph2', (204, 730, 240, 797), 'Van branca'), ('taxi-ph2', (285, 733, 325, 797), 'Táxi amarelo'),
            ('carro-ph', (368, 733, 408, 797), 'Carro vermelho'), ('caminhao-ph2', (450, 722, 495, 797), 'Caminhão baú'), ('van-entrega', (540, 730, 585, 797), 'Van de entrega'), ('moto-ph2', (628, 735, 656, 797), 'Moto'),
            ('triciclo-ph2', (706, 740, 748, 790), 'Triciclo'), ('riquixa', (872, 732, 910, 797), 'Riquixá'), ('ambulancia-ph', (965, 727, 1008, 797), 'Ambulância'),
            ('caminhao-bombeiros', (17, 838, 68, 905), 'Caminhões de bombeiros'), ('viatura-ph', (105, 838, 140, 905), 'Viatura'), ('caminhao-tanque', (172, 842, 238, 905), 'Caminhão-tanque'),
            ('caminhao-lixo', (262, 842, 332, 905), 'Caminhão de lixo'), ('escavadeira', (362, 835, 418, 905), 'Escavadeira'), ('betoneira', (448, 842, 517, 905), 'Betoneira'), ('picape', (548, 840, 586, 905), 'Picape'),
            ('tuktuk', (636, 848, 668, 905), 'Tuk-tuk'), ('balsa', (702, 838, 770, 905), 'Balsa'), ('banca-barco', (783, 845, 846, 905), 'Barco banca'), ('barco-pesca2', (862, 838, 922, 905), 'Barco de pesca 2'),
            ('navio-carga', (940, 838, 1015, 905), 'Navio de carga')], 'veiculos', 'P', 0.45)

# ---------------- cidade 16 bit (cty)
cols = [(12, 92), (92, 170), (170, 250), (250, 330), (330, 410)]; rows = [(62, 157), (160, 252), (255, 350), (352, 445)]
names = [['casa-telhado-vermelho', 'predio-bege', 'predio-azul', 'predio-alto-azul', 'hospital-16'], ['predio-azul2', 'predio-bege2', 'predio-bege3', 'loja-16', 'cafe-16'],
         ['predio-bege4', 'predio-tijolo', 'predio-cinza', 'templo', 'igreja-16'], ['predio-verde', 'predio-bege5', 'cafe-16b', 'predio-cinza2', 'capela']]
labels = [['Casa de telhado vermelho', 'Prédio bege', 'Prédio azul', 'Prédio alto azul', 'Hospital'], ['Prédio azul 2', 'Prédio bege 2', 'Prédio bege 3', 'Loja', 'Café'],
          ['Prédio bege 4', 'Prédio de tijolo', 'Prédio cinza', 'Templo', 'Igreja'], ['Prédio verde', 'Prédio bege 5', 'Café 2', 'Prédio cinza 2', 'Capela']]
add('cty', [(names[r][c], (cols[c][0], rows[r][0], cols[c][1], rows[r][1]), labels[r][c]) for r in range(4) for c in range(5)], 'predios', 'B', 0.72)
add('cty', [('rua-calcada', (435, 62, 518, 150), 'Rua com calçada'), ('cruzamento-16', (435, 160, 518, 250), 'Cruzamento 2'), ('faixa-cruz', (435, 262, 518, 348), 'Cruzamento com faixas'),
            ('rua-amarela', (532, 262, 618, 348), 'Rua com faixa amarela'), ('rua-faixas', (532, 362, 618, 445), 'Rua com faixa de pedestres'), ('faixa-larga', (630, 362, 720, 445), 'Faixa de pedestres larga')], 'pisos', 'F', 1, 'road')
add('cty', [('calcada-quadrada', (435, 362, 518, 445), 'Calçada quadriculada')], 'pisos', 'F', 1, 'walk')
add('cty', [('rotatoria', (528, 158, 624, 256), 'Rotatória')], 'pisos', 'D', 1.0)
add('cty', [('arvore-16a', (757, 62, 810, 132), 'Árvore copada'), ('arvore-16b', (818, 62, 866, 132), 'Árvore cônica'), ('pinheiro-16', (872, 62, 910, 132), 'Pinheiro'), ('pinheiro-16b', (912, 62, 952, 132), 'Pinheiro 2'),
            ('cerejeira', (955, 62, 1008, 132), 'Cerejeira'), ('arbusto-grande-16', (757, 232, 805, 280), 'Arbusto grande')], 'natureza', 'P', 0.55)
add('cty', [('arbusto-16a', (757, 140, 808, 182), 'Arbusto'), ('arbusto-16b', (820, 140, 862, 182), 'Arbusto 2'), ('arbusto-16c', (873, 140, 910, 182), 'Arbusto 3'), ('arbusto-16d', (917, 140, 955, 182), 'Arbusto 4'),
            ('arbusto-16e', (962, 140, 1005, 182), 'Arbusto 5'), ('flores-16a', (757, 190, 808, 225), 'Flores'), ('flores-16b', (820, 190, 862, 225), 'Flores vermelhas'), ('flores-16c', (873, 190, 910, 225), 'Flores amarelas'),
            ('flores-16d', (917, 190, 955, 225), 'Flores brancas'), ('flores-16e', (962, 190, 1005, 225), 'Flores lilás'), ('banco-jardim', (918, 232, 1005, 280), 'Banco no jardim'), ('banco-grama', (757, 380, 810, 440), 'Banco na grama')], 'natureza', 'S', 0.5)
add('cty', [('lago-jardim', (803, 285, 910, 360), 'Lago de jardim'), ('chafariz-praca', (918, 290, 1005, 360), 'Chafariz da praça'), ('canteiro-cercado', (918, 380, 1005, 440), 'Canteiro cercado'), ('gramado-lago', (820, 232, 910, 280), 'Gramado com lago')], 'natureza', 'D', 0.9)
add('cty', [('poste-16', (22, 488, 48, 552), 'Poste'), ('poste-16b', (72, 488, 98, 552), 'Poste 2'), ('semaforo-16', (122, 488, 145, 552), 'Semáforo'), ('semaforo-16b', (172, 488, 196, 552), 'Semáforo 2'),
            ('placa-stop-16', (216, 488, 258, 552), 'Placa STOP'), ('placa-azul-16', (271, 488, 307, 552), 'Placa de rua'), ('hidrante-16', (18, 566, 52, 618), 'Hidrante'), ('lixeira-16', (68, 566, 102, 618), 'Lixeira de metal'),
            ('correio-16', (116, 566, 152, 618), 'Caixa de correio'), ('caixa-16', (168, 566, 200, 618), 'Caixa elétrica'), ('banco-16', (216, 566, 260, 618), 'Banco'), ('maquina-16', (271, 566, 307, 618), 'Máquina de bilhetes'),
            ('relogio-rua', (18, 638, 52, 722), 'Relógio de rua'), ('maquina-venda', (66, 638, 106, 722), 'Máquina de venda'), ('maquina-venda2', (116, 638, 154, 722), 'Máquina de venda 2'), ('placa-onibus-16', (170, 638, 198, 722), 'Placa de ônibus')], 'sinalizacao', 'S', 0.5)
add('cty', [('abrigo-onibus', (211, 645, 312, 722), 'Abrigo de ônibus')], 'mobiliario', 'P', 0.5)
cars = [(368, 488, 407, 550), (426, 488, 467, 550), (485, 488, 525, 550), (543, 488, 584, 550), (603, 488, 642, 550), (666, 488, 705, 550)]
add('cty', [(f'carro-16{c}', r, n) for c, r, n in zip('abcdef', cars, ['Carro vermelho', 'Carro azul', 'Carro verde', 'Carro amarelo', 'Carro branco', 'Carro preto'])], 'veiculos', 'P', 0.42)
add('cty', [('carro-16g', (368, 562, 407, 628), 'Carro azul-claro'), ('carro-16h', (426, 562, 467, 628), 'Carro verde 2'), ('taxi-16', (485, 562, 525, 628), 'Táxi'), ('viatura-16', (543, 562, 584, 628), 'Viatura'),
            ('ambulancia-16', (603, 562, 642, 628), 'Ambulância'), ('bombeiros-16', (664, 562, 709, 648), 'Caminhão de bombeiros'), ('onibus-16', (364, 640, 462, 698), 'Ônibus'), ('van-escolar', (478, 640, 527, 698), 'Van escolar'),
            ('caminhao-azul', (538, 640, 588, 698), 'Caminhão azul'), ('van-cinza', (598, 640, 648, 698), 'Van cinza'), ('caminhao-verde', (373, 703, 442, 750), 'Caminhão verde'), ('caminhao-branco', (514, 703, 586, 750), 'Caminhão branco')], 'veiculos', 'P', 0.42)
add('cty', [('cerca-grade-16', (265, 795, 328, 840), 'Grade metálica'), ('cerca-madeira-16', (338, 795, 398, 840), 'Cerca de madeira'), ('muro-cinza', (408, 795, 458, 840), 'Muro cinza'), ('muro-tijolo', (265, 853, 345, 897), 'Muro de tijolo'),
            ('muro-pedra', (408, 853, 458, 897), 'Muro de pedra'), ('cerca-viva', (465, 853, 512, 897), 'Cerca viva'), ('cerca-branca', (265, 908, 398, 952), 'Cerca branca'), ('cerca-viva2', (465, 908, 512, 952), 'Cerca viva 2'),
            ('grade-branca', (310, 963, 398, 1003), 'Grade branca')], 'obras', 'P', 0.5)
add('cty', [('agua-ondas', (540, 795, 598, 842), 'Água com ondas')], 'pisos', 'F', 1, 'pond')
add('cty', [('ponte-madeira-16', (540, 850, 598, 900), 'Ponte de madeira'), ('ponte-grade', (605, 850, 663, 900), 'Ponte com grade'), ('heliponto', (765, 795, 830, 855), 'Heliponto'), ('bueiro-16', (775, 958, 815, 998), 'Bueiro'),
            ('cais', (540, 908, 650, 1003), 'Cais')], 'obras', 'D', 0.9)
add('cty', [('painel-eletrico', (843, 795, 887, 842), 'Painel elétrico'), ('quiosque-tela', (908, 795, 957, 842), 'Quiosque digital'), ('guindaste', (842, 855, 905, 950), 'Guindaste'), ('loja-banca', (765, 868, 832, 935), 'Banca comercial'),
            ('barracas-noite', (918, 858, 1012, 935), 'Barracas da feira noturna'), ('maquina-rua', (848, 953, 897, 1000), 'Máquina de rua'), ('entrada-metro', (928, 943, 997, 1005), 'Entrada do metrô')], 'obras', 'P', 0.6)

# ---------------- natureza (nat)
add('nat', [('montanhas', (18, 112, 185, 218), 'Cordilheira nevada'), ('montanha-media', (193, 128, 325, 218), 'Montanha'), ('pico-nevado', (333, 110, 462, 218), 'Pico nevado'),
            ('penhasco', (472, 112, 597, 245), 'Penhasco gramado'), ('planalto', (18, 220, 180, 378), 'Planalto rochoso'), ('penhasco-degraus', (192, 232, 325, 378), 'Penhascos em degraus'),
            ('caverna', (333, 232, 462, 305), 'Caverna'), ('penhasco-caverna', (470, 255, 598, 378), 'Penhasco com caverna'), ('pedras-grandes', (333, 318, 400, 375), 'Pedras grandes')], 'relevo', 'P', 1.0)
add('nat', [('bosque-pinheiros', (631, 112, 818, 302), 'Bosque de pinheiros')], 'natureza', 'P', 0.7)
add('nat', [('pinheiro', (823, 112, 886, 215), 'Pinheiro'), ('arvore-nat1', (890, 112, 960, 215), 'Árvore'), ('arvore-nat2', (967, 112, 1048, 215), 'Árvore larga'), ('arvore-nat3', (1055, 112, 1140, 215), 'Árvore frondosa'),
            ('arvore-nat4', (1150, 112, 1218, 215), 'Árvore redonda'), ('palmeira-nat', (1225, 112, 1290, 215), 'Palmeira'), ('palmeira-nat2', (1298, 112, 1362, 215), 'Palmeira 2'),
            ('arvore-nat5', (788, 215, 860, 302), 'Árvore baixa'), ('arvore-nat6', (866, 218, 946, 302), 'Árvore cheia'), ('palmeira-alta', (1310, 230, 1362, 328), 'Palmeira alta')], 'natureza', 'P', 0.6)
add('nat', [('arbusto-nat1', (957, 230, 1025, 265), 'Arbusto baixo'), ('arbusto-nat2', (1035, 225, 1110, 265), 'Arbusto longo'), ('arbusto-nat3', (1120, 222, 1178, 272), 'Arbusto'), ('arbusto-nat4', (1186, 222, 1265, 272), 'Moita dupla'),
            ('arbusto-flor', (1185, 280, 1243, 328), 'Arbusto florido'), ('arbusto-nat5', (1250, 280, 1308, 328), 'Moita'), ('samambaia', (1136, 290, 1178, 328), 'Samambaia'), ('tronco', (1090, 322, 1176, 378), 'Tronco caído'),
            ('tronco2', (1185, 338, 1240, 375), 'Tronco'), ('cogumelo', (1252, 345, 1290, 378), 'Cogumelos'), ('pedras', (995, 625, 1045, 668), 'Pedras'), ('pedra-m', (995, 683, 1035, 712), 'Pedra'), ('pedras2', (1048, 683, 1095, 715), 'Pedregulhos'),
            ('flor-nat1', (636, 318, 664, 342), 'Flor'), ('flor-nat2', (718, 312, 746, 342), 'Flores'), ('flor-nat3', (796, 312, 832, 342), 'Flores azuis'), ('flor-nat4', (1042, 312, 1076, 342), 'Flores lilás'),
            ('flor-nat5', (676, 345, 706, 378), 'Flores vermelhas'), ('flor-nat6', (838, 345, 870, 378), 'Flores roxas')], 'natureza', 'S', 0.6)
add('nat', [('lago-grande', (18, 435, 165, 570), 'Lago grande'), ('lago-pequeno', (177, 435, 312, 500), 'Lagoa'), ('lago-medio', (177, 512, 312, 608), 'Lago'), ('cachoeira', (322, 435, 400, 610), 'Cachoeira'),
            ('cachoeira-lago', (410, 435, 535, 610), 'Cachoeira com lago'), ('corredeira', (18, 580, 165, 610), 'Corredeira'), ('rio-curva', (18, 620, 82, 682), 'Encontro de rios'), ('rio-t', (92, 620, 157, 682), 'Encontro de rios 2'),
            ('rio-ponte', (177, 620, 535, 688), 'Rio com cascata e ponte'), ('lago-ninfeias', (18, 692, 82, 752), 'Lago com ninfeias'), ('rio-cruz', (92, 692, 157, 752), 'Rio em cruz'), ('rio-curvas', (177, 692, 315, 752), 'Rio sinuoso'),
            ('rio-reto', (325, 692, 395, 752), 'Rio reto'), ('rio-junco', (405, 692, 462, 752), 'Rio com juncos'), ('ninfeias', (470, 692, 535, 752), 'Ninfeias'),
            ('trilha-oval', (572, 437, 732, 568), 'Trilha circular'), ('trilha-curva', (742, 437, 836, 500), 'Trilha em curva'), ('trilha-curva2', (742, 508, 836, 568), 'Trilha em curva 2'), ('trilha-areia', (900, 437, 960, 500), 'Trilha de areia'),
            ('ponte-pedra', (1228, 668, 1358, 752), 'Ponte de pedra'), ('barraca-camping', (1138, 622, 1222, 692), 'Barraca de camping'), ('fogueira', (1100, 672, 1132, 710), 'Fogueira')], 'relevo', 'D', 1.0)
add('nat', [('cerca-madeira-nat', (1055, 628, 1125, 660), 'Cerca de madeira'), ('cerca-nat2', (1285, 625, 1355, 655), 'Cerca rústica'), ('placa-madeira', (1228, 622, 1268, 668), 'Placa de madeira'), ('lenha', (1105, 708, 1170, 752), 'Lenha'),
            ('placa-trilha', (1182, 702, 1218, 750), 'Placa de trilha'), ('cerca-longa', (995, 727, 1092, 752), 'Cerca longa')], 'obras', 'P', 0.6)
add('nat', [('caminho-pedras', (848, 438, 890, 498), 'Caminho de pedras')], 'pisos', 'F', 1, 'walk')
add('nat', [('estrada-reta', (575, 625, 648, 680), 'Estrada reta'), ('estrada-dupla', (662, 694, 733, 750), 'Estrada com faixa dupla'), ('estrada-reta2', (824, 694, 885, 750), 'Estrada reta 2'), ('estrada-curva', (748, 625, 810, 680), 'Estrada em curva'),
            ('estrada-curva2', (899, 625, 960, 680), 'Estrada em curva 2')], 'pisos', 'F', 1, 'road')
add('nat', [('grama-densa', (998, 438, 1058, 496), 'Grama densa'), ('grama-terra', (998, 511, 1058, 568), 'Grama e terra')], 'pisos', 'F', 1, 'grass')
add('nat', [('terra-rachada', (1072, 438, 1133, 496), 'Terra rachada'), ('lama', (1072, 511, 1133, 568), 'Lama')], 'pisos', 'F', 1, 'lot')
add('nat', [('areia-clara', (1147, 438, 1208, 496), 'Areia clara'), ('dunas', (1220, 438, 1280, 496), 'Dunas'), ('areia-mista', (1147, 511, 1208, 568), 'Areia mista'), ('areia-grama', (1292, 438, 1353, 496), 'Areia e grama')], 'pisos', 'F', 1, 'sand')

# ---------------- prédios filipinos (fil): grade 8 × 7
FN = [['Casa de sapê', 'Casa de telhado vermelho', 'Casa de telhado verde', 'Casa de palafita', 'Casa vermelha com varanda', 'Casa azul', 'Sobrado vermelho', 'Casa de zinco'],
      ['Sobrado de concreto', 'Loja de zinco', 'Casarão branco', 'Casa de madeira', 'Casa azul com varanda', 'Casa verde com varanda', 'Casa vermelha 2', 'Casa de sapê 2'],
      ['Igreja colonial', 'Catedral', 'Prefeitura colonial', 'Palácio municipal', 'Loja de esquina', 'Galpão de telhado vermelho', 'Edifício comercial', 'Hospital com heliponto'],
      ['Mercearia laranja', 'Loja azul', 'Banco de bairro', 'Hotel estreito', 'Restaurante verde', 'Prédio de lojas', 'Agência de viagens', 'Loja verde'],
      ['Casa verde com palmeiras', 'Casa vermelha com palmeiras', 'Casa de telhado misto', 'Casa branca moderna', 'Casa de sapê com varanda', 'Casa de telhado vermelho 2', 'Casa azul com palmeiras', 'Casa de sapê 3'],
      ['Armazém de zinco', 'Fábrica pequena', 'Caixa-d’água', 'Garagem vermelha', 'Igrejinha azul', 'Posto coberto', 'Agência dos correios', 'Casa com painel solar'],
      ['Casarão vermelho', 'Casarão cinza', 'Sobrado amarelo', 'Galpão vermelho', 'Loja de dois andares', 'Prédio com bandeira', 'Garagem de telhado vermelho', 'Casa de sapê com palmeiras']]
FR = [(63, 176), (207, 321), (355, 480), (508, 625), (660, 758), (788, 882), (909, 1008)]
FC = [(16, 122), (150, 247), (276, 374), (401, 500), (529, 629), (657, 756), (785, 880), (912, 1008)]
for r in range(7):
    for c in range(8):
        I[f'fil-{r}{c}'] = ('fil', (FC[c][0], FR[r][0], FC[c][1], FR[r][1]), FN[r][c], 'predios', 'B', 0.55, None)

# ---------------- prédios modernos (mod)
add('mod', [('moderno-tijolo', (12, 108, 107, 245), 'Residencial de tijolo'), ('moderno-solar', (123, 110, 215, 245), 'Residencial solar'), ('moderno-sacadas', (228, 108, 318, 245), 'Residencial com sacadas'),
            ('moderno-verde', (330, 100, 425, 245), 'Residencial verde'), ('moderno-diagonal', (448, 108, 530, 245), 'Torre diagonal'), ('moderno-estreito', (542, 100, 615, 245), 'Torre estreita'),
            ('torre-jardim', (628, 78, 703, 245), 'Torre-jardim'), ('torre-jardim2', (713, 93, 793, 245), 'Torre-jardim 2'), ('escritorio-vidro', (818, 118, 920, 245), 'Escritório de vidro'),
            ('escritorio-antena', (930, 100, 1030, 245), 'Escritório com antena'), ('escritorio-azul', (1038, 108, 1130, 245), 'Escritório azul'), ('escritorio-alto', (1145, 85, 1255, 245), 'Escritório alto'),
            ('eco-escada', (10, 295, 148, 420), 'Comercial com escada'), ('eco-loja', (158, 295, 268, 420), 'Comercial ecológico'), ('eco-painel', (277, 295, 375, 420), 'Comercial com painel'), ('torre-satelite', (390, 262, 505, 420), 'Torre com satélite'),
            ('loja-terraço', (530, 288, 712, 420), 'Loja com terraço-jardim'), ('loja-vr', (723, 292, 805, 420), 'Loja de realidade virtual'), ('loja-hub', (818, 278, 890, 420), 'Hub de tecnologia'),
            ('mall-eco', (918, 277, 1257, 420), 'Shopping ecológico'), ('centro-civico', (10, 470, 323, 605), 'Centro cívico'), ('torre-civica', (337, 437, 432, 605), 'Torre cívica'), ('predio-heliponto', (445, 448, 590, 605), 'Prédio com heliponto'),
            ('laboratorio', (618, 470, 778, 605), 'Laboratório de domos'), ('estacao-futurista', (792, 475, 1000, 605), 'Estação futurista'), ('startup', (1012, 457, 1257, 605), 'Prédio de startup')], 'predios', 'B', 0.6)
add('mod', [('neon-bar', (1043, 663, 1078, 727), 'Letreiro neon BAR'), ('placa-cruz', (1086, 663, 1122, 703), 'Placa de farmácia'), ('placa-estrela', (1128, 663, 1166, 703), 'Placa de estrela'),
            ('toldo-vermelho', (1086, 716, 1146, 750), 'Toldo vermelho'), ('toldo-verde', (1152, 716, 1206, 750), 'Toldo verde'), ('toldo-azul', (1212, 716, 1260, 750), 'Toldo azul'), ('floreira', (1003, 745, 1082, 787), 'Floreira')], 'comercio', 'S', 0.5)
add('mod', [('painel-solar', (12, 662, 68, 732), 'Painel solar'), ('heliponto2', (273, 746, 366, 832), 'Heliponto 2'), ('telhado-jardim', (107, 745, 172, 832), 'Telhado-jardim')], 'obras', 'D', 0.7)


def knock(c, thr):
    a = np.asarray(c.convert('RGBA')).copy(); H, W = a.shape[:2]
    rgb = a[..., :3].astype(int)
    # cores do fundo: as mais comuns na borda do recorte (painel, grade, página)
    border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
    qv, cnt = np.unique(border // 6, axis=0, return_counts=True)
    bgc = [qv[i] * 6 + 3 for i in np.argsort(-cnt)[:4] if cnt[i] >= len(border) * 0.06]
    bg = rgb.max(-1) < thr
    for col in bgc: bg |= (np.abs(rgb - col).sum(-1) < 30)
    seen = np.zeros((H, W), bool); q = deque()
    for x in range(W): q.append((x, 0)); q.append((x, H - 1))
    for y in range(H): q.append((0, y)); q.append((W - 1, y))
    while q:
        x, y = q.popleft()
        if x < 0 or y < 0 or x >= W or y >= H or seen[y, x] or not bg[y, x]: continue
        seen[y, x] = True; a[y, x, 3] = 0
        q.extend([(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)])
    # só as partes grandes (tira linhas de grade e restos de texto soltos)
    lab, n = ndimage.label(a[..., 3] > 0)
    if n == 0: return None
    sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1)); big = sizes.max()
    keep = np.isin(lab, [i + 1 for i, v in enumerate(sizes) if v >= big * 0.12])
    a[~keep, 3] = 0
    ys, xs = np.nonzero(a[..., 3])
    return Image.fromarray(a).crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))


imgs = {k: Image.open(U + f).convert('RGB') for k, (f, _) in SHEETS.items()}
meta = {}
for key, (sh, r, name, cat, kind, f, mat) in I.items():
    c = imgs[sh].crop(r)
    if kind == 'F':
        c = c.convert('RGBA')
        if c.width < 8: continue
        out = c.resize((64, 64), Image.NEAREST if c.width >= 64 else Image.BILINEAR)
    else:
        out = knock(c, {'vulcao': 28, 'palengke': 30, 'terminal-jeepney': 30, 'pier-madeira': 30}.get(key, SHEETS[sh][1]))
        if out is None or out.width < 4 or out.height < 4: print('vazio', key); continue
    out.save(OUT + key + '.png', optimize=True)
    meta[key] = [out.width, out.height, name, cat, kind, f] + ([mat] if mat else [])
json.dump(meta, open(OUT + 'meta.json', 'w'), ensure_ascii=False)
with open(os.path.join(ROOT, 'public/js/drive/extrameta.js'), 'w') as fh:
    fh.write('// sprites extras da Construtora (folhas filipinas, natureza, cidade 16 bit, prédios modernos) — gerado por tools/drive/extra.py\n')
    fh.write('// chave: [largura, altura, nome, categoria, tipo (B prédio, P sólido, S decorativo, D plano no chão, F piso), escala, material do piso]\n')
    fh.write('export const EXTRA = ' + json.dumps(meta, ensure_ascii=False) + ';\n')
print(len(meta), 'sprites')
