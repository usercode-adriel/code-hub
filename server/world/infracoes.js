// INFRAÇÕES CRIMINAIS (fase 2) — furto, vandalismo e invasão, todos pelo motor de ações (acoes.js).
// Cada uma tem condições (contra situações contraditórias: furtar quem não tem dinheiro, destruir o que já foi
// destruído, invadir porta que estaria liberada, agir estando detido) e consequências que usam os sistemas existentes:
// registerCrime (ficha + inquérito), addDebt (prejuízo) e patrimonio.js (estado do objeto e da porta).
// Denúncia: testemunhas NPCs decidem denunciar com probabilidade 1 − (1/2)^n (n = testemunhas); alarme denuncia sempre.
import { regra, executar, pessoaAtiva, naoDetido } from './acoes.js';
import { personById } from './agents.js';
import { addDebt } from './bank.js';
import { registerCrime } from './crimes.js';
import { furtarDinheiro, danificar, podeEntrar, portaDe, CATEGORIAS, getObj } from './patrimonio.js';

export const probDenuncia = (testemunhas) => 1 - Math.pow(0.5, Math.max(0, testemunhas));
const decide = (acao, prob) => { const r = typeof acao.rnd === 'function' ? acao.rnd() : Math.random(); return r < prob; };

// ---------------------------------------------------------------- FURTO (dinheiro de NPC, em loja ou na rua)
regra('furto', {
  titulo: 'Furto',
  condicoes: [
    naoDetido,
    function vitimaExiste(ctx, a) { return pessoaAtiva('vitima')(ctx, a); },
    function vitimaTemDinheiro(ctx, a) { return (personById(ctx.w, a.vitima)?.agent?.cash || 0) > 0; },
  ],
  consequencias: [
    function subtraiDinheiro(ctx, a) {
      const npc = personById(ctx.w, a.vitima); const r = furtarDinheiro(ctx, npc, a.valor || 150);
      return { tipo: 'dinheiro', ...r };
    },
    function denuncia(ctx, a) {
      const testemunhas = Math.max(0, a.testemunhas || 0);
      if (!decide(a, probDenuncia(testemunhas))) return { tipo: 'denuncia', feita: false, testemunhas };
      const c = registerCrime(ctx, { tipo: 'furto', suspeito: 'me', vitima: a.vitima, local: a.local || '', witnesses: testemunhas, desc: `Furto de dinheiro de ${personById(ctx.w, a.vitima)?.name || 'um morador'}.` });
      return { tipo: 'denuncia', feita: true, caso: c?.caseId || null };
    },
  ],
});

// ---------------------------------------------------------------- VANDALISMO (objeto destrutível de categoria)
regra('vandalismo', {
  titulo: 'Vandalismo',
  condicoes: [
    naoDetido,
    function objetoExiste(ctx, a) { return Boolean(getObj(ctx.w, a.objeto)); },
    function objetoNaoDestruido(ctx, a) { return getObj(ctx.w, a.objeto)?.estado !== 'destruido'; }, // não destrói o que já está destruído
    function categoriaDestrutivel(ctx, a) { return Boolean(CATEGORIAS[getObj(ctx.w, a.objeto)?.categoria]); },
  ],
  consequencias: [
    function danoEPrejuizo(ctx, a) {
      const r = danificar(ctx.w, a.objeto, a.dano || 40);
      let divida = null;
      if (r.prejuizo > 0) { const d = addDebt(ctx.w, { kind: 'multa', amount: r.prejuizo, desc: `Dano ao patrimônio: ${getObj(ctx.w, a.objeto).categoria}`, dueDays: 5, creditor: 'Prefeitura de Nexus City', at: ctx.at }); divida = { id: d.id, valor: r.prejuizo }; }
      return { tipo: 'dano', estado: r.estado, prejuizo: r.prejuizo, divida };
    },
    function denuncia(ctx, a) {
      const testemunhas = Math.max(0, a.testemunhas || 0);
      if (!decide(a, probDenuncia(testemunhas))) return { tipo: 'denuncia', feita: false };
      const c = registerCrime(ctx, { tipo: 'vandalismo', suspeito: 'me', local: a.local || '', witnesses: testemunhas, desc: `Vandalismo: ${getObj(ctx.w, a.objeto)?.categoria} danificado.` });
      return { tipo: 'denuncia', feita: true, caso: c?.caseId || null };
    },
  ],
});

// ---------------------------------------------------------------- INVASÃO (entrar onde a porta não permite)
regra('invasao', {
  titulo: 'Invasão de propriedade',
  condicoes: [
    naoDetido,
    function portaExiste(ctx, a) { return Boolean(portaDe(ctx.w, a.porta)); },
    // só é invasão se o acesso é negado: entrar em porta aberta/permitida não é crime
    function acessoNegado(ctx, a) { return !podeEntrar(ctx.w, a.porta, { id: 'me', chave: Boolean(a.chave) }).ok; },
  ],
  consequencias: [
    function denuncia(ctx, a) {
      const p = portaDe(ctx.w, a.porta); const testemunhas = Math.max(0, a.testemunhas || 0);
      const alarme = Boolean(p.alarme); // alarme: o sistema avisa a polícia
      if (!alarme && !decide(a, probDenuncia(testemunhas))) return { tipo: 'denuncia', feita: false, alarme: false };
      const c = registerCrime(ctx, { tipo: 'invasao', suspeito: 'me', local: a.local || '', witnesses: testemunhas, desc: `Invasão: porta ${p.id} (${p.estado}) forçada${alarme ? ' com alarme disparado' : ''}.` });
      return { tipo: 'denuncia', feita: true, alarme, caso: c?.caseId || null };
    },
  ],
});

// executa uma infração pela porta de entrada única (usada pela rota HTTP e pelos testes)
export function infracao(ctx, body) {
  const tipo = String(body?.tipo || '');
  if (!['furto', 'vandalismo', 'invasao'].includes(tipo)) throw new Error('Infração desconhecida');
  return executar(ctx, { ...body, tipo });
}
