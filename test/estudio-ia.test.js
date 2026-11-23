// STRUCTURE STUDIO, IA: plano validado, expansor determinístico, interpretador local e operações de edição que preservam o resto
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { novaInstancia, diagnosticar, pegada } from '../public/js/estudio/montagem.js';
import { validarPlano, expandirPlano, planoLocal, operacoesLocais, aplicarOperacoes, catalogoParaIA, escolherComp, corDoTexto } from '../public/js/estudio/ia-montagem.js';

const comp = (id, sub, w, h, extra = {}) => ({ id, nome: extra.nome || id, sub, categoria: 'x', camada: extra.camada || 'externo', w, h, area: { w: Math.ceil(w / 32), h: extra.profundidade || 1 }, material: extra.material || 'concreto', colisao: { tipo: 'nenhuma' }, perspectiva: extra.perspectiva || 'arq25d', tags: extra.tags || [], origem: 'gerado' });
const KIT = [
  comp('parede-concreto', 'parede', 128, 96, { camada: 'base', nome: 'Parede de concreto' }), comp('janela-simples', 'janela', 32, 32, { camada: 'fachada', nome: 'Janela simples', material: 'concreto' }),
  comp('janela-vidro-azul', 'janela', 32, 32, { camada: 'fachada', nome: 'Janela de vidro azul', material: 'vidro', tags: ['azul'] }), comp('porta-dupla', 'porta', 48, 72, { camada: 'fachada', nome: 'Porta dupla' }),
  comp('telhado-plano-1', 'telhado-plano', 128, 40, { camada: 'cobertura', nome: 'Telhado plano' }), comp('cobertura-metal', 'cobertura-metalica', 128, 40, { camada: 'cobertura', nome: 'Cobertura metálica', material: 'metal' }),
  comp('ar-cond', 'ar-condicionado', 24, 24, { camada: 'topo', nome: 'Ar-condicionado' }), comp('antena-1', 'antena', 16, 48, { camada: 'topo', nome: 'Antena' }),
  comp('palmeira-1', 'palmeira', 60, 120, { nome: 'Palmeira' }), comp('jardim-1', 'jardim', 64, 32, { nome: 'Jardim' }), comp('poste-1', 'poste', 16, 100, { nome: 'Poste de luz' }),
  comp('vaga-1', 'vaga', 40, 64, { camada: 'solo', nome: 'Vaga', profundidade: 2 }), comp('portao-1', 'portao', 64, 72, { nome: 'Portão de garagem' }),
  comp('delegacia-pronta', 'referencia', 380, 300, { camada: 'base', nome: 'Delegacia pronta' }),
  comp('via-topo', 'reta', 64, 64, { perspectiva: 'topo', nome: 'Rua' }),
];
const porId = new Map(KIT.map((c) => [c.id, c])); const compDe = (id) => porId.get(id);
const AREA = { w: 24, h: 18 };
const planoShopping = () => ({ modo: 'modular', tipo: 'shopping', nome: 'Shopping', modulos: 6, andares: 2, janelas_por_andar: 4, porta_posicao: 'centro', parede: 'parede-concreto', janela: 'janela-simples', porta: 'porta-dupla', telhado: 'telhado-plano-1', equipamentos: ['ar-cond', 'ar-cond', 'antena-1'], cor_janela: '#3b82f6', material_janela: 'vidro', externo: [{ comp: 'palmeira-1', onde: 'esq', quantidade: 2 }, { comp: 'palmeira-1', onde: 'dir', quantidade: 2 }, { comp: 'jardim-1', onde: 'frente', quantidade: 3 }], estacionamento: { vaga: 'vaga-1', vagas: 40, onde: 'frente' } });
const erros = (lista, area = AREA) => diagnosticar(lista, area, 'arq25d', compDe).filter((p) => p.gravidade === 'erro');
const sub = (i) => compDe(i.comp).sub;

