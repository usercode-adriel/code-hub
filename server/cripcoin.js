// Servidor do Cripcoin Office: só o que o navegador não pode fazer sozinho — pesquisa REAL na web e leitura de páginas públicas.
// (O jogo em si roda no navegador e salva no localStorage.) Resultados vêm de Google/DuckDuckGo via server/webtools.js; nada é inventado.
import express from 'express';
import { searchWeb, fetchPageText } from './webtools.js';
import { gerarFala, fonteIA } from './cripcoin-ia.js';
import { montarPrompt, limparResposta, montarPromptEquipe, lerDialogo } from './cripcoin-conversa.js';

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
// Conversa com as personagens: gera a fala com a IA configurada no Hub (Gemini/Groq/OpenRouter). Sem IA => 409 com `semIA` (nada é inventado).
router.post('/conversar', async (req, res) => {
  try {
    const { system, prompt } = montarPrompt(req.body || {});
    const texto = limparResposta(await gerarFala({ system, prompt, maxTokens: 120, temperature: 0.9 }), String((req.body?.funcionario || {}).nome || ''));
    if (!texto) return res.status(502).json({ error: 'A IA não devolveu texto.' });
    res.json({ texto });
  } catch (err) { res.status(err.status === 409 ? 409 : err.status && err.status < 600 ? err.status : 502).json({ error: err.message, semIA: Boolean(err.semIA) }); }
});
// Conversa espontânea ENTRE as personagens (dá vida ao escritório). Devolve 2 a 4 falas curtas.
router.post('/conversa-equipe', async (req, res) => {
  try {
    const { system, prompt, nomes } = montarPromptEquipe(req.body || {});
    const falas = lerDialogo(await gerarFala({ system, prompt, maxTokens: 220, temperature: 1 }), nomes);
    if (falas.length < 1) return res.status(502).json({ error: 'A IA não devolveu um diálogo válido.' });
    res.json({ falas });
  } catch (err) { res.status(err.status && err.status < 600 ? err.status : 502).json({ error: err.message, semIA: Boolean(err.semIA) }); }
});
router.get('/ia', (_req, res) => res.json({ fonte: fonteIA() }));
export default router;
