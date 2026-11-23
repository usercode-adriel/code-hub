// STRUCTURE STUDIO: definições compartilhadas entre o navegador e o servidor (módulo puro, sem DOM).
// Cada estrutura nasce com UM preset de câmera: as perspectivas não se misturam.
//  - arq25d: miniatura arquitetônica pré-renderizada (câmera elevada, fachada frontal e telhado aparentes)
//  - topo:   vista superior (vias, cruzamentos, estacionamentos)

export const GRADE = 32; // mesma célula do Criar mapa

export const PRESETS = {
  arq25d: {
    id: 'arq25d', nome: 'Arquitetônica 2.5D',
    descricao: 'Edifícios e estabelecimentos: câmera elevada, fachada frontal visível, laterais parciais e telhado aparente.',
    camera: { tipo: 'elevada', inclinacao: 35 },
    area: { w: 24, h: 18 }, // células de 32 unidades
    categorias: ['estrutura', 'fachada', 'cobertura', 'externo', 'estacionamento', 'equipamento', 'material', 'construcao'],
    tipos: ['shopping', 'delegacia', 'hospital', 'supermercado', 'posto', 'loja', 'casa', 'predio', 'garagem', 'outro'],
  },
  topo: {
    id: 'topo', nome: 'Vista superior',
    descricao: 'Ruas, cruzamentos, rotatórias, estacionamentos e calçadas vistos de cima.',
    camera: { tipo: 'superior', inclinacao: 90 },
    area: { w: 20, h: 20 },
    categorias: ['via', 'estacionamento', 'externo', 'equipamento', 'material'],
    tipos: ['cruzamento', 'avenida', 'rua', 'rotatoria', 'estacionamento', 'outro'],
  },
};

// Categorias da biblioteca de componentes: grupo → subcategorias.
export const CATEGORIAS = {
  estrutura: { nome: 'Estrutura', sub: { parede: 'Paredes', coluna: 'Colunas', viga: 'Vigas', laje: 'Lajes', pilar: 'Pilares', divisoria: 'Divisórias' } },
  fachada: { nome: 'Fachadas', sub: { porta: 'Portas', janela: 'Janelas', vitrine: 'Vitrines', 'fachada-envidracada': 'Fachadas envidraçadas', letreiro: 'Letreiros', marquise: 'Marquises', sacada: 'Sacadas' } },
  cobertura: { nome: 'Telhados e coberturas', sub: { 'telhado-plano': 'Telhados planos', 'telhado-inclinado': 'Telhados inclinados', 'cobertura-metalica': 'Coberturas metálicas', terraco: 'Terraços', 'caixa-dagua': 'Caixas d\'água', 'ar-condicionado': 'Ar-condicionado', antena: 'Antenas', exaustor: 'Exaustores' } },
  externo: { nome: 'Áreas externas', sub: { calcada: 'Calçadas', rampa: 'Rampas', escada: 'Escadas', jardim: 'Jardins', canteiro: 'Canteiros', arvore: 'Árvores', palmeira: 'Palmeiras', vegetacao: 'Vegetação', muro: 'Muros', cerca: 'Cercas', portao: 'Portões', poste: 'Postes', luminaria: 'Luminárias', mobiliario: 'Mobiliário externo' } },
  estacionamento: { nome: 'Estacionamentos', sub: { vaga: 'Vagas', 'vaga-acessivel': 'Vagas acessíveis', 'pintura-solo': 'Pinturas de solo', 'faixa-circulacao': 'Faixas de circulação', cancela: 'Cancelas', guarita: 'Guaritas', placa: 'Placas', 'entrada-saida': 'Entradas e saídas' } },
  via: { nome: 'Vias', sub: { reta: 'Trechos retos', curva: 'Curvas', cruzamento: 'Cruzamentos', rotatoria: 'Rotatórias', 'faixa-pedestres': 'Faixas de pedestres', semaforo: 'Semáforos', seta: 'Setas', ciclovia: 'Ciclovias', ilha: 'Ilhas de trânsito', 'meio-fio': 'Sarjetas e meio-fios' } },
  equipamento: { nome: 'Equipamentos e sinalização', sub: { equipamento: 'Equipamentos', sinalizacao: 'Sinalizações' } },
  material: { nome: 'Materiais e texturas', sub: { textura: 'Texturas', piso: 'Pisos' } },
  construcao: { nome: 'Construções completas', sub: { referencia: 'Referências visuais' } },
};

export const ORIGENS = ['existente', 'importado', 'gerado'];
export const PERSPECTIVAS = Object.keys(PRESETS);

// categorias que um preset aceita
export const categoriasDoPreset = (presetId) => PRESETS[presetId]?.categorias || [];
export const subcategoriaValida = (cat, sub) => Boolean(CATEGORIAS[cat] && CATEGORIAS[cat].sub[sub]);
