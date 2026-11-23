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

// ---------------------------------------------------------------------------------------------------------------------
// COMPONENTES: camadas, materiais, compatibilidade e formato dos metadados
// ---------------------------------------------------------------------------------------------------------------------
// Camadas de renderização, de baixo para cima. Cada componente tem uma camada padrão (a subcategoria define) e
// um z fino dentro dela, para o usuário poder reordenar sem atravessar o resto.
export const CAMADAS = ['piso', 'solo', 'externo', 'base', 'fachada', 'cobertura', 'topo'];

export const MATERIAIS = ['concreto', 'tijolo', 'vidro', 'metal', 'madeira', 'vegetal', 'asfalto', 'pedra', 'tinta', 'misto', 'outro'];

// Subcategoria → camada padrão
export const CAMADA_DA_SUB = {
  textura: 'piso', piso: 'piso', reta: 'piso', curva: 'piso', cruzamento: 'piso', rotatoria: 'piso', 'faixa-pedestres': 'solo', seta: 'solo', ciclovia: 'piso', ilha: 'solo', 'meio-fio': 'solo',
  calcada: 'solo', rampa: 'externo', escada: 'externo', jardim: 'externo', canteiro: 'externo', arvore: 'externo', palmeira: 'externo', vegetacao: 'externo', muro: 'externo', cerca: 'externo', portao: 'externo', poste: 'externo', luminaria: 'externo', mobiliario: 'externo',
  vaga: 'solo', 'vaga-acessivel': 'solo', 'pintura-solo': 'solo', 'faixa-circulacao': 'solo', cancela: 'externo', guarita: 'externo', placa: 'externo', 'entrada-saida': 'solo',
  parede: 'base', coluna: 'base', viga: 'base', laje: 'base', pilar: 'base', divisoria: 'base',
  porta: 'fachada', janela: 'fachada', vitrine: 'fachada', 'fachada-envidracada': 'fachada', letreiro: 'fachada', marquise: 'fachada', sacada: 'fachada',
  'telhado-plano': 'cobertura', 'telhado-inclinado': 'cobertura', 'cobertura-metalica': 'cobertura', terraco: 'cobertura',
  'caixa-dagua': 'topo', 'ar-condicionado': 'topo', antena: 'topo', exaustor: 'topo',
  equipamento: 'externo', sinalizacao: 'externo', referencia: 'base',
};

// Compatibilidade de montagem: subcategoria → em qual(is) subcategoria(s) ela se encaixa.
// Ausente = fica solta no chão (grade). Usado pelo encaixe da fase 3 (Snap to Connectors).
export const REQUER = {
  porta: ['parede', 'fachada-envidracada'], janela: ['parede', 'fachada-envidracada'], vitrine: ['parede'], letreiro: ['parede', 'fachada-envidracada', 'marquise'], marquise: ['parede', 'fachada-envidracada'], sacada: ['parede'],
  'telhado-plano': ['parede', 'laje', 'pilar', 'coluna'], 'telhado-inclinado': ['parede', 'laje', 'pilar', 'coluna'], 'cobertura-metalica': ['pilar', 'coluna', 'parede'], terraco: ['laje', 'parede'],
  'caixa-dagua': ['telhado-plano', 'terraco', 'laje'], 'ar-condicionado': ['telhado-plano', 'terraco', 'laje', 'cobertura-metalica'], antena: ['telhado-plano', 'terraco', 'laje'], exaustor: ['telhado-plano', 'terraco', 'laje'],
  laje: ['parede', 'pilar', 'coluna', 'viga'], viga: ['pilar', 'coluna', 'parede'],
};

// Forma dos metadados de um componente (a biblioteca valida isto no servidor):
//  id, nome, categoria, sub, perspectiva ('arq25d' | 'topo' | 'ambas'), material, origem, arquivo (URL), hash (sha256, para não duplicar),
//  w, h (px do arquivo), pivo {x,y} (0..1 dentro do arquivo; padrão: base, centro = {0.5, 1}),
//  area {w,h} (células ocupadas no chão), colisao {tipo:'nenhuma'|'caixa', x,y,w,h em px relativos ao pivô},
//  conectores [{id, tipo:'face'|'topo'|'base', x, y, aceita:[sub...]}] (pontos de encaixe, em px relativos ao pivô),
//  camada (uma de CAMADAS), tags [].
export const PERSPECTIVAS_COMP = ['arq25d', 'topo', 'ambas'];
export const compativelComPreset = (comp, presetId) => comp.perspectiva === 'ambas' || comp.perspectiva === presetId;
