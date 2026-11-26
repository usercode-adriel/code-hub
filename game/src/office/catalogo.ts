// CATÁLOGO DE OBJETOS E PISOS. Cada tipo descreve o tamanho (em tiles), a altura visual, se bloqueia a passagem, onde pode ficar
// e a ação padrão ao clicar. Objetos de um asset importado (Asset Studio) usam o mesmo formato, com o PNG no lugar do desenho.
export type CategoriaObjeto = 'moveis' | 'equipamentos' | 'computadores' | 'decoracao' | 'plantas' | 'paineis' | 'estoque';
export interface TipoObjeto {
  tipo: string; nome: string; categoria: CategoriaObjeto; largura: number; profundidade: number; altura: number;
  solido: boolean; sentavel?: boolean; suporte?: string;          // suporte: tipo (categoria "mesa") em que precisa ficar
  alturaSuporte?: number;                                          // quanto o objeto sobe quando está sobre algo
  acao?: { alvo: string; rotulo: string };                         // ação padrão (painel do escritório ou ferramenta do Hub)
}

const O = (t: TipoObjeto): TipoObjeto => t;
export const OBJETOS: TipoObjeto[] = [
  O({ tipo: 'mesa', nome: 'Mesa de trabalho', categoria: 'moveis', largura: 2, profundidade: 1, altura: 26, solido: true }),
  O({ tipo: 'mesa-executiva', nome: 'Mesa executiva', categoria: 'moveis', largura: 3, profundidade: 1, altura: 28, solido: true }),
  O({ tipo: 'cadeira', nome: 'Cadeira', categoria: 'moveis', largura: 1, profundidade: 1, altura: 22, solido: false, sentavel: true }),
  O({ tipo: 'computador', nome: 'Computador', categoria: 'computadores', largura: 1, profundidade: 1, altura: 22, solido: false, suporte: 'mesa', alturaSuporte: 26, acao: { alvo: 'estacao', rotulo: 'Abrir estação de trabalho' } }),
  O({ tipo: 'mesa-reuniao', nome: 'Mesa de reuniões', categoria: 'moveis', largura: 3, profundidade: 2, altura: 26, solido: true, acao: { alvo: 'reunioes', rotulo: 'Abrir sala de reuniões' } }),
  O({ tipo: 'cadeira-reuniao', nome: 'Cadeira de reunião', categoria: 'moveis', largura: 1, profundidade: 1, altura: 20, solido: false, sentavel: true }),
  O({ tipo: 'painel-indicadores', nome: 'Painel de indicadores', categoria: 'paineis', largura: 2, profundidade: 1, altura: 64, solido: true, acao: { alvo: 'indicadores', rotulo: 'Abrir indicadores' } }),
  O({ tipo: 'painel-financeiro', nome: 'Painel financeiro', categoria: 'paineis', largura: 2, profundidade: 1, altura: 64, solido: true, acao: { alvo: 'financeiro', rotulo: 'Abrir módulo financeiro' } }),
  O({ tipo: 'painel-produtos', nome: 'Painel de produtos', categoria: 'paineis', largura: 2, profundidade: 1, altura: 64, solido: true, acao: { alvo: 'produtos', rotulo: 'Abrir produtos' } }),
  O({ tipo: 'painel-referencias', nome: 'Painel de referências', categoria: 'paineis', largura: 2, profundidade: 1, altura: 60, solido: true, acao: { alvo: 'campanhas', rotulo: 'Abrir campanhas' } }),
  O({ tipo: 'estante', nome: 'Estante', categoria: 'moveis', largura: 1, profundidade: 1, altura: 56, solido: true, acao: { alvo: 'assets', rotulo: 'Abrir biblioteca de recursos' } }),
  O({ tipo: 'arquivo', nome: 'Arquivo', categoria: 'moveis', largura: 1, profundidade: 1, altura: 40, solido: true, acao: { alvo: 'financeiro', rotulo: 'Abrir registros financeiros' } }),
  O({ tipo: 'catalogo', nome: 'Catálogo de produtos', categoria: 'equipamentos', largura: 1, profundidade: 1, altura: 34, solido: true, acao: { alvo: 'produtos', rotulo: 'Abrir catálogo' } }),
  O({ tipo: 'estacao-marketplace', nome: 'Estação de marketplace', categoria: 'computadores', largura: 1, profundidade: 1, altura: 40, solido: true, acao: { alvo: 'conectores', rotulo: 'Abrir integrações comerciais' } }),
  O({ tipo: 'estacao-importacao', nome: 'Estação de importação', categoria: 'computadores', largura: 1, profundidade: 1, altura: 38, solido: true, acao: { alvo: 'importador', rotulo: 'Importar relatórios' } }),
  O({ tipo: 'camera', nome: 'Câmera de vídeo', categoria: 'equipamentos', largura: 1, profundidade: 1, altura: 46, solido: true, acao: { alvo: 'estudio-video', rotulo: 'Abrir estúdio audiovisual' } }),
  O({ tipo: 'luz-estudio', nome: 'Luz de estúdio', categoria: 'equipamentos', largura: 1, profundidade: 1, altura: 60, solido: true }),
  O({ tipo: 'cenario', nome: 'Cenário de gravação', categoria: 'decoracao', largura: 3, profundidade: 1, altura: 70, solido: true }),
  O({ tipo: 'estacao-edicao', nome: 'Estação de edição', categoria: 'computadores', largura: 2, profundidade: 1, altura: 38, solido: true, acao: { alvo: 'video-editor', rotulo: 'Abrir Editor de Vídeo' } }),
  O({ tipo: 'sofa', nome: 'Sofá', categoria: 'moveis', largura: 2, profundidade: 1, altura: 26, solido: true, sentavel: true }),
  O({ tipo: 'mesa-centro', nome: 'Mesa de centro', categoria: 'moveis', largura: 1, profundidade: 1, altura: 14, solido: true }),
  O({ tipo: 'planta', nome: 'Planta', categoria: 'plantas', largura: 1, profundidade: 1, altura: 44, solido: true }),
  O({ tipo: 'bebedouro', nome: 'Bebedouro', categoria: 'equipamentos', largura: 1, profundidade: 1, altura: 44, solido: true }),
  O({ tipo: 'cafeteira', nome: 'Café', categoria: 'equipamentos', largura: 1, profundidade: 1, altura: 36, solido: true }),
  O({ tipo: 'tapete', nome: 'Tapete', categoria: 'decoracao', largura: 3, profundidade: 2, altura: 2, solido: false }),
  // ---- Commerce Office 2.1: estações individuais, decoração do escritório e Sala de Estoque e Logística ----
  O({ tipo: 'monitor', nome: 'Monitor', categoria: 'computadores', largura: 1, profundidade: 1, altura: 22, solido: false, suporte: 'mesa', alturaSuporte: 26, acao: { alvo: 'estacao', rotulo: 'Abrir estação de trabalho' } }),
  O({ tipo: 'teclado', nome: 'Teclado', categoria: 'computadores', largura: 1, profundidade: 1, altura: 4, solido: false, suporte: 'mesa', alturaSuporte: 26 }),
  O({ tipo: 'mouse', nome: 'Mouse', categoria: 'computadores', largura: 1, profundidade: 1, altura: 3, solido: false, suporte: 'mesa', alturaSuporte: 26 }),
  O({ tipo: 'documentos', nome: 'Documentos', categoria: 'decoracao', largura: 1, profundidade: 1, altura: 6, solido: false, suporte: 'mesa', alturaSuporte: 26 }),
  O({ tipo: 'caneca', nome: 'Caneca de café', categoria: 'decoracao', largura: 1, profundidade: 1, altura: 8, solido: false, suporte: 'mesa', alturaSuporte: 26 }),
  O({ tipo: 'porta-retrato', nome: 'Porta-retrato', categoria: 'decoracao', largura: 1, profundidade: 1, altura: 12, solido: false, suporte: 'mesa', alturaSuporte: 26 }),
  O({ tipo: 'luminaria-mesa', nome: 'Luminária de mesa', categoria: 'decoracao', largura: 1, profundidade: 1, altura: 22, solido: false, suporte: 'mesa', alturaSuporte: 26 }),
  O({ tipo: 'papeis-pastas', nome: 'Papéis e pastas', categoria: 'decoracao', largura: 1, profundidade: 1, altura: 10, solido: false, suporte: 'mesa', alturaSuporte: 26 }),
  O({ tipo: 'impressora', nome: 'Impressora', categoria: 'equipamentos', largura: 1, profundidade: 1, altura: 16, solido: false, suporte: 'mesa', alturaSuporte: 26 }),
  O({ tipo: 'cafeteira-mesa', nome: 'Cafeteira', categoria: 'equipamentos', largura: 1, profundidade: 1, altura: 22, solido: false, suporte: 'mesa', alturaSuporte: 26 }),
  O({ tipo: 'xicaras', nome: 'Xícaras', categoria: 'decoracao', largura: 1, profundidade: 1, altura: 8, solido: false, suporte: 'mesa', alturaSuporte: 26 }),
  O({ tipo: 'torre-pc', nome: 'Computador (torre)', categoria: 'computadores', largura: 1, profundidade: 1, altura: 34, solido: true }),
  O({ tipo: 'mesa-apoio', nome: 'Mesa de apoio', categoria: 'moveis', largura: 1, profundidade: 1, altura: 26, solido: true }),
  O({ tipo: 'mesa-balcao', nome: 'Balcão do café', categoria: 'moveis', largura: 2, profundidade: 1, altura: 28, solido: true }),
  O({ tipo: 'quadro-branco', nome: 'Quadro branco', categoria: 'paineis', largura: 3, profundidade: 1, altura: 54, solido: false, acao: { alvo: 'reunioes', rotulo: 'Abrir sala de reuniões' } }),
  O({ tipo: 'quadro-decorativo', nome: 'Quadro decorativo', categoria: 'decoracao', largura: 2, profundidade: 1, altura: 46, solido: false }),
  O({ tipo: 'relogio-parede', nome: 'Relógio de parede', categoria: 'decoracao', largura: 1, profundidade: 1, altura: 56, solido: false }),
  O({ tipo: 'prateleira-parede', nome: 'Prateleira de parede', categoria: 'decoracao', largura: 2, profundidade: 1, altura: 50, solido: false }),
  O({ tipo: 'estante-livros', nome: 'Estante de livros', categoria: 'moveis', largura: 2, profundidade: 1, altura: 62, solido: true, acao: { alvo: 'assets', rotulo: 'Abrir biblioteca de recursos' } }),
  O({ tipo: 'armario', nome: 'Armário', categoria: 'moveis', largura: 2, profundidade: 1, altura: 54, solido: true }),
  O({ tipo: 'poltrona', nome: 'Poltrona', categoria: 'moveis', largura: 1, profundidade: 1, altura: 30, solido: true, sentavel: true }),
  O({ tipo: 'luminaria-chao', nome: 'Luminária de chão', categoria: 'decoracao', largura: 1, profundidade: 1, altura: 64, solido: true }),
  O({ tipo: 'vaso-grande', nome: 'Vaso grande', categoria: 'plantas', largura: 1, profundidade: 1, altura: 62, solido: true }),
  O({ tipo: 'frigobar', nome: 'Frigobar', categoria: 'equipamentos', largura: 1, profundidade: 1, altura: 40, solido: true }),
  O({ tipo: 'servidor-rack', nome: 'Servidor (rack)', categoria: 'equipamentos', largura: 1, profundidade: 1, altura: 58, solido: true, acao: { alvo: 'conectores', rotulo: 'Abrir integrações comerciais' } }),
  O({ tipo: 'caixa-p', nome: 'Caixa pequena', categoria: 'estoque', largura: 1, profundidade: 1, altura: 14, solido: true }),
  O({ tipo: 'caixa-m', nome: 'Caixa média', categoria: 'estoque', largura: 1, profundidade: 1, altura: 22, solido: true }),
  O({ tipo: 'caixa-g', nome: 'Caixa grande', categoria: 'estoque', largura: 1, profundidade: 1, altura: 32, solido: true }),
  O({ tipo: 'pilha-caixas', nome: 'Pilha de caixas', categoria: 'estoque', largura: 1, profundidade: 1, altura: 50, solido: true }),
  O({ tipo: 'palete-caixas', nome: 'Palete com caixas', categoria: 'estoque', largura: 2, profundidade: 2, altura: 52, solido: true }),
  O({ tipo: 'prateleira-estoque', nome: 'Prateleira de estoque', categoria: 'estoque', largura: 2, profundidade: 1, altura: 68, solido: true, acao: { alvo: 'estoque', rotulo: 'Abrir controle de estoque' } }),
  O({ tipo: 'mesa-bancada', nome: 'Bancada de conferência', categoria: 'moveis', largura: 3, profundidade: 1, altura: 28, solido: true }),
  O({ tipo: 'impressora-etiquetas', nome: 'Impressora de etiquetas', categoria: 'equipamentos', largura: 1, profundidade: 1, altura: 14, solido: false, suporte: 'mesa', alturaSuporte: 28 }),
  O({ tipo: 'balanca', nome: 'Balança', categoria: 'equipamentos', largura: 1, profundidade: 1, altura: 10, solido: false, suporte: 'mesa', alturaSuporte: 28 }),
  O({ tipo: 'materiais-embalagem', nome: 'Materiais de embalagem', categoria: 'estoque', largura: 1, profundidade: 1, altura: 16, solido: false, suporte: 'mesa', alturaSuporte: 28 }),
  O({ tipo: 'carrinho', nome: 'Carrinho de transporte', categoria: 'estoque', largura: 2, profundidade: 1, altura: 34, solido: true }),
  O({ tipo: 'organizador', nome: 'Organizador de gavetas', categoria: 'estoque', largura: 1, profundidade: 1, altura: 38, solido: true }),
  O({ tipo: 'quadro-avisos', nome: 'Quadro de avisos', categoria: 'estoque', largura: 2, profundidade: 1, altura: 46, solido: false }),
  O({ tipo: 'extintor', nome: 'Extintor', categoria: 'estoque', largura: 1, profundidade: 1, altura: 30, solido: false }),
  O({ tipo: 'lixeira', nome: 'Lixeira', categoria: 'estoque', largura: 1, profundidade: 1, altura: 22, solido: true }),
];
export const objetoPorTipo = (tipo: string): TipoObjeto | undefined => OBJETOS.find((o) => o.tipo === tipo);

