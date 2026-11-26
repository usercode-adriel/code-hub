// CATÁLOGO CENTRAL DE OBJETOS: tudo que existe no jogo (loja, inventário, construção e interações) sai daqui.
// O sprite aponta para public/arte/objetos/<sprite>.png (arte 2x, desenhada a 0,5). Sem o arquivo, o jogo desenha um placeholder identificável.
import type { Categoria, Interacao, ItemDef } from '../tipos';
import { aplicar } from './propriedades';

type Extra = Partial<ItemDef>;
const I = (id: string, nome: string, descricao: string, categoria: Categoria, w: number, h: number, preco: number, camada: ItemDef['camada'], extra: Extra = {}): ItemDef =>
  ({ id, nome, descricao, categoria, sprite: id, w, h, preco, estoque: 4, camada, solido: camada === 'objeto', girar: camada === 'objeto', escala: { padrao: 1, min: 0.5, max: 2 }, ...extra });
const cadeira = (id: string, nome: string, descricao: string, preco: number, v: ItemDef['variantes'], extra: Extra = {}): ItemDef =>
  I(id, nome, descricao, 'cadeiras', 1, 1, preco, 'objeto', { solido: false, sentavel: true, assentos: 1, interacao: 'assento', variantes: v, ...extra });
const sobre = (id: string, nome: string, descricao: string, categoria: Categoria, preco: number, extra: Extra = {}): ItemDef => I(id, nome, descricao, categoria, 1, 1, preco, 'sobre', { solido: false, girar: false, estoque: 6, ...extra });
const parede = (id: string, nome: string, descricao: string, categoria: Categoria, w: number, preco: number, extra: Extra = {}): ItemDef => I(id, nome, descricao, categoria, w, 1, preco, 'parede', { solido: false, girar: false, estoque: 3, ...extra });
const comp = (id: string, nome: string, descricao: string, preco: number, extra: Extra = {}): ItemDef => sobre(id, nome, descricao, 'computadores', preco, { interacao: 'computador', ...extra });

