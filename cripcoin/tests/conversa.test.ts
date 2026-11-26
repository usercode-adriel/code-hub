import { describe, expect, it } from 'vitest';
import { adicionarAutomacao, casa, registrarAcao } from '../src/automacao/regras';
import { definirProvedor, ErroProvedor, provedorServidor, type Provedor } from '../src/automacao/provedor';
import { item } from '../src/dados/catalogo';
import { Jogo, novoProjeto } from '../src/nucleo/jogo';
import { colocar, pintarParedeCor, pintarTodasParedes, preencherPiso, type ConfigNovo } from '../src/nucleo/mapa';
import { importar, exportar } from '../src/nucleo/persistencia';
import { contratar } from '../src/sistemas/funcionarios';
import { duracaoBalao } from '../src/sistemas/conversa';

const cfg: ConfigNovo = { nome: 'T', empresa: 'Cia', largura: 16, altura: 12, tile: 32, piso: 'madeira', corParede: 'creme', alturaParede: 1.4, portas: [{ lado: 'S', pos: 7 }] };
const cfgC = (nome: string, apelido = '') => ({ nome, sobrenome: '', apelido, cargo: '', profissao: '', tracos: ['calmo'], comportamento: '', salario: 30, defeitos: ['Teimoso'] });
/** Equipe de 3 com 3 estações completas. */
function equipe(): Jogo {
  const p = novoProjeto(cfg); p.cc = 99999;
  contratar(p, p.candidatos[0].id, cfgC('Ana', 'Aninha')); for (const [i, nome] of ['Beto', 'Carla'].entries()) { const x = 3 + (i + 1) * 3; const m = colocar(p, item('mesa-simples')!, x, 6, 0); colocar(p, item('cadeira-escritorio')!, x, 7, 2); colocar(p, item('laptop')!, x, 6, 0); void m; contratar(p, p.candidatos[0].id, cfgC(nome)); }
  const j = new Jogo(p, async () => {}); j.mudou(); return j;
}
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 5));
const aguardar = async (j: Jogo): Promise<void> => { for (let i = 0; i < 200 && (j.conversa.ocupada || j.conversa.balao); i++) await tick(); };

