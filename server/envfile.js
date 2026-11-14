// Segredos (chaves de IA, token do GitHub, Telegram) ficam em DATA_DIR/.env: fora do banco e dos backups.
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './db.js';

const ENV_FILE = () => path.join(DATA_DIR, '.env');
export function setEnvVar(name, value) {
  let env = fs.existsSync(ENV_FILE()) ? fs.readFileSync(ENV_FILE(), 'utf8') : '';
  env = env.replace(new RegExp(`^[ \\t]*${name}[ \\t]*=.*(\\r?\\n)?`, 'gm'), '');
  if (value) env = `${env}${env && !/\n$/.test(env) ? '\r\n' : ''}${name}=${value}\r\n`;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(ENV_FILE(), env, { mode: 0o600 });
  if (value) process.env[name] = value; else delete process.env[name];
}
