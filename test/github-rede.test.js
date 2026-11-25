// GitHub: falha de rede passageira é repetida; sem conexão, a mensagem explica o motivo (nada de "fetch failed" solto)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(path.resolve('.tmp-testes'), 'gh-'));
const { fetchGitHub } = await import('../server/github.js');
const original = globalThis.fetch;
const ok = () => new Response('{}', { status: 200 });

test('tenta de novo depois de uma falha passageira e devolve a resposta', async () => {
  let chamadas = 0;
  globalThis.fetch = async () => { chamadas++; if (chamadas < 3) throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } }); return ok(); };
  const r = await fetchGitHub('https://api.github.com/x', {}, { pausa: 1 });
  assert.equal(r.status, 200); assert.equal(chamadas, 3);
  globalThis.fetch = original;
});

test('sem conexão: mensagem clara com o motivo, depois de 3 tentativas', async () => {
  let chamadas = 0;
  globalThis.fetch = async () => { chamadas++; throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } }); };
  await assert.rejects(() => fetchGitHub('https://api.github.com/x', {}, { pausa: 1 }), /Sem conexão com o GitHub \(ENOTFOUND\)/);
  assert.equal(chamadas, 3);
  globalThis.fetch = original;
});

test('erro 5xx em leitura é repetido; envio (POST) não é repetido, para não duplicar nada', async () => {
  let n = 0;
  globalThis.fetch = async () => { n++; return n < 2 ? new Response('', { status: 502 }) : ok(); };
  assert.equal((await fetchGitHub('https://api.github.com/x', {}, { pausa: 1 })).status, 200);
  let posts = 0;
  globalThis.fetch = async () => { posts++; throw new TypeError('fetch failed'); };
  await assert.rejects(() => fetchGitHub('https://api.github.com/x', { method: 'POST' }, { pausa: 1 }), /Sem conexão/);
  assert.equal(posts, 1, 'POST só tenta uma vez');
  globalThis.fetch = original;
});
