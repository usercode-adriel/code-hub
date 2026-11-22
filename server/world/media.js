// MEDIA ENGINE + INTERNET — notícias, sites, blogs, comunidades, TV, rádio, cinema e celebridades.
// Nada aqui é inventado solto: toda notícia nasce de um acontecimento registrado (eventIds), tem autor
// (um jornalista da cidade, empregado do veículo) e contexto da mesma história (storyId). A IA, quando há cota,
// reescreve a matéria no estilo do jornalista; sem IA, o texto é montado a partir dos fatos.
import { onHourly, onDaily, onEvent, onTick, onGenesis, handle, record, schedule, aiTake } from './core.js';
import { registerAction, people, residents, personById, bump, active } from './agents.js';
import { companies, companyById, SECTORS } from './economy.js';
import { worldPost, remember, genderize } from '../social.js';
import { geminiJSON } from '../assistant.js';
import { rnd, pick, chance, clamp, uid, DAY, gauss, cap, shuffle, str, fold, slug } from './util.js';
import { logger } from '../log.js';

const LIMIT = { articles: 700, threads: 60, comments: 50 };
// Qual veículo cobre cada assunto
const DESK = { politica: 'Mundo Agora', seguranca: 'Mundo Agora', local: 'Mundo Agora', sociedade: 'Mundo Agora', economia: 'CryptoDaily', tecnologia: 'TechVision', ciencia: 'TechVision', entretenimento: 'Grupo Nexus de Comunicação', celebridades: 'Grupo Nexus de Comunicação', esportes: 'Grupo Nexus de Comunicação', pessoal: 'Diário Urbano' };

export const articles = (w) => (w.articles ??= []);
const liveCo = (c) => c && c.status !== 'falida';

function outlet(w, cat) {
  const byName = (n) => companies(w).find((c) => c.name === n);
  const c = byName(DESK[cat] || 'Mundo Agora');
  if (liveCo(c)) return c;
  return companies(w).find((x) => x.sector === 'midia' && liveCo(x) && x.siteKind !== 'empregos') || null;
}
function journalistOf(w, c) {
  const staff = c.employees.map((e) => ({ e, p: personById(w, e.personaId) })).filter((x) => x.p);
  return (staff.find((x) => /jornal|editor|repórter|apresent/i.test(x.e.role)) || pick(staff))?.p || null;
}

// ---------------------------------------------------------------- notícias a partir dos acontecimentos
const SKIP = new Set(['genese', 'mensagem-usuario', 'pedido', 'ajuda', 'promessa-quebrada', 'ligacao-perdida', 'relacao-usuario', 'investigacao-usuario', 'emprestimo', 'matricula', 'campanha-usuario', 'evento-marcado', 'pesquisa']);
onEvent((ctx, e) => {
  const w = ctx.w;
  if (SKIP.has(e.type) || !w.core?.genesisAt) return;
  const famous = e.actors.some((id) => (personById(w, id)?.followers || 0) > 20000);
  const newsworthy = e.importance >= 3 || (e.cat === 'esportes' && e.importance >= 2) || (famous && e.importance >= 2) || e.type === 'pesquisa';
  if (!newsworthy) return;
  const site = outlet(w, famous && e.cat === 'pessoal' ? 'celebridades' : e.cat);
  if (!site) return;
  const author = journalistOf(w, site);
  const a = {
    id: uid(), siteId: site.id, cat: famous && e.cat === 'pessoal' ? 'celebridades' : e.cat, title: headline(w, e), lead: e.text || '', body: buildBody(w, e, author),
    at: e.at, authorId: author?.id || null, eventIds: [e.id], storyId: e.storyId, refs: e.refs, actors: e.actors, comments: [], views: 0, ai: false, importance: e.importance,
  };
  articles(w).push(a);
  cap(articles(w), LIMIT.articles);
  if (author) { author.followers = (author.followers || 0) + 20; remember(author, `Publiquei: "${a.title}".`, a.at); }
  // repercussão na Rede
  for (const p of shuffle(residents(w).filter((x) => active(x) && !e.actors.includes(x.id))).slice(0, e.importance >= 4 ? 2 : chance(0.5) ? 1 : 0)) {
    worldPost(ctx, p, genderize(p, pick([`Viram isso? "${a.title}" 😳`, `"${a.title}". O que vocês acham?`, `Não acredito: ${a.title.toLowerCase()}`, `${a.title}... essa cidade não para.`])), { refs: [{ t: 'article', id: a.id }] });
  }
  for (const id of e.actors.slice(0, 2)) { const p = personById(w, id); if (p && e.importance >= 3 && chance(0.4)) worldPost(ctx, p, genderize(p, pick(['Saiu no jornal 👀 nem sei o que dizer.', 'Muita gente me mandando mensagem sobre a matéria. Obrigada(o).', 'Não é bem assim que aconteceu, mas ok.']))); }
  if (ctx.live && e.importance >= 3) { w.mediaQueue ??= []; w.mediaQueue.push(a.id); cap(w.mediaQueue, 20); }
});

