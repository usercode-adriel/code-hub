// ESCRITÓRIO 2.1: EXATAMENTE DUAS SALAS no mesmo ambiente empresarial — a Sala de Estoque e Logística (pequena, cheia de detalhes) e o
// Escritório Central (aberto e compartilhado, com quatro estações individuais). O Office Builder permite mudar tudo; o layout salvo no
// servidor passa a valer. Identificadores são estáveis (as estações usam ids, não posições).
import { layoutVazio, indice, type Layout, type ObjetoLayout, type EstacaoLayout, type DepartamentoLayout } from './modelo';
import { objetoPorTipo } from './catalogo';

export const VERSAO_PADRAO = '2.1';
interface Dep { chave: string; nome: string; x: number; y: number; w: number; h: number; piso: string; cor: string }
const DEPS: Dep[] = [
  { chave: 'estoque', nome: 'Estoque e Logística', x: 1, y: 1, w: 11, h: 14, piso: 'estoque', cor: '#f59e0b' },
  { chave: 'escritorio', nome: 'Escritório Central', x: 12, y: 1, w: 21, h: 14, piso: 'escritorio', cor: '#6c4cf5' },
];

/** Funcionários iniciais, a cadeira de trabalho e o assento na mesa de reuniões. */
export const FUNCIONARIOS: { chave: string; departamento: string; cadeira: [number, number]; assento: [number, number]; ferramenta: string }[] = [
  { chave: 'eleonor', departamento: 'escritorio', cadeira: [14, 5], assento: [22, 4], ferramenta: 'estacao' },
  { chave: 'lady', departamento: 'escritorio', cadeira: [18, 5], assento: [23, 4], ferramenta: 'estacao' },
  { chave: 'sophia', departamento: 'escritorio', cadeira: [14, 10], assento: [22, 7], ferramenta: 'estacao' },
  { chave: 'laurinda', departamento: 'escritorio', cadeira: [18, 10], assento: [24, 4], ferramenta: 'estacao' },
  { chave: 'lucya', departamento: 'estoque', cadeira: [5, 10], assento: [23, 7], ferramenta: 'estoque' },
];

