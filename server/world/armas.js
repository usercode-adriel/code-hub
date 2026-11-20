// ARMAS (fase 4, parte servidor) — um disparo é uma ação do motor (acoes.js) com as regras do tiro:
//  • quem atira (o jogador) precisa ter a arma no inventário real (comprada no submundo, underworld.js);
//  • não atira em quem já está morto nem estando detido (contradições barradas pelo motor);
//  • acertou: o ferimento é aplicado pelo sistema de ferimentos (injuries.js), com a gravidade da arma;
//  • testemunhas: o disparo em via pública é ouvido — denúncia com probabilidade maior que a de um furto;
//  • morte: vira homicídio na ficha, e o morador deixa de existir na rotina (status de morto, eventos persistentes).
// O policial usa a mesma regra (ator 'policia'): sem arma no inventário, sem ficha — o tiro dele é registro de ocorrência.
// Munição e recarga ficam no cliente (mira.js); o servidor confere posse, alvo e consequências.
import { regra, executar, pessoaAtiva, naoDetido } from './acoes.js';
import { personById, bumpUser } from './agents.js';
import { account } from './bank.js';
import { registerCrime } from './crimes.js';
import { injure } from './injuries.js';
import { probDenuncia } from './infracoes.js';
import { WEAPONS } from './underworld.js';

const decide = (a, p) => { const r = typeof a.rnd === 'function' ? a.rnd() : Math.random(); return r < p; };
// dano por arma e gravidade do ferimento (o motor de ferimentos decide o resto)
export const DANO = { 'w-pistol': 30, 'w-revolver': 36, 'w-uzi': 22, 'w-smg': 24, 'w-shotgun': 45, 'w-ak': 40, 'w-m4': 40, 'w-sniper': 90, 'w-rifle-scope': 80 };
export const gravidadeDe = (dano, letal = false) => (letal ? 'morte' : dano >= 40 ? 'grave' : dano >= 25 ? 'moderada' : 'leve');

regra('tiro', {
  titulo: 'Disparo de arma de fogo',
  repetivel: true,
  condicoes: [
    naoDetido,
    function armaNaPosse(ctx, a) {
      if (a.ator !== 'me') return true; // policial: arma da corporação, não passa pelo inventário do jogador
      return (account(ctx.w).inventory || []).some((it) => it.key === a.arma && WEAPONS[a.arma]);
    },
    function alvoVivo(ctx, a) { return a.vitima ? pessoaAtiva('vitima')(ctx, a) : true; }, // tiro para o ar também existe
  ],
  consequencias: [
    function ferimento(ctx, a) {
      if (!a.acertou || !a.vitima) return { tipo: 'ferimento', acertou: false };
      const p = personById(ctx.w, a.vitima); const sev = gravidadeDe(Number(a.dano) || DANO[a.arma] || 30, a.letal);
      const r = injure(ctx, p, { causa: 'tiro', local: a.local || '', sev });
      bumpUser(ctx, p, sev === 'morte' ? -40 : -25, { trust: -25, note: 'Atirou em mim.' });
      return { tipo: 'ferimento', acertou: true, gravidade: sev, estado: r?.state || null };
    },
    function denuncia(ctx, a) {
      if (a.ator !== 'me') return null;
      const testemunhas = Math.max(0, a.testemunhas || 0);
      // disparo é ouvido por quem está perto: chance mínima de 60% mesmo sem testemunha que veja
      const p = Math.max(0.6, probDenuncia(testemunhas));
      if (!decide(a, p)) return { tipo: 'denuncia', feita: false };
      const letal = a.letal && a.vitima; const tipo = letal ? 'homicidio' : 'disparo';
      const c = registerCrime(ctx, { tipo, suspeito: 'me', vitima: a.vitima || null, local: a.local || '', witnesses: testemunhas, desc: letal ? `Homicídio com arma de fogo em ${a.local || 'via pública'}.` : `Disparo de arma de fogo em ${a.local || 'via pública'}.` });
      return { tipo: 'denuncia', feita: true, crime: tipo, caso: c?.caseId || null };
    },
  ],
});

// rota: o jogador atirou (acertou ou não), com a arma e o alvo escolhidos pela mira automática
export function disparar(ctx, body) {
  const arma = String(body?.arma || '');
  if (!WEAPONS[arma]) throw new Error('Arma desconhecida');
  return executar(ctx, {
    tipo: 'tiro', ator: body.ator === 'policia' ? 'policia' : 'me', arma, vitima: body.alvo ? String(body.alvo) : null,
    acertou: Boolean(body.acertou), dano: Number(body.dano) || DANO[arma] || 30, letal: Boolean(body.letal),
    testemunhas: Math.max(0, Math.min(20, Number(body.testemunhas) || 0)), local: String(body.local || '').slice(0, 60), rnd: body.rnd,
    repetivel: true,
  });
}
