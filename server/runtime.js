// Primeiro módulo carregado pelo servidor.
// 1) Aceita configurações por argumento (usado pelo atalho do Windows):
//      node server/index.js --data-dir=C:\...\Codeniac --port=3000 --log-file=C:\...\codeniac.log
// 2) Lê o .env da pasta de dados, se existir (ex.: HOST=0.0.0.0, ANTHROPIC_API_KEY).
// 3) Quando há --log-file / LOG_FILE (app iniciado sem terminal), grava os logs em arquivo.
import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';

const ARGS = { '--data-dir': 'DATA_DIR', '--port': 'PORT', '--log-file': 'LOG_FILE' };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const [flag, ...rest] = argv[i].split('=');
  if (!ARGS[flag]) continue;
  if (rest.length) process.env[ARGS[flag]] = rest.join('=');
  else if (argv[i + 1] && !argv[i + 1].startsWith('--')) process.env[ARGS[flag]] = argv[++i]; // também aceita "--port 3000"
}

if (process.env.DATA_DIR) {
  const envFile = path.join(process.env.DATA_DIR, '.env');
  if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
}

if (process.env.LOG_FILE) {
  fs.mkdirSync(path.dirname(process.env.LOG_FILE), { recursive: true });
  // mantém o log pequeno: se passar de 2 MB, recomeça guardando o arquivo anterior
  try { if (fs.statSync(process.env.LOG_FILE).size > 2 * 1024 * 1024) fs.renameSync(process.env.LOG_FILE, `${process.env.LOG_FILE}.old`); } catch { /* sem log ainda */ }
  const out = fs.createWriteStream(process.env.LOG_FILE, { flags: 'a' });
  const write = (level) => (...args) => out.write(`[${new Date().toISOString()}] ${level} ${util.format(...args)}\n`);
  console.log = write('INFO ');
  console.error = write('ERROR');
  process.on('uncaughtException', (err) => { console.error(err); setTimeout(() => process.exit(1), 100); });
}
