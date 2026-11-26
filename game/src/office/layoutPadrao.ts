// ESCRITÓRIO 3.0: UMA ÚNICA SALA COMPACTA E QUADRADA (12×12, só piso de madeira) com a arte do pacote novo: paredes de tijolo com janelas, cinco estações,
// estantes, mesa de reuniões, canto de logística e decoração — sem espaço sobrando. O Office Builder permite mudar tudo;
// o layout salvo no servidor passa a valer. Identificadores são estáveis (as estações usam ids, não posições).
import { layoutVazio, indice, type Layout, type ObjetoLayout, type EstacaoLayout, type DepartamentoLayout } from './modelo';
import { objetoPorTipo } from './catalogo';
import type { Direcao } from './iso';

export const VERSAO_PADRAO = '3.0';
/** Funcionários: o avatar fica na posição da cadeira (a cadeira faz parte do sprite), de costas para a mesa; `assento` = lugar na reunião. */
export const FUNCIONARIOS: { chave: string; departamento: string; mesa: [number, number]; cadeira: [number, number]; assento: [number, number]; ferramenta: string; dir: Direcao }[] = [
  { chave: 'eleonor', departamento: 'escritorio', mesa: [2, 3], cadeira: [3, 4], assento: [5, 6], ferramenta: 'estacao', dir: 'NE' },
  { chave: 'lady', departamento: 'escritorio', mesa: [5, 3], cadeira: [6, 4], assento: [6, 6], ferramenta: 'estacao', dir: 'NE' },
  { chave: 'sophia', departamento: 'escritorio', mesa: [8, 3], cadeira: [9, 4], assento: [4, 7], ferramenta: 'financeiro', dir: 'NE' },
  { chave: 'laurinda', departamento: 'escritorio', mesa: [2, 9], cadeira: [3, 10], assento: [7, 7], ferramenta: 'estacao', dir: 'NE' },
  { chave: 'lucya', departamento: 'escritorio', mesa: [8, 9], cadeira: [9, 10], assento: [5, 9], ferramenta: 'estoque', dir: 'NE' },
];

