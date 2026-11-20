// MOTOR CENTRAL DE AÇÕES (fase 1) — uma ação do jogador ou de um NPC passa por um único caminho:
//   ação iniciada → condições verificadas → evento registrado → reações → consequências → histórico.
// Cada tipo de ação é uma REGRA: uma lista de condições (funções que devolvem verdadeiro/falso) e uma lista de
// consequências (funções que usam os sistemas que já existem: registerCrime/openCase, record, bumpUser, injure…).
// O motor impede duplicatas (mesma ação, mesmos envolvidos, dentro da janela) e registra por que uma ação foi recusada.
// Não substitui os fluxos antigos (atropelamento, roubo de carro, blitz): eles seguem como estão; as regras novas
// (furto, vandalismo, invasão, tiro) usam o motor desde o início.
import { record } from './core.js';
import { personById } from './agents.js';
import { detentionOf } from './blitz.js';

export const DEDUPE_MS = 20000; // mesma ação com os mesmos envolvidos dentro de 20 s de jogo = duplicata
export const REGRAS = new Map();

// registra um tipo de ação: condicoes (ctx, acao) → boolean; consequencias (ctx, acao, evento) → resumo | null
export function regra(tipo, { titulo = tipo, condicoes = [], consequencias = [], cat = 'seguranca', importancia = 2 } = {}) {
  REGRAS.set(tipo, { titulo, condicoes, consequencias, cat, importancia });
}

// a chave inclui o alvo (vítima, objeto ou porta): ações sobre alvos diferentes nunca são duplicatas
const chave = (a) => [a.tipo, a.ator || '', a.vitima || '', a.objeto || '', a.porta || '', a.local || ''].join('|');

// executa uma ação; devolve { ok, motivo?, condicoes, evento, consequencias } — nunca lança por condição recusada
export function executar(ctx, acao) {
  const R = REGRAS.get(acao.tipo);
  if (!R) return { ok: false, motivo: 'tipo-desconhecido', condicoes: [] };
  const w = ctx.w; w.acoesRecentes ??= {};
  const agora = ctx.at.getTime();
  // 1) impedir eventos duplicados
  // cada tiro é um evento próprio (repetivel): só ações de natureza única (furto, invasão…) são deduplicadas
  const k = chave(acao); const ultima = w.acoesRecentes[k];
  if (!acao.repetivel && ultima != null && agora - ultima < DEDUPE_MS) return { ok: false, motivo: 'duplicada', condicoes: [] };
  for (const [kk, t] of Object.entries(w.acoesRecentes)) if (agora - t > DEDUPE_MS * 3) delete w.acoesRecentes[kk];
  // 2) condições (todas precisam ser verdadeiras; as verificadas ficam no retorno para auditoria)
  const verificadas = [];
  for (const c of R.condicoes) {
    let ok = false; try { ok = Boolean(c(ctx, acao)); } catch { ok = false; }
    verificadas.push({ nome: c.name || 'condicao', ok });
    if (!ok) return { ok: false, motivo: 'condicao', condicoes: verificadas };
  }
  w.acoesRecentes[k] = agora;
  // 3) evento registrado (histórico da cidade)
  const ev = record(ctx, {
    type: `acao-${acao.tipo}`, cat: acao.cat || R.cat, title: acao.titulo || R.titulo, text: acao.texto || '',
    actors: [acao.ator, acao.vitima].filter((x) => x && x !== 'me'), importance: acao.importancia || R.importancia,
    data: { acao: acao.tipo, local: acao.local || null, circ: acao.circ || {} },
  });
  // 4) reações e consequências (cada uma devolve um resumo do que aplicou)
  const consequencias = [];
  for (const f of R.consequencias) {
    try { const r = f(ctx, acao, ev); if (r) consequencias.push(r); } catch (err) { consequencias.push({ erro: err.message }); }
  }
  return { ok: true, evento: ev.id, condicoes: verificadas, consequencias };
}

// condições reutilizáveis
export const pessoaAtiva = (campo) => (ctx, a) => { const p = personById(ctx.w, a[campo]); return Boolean(p?.agent && p.agent.status === 'ativo' && p.agent.health?.state !== 'morto'); };
// quem está detido (cela ou delegacia) não pratica nova ação: evita condições contraditórias
export const naoDetido = (ctx) => !detentionOf(ctx.w);
