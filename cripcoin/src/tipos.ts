// TIPOS DO JOGO. Tudo que é salvo vive em `Projeto` (JSON puro): o jogo inteiro é reconstruído a partir dele.
export type Dir = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';
export const DIRS: Dir[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export type Categoria = 'mesas' | 'cadeiras' | 'computadores' | 'armazenamento' | 'sofas' | 'decoracao' | 'plantas' | 'iluminacao' | 'impressoras' | 'equipamentos' | 'cafeteria' | 'quadros' | 'outros';
export type Interacao = 'computador' | 'armario' | 'quadro' | 'cafeteira' | 'impressora' | 'tv' | 'relogio' | 'planta' | 'lixeira' | 'bebedouro' | 'assento';

export interface Variante { sprite: string; espelhar?: boolean }
export interface ItemDef {
  id: string; nome: string; descricao: string; categoria: Categoria; sprite: string;
  variantes?: Partial<Record<'S' | 'E' | 'N' | 'W', Variante>>;     // um sprite por direção (S = de frente, N = de costas, E/W = de lado)
  w: number; h: number;                                              // pegada em tiles (rot 0)
  preco: number; estoque: number;                                    // preço em Cripcoin e quantidade que a loja repõe por dia
  camada: 'chao' | 'objeto' | 'sobre' | 'parede';                    // chao: tapetes; sobre: em cima de mesas; parede: preso à parede (norte)
  solido: boolean; mesa?: boolean; sentavel?: boolean; assentos?: number;
  interacao?: Interacao; capacidade?: number;                        // capacidade: slots do armário
  girar: boolean; inicial?: boolean;
}

export interface ObjetoColocado { id: string; def: string; x: number; y: number; rot: 0 | 1 | 2 | 3; sobre?: string; estado?: Record<string, unknown> }
export interface Porta { x: number; y: number; aberta: boolean }
export interface Transacao { id: string; dia: number; hora: string; tipo: 'compra' | 'venda' | 'salario' | 'recompensa' | 'gasto' | 'inicial'; valor: number; descricao: string }

export type NoArquivo = { id: string; nome: string; tipo: 'pasta' | 'txt' | 'doc' | 'nota' | 'projeto' | 'relatorio'; conteudo?: string; filhos?: NoArquivo[]; modificado: number };
export interface Computador { fs: NoArquivo; papel?: string }
export interface QuadroDados { tracos: { cor: string; tam: number; apagar?: boolean; pts: [number, number][] }[]; notas: { id: string; texto: string; feito: boolean }[]; ideias: string[] }

export type EstadoFunc = 'ausente' | 'chegando' | 'indo_trabalhar' | 'trabalhando' | 'conversando' | 'pausa' | 'cafe' | 'descansando' | 'indo_embora' | 'parado';
export interface Habilidades { criatividade: number; logica: number; comunicacao: number; organizacao: number }
export interface Candidato {
  id: string; avatar: string; nome: string; idade: number; cargo: string; especialidade: string; habilidades: Habilidades; tracos: string[];
  fortes: string[]; fracos: string[]; salario: number; descricao: string; disponibilidade: string; comportamento: string;
}
export interface Funcionario {
  id: string; candidatoId: string; avatar: string; nome: string; sobrenome: string; apelido: string; cargo: string; profissao: string; idade: number;
  tracos: string[]; comportamento: string; habilidades: Habilidades; produtividade: number; energia: number; humor: number; salario: number;
  entrada: number; saida: number; estacao: string | null; status: 'ativo' | 'demitido' | 'afastado'; contratadoEm: number; diasSemPagar: number;
  estado: EstadoFunc; x: number; y: number; dir: Dir; caminho: { x: number; y: number }[]; alvo?: string | null; desde: number; fala?: string; falaAte?: number; produzido: number;
}

export interface Projeto {
  versao: number; id: string; nome: string; empresa: string; criadoEm: number; atualizadoEm: number;
  largura: number; altura: number; tile: number;
  piso: string[]; paredes: number[];                                // paredes: 1 = parede; o piso '' = sem piso
  corParede: string; alturaParede: number;
  portas: Porta[]; objetos: ObjetoColocado[];
  cc: number; transacoes: Transacao[]; inventario: Record<string, number>; estoqueLoja: Record<string, number>; diaEstoque: number;
  funcionarios: Funcionario[]; candidatos: Candidato[]; recontratar: Candidato[];
  computadores: Record<string, Computador>; quadros: Record<string, QuadroDados>; armarios: Record<string, Record<string, number>>;
  minuto: number; velocidade: number; prox: number; config: { som: boolean; papelDeParede: string };
}
