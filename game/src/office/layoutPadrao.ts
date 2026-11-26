// ESCRITÓRIO 3.0: UMA ÚNICA SALA AMPLA (escritório moderno de tecnologia) com a arte do pacote novo: paredes de tijolo com janelas, pisos de
// madeira/cerâmica/carpete, cinco estações, canto de logística, mesa de reuniões, área de convivência e café. O Office Builder permite mudar tudo;
// o layout salvo no servidor passa a valer. Identificadores são estáveis (as estações usam ids, não posições).
import { layoutVazio, indice, type Layout, type ObjetoLayout, type EstacaoLayout, type DepartamentoLayout } from './modelo';
import { objetoPorTipo } from './catalogo';
import type { Direcao } from './iso';

export const VERSAO_PADRAO = '3.0';
/** Funcionários: o avatar fica na posição da cadeira (a cadeira faz parte do sprite), de costas para a mesa; `assento` = lugar na reunião. */
export const FUNCIONARIOS: { chave: string; departamento: string; mesa: [number, number]; cadeira: [number, number]; assento: [number, number]; ferramenta: string; dir: Direcao }[] = [
  { chave: 'eleonor', departamento: 'escritorio', mesa: [4, 4], cadeira: [5, 5], assento: [12, 11], ferramenta: 'estacao', dir: 'NE' },
  { chave: 'lady', departamento: 'escritorio', mesa: [9, 4], cadeira: [10, 5], assento: [13, 11], ferramenta: 'estacao', dir: 'NE' },
  { chave: 'sophia', departamento: 'escritorio', mesa: [14, 4], cadeira: [15, 5], assento: [11, 12], ferramenta: 'financeiro', dir: 'NE' },
  { chave: 'laurinda', departamento: 'escritorio', mesa: [4, 9], cadeira: [5, 10], assento: [12, 14], ferramenta: 'estacao', dir: 'NE' },
  { chave: 'lucya', departamento: 'escritorio', mesa: [22, 4], cadeira: [23, 5], assento: [13, 14], ferramenta: 'estoque', dir: 'NE' },
];

