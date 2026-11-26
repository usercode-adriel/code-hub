// Servidor do Cripcoin Office: só o que o navegador não pode fazer sozinho — pesquisa REAL na web e leitura de páginas públicas.
// (O jogo em si roda no navegador e salva no localStorage.) Resultados vêm de Google/DuckDuckGo via server/webtools.js; nada é inventado.
import express from 'express';
import { searchWeb, fetchPageText } from './webtools.js';

const router = express.Router();
router.get('/pesquisar', async (req, res) => {
  try {
    const r = await searchWeb(String(req.query.q || ''));
    res.json({ fonte: r.fonte, resumo: r.resumo || '', resultados: (r.resultados || []).slice(0, 10) });
  } catch (err) { res.status(502).json({ error: err.message }); }
});
router.get('/pagina', async (req, res) => {
  try {
    const url = String(req.query.url || '');
    if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'Endereço inválido: use http:// ou https://' });
    res.json(await fetchPageText(url, 12000));
  } catch (err) { res.status(502).json({ error: err.message }); }
});
export default router;