function headline(w, e) {
  let t = e.title;
  for (const r of e.refs.filter((x) => x.t === 'company')) {
    const c = companyById(w, r.id);
    if (c && c.priceHistory.length > 2 && ['lancamento', 'crise', 'investigacao', 'falencia', 'resgate', 'descoberta'].includes(e.type)) {
      const before = c.priceHistory.at(-Math.min(25, c.priceHistory.length)).v;
      const ch = before ? Math.round(((c.price - before) / before) * 100) : 0;
      if (Math.abs(ch) >= 3 && c.status !== 'falida') t += ` — ações ${ch > 0 ? 'sobem' : 'caem'} ${Math.abs(ch)}%`;
    }
  }
  return t.slice(0, 180);
}
function quote(p, e) {
  if (!p?.agent) return null;
  const neg = ['crise', 'falencia', 'demissao', 'investigacao', 'negacao', 'crime', 'condenacao', 'termino', 'desaparecimento'].includes(e.type);
  return genderize(p, neg ? pick(['Não é o momento de falar. Vamos esclarecer tudo.', 'Estou muito abalada(o) com tudo isso.', 'A verdade vai aparecer.']) : pick(['É um momento muito especial.', 'Trabalhamos muito para chegar aqui.', 'Isso é só o começo.', 'Agradeço a todos que acreditaram.']));
}
function buildBody(w, e, author) {
  const parts = [];
  if (e.text) parts.push(e.text);
  // contexto da mesma história
  const before = e.storyId ? w.events.filter((x) => x.storyId === e.storyId && x.id !== e.id).slice(-4) : [];
  if (before.length) parts.push(`Entenda o caso: ${before.map((x) => `${new Date(x.at).toLocaleDateString('pt-BR')}, ${x.title.charAt(0).toLowerCase()}${x.title.slice(1)}`).join('; ')}.`);
  for (const r of e.refs.filter((x) => x.t === 'company')) {
    const c = companyById(w, r.id); if (!c) continue;
    const ceo = personById(w, c.ceoId);
    parts.push(`A ${c.name}, do setor de ${SECTORS[c.sector]?.label.toLowerCase()}, foi fundada em ${new Date(c.foundedAt).toLocaleDateString('pt-BR')}${ceo ? ` e é comandada por ${ceo.name}` : ''}. Tem ${c.employees.length} funcionário(s)${c.status !== 'falida' ? ` e a ação (${c.ticker}) vale ${c.price.toLocaleString('pt-BR')} NXC` : ''}.`);
  }
  const p = personById(w, e.actors.find((id) => id !== 'me'));
  const q = quote(p, e);
  if (q) parts.push(`"${q}", disse ${p.name} ${author ? `à reportagem de ${author.name}` : 'à reportagem'}.`);
  if (e.cat === 'politica' && w.politics) parts.push(`A próxima fase do calendário eleitoral termina em ${new Date(w.politics.election.phaseEnds).toLocaleDateString('pt-BR')}.`);
  return parts.join('\n\n');
}

// IA: uma matéria por vez, só com cota
onTick(async (ctx) => {
  const w = ctx.w;
  const q = w.mediaQueue || [];
  if (!q.length || !aiTake(ctx)) return;
  const id = q.shift();
  const a = articles(w).find((x) => x.id === id);
  if (!a) return;
  const author = personById(w, a.authorId);
  const site = companyById(w, a.siteId);
  const facts = w.events.filter((x) => a.eventIds.includes(x.id) || (a.storyId && x.storyId === a.storyId)).slice(-6).map((x) => `${x.at.slice(0, 16)} — ${x.title}${x.text ? `: ${x.text}` : ''}`);
  try {
    const out = await geminiJSON(`Você é ${author?.name || 'jornalista'}${author?.voice ? ` (estilo: ${author.voice})` : ''}, do site ${site?.name || 'Mundo Agora'}, em Codeniac Society (uma cidade fictícia).
Reescreva a matéria abaixo de forma jornalística, envolvente e fiel aos FATOS (não invente acontecimentos, números ou nomes que não estejam nos fatos).
Fatos registrados:\n${facts.join('\n')}\nRascunho:\nTítulo: ${a.title}\n${a.body}
Responda SÓ com JSON: {"titulo":"","linha_fina":"","corpo":"3 a 5 parágrafos separados por \\n\\n"}`, 1800, 0.7);
    if (out?.corpo) { a.title = str(out.titulo, 180) || a.title; a.lead = str(out.linha_fina, 300) || a.lead; a.body = String(out.corpo).slice(0, 5000); a.ai = true; }
  } catch (err) { logger.error('[mídia] IA:', err.message); }
});