describe('conversa: uma resposta de cada vez, balão sobre a cabeça', () => {
  it('sem destinatárias na mesa recusa com motivo claro', () => { const j = new Jogo(novoProjeto(cfg)); const r = j.conversa.enviar('oi'); expect(r.ok).toBe(false); expect(r.motivo).toMatch(/mesa/); });
  it('mensagem sem nome vai para todas, e os balões aparecem em fila: nunca dois ao mesmo tempo', async () => {
    const j = equipe(); const vistos: string[] = []; let simultaneos = 0; let prov = 0;
    const provedor: Provedor = { nome: 'teste', async responder(p) { prov++; await tick(); return `Oi chefe, aqui é ${p.funcionario.nome}.`; } }; definirProvedor(provedor);
    j.assinar(() => { const b = j.conversa.balao; if (b && !b.pensando) { if (vistos[vistos.length - 1] !== b.fid) vistos.push(b.fid); } if (b && j.p.funcionarios.filter((f) => f.id === b.fid).length !== 1) simultaneos++; });
    const r = j.conversa.enviar('Bom dia, pessoal!'); expect(r).toMatchObject({ ok: true, n: 3 }); await aguardar(j);
    expect(prov).toBe(3); expect(vistos).toHaveLength(3); expect(new Set(vistos).size).toBe(3); expect(simultaneos).toBe(0); expect(j.conversa.balao).toBeNull();
    const hist = j.p.conversas![j.p.funcionarios[0].id]; expect(hist.map((m) => m.de)).toEqual(['eu', 'ela']); definirProvedor(provedorServidor);
  });
  it('citando o nome (ou apelido, sem acento/caixa) só essa pessoa responde', async () => {
    const j = equipe(); const quem: string[] = []; definirProvedor({ nome: 't', async responder(p) { quem.push(p.funcionario.nome); return 'ok'; } });
    expect(j.conversa.enviar('aninha, pode me ajudar?').n).toBe(1); await aguardar(j); expect(quem).toEqual(['Ana']); expect(j.conversa.enviar('CARLA e beto').n).toBe(2); await aguardar(j); expect(quem).toEqual(['Ana', 'Beto', 'Carla']); definirProvedor(provedorServidor);
  });
  it('o pedido leva personalidade, defeitos, habilidades e o histórico ao provedor', async () => {
    const j = equipe(); let pedido: Parameters<Provedor['responder']>[0] | null = null; definirProvedor({ nome: 't', async responder(p) { pedido = p; return 'Certo!'; } });
    j.conversa.enviar('Ana, qual o plano?'); await aguardar(j); j.conversa.enviar('Ana, e agora?'); await aguardar(j);
    expect(pedido!.funcionario.tracos).toContain('calmo'); expect(pedido!.funcionario.defeitos).toContain('Teimoso'); expect(pedido!.historico.length).toBeGreaterThanOrEqual(2); expect(pedido!.contexto.empresa).toBe('Cia'); definirProvedor(provedorServidor);
  });
  it('falha do provedor vira aviso de erro (nada inventado) e sem IA interrompe a fila inteira', async () => {
    const j = equipe(); let n = 0; definirProvedor({ nome: 't', async responder() { n++; throw new ErroProvedor('Nenhuma IA na nuvem configurada.', true); } });
    j.conversa.enviar('oi'); await aguardar(j); expect(n).toBe(1); expect(j.avisos.some((a) => a.tipo === 'erro' && /não pôde responder/.test(a.texto))).toBe(true); expect(j.conversa.balao).toBeNull();
    expect(j.p.conversas![j.p.funcionarios[0].id].every((m) => m.de === 'eu')).toBe(true); definirProvedor(provedorServidor);
  });
  it('a personagem se vira para o jogador (vista S) enquanto fala; tempo do balão cresce com o texto', async () => {
    const j = equipe(); definirProvedor({ nome: 't', async responder() { return 'Estou aqui!'; } }); j.conversa.enviar('Ana?'); await aguardar(j); const f = j.p.funcionarios[0]; expect(f.dir).toBe('S'); expect(duracaoBalao('x'.repeat(150))).toBeGreaterThan(duracaoBalao('oi')); definirProvedor(provedorServidor);
  });
  it('histórico por personagem é limitado e persiste no save', async () => {
    const j = equipe(); definirProvedor({ nome: 't', async responder() { return 'sim'; } }); for (let i = 0; i < 20; i++) { j.conversa.enviar('Ana, mais um'); await aguardar(j); }
    const h = j.p.conversas![j.p.funcionarios[0].id]; expect(h.length).toBeLessThanOrEqual(30); const r = importar(exportar(j.p))!; expect(r.conversas![j.p.funcionarios[0].id]).toHaveLength(h.length); definirProvedor(provedorServidor);
  });
});

