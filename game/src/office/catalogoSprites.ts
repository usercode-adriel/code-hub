// OBJETOS COM ARTE DO PACOTE (PNGs em game/office/public/arte/objetos). Cada item diz o espaço que ocupa na grade (w × d tiles), a altura
// visual (ordenação e clique), se bloqueia a passagem, se vai sobre uma mesa e a ação ao clicar. `espelhar`: a arte original está
// virada para o outro lado do eixo; o rot ímpar também inverte (e troca largura e profundidade).
import type { TipoObjeto } from './catalogo';

type Extra = Partial<TipoObjeto>;
const S = (tipo: string, nome: string, categoria: TipoObjeto['categoria'], largura: number, profundidade: number, altura: number, solido: boolean, extra: Extra = {}): TipoObjeto => ({ tipo, nome, categoria, largura, profundidade, altura, solido, sprite: tipo, ...extra });
const MESA = { suporte: 'mesa', alturaSuporte: 26 } as const;

/** Tipos novos (os antigos que têm equivalente ganham `sprite` em ALIAS e continuam funcionando nos layouts salvos). */
export const NOVOS: TipoObjeto[] = [
  S('mesa-l', 'Mesa em L', 'moveis', 2, 2, 30, true, { espelhar: true }), S('cadeira-preta', 'Cadeira executiva', 'moveis', 1, 1, 30, false, { sentavel: true }), S('cadeira-preta-2', 'Cadeira executiva 2', 'moveis', 1, 1, 30, false, { sentavel: true }),
  S('cadeira-preta-3', 'Cadeira executiva 3', 'moveis', 1, 1, 30, false, { sentavel: true }), S('cadeira-azul', 'Cadeira azul', 'moveis', 1, 1, 30, false, { sentavel: true }), S('cadeira-visita', 'Cadeira de visita', 'moveis', 1, 1, 26, false, { sentavel: true }),
  S('monitor-duplo', 'Monitor duplo', 'computadores', 1, 1, 26, false, { ...MESA, acao: { alvo: 'estacao', rotulo: 'Abrir estação de trabalho' } }), S('laptop', 'Notebook', 'computadores', 1, 1, 18, false, { ...MESA, acao: { alvo: 'estacao', rotulo: 'Abrir estação de trabalho' } }),
  S('mini-pc', 'Mini PC', 'computadores', 1, 1, 10, false, MESA), S('mini-servidor', 'Mini servidor', 'computadores', 1, 1, 34, true), S('torre-pc-2', 'Torre de PC 2', 'computadores', 1, 1, 34, true), S('torre-pc-3', 'Torre de PC 3', 'computadores', 1, 1, 36, true),
  S('scanner', 'Scanner', 'equipamentos', 1, 1, 16, false, MESA), S('multifuncional', 'Multifuncional', 'equipamentos', 1, 1, 26, true), S('copiadora', 'Copiadora', 'equipamentos', 1, 1, 26, true),
  S('roteador', 'Roteador', 'equipamentos', 1, 1, 14, false, MESA), S('switch', 'Switch de rede', 'equipamentos', 1, 1, 10, false, MESA), S('webcam', 'Câmera', 'equipamentos', 1, 1, 14, false, MESA),
  S('rack-2', 'Servidor 2', 'equipamentos', 1, 1, 50, true, { acao: { alvo: 'conectores', rotulo: 'Abrir integrações comerciais' } }), S('rack-3', 'Servidor 3', 'equipamentos', 1, 1, 56, true),
  S('armario-aco', 'Armário de aço', 'moveis', 1, 1, 56, true), S('locker', 'Armário locker', 'moveis', 1, 1, 56, true), S('arquivo-3', 'Arquivo 3 gavetas', 'moveis', 1, 1, 40, true), S('arquivo-madeira', 'Arquivo de madeira', 'moveis', 1, 1, 34, true),
  S('arquivo-2', 'Arquivo 2 gavetas', 'moveis', 1, 1, 34, true), S('arquivo-pequeno', 'Arquivo pequeno', 'moveis', 1, 1, 28, true), S('vitrine', 'Vitrine de vidro', 'moveis', 1, 1, 56, true),
  S('mesa-recepcao', 'Balcão de recepção', 'moveis', 2, 2, 34, true, { sprite: 'balcao' }), S('mural', 'Mural de avisos', 'decoracao', 1, 1, 44, false, { parede: 30 }), S('flipchart', 'Flipchart', 'paineis', 1, 1, 52, true), S('cameras', 'Câmeras', 'equipamentos', 1, 1, 30, true),
  S('planta-2', 'Planta 2', 'plantas', 1, 1, 34, true), S('planta-3', 'Planta 3', 'plantas', 1, 1, 34, true), S('arvore-1', 'Árvore', 'plantas', 1, 1, 60, true), S('arvore-2', 'Árvore 2', 'plantas', 1, 1, 56, true), S('planta-alta', 'Planta alta', 'plantas', 1, 1, 44, true),
  S('planta-4', 'Planta 4', 'plantas', 1, 1, 28, true), S('planta-5', 'Planta 5', 'plantas', 1, 1, 30, true), S('planta-6', 'Planta 6', 'plantas', 1, 1, 28, true), S('planta-7', 'Planta 7', 'plantas', 1, 1, 26, true),
  S('luminaria-mesa-2', 'Luminária azul', 'decoracao', 1, 1, 22, false, MESA), S('banco', 'Banquinho', 'moveis', 1, 1, 22, true), S('banco-redondo', 'Banco redondo', 'moveis', 1, 1, 30, true),
  S('caneca-1', 'Caneca', 'decoracao', 1, 1, 8, false, MESA), S('caneca-2', 'Caneca térmica', 'decoracao', 1, 1, 10, false, MESA), S('xicara', 'Xícara', 'decoracao', 1, 1, 6, false, MESA), S('lata', 'Lata', 'decoracao', 1, 1, 10, false, MESA), S('caixa-azul', 'Caixa azul', 'decoracao', 1, 1, 12, false, MESA),
  S('pastas-1', 'Pastas vermelhas', 'decoracao', 1, 1, 12, false, MESA), S('pastas-2', 'Pastas verdes', 'decoracao', 1, 1, 14, false, MESA), S('pastas-3', 'Pastas azuis', 'decoracao', 1, 1, 14, false, MESA), S('pastas-4', 'Pastas coloridas', 'decoracao', 1, 1, 14, false, MESA),
  S('quadro-praia', 'Quadro praia', 'decoracao', 1, 1, 40, false, { parede: 28 }), S('quadro-mapa', 'Quadro mapa', 'decoracao', 1, 1, 40, false, { parede: 28 }), S('trofeu', 'Troféu', 'decoracao', 1, 1, 14, false, MESA),
  S('caixa-metal-1', 'Caixa de metal', 'estoque', 1, 1, 24, true), S('caixa-organizadora', 'Caixa organizadora', 'estoque', 1, 1, 22, true), S('maleta', 'Maleta', 'estoque', 1, 1, 22, true), S('kit-socorros', 'Kit de primeiros socorros', 'estoque', 1, 1, 18, false, { parede: 20 }),
  S('lixeira-grande', 'Lixeira grande', 'estoque', 1, 1, 34, true), S('lixeira-reciclagem', 'Lixeira de reciclagem', 'estoque', 1, 1, 30, true), S('lixeira-2', 'Lixeira', 'estoque', 1, 1, 28, true),
  // ---- inventário ampliado (folhas de computadores, servidores e baia): computadores, periféricos, servidores e baia dupla ----
  S('imac-g3', 'iMac G3 azul', 'computadores', 1, 1, 24, false, { ...MESA, acao: { alvo: 'estacao', rotulo: 'Abrir estação de trabalho' } }), S('imac-aluminio', 'iMac alumínio', 'computadores', 1, 1, 26, false, { ...MESA, acao: { alvo: 'estacao', rotulo: 'Abrir estação de trabalho' } }),
  S('pc-retro-bege', 'PC retrô bege', 'computadores', 1, 1, 26, false, { ...MESA, acao: { alvo: 'estacao', rotulo: 'Abrir estação de trabalho' } }), S('monitor-curvo', 'Monitor curvo', 'computadores', 1, 1, 26, false, { ...MESA, acao: { alvo: 'estacao', rotulo: 'Abrir estação de trabalho' } }),
  S('monitor-preto', 'Monitor preto', 'computadores', 1, 1, 24, false, { ...MESA, acao: { alvo: 'estacao', rotulo: 'Abrir estação de trabalho' } }), S('monitor-widescreen', 'Monitor widescreen', 'computadores', 1, 1, 26, false, { ...MESA, acao: { alvo: 'estacao', rotulo: 'Abrir estação de trabalho' } }),
  S('monitor-lateral', 'Monitor de lado', 'computadores', 1, 1, 26, false, { ...MESA, acao: { alvo: 'estacao', rotulo: 'Abrir estação de trabalho' } }),
  S('teclado-cinza', 'Teclado cinza', 'computadores', 1, 1, 4, false, MESA), S('mouse-cinza', 'Mouse cinza', 'computadores', 1, 1, 3, false, MESA), S('teclado-retro-bege', 'Teclado retrô', 'computadores', 1, 1, 4, false, MESA), S('tablet-grafico', 'Mesa digitalizadora', 'computadores', 1, 1, 4, false, MESA),
  S('torre-pc-preta-2', 'Torre de PC preta', 'computadores', 1, 1, 34, true),
  S('servidor-torre-1', 'Servidor torre', 'equipamentos', 1, 1, 58, true, { acao: { alvo: 'conectores', rotulo: 'Abrir integrações comerciais' } }), S('servidor-torre-2', 'Servidor torre com tela', 'equipamentos', 1, 1, 56, true),
  S('rack-aberto', 'Rack aberto', 'equipamentos', 1, 1, 56, true), S('ups-modulos', 'UPS de módulos', 'equipamentos', 1, 2, 40, true), S('armario-bege-racks', 'Armário de racks bege', 'equipamentos', 1, 1, 62, true),
  S('porta-metal', 'Porta de metal', 'decoracao', 1, 1, 62, false), S('mesa-baia-dupla', 'Baia dupla', 'moveis', 2, 1, 56, true, { sprite: 'baia-dupla' }),
  // objetos com ação (ligados a ferramentas reais do Hub)
  S('terminal-financeiro', 'Terminal financeiro', 'computadores', 1, 1, 26, false, { ...MESA, sprite: 'monitor-duplo', acao: { alvo: 'financeiro', rotulo: 'Abrir módulo financeiro' } }),
  S('terminal-produtos', 'Terminal de produtos', 'computadores', 1, 1, 18, false, { ...MESA, sprite: 'laptop', acao: { alvo: 'produtos', rotulo: 'Abrir produtos' } }),
  S('terminal-importacao', 'Terminal de importação', 'computadores', 1, 1, 16, false, { ...MESA, sprite: 'scanner', acao: { alvo: 'importador', rotulo: 'Importar relatórios' } }),
  S('terminal-estoque', 'Computador de controle do estoque', 'computadores', 1, 1, 18, false, { ...MESA, sprite: 'laptop', acao: { alvo: 'estoque', rotulo: 'Abrir controle de estoque' } }),
  S('estoque-armario', 'Armário do estoque', 'estoque', 1, 1, 56, true, { sprite: 'armario-aco', acao: { alvo: 'estoque', rotulo: 'Abrir controle de estoque' } }),
  S('arquivo-financeiro', 'Arquivo financeiro', 'moveis', 1, 1, 50, true, { sprite: 'arquivo-4', acao: { alvo: 'financeiro', rotulo: 'Abrir registros financeiros' } }),
  S('quadro-indicadores', 'Quadro de indicadores', 'paineis', 1, 1, 44, false, { sprite: 'quadro-cidade', parede: 28, acao: { alvo: 'indicadores', rotulo: 'Abrir indicadores' } }),
];

