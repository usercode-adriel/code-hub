// ESCRITÓRIO INICIAL: a sede do Codeniac Commerce Office, com os oito departamentos. É só o ponto de partida: o Office Builder
// permite mudar tudo, e o layout salvo no servidor passa a valer. Identificadores são estáveis (as estações usam ids, não posições).
import { layoutVazio, indice, type Layout, type ObjetoLayout, type EstacaoLayout, type DepartamentoLayout } from './modelo';
import { objetoPorTipo } from './catalogo';

interface Dep { chave: string; nome: string; x: number; y: number; w: number; h: number; piso: string; cor: string }
const DEPS: Dep[] = [
  { chave: 'diretoria', nome: 'Diretoria', x: 1, y: 1, w: 10, h: 8, piso: 'carpete-azul', cor: '#6c4cf5' },
  { chave: 'pesquisa', nome: 'Pesquisa e Inteligência Comercial', x: 11, y: 1, w: 11, h: 8, piso: 'madeira', cor: '#0ea5e9' },
  { chave: 'produtos', nome: 'Produtos e Marketplace', x: 22, y: 1, w: 11, h: 8, piso: 'porcelanato', cor: '#16a34a' },
  { chave: 'marketing', nome: 'Marketing e Criatividade', x: 1, y: 10, w: 10, h: 8, piso: 'carpete-cinza', cor: '#ec4899' },
  { chave: 'reunioes', nome: 'Sala de Reuniões', x: 11, y: 10, w: 11, h: 8, piso: 'carpete-azul', cor: '#a78bfa' },
  { chave: 'financeiro', nome: 'Financeiro', x: 22, y: 10, w: 11, h: 8, piso: 'financeiro', cor: '#22c55e' },
  { chave: 'audiovisual', nome: 'Estúdio Audiovisual', x: 1, y: 19, w: 16, h: 6, piso: 'estudio', cor: '#f59e0b' },
  { chave: 'convivencia', nome: 'Área de Convivência', x: 17, y: 19, w: 16, h: 6, piso: 'convivencia', cor: '#f97316' },
];

export const FUNCIONARIOS: { chave: string; departamento: string }[] = [
  { chave: 'helena', departamento: 'diretoria' }, { chave: 'arthur', departamento: 'pesquisa' }, { chave: 'sofia', departamento: 'produtos' },
  { chave: 'isabela', departamento: 'marketing' }, { chave: 'marina', departamento: 'audiovisual' },
];