test('plano: ids inexistentes, de outra subcategoria ou perspectiva são recusados com aviso; números ficam nos limites', () => {
  const { plano, avisos } = validarPlano({ modo: 'modular', parede: 'nao-existe', janela: 'palmeira-1', porta: 'via-topo', telhado: 'telhado-plano-1', modulos: 99, andares: -3, janelas_por_andar: 50, equipamentos: ['ar-cond', 'xx', 'palmeira-1'], estacionamento: { vaga: 'vaga-1', vagas: 9999 } }, compDe, 'arq25d');
  assert.equal(plano.parede, null); assert.equal(plano.janela, null); assert.equal(plano.porta, null); assert.equal(plano.telhado, 'telhado-plano-1');
  assert.equal(plano.modulos, 12); assert.equal(plano.andares, 1); assert.equal(plano.janelas_por_andar, 12); assert.deepEqual(plano.equipamentos, ['ar-cond']); assert.equal(plano.estacionamento.vagas, 120);
  assert.ok(avisos.some((a) => /não existe/.test(a)) && avisos.some((a) => /outra perspectiva/.test(a)) && avisos.some((a) => /faltam paredes/.test(a)));
});

test('expansor: o shopping sai todo encaixado, sem erros, com papéis e componentes identificáveis', () => {
  const { plano } = validarPlano(planoShopping(), compDe, 'arq25d');
  const r = expandirPlano(plano, compDe, { area: AREA });
  const lista = r.componentes;
  assert.equal(new Set(lista.map((i) => i.id)).size, lista.length, 'ids únicos');
  assert.deepEqual(erros(lista, r.area), [], 'nenhuma peça flutuando ou sem componente');
  const paredes = lista.filter((i) => sub(i) === 'parede'); assert.equal(paredes.length, 2, 'um bloco por andar');
  const h = 96; assert.deepEqual(paredes.map((i) => i.z).sort((a, b) => a - b), [0, h]);
  assert.ok(paredes.every((p) => p.n === 6 && p.papel === 'parede'));
  const janelas = lista.filter((i) => sub(i) === 'janela');
  assert.ok(janelas.length >= 6 && janelas.length <= 8, 'janelas por andar (menos as que colidem com a porta)');
  assert.ok(janelas.every((j) => paredes.some((p) => p.id === j.anfitriao && p.andar === j.andar)), 'cada janela está encaixada na parede do próprio andar');
  assert.equal(lista.filter((i) => sub(i) === 'porta').length, 1); assert.equal(lista.find((i) => sub(i) === 'porta').nome, 'Entrada principal');
  const telhados = lista.filter((i) => sub(i) === 'telhado-plano'); assert.ok(telhados.length >= 1 && telhados.every((t) => t.z === 2 * h), 'telhado no topo do 2º andar');
  assert.equal(lista.filter((i) => i.papel === 'equipamento-telhado').length, 3);
  assert.ok(lista.filter((i) => sub(i) === 'palmeira').length === 4);
  const vagas = lista.filter((i) => sub(i) === 'vaga'); assert.equal(vagas.reduce((n, v) => n + v.n, 0), 40, 'as 40 vagas pedidas');
  assert.ok(r.area.h >= AREA.h && r.area.w >= AREA.w);
});

test('expansor: determinístico, e a área cresce quando a estrutura não cabe', () => {
  const { plano } = validarPlano({ ...planoShopping(), modulos: 12, andares: 6 }, compDe, 'arq25d');
  const a = expandirPlano(plano, compDe, { area: { w: 8, h: 8 } }); const b = expandirPlano(plano, compDe, { area: { w: 8, h: 8 } });
  const forma = (l) => l.map((i) => [i.comp, i.x, i.y, i.z, i.n].join(','));
  assert.deepEqual(forma(a.componentes), forma(b.componentes));
  assert.ok(a.area.w > 8 && a.area.h > 8, 'a área foi ampliada');
  assert.deepEqual(erros(a.componentes, a.area), []);
  assert.ok(a.componentes.every((i) => pegada(i, compDe(i.comp)).x0 >= -1 && pegada(i, compDe(i.comp)).x1 <= a.area.w * 32 + 1), 'tudo dentro da área final');
});

test('expansor: sem kit modular mas com construção pronta, usa a pronta; sem nada, avisa o que falta', () => {
  const r = expandirPlano(validarPlano({ modo: 'pronta', pronta: 'delegacia-pronta', externo: [{ comp: 'palmeira-1', onde: 'esq', quantidade: 2 }] }, compDe, 'arq25d').plano, compDe, { area: AREA });
  assert.equal(r.componentes.filter((i) => i.papel === 'construcao-pronta').length, 1); assert.deepEqual(erros(r.componentes, r.area), []);
  const v = validarPlano({ modo: 'modular', porta: 'porta-dupla' }, compDe, 'arq25d');
  const sem = expandirPlano(v.plano, compDe, { area: AREA });
  assert.ok(sem.avisos.some((a) => /sem paredes/.test(a)) && sem.faltando.includes('telhado'));
});