/** Tipos antigos → arte nova (o mesmo nome do tipo continua valendo nos layouts já salvos). */
export const ALIAS: Record<string, { sprite: string; espelhar?: boolean; parede?: number }> = {
  mesa: { sprite: 'mesa', espelhar: true }, 'mesa-executiva': { sprite: 'mesa-l', espelhar: true }, cadeira: { sprite: 'cadeira-preta' }, 'cadeira-reuniao': { sprite: 'cadeira-azul' }, computador: { sprite: 'monitor' }, monitor: { sprite: 'monitor' },
  'mesa-reuniao': { sprite: 'mesa-reuniao' }, estante: { sprite: 'estante-livros' }, 'estante-livros': { sprite: 'estante-livros' }, arquivo: { sprite: 'arquivo-4' }, planta: { sprite: 'planta-1' }, 'vaso-grande': { sprite: 'arvore-1' }, sofa: { sprite: 'sofa', espelhar: true },
  poltrona: { sprite: 'poltrona' }, 'mesa-centro': { sprite: 'mesa-centro' }, bebedouro: { sprite: 'bebedouro' }, 'cafeteira-mesa': { sprite: 'cafeteira' }, impressora: { sprite: 'impressora' }, 'impressora-etiquetas': { sprite: 'impressora-etiquetas' },
  'luminaria-mesa': { sprite: 'luminaria-mesa-1' }, 'luminaria-chao': { sprite: 'luminaria-chao' }, 'torre-pc': { sprite: 'torre-pc' }, armario: { sprite: 'armario-madeira' }, 'relogio-parede': { sprite: 'relogio', parede: 34 }, 'quadro-decorativo': { sprite: 'quadro-cidade', parede: 28 },
  'quadro-branco': { sprite: 'quadro-branco' }, 'caixa-p': { sprite: 'caixa-p' }, 'caixa-m': { sprite: 'caixa-m' }, 'caixa-g': { sprite: 'caixa-g' }, frigobar: { sprite: 'vitrine' }, 'servidor-rack': { sprite: 'rack-1' }, extintor: { sprite: 'extintor' }, lixeira: { sprite: 'lixeira-2' },
  documentos: { sprite: 'pastas-1' }, caneca: { sprite: 'caneca-1' }, 'papeis-pastas': { sprite: 'pastas-2' }, 'quadro-avisos': { sprite: 'mural', parede: 30 }, organizador: { sprite: 'arquivo-3' }, 'balanca': { sprite: 'mini-pc' }, cafeteira: { sprite: 'cafeteira' },
  teclado: { sprite: 'teclado-cinza' }, mouse: { sprite: 'mouse-cinza' }, 'estacao-marketplace': { sprite: 'rack-2' }, 'painel-indicadores': { sprite: 'quadro-cidade' },
};
