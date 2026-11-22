// EXPORTAÇÃO PARA O GODOT (protótipo): a cidade gerada pelo mesmo gerador do navegador (public/js/drive/mundo.js),
// em JSON compacto: vias, construções e pontos de interesse. Só o que o cliente de desenho precisa.
import express from 'express';
import { generateCity } from '../public/js/drive/mundo.js';

const router = express.Router();
let cache = null;

function exportar() {
  if (cache) return cache;
  const c = generateCity();
  const arred = (v) => Math.round(v * 10) / 10;
  cache = {
    versao: 1,
    mundo: { largura: c.W, altura: c.H },
    vias: c.lines.filter((l) => !l.out).map((l) => ({ w: l.w, pts: [arred(l.pts[0][0]), arred(l.pts[0][1]), arred(l.pts[1][0]), arred(l.pts[1][1])] })),
    construcoes: c.blds.filter((b) => b.spr && b.spr.startsWith('m:')).map((b) => ({ sprite: b.spr.slice(2), x: arred(b.x), y: arred(b.y), w: arred(b.w), h: arred(b.h) })),
    pontos: c.pois.map((p) => ({ id: p.id, nome: p.label, x: p.at[0], y: p.at[1] })),
    inicio: c.pois.find((p) => p.id === 'praca') ? { x: c.pois.find((p) => p.id === 'praca').at[0], y: c.pois.find((p) => p.id === 'praca').at[1] + 40 } : { x: c.W / 2, y: c.H / 2 },
  };
  return cache;
}

router.get('/cidade', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Não autenticado' });
  res.json(exportar());
});

export default router;
