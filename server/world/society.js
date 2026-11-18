// SOCIEDADE — o usuário é um cidadão comum e anônimo. Nenhuma pessoa da cidade o conhece de início,
// e o acesso a sistemas sensíveis (polícia, justiça interna, dados de empresas) depende de autoridade/profissão.
// As autoridades são liberadas por diploma + cargo: Direito → polícia ou ministério; Economia → investidor;
// Administração → empresa; Administração + Economia → banco próprio; Segurança da Informação → unidade cibernética.
import { onUpgrade, record } from './core.js';
import { account, debit, addXp, BankError } from './bank.js';
import { people, personById, residents, userName } from './agents.js';
import { pick, clamp } from './util.js';
import { notify } from '../notify.js';

// quais diplomas habilitam cada caminho profissional
export const PROFESSIONS = {
  policia: { label: 'Autoridade policial', needs: ['Direito'], via: 'Concurso da Polícia de Nexus City', grants: ['policia'] },
  ciber: { label: 'Perito em crimes cibernéticos', needs: ['Segurança da Informação'], via: 'Unidade de Crimes Cibernéticos', grants: ['policia', 'ciber'] },
  ministro: { label: 'Ministro(a) de Estado', needs: ['Direito'], via: 'Indicação do Governo', grants: ['ministro'] },
  investidor: { label: 'Investidor(a) credenciado', needs: ['Economia'], via: 'Registro na Bolsa Nexus', grants: ['investidor'] },
  empresario: { label: 'Empresário(a)', needs: ['Administração'], via: 'Junta Comercial', grants: ['empresario'] },
  banqueiro: { label: 'Banqueiro(a)', needs: ['Administração', 'Economia'], via: 'Licença do Banco Central Nexus', grants: ['empresario', 'investidor', 'banqueiro'] },
};