// leitores comentam (amigos defendem, rivais atacam)
onHourly((ctx) => {
  const w = ctx.w;
  const recent = articles(w).filter((a) => a.at > new Date(ctx.at.getTime() - DAY).toISOString()).slice(-12);
  for (const a of recent) {
    if (!chance(0.25) || a.comments.length >= LIMIT.comments) continue;
    const reader = pick(residents(w).filter((p) => active(p) && !a.actors.includes(p.id)));
    if (!reader) continue;
    const involved = personById(w, a.actors[0]);
    const aff = involved ? (reader.agent.rel[involved.id]?.aff || 0) : 0;
    const text = genderize(reader, aff > 30 ? pick(['Conheço essa pessoa, não é nada disso.', 'Força! Estamos juntos.', 'Matéria tendenciosa.']) : aff < -25 ? pick(['Já era hora de alguém falar.', 'Eu avisei.', 'Bem feito.']) : pick(['Que absurdo.', 'Interessante.', 'Alguém sabe mais detalhes?', 'Essa cidade...', 'Isso vai dar o que falar.', 'Notícia boa pra variar!']));
    a.comments.push({ id: uid(), personaId: reader.id, text, at: ctx.at.toISOString() });
    a.views += 30 + rnd(300);
  }
});

// blogs pessoais (Diário Urbano)
onDaily((ctx) => {
  const w = ctx.w;
  const blog = companies(w).find((c) => c.siteKind === 'blog' && liveCo(c));
  if (!blog) return;
  for (const p of shuffle(residents(w).filter((x) => active(x) && x.agent.traits.curiosity > 0.6)).slice(0, 2)) {
    const mem = p.lifeLog.filter((l) => !/^Comentei|^Postei|me contou/.test(l.text)).slice(-4);
    if (!mem.length) continue;
    articles(w).push({ id: uid(), siteId: blog.id, cat: 'pessoal', title: genderize(p, `${pick(['Diário de', 'Pensamentos de', 'A semana de'])} ${p.name.split(' ')[0]}: ${mem.at(-1).text.replace(/\.$/, '').slice(0, 70)}`), lead: p.bio || '', body: [...mem.map((m) => m.text), `Como estou me sentindo: ${p.mood?.emotion || 'bem'}${p.mood?.reason ? `, ${p.mood.reason}` : ''}.`, p.problem ? `O que tira meu sono: ${p.problem}.` : ''].filter(Boolean).join('\n\n'), at: ctx.at.toISOString(), authorId: p.id, eventIds: [], refs: [], actors: [p.id], comments: [], views: rnd(200), blog: true, importance: 1 });
  }
  cap(articles(w), LIMIT.articles);
});

