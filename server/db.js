// Armazenamento em arquivo JSON com escrita atômica.
// Simples, sem dependências nativas, ideal para um hub pessoal.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
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
  'money', 'bills', 'subscriptions', 'bots',
  'aiActions', 'memories', 'rules', 'capsules',
];

const EMPTY = () => ({
  meta: {},
  users: [],
  settings: {},       // userId -> configurações
  system: {},         // configurações globais (admin)
  threads: {},        // userId -> { conversations: [...] }
  garage: {},         // userId -> dados do carro
  budgets: {},        // userId -> { categoria: limite }
  userMeta: {},       // userId -> extras (plano do dia, Telegram, recorrentes ignorados...)
  social: {},         // userId -> rede social (pessoas-IA, posts, pesquisas)
  ...Object.fromEntries(USER_COLLECTIONS.map((c) => [c, []])),
});

let state = null;
let timer = null;

// Lê um JSON tolerando BOM (arquivo salvo pelo Bloco de Notas/PowerShell). Lança erro se estiver danificado.
function lerJson(file) {
  const txt = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  return JSON.parse(txt);
}

// Backups automáticos (ver backup.js): procurados nos mesmos lugares padrão, do mais recente para o mais antigo.
function candidatosDeRecuperacao() {
  const lista = [];
  const add = (f) => { try { if (fs.existsSync(f)) lista.push({ f, t: fs.statSync(f).mtimeMs }); } catch { /* ignora */ } };
  add(`${DB_FILE}.bak`);
  add(`${DB_FILE}.tmp`);
  try { for (const n of fs.readdirSync(DATA_DIR)) if (/^db\.antes-.*\.json$/.test(n)) add(path.join(DATA_DIR, n)); } catch { /* sem pasta */ }
  const bases = [process.env.OneDrive, process.env.OneDriveConsumer, path.join(os.homedir(), 'Documents'), os.homedir()].filter(Boolean);
  for (const b of new Set(bases)) {
    const dir = path.join(b, 'Codeniac-Backups');
    try { for (const n of fs.readdirSync(dir)) if (/^\d{4}-\d{2}-\d{2}_\d{4}$/.test(n)) add(path.join(dir, n, 'db.json')); } catch { /* sem backups aí */ }
  }
  return lista.sort((a, b) => b.t - a.t).map((x) => x.f);
}

// Lê o banco; se estiver danificado, guarda uma cópia e recupera do backup válido mais recente, em vez de não abrir.
function lerBanco() {
  if (fs.existsSync(DB_FILE)) {
    try { return lerJson(DB_FILE); } catch (err) {
      const copia = path.join(DATA_DIR, `db.corrompido-${Date.now()}.json`);
      try { fs.copyFileSync(DB_FILE, copia); } catch { /* segue */ }
      console.error(`» db.json danificado (${err.message}). Cópia guardada em ${copia}. Procurando backup…`);
    }
  } else if (!fs.existsSync(`${DB_FILE}.bak`)) return null;
  for (const f of candidatosDeRecuperacao()) {
    try {
      const dados = lerJson(f);
      console.error(`» Banco recuperado de ${f}`);
      fs.copyFileSync(f, DB_FILE);
      return dados;
    } catch { /* tenta o próximo */ }
  }
  console.error('» Nenhum backup válido encontrado: o Codeniac abre com um banco novo (a cópia danificada foi guardada).');
  return null;
}

export function load() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const dados = lerBanco();
  state = dados ? { ...EMPTY(), ...dados } : EMPTY();
  for (const c of USER_COLLECTIONS) state[c] ??= [];
  state.userMeta ??= {};
  state.social ??= {};
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

// Grava no temporário, força a ida ao disco (fsync) e só então troca; o arquivo anterior fica em db.json.bak.
// Assim uma queda de energia não deixa o db.json cheio de zeros, e sempre há uma cópia boa ao lado.
function flush() {
  const tmp = `${DB_FILE}.tmp`;
  const fd = fs.openSync(tmp, 'w');
  try { fs.writeSync(fd, JSON.stringify(state)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  if (fs.existsSync(DB_FILE)) { try { fs.copyFileSync(DB_FILE, `${DB_FILE}.bak`); } catch { /* segue sem .bak */ } }
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
