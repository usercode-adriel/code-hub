import { describe, expect, it } from 'vitest';
import { item, ITENS, precoVenda } from '../src/dados/catalogo';
import { acharCaminho } from '../src/nucleo/caminho';
import { Grade } from '../src/nucleo/grade';
import { Jogo, novoProjeto } from '../src/nucleo/jogo';
import { alternarPorta, colocar, criarProjeto, mover, pintarPiso, podeColocar, tracarParede } from '../src/nucleo/mapa';
import { comprar, colocarDoInventario, guardarObjeto, venderDoInventario, venderObjeto } from '../src/sistemas/economia';
import { atribuirEstacao, computadorDaMesa, contratar, demitir, estacoesLivres, readmitir } from '../src/sistemas/funcionarios';
import { copiar, criar, excluir, fsInicial, achar, mover as moverArq, renomear, salvar } from '../src/sistemas/arquivos';
import { adicionarNota, guardarNoArmario, prepararCafe, quadro, retirarDoArmario } from '../src/sistemas/objetos';
import { diaDe, horaTexto } from '../src/nucleo/tempo';
import type { ConfigNovo } from '../src/nucleo/mapa';

const cfg: ConfigNovo = { nome: 'Teste', empresa: 'Cia', largura: 14, altura: 10, tile: 32, piso: 'madeira', corParede: 'creme', alturaParede: 1.4, portas: [{ lado: 'S', pos: 7 }] };
const novo = () => novoProjeto(cfg);
const contratarPrimeiro = (p = novo()) => { const c = p.candidatos[0]; const r = contratar(p, c.id, { nome: 'Ana', sobrenome: 'Lima', apelido: '', cargo: '', profissao: '', tracos: ['organizado'], comportamento: 'ok', salario: 40 }); return { p, r, c }; };

describe('projeto e mapa', () => {
  it('cria a sala com o tamanho EXATO e paredes dentro do retângulo', () => {
    const p = criarProjeto(cfg); expect(p.largura).toBe(14); expect(p.altura).toBe(10); expect(p.piso).toHaveLength(140);
    expect(p.paredes[0]).toBe(1); expect(p.paredes[13]).toBe(1); expect(p.portas).toHaveLength(1); expect(p.paredes[9 * 14 + 7]).toBe(0);
  });
  it('rejeita tamanhos fora do limite', () => { expect(() => criarProjeto({ ...cfg, largura: 3 })).toThrow(); expect(() => criarProjeto({ ...cfg, altura: 99 })).toThrow(); });
  it('começa só com mesa simples + laptop + cadeira básica, 1500 CC, sem funcionários', () => {
    const p = novo(); expect(p.objetos.map((o) => o.def).sort()).toEqual(['cadeira-escritorio', 'laptop', 'mesa-simples']);
    expect(p.cc).toBe(1500); expect(p.funcionarios).toHaveLength(0); expect(Object.keys(p.inventario)).toHaveLength(0);
    const lap = p.objetos.find((o) => o.def === 'laptop')!; expect(lap.sobre).toBeTruthy(); expect(p.computadores[lap.id].fs.nome).toBe('Computador');
  });
  it('não coloca objeto em parede, fora do piso ou sobre outro objeto', () => {
    const p = novo(); const d = item('mesa-simples')!; expect(podeColocar(p, d, 0, 0, 0).ok).toBe(false); const m = p.objetos.find((o) => o.def === 'mesa-simples')!;
    expect(podeColocar(p, d, m.x, m.y, 0).ok).toBe(false); expect(podeColocar(p, d, 3, 6, 0).ok).toBe(true); expect(podeColocar(p, d, 13, 5, 0).ok).toBe(false);
  });
  it('itens "sobre" exigem mesa e itens de parede exigem parede com chão', () => {
    const p = novo(); expect(podeColocar(p, item('monitor')!, 2, 6, 0).ok).toBe(false); const m = p.objetos.find((o) => o.def === 'mesa-simples')!; expect(podeColocar(p, item('monitor')!, m.x + 1, m.y, 0).ok).toBe(true);
    expect(podeColocar(p, item('relogio-parede')!, 5, 0, 0).ok).toBe(true); expect(podeColocar(p, item('relogio-parede')!, 5, 4, 0).ok).toBe(false);
  });
  it('move e gira objetos respeitando colisão (itens sobre a mesa acompanham)', () => {
    const p = novo(); const m = p.objetos.find((o) => o.def === 'mesa-simples')!; const lap = p.objetos.find((o) => o.def === 'laptop')!; const x0 = lap.x;
    expect(mover(p, m.id, m.x + 2, m.y).ok).toBe(true); expect(lap.x).toBe(x0 + 2); expect(mover(p, m.id, 0, 0).ok).toBe(false);
  });
  it('pinta piso, traça e remove paredes, cria porta', () => {
    const p = novo(); expect(pintarPiso(p, 1, 1, 3, 3, 'parquet')).toBe(9); expect(p.piso[1 * 14 + 1]).toBe('parquet');
    expect(tracarParede(p, 5, 3, 5, 6, 'construir')).toBe(4); expect(p.paredes[4 * 14 + 5]).toBe(1); expect(tracarParede(p, 5, 3, 5, 6, 'remover')).toBe(4);
    expect(alternarPorta(p, 0, 3).ok).toBe(true); expect(p.portas.some((q) => q.x === 0 && q.y === 3)).toBe(true); expect(alternarPorta(p, 6, 5).ok).toBe(false);
  });
  it('colocar em paredes pelo editor não passa por cima de móveis', () => { const p = novo(); const m = p.objetos.find((o) => o.def === 'mesa-simples')!; expect(tracarParede(p, m.x, m.y, m.x + 1, m.y, 'construir')).toBe(0); });
});

