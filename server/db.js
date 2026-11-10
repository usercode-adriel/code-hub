// Armazenamento em arquivo JSON com escrita atômica.
// Simples, sem dependências nativas, ideal para um hub pessoal.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

// Raiz do app calculada a partir deste arquivo: funciona mesmo iniciado por atalho/instalador.
export const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = path.resolve(APP_ROOT, process.env.DATA_DIR || 'data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
export const DB_FILE = path.join(DATA_DIR, 'db.json');

// Coleções por usuário (cada item tem userId). Novas coleções da 1.3 entram aqui.
export const USER_COLLECTIONS = [
  'projects', 'tasks', 'notes', 'links', 'notifications', 'pages', 'finance',
  'events', 'agenda', 'habits', 'inbox', 'decisions', 'journal', 'dayClose',
  'fuel', 'services', 'docs', 'shifts', 'cards', 'snippets', 'trail', 'books', 'studyLog', 'enJournal',
  'money', 'bills', 'subscriptions',
];

const EMPTY = () => ({
  meta: {},
  users: [],
  settings: {},       // userId -> configurações
  system: {},         // configurações globais (admin)
  threads: {},        // userId -> { conversations: [...] }
  garage: {},         // userId -> dados do carro
  budgets: {},        // userId -> { categoria: limite }
  ...Object.fromEntries(USER_COLLECTIONS.map((c) => [c, []])),
});

let state = null;
let timer = null;

export function load() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  state = fs.existsSync(DB_FILE) ? { ...EMPTY(), ...JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) } : EMPTY();
  for (const c of USER_COLLECTIONS) state[c] ??= [];
  return state;
}

// Troca o banco inteiro (restauração de backup).
export function replaceState(next) {
  state = { ...EMPTY(), ...next };
  for (const c of USER_COLLECTIONS) state[c] ??= [];
  saveNow();
}

export function db() {
  if (!state) load();
  return state;
}

function flush() {
  const tmp = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state));
  fs.renameSync(tmp, DB_FILE);
}

export function save() {
  clearTimeout(timer);
  timer = setTimeout(flush, 40);
}

export function saveNow() {
  clearTimeout(timer);
  flush();
}

export const id = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function slugify(str) {
  return String(str)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    .slice(0, 40) || 'projeto';
}