export function layoutPadrao(agentes: Record<string, string> = {}): Layout {
  const L = layoutVazio(30, 20, ''); L.meta = { padrao: VERSAO_PADRAO };
  const area = (x0: number, y0: number, x1: number, y1: number, t: string): void => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) L.piso[indice(L, x, y)] = t; };
  area(1, 1, 28, 18, 'madeira');                                       // salão
  area(11, 11, 17, 17, 'carpete');                                     // área da mesa de reuniões
  area(19, 12, 28, 18, 'ceramica-creme');                              // convivência e café
  area(20, 1, 28, 9, 'ceramica-cinza');                                // canto de logística e equipamentos

  // paredes de tijolo: fundo (N) e lateral (W); janelas dão luz natural; uma porta de entrada na lateral
  const janelasN = new Set([7, 8, 12, 13, 17, 18, 26, 27]); const janelasW = new Set([4, 5, 13, 14]);
  for (let x = 1; x <= 28; x++) L.paredes.push({ x, y: 1, lado: 'N', tipo: 'parede', abertura: janelasN.has(x) ? 'janela' : null });
  for (let y = 1; y <= 18; y++) L.paredes.push({ x: 1, y, lado: 'W', tipo: 'parede', abertura: y === 9 ? 'porta' : janelasW.has(y) ? 'janela' : null });
  L.departamentos = [{ id: 'dep-escritorio', chave: 'escritorio', nome: 'Escritório Central', x: 1, y: 1, w: 28, h: 18, cor: '#6c4cf5' } as DepartamentoLayout];

  const obj = (id: string, tipo: string, x: number, y: number, rot = 0): string => { L.objetos.push({ id, tipo, x, y, rot } as ObjetoLayout); return id; };
  const estacao = (id: string, objetoId: string, ferramenta: string, extra: Partial<EstacaoLayout> = {}): void => { L.estacoes.push({ id, objetoId, departamento: 'escritorio', ferramenta, ...extra }); };
  const fixa = (id: string, tipo: string, x: number, y: number, rot = 0): void => { const o = obj(id, tipo, x, y, rot); const a = objetoPorTipo(tipo)?.acao; if (a) estacao(`est-${id}`, o, a.alvo, { rotulo: a.rotulo }); };

  // ---- parede do fundo (y=1): estantes, armários, relógio, quadros, murais, servidores ----
  fixa('est-1', 'estante-livros', 2, 1); obj('est-2', 'estante-livros', 3, 1); obj('arm-1', 'armario', 4, 1); obj('arq-1', 'arquivo-3', 5, 1);
  obj('rel-1', 'relogio-parede', 9, 1); obj('qd-1', 'quadro-decorativo', 10, 1); obj('pl-n1', 'planta', 6, 1); obj('pl-n2', 'planta-2', 12, 1);
  obj('mural-1', 'mural', 15, 1); obj('qd-2', 'quadro-mapa', 16, 1); obj('arm-2', 'armario', 19, 1);
  fixa('rack-1', 'servidor-rack', 21, 1); obj('rack-2', 'rack-3', 22, 1); fixa('est-estoque-1', 'estoque-armario', 24, 1); obj('arm-aco', 'armario-aco', 25, 1); obj('lock-1', 'locker', 28, 1);
  // ---- parede lateral (x=1) ----
  obj('arq-fin', 'arquivo-financeiro', 2, 6); obj('pl-w1', 'arvore-1', 2, 12); obj('pl-w2', 'planta-3', 2, 16); obj('arq-2', 'arquivo-2', 2, 14);
  // ---- cinco estações: mesa, monitor, torre do PC, luminária, documentos, caneca, planta; o avatar senta (de costas) na cadeira ao sul ----
  const posto = (chave: string, monitor: string, extras: string[]): void => {
    const f = FUNCIONARIOS.find((q) => q.chave === chave)!; const [x, y] = f.mesa;
    obj(`mesa-${chave}`, 'mesa', x, y); const m = obj(`mon-${chave}`, monitor, x, y); obj(`lum-${chave}`, 'luminaria-mesa', x + 1, y); extras.forEach((t, i) => obj(`${t}-${chave}`, t, x + (i % 2), y)); obj(`torre-${chave}`, 'torre-pc', x + 2, y);
    const alvo = monitor === 'monitor' ? 'estacao' : (objetoPorTipo(monitor)?.acao?.alvo ?? 'estacao');
    estacao(`est-${chave}`, m, alvo === 'estacao' ? 'estacao' : alvo, { agenteChave: chave, agenteId: agentes[chave] ?? null, pontoTrabalho: { x: f.cadeira[0], y: f.cadeira[1] }, rotulo: `Estação de ${chave}` });
  };
  posto('eleonor', 'monitor', ['pastas-1']); posto('lady', 'monitor', ['caneca-1']); posto('sophia', 'terminal-financeiro', ['pastas-2']); posto('laurinda', 'monitor', ['pastas-4']);
  posto('lucya', 'terminal-estoque', ['impressora-etiquetas']);
  obj('pl-e1', 'planta-4', 7, 4); obj('pl-e2', 'planta-5', 12, 4); obj('pl-e3', 'planta-6', 7, 9);
  // ---- logística (canto): caixas, pilhas, arquivos e organização ----
  obj('cx-g1', 'caixa-g', 26, 4); obj('cx-m1', 'caixa-m', 27, 4); obj('cx-p1', 'caixa-p', 26, 6); obj('cx-m2', 'caixa-m', 27, 6); obj('cx-g2', 'caixa-g', 27, 8); obj('cx-p2', 'caixa-p', 25, 8); obj('cx-org', 'caixa-organizadora', 24, 8); obj('cx-metal', 'caixa-metal-1', 26, 8); obj('arq-log', 'arquivo-pequeno', 28, 6);
  fixa('copi-1', 'copiadora', 20, 5); obj('multi-1', 'multifuncional', 21, 9); obj('lix-1', 'lixeira-reciclagem', 20, 9);
  // ---- reuniões: mesa grande no centro-sul, cadeiras azuis, quadro branco ----
  fixa('mr-1', 'mesa-reuniao', 12, 12); fixa('qb-1', 'quadro-branco', 17, 10);
  const assentos: Record<string, string> = {};
  for (const f of FUNCIONARIOS) { const id = `ass-${f.chave}`; obj(id, 'cadeira-azul', f.assento[0], f.assento[1]); assentos[f.chave] = id; }
  obj('ass-extra-1', 'cadeira-azul', 14, 12); obj('ass-extra-2', 'cadeira-azul', 11, 13); obj('ass-extra-3', 'cadeira-azul', 14, 13);
  for (const f of FUNCIONARIOS) estacao(`est-ass-${f.chave}`, assentos[f.chave], 'assento', { agenteChave: f.chave, agenteId: agentes[f.chave] ?? null, pontoTrabalho: { x: f.assento[0], y: f.assento[1] }, rotulo: `Assento de ${f.chave} na reunião` });
  // ---- convivência e café ----
  obj('sofa-1', 'sofa', 21, 14); obj('pol-1', 'poltrona', 19, 14); obj('pol-2', 'poltrona', 24, 15); obj('mc-1', 'mesa-centro', 21, 16); obj('lum-ch', 'luminaria-chao', 25, 13); obj('pl-c1', 'arvore-2', 19, 18); obj('pl-c2', 'planta-7', 27, 18);
  obj('bal-1', 'mesa-recepcao', 25, 17); obj('caf-1', 'cafeteira-mesa', 25, 17); obj('xic-1', 'xicara', 26, 17); obj('beb-1', 'bebedouro', 28, 14); obj('vit-1', 'vitrine', 28, 12); obj('lix-2', 'lixeira-2', 28, 16);
  obj('ban-1', 'banco-redondo', 24, 18); obj('ext-1', 'extintor', 12, 18); obj('kit-1', 'kit-socorros', 8, 1);
  obj('tro-1', 'trofeu', 26, 18); obj('qd-3', 'quadro-praia', 20, 1); obj('pl-s3', 'planta-5', 13, 18); obj('ban-2', 'banco', 16, 18);
  obj('pl-s1', 'planta', 2, 18); obj('pl-s2', 'arvore-1', 10, 18);

  for (const f of FUNCIONARIOS) L.personagens.push({ id: `pers-${f.chave}`, agenteId: agentes[f.chave] ?? null, personagemId: null, x: f.cadeira[0], y: f.cadeira[1], dir: f.dir });
  return L;
}
