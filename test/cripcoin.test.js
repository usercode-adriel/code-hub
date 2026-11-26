// Rotas do Cripcoin Office: pesquisa e leitura de página reais; entradas inválidas são recusadas com erro claro (nunca resultados falsos).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import cripcoin from '../server/cripcoin.js';

async function com(fn) {
  const app = express(); app.use('/api/cripcoin', cripcoin); const srv = http.createServer(app); await new Promise((r) => srv.listen(0, r));
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
