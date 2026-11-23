// STRUCTURE STUDIO: rotas. O armazenamento e a validação das estruturas ficam em estudio-dados.js; este módulo só monta as rotas
// e as sub-rotas (biblioteca de componentes, prefabs e IA). Reexporta o que os testes usam.
import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { PRESETS, GRADE } from '../public/js/estudio/presets.js';
import { arquivoDe, gravar, lerEstrutura, listarEstruturas, validarEstrutura, resumoEstrutura as resumo } from './estudio-dados.js';
import biblioteca from './estudio-biblioteca.js';
import prefabs from './estudio-prefabs.js';
import ia from './estudio-ia.js';

export { validarEstrutura, validarInstancias, lerEstrutura, listarEstruturas, gravarEstrutura, idValido } from './estudio-dados.js';
const router = express.Router();

router.use('/componentes', biblioteca);
router.use('/prefabs', prefabs);
router.use('/ia', ia);

router.get('/presets', (_req, res) => res.json({ presets: PRESETS, grade: GRADE }));

router.get('/estruturas', (req, res) => {
  res.json({ estruturas: listarEstruturas(req.user.id).sort((a, b) => String(b.atualizado).localeCompare(String(a.atualizado))).map(resumo) });
});

router.post('/estruturas', (req, res) => {
  const nome = String(req.body?.nome ?? '').trim().slice(0, 60) || 'Nova estrutura';
  let dados;
  try { dados = validarEstrutura({ preset: req.body?.preset, tipo: req.body?.tipo, area: req.body?.area, componentes: [] }, null, req.user.id); } catch (err) { return res.status(400).json({ error: err.message }); }
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
  try { dados = validarEstrutura(req.body || {}, base, req.user.id); } catch (err) { return res.status(400).json({ error: err.message }); }
  const e = { ...base, ...dados, nome: String(req.body?.nome ?? base.nome).trim().slice(0, 60) || base.nome, atualizado: new Date().toISOString() };
  gravar(req.user.id, e);
  res.json(e);
});

// duplicar uma estrutura; com variacao:true marca de qual ela deriva (para criar versões de um mesmo projeto)
router.post('/estruturas/:id/duplicar', (req, res) => {
  const base = lerEstrutura(req.user.id, req.params.id);
  if (!base) return res.status(404).json({ error: 'Estrutura não encontrada' });
  const variacao = req.body?.variacao === true;
  const { prefab, ...resto } = base; // o prefab é da original: a cópia gera o seu quando for salva
  const agora = new Date().toISOString();
  const nome = String(req.body?.nome || `${base.nome} ${variacao ? '(variação)' : '(cópia)'}`).trim().slice(0, 60);
  const e = { ...resto, id: crypto.randomUUID(), nome, versao: 1, ...(variacao ? { variacaoDe: base.variacaoDe || base.id } : {}), criado: agora, atualizado: agora };
  gravar(req.user.id, e);
  res.status(201).json(e);
});

router.delete('/estruturas/:id', (req, res) => {
  if (!lerEstrutura(req.user.id, req.params.id)) return res.status(404).json({ error: 'Estrutura não encontrada' });
  fs.rmSync(arquivoDe(req.user.id, req.params.id), { force: true });
  res.json({ ok: true });
});

export default router;