describe('pathfinding e colisão', () => {
  it('acha caminho que desvia de paredes e objetos; fora do piso não passa', () => {
    const p = novo(); tracarParede(p, 1, 5, 10, 5, 'construir'); const g = new Grade(p); const c = acharCaminho(g, { x: 2, y: 3 }, { x: 2, y: 7 });
    expect(c).not.toBeNull(); for (const q of c!) expect(g.livre(q.x, q.y)).toBe(true); expect(c!.some((q) => q.x > 10)).toBe(true);
  });
  it('sem rota possível devolve null', () => { const p = novo(); tracarParede(p, 1, 5, 12, 5, 'construir'); expect(acharCaminho(new Grade(p), { x: 2, y: 3 }, { x: 2, y: 7 })).toBeNull(); });
  it('não corta quina na diagonal', () => { const p = novo(); const g = new Grade(p); g.bloquear(3, 2); const c = acharCaminho(g, { x: 2, y: 2 }, { x: 3, y: 3 })!; expect(c.length).toBeGreaterThan(1); });
});

describe('economia (CRIPCOIN)', () => {
  it('compra: debita CC, entrega ao inventário, registra transação e baixa estoque', () => {
    const p = novo(); const r = comprar(p, 'mesa-metal'); expect(r.ok).toBe(true); expect(p.cc).toBe(1500 - item('mesa-metal')!.preco); expect(p.inventario['mesa-metal']).toBe(1); expect(p.transacoes.at(-1)!.tipo).toBe('compra');
  });
  it('recusa compra sem saldo e sem estoque', () => { const p = novo(); p.cc = 5; expect(comprar(p, 'mesa-metal').ok).toBe(false); expect(p.inventario['mesa-metal']).toBeUndefined(); p.cc = 99999; for (let i = 0; i < 4; i++) comprar(p, 'mesa-metal'); expect(comprar(p, 'mesa-metal').ok).toBe(false); });
  it('vende por 60% e o saldo nunca fica negativo', () => { const p = novo(); comprar(p, 'planta-vaso'); const cc0 = p.cc; expect(venderDoInventario(p, 'planta-vaso').ok).toBe(true); expect(p.cc).toBe(cc0 + precoVenda(item('planta-vaso')!)); expect(venderDoInventario(p, 'planta-vaso').ok).toBe(false); expect(p.cc).toBeGreaterThanOrEqual(0); });
  it('coloca do inventário no mapa, guarda de volta e vende do mapa', () => {
    const p = novo(); comprar(p, 'planta-vaso'); const r = colocarDoInventario(p, 'planta-vaso', 3, 6, 0); expect(r.ok).toBe(true); expect(p.inventario['planta-vaso']).toBeUndefined();
    guardarObjeto(p, r.obj!.id); expect(p.inventario['planta-vaso']).toBe(1); const r2 = colocarDoInventario(p, 'planta-vaso', 3, 6, 0); const cc0 = p.cc; expect(venderObjeto(p, r2.obj!.id).ok).toBe(true); expect(p.cc).toBeGreaterThan(cc0);
  });
  it('catálogo é consistente (ids únicos, preços positivos, itens iniciais existem)', () => { expect(new Set(ITENS.map((i) => i.id)).size).toBe(ITENS.length); for (const i of ITENS) { expect(i.preco).toBeGreaterThan(0); expect(i.w).toBeGreaterThan(0); } expect(ITENS.filter((i) => i.inicial).length).toBe(3); });
});