export function layoutPadrao(agentes: Record<string, string> = {}): Layout {
  const L = layoutVazio(14, 14, ''); L.meta = { padrao: VERSAO_PADRAO };
  for (let y = 1; y <= 12; y++) for (let x = 1; x <= 12; x++) L.piso[indice(L, x, y)] = 'madeira';     // só madeira

  // paredes de tijolo: fundo (N) e lateral (W); janelas dão luz natural; uma porta de entrada na lateral
  const janelasN = new Set([5, 6, 9, 10]); const janelasW = new Set([4, 5, 10, 11]);
  for (let x = 1; x <= 12; x++) L.paredes.push({ x, y: 1, lado: 'N', tipo: 'parede', abertura: janelasN.has(x) ? 'janela' : null });
  for (let y = 1; y <= 12; y++) L.paredes.push({ x: 1, y, lado: 'W', tipo: 'parede', abertura: y === 7 ? 'porta' : janelasW.has(y) ? 'janela' : null });
  L.departamentos = [{ id: 'dep-escritorio', chave: 'escritorio', nome: 'Escritório Central', x: 1, y: 1, w: 12, h: 12, cor: '#6c4cf5' } as DepartamentoLayout];

  const obj = (id: string, tipo: string, x: number, y: number, rot = 0): string => { L.objetos.push({ id, tipo, x, y, rot } as ObjetoLayout); return id; };
  const estacao = (id: string, objetoId: string, ferramenta: string, extra: Partial<EstacaoLayout> = {}): void => { L.estacoes.push({ id, objetoId, departamento: 'escritorio', ferramenta, ...extra }); };
  const fixa = (id: string, tipo: string, x: number, y: number, rot = 0): void => { const o = obj(id, tipo, x, y, rot); const a = objetoPorTipo(tipo)?.acao; if (a) estacao(`est-${id}`, o, a.alvo, { rotulo: a.rotulo }); };

  // ---- parede do fundo (y=1): estantes, armário, relógio, quadros ----
  fixa('est-1', 'estante-livros', 2, 1); obj('est-2', 'estante-livros', 3, 1); obj('arm-1', 'armario', 4, 1); obj('rel-1', 'relogio-parede', 7, 1); obj('qd-1', 'quadro-decorativo', 8, 1); obj('pl-n1', 'planta', 11, 1); obj('arq-1', 'arquivo-3', 12, 1);
  // ---- parede lateral (x=1) ----
  obj('arq-fin', 'arquivo-financeiro', 1, 2); obj('pl-w1', 'arvore-1', 1, 12); obj('pl-w2', 'planta-3', 1, 9); obj('kit-1', 'kit-socorros', 1, 3); obj('pl-c', 'planta-4', 1, 1);
  // ---- cinco estações: mesa, monitor, luminária, documentos; o avatar senta (de costas) na cadeira ao sul ----
  const posto = (chave: string, monitor: string, extras: string[]): void => {
    const f = FUNCIONARIOS.find((q) => q.chave === chave)!; const [x, y] = f.mesa;
    obj(`mesa-${chave}`, 'mesa', x, y); const m = obj(`mon-${chave}`, monitor, x, y); obj(`lum-${chave}`, 'luminaria-mesa', x + 1, y); extras.forEach((t, i) => obj(`${t}-${chave}`, t, x + (i % 2), y));
    const alvo = monitor === 'monitor' ? 'estacao' : (objetoPorTipo(monitor)?.acao?.alvo ?? 'estacao');
    estacao(`est-${chave}`, m, alvo, { agenteChave: chave, agenteId: agentes[chave] ?? null, pontoTrabalho: { x: f.cadeira[0], y: f.cadeira[1] }, rotulo: `Estação de ${chave}` });
  };
  posto('eleonor', 'monitor', ['pastas-1']); posto('lady', 'monitor', ['caneca-1']); posto('sophia', 'terminal-financeiro', ['pastas-2']); posto('laurinda', 'monitor', ['pastas-4']);
  posto('lucya', 'terminal-estoque', ['impressora-etiquetas']);
  // ---- logística (canto): armário do estoque, caixas, copiadora ----
  fixa('rack-1', 'servidor-rack', 12, 3); fixa('est-estoque-1', 'estoque-armario', 12, 5); obj('lock-1', 'locker', 12, 6);
  obj('cx-g1', 'caixa-g', 12, 10); obj('cx-m1', 'caixa-m', 12, 11); obj('cx-p1', 'caixa-p', 11, 12); obj('cx-m2', 'caixa-m', 12, 12); obj('cx-org', 'caixa-organizadora', 11, 11); obj('copi-1', 'copiadora', 12, 8);
  // ---- reuniões: mesa no centro, cadeiras azuis, quadro branco ----
  fixa('mr-1', 'mesa-reuniao', 5, 7); fixa('qb-1', 'quadro-branco', 10, 7);
  const assentos: Record<string, string> = {};
  for (const f of FUNCIONARIOS) { const id = `ass-${f.chave}`; obj(id, 'cadeira-azul', f.assento[0], f.assento[1]); assentos[f.chave] = id; }
  obj('ass-extra-1', 'cadeira-azul', 6, 9); obj('ass-extra-2', 'cadeira-azul', 4, 8); obj('ass-extra-3', 'cadeira-azul', 7, 8);
  for (const f of FUNCIONARIOS) estacao(`est-ass-${f.chave}`, assentos[f.chave], 'assento', { agenteChave: f.chave, agenteId: agentes[f.chave] ?? null, pontoTrabalho: { x: f.assento[0], y: f.assento[1] }, rotulo: `Assento de ${f.chave} na reunião` });
  // ---- cantinho de descanso e café, sem tomar espaço ----
  obj('sofa-1', 'sofa', 8, 12); obj('pol-1', 'poltrona', 7, 12); obj('lum-ch', 'luminaria-chao', 10, 12); obj('beb-1', 'bebedouro', 4, 12); obj('vit-1', 'vitrine', 3, 12); obj('pl-s1', 'planta-2', 2, 12); obj('pl-s2', 'arvore-2', 6, 12);
  obj('mc-1', 'mesa-centro', 8, 11);

  for (const f of FUNCIONARIOS) L.personagens.push({ id: `pers-${f.chave}`, agenteId: agentes[f.chave] ?? null, personagemId: null, x: f.cadeira[0], y: f.cadeira[1], dir: f.dir });
  return L;
}
