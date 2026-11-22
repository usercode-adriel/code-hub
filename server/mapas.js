// CRIAR MAPA: mapas do usuário, com chão (células de 32 unidades) e itens do inventário.
// Todo mapa novo começa com grama em todas as células (a grama não é guardada: é o padrão).
// Só entra peça que existe no inventário (public/assets/mapas/inventario/manifesto.json).
// "Vida" marca o mapa ativo do usuário: o jogo carrega esse mapa no lugar da cidade padrão.
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA_DIR, APP_ROOT, db, save } from './db.js';

const router = express.Router();
const CELULA = 32;
const MAX_CELULAS = 120;        // lado máximo do mapa, em células
const MAX_ITENS = 4000;
const PASTA = path.join(DATA_DIR, 'mapas');
const MANIFESTO = path.join(APP_ROOT, 'public', 'assets', 'mapas', 'inventario', 'manifesto.json');

let inventarioCache = null;
function inventario() {
  if (!inventarioCache) {
    const m = JSON.parse(fs.readFileSync(MANIFESTO, 'utf8'));
    inventarioCache = new Map(m.itens.map((i) => [i.chave, i]));
  }
  return inventarioCache;
}

const pastaDe = (uid) => path.join(PASTA, uid);
const arquivoDe = (uid, id) => path.join(pastaDe(uid), `${id}.json`);
const idValido = (id) => /^[a-f0-9-]{36}$/.test(id);

function resumo(m) { return { id: m.id, nome: m.nome, largura: m.largura, altura: m.altura, atualizado: m.atualizado, itens: m.itens.length }; }

function lerMapa(uid, id) {
  if (!idValido(id)) return null;
  try { return JSON.parse(fs.readFileSync(arquivoDe(uid, id), 'utf8')); } catch { return null; }
}
function gravarMapa(uid, m) {
  fs.mkdirSync(pastaDe(uid), { recursive: true });
  const tmp = arquivoDe(uid, m.id) + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(m));
  fs.renameSync(tmp, arquivoDe(uid, m.id));
}

// valida e normaliza um mapa vindo do cliente; lança erro com a mensagem para o usuário
function validar(corpo, base) {
  const largura = Math.trunc(Number(corpo.largura ?? base.largura));
  const altura = Math.trunc(Number(corpo.altura ?? base.altura));
  if (!(largura >= 4 && largura <= MAX_CELULAS && altura >= 4 && altura <= MAX_CELULAS)) throw new Error(`o mapa tem de ter de 4 a ${MAX_CELULAS} células de lado`);
  const inv = inventario();
  const celulas = {};
  for (const [k, v] of Object.entries(corpo.celulas ?? base.celulas ?? {})) {
    const [x, y] = k.split(',').map(Number);
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= largura || y >= altura) throw new Error(`célula fora do mapa: ${k}`);
    const it = inv.get(String(v));
    if (!it || it.categoria !== 'terreno') throw new Error(`terreno desconhecido: ${v}`);
    if (it.base) continue; // grama base não precisa ser guardada
    celulas[`${x},${y}`] = it.chave;
  }
  const lista = corpo.itens ?? base.itens ?? [];
  if (lista.length > MAX_ITENS) throw new Error(`no máximo ${MAX_ITENS} itens`);
  const itens = lista.map((p) => {
    const it = inv.get(String(p?.chave));
    if (!it) throw new Error(`item fora do inventário: ${p?.chave}`);
    if (it.categoria === 'terreno') throw new Error('terreno é pintado nas células, não como item');
    const x = Number(p.x); const y = Number(p.y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > largura * CELULA || y > altura * CELULA) throw new Error('item fora do mapa');
    const dados = {};
    if (p.dados && typeof p.dados === 'object') {
      if (p.dados.nome != null) dados.nome = String(p.dados.nome).slice(0, 60);
      if (p.dados.rota != null) dados.rota = String(p.dados.rota).slice(0, 80);
    }
    return { id: String(p.id || crypto.randomUUID()).slice(0, 40), chave: it.chave, x: Math.round(x), y: Math.round(y), rot: Number(p.rot) || 0, dados };
  });
  return { largura, altura, celulas, itens };
}

router.get('/inventario', (req, res) => {
  res.json({ itens: [...inventario().values()] });
});

router.get('/', (req, res) => {
  const u = req.user; const dir = pastaDe(u.id);
  const ids = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)) : [];
  const mapas = ids.map((id) => lerMapa(u.id, id)).filter(Boolean).map(resumo);
  res.json({ mapas, vida: u.mapaVida || null });
});

router.post('/', (req, res) => {
  const nome = String(req.body?.nome ?? '').trim().slice(0, 60) || 'Meu mapa';
  const m = { id: crypto.randomUUID(), nome, largura: 40, altura: 30, celulas: {}, itens: [], criado: new Date().toISOString(), atualizado: new Date().toISOString() };
  gravarMapa(req.user.id, m);
  res.status(201).json(m);
});

router.get('/:id', (req, res) => {
  const m = lerMapa(req.user.id, req.params.id);
  if (!m) return res.status(404).json({ error: 'Mapa não encontrado' });
  res.json(m);
});

router.put('/:id', (req, res) => {
  const base = lerMapa(req.user.id, req.params.id);
  if (!base) return res.status(404).json({ error: 'Mapa não encontrado' });
  let novo;
  try { novo = validar(req.body || {}, base); } catch (err) { return res.status(400).json({ error: err.message }); }
  const m = { ...base, ...novo, nome: String(req.body?.nome ?? base.nome).trim().slice(0, 60) || base.nome, atualizado: new Date().toISOString() };
  gravarMapa(req.user.id, m);
  res.json(m);
});

router.delete('/:id', (req, res) => {
  if (!lerMapa(req.user.id, req.params.id)) return res.status(404).json({ error: 'Mapa não encontrado' });
  fs.rmSync(arquivoDe(req.user.id, req.params.id), { force: true });
  const u = db().users.find((x) => x.id === req.user.id);
  if (u && u.mapaVida === req.params.id) { delete u.mapaVida; save(); }
  res.json({ ok: true });
});

// VIDA: o mapa ativo passa a ser o do jogo
router.post('/:id/vida', (req, res) => {
  if (!lerMapa(req.user.id, req.params.id)) return res.status(404).json({ error: 'Mapa não encontrado' });
  const u = db().users.find((x) => x.id === req.user.id);
  u.mapaVida = req.params.id; save();
  res.json({ vida: u.mapaVida });
});

router.delete('/vida/ativo', (req, res) => {
  const u = db().users.find((x) => x.id === req.user.id);
  delete u.mapaVida; save();
  res.json({ vida: null });
});

export default router;

// usado por outros módulos do servidor (exportação para o Godot): o mapa "Vida" do usuário, ou null
export function mapaAtivoDoUsuario(uid) {
  const u = db().users.find((x) => x.id === uid);
  return u?.mapaVida ? lerMapa(uid, u.mapaVida) : null;
}
export function inventarioServidor() {
  return inventario();
}
