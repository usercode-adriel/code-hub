// SOCIEDADE — o usuário é um cidadão comum e anônimo. Nenhuma pessoa da cidade o conhece de início,
// e o acesso a sistemas sensíveis (polícia, justiça interna, dados de empresas) depende de autoridade/profissão.
// As autoridades são liberadas por diploma + cargo: Direito → polícia ou ministério; Economia → investidor;
// Administração → empresa; Administração + Economia → banco próprio; Segurança da Informação → unidade cibernética.
import { onUpgrade, record } from './core.js';
import { account } from './bank.js';
import { people } from './agents.js';

// quais diplomas habilitam cada caminho profissional
export const PROFESSIONS = {
  policia: { label: 'Autoridade policial', needs: ['Direito'], via: 'Concurso da Polícia de Nexus City', grants: ['policia'] },
  ciber: { label: 'Perito em crimes cibernéticos', needs: ['Segurança da Informação'], via: 'Unidade de Crimes Cibernéticos', grants: ['policia', 'ciber'] },
  ministro: { label: 'Ministro(a) de Estado', needs: ['Direito'], via: 'Indicação do Governo', grants: ['ministro'] },
  investidor: { label: 'Investidor(a) credenciado', needs: ['Economia'], via: 'Registro na Bolsa Nexus', grants: ['investidor'] },
  empresario: { label: 'Empresário(a)', needs: ['Administração'], via: 'Junta Comercial', grants: ['empresario'] },
  banqueiro: { label: 'Banqueiro(a)', needs: ['Administração', 'Economia'], via: 'Licença do Banco Central Nexus', grants: ['empresario', 'investidor', 'banqueiro'] },
};

export function society(w) {
  const u = account(w);
  u.authorities ??= [];
  u.citizen ??= { since: w.core?.genesisAt || null, anonymous: true };
  return u;
}
export const hasAuthority = (w, key) => society(w).authorities.includes(key);
export function grantAuthority(w, key) {
  const u = society(w);
  if (!u.authorities.includes(key)) u.authorities.push(key);
}
// diplomas que o usuário tem habilitam profissões; retorna as que ele PODE assumir e as que já assumiu
export function professionsFor(w) {
  const u = account(w); const dip = u.diplomas || [];
  return Object.entries(PROFESSIONS).map(([key, p]) => ({
    key, ...p,
    eligible: p.needs.every((d) => dip.includes(d)),
    active: p.grants.every((g) => u.authorities.includes(g)),
    missing: p.needs.filter((d) => !dip.includes(d)),
  }));
}

// Esquecimento social: ao entrar na Sociedade, o usuário vira um desconhecido para o mundo.
// Mantém os amigos do chat (botId), mas zera a relação que o mundo em geral tinha com ele.
onUpgrade(7, (ctx) => {
  const w = ctx.w; const u = society(w);
  for (const p of people(w)) {
    if (!p.agent?.user) continue;
    if (p.botId) continue; // amigos do chat que você escolheu continuam te conhecendo
    p.agent.user = { aff: 0, trust: 50, lastContact: null, metAt: null, notes: [], lastMiss: null, lastCall: null };
  }
  u.authorities = [];
  u.fame = Math.min(u.fame || 0, 5);
  record(ctx, { type: 'cidadao', cat: 'pessoal', title: 'Você entra na Sociedade como cidadão comum', text: 'Ninguém na cidade te conhece ainda. O que a polícia, a justiça e as empresas fazem é sigiloso: você só acompanha pelo noticiário. Estude e construa seu nome.', actors: ['me'], importance: 2 });
});