describe('funcionários', () => {
  it('contrata, tira da lista e não duplica; recebe a única estação livre', () => {
    const { p, r, c } = contratarPrimeiro(); expect(r.ok).toBe(true); expect(p.candidatos.find((q) => q.id === c.id)).toBeUndefined(); expect(p.funcionarios[0].estacao).toBeTruthy();
    expect(contratar(p, c.id, { nome: 'X', sobrenome: '', apelido: '', cargo: '', profissao: '', tracos: [], comportamento: '', salario: 10 }).ok).toBe(false);
  });
  it('valida nome e salário', () => { const p = novo(); expect(contratar(p, p.candidatos[0].id, { nome: ' ', sobrenome: '', apelido: '', cargo: '', profissao: '', tracos: [], comportamento: '', salario: 10 }).ok).toBe(false); expect(contratar(p, p.candidatos[0].id, { nome: 'A', sobrenome: '', apelido: '', cargo: '', profissao: '', tracos: [], comportamento: '', salario: 0 }).ok).toBe(false); });
  it('uma mesa atende uma pessoa: o segundo funcionário não pode pegar a mesma estação', () => {
    const { p } = contratarPrimeiro(); const c2 = p.candidatos[0]; contratar(p, c2.id, { nome: 'Beto', sobrenome: '', apelido: '', cargo: '', profissao: '', tracos: [], comportamento: '', salario: 30 });
    const b = p.funcionarios[1]; expect(b.estacao).toBeNull(); const mesa = p.funcionarios[0].estacao!; expect(atribuirEstacao(p, b.id, mesa).ok).toBe(false); expect(estacoesLivres(p)).toHaveLength(0);
  });
  it('demitido vai para "ex-funcionários" e só volta como candidato se for chamado de volta', () => {
    const { p, c } = contratarPrimeiro(); demitir(p, p.funcionarios[0].id); expect(p.funcionarios[0].status).toBe('demitido'); expect(p.candidatos.find((q) => q.id === c.id)).toBeUndefined(); expect(p.recontratar).toHaveLength(1); expect(readmitir(p, c.id)).toBe(true); expect(p.candidatos.find((q) => q.id === c.id)).toBeTruthy();
  });
  it('a mesa precisa de computador e cadeira para ser estação', () => { const p = novo(); const m = p.objetos.find((o) => o.def === 'mesa-simples')!; expect(computadorDaMesa(p, m.id)).toBeTruthy(); const nova = colocar(p, item('mesa-simples')!, 3, 6, 0); expect(estacoesLivres(p)).not.toContain(nova.id); });
});