// ---------------------------------------------------------------- comunidades (estilo Reddit/Discord)
const COMMUNITIES = [
  ['Tecnologia', 'tecnologia', ['tecnologia', 'games', 'astronomia'], ['Sem spam de produto', 'Cite as fontes', 'Respeite opiniões']],
  ['Programação', 'programacao', ['tecnologia'], ['Poste o código', 'Sem pedir trabalho de faculdade pronto', 'Seja gentil com iniciantes']],
  ['Investimentos', 'investimentos', ['investimentos'], ['Não é recomendação de compra', 'Sem promessa de lucro fácil', 'Mostre os números']],
  ['Games', 'games', ['games', 'animes'], ['Spoiler com aviso', 'Sem guerra de console', 'Respeite os noobs']],
  ['Cinema e séries', 'cinema', ['séries', 'teatro', 'livros'], ['Spoiler com aviso', 'Críticas com argumentos']],
  ['Música', 'musica', ['música sertaneja', 'rock antigo', 'trap', 'dança'], ['Divulgação só às sextas', 'Respeite os gostos']],
  ['Relacionamentos', 'relacionamentos', [], ['Sem exposição de terceiros', 'Conselhos com empatia']],
];
export const communities = (w) => (w.communities ??= []);
onGenesis((ctx) => {
  const w = ctx.w;
  for (const [name, key, interests, rules] of COMMUNITIES) {
    const fans = residents(w).filter((p) => (p.interests || []).some((i) => interests.includes(i)) || chance(0.12));
    const ranked = fans.slice().sort((a, b) => (b.followers || 0) - (a.followers || 0));
    communities(w).push({ id: uid(), key, name, slug: slug(name), desc: `Comunidade de ${name.toLowerCase()} de Codeniac Society`, rules, adminId: ranked[0]?.id || null, mods: ranked.slice(1, 3).map((p) => p.id), members: fans.map((p) => p.id), createdAt: ctx.at.toISOString(), threads: [], origin: 'genese', interests });
  }
});
function topicFor(w, c, p) {
  const recent = (types) => w.events.filter((e) => types.includes(e.type)).at(-1);
  switch (c.key) {
    case 'tecnologia': { const e = recent(['lancamento', 'descoberta', 'fundacao']); return e ? [`O que acharam? ${e.title}`, e.text || 'Quero opiniões sinceras.'] : ['Qual tecnologia vai mudar a cidade?', 'Chutem aí.']; }
    case 'investimentos': { const cs = companies(w).filter(liveCo).map((x) => ({ x, ch: x.priceHistory.length > 24 ? (x.price - x.priceHistory.at(-25).v) / x.priceHistory.at(-25).v : 0 })).sort((a, b) => Math.abs(b.ch) - Math.abs(a.ch)); const t = cs[0]; return t ? [`${t.x.ticker} ${t.ch >= 0 ? 'subiu' : 'caiu'} ${Math.abs(Math.round(t.ch * 100))}% em 24h. Compro ou vendo?`, `Preço atual: ${t.x.price} NXC. Setor: ${SECTORS[t.x.sector].label}.`] : ['Onde vocês estão investindo?', '']; }
    case 'cinema': { const f = (w.media?.films || []).at(-1); return f ? [`Alguém já viu "${f.title}"?`, 'Sem spoiler, por favor!'] : ['Indicação de série?', '']; }
    case 'musica': { const s = (w.media?.songs || []).at(-1); return s ? [`"${s.title}" não sai da minha cabeça`, `De ${personById(w, s.artistId)?.name || 'um artista da cidade'}.`] : ['Qual música vocês estão ouvindo?', '']; }
    case 'relacionamentos': return [genderize(p, pick(['Como saber se é hora de terminar?', 'Meu melhor amigo está namorando minha ex. E agora?', 'Vale a pena voltar com quem já te magoou?', 'Como fazer amigos depois dos 30?'])), p.problem ? `Contexto: ${p.problem}.` : ''];
    case 'programacao': return [pick(['Qual linguagem aprender primeiro?', 'Meu código funciona e eu não sei por quê', 'Vale a pena o curso de Programação da Universidade?']), ''];
    default: return [pick(['Qual o melhor jogo do ano?', 'Recomendações?', 'Opinião impopular aqui']), ''];
  }
}
registerAction({
  name: 'comunidade',
  weight: (ctx, p) => (communities(ctx.w).some((c) => c.members.includes(p.id)) ? 0.12 + p.agent.traits.curiosity * 0.18 : 0),
  run(ctx, p) {
    const w = ctx.w;
    const c = pick(communities(w).filter((x) => x.members.includes(p.id)));
    if (!c) return;
    const open = c.threads.filter((t) => t.at > new Date(ctx.at.getTime() - 3 * DAY).toISOString());
    if (!open.length || chance(0.15)) {
      const [title, body] = topicFor(w, c, p);
      c.threads.push({ id: uid(), authorId: p.id, title: str(title, 160), body: str(body, 600), at: ctx.at.toISOString(), votes: 1 + rnd(5), comments: [] });
      cap(c.threads, LIMIT.threads);
      return;
    }
    const t = pick(open);
    if (t.authorId === p.id || t.comments.length >= LIMIT.comments) return;
    const author = t.authorId === 'me' ? null : personById(w, t.authorId);
    const agree = chance(0.55 + (author ? (p.agent.rel[author.id]?.aff || 0) / 200 : 0) - p.agent.traits.volatility * 0.2);
    const text = genderize(p, agree ? pick(['Concordo 100%.', 'Passei pela mesma coisa.', 'Boa! Salvei aqui.', 'Exatamente isso.', 'Faz muito sentido.']) : pick(['Discordo totalmente.', 'Isso não faz sentido nenhum.', 'Você tá viajando.', 'Respeito, mas acho o contrário.', 'Fonte?']));
    t.comments.push({ id: uid(), authorId: p.id, text, at: ctx.at.toISOString(), votes: rnd(4) });
    t.votes += agree ? 1 : 0;
    if (author) bump(ctx, p, author, agree ? 2 : -3, { reason: `debate em ${c.name}` });
    // moderação: comentário agressivo de quem tem pavio curto pode ser removido
    if (!agree && p.agent.traits.volatility > 0.75 && chance(0.15)) {
      t.comments.at(-1).removed = true;
      const mod = personById(w, pick(c.mods)) || personById(w, c.adminId);
      if (mod) bump(ctx, p, mod, -6, { reason: 'comentário removido' });
    }
  },
});
export function createCommunity(ctx, { name, desc, rules }) {
  const w = ctx.w;
  name = str(name, 50); if (!name) throw new Error('Dê um nome à comunidade');
  if (communities(w).some((c) => fold(c.name) === fold(name))) throw new Error('Já existe uma comunidade com esse nome');
  const words = fold(`${name} ${desc || ''}`);
  const c = { id: uid(), key: slug(name), name, slug: slug(name), desc: str(desc, 300), rules: (Array.isArray(rules) ? rules : String(rules || '').split('\n')).map((r) => str(r, 120)).filter(Boolean).slice(0, 8), adminId: 'me', mods: [], members: ['me'], createdAt: ctx.at.toISOString(), threads: [], interests: [] };
  // quem tem interesse no tema entra sozinho
  for (const p of residents(w)) if ((p.interests || []).some((i) => words.includes(fold(i))) && chance(0.7)) c.members.push(p.id);
  communities(w).push(c);
  record(ctx, { type: 'comunidade-criada', cat: 'sociedade', title: `Você criou a comunidade ${name}`, text: `${c.members.length - 1} pessoa(s) já entraram.`, actors: ['me'], importance: 2 });
  return c;
}