test('interpretador local entende o exemplo do shopping e as palavras-chave', () => {
  const texto = 'Crie um shopping moderno de médio porte, com fachada de vidro azul, entrada principal centralizada, estacionamento frontal para aproximadamente 40 veículos, jardins laterais, palmeiras e equipamentos no telhado.';
  const { plano, avisos } = validarPlano(planoLocal(texto, KIT, 'arq25d'), compDe, 'arq25d');
  assert.equal(plano.tipo, 'shopping'); assert.equal(plano.andares, 2); assert.equal(plano.estacionamento.vagas, 40);
  assert.ok(plano.externo.some((e) => compDe(e.comp).sub === 'palmeira') && plano.externo.some((e) => compDe(e.comp).sub === 'jardim'));
  assert.ok(plano.equipamentos.length >= 2); assert.equal(plano.material_janela, 'vidro'); assert.equal(plano.cor_janela, '#3b82f6'); assert.equal(plano.porta_posicao, 'centro');
  assert.equal(plano.janela, 'janela-vidro-azul', 'escolhe a janela cujo nome e material combinam com o pedido');
  assert.deepEqual(avisos, []);
  const casa = planoLocal('uma casa pequena de 2 andares', KIT, 'arq25d'); assert.equal(casa.tipo, 'casa'); assert.equal(casa.andares, 2); assert.equal(casa.modulos, 2);
  const kitSemParede = KIT.filter((c) => c.sub !== 'parede'); const pronta = planoLocal('delegacia', kitSemParede, 'arq25d'); assert.equal(pronta.modo, 'pronta'); assert.equal(pronta.pronta, 'delegacia-pronta');
  assert.equal(corDoTexto('vidro azul'), '#3b82f6'); assert.equal(escolherComp(KIT, ['janela'], 'vidro azul', 'arq25d').id, 'janela-vidro-azul');
  assert.ok(catalogoParaIA(KIT, 'arq25d').every((c) => c.id !== 'via-topo'), 'o catálogo da IA só mostra o que serve ao preset');
});

function base() {
  const { plano } = validarPlano(planoShopping(), compDe, 'arq25d'); const r = expandirPlano(plano, compDe, { area: AREA });
  return { componentes: r.componentes, area: r.area };
}
const intactas = (antes, depois, ids) => antes.filter((i) => !ids.has(i.id)).every((i) => JSON.stringify(depois.find((d) => d.id === i.id)) === JSON.stringify(i));

test('editar: "troque todas as janelas por vidro azul" muda só as janelas', () => {
  const est = base(); const ops = operacoesLocais('Troque todas as janelas por vidro azul.', KIT, 'arq25d');
  assert.equal(ops[0].op, 'substituir'); assert.equal(ops[0].por.comp, 'janela-vidro-azul');
  const r = aplicarOperacoes(est, ops, compDe);
  const janelas = est.componentes.filter((i) => sub(i) === 'janela'); const ids = new Set(janelas.map((j) => j.id));
  assert.ok(r.componentes.filter((i) => ids.has(i.id)).every((j) => j.comp === 'janela-vidro-azul' && j.cor === '#3b82f6' && j.material === 'vidro'));
  assert.ok(intactas(est.componentes, r.componentes, ids), 'o resto ficou exatamente como estava');
  assert.equal(r.resumo.length, janelas.length); assert.deepEqual(erros(r.componentes, r.area), []);
});

