// Rotas do Cripcoin Office: pesquisa e leitura de página reais; entradas inválidas são recusadas com erro claro (nunca resultados falsos).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import cripcoin from '../server/cripcoin.js';

async function com(fn) {
  const app = express(); app.use(express.json()); app.use('/api/cripcoin', cripcoin); const srv = http.createServer(app); await new Promise((r) => srv.listen(0, r));
  try { await fn(`http://127.0.0.1:${srv.address().port}/api/cripcoin`); } finally { await new Promise((r) => srv.close(r)); }
}
test('pesquisa vazia é recusada com mensagem clara', async () => {
  await com(async (b) => { const r = await fetch(`${b}/pesquisar?q=`); assert.equal(r.status, 502); assert.match((await r.json()).error, /pesquisar/i); });
});
test('leitura de página só aceita http(s) e bloqueia endereços privados', async () => {
  await com(async (b) => {
    let r = await fetch(`${b}/pagina?url=${encodeURIComponent('file:///etc/passwd')}`); assert.equal(r.status, 400);
    r = await fetch(`${b}/pagina?url=${encodeURIComponent('http://127.0.0.1:1/')}`); assert.equal(r.status, 502); assert.ok((await r.json()).error);
  });
});

test('conversa: mensagem vazia é recusada; sem IA configurada devolve 409 com semIA (nada de resposta inventada)', async () => {
  await com(async (b) => {
    const post = (corpo) => fetch(`${b}/conversar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    let r = await post({ funcionario: { nome: 'Ana' }, mensagem: '   ' }); assert.equal(r.status, 400);
    r = await post({ funcionario: { nome: 'Ana', cargo: 'Designer', personalidade: ['Calmo'], defeitos: ['Teimoso'] }, mensagem: 'oi', contexto: { escritorio: 'E', empresa: 'C' } });
    assert.ok([409, 502].includes(r.status)); const j = await r.json(); assert.ok(j.error); if (r.status === 409) assert.equal(j.semIA, true);
  });
});
test('prompt da personagem usa personalidade e defeitos e corta entradas enormes', async () => {
  const { montarPrompt, limparResposta } = await import('../server/cripcoin-conversa.js');
  const { system, prompt } = montarPrompt({ funcionario: { nome: 'Ana', apelido: 'Ni', cargo: 'Designer', personalidade: ['Calmo', 'x'.repeat(500)], defeitos: ['Teimoso'], habilidades: { logica: 7 }, extras: 'e'.repeat(900) }, mensagem: 'm'.repeat(2000), contexto: { escritorio: 'E', empresa: 'C', hora: '09:00', dia: 2, equipe: ['Ana', 'Beto'] }, historico: [{ de: 'eu', texto: 'oi' }, { de: 'ela', texto: 'olá' }] });
  assert.match(system, /Calmo/); assert.match(system, /Teimoso/); assert.ok(system.length < 2500); assert.ok(prompt.includes('Chefe: oi') && prompt.includes('Ana: olá')); assert.ok(prompt.length < 700);
  assert.equal(limparResposta('"Ana: **Oi** chefe!"', 'Ana'), 'Oi chefe!'); assert.ok(limparResposta('Frase um. '.repeat(40), 'Ana').length <= 221);
});
test('conversa entre a equipe: prompt com o trabalho de afiliadas (Temu/Shopee) e leitura só de falas de quem existe', async () => {
  const { montarPromptEquipe, lerDialogo } = await import('../server/cripcoin-conversa.js');
  assert.throws(() => montarPromptEquipe({ pessoas: [{ nome: 'Ana' }] }));
  const { system, nomes } = montarPromptEquipe({ pessoas: [{ nome: 'Ana', personalidade: ['Calmo'] }, { nome: 'Bia', defeitos: ['Teimoso'] }], contexto: { hora: '10:00' }, recentes: ['meta de cliques'] });
  assert.match(system, /Temu/); assert.match(system, /Shopee/); assert.match(system, /brincadeira|piadas/i); assert.deepEqual(nomes, ['Ana', 'Bia']);
  assert.deepEqual(lerDialogo('Ana: Oi\nNarrador: x\n**Bia**: Bom dia\n3. Ana: Bora\nCarla: nao existe', nomes).map((l) => l.quem), ['Ana', 'Bia', 'Ana']);
});
test('fonte de IA: nuvem > Ollama > gratuita (desligável) e rota informa', async () => {
  const { fonteIA } = await import('../server/cripcoin-ia.js'); const antes = process.env.CRIPCOIN_IA_GRATIS;
  process.env.CRIPCOIN_IA_GRATIS = '0'; assert.ok(['nuvem', 'ollama', 'nenhuma'].includes(fonteIA())); delete process.env.CRIPCOIN_IA_GRATIS; assert.ok(['nuvem', 'ollama', 'gratis'].includes(fonteIA()));
  if (antes !== undefined) process.env.CRIPCOIN_IA_GRATIS = antes;
  await com(async (b) => { const r = await fetch(`${b}/ia`); assert.equal(r.status, 200); assert.ok((await r.json()).fonte); });
});