// ---------------------------------------------------------------- cinema, música e patrocínios
export function media(w) { return (w.media ??= { films: [], songs: [], awards: [], sponsorships: [] }); }
const FILM_A = ['O Último', 'A Noite de', 'Código', 'Sombras de', 'O Segredo de', 'Neon', 'Depois de', 'A Cidade de', 'Coração de', 'Protocolo'];
const FILM_B = ['Neon', 'Codeniac', 'Vidro', 'Outono', 'Aurora', 'Silício', 'Marte', 'Porto', 'Fumaça', 'Cristal'];
const GENRES = ['drama', 'ação', 'comédia', 'ficção científica', 'suspense', 'romance', 'documentário'];
onDaily((ctx) => {
  const w = ctx.w; const M = media(w);
  for (const studio of companies(w).filter((c) => c.sector === 'entretenimento' && liveCo(c))) {
    if (!chance(0.15) || studio.cash < 6000) continue;
    const staff = studio.employees.map((e) => personById(w, e.personaId)).filter(Boolean);
    const director = pick(staff) || personById(w, studio.ceoId);
    const cast = shuffle(residents(w).filter((p) => active(p) && p.age > 16)).sort((a, b) => (b.followers || 0) - (a.followers || 0)).slice(0, 6).filter(() => chance(0.5)).slice(0, 2);
    const budget = Math.round(3000 + Math.random() * Math.min(20000, studio.cash * 0.4));
    studio.cash -= budget;
    const film = { id: uid(), title: `${pick(FILM_A)} ${pick(FILM_B)}`, genre: pick(GENRES), studioId: studio.id, directorId: director?.id || null, castIds: cast.map((p) => p.id), budget, quality: clamp(gauss(0.55 + (director?.agent?.skill || 1) * 0.1 + budget / 80000, 0.18), 0.05, 1), releaseAt: new Date(ctx.at.getTime() + 2 * DAY).toISOString(), released: false, reviews: [], box: 0 };
    M.films.push(film); cap(M.films, 60);
    record(ctx, { type: 'filmagem', cat: 'entretenimento', title: `${studio.name} anuncia o filme "${film.title}"`, text: `${film.genre[0].toUpperCase() + film.genre.slice(1)}${director ? `, dirigido por ${director.name}` : ''}${cast.length ? `, com ${cast.map((p) => p.name).join(' e ')}` : ''}. Estreia em 2 dias.`, actors: [director?.id, ...cast.map((p) => p.id)].filter(Boolean), refs: [{ t: 'company', id: studio.id }], importance: 2 });
    schedule(ctx, new Date(film.releaseAt), 'estreia', { id: film.id });
  }
  // bilheteria dos filmes em cartaz
  for (const f of M.films.filter((x) => x.released && x.box < x.budget * 4 && ctx.at.toISOString() < new Date(new Date(x.releaseAt).getTime() + 10 * DAY).toISOString())) {
    const studio = companyById(w, f.studioId);
    const day = Math.round(f.quality * 2500 * gauss(1, 0.2));
    f.box += day; if (liveCo(studio)) studio.salesToday += day;
  }
  // prêmio a cada 30 dias
  M.lastAward ??= ctx.at.toISOString();
  if (ctx.at.getTime() - new Date(M.lastAward).getTime() > 30 * DAY) {
    M.lastAward = ctx.at.toISOString();
    const pool = M.films.filter((f) => f.released && f.releaseAt > new Date(ctx.at.getTime() - 35 * DAY).toISOString());
    const best = pool.sort((a, b) => avg(b) - avg(a))[0];
    if (best) {
      M.awards.push({ id: uid(), at: ctx.at.toISOString(), filmId: best.id, category: 'Melhor filme' }); cap(M.awards, 30);
      const dir = personById(w, best.directorId);
      if (dir) { dir.followers = (dir.followers || 0) + 8000; remember(dir, `"${best.title}" ganhou o Prêmio Nexus de Melhor Filme!`); }
      record(ctx, { type: 'premio', cat: 'celebridades', title: `"${best.title}" vence o Prêmio Nexus de Cinema`, text: dir ? `Direção de ${dir.name}.` : '', actors: [best.directorId, ...best.castIds].filter(Boolean), refs: [{ t: 'company', id: best.studioId }], importance: 4 });
    }
  }
  // patrocínios de influenciadores
  const brands = companies(w).filter((c) => liveCo(c) && c.marketing > 400 && c.cash > 8000);
  const influencers = residents(w).filter((p) => active(p) && (p.followers || 0) > 15000);
  if (brands.length && influencers.length && chance(0.3)) {
    const c = pick(brands); const p = pick(influencers);
    const fee = Math.round(500 + (p.followers || 0) / 40);
    c.cash -= fee; p.agent.cash += fee; c.reputation = clamp(c.reputation + 2, 0, 100);
    M.sponsorships.push({ id: uid(), at: ctx.at.toISOString(), companyId: c.id, personaId: p.id, fee }); cap(M.sponsorships, 40);
    worldPost(ctx, p, genderize(p, `Parceria nova com a ${c.name} ✨ ${c.slogan || ''} #publi`));
    record(ctx, { type: 'patrocinio', cat: 'celebridades', title: `${p.name} fecha patrocínio com a ${c.name}`, text: `${fee.toLocaleString('pt-BR')} NXC.`, actors: [p.id], refs: [{ t: 'company', id: c.id }], importance: 2 });
  }
});
const avg = (f) => (f.reviews.length ? f.reviews.reduce((s, r) => s + r.score, 0) / f.reviews.length : 0);
handle('estreia', (ctx, { id }) => {
  const w = ctx.w; const f = media(w).films.find((x) => x.id === id);
  if (!f || f.released) return;
  f.released = true;
  const critics = residents(w).filter((p) => /jornal|editor|crític/i.test(p.agent.role || p.job || '')).slice(0, 3);
  for (const c of critics) f.reviews.push({ personaId: c.id, score: clamp(Math.round((f.quality * 5 + gauss(0, 0.7)) * 2) / 2, 0.5, 5), text: genderize(c, f.quality > 0.65 ? pick(['Um dos melhores do ano.', 'Emocionante do início ao fim.']) : f.quality < 0.4 ? pick(['Longo e confuso.', 'Promete muito, entrega pouco.']) : pick(['Bom, mas esquecível.', 'Vale o ingresso.'])) });
  const score = Math.round(avg(f) * 10) / 10;
  record(ctx, { type: 'estreia', cat: 'entretenimento', title: `Estreia: "${f.title}" ${score ? `recebe nota ${score.toLocaleString('pt-BR')} da crítica` : 'chega aos cinemas'}`, actors: [f.directorId, ...f.castIds].filter(Boolean), refs: [{ t: 'company', id: f.studioId }], importance: score >= 4 ? 3 : 2 });
  for (const pid of f.castIds) { const p = personById(w, pid); if (p) { p.followers = (p.followers || 0) + Math.round(f.quality * 3000); worldPost(ctx, p, genderize(p, `"${f.title}" estreou hoje! Corre pro cinema 🎬`)); } }
});
registerAction({
  name: 'lancar-musica',
  weight: (ctx, p) => (/músic|cantor|dj|rapper/i.test(p.job || '') ? 0.08 : 0),
  run(ctx, p) {
    const M = media(ctx.w);
    const song = { id: uid(), title: pick(['Neon na Pele', 'Madrugada em Codeniac', 'Coração Offline', 'Fim de Semana', 'Porto Neon', 'Saudade Digital', 'Último Ônibus', 'Te Vi no Feed', 'Chuva no Centro']), artistId: p.id, at: ctx.at.toISOString(), plays: 0, genre: pick(['pop', 'trap', 'sertanejo', 'rock', 'eletrônica', 'MPB']) };
    if (M.songs.some((s) => s.title === song.title && s.artistId === p.id)) return;
    M.songs.push(song); cap(M.songs, 80);
    p.followers = (p.followers || 0) + 200;
    record(ctx, { type: 'musica', cat: 'entretenimento', title: `${p.name} lança "${song.title}"`, text: `Novo ${song.genre}.`, actors: [p.id], importance: (p.followers || 0) > 20000 ? 3 : 1 });
    worldPost(ctx, p, genderize(p, `"${song.title}" já está na Neon FM! 🎧`));
  },
});