export const ITENS: ItemDef[] = [
  // ---- mesas ----
  I('mesa-simples', 'Mesa simples', 'Mesa de madeira clara para uma pessoa. Computadores e objetos ficam em cima dela.', 'mesas', 2, 1, 120, 'objeto', { mesa: true, inicial: true }),
  I('mesa-metal', 'Mesa de metal', 'Mesa de pernas metálicas, resistente e moderna.', 'mesas', 2, 1, 170, 'objeto', { mesa: true }),
  I('mesa-l', 'Mesa em L', 'Mesa grande em L, com espaço para vários equipamentos.', 'mesas', 3, 2, 340, 'objeto', { mesa: true, estoque: 2 }),
  I('mesa-baixa', 'Mesa baixa', 'Mesa baixa de centro, boa para a área de descanso.', 'mesas', 2, 1, 90, 'objeto', { mesa: true }),
  I('mesa-lateral', 'Mesa lateral', 'Mesa lateral estreita.', 'mesas', 2, 1, 75, 'objeto', { mesa: true }),
  I('mesa-redonda', 'Mesa redonda', 'Mesa redonda de reunião rápida.', 'mesas', 1, 1, 85, 'objeto', { mesa: true }),
  // ---- cadeiras ----
  cadeira('cadeira-escritorio', 'Cadeira de escritório', 'Cadeira giratória cinza. Funcionários sentam nela para trabalhar.', 60, { S: { sprite: 'cadeira-escritorio-b' }, N: { sprite: 'cadeira-escritorio' }, E: { sprite: 'cadeira-escritorio-costas' }, W: { sprite: 'cadeira-escritorio-lado' } }, { inicial: true }),
  cadeira('cadeira-gamer', 'Cadeira gamer', 'Cadeira vermelha e preta, confortável para longas jornadas.', 150, { S: { sprite: 'cadeira-gamer' }, N: { sprite: 'cadeira-gamer' }, E: { sprite: 'cadeira-gamer-lado' }, W: { sprite: 'cadeira-gamer-lado', espelhar: true } }),
  cadeira('cadeira-azul', 'Cadeira azul', 'Cadeira de visita, simples e barata.', 40, { S: { sprite: 'cadeira-azul-costas' }, N: { sprite: 'cadeira-azul' }, E: { sprite: 'cadeira-azul-lado' }, W: { sprite: 'cadeira-azul-lado', espelhar: true } }),
  cadeira('banco-alto', 'Banco alto', 'Banco alto para o balcão do café.', 30, undefined, { sprite: 'banco-alto' }),
  cadeira('puff-verde', 'Puff verde', 'Puff macio para descansar.', 55, undefined, { sprite: 'puff-verde', girar: false }),
  // ---- computadores ----
  comp('laptop', 'Laptop', 'Laptop básico. Abre o sistema do escritório: arquivos, navegador, notas e a loja.', 220, { inicial: true }),
  comp('monitor', 'Monitor', 'Monitor com computador integrado.', 380),
  comp('monitor-duplo', 'Monitor duplo', 'Dois monitores para trabalhar com mais espaço.', 640),
  comp('monitor-curvo', 'Monitor curvo', 'Monitor curvo de alto desempenho.', 780),
  comp('mesa-digitalizadora', 'Mesa digitalizadora', 'Mesa digitalizadora para desenho e ideias.', 140, { interacao: undefined }),
  sobre('teclado', 'Teclado', 'Teclado mecânico.', 'computadores', 28), sobre('mouse', 'Mouse', 'Mouse sem fio.', 'computadores', 16), sobre('webcam', 'Webcam', 'Câmera para reuniões.', 'computadores', 45),
  sobre('torre-pc', 'Torre de PC', 'Torre de computador (decoração técnica).', 'computadores', 160),
  sobre('telefone', 'Telefone', 'Telefone fixo de escritório.', 'equipamentos', 48), sobre('roteador', 'Roteador', 'Roteador de internet.', 'equipamentos', 65),
  // ---- armazenamento (armários guardam objetos de verdade) ----
  I('arquivo-gavetas', 'Arquivo de gavetas', 'Arquivo de aço com 2 gavetas. Guarda 12 itens.', 'armazenamento', 1, 1, 130, 'objeto', { interacao: 'armario', capacidade: 12 }),
  I('locker', 'Armário locker', 'Armário de aço alto, com porta. Guarda 16 itens.', 'armazenamento', 1, 1, 190, 'objeto', { interacao: 'armario', capacidade: 16 }),
  I('estante', 'Estante de madeira', 'Estante aberta de duas prateleiras. Guarda 24 itens.', 'armazenamento', 2, 1, 230, 'objeto', { interacao: 'armario', capacidade: 24 }),
  I('vitrine', 'Vitrine', 'Vitrine de vidro para itens especiais. Guarda 12 itens.', 'armazenamento', 1, 1, 210, 'objeto', { interacao: 'armario', capacidade: 12 }),
  I('cofre', 'Cofre', 'Cofre pequeno. Guarda 8 itens.', 'armazenamento', 1, 1, 420, 'objeto', { interacao: 'armario', capacidade: 8, estoque: 2 }),
  I('frigobar', 'Frigobar', 'Geladeira pequena. Guarda 10 itens.', 'armazenamento', 1, 1, 260, 'objeto', { interacao: 'armario', capacidade: 10 }),
  // ---- sofás ----
  I('sofa-2', 'Sofá de 2 lugares', 'Sofá cinza. Funcionários descansam nele.', 'sofas', 2, 1, 390, 'objeto', { sentavel: true, assentos: 2, interacao: 'assento', solido: false }),
  I('sofa-3', 'Sofá de 3 lugares', 'Sofá grande cinza.', 'sofas', 3, 1, 540, 'objeto', { sentavel: true, assentos: 3, interacao: 'assento', solido: false, estoque: 2 }),
  I('poltrona', 'Poltrona', 'Poltrona azul-petróleo.', 'sofas', 1, 1, 210, 'objeto', { sentavel: true, assentos: 1, interacao: 'assento', solido: false }),
  I('poltrona-grande', 'Poltrona grande', 'Poltrona larga, para duas pessoas magras.', 'sofas', 2, 1, 310, 'objeto', { sentavel: true, assentos: 1, interacao: 'assento', solido: false }),
  I('poltrona-pequena', 'Poltrona pequena', 'Poltrona compacta.', 'sofas', 1, 1, 150, 'objeto', { sentavel: true, assentos: 1, interacao: 'assento', solido: false }),
  // ---- cafeteria ----
  sobre('cafeteira', 'Cafeteira', 'Faz café de verdade: funcionários cansados vão tomar um.', 'cafeteria', 170, { interacao: 'cafeteira' }),
  I('bebedouro', 'Bebedouro', 'Galão de água para refrescar a equipe.', 'cafeteria', 1, 1, 150, 'objeto', { interacao: 'bebedouro' }),
  sobre('microondas', 'Micro-ondas', 'Micro-ondas para esquentar o almoço.', 'cafeteria', 95), sobre('jarra-cafe', 'Jarra de café', 'Jarra de café.', 'cafeteria', 14), sobre('caneca', 'Caneca', 'Caneca vermelha.', 'cafeteria', 8), sobre('caneca-2', 'Caneca térmica', 'Caneca com café.', 'cafeteria', 9),
  // ---- quadros (funcionais) ----
  I('quadro-branco', 'Quadro branco', 'Quadro branco com rodinhas: escreva, desenhe e guarde ideias.', 'quadros', 2, 1, 190, 'objeto', { interacao: 'quadro', solido: true }),
  I('flipchart', 'Flipchart', 'Cavalete com bloco de papel para brainstorming.', 'quadros', 1, 1, 120, 'objeto', { interacao: 'quadro' }),
  I('quadro-postit', 'Quadro de post-its', 'Quadro com notas coloridas para organizar tarefas.', 'quadros', 2, 1, 110, 'objeto', { interacao: 'quadro' }),
  I('mural-cortica', 'Mural de cortiça', 'Mural de avisos e ideias.', 'quadros', 2, 1, 100, 'objeto', { interacao: 'quadro' }),
  // ---- impressoras e equipamentos ----
  I('impressora', 'Impressora', 'Impressora multifuncional: imprime documentos dos computadores.', 'impressoras', 2, 1, 310, 'objeto', { interacao: 'impressora', estoque: 3 }),
  sobre('projetor', 'Projetor', 'Projetor: transmite o painel do escritório.', 'equipamentos', 290, { interacao: 'tv' }),
  parede('tela-projecao', 'Tela de projeção', 'Tela na parede: liga e mostra o painel do escritório.', 'equipamentos', 2, 360, { interacao: 'tv' }),
  I('ventilador', 'Ventilador', 'Ventilador de mesa.', 'equipamentos', 1, 1, 55, 'objeto', { solido: false }), I('aquecedor', 'Aquecedor', 'Aquecedor elétrico.', 'equipamentos', 1, 1, 95, 'objeto'),
  // ---- iluminação ----
  I('abajur-chao', 'Abajur de chão', 'Abajur com luz suave.', 'iluminacao', 1, 1, 70, 'objeto', { solido: false }), sobre('luminaria-mesa', 'Luminária de mesa', 'Luminária articulada.', 'iluminacao', 45),
  // ---- plantas (têm estado: precisam de água) ----
  I('planta-feliz', 'Planta sorridente', 'Planta num vaso laranja. Precisa de água de vez em quando.', 'plantas', 1, 1, 42, 'objeto', { interacao: 'planta', solido: false }),
  I('planta-vaso', 'Palmeira de vaso', 'Palmeira decorativa. Precisa de água.', 'plantas', 1, 1, 48, 'objeto', { interacao: 'planta', solido: false }),
  sobre('suculenta', 'Suculenta', 'Suculenta de mesa. Precisa de pouca água.', 'plantas', 30, { interacao: 'planta' }),
  parede('planta-pendurada', 'Planta pendurada', 'Planta pendente presa à parede.', 'plantas', 1, 38, { interacao: 'planta' }),
  // ---- decoração ----
  parede('relogio-parede', 'Relógio de parede', 'Relógio que mostra o horário do jogo.', 'decoracao', 1, 60, { interacao: 'relogio' }), parede('calendario', 'Calendário', 'Calendário de parede.', 'decoracao', 1, 40),
  parede('diploma', 'Diploma', 'Diploma emoldurado.', 'decoracao', 1, 55), parede('quadro-paisagem', 'Quadro de paisagem', 'Quadro com paisagem.', 'decoracao', 1, 90),
  parede('prateleira-pastas', 'Prateleira de pastas', 'Prateleira com pastas coloridas.', 'decoracao', 2, 110), parede('prateleira-livros', 'Prateleira de livros', 'Prateleira com livros.', 'decoracao', 2, 120),
  parede('kit-socorros', 'Kit de primeiros socorros', 'Maleta de primeiros socorros.', 'decoracao', 1, 70), parede('placa-saida', 'Placa de saída', 'Placa de saída de emergência.', 'decoracao', 1, 50), parede('grade-ventilacao', 'Grade de ventilação', 'Grade de ar.', 'decoracao', 1, 45),
  parede('janela', 'Janela', 'Janela grande com vista da cidade (ocupa 3 tiles de parede).', 'decoracao', 3, 160, { sprite: 'janela' }),
  sobre('trofeu', 'Troféu', 'Troféu dourado.', 'decoracao', 80), sobre('despertador', 'Despertador', 'Despertador vermelho.', 'decoracao', 30), sobre('porta-lapis', 'Porta-lápis', 'Porta-lápis.', 'decoracao', 12), sobre('caderno', 'Caderno', 'Caderno azul.', 'decoracao', 14),
  sobre('papeis', 'Papéis', 'Pilha de papéis.', 'decoracao', 6), sobre('ampulheta', 'Ampulheta', 'Ampulheta.', 'decoracao', 24), sobre('almofada', 'Almofada', 'Almofada laranja.', 'decoracao', 25),
  // ---- outros ----
  I('caixa-papelao', 'Caixa de papelão', 'Caixa de papelão.', 'outros', 1, 1, 20, 'objeto'), I('pilha-caixas', 'Pilha de caixas', 'Duas caixas empilhadas.', 'outros', 1, 1, 36, 'objeto'),
  I('lixeira', 'Lixeira', 'Lixeira: descarte objetos do inventário.', 'outros', 1, 1, 22, 'objeto', { interacao: 'lixeira', solido: false }), I('lixeira-reciclagem', 'Lixeira de reciclagem', 'Lixeira azul de reciclagem.', 'outros', 1, 1, 26, 'objeto', { interacao: 'lixeira', solido: false }),
  I('extintor', 'Extintor', 'Extintor de incêndio.', 'outros', 1, 1, 32, 'objeto', { solido: false, girar: false }),
];

