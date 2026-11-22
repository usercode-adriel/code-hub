// armazenamento SQLite: gravação atômica, leitura conferida e migração que não altera a origem
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { abrirBanco, gravarDocumento, lerDocumento, sha256Arquivo } from '../server/banco/sqlstore.js';

const pasta = () => fs.mkdtempSync(path.join(os.tmpdir(), 'codeniac-sql-'));
const exemplo = () => ({ users: [{ id: 'u1', email: 'a@x.com', role: 'admin' }], meta: { jwtSecret: 'x'.repeat(10) }, acentos: 'ação ✓' });

test('grava e lê um documento íntegro, com acentos', () => {
  const d = pasta(); const db = abrirBanco(path.join(d, 't.sqlite'));
  const v = exemplo(); gravarDocumento(db, 'db', v);
  assert.deepEqual(lerDocumento(db, 'db'), v);
  assert.equal(lerDocumento(db, 'nao-existe'), null);
  db.close(); fs.rmSync(d, { recursive: true, force: true });
});

test('detecta documento alterado por fora (sha256 não confere)', () => {
  const d = pasta(); const arq = path.join(d, 't.sqlite'); const db = abrirBanco(arq);
  gravarDocumento(db, 'db', exemplo());
  db.prepare("UPDATE documento SET json = '{\"users\":[]}' WHERE chave = 'db'").run();
  assert.throws(() => lerDocumento(db, 'db'), /corrompido/);
  db.close(); fs.rmSync(d, { recursive: true, force: true });
});

test('migração copia o db.json, confere o conteúdo e deixa a origem igual', () => {
  const d = pasta(); const origem = path.join(d, 'db.json'); const destino = path.join(d, 'codeniac.sqlite');
  fs.writeFileSync(origem, JSON.stringify(exemplo()));
  const antes = sha256Arquivo(origem);
  execFileSync(process.execPath, ['tools/banco/migrar.mjs', '--origem', origem, '--destino', destino], { cwd: path.resolve('.') });
  assert.equal(sha256Arquivo(origem), antes, 'a origem não pode mudar');
  const db = abrirBanco(destino); assert.deepEqual(lerDocumento(db, 'db'), exemplo()); db.close();
  fs.rmSync(d, { recursive: true, force: true });
});

test('migração recusa sobrescrever destino existente e JSON inválido', () => {
  const d = pasta(); const origem = path.join(d, 'db.json'); const destino = path.join(d, 'x.sqlite');
  fs.writeFileSync(origem, '{ruim'); 
  assert.throws(() => execFileSync(process.execPath, ['tools/banco/migrar.mjs', '--origem', origem, '--destino', destino], { stdio: 'pipe' }));
  assert.equal(fs.existsSync(destino), false, 'nada gravado com JSON inválido');
  fs.writeFileSync(origem, JSON.stringify(exemplo())); fs.writeFileSync(destino, 'já existe');
  assert.throws(() => execFileSync(process.execPath, ['tools/banco/migrar.mjs', '--origem', origem, '--destino', destino], { stdio: 'pipe' }));
  assert.equal(fs.readFileSync(destino, 'utf8'), 'já existe');
  fs.rmSync(d, { recursive: true, force: true });
});