export function layoutPadrao(agentes: Record<string, string> = {}): Layout {
  const L = layoutVazio(34, 16, ''); L.meta = { padrao: VERSAO_PADRAO };
  const piso = (x: number, y: number, t: string): void => { L.piso[indice(L, x, y)] = t; };
  const area = (x0: number, y0: number, x1: number, y1: number, t: string): void => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) piso(x, y, t); };
  for (const d of DEPS) area(d.x, d.y, d.x + d.w - 1, d.y + d.h - 1, d.piso);
  area(2, 7, 11, 7, 'estoque-faixa');                                  // faixa de circulação da porta até o fundo do estoque
  area(20, 3, 26, 8, 'carpete-azul');                                   // área da mesa de reuniões
  area(20, 10, 25, 14, 'convivencia'); area(27, 10, 32, 14, 'porcelanato'); // convivência e café

  // paredes: fundo (N) e lado (W) de cada sala; a parede entre as salas tem uma porta; janelas ao fundo e na lateral
  const janelasN = new Set([17, 18, 26, 27]); const janelasW = new Set([3, 4, 10, 11]);
  for (let x = 1; x <= 32; x++) L.paredes.push({ x, y: 1, lado: 'N', tipo: 'parede', abertura: janelasN.has(x) ? 'janela' : null });
  for (let y = 1; y <= 14; y++) L.paredes.push({ x: 1, y, lado: 'W', tipo: 'parede', abertura: janelasW.has(y) ? 'janela' : null });
  for (let y = 1; y <= 14; y++) L.paredes.push({ x: 12, y, lado: 'W', tipo: 'parede', abertura: y === 7 ? 'porta' : null });
  L.departamentos = DEPS.map((d): DepartamentoLayout => ({ id: `dep-${d.chave}`, chave: d.chave, nome: d.nome, x: d.x, y: d.y, w: d.w, h: d.h, cor: d.cor }));

  const obj = (id: string, tipo: string, x: number, y: number, rot = 0): string => { L.objetos.push({ id, tipo, x, y, rot } as ObjetoLayout); return id; };
  const estacao = (id: string, objetoId: string, departamento: string, ferramenta: string, extra: Partial<EstacaoLayout> = {}): void => { L.estacoes.push({ id, objetoId, departamento, ferramenta, ...extra }); };
  const fixa = (id: string, tipo: string, x: number, y: number, dep: string): void => { const o = obj(id, tipo, x, y); const a = objetoPorTipo(tipo)?.acao; if (a) estacao(`est-${id}`, o, dep, a.alvo, { rotulo: a.rotulo }); };

  // ===================== SALA 1 — ESTOQUE E LOGÍSTICA =====================
  for (const [i, x] of [2, 4, 6, 8].entries()) fixa(`pe-${i + 1}`, 'prateleira-estoque', x, 1, 'estoque');
  obj('qa-est', 'quadro-avisos', 10, 1); obj('ex-est', 'extintor', 11, 2);
  obj('pc-est-1', 'pilha-caixas', 10, 3); obj('cg-est-1', 'caixa-g', 11, 3); obj('cm-est-1', 'caixa-m', 11, 4); obj('car-est', 'carrinho', 9, 4);
  obj('pal-est-1', 'palete-caixas', 2, 3);
  obj('cg-est-2', 'caixa-g', 5, 3); obj('cm-est-2', 'caixa-m', 6, 3); obj('pc-est-2', 'pilha-caixas', 7, 3); obj('cp-est-1', 'caixa-p', 5, 4); obj('org-est-1', 'organizador', 6, 4); obj('cp-est-2', 'caixa-p', 7, 4);
  // bancada de conferência da Lucya: computador de controle, impressora de etiquetas, documentos
  obj('bancada-1', 'mesa-bancada', 4, 9); obj('mon-lucya', 'monitor', 4, 9); obj('tec-lucya', 'teclado', 4, 9); obj('mou-lucya', 'mouse', 5, 9); obj('doc-lucya', 'documentos', 5, 9); obj('etq-lucya', 'impressora-etiquetas', 6, 9);
  obj('cad-lucya', 'cadeira', 5, 10);
  estacao('est-lucya', 'mon-lucya', 'estoque', 'estoque', { agenteChave: 'lucya', agenteId: agentes.lucya ?? null, pontoTrabalho: { x: 5, y: 10 }, rotulo: 'Computador de controle do estoque' });
  // bancada de embalagem
  obj('bancada-2', 'mesa-bancada', 8, 9); obj('emb-1', 'materiais-embalagem', 8, 9); obj('emb-2', 'materiais-embalagem', 9, 9); obj('bal-1', 'balanca', 10, 9);
  obj('pal-est-2', 'palete-caixas', 2, 9); obj('pe-5', 'prateleira-estoque', 5, 12); obj('pe-6', 'prateleira-estoque', 7, 12); obj('pal-est-3', 'palete-caixas', 9, 12);
  obj('cg-est-3', 'caixa-g', 2, 12); obj('cg-est-4', 'caixa-g', 3, 12); obj('pc-est-3', 'pilha-caixas', 2, 13); obj('cm-est-3', 'caixa-m', 3, 13);
  obj('cm-est-4', 'caixa-m', 2, 6); obj('cp-est-3', 'caixa-p', 3, 6); obj('org-est-2', 'organizador', 11, 5); obj('cp-est-4', 'caixa-p', 10, 6); obj('cg-est-5', 'caixa-g', 8, 11); obj('cp-est-5', 'caixa-p', 9, 11);
  obj('lix-est', 'lixeira', 11, 12); obj('pl-est', 'planta', 11, 9);

  // ===================== SALA 2 — ESCRITÓRIO CENTRAL =====================
  // parede do fundo: estante, armário, relógio, quadros, quadro branco, prateleira
  obj('est-liv', 'estante-livros', 12, 1); obj('arm-1', 'armario', 14, 1); obj('rel-1', 'relogio-parede', 16, 1); obj('qd-1', 'quadro-decorativo', 19, 1); obj('lum-1', 'luminaria-chao', 21, 1);
  fixa('qb-1', 'quadro-branco', 22, 1, 'escritorio'); obj('pl-esc-1', 'planta', 25, 1); obj('pp-esc', 'prateleira-parede', 28, 1); obj('arm-2', 'armario', 30, 1); obj('vaso-1', 'vaso-grande', 32, 1);
  for (const [i, [x, y]] of ([[13, 3], [17, 3], [13, 8], [17, 8]] as [number, number][]).entries()) obj(`tap-${i + 1}`, 'tapete', x, y);
  // quatro estações individuais: mesa, monitor, teclado, mouse, cadeira, documentos, objetos pessoais, luminária e torre do computador
  const posto = (chave: string, x: number, y: number, pessoal: string): void => {
    obj(`mesa-${chave}`, 'mesa', x, y); obj(`mon-${chave}`, 'monitor', x, y); obj(`tec-${chave}`, 'teclado', x, y); obj(`mou-${chave}`, 'mouse', x + 1, y); obj(`doc-${chave}`, 'documentos', x + 1, y);
    obj(`pes-${chave}`, pessoal, x + 1, y); obj(`lum-${chave}`, 'luminaria-mesa', x, y); obj(`torre-${chave}`, 'torre-pc', x + 2, y); obj(`cad-${chave}`, 'cadeira', x, y + 1);
    const f = FUNCIONARIOS.find((q) => q.chave === chave)!;
    estacao(`est-${chave}`, `mon-${chave}`, 'escritorio', 'estacao', { agenteChave: chave, agenteId: agentes[chave] ?? null, pontoTrabalho: { x: f.cadeira[0], y: f.cadeira[1] }, rotulo: `Estação de ${chave}` });
  };
  posto('eleonor', 14, 4, 'porta-retrato'); posto('lady', 18, 4, 'caneca'); posto('sophia', 14, 9, 'caneca'); posto('laurinda', 18, 9, 'porta-retrato');
  // mesa de reuniões com seis cadeiras (os assentos dos funcionários) e o quadro branco acima
  fixa('mr-1', 'mesa-reuniao', 22, 5, 'escritorio');
  const assentos: Record<string, string> = {};
  for (const f of FUNCIONARIOS) { const id = `ass-${f.chave}`; obj(id, 'cadeira-reuniao', f.assento[0], f.assento[1]); assentos[f.chave] = id; }
  obj('ass-extra-1', 'cadeira-reuniao', 21, 5); obj('ass-extra-2', 'cadeira-reuniao', 25, 5); obj('ass-extra-3', 'cadeira-reuniao', 21, 6); obj('ass-extra-4', 'cadeira-reuniao', 25, 6);
  for (const f of FUNCIONARIOS) estacao(`est-ass-${f.chave}`, assentos[f.chave], f.departamento, 'assento', { agenteChave: f.chave, agenteId: agentes[f.chave] ?? null, pontoTrabalho: { x: f.assento[0], y: f.assento[1] }, rotulo: `Assento de ${f.chave} na reunião` });
  // canto técnico e de impressão
  obj('ma-esc', 'mesa-apoio', 29, 3); obj('imp-esc', 'impressora', 29, 3); obj('pap-esc', 'papeis-pastas', 29, 3); fixa('arq-esc', 'arquivo', 31, 3, 'escritorio'); fixa('srv-esc', 'servidor-rack', 32, 3, 'escritorio');
  fixa('ind-esc', 'painel-indicadores', 27, 4, 'escritorio'); fixa('pf-esc', 'painel-financeiro', 29, 6, 'escritorio'); fixa('pprod-esc', 'painel-produtos', 31, 6, 'escritorio');
  fixa('mkt-esc', 'estacao-marketplace', 27, 8, 'escritorio'); fixa('imp2-esc', 'estacao-importacao', 28, 8, 'escritorio');
  // convivência: sofá, poltronas, mesa de centro, tapete, luminária
  obj('tap-conv', 'tapete', 21, 12); obj('sofa-1', 'sofa', 22, 11); obj('mc-1', 'mesa-centro', 22, 12); obj('pol-1', 'poltrona', 20, 12); obj('pol-2', 'poltrona', 24, 12); obj('lum-2', 'luminaria-chao', 25, 11); obj('pl-esc-2', 'planta', 20, 10);
  // área de café
  obj('bal-cafe', 'mesa-balcao', 28, 12); obj('caf-1', 'cafeteira-mesa', 28, 12); obj('xic-1', 'xicaras', 29, 12); obj('beb-1', 'bebedouro', 31, 12); obj('fri-1', 'frigobar', 32, 12); obj('pl-esc-3', 'planta', 27, 13); obj('vaso-2', 'vaso-grande', 32, 9);
  obj('pl-esc-4', 'planta', 13, 13); obj('pl-esc-5', 'planta', 12, 14);

  for (const f of FUNCIONARIOS) L.personagens.push({ id: `pers-${f.chave}`, agenteId: agentes[f.chave] ?? null, personagemId: null, x: f.cadeira[0], y: f.cadeira[1], dir: 'N' });
  return L;
}
