// REDEFINIR SENHA (usado pelo instalador do Windows e pelo terminal).
// Uso: node server/redefinir-senha.mjs --data-dir "<pasta de dados>" [--email admin@codeniac.dev] [--senha codeniac123]
// Se a conta existe, troca a senha dela; se não existe, cria a conta. Usa o mesmo hash do servidor (auth.js).
const arg = (nome, padrao = null) => { const i = process.argv.indexOf(`--${nome}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : padrao; };
const dir = arg('data-dir');
if (!dir) { console.error('Informe a pasta de dados: --data-dir "<pasta>"'); process.exit(2); }
const email = String(arg('email', 'admin@codeniac.dev')).trim().toLowerCase();
const senha = String(arg('senha', 'codeniac123'));
if (senha.length < 6) { console.error('A senha precisa de pelo menos 6 caracteres.'); process.exit(2); }
process.env.DATA_DIR = dir; // antes de importar o banco, que lê a pasta ao carregar
const { db, saveNow } = await import('./db.js');
const { hashPassword } = await import('./auth.js');
const { createUser } = await import('./seed.js');
const u = db().users.find((x) => x.email === email);
if (u) {
  u.password = hashPassword(senha);
  saveNow();
  console.log(`Senha redefinida para ${email}.`);
} else {
  createUser({ name: 'Administrador', email, password: senha, role: 'admin' });
  saveNow();
  console.log(`Conta ${email} criada com a senha informada.`);
}
