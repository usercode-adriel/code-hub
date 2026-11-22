// MIGRAÇÃO db.json → SQLite. NÃO apaga nem altera o arquivo de origem.
// Uso: node tools/banco/migrar.mjs --origem "<pasta>/db.json" --destino "<pasta>/codeniac.sqlite"
// Confere: o documento lido de volta do SQLite tem o mesmo conteúdo do JSON de origem (sha256 do texto).
import fs from 'node:fs';
import path from 'node:path';
import { abrirBanco, gravarDocumento, lerDocumento } from '../../server/banco/sqlstore.js';

const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : null; };
const origem = arg('origem'); const destino = arg('destino');
if (!origem || !destino) { console.error('Informe --origem e --destino.'); process.exit(2); }
if (!fs.existsSync(origem)) { console.error(`Origem não encontrada: ${origem}`); process.exit(2); }
if (fs.existsSync(destino)) { console.error(`O destino já existe (não sobrescrevo): ${destino}`); process.exit(2); }

const texto = fs.readFileSync(origem, 'utf8');
const valor = JSON.parse(texto); // falha aqui se o JSON estiver ruim: nada é gravado
const hashOrigem = (await import('node:crypto')).createHash('sha256').update(JSON.stringify(valor)).digest('hex');
const antes = fs.statSync(origem).mtimeMs;
fs.mkdirSync(path.dirname(destino), { recursive: true });
const db = abrirBanco(destino);
gravarDocumento(db, 'db', valor);
const volta = lerDocumento(db, 'db');
db.close();
const hashVolta = (await import('node:crypto')).createHash('sha256').update(JSON.stringify(volta)).digest('hex');
if (hashVolta !== hashOrigem) { fs.rmSync(destino, { force: true }); console.error('Conferência falhou: o conteúdo lido de volta é diferente. Destino removido; origem intacta.'); process.exit(1); }
if (fs.statSync(origem).mtimeMs !== antes) { console.error('A origem mudou durante a migração; tente de novo com o Codeniac fechado.'); process.exit(1); }
console.log(`Migração conferida: ${destino} (conteúdo idêntico ao de ${origem}). A origem não foi alterada.`);