// ---------------------------------------------------------------- universidade: cursos de 3 dias
// Cada curso tem 3 mini-apostilas (uma por dia). A de Segurança da Informação é só defensiva.
export const COURSE_INFO = {
  Direito: { icon: 'scale', about: 'As leis da cidade, o processo e a ética. Habilita a carreira pública: polícia ou ministério.',
    lessons: [
      ['Fontes do Direito em Nexus City', 'A cidade é regida por leis aprovadas pelo governo. Toda pena precisa de previsão legal e de provas: ninguém é punido por suspeita. Você estuda a hierarquia entre a Constituição municipal, as leis e os decretos.'],
      ['Processo e devido procedimento', 'Um caso nasce de uma ocorrência, passa por investigação, citação e julgamento. O acusado tem direito a se defender, confessar ou ficar em silêncio. A força das provas decide o resultado.'],
      ['Ética e função pública', 'Policiais e ministros servem à sociedade, não a si mesmos. Conflito de interesse, abuso e corrupção têm consequências. Com este diploma você pode prestar concurso na polícia ou aceitar indicação para um ministério.']],
  },
  Administração: { icon: 'briefcase', about: 'Gestão, finanças e pessoas. Habilita a abrir a sua própria empresa.',
    lessons: [
      ['Planejamento e recursos', 'Toda empresa começa com capital, um objetivo e um mercado. Você aprende a dimensionar custos, caixa e equipe antes de abrir as portas — abrir sem recursos leva à falência.'],
      ['Pessoas e operação', 'Contratar, treinar e reter talento define o resultado. Uma equipe maior produz mais, mas custa salários. O equilíbrio entre folha e receita é o coração da gestão.'],
      ['Estratégia e concorrência', 'Preço, reputação e marketing disputam o cliente. Com este diploma você se registra na Junta Comercial e pode fundar empresas na cidade.']],
  },
  Economia: { icon: 'trending', about: 'Mercados, juros e investimentos. Habilita a investir na Bolsa Nexus.',
    lessons: [
      ['Como a economia circula', 'O dinheiro da cidade é finito e passa de mão em mão: salários, compras, impostos e lucros. Nada surge do nada. Entender esse fluxo é a base para investir.'],
      ['Risco e retorno', 'Ações sobem e descem com o lucro e o caixa das empresas. Diversificar reduz o risco; concentrar amplia ganhos e perdas. Dividendos premiam quem investe em empresas lucrativas.'],
      ['Juros e crédito', 'A taxa básica move empréstimos e investimentos. Com este diploma você se credencia na Bolsa Nexus e pode montar sua carteira.']],
  },
  'Segurança da Informação': { icon: 'shield', about: 'Defesa de sistemas e dados. Habilita a perícia em crimes cibernéticos (lado da polícia).',
    lessons: [
      ['Princípios de defesa', 'Confidencialidade, integridade e disponibilidade protegem qualquer sistema. Você aprende a reconhecer o que precisa ser protegido: contas, bancos, dados pessoais e serviços públicos.'],
      ['Boas práticas e resposta', 'Senhas fortes, verificação em duas etapas, backups e monitoramento previnem a maioria dos incidentes. Quando um ataque acontece, a resposta rápida limita o dano.'],
      ['Perícia e lei', 'O perito ajuda a polícia a investigar crimes cibernéticos com provas técnicas, sempre dentro da lei. Com este diploma você pode integrar a Unidade de Crimes Cibernéticos.']],
  },
  Programação: { icon: 'cpu', about: 'Desenvolvimento de software. Abre vagas de tecnologia.',
    lessons: [['Lógica e algoritmos', 'A base de todo sistema é decompor um problema em passos claros.'], ['Código limpo', 'Nomes claros e funções pequenas fazem o software durar.'], ['Projetos reais', 'Versionar, testar e entregar: o diploma abre vagas de desenvolvedor.']] },
  'Ciência de dados': { icon: 'activity', about: 'Dados e estatística. Abre vagas de análise.',
    lessons: [['Dados', 'Coletar, limpar e organizar vem antes de qualquer gráfico.'], ['Estatística', 'Média, variância e correlação revelam padrões.'], ['Decisão', 'Transformar dados em decisão é o trabalho do analista.']] },
  Jornalismo: { icon: 'news', about: 'Apuração e escrita. Abre vagas de mídia.',
    lessons: [['Apuração', 'Confirmar o fato com fontes antes de publicar.'], ['Texto', 'Manchete, lide e contexto guiam o leitor.'], ['Ética', 'Distinguir fato, rumor e opinião é dever do jornalista.']] },
  Medicina: { icon: 'heart', about: 'Saúde e cuidado. Abre vagas na área da saúde.',
    lessons: [['Corpo humano', 'Entender o normal para reconhecer a doença.'], ['Diagnóstico', 'Ouvir, examinar e investigar com método.'], ['Cuidado', 'Tratar a pessoa, não só o sintoma.']] },
};
export function courseLessons(courseName) {
  const info = COURSE_INFO[courseName];
  const base = info ? info.lessons : [['Dia 1', 'Conteúdo do curso.'], ['Dia 2', 'Conteúdo do curso.'], ['Dia 3', 'Conteúdo do curso.']];
  return base.slice(0, 3).map(([title, text], i) => ({ day: i + 1, title, text, read: false, lecture: null }));
}
// uma palestra de um personagem já formado pode cair em um dos dias
export function maybeLecture(ctx, lessons, courseName) {
  const w = ctx.w;
  const experts = residents(w).filter((p) => (p.agent?.diplomas || []).includes(courseName));
  if (!experts.length || Math.random() > 0.5) return lessons;
  const sp = pick(experts); const day = 1 + Math.floor(Math.random() * 3);
  lessons[day - 1].lecture = { id: sp.id, name: sp.name, avatar: sp.avatar, color: sp.color, role: sp.agent?.role || 'especialista' };
  return lessons;
}
export function readLesson(ctx, day) {
  const u = account(ctx.w);
  if (!u.studying?.lessons) throw new BankError('Você não está estudando agora.');
  const l = u.studying.lessons.find((x) => x.day === Number(day));
  if (!l) throw new BankError('Aula não encontrada.');
  if (!l.read) { l.read = true; addXp(ctx.w, 6); }
  return u.studying;
}

// assumir uma profissão depois de formado: libera a autoridade correspondente
export function claimProfession(ctx, key) {
  const w = ctx.w; const u = society(w);
  const prof = PROFESSIONS[key];
  if (!prof) throw new BankError('Profissão desconhecida.');
  const dip = u.diplomas || [];
  const missing = prof.needs.filter((d) => !dip.includes(d));
  if (missing.length) throw new BankError(`Você precisa do diploma de ${missing.join(' e ')} para isso.`);
  if (prof.grants.every((g) => u.authorities.includes(g))) throw new BankError('Você já exerce essa profissão.');
  for (const g of prof.grants) grantAuthority(w, g);
  u.profession = key;
  u.reputation = clamp((u.reputation || 50) + 4, 0, 100);
  record(ctx, { type: 'profissao', cat: 'pessoal', title: `Você agora é ${prof.label.toLowerCase()}`, text: `Habilitado(a) pela ${prof.via}.`, actors: ['me'], importance: 3 });
  notify(ctx.uid, { type: 'system', title: `✅ ${prof.label}`, message: `Você foi habilitado(a) pela ${prof.via}.`, link: '#/empresas/carreira' });
  return professionsFor(w);
}

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
