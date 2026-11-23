// STRUCTURE STUDIO: prefabs. Um prefab é uma estrutura "assada" numa imagem PNG mais tudo o que a lógica do jogo precisa:
// pegada, colisões, entradas, materiais e a lista de componentes (para editar depois). O servidor RECALCULA esses dados da
// estrutura salva; o cliente só manda a imagem. Uma montagem com erro (peça flutuando, componente sumido) não vira prefab.
import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA_DIR } from './db.js';
import { diagnosticar } from '../public/js/estudio/montagem.js';
import { montarPrefab } from '../public/js/estudio/prefab.js';
import { componentePorId, gravarPng, removerPng, componentesDoUsuario } from './estudio-biblioteca.js';
import { lerEstrutura, gravarEstrutura, idValido } from './estudio-dados.js';

const router = express.Router();
const pastaDe = (uid) => path.join(DATA_DIR, 'estudio', uid, 'prefabs');
const arquivoDe = (uid, id) => path.join(pastaDe(uid), `${id}.json`);

function gravar(uid, p) {
  fs.mkdirSync(pastaDe(uid), { recursive: true });
  const tmp = `${arquivoDe(uid, p.id)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(p));
  fs.renameSync(tmp, arquivoDe(uid, p.id));
}
export function lerPrefab(uid, id) {
  if (!idValido(id)) return null;
  try { return JSON.parse(fs.readFileSync(arquivoDe(uid, id), 'utf8')); } catch { return null; }
}
export function listarPrefabs(uid) {
  const dir = pastaDe(uid);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => lerPrefab(uid, f.slice(0, -5))).filter(Boolean);
}
const resumo = (p) => ({ id: p.id, estruturaId: p.estruturaId, nome: p.nome, preset: p.preset, tipo: p.tipo, versao: p.versao, imagem: p.imagem, arquivo: p.arquivo, pegada: p.pegada, entradas: p.entradas.length, colisoes: p.colisoes.length, atualizado: p.atualizado });

// o arquivo só sai do disco se nenhum outro prefab ou componente do usuário o usa
function liberarImagem(uid, hash, exceto) {
  const usado = listarPrefabs(uid).some((p) => p.id !== exceto && p.arquivoHash === hash) || componentesDoUsuario(uid).some((c) => c.hash === hash);
  if (!usado) removerPng(uid, hash);
}

const envio = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024, files: 1 } });
const receber = (req, res, next) => envio.single('imagem')(req, res, (err) => (err ? res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Imagem acima de 12 MB' : err.message }) : next()));

router.get('/', (req, res) => res.json({ prefabs: listarPrefabs(req.user.id).sort((a, b) => String(b.atualizado).localeCompare(String(a.atualizado))).map(resumo) }));

router.get('/:id', (req, res) => {
  const p = lerPrefab(req.user.id, req.params.id);
  if (!p) return res.status(404).json({ error: 'Prefab não encontrado' });
  res.json(p);
});

// exportação: tudo num arquivo só (dados + imagem em base64), para levar para outro lugar
router.get('/:id/exportar', (req, res) => {
  const p = lerPrefab(req.user.id, req.params.id);
  if (!p) return res.status(404).json({ error: 'Prefab não encontrado' });
  const png = fs.readFileSync(path.join(DATA_DIR, 'estudio-arquivos', req.user.id, `${p.arquivoHash}.png`));
  res.setHeader('Content-Disposition', `attachment; filename="${p.nome.replace(/[^\w.-]+/g, '-')}.prefab.json"`);
  res.json({ formato: 'codeniac-prefab', versao: 1, prefab: { ...p, arquivo: undefined }, imagemBase64: png.toString('base64') });
});

// salvar como prefab: a estrutura precisa estar salva e sem erros; os dados são recalculados aqui
router.post('/', receber, (req, res) => {
  const uid = req.user.id;
  if (!req.file) return res.status(400).json({ error: 'Envie a imagem PNG da estrutura' });
  const est = lerEstrutura(uid, String(req.body?.estruturaId || ''));
  if (!est) return res.status(404).json({ error: 'Estrutura não encontrada: salve antes de criar o prefab' });
  const compDe = (id) => componentePorId(uid, id);
  let dados;
  try { dados = montarPrefab(est, compDe); } catch (err) { return res.status(400).json({ error: err.message }); }
  const erros = diagnosticar(est.componentes, est.area, est.preset, compDe).filter((d) => d.gravidade === 'erro');
  if (erros.length) return res.status(400).json({ error: `Corrija a montagem antes (${erros.length} erro${erros.length > 1 ? 's' : ''}): ${erros[0].msg}` });
  let img;
  try { img = gravarPng(uid, req.file.buffer); } catch (err) { return res.status(400).json({ error: err.message }); }
  if (img.w !== dados.imagem.w || img.h !== dados.imagem.h) {
    liberarImagem(uid, img.hash, null);
    return res.status(400).json({ error: `A imagem (${img.w}×${img.h}) não bate com a estrutura (${dados.imagem.w}×${dados.imagem.h}). Salve de novo e gere o prefab outra vez.` });
  }
  const antigo = est.prefab?.id ? lerPrefab(uid, est.prefab.id) : null;
  const agora = new Date().toISOString();
  const nome = String(req.body?.nome || est.nome).trim().slice(0, 60) || est.nome;
  const p = { id: antigo?.id || crypto.randomUUID(), estruturaId: est.id, nome, ...dados, arquivo: img.arquivo, arquivoHash: img.hash, versao: (antigo?.versao || 0) + 1, criado: antigo?.criado || agora, atualizado: agora };
  gravar(uid, p);
  if (antigo && antigo.arquivoHash !== img.hash) liberarImagem(uid, antigo.arquivoHash, p.id);
  gravarEstrutura(uid, { ...est, prefab: { id: p.id, versao: p.versao } });
  res.status(antigo ? 200 : 201).json(p);
});

router.delete('/:id', async (req, res) => {
  const uid = req.user.id; const p = lerPrefab(uid, req.params.id);
  if (!p) return res.status(404).json({ error: 'Prefab não encontrado' });
  // em uso num mapa: não apaga (o mapa ficaria com uma peça sem imagem)
  const { mapasQueUsam } = await import('./mapas.js');
  const uso = mapasQueUsam(uid, `estruturas/${p.id}`);
  if (uso.length) return res.status(409).json({ error: `Este prefab está em uso em ${uso.length} mapa(s): ${uso.slice(0, 3).join(', ')}` });
  fs.rmSync(arquivoDe(uid, p.id), { force: true });
  liberarImagem(uid, p.arquivoHash, p.id);
  const est = lerEstrutura(uid, p.estruturaId); if (est && est.prefab?.id === p.id) { const { prefab, ...resto } = est; gravarEstrutura(uid, resto); }
  res.json({ ok: true });
});

export default router;
