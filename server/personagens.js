// PERSONAGENS SALVOS NA CONTA: lista de {nome, semente} guardada no próprio usuário (campo personagens).
// GET devolve a lista; PUT troca a lista inteira (máximo 40 itens, nome até 40 caracteres, semente inteira).
import express from 'express';
import { db, save } from './db.js';

const router = express.Router();
const LIMITE = 40;

router.get('/', (req, res) => {
  res.json({ personagens: req.user.personagens || [] });
});

// conjuntos de textura 3D (mesmos quadros do pixel, só a textura muda). Ainda não há conjuntos no projeto: a lista é vazia.
router.get('/texturas3d', (_req, res) => {
  res.json({ conjuntos: [] });
});

router.put('/', (req, res) => {
  const lista = req.body?.personagens;
  if (!Array.isArray(lista)) return res.status(400).json({ error: 'personagens precisa ser uma lista' });
  if (lista.length > LIMITE) return res.status(400).json({ error: `no máximo ${LIMITE} personagens` });
  const limpa = [];
  for (const p of lista) {
    const nome = String(p?.nome ?? '').trim().slice(0, 40);
    const semente = Number(p?.semente);
    if (!nome) return res.status(400).json({ error: 'todo personagem precisa de nome' });
    if (!Number.isInteger(semente) || semente < 0 || semente > 2 ** 32 - 1) return res.status(400).json({ error: 'semente inválida' });
    limpa.push({ nome, semente });
  }
  const u = db().users.find((x) => x.id === req.user.id);
  if (!u) return res.status(401).json({ error: 'Usuário não encontrado' });
  u.personagens = limpa;
  save();
  res.json({ personagens: limpa });
});

export default router;
