// STRUCTURE STUDIO, IA no servidor: prévia de montagem e de edição com uma IA falsa injetada (sem rede, sem chave)
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { adicionarComponente, componentesDoUsuario } from '../server/estudio-biblioteca.js';
import { montarPrevia, editarPrevia } from '../server/estudio-ia.js';
import { diagnosticar } from '../public/js/estudio/montagem.js';

const UID = `teste-ia-${Date.now()}`;
after(() => { for (const d of ['estudio', 'estudio-arquivos']) fs.rmSync(new URL(`../data/${d}/${UID}`, import.meta.url), { recursive: true, force: true }); });

function png(w, h, cor) {
  const crcTab = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const x of buf) c = crcTab[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const bloco = (tipo, d) => { const t = Buffer.from(tipo); const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, d]))); return Buffer.concat([len, t, d, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const linha = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => [cor, 100, 100, 255]).flat())]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), bloco('IHDR', ihdr), bloco('IDAT', zlib.deflateSync(Buffer.concat(Array.from({ length: h }, () => linha)))), bloco('IEND', Buffer.alloc(0))]);
}
const kit = {}; let cor = 10;
for (const [chave, nome, categoria, sub, w, h, material] of [
  ['parede', 'Parede concreto', 'estrutura', 'parede', 128, 96, 'concreto'], ['janela', 'Janela simples', 'fachada', 'janela', 32, 32, 'concreto'], ['janelaAzul', 'Janela vidro azul', 'fachada', 'janela', 32, 32, 'vidro'],
  ['porta', 'Porta dupla', 'fachada', 'porta', 48, 72, 'metal'], ['telhado', 'Telhado plano', 'cobertura', 'telhado-plano', 128, 40, 'concreto'], ['palmeira', 'Palmeira alta', 'externo', 'palmeira', 60, 120, 'vegetal'],
  ['vaga', 'Vaga de carro', 'estacionamento', 'vaga', 40, 64, 'asfalto'],
]) kit[chave] = adicionarComponente(UID, png(w, h, cor += 7), { nome, categoria, sub, perspectiva: 'arq25d', material, origem: 'gerado' }).componente;
const estrutura = () => ({ id: 'x', preset: 'arq25d', tipo: 'shopping', area: { w: 24, h: 18 }, componentes: [], logica: { entradas: [] } });
const sem = (r) => r.componentes.map((i) => i.comp);
const erros = (r, preset = 'arq25d') => diagnosticar(r.componentes, r.area, preset, (id) => componentesDoUsuario(UID).find((c) => c.id === id)).filter((p) => p.gravidade === 'erro');

test('montar sem IA configurada: o interpretador local monta o shopping com a biblioteca', async () => {
  const r = await montarPrevia({ uid: UID, est: estrutura(), descricao: 'Shopping moderno com fachada de vidro azul, estacionamento para 40 veículos, palmeiras' }, { chamarIA: async () => null });
  assert.equal(r.via, 'local'); assert.ok(r.componentes.length > 15); assert.deepEqual(erros(r), []);
  assert.ok(sem(r).includes(kit.janelaAzul.id), 'escolheu a janela de vidro azul'); assert.ok(sem(r).includes(kit.palmeira.id));
  assert.equal(r.componentes.filter((i) => i.comp === kit.vaga.id).reduce((n, v) => n + v.n, 0), 40);
  assert.ok(r.resumo.parede >= 1 && r.resumo.porta === 1 && r.resumo['telhado-plano'] >= 1);
});

test('montar com IA: usa o plano da IA, valida os ids e entrega peças identificáveis', async () => {
  let prompt = '';
  const plano = { modo: 'modular', tipo: 'loja', nome: 'Loja', modulos: 3, andares: 1, janelas_por_andar: 2, parede: kit.parede.id, janela: kit.janela.id, porta: kit.porta.id, telhado: kit.telhado.id, externo: [{ comp: kit.palmeira.id, onde: 'esq', quantidade: 1 }] };
  const r = await montarPrevia({ uid: UID, est: estrutura(), descricao: 'uma lojinha simples' }, { chamarIA: async (p) => { prompt = p; return plano; } });
  assert.equal(r.via, 'ia'); assert.deepEqual(erros(r), []);
  assert.ok(prompt.includes(kit.parede.id) && prompt.includes('uma lojinha simples'), 'a IA recebeu o catálogo real e o pedido');
  assert.ok(r.componentes.every((i) => i.papel), 'cada peça tem um papel'); assert.equal(r.componentes.filter((i) => i.comp === kit.janela.id).length, 2);
  assert.ok(!sem(r).includes(kit.janelaAzul.id), 'só o que a IA escolheu');
});