export interface TipoPiso { tipo: string; nome: string; cor: number; cor2: number }
export const PISOS: TipoPiso[] = [
  { tipo: 'madeira', nome: 'Madeira', cor: 0xb98b5c, cor2: 0xa87a4c }, { tipo: 'carpete-azul', nome: 'Carpete azul', cor: 0x4a63a8, cor2: 0x425a9c },
  { tipo: 'carpete-cinza', nome: 'Carpete cinza', cor: 0x8a8f9a, cor2: 0x7f8590 }, { tipo: 'porcelanato', nome: 'Porcelanato', cor: 0xd9dde3, cor2: 0xcdd2da },
  { tipo: 'corredor', nome: 'Corredor', cor: 0xb8b1a4, cor2: 0xaca597 }, { tipo: 'estudio', nome: 'Piso de estúdio', cor: 0x3b3f4d, cor2: 0x343846 },
  { tipo: 'convivencia', nome: 'Convivência', cor: 0xd8a773, cor2: 0xca9966 }, { tipo: 'financeiro', nome: 'Piso verde', cor: 0x5b8f6a, cor2: 0x538560 },
  { tipo: 'estoque', nome: 'Concreto do estoque', cor: 0x8d9199, cor2: 0x7d818a }, { tipo: 'estoque-faixa', nome: 'Faixa de segurança', cor: 0xcaa83a, cor2: 0xb4952c },
  { tipo: 'escritorio', nome: 'Madeira clara', cor: 0xcfae80, cor2: 0xbf9d70 },
];
export const pisoPorTipo = (t: string): TipoPiso | undefined => PISOS.find((p) => p.tipo === t);
export const TIPOS_PAREDE = [{ tipo: 'parede', nome: 'Parede' }, { tipo: 'vidro', nome: 'Vidro' }];

/** Dimensões ocupadas considerando a rotação (rot 1 e 3 trocam largura e profundidade). */
export function dimensoes(tipo: TipoObjeto, rot = 0): { w: number; d: number } {
  return rot % 2 === 1 ? { w: tipo.profundidade, d: tipo.largura } : { w: tipo.largura, d: tipo.profundidade };
}