test('editar: aumentar a entrada, trocar o telhado, adicionar andares', () => {
  const est = base();
  let ops = operacoesLocais('Aumente a entrada principal.', KIT, 'arq25d'); assert.deepEqual(ops.map((o) => o.op), ['escala']);
  let r = aplicarOperacoes(est, ops, compDe); const porta = r.componentes.find((i) => sub(i) === 'porta'); assert.equal(porta.escala, 1.3);
  assert.ok(intactas(est.componentes, r.componentes, new Set([porta.id])));
  ops = operacoesLocais('Substitua o telhado por uma cobertura metálica.', KIT, 'arq25d'); assert.equal(ops[0].por.comp, 'cobertura-metal');
  r = aplicarOperacoes(est, ops, compDe);
  const telhados = est.componentes.filter((i) => sub(i) === 'telhado-plano');
  assert.ok(telhados.every((t) => { const n = r.componentes.find((i) => i.id === t.id); return n.comp === 'cobertura-metal' && n.anfitriao === t.anfitriao && n.z === t.z && n.x === t.x; }), 'mesma posição e encaixe, só o componente muda');
  ops = operacoesLocais('Adicione mais dois andares.', KIT, 'arq25d'); assert.deepEqual(ops, [{ op: 'andares', delta: 2 }]);
  r = aplicarOperacoes(est, ops, compDe);
  assert.equal(r.componentes.filter((i) => sub(i) === 'parede').length, 4, 'dois andares novos');
  assert.ok(r.componentes.filter((i) => sub(i) === 'telhado-plano').every((t) => t.z === 4 * 96), 'o telhado subiu');
  assert.equal(r.componentes.filter((i) => sub(i) === 'porta').length, 1, 'a porta fica só no térreo');
  assert.deepEqual(erros(r.componentes, r.area), [], 'os andares novos continuam encaixados');
  // as peças antigas (exceto o telhado e o que está nele) não se mexem
  const mexeram = new Set(est.componentes.filter((i) => sub(i) === 'telhado-plano' || i.papel === 'equipamento-telhado').map((i) => i.id));
  assert.ok(intactas(est.componentes, r.componentes, mexeram));
  // e dá para tirar andares de volta
  const volta = aplicarOperacoes({ componentes: r.componentes, area: r.area }, [{ op: 'andares', delta: -2 }], compDe);
  assert.equal(volta.componentes.filter((i) => sub(i) === 'parede').length, 2); assert.deepEqual(erros(volta.componentes, volta.area), []);
  assert.ok(volta.componentes.filter((i) => sub(i) === 'telhado-plano').every((t) => t.z === 2 * 96));
});

test('editar: ampliar o estacionamento e adicionar garagem lateral', () => {
  const est = base(); const vagas0 = est.componentes.filter((i) => sub(i) === 'vaga').reduce((n, v) => n + v.n, 0);
  let ops = operacoesLocais('Amplie o estacionamento.', KIT, 'arq25d'); assert.deepEqual(ops, [{ op: 'estacionamento', delta_vagas: 10 }]);
  let r = aplicarOperacoes(est, ops, compDe); assert.equal(r.componentes.filter((i) => sub(i) === 'vaga').reduce((n, v) => n + v.n, 0), vagas0 + 10);
  assert.deepEqual(erros(r.componentes, r.area), []);
  ops = operacoesLocais('Adicione uma garagem lateral.', KIT, 'arq25d'); assert.deepEqual(ops, [{ op: 'garagem', onde: 'dir' }]);
  r = aplicarOperacoes(est, ops, compDe, { buscar: (q, subs) => KIT.find((c) => (!subs || subs.includes(c.sub)) && c.sub === 'portao') || null });
  const novas = r.componentes.filter((i) => i.papel?.startsWith('garagem')); assert.equal(novas.length, 3, 'parede, portão e telhado');
  assert.ok(novas.find((i) => i.papel === 'garagem').x > Math.max(...est.componentes.filter((i) => sub(i) === 'parede').map((i) => i.x)), 'ao lado, à direita');
  assert.ok(r.area.w > est.area.w); assert.deepEqual(erros(r.componentes, r.area), []);
  assert.ok(intactas(est.componentes, r.componentes, new Set()), 'nada do que já existia mudou');
});

test('editar: pedido que não acha nada avisa em vez de inventar; operação desconhecida é ignorada', () => {
  const est = base();
  const r = aplicarOperacoes(est, [{ op: 'substituir', alvo: { sub: ['cerca'] }, por: { comp: 'janela-simples' } }, { op: 'voar' }, { op: 'substituir', alvo: { sub: ['janela'] }, por: { comp: 'nao-existe' } }], compDe);
  assert.equal(r.resumo.length, 0); assert.equal(r.avisos.length, 3); assert.deepEqual(r.componentes, est.componentes);
  assert.deepEqual(operacoesLocais('Bom dia, tudo bem?', KIT, 'arq25d'), []);
});