// ---------------------------------------------------------------- TV e rádio: grade montada com dados reais
export const CHANNELS = [
  { id: 'nxnews', name: 'NX News 24h', kind: 'tv', color: '#ef4444', desc: 'Jornalismo o dia todo' },
  { id: 'debate', name: 'Canal Debate', kind: 'tv', color: '#3b82f6', desc: 'Política e mesas-redondas' },
  { id: 'show', name: 'Nexus Show', kind: 'tv', color: '#a855f7', desc: 'Entrevistas e celebridades' },
  { id: 'esporte', name: 'Esporte Nexus', kind: 'tv', color: '#22c55e', desc: 'Liga Nexus ao vivo' },
  { id: 'neonfm', name: 'Neon FM 97.3', kind: 'radio', color: '#ec4899', desc: 'Música da cidade' },
  { id: 'cbn', name: 'Nexus News Rádio', kind: 'radio', color: '#f59e0b', desc: 'Notícias a cada hora' },
  { id: 'papo', name: 'Papo de Esquina (podcast)', kind: 'radio', color: '#14b8a6', desc: 'Dois moradores, um assunto' },
];
function host(w, pred) {
  const g = companies(w).find((c) => c.name === 'Grupo Nexus de Comunicação');
  const staff = (g?.employees || []).map((e) => personById(w, e.personaId)).filter(Boolean);
  return staff.find(pred || (() => true)) || pick(residents(w));
}
export function program(w, id, at = new Date()) {
  const ch = CHANNELS.find((c) => c.id === id);
  if (!ch) return null;
  const arts = articles(w).filter((a) => !a.blog).slice(-40).reverse();
  const lines = [];
  let title = ''; let people = [];
  if (id === 'nxnews' || id === 'cbn') {
    const anchor = host(w, (p) => /apresent|jornal/i.test(p.agent?.role || ''));
    title = id === 'nxnews' ? `Jornal Nexus — ${String(at.getHours()).padStart(2, '0')}h` : 'Nexus News: as manchetes da hora';
    people = [anchor];
    lines.push([anchor, `${at.getHours() < 12 ? 'Bom dia' : at.getHours() < 18 ? 'Boa tarde' : 'Boa noite'}, Codeniac Society. Eu sou ${anchor?.name || 'a redação'} e estas são as notícias.`]);
    for (const a of arts.slice(0, 5)) lines.push([anchor, `${a.title}. ${a.lead || a.body.split('\n')[0]}`.slice(0, 360)]);
    const e = w.eco;
    if (e) lines.push([anchor, `No mercado, a Bolsa Nexus está em ${Math.round(e.index)} pontos e a inflação do mês em ${e.inflation.toLocaleString('pt-BR')}%.`]);
    lines.push([anchor, 'Voltamos a qualquer momento com novas informações.']);
  } else if (id === 'debate') {
    const el = w.politics?.election;
    const story = arts.find((a) => ['politica', 'economia'].includes(a.cat));
    const pool = residents(w).filter((p) => active(p));
    const left = pool.filter((p) => p.agent.ideology < -0.3).sort((a, b) => (b.followers || 0) - (a.followers || 0))[0];
    const right = pool.filter((p) => p.agent.ideology > 0.3).sort((a, b) => (b.followers || 0) - (a.followers || 0))[0];
    const mod = host(w);
    title = el?.phase === 'campanha' ? 'Mesa eleitoral' : `Mesa-redonda: ${story?.title || 'os rumos da cidade'}`;
    people = [mod, left, right].filter(Boolean);
    lines.push([mod, `Hoje no Canal Debate: ${story?.title || 'o futuro de Codeniac Society'}. Comigo, ${[left, right].filter(Boolean).map((p) => p.name).join(' e ')}.`]);
    if (left) lines.push([left, genderize(left, pick(['O problema é que quem paga a conta é sempre o trabalhador.', 'A cidade precisa cuidar das pessoas antes do lucro.', 'Sem investimento público, isso não se resolve.']))]);
    if (right) lines.push([right, genderize(right, pick(['Menos imposto e mais liberdade para quem produz. É simples.', 'Quem gera emprego são as empresas, não o governo.', 'O mercado se ajusta se deixarem ele trabalhar.']))]);
    if (left) lines.push([left, 'Discordo. Os números mostram outra coisa.']);
    if (el) lines.push([mod, `Lembrando: ${{ mandato: 'a próxima eleição', inscricoes: 'as inscrições', campanha: 'a votação', apuracao: 'a apuração' }[el.phase]} ${el.phase === 'mandato' ? 'começa' : 'termina'} em ${new Date(el.phaseEnds).toLocaleDateString('pt-BR')}.`]);
  } else if (id === 'show') {
    const star = residents(w).filter((p) => active(p)).sort((a, b) => (b.followers || 0) - (a.followers || 0))[rnd(3)];
    const mod = host(w);
    title = star ? `Nexus Show entrevista ${star.name}` : 'Nexus Show';
    people = [mod, star].filter(Boolean);
    if (star) {
      const mem = star.lifeLog.filter((l) => !/^Comentei|^Postei/.test(l.text)).slice(-3);
      lines.push([mod, `Boa noite! Minha convidada de hoje tem ${(star.followers || 0).toLocaleString('pt-BR')} seguidores. Com vocês, ${star.name}!`.replace('convidada', star.gender === 'f' ? 'convidada' : 'convidado')]);
      lines.push([mod, 'Como você está hoje, de verdade?']);
      lines.push([star, `${star.mood?.reason ? `Olha, ${star.mood.reason}... ` : ''}Tô me sentindo ${star.mood?.emotion || 'bem'}.`]);
      if (mem.length) { lines.push([mod, 'O que tem acontecido na sua vida?']); for (const m of mem) lines.push([star, m.text]); }
      if (star.goal) { lines.push([mod, 'E o sonho?']); lines.push([star, `${star.goal[0].toUpperCase()}${star.goal.slice(1)}. Ainda chego lá.`]); }
    }
  } else if (id === 'esporte') {
    const s = w.sports; const anchor = host(w);
    title = 'Esporte Nexus'; people = [anchor];
    const done = (s?.season?.matches || []).filter((m) => m.status === 'encerrada').slice(-3);
    const club = (cid) => s.clubs.find((c) => c.id === cid)?.name;
    lines.push([anchor, `Liga Nexus, temporada ${s?.season?.n || 1}.`]);
    for (const m of done) lines.push([anchor, `${club(m.home)} ${m.score[0]} × ${m.score[1]} ${club(m.away)}.`]);
    const next = (s?.season?.matches || []).find((m) => m.status === 'agendada');
    if (next) lines.push([anchor, `Próximo jogo: ${club(next.home)} × ${club(next.away)}, ${new Date(next.at).toLocaleString('pt-BR', { weekday: 'long', hour: '2-digit', minute: '2-digit' })}.`]);
  } else if (id === 'neonfm') {
    const dj = host(w); const songs = (media(w).songs || []).slice(-8);
    title = 'Neon FM — tocando agora'; people = [dj];
    const song = songs.length ? songs[(at.getHours() * 7 + at.getMinutes()) % songs.length] : null;
    if (song) { song.plays += 1; lines.push([dj, `Agora na Neon FM: "${song.title}", de ${personById(w, song.artistId)?.name || 'um artista da cidade'}. ${song.genre}!`]); }
    else lines.push([dj, 'Os artistas da cidade ainda não lançaram nada. Mandem suas músicas!']);
    const shout = shuffle(residents(w)).slice(0, 2);
    for (const p of shout) lines.push([dj, `Recado de ${p.name}: ${genderize(p, pick(['um beijo pra galera do trabalho!', 'aguenta firme, sexta tá chegando!', 'toca mais uma, por favor!', `saudade de quem tá longe.`]))}`]);
  } else if (id === 'papo') {
    const thread = communities(w).flatMap((c) => c.threads.map((t) => ({ c, t }))).sort((a, b) => b.t.comments.length - a.t.comments.length)[0];
    const [a, b] = shuffle(residents(w).filter((p) => active(p))).slice(0, 2);
    title = thread ? `Papo de Esquina: "${thread.t.title}"` : 'Papo de Esquina'; people = [a, b].filter(Boolean);
    if (a && b) {
      lines.push([a, `E aí, ${b.name.split(' ')[0]}! Hoje o assunto é ${thread ? `"${thread.t.title}", que bombou em ${thread.c.name}` : 'a vida na cidade'}.`]);
      lines.push([b, genderize(b, pick(['Eu tenho uma opinião forte sobre isso, hein.', 'Esse assunto rende.', 'Já brigaram muito por causa disso!']))]);
      for (const cm of (thread?.t.comments || []).slice(-3)) lines.push([pick([a, b]), `Teve gente dizendo: "${cm.text}"`]);
      lines.push([a, 'Mandem a opinião de vocês nas comunidades!']);
    }
  }
  return { channel: ch, title, at: at.toISOString(), people: people.filter(Boolean).map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, color: p.color })), lines: lines.filter(([p, t]) => t).map(([p, t]) => ({ speaker: p ? { id: p.id, name: p.name, color: p.color } : null, text: t })) };
}