test('montar: IA que inventa ids ou fica fora do ar cai no interpretador local, com aviso', async () => {
  const inventada = await montarPrevia({ uid: UID, est: estrutura(), descricao: 'casa com 2 andares' }, { chamarIA: async () => ({ modo: 'modular', parede: 'xx', janela: 'yy', porta: 'zz', telhado: 'ww' }) });
  assert.equal(inventada.via, 'local'); assert.ok(inventada.avisos.some((a) => /não usou componentes da biblioteca/.test(a))); assert.ok(inventada.componentes.length > 0);
  const fora = await montarPrevia({ uid: UID, est: estrutura(), descricao: 'casa' }, { chamarIA: async () => { throw new Error('sem rede'); } });
  assert.equal(fora.via, 'local'); assert.ok(fora.avisos.some((a) => /não respondeu/.test(a)));
  await assert.rejects(montarPrevia({ uid: UID, est: estrutura(), descricao: '   ' }, { chamarIA: async () => null }), /Descreva/);
});

async function montada() { return montarPrevia({ uid: UID, est: estrutura(), descricao: 'shopping com 2 andares e vidro azul' }, { chamarIA: async () => null }); }

test('editar: instrução local muda só o que o pedido afeta e lista as peças mudadas', async () => {
  const m = await montada(); const est = { ...estrutura(), componentes: m.componentes, area: m.area };
  const r = await editarPrevia({ uid: UID, est, instrucao: 'Adicione mais dois andares.' }, { chamarIA: async () => null });
  assert.equal(r.via, 'local'); assert.equal(r.componentes.filter((i) => i.comp === kit.parede.id).length, m.componentes.filter((i) => i.comp === kit.parede.id).length + 2);
  assert.deepEqual(erros(r), []);
  assert.ok(r.mudadas.length > 0 && r.mudadas.length < r.componentes.length, 'só parte mudou');
  assert.ok(m.componentes.filter((i) => i.comp === kit.parede.id && i.z === 0).every((w) => JSON.stringify(r.componentes.find((x) => x.id === w.id)) === JSON.stringify(w)), 'o térreo ficou intacto');
  await assert.rejects(editarPrevia({ uid: UID, est, instrucao: 'bom dia' }, { chamarIA: async () => null }), /Não entendi/);
  await assert.rejects(editarPrevia({ uid: UID, est: estrutura(), instrucao: 'adicione andares' }, { chamarIA: async () => null }), /vazia/);
});

test('editar: seleção restringe o pedido, "todas" não; operações da IA são aplicadas e validadas', async () => {
  const m = await montada(); const est = { ...estrutura(), componentes: m.componentes, area: m.area };
  const janelas = m.componentes.filter((i) => i.comp === kit.janelaAzul.id || i.comp === kit.janela.id); const uma = janelas[0];
  const so = await editarPrevia({ uid: UID, est, instrucao: 'Aumente a porta', selecao: [uma.id] }, { chamarIA: async () => null });
  assert.equal(so.mudadas.length, 0, 'a seleção é uma janela: aumentar a porta não afeta nada fora dela');
  const dois = await editarPrevia({ uid: UID, est, instrucao: 'Troque a cor da janela por vermelho', selecao: [uma.id] }, { chamarIA: async () => [{ op: 'cor', alvo: { sub: ['janela'] }, por: { cor: '#ef4444' } }] });
  assert.equal(dois.via, 'ia'); assert.deepEqual(dois.mudadas, [uma.id], 'só a peça selecionada');
  const todas = await editarPrevia({ uid: UID, est, instrucao: 'Pinte todas as janelas de vermelho', selecao: [uma.id] }, { chamarIA: async () => ({ operacoes: [{ op: 'cor', alvo: { sub: ['janela'] }, por: { cor: '#ef4444' } }] }) });
  assert.equal(todas.mudadas.length, janelas.length, '"todas" vale para todas as janelas');
  const vaziaIA = await editarPrevia({ uid: UID, est, instrucao: 'Amplie o estacionamento' }, { chamarIA: async () => [] });
  assert.equal(vaziaIA.via, 'local', 'IA sem proposta: cai no local'); assert.ok(vaziaIA.avisos.some((a) => /não propôs/.test(a)));
});
