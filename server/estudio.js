// STRUCTURE STUDIO: projetos de estruturas (edifícios, vias, estacionamentos) montados com componentes da biblioteca.
// Cada projeto é um arquivo por usuário em DATA_DIR/estudio/<uid>/estruturas/<id>.json (escrita atômica).
// A aparência (componentes) fica separada da lógica de interação (bloco "logica": entradas, pegada, vagas...).
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA_DIR } from './db.js';
import { PRESETS, GRADE } from '../public/js/estudio/presets.js';
import biblioteca from './estudio-biblioteca.js';

const router = express.Router();
const PASTA = path.join(DATA_DIR, 'estudio');
const MAX_COMPONENTES = 1500;
const LADO_MIN = 4;
const LADO_MAX = 80; // células

const pastaDe = (uid) => path.join(PASTA, uid, 'estruturas');
const arquivoDe = (uid, id) => path.join(pastaDe(uid), `${id}.json`);
export const idValido = (id) => /^[a-f0-9-]{36}$/.test(String(id));

function gravar(uid, e) {
  fs.mkdirSync(pastaDe(uid), { recursive: true });
  const tmp = `${arquivoDe(uid, e.id)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(e));
  fs.renameSync(tmp, arquivoDe(uid, e.id));
}
export function lerEstrutura(uid, id) {
  if (!idValido(id)) return null;
  try { return JSON.parse(fs.readFileSync(arquivoDe(uid, id), 'utf8')); } catch { return null; }
}
export function listarEstruturas(uid) {
  const dir = pastaDe(uid);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => lerEstrutura(uid, f.slice(0, -5))).filter(Boolean);
}

const resumo = (e) => ({ id: e.id, nome: e.nome, preset: e.preset, tipo: e.tipo, area: e.area, componentes: e.componentes.length, atualizado: e.atualizado, prefab: e.prefab || null });

// valida o que vem do cliente; lança erro com a mensagem para o usuário
export function validarEstrutura(corpo, base = null) {
  const presetId = String(corpo.preset ?? base?.preset ?? '');
  const preset = PRESETS[presetId];
  if (!preset) throw new Error('preset de câmera desconhecido');
  if (base && base.preset !== presetId) throw new Error('o preset de câmera não pode mudar depois de criado (as perspectivas não se misturam)');
  const tipo = String(corpo.tipo ?? base?.tipo ?? 'outro');
  if (!preset.tipos.includes(tipo)) throw new Error(`tipo inválido para este preset: ${tipo}`);
  const w = Math.trunc(Number(corpo.area?.w ?? base?.area?.w ?? preset.area.w));
  const h = Math.trunc(Number(corpo.area?.h ?? base?.area?.h ?? preset.area.h));
  if (!(w >= LADO_MIN && w <= LADO_MAX && h >= LADO_MIN && h <= LADO_MAX)) throw new Error(`a área tem de ter de ${LADO_MIN} a ${LADO_MAX} células de lado`);
  const componentes = corpo.componentes ?? base?.componentes ?? [];
  if (!Array.isArray(componentes)) throw new Error('componentes inválidos');
  if (componentes.length > MAX_COMPONENTES) throw new Error(`no máximo ${MAX_COMPONENTES} componentes`);
  return { preset: presetId, tipo, grade: GRADE, area: { w, h }, componentes, grupos: Array.isArray(corpo.grupos) ? corpo.grupos : (base?.grupos ?? []), logica: corpo.logica && typeof corpo.logica === 'object' ? corpo.logica : (base?.logica ?? { entradas: [], pegada: null }) };
}

router.use('/componentes', biblioteca);

router.get('/presets', (_req, res) => res.json({ presets: PRESETS, grade: GRADE }));

router.get('/estruturas', (req, res) => {
  res.json({ estruturas: listarEstruturas(req.user.id).sort((a, b) => String(b.atualizado).localeCompare(String(a.atualizado))).map(resumo) });
});

router.post('/estruturas', (req, res) => {
  const nome = String(req.body?.nome ?? '').trim().slice(0, 60) || 'Nova estrutura';
  let dados;
  try { dados = validarEstrutura({ preset: req.body?.preset, tipo: req.body?.tipo, area: req.body?.area, componentes: [] }); } catch (err) { return res.status(400).json({ error: err.message }); }
  const agora = new Date().toISOString();
  const e = { id: crypto.randomUUID(), nome, versao: 1, ...dados, criado: agora, atualizado: agora };
  gravar(req.user.id, e);
  res.status(201).json(e);
});

router.get('/estruturas/:id', (req, res) => {
  const e = lerEstrutura(req.user.id, req.params.id);
  if (!e) return res.status(404).json({ error: 'Estrutura não encontrada' });
  res.json(e);
});

router.put('/estruturas/:id', (req, res) => {
  const base = lerEstrutura(req.user.id, req.params.id);
  if (!base) return res.status(404).json({ error: 'Estrutura não encontrada' });
  let dados;
  try { dados = validarEstrutura(req.body || {}, base); } catch (err) { return res.status(400).json({ error: err.message }); }
  const e = { ...base, ...dados, nome: String(req.body?.nome ?? base.nome).trim().slice(0, 60) || base.nome, atualizado: new Date().toISOString() };
  gravar(req.user.id, e);
  res.json(e);
});

router.delete('/estruturas/:id', (req, res) => {
  if (!lerEstrutura(req.user.id, req.params.id)) return res.status(404).json({ error: 'Estrutura não encontrada' });
  fs.rmSync(arquivoDe(req.user.id, req.params.id), { force: true });
  res.json({ ok: true });
});

export default router;
