// provedores de IA: nenhum modelo aposentado nos nomes fixos (o Groq responde 404 para eles)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLOUD_PROVIDERS } from '../server/providers.js';

const APOSENTADOS = ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile'];
test('Groq: nomes fixos sem modelos aposentados (o resto vem da lista real do provedor)', () => {
  const g = CLOUD_PROVIDERS.groq;
  for (const m of [g.defaultModel, ...g.fallback]) assert.ok(!APOSENTADOS.includes(m), `modelo aposentado: ${m}`);
  assert.equal(g.defaultModel, 'openai/gpt-oss-120b');
});
