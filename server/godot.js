// EXPORTAÇÃO PARA O GODOT (protótipo): o mapa marcado em "Vida" do usuário, convertido pelo mesmo conversor do jogo,
// em JSON compacto: vias, construções e pontos de interesse.
import express from 'express';
import { mundoDoMapa } from '../public/js/mapas/mundo-do-mapa.js';
import { mapaAtivoDoUsuario, inventarioServidor } from './mapas.js';

const router = express.Router();
function exportar(uid) {
  const mapa = mapaAtivoDoUsuario(uid) || { nome: 'Mapa vazio', largura: 40, altura: 30, celulas: {}, itens: [] };
  const c = mundoDoMapa(mapa, inventarioServidor(uid));
  const arred = (v) => Math.round(v * 10) / 10;
  return {
    versao: 1,
    mundo: { largura: c.W, altura: c.H },
    vias: c.lines.filter((l) => !l.out).map((l) => ({ w: l.w, pts: [arred(l.pts[0][0]), arred(l.pts[0][1]), arred(l.pts[1][0]), arred(l.pts[1][1])] })),
    construcoes: c.blds.filter((b) => b.spr && b.spr.startsWith('m:')).map((b) => ({ sprite: b.spr.slice(2), x: arred(b.x), y: arred(b.y), w: arred(b.w), h: arred(b.h) })),
    pontos: c.pois.map((p) => ({ id: p.id, nome: p.label, x: p.at[0], y: p.at[1] })),
    inicio: { x: c.W / 2, y: c.H / 2 },
  };
}

router.get('/cidade', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Não autenticado' });
  res.json(exportar(req.user.id));
});

export default router;