describe('automações (base preparada)', () => {
  it('evento + filtro disparam ações; ações são extensíveis; regra desligada não roda', async () => {
    const j = equipe(); const feito: string[] = []; registrarAcao('teste', ({ params, dados }) => { feito.push(`${params.msg}:${dados.item}`); });
    adicionarAutomacao(j, { nome: 'a', ativa: true, gatilho: { evento: 'compra', filtro: { item: 'Mesa' } }, acoes: [{ tipo: 'teste', params: { msg: 'x' } }, { tipo: 'aviso', params: { texto: 'Comprou {item}' } }] });
    adicionarAutomacao(j, { nome: 'b', ativa: false, gatilho: { evento: 'compra' }, acoes: [{ tipo: 'teste', params: { msg: 'off' } }] });
    j.notificar('compra', { item: 'Cadeira' }); j.notificar('compra', { item: 'Mesa' }); expect(feito).toEqual(['x:Mesa']); expect(j.avisos.some((a) => a.texto === 'Comprou Mesa')).toBe(true); j.desligarAutomacoes(); j.notificar('compra', { item: 'Mesa' }); expect(feito).toHaveLength(1);
  });
  it('ação "falar" usa a mesma fila de balões; "recompensa" credita CC e registra', async () => {
    const j = equipe(); adicionarAutomacao(j, { nome: 'f', ativa: true, gatilho: { evento: 'dia_novo' }, acoes: [{ tipo: 'falar', params: { funcionario: 'Beto', texto: 'Novo dia!' } }, { tipo: 'recompensa', params: { valor: 10, descricao: 'bônus' } }] });
    const cc0 = j.p.cc; j.notificar('dia_novo', { dia: 2 }); expect(j.p.cc).toBe(cc0 + 10); await tick(); expect(j.p.transacoes.at(-1)!.descricao).toBe('bônus'); await aguardar(j);
  });
  it('um ouvinte com erro não derruba os outros e `casa` respeita o filtro', () => { const j = equipe(); let ok = 0; j.eventos.on('*', () => { throw new Error('x'); }); j.eventos.on('compra', () => { ok++; }); j.notificar('compra', {}); expect(ok).toBe(1); expect(casa({ id: '1', nome: '', ativa: true, gatilho: { evento: 'a', filtro: { k: 1 } }, acoes: [] }, 'a', { k: 2 })).toBe(false); });
});

describe('cores de parede, piso e logo', () => {
  it('pinta um trecho de parede sem mexer nas outras e depois todas; piso da sala inteira', () => {
    const p = novoProjeto(cfg); expect(pintarParedeCor(p, 2, 0, 5, 0, 'azul')).toBe(4); expect(p.coresParede![2]).toBe('azul'); expect(p.coresParede![8]).toBe(''); expect(pintarParedeCor(p, 2, 0, 5, 0, 'azul')).toBe(0); expect(pintarParedeCor(p, 3, 3, 4, 4, 'rosa')).toBe(0);
    pintarTodasParedes(p, 'verde'); expect(p.corParede).toBe('verde'); expect(p.coresParede!.every((c) => c === '')).toBe(true); const n = preencherPiso(p, 'parquet'); expect(n).toBeGreaterThan(100); expect(p.piso.filter((x, i) => x === 'parquet' && p.paredes[i] === 0).length).toBe(n);
  });
  it('as cores por trecho sobrevivem ao salvar/recarregar', () => { const p = novoProjeto(cfg); pintarParedeCor(p, 0, 0, 3, 0, 'vinho'); expect(importar(exportar(p))!.coresParede![1]).toBe('vinho'); });
  it('o quadro Codeniac é um objeto de parede da loja, com sprite próprio', () => { const d = item('quadro-codeniac')!; expect(d.camada).toBe('parede'); expect(d.categoria).toBe('decoracao'); expect(d.w).toBe(2); const p = novoProjeto(cfg); expect(() => colocar(p, d, 4, 0, 0)).not.toThrow(); });
  it('save antigo com personagens antigas: elas saem e os candidatos são refeitos com as 3 novas', () => {
    const p = novoProjeto(cfg); contratar(p, p.candidatos[0].id, cfgC('Ana')); const velho = JSON.parse(exportar(p)); velho.funcionarios[0].avatar = 'eleonor'; velho.candidatos = velho.candidatos.map((c: { avatar: string }) => ({ ...c, avatar: 'lady' }));
    const r = importar(JSON.stringify(velho))!; expect(r.funcionarios).toHaveLength(0); expect(r.candidatos.map((c) => c.avatar).sort()).toEqual(['afro', 'cacheada', 'oculos']);
  });
});

describe('bônus de 5.000 CC', () => {
  it('projetos antigos recebem os 5.000 CC uma única vez; novos já começam com 5.000', () => {
    const p = novoProjeto(cfg); expect(p.cc).toBe(5000); const velho = JSON.parse(exportar(p)); delete velho.config.bonus5000; velho.cc = 1234;
    const r = importar(JSON.stringify(velho))!; expect(r.cc).toBe(6234); expect(r.transacoes.at(-1)!.descricao).toMatch(/5\.000/); const r2 = importar(exportar(r))!; expect(r2.cc).toBe(6234);
  });
});