describe('simulação autônoma', () => {
  const rodar = (j: Jogo, minutos: number): void => { for (let i = 0; i < minutos * 10; i++) j.passo(0.1); };
  it('o funcionário chega no horário, anda até a mesa, senta, trabalha e gera CC; vai embora no fim do expediente', () => {
    const { p } = contratarPrimeiro(); const j = new Jogo(p); p.minuto = 8 * 60 + 55; p.velocidade = 3; const f = p.funcionarios[0]; expect(f.estado).toBe('ausente');
    rodar(j, 4); expect(['chegando', 'indo_trabalhar', 'trabalhando']).toContain(f.estado); const cc0 = p.cc; let visto = false; for (let i = 0; i < 400 && !visto; i++) { j.passo(0.1); visto = f.estado === 'trabalhando'; } expect(visto).toBe(true);
    const a = p.objetos.find((o) => o.def === 'cadeira-escritorio')!; expect(Math.floor(f.x)).toBe(a.x); expect(Math.floor(f.y)).toBe(a.y); rodar(j, 20); expect(p.cc).toBeGreaterThan(cc0);
    p.minuto = 18 * 60 - 1; rodar(j, 10); expect(['indo_embora', 'ausente']).toContain(f.estado);
  });
  it('paga salário no fim do dia e registra a transação', () => {
    const { p } = contratarPrimeiro(); const j = new Jogo(p); p.velocidade = 3; p.minuto = 23 * 60 + 58; const antes = p.transacoes.length; rodar(j, 5);
    expect(diaDe(p.minuto)).toBe(2); expect(p.transacoes.slice(antes).some((t) => t.tipo === 'salario' && t.valor === -40)).toBe(true);
  });
  it('sem saldo: salário atrasa e, depois de 3 dias, o funcionário pede demissão', () => {
    const { p } = contratarPrimeiro(); const j = new Jogo(p); p.velocidade = 3; p.cc = 0; for (let d = 0; d < 3; d++) { p.minuto = (diaDe(p.minuto)) * 1440 - 2; rodar(j, 4); p.cc = 0; } expect(p.funcionarios[0].status).toBe('demitido');
  });
  it('não trabalha no fim de semana', () => { const { p } = contratarPrimeiro(); const j = new Jogo(p); p.velocidade = 3; p.minuto = 5 * 1440 + 9 * 60 + 5; rodar(j, 3); expect(p.funcionarios[0].estado).toBe('ausente'); });
  it('a hora do jogo formata corretamente', () => { expect(horaTexto(8 * 60 + 5)).toBe('08:05'); });
});

describe('sistema de arquivos do computador', () => {
  it('cria, renomeia, edita, move, copia e exclui (lixeira) com nomes únicos', () => {
    const c = fsInicial(); const docs = c.fs.filhos!.find((f) => f.nome === 'Documentos')!; const proj = c.fs.filhos!.find((f) => f.nome === 'Projetos')!;
    const a = criar(c.fs, docs.id, 'Plano', 'txt', 'oi'); const b = criar(c.fs, docs.id, 'Plano', 'txt', 'dois'); expect(b.nome).not.toBe(a.nome);
    renomear(c.fs, a.id, 'Plano Final'); salvar(c.fs, a.id, 'novo texto'); expect(achar(c.fs, a.id)!.no.conteudo).toBe('novo texto');
    moverArq(c.fs, a.id, proj.id); expect(achar(c.fs, a.id)!.pai!.id).toBe(proj.id); const cp = copiar(c.fs, a.id, docs.id); expect(cp.id).not.toBe(a.id);
    expect(excluir(c.fs, a.id)).toBe('lixeira'); expect(achar(c.fs, a.id)!.pai!.nome).toBe('Lixeira'); expect(excluir(c.fs, a.id)).toBe('apagado'); expect(achar(c.fs, a.id)).toBeNull();
    expect(() => moverArq(c.fs, docs.id, docs.id)).toThrow();
  });
});

describe('objetos interativos', () => {
  it('armário tem inventário independente com capacidade', () => {
    const p = novo(); p.cc = 5000; const d = ITENS.find((i) => i.interacao === 'armario')!; comprar(p, d.id); const o = colocarDoInventario(p, d.id, 2, 7, 0).obj!; comprar(p, 'caneca'); expect(guardarNoArmario(p, o.id, 'caneca').ok).toBe(true); expect(p.inventario['caneca']).toBeUndefined(); expect(p.armarios[o.id].caneca).toBe(1);
    const o2 = (comprar(p, d.id), colocarDoInventario(p, d.id, 4, 7, 0).obj!); expect(p.armarios[o2.id]).toBeUndefined(); expect(retirarDoArmario(p, o.id, 'caneca').ok).toBe(true); expect(p.inventario['caneca']).toBe(1);
  });
  it('quadro guarda notas por quadro', () => { const p = novo(); adicionarNota(p, 'q1', 'a'); adicionarNota(p, 'q2', 'b'); expect(quadro(p, 'q1').notas).toHaveLength(1); expect(quadro(p, 'q2').notas[0].texto).toBe('b'); });
  it('cafeteira consome grãos', () => { const p = novo(); p.cc = 5000; colocar(p, item('mesa-baixa')!, 2, 7, 0); comprar(p, 'cafeteira'); const o = colocarDoInventario(p, 'cafeteira', 2, 7, 0); expect(o.ok).toBe(true); expect(prepararCafe(p, o.obj!.id).ok).toBe(true); expect(o.obj!.estado!.cafes).toBe(2); });
});
