// REDEFINIR SENHA (usado pelo instalador do Windows e pelo terminal).
// Uso: node server/redefinir-senha.mjs --data-dir "<pasta de dados>" [--email admin@codeniac.dev] [--senha <nova>] [--role admin|user]
// Sem --senha, a senha de uma conta existente não muda (só o perfil). Conta nova exige --senha.
// Se a conta existe, troca a senha dela; se não existe, cria a conta. Usa o mesmo hash do servidor (auth.js).
const arg = (nome, padrao = null) => { const i = process.argv.indexOf(`--${nome}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : padrao; };
const dir = arg('data-dir');
if (!dir) { console.error('Informe a pasta de dados: --data-dir "<pasta>"'); process.exit(2); }
const email = String(arg('email', 'admin@codeniac.dev')).trim().toLowerCase();
const senhaArg = arg('senha', null);
const senha = senhaArg == null ? null : String(senhaArg);
const papel = arg('role', null);
if (papel && !['admin', 'user'].includes(papel)) { console.error('Perfil inválido: use admin ou user.'); process.exit(2); }
if (senha != null && senha.length < 6) { console.error('A senha precisa de pelo menos 6 caracteres.'); process.exit(2); }
process.env.DATA_DIR = dir; // antes de importar o banco, que lê a pasta ao carregar
const { db, saveNow } = await import('./db.js');
const { hashPassword } = await import('./auth.js');
const { createUser } = await import('./seed.js');
const u = db().users.find((x) => x.email === email);
if (u) {
  if (senha != null) u.password = hashPassword(senha);
  if (papel) u.role = papel;
  saveNow();
  console.log(`${senha != null ? 'Senha redefinida' : 'Senha mantida'} para ${email}${papel ? `; perfil: ${u.role}` : ''}.`);
} else {
  if (senha == null) { console.error('A conta não existe: informe --senha para criá-la.'); process.exit(2); }
  createUser({ name: 'Administrador', email, password: senha, role: papel || 'user' });
  saveNow();
  console.log(`Conta ${email} criada (perfil: ${papel || 'user'}).`);
}
