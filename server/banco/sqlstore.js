// ARMAZENAMENTO EM SQLITE (opcional, ainda não ligado ao app): guarda cada documento (ex.: o banco inteiro,
// um mundo) como JSON numa tabela, com gravação em transação. Usa o módulo nativo node:sqlite (Node 22+).
// O app continua no db.json até a migração ser feita e confirmada (tools/banco/migrar.mjs).
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import crypto from 'node:crypto';

export function abrirBanco(arquivo) {
  const db = new DatabaseSync(arquivo);
  db.exec(`PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;
    CREATE TABLE IF NOT EXISTS documento (chave TEXT PRIMARY KEY, json TEXT NOT NULL, sha256 TEXT NOT NULL, atualizado TEXT NOT NULL);`);
  return db;
}

// grava (ou troca) um documento numa transação: ou entra inteiro, ou não entra
export function gravarDocumento(db, chave, valor) {
  const json = JSON.stringify(valor);
  const sha = crypto.createHash('sha256').update(json).digest('hex');
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`INSERT INTO documento (chave, json, sha256, atualizado) VALUES (?, ?, ?, ?)
      ON CONFLICT(chave) DO UPDATE SET json = excluded.json, sha256 = excluded.sha256, atualizado = excluded.atualizado`)
      .run(chave, json, sha, new Date().toISOString());
    db.exec('COMMIT');
  } catch (err) { db.exec('ROLLBACK'); throw err; }
  return sha;
}

export function lerDocumento(db, chave) {
  const r = db.prepare('SELECT json, sha256 FROM documento WHERE chave = ?').get(chave);
  if (!r) return null;
  if (crypto.createHash('sha256').update(r.json).digest('hex') !== r.sha256) throw new Error(`documento ${chave} corrompido (sha256 não confere)`);
  return JSON.parse(r.json);
}

export const sha256Arquivo = (arquivo) => crypto.createHash('sha256').update(fs.readFileSync(arquivo)).digest('hex');
