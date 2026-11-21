// REDEFINIR SENHA OU PERFIL — versão avulsa: um arquivo só, sem node_modules (usa apenas o Node instalado).
// Faz o mesmo hash do servidor (server/auth.js: scrypt com sal de 16 bytes, "sal:hash").
// Uso (Windows, terminal cmd, com o Codeniac FECHADO):
//   node redefinir-senha-avulso.mjs --email voce@exemplo.com --senha novaSenha123
//   node redefinir-senha-avulso.mjs --email voce@exemplo.com --role admin
// A pasta de dados padrão é %APPDATA%\Codeniac; outra pasta: --data-dir "C:\caminho".
// Só altera contas que já existem. Antes de gravar, guarda uma cópia do db.json na mesma pasta.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const arg = (nome) => { const i = process.argv.indexOf(`--${nome}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null; };
const sair = (msg) => { console.error(msg); process.exit(1); };

const dir = arg('data-dir') || (process.env.APPDATA ? path.join(process.env.APPDATA, 'Codeniac') : path.resolve('data'));
const email = String(arg('email') || '').trim().toLowerCase();
const senha = arg('senha');
const papel = arg('role');
if (!email) sair('Informe o e-mail: --email voce@exemplo.com');
if (senha == null && !papel) sair('Informe --senha e/ou --role admin.');
if (senha != null && senha.length < 6) sair('A senha precisa de pelo menos 6 caracteres.');
if (papel && !['admin', 'user'].includes(papel)) sair('Perfil inválido: use admin ou user.');

const arquivo = path.join(dir, 'db.json');
if (!fs.existsSync(arquivo)) sair(`Não encontrei o banco em ${arquivo}. Use --data-dir com a pasta certa.`);
const d = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
const users = d.users || [];
const u = users.find((x) => String(x.email).toLowerCase() === email);
if (!u) sair(`A conta ${email} não existe neste computador.\nContas cadastradas: ${users.map((x) => x.email).join(', ') || '(nenhuma)'}\nPara criar uma conta nova, use a aba "Criar conta" na tela de login.`);

if (u.role === 'admin' && papel === 'user' && users.filter((x) => x.role === 'admin').length === 1) sair('O sistema precisa de pelo menos um administrador.');

const copia = path.join(dir, `db.antes-da-senha-${Date.now()}.json`);
fs.copyFileSync(arquivo, copia);
if (senha != null) {
  const sal = crypto.randomBytes(16).toString('hex');
  u.password = `${sal}:${crypto.scryptSync(senha, sal, 64).toString('hex')}`;
}
if (papel) u.role = papel;
const tmp = `${arquivo}.tmp`;
fs.writeFileSync(tmp, JSON.stringify(d));
fs.renameSync(tmp, arquivo);
console.log(`Pronto: ${email}${senha != null ? ' — senha redefinida' : ''}${papel ? ` — perfil: ${u.role}` : ''}.`);
console.log(`Cópia de segurança: ${copia}`);
