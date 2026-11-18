// Armazenamento do mundo (System 2.0): um arquivo próprio (world.json), separado do banco do hub,
// para que o universo possa crescer sem deixar lento o resto do sistema.
// Escrita atômica (arquivo temporário + rename) e cópia anterior em world.json.bak:
// se o arquivo principal corromper (queda de energia), o mundo volta do último estado bom.
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, db, save as saveDb } from '../db.js';

export const WORLD_FILE = path.join(DATA_DIR, 'world.json');
const BAK = `${WORLD_FILE}.bak`;
let state = null;
let timer = null;
let dirty = false;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function loadWorld() {
  state = {};
  try {
    if (fs.existsSync(WORLD_FILE)) state = readJson(WORLD_FILE);
  } catch (err) {
    console.error('» world.json danificado, recuperando da cópia anterior:', err.message);
    try { state = fs.existsSync(BAK) ? readJson(BAK) : {}; } catch { state = {}; }
  }
  // 2.0 guardava a rede dentro do db.json: muda para cá uma única vez
  const d = db();
  if (d.social && Object.keys(d.social).length) {
    for (const [uid, s] of Object.entries(d.social)) {
      state[uid] ??= {};
      state[uid].social ??= s;
    }
    d.social = {};
    saveDb();
    dirty = true;
    flushWorld();
  }
  return state;
}

export const worlds = () => state || loadWorld();
export function worldOf(userId) {
  const all = worlds();
  return (all[userId] ??= {});
}

export function saveWorld() {
  dirty = true;
  if (timer) return;
  timer = setTimeout(flushWorld, 1500);
}

export function flushWorld() {
  clearTimeout(timer);
  timer = null;
  if (!dirty || !state) return;
  dirty = false;
  const tmp = `${WORLD_FILE}.tmp`;
  fs.mkdirSync(path.dirname(WORLD_FILE), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(state));
  if (fs.existsSync(WORLD_FILE)) fs.copyFileSync(WORLD_FILE, BAK);
  fs.renameSync(tmp, WORLD_FILE);
}

// Restauração de backup
export function replaceWorld(next) {
  state = next && typeof next === 'object' ? next : {};
  dirty = true;
  flushWorld();
}

export function resetWorld(userId) {
  delete worlds()[userId];
  saveWorld();
}