ITENS.forEach(aplicar);
export const porId = new Map(ITENS.map((i) => [i.id, i]));
export const item = (id: string): ItemDef | undefined => porId.get(id);
export const CATEGORIAS: { id: Categoria; nome: string }[] = [
  { id: 'mesas', nome: 'Mesas' }, { id: 'cadeiras', nome: 'Cadeiras' }, { id: 'computadores', nome: 'Computadores' }, { id: 'armazenamento', nome: 'Armazenamento' }, { id: 'sofas', nome: 'Sofás' }, { id: 'decoracao', nome: 'Decoração' },
  { id: 'plantas', nome: 'Plantas' }, { id: 'iluminacao', nome: 'Iluminação' }, { id: 'impressoras', nome: 'Impressoras' }, { id: 'equipamentos', nome: 'Equipamentos' }, { id: 'cafeteria', nome: 'Cafeteria' }, { id: 'quadros', nome: 'Quadros' }, { id: 'outros', nome: 'Outros' },
];
export const precoVenda = (d: ItemDef): number => Math.max(1, Math.floor(d.preco * 0.6));                // revenda: 60% do preço
export const INTERACOES: Record<Interacao, string> = { computador: 'Usar computador', armario: 'Abrir', quadro: 'Abrir quadro', cafeteira: 'Usar cafeteira', impressora: 'Usar impressora', tv: 'Ligar/desligar', relogio: 'Ver horário', planta: 'Cuidar da planta', lixeira: 'Descartar', bebedouro: 'Beber água', assento: 'Assento' };