// ---------------------------------------------------------------- internet: busca dentro do mundo
export function siteOf(w, c) {
  return { id: c.id, name: c.name, domain: c.domain, kind: c.siteKind, color: c.color, slogan: c.slogan, status: c.status, sector: c.sector };
}
export function searchWorld(w, q) {
  const k = fold(q).trim();
  if (!k) return { sites: [], articles: [], people: [], companies: [], communities: [], products: [] };
  const has = (t) => fold(t || '').includes(k) || k.split(/\s+/).filter((x) => x.length > 2).every((x) => fold(t || '').includes(x));
  return {
    sites: companies(w).filter((c) => has(`${c.name} ${c.domain} ${c.slogan} ${SECTORS[c.sector]?.label}`)).slice(0, 8).map((c) => siteOf(w, c)),
    companies: companies(w).filter((c) => has(c.name)).slice(0, 6).map((c) => ({ id: c.id, name: c.name, status: c.status, ticker: c.ticker })),
    articles: articles(w).filter((a) => has(`${a.title} ${a.lead} ${a.body}`)).slice(-30).reverse().slice(0, 15).map((a) => ({ id: a.id, title: a.title, lead: a.lead || a.body.slice(0, 200), at: a.at, site: siteOf(w, companyById(w, a.siteId) || { name: '?', domain: '?' }), cat: a.cat, blog: Boolean(a.blog) })),
    people: people(w).filter((p) => has(`${p.name} ${p.handle} ${p.job}`)).slice(0, 8).map((p) => ({ id: p.id, name: p.name, handle: p.handle, avatar: p.avatar, color: p.color, job: p.job, city: p.city })),
    communities: communities(w).filter((c) => has(`${c.name} ${c.desc}`)).slice(0, 6).map((c) => ({ id: c.id, name: c.name, members: c.members.length })),
    products: companies(w).filter(liveCo).flatMap((c) => c.products.map((p) => ({ ...p, companyId: c.id, company: c.name }))).filter((p) => has(p.name)).slice(0, 8),
  };
}
