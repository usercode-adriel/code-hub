// IA das personagens do Cripcoin Office, em cadeia (a primeira que existir):
//   1) a IA na nuvem configurada no Hub (Gemini / Groq / OpenRouter — todas têm plano gratuito com chave);
//   2) Ollama rodando no próprio computador (gratuito e offline);
//   3) Pollinations (text.pollinations.ai): serviço público GRATUITO e sem chave — pode ser desligado com CRIPCOIN_IA_GRATIS=0.
// Sem nenhuma delas: erro com `semIA` (o jogo mostra aviso; nada é inventado).
import { aiConfig, effectiveModel, gerarTexto, hasCloud, ollamaState } from './assistant.js';

const gratisLigado = () => process.env.CRIPCOIN_IA_GRATIS !== '0';
const ollamaPronto = () => ollamaState.running && Boolean(effectiveModel());
export function fonteIA() { return hasCloud() ? 'nuvem' : ollamaPronto() ? 'ollama' : gratisLigado() ? 'gratis' : 'nenhuma'; }

async function viaOllama({ system, prompt, maxTokens, temperature }) {
  const res = await fetch(`${aiConfig().ollamaUrl}/api/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(60000),
    body: JSON.stringify({ model: effectiveModel(), stream: false, keep_alive: '10m', options: { temperature, num_predict: maxTokens }, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }] }),
  });
  if (!res.ok) throw new Error(`Ollama respondeu ${res.status}`);
  const j = await res.json(); return String(j.message?.content || '').trim();
}
async function viaGratis({ system, prompt, maxTokens, temperature }) {
  const res = await fetch('https://text.pollinations.ai/openai', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(30000),
    body: JSON.stringify({ model: 'openai', private: true, temperature, max_tokens: maxTokens, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }] }),
  });
  if (!res.ok) throw new Error(`IA gratuita respondeu ${res.status}${res.status === 429 ? ' (muitas mensagens seguidas; espere alguns segundos)' : ''}`);
  const j = await res.json().catch(() => null); const t = j?.choices?.[0]?.message?.content; if (!t) throw new Error('A IA gratuita não devolveu texto.'); return String(t).trim();
}
/** Gera um texto curto com a melhor IA disponível. */
export async function gerarFala({ system, prompt, maxTokens = 140, temperature = 0.9 }) {
  const f = fonteIA();
  if (f === 'nuvem') return gerarTexto({ system, prompt, maxTokens, temperature });
  if (f === 'ollama') return viaOllama({ system, prompt, maxTokens, temperature });
  if (f === 'gratis') return viaGratis({ system, prompt, maxTokens, temperature });
  throw Object.assign(new Error('Nenhuma IA disponível. Conecte Gemini, Groq ou OpenRouter (gratuitos) em Configurações → Assistente, instale o Ollama, ou ligue a IA gratuita (CRIPCOIN_IA_GRATIS).'), { status: 409, semIA: true });
}