export function layoutPadrao(agentes: Record<string, string> = {}): Layout {
  const L = layoutVazio(34, 26, '');
  const piso = (x: number, y: number, t: string): void => { L.piso[indice(L, x, y)] = t; };
  for (let y = 1; y <= 24; y++) for (let x = 1; x <= 32; x++) piso(x, y, 'corredor');
  for (const d of DEPS) for (let y = d.y; y < d.y + d.h; y++) for (let x = d.x; x < d.x + d.w; x++) piso(x, y, d.piso);

  // paredes de fundo (arestas N e W de cada departamento). Porta no meio; no limite externo, janelas.
  for (const d of DEPS) {
    const portaX = d.x + Math.floor(d.w / 2); const portaY = d.y + Math.floor(d.h / 2);
    for (let x = d.x; x < d.x + d.w; x++) L.paredes.push({ x, y: d.y, lado: 'N', tipo: 'parede', abertura: d.y === 1 ? (x % 3 === 1 ? 'janela' : null) : x === portaX ? 'porta' : null });
    for (let y = d.y; y < d.y + d.h; y++) L.paredes.push({ x: d.x, y, lado: 'W', tipo: 'parede', abertura: d.x === 1 ? (y % 3 === 1 ? 'janela' : null) : y === portaY ? 'porta' : null });
  }
  L.departamentos = DEPS.map((d): DepartamentoLayout => ({ id: `dep-${d.chave}`, chave: d.chave, nome: d.nome, x: d.x, y: d.y, w: d.w, h: d.h, cor: d.cor }));

  const obj = (id: string, tipo: string, x: number, y: number, rot = 0): string => { L.objetos.push({ id, tipo, x, y, rot } as ObjetoLayout); return id; };
  const estacao = (id: string, objetoId: string, departamento: string, ferramenta: string, extra: Partial<EstacaoLayout> = {}): void => { L.estacoes.push({ id, objetoId, departamento, ferramenta, ...extra }); };
  // posto de trabalho: mesa + computador + cadeira (a cadeira, ao sul da mesa, é o ponto de trabalho do funcionário)
  const posto = (chave: string, dep: string, x: number, y: number, dono: string | null): void => {
    obj(`mesa-${chave}`, 'mesa', x, y); const pc = obj(`pc-${chave}`, 'computador', x, y); obj(`cad-${chave}`, 'cadeira', x, y + 1);
    estacao(`est-${chave}`, pc, dep, 'estacao', { agenteChave: dono, agenteId: dono ? agentes[dono] ?? null : null, pontoTrabalho: { x, y: y + 1 }, rotulo: dono ? `Estação de ${dono}` : 'Estação de trabalho' });
  };
  const fixa = (id: string, tipo: string, x: number, y: number, dep: string): void => { const o = obj(id, tipo, x, y); const a = objetoPorTipo(tipo)?.acao; if (a) estacao(`est-${id}`, o, dep, a.alvo, { rotulo: a.rotulo }); };

  // Diretoria
  obj('mesa-helena', 'mesa-executiva', 3, 3); const pcH = obj('pc-helena', 'computador', 4, 3); obj('cad-helena', 'cadeira', 4, 4);
  estacao('est-helena', pcH, 'diretoria', 'estacao', { agenteChave: 'helena', agenteId: agentes.helena ?? null, pontoTrabalho: { x: 4, y: 4 }, rotulo: 'Estação da Diretora' });
  fixa('ind-dir', 'painel-indicadores', 7, 1, 'diretoria'); obj('mr-dir', 'mesa-reuniao', 6, 5);
  for (const [i, [x, y]] of ([[5, 5], [9, 6], [6, 7], [8, 7], [7, 4]] as [number, number][]).entries()) obj(`cr-dir-${i}`, 'cadeira-reuniao', x, y);
  obj('pl-dir-1', 'planta', 1, 7); obj('pl-dir-2', 'planta', 10, 2);
  // Pesquisa
  posto('arthur', 'pesquisa', 13, 3, 'arthur'); posto('pesq2', 'pesquisa', 16, 3, null); posto('pesq3', 'pesquisa', 19, 3, null);
  fixa('ref-pesq', 'painel-referencias', 14, 1, 'pesquisa'); obj('est-pesq-1', 'estante', 21, 2); obj('est-pesq-2', 'estante', 21, 6); obj('pl-pesq', 'planta', 12, 7);
  // Produtos e Marketplace
  posto('sofia', 'produtos', 24, 3, 'sofia'); posto('prod2', 'produtos', 27, 3, null);
  fixa('pp-prod', 'painel-produtos', 23, 1, 'produtos'); fixa('cat-prod', 'catalogo', 30, 2, 'produtos'); fixa('mkt-1', 'estacao-marketplace', 31, 4, 'produtos'); fixa('mkt-2', 'estacao-marketplace', 31, 6, 'produtos'); obj('pl-prod', 'planta', 23, 7);
  // Marketing
  posto('isabela', 'marketing', 3, 12, 'isabela'); posto('mkt3', 'marketing', 6, 12, null);
  fixa('ref-mkt-1', 'painel-referencias', 2, 10, 'marketing'); fixa('ref-mkt-2', 'painel-referencias', 8, 10, 'marketing');
  obj('mr-mkt', 'mesa-reuniao', 4, 15); obj('cr-mkt-1', 'cadeira-reuniao', 3, 15); obj('cr-mkt-2', 'cadeira-reuniao', 7, 16); obj('cr-mkt-3', 'cadeira-reuniao', 5, 14); obj('pl-mkt', 'planta', 9, 16);
  // Sala de Reuniões
  fixa('mr-sala', 'mesa-reuniao', 15, 13, 'reunioes');
  for (const [i, [x, y]] of ([[15, 12], [16, 12], [17, 12], [15, 15], [16, 15], [17, 15], [14, 13], [14, 14], [18, 13], [18, 14]] as [number, number][]).entries()) obj(`cr-sala-${i}`, 'cadeira-reuniao', x, y);
  fixa('ind-sala', 'painel-indicadores', 12, 10, 'reunioes'); obj('pl-sala-1', 'planta', 21, 11); obj('pl-sala-2', 'planta', 12, 16);
  // Financeiro (painéis e arquivos; a estação financeira não pertence a um agente fixo)
  posto('fin1', 'financeiro', 24, 12, null); posto('fin2', 'financeiro', 27, 12, null);
  fixa('pf-fin', 'painel-financeiro', 23, 10, 'financeiro'); fixa('imp-fin', 'estacao-importacao', 31, 12, 'financeiro'); fixa('arq-fin-1', 'arquivo', 31, 15, 'financeiro'); fixa('arq-fin-2', 'arquivo', 30, 15, 'financeiro');
  L.estacoes.filter((e) => e.id === 'est-fin1' || e.id === 'est-fin2').forEach((e) => { e.ferramenta = 'financeiro'; e.rotulo = 'Estação financeira'; });
  // Estúdio Audiovisual
  fixa('cen-av', 'cenario', 3, 20, 'audiovisual'); fixa('cam-av', 'camera', 4, 23, 'audiovisual'); obj('luz-av-1', 'luz-estudio', 1, 22); obj('luz-av-2', 'luz-estudio', 8, 22);
  posto('marina', 'audiovisual', 11, 20, 'marina'); fixa('edi-av', 'estacao-edicao', 14, 20, 'audiovisual'); obj('pl-av', 'planta', 15, 23);
  // Área de Convivência
  obj('sofa-1', 'sofa', 19, 20); obj('sofa-2', 'sofa', 24, 20); obj('tap-conv', 'tapete', 20, 22); obj('mc-conv', 'mesa-centro', 21, 23); obj('mc-conv-2', 'mesa-centro', 26, 22);
  obj('beb', 'bebedouro', 30, 20); obj('caf', 'cafeteira', 31, 20); obj('pl-conv-1', 'planta', 18, 24); obj('pl-conv-2', 'planta', 32, 24); obj('pl-conv-3', 'planta', 28, 23);

  // funcionários nos seus postos (a cadeira do posto)
  const pos: Record<string, [number, number]> = { helena: [4, 4], arthur: [13, 4], sofia: [24, 4], isabela: [3, 13], marina: [11, 21] };
  for (const f of FUNCIONARIOS) L.personagens.push({ id: `pers-${f.chave}`, agenteId: agentes[f.chave] ?? null, personagemId: null, x: pos[f.chave][0], y: pos[f.chave][1], dir: 'N' });
  return L;
}
