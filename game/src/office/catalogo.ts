// CATÁLOGO DE OBJETOS E PISOS. Cada tipo descreve o tamanho (em tiles), a altura visual, se bloqueia a passagem, onde pode ficar
// e a ação padrão ao clicar. Objetos de um asset importado (Asset Studio) usam o mesmo formato, com o PNG no lugar do desenho.
export type CategoriaObjeto = 'moveis' | 'equipamentos' | 'computadores' | 'decoracao' | 'plantas' | 'paineis';
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
];
export const objetoPorTipo = (tipo: string): TipoObjeto | undefined => OBJETOS.find((o) => o.tipo === tipo);

export interface TipoPiso { tipo: string; nome: string; cor: number; cor2: number }
export const PISOS: TipoPiso[] = [
  { tipo: 'madeira', nome: 'Madeira', cor: 0xb98b5c, cor2: 0xa87a4c }, { tipo: 'carpete-azul', nome: 'Carpete azul', cor: 0x4a63a8, cor2: 0x425a9c },
  { tipo: 'carpete-cinza', nome: 'Carpete cinza', cor: 0x8a8f9a, cor2: 0x7f8590 }, { tipo: 'porcelanato', nome: 'Porcelanato', cor: 0xd9dde3, cor2: 0xcdd2da },
  { tipo: 'corredor', nome: 'Corredor', cor: 0xb8b1a4, cor2: 0xaca597 }, { tipo: 'estudio', nome: 'Piso de estúdio', cor: 0x3b3f4d, cor2: 0x343846 },
  { tipo: 'convivencia', nome: 'Convivência', cor: 0xd8a773, cor2: 0xca9966 }, { tipo: 'financeiro', nome: 'Piso verde', cor: 0x5b8f6a, cor2: 0x538560 },
];
export const pisoPorTipo = (t: string): TipoPiso | undefined => PISOS.find((p) => p.tipo === t);
export const TIPOS_PAREDE = [{ tipo: 'parede', nome: 'Parede' }, { tipo: 'vidro', nome: 'Vidro' }];

/** Dimensões ocupadas considerando a rotação (rot 1 e 3 trocam largura e profundidade). */
export function dimensoes(tipo: TipoObjeto, rot = 0): { w: number; d: number } {
  return rot % 2 === 1 ? { w: tipo.profundidade, d: tipo.largura } : { w: tipo.largura, d: tipo.profundidade };
}
