// DIÁLOGOS ENTRE MORADORES E COM O JOGADOR — conversas com conteúdo real.
// O servidor escolhe o assunto a partir do que está acontecendo na cidade (clima, acidentes, notícias, manifestações,
// profissão, saúde), dá o tom pela personalidade (traits) e pelo relacionamento (rel), e decide o desfecho: conversa
// amistosa, desentendimento, discussão ou briga. Cada conversa altera as relações, deixa memória nos dois lados e fica
// registrada no mundo (w.dialogos). Sem IA paga: é determinístico e rápido, então pode rodar com muitos moradores.
import { record, services } from './core.js';
import { personById, residents, rel, bump, relType, REL_LABEL, bumpUser } from './agents.js';
import { remember, genderize } from '../social.js';
import { gameNow } from './clock.js';
import { weatherNow } from './city.js';
import { pick, cap } from './util.js';
import { BankError, account } from './bank.js';

const MIN = 60000;
const COOL_MIN = 40; // minutos do jogo entre duas conversas do mesmo par
const HOSTILE_MIN = 45; // minutos do jogo em que alguém segue irritado depois de uma ofensa

function D(w) { w.dialogos ??= { list: [], cool: {}, seq: 0 }; return w.dialogos; }
const first = (p) => (p.name || '').split(' ')[0];
const traitWords = (p) => (p.traits || []).join(' ').toLowerCase();

// perfil de tom derivado dos traits do agente e das palavras da personalidade
export function toneOf(p) {
  const t = p.agent?.traits || {}; const words = traitWords(p);
  return {
    calmo: (t.volatility ?? 0.4) < 0.3 || /calm|zen|reflexiv|educad/.test(words),
    agressivo: (t.volatility ?? 0.4) > 0.65 || /explosiv|temperament|impulsiv|agressiv/.test(words),
    timido: (t.sociability ?? 0.5) < 0.35 || /tímid/.test(words),
    arrogante: /arrogant|orgulhos|convencid/.test(words) || ((t.ambition ?? 0.5) > 0.75 && (t.honesty ?? 0.5) < 0.45),
    extrovertido: (t.sociability ?? 0.5) > 0.66,
    sarcastico: /sarcástic|irônic|desconfiad/.test(words) || ((t.gossip ?? 0.5) > 0.62 && (t.honesty ?? 0.5) < 0.45),
  };
}

// assunto do momento: o que realmente aconteceu na cidade nas últimas horas (não é inventado)
function topicOf(w, now) {
  const recent = (w.events || []).filter((e) => now - new Date(e.at).getTime() < 4 * 3600000 && e.type !== 'genese');
  const acc = recent.find((e) => /^mapa-(acidente|atropelamento|batida)|batida|atropelad/.test(e.type) || /acidente|atropel|batida/i.test(e.title || ''));
  const man = recent.find((e) => /manifest/.test(e.type + (e.title || '')));
  const crime = recent.find((e) => e.type === 'crime' || /prisão|prend|perseguição/i.test(e.title || ''));
  const news = recent.find((e) => (e.importance || 0) >= 2 && e.title);
  const cond = (weatherNow(w) || {}).cond || '';
  const out = [];
  if (acc) out.push({ k: 'acidente', text: `Você viu o que aconteceu? ${String(acc.title).slice(0, 90)}` });
  if (crime) out.push({ k: 'crime', text: `Ficou sabendo? ${String(crime.title).slice(0, 90)}` });
  if (man) out.push({ k: 'manifestacao', text: `Essa manifestação está complicando o trânsito, né?` });
  if (news) out.push({ k: 'noticia', text: `Você leu sobre isso? ${String(news.title).slice(0, 90)}` });
  if (/Chuva|Tempestade|Neblina/.test(cond)) out.push({ k: 'clima', text: pick([`Essa ${cond.toLowerCase()} não para nunca...`, `Com esse tempo ${cond.toLowerCase()} ninguém quer sair de casa.`]) });
  return out;
}

const OPENERS = {
  desconhecido: ['Oi! Acho que nunca te vi por aqui.', 'Com licença... você mora por aqui?', 'Oi, tudo bem?'],
  conhecido: ['Oi! Tudo bem por aí?', 'Ei, quanto tempo!', 'Oi, você por aqui hoje?'],
  amigo: ['Ei, amigo! Que bom te ver.', 'Opa, justo quem eu queria encontrar!', 'E aí, tudo certo?'],
  'melhor-amigo': ['Olha quem apareceu! Preciso te contar uma coisa.', 'Não acredito, eu ia te ligar agora!'],
  colega: ['Oi! Vai passar pelo expediente hoje?', 'Ei, colega, como está o movimento?'],
  familia: ['Oi, querido(a)! Tudo bem em casa?', 'Ei, tava pensando em você.'],
  namoro: ['Oi, amor! Estava com saudade.', 'Chegou cedo, hein? Senti sua falta.'],
  rival: ['Olha só quem eu encontro...', 'Você de novo.'],
  inimigo: ['Não tenho nada pra falar com você.', 'Ah, é você. Passando reto.'],
};
const FRIENDLY = ['Você tem razão, concordo.', 'Ah, verdade! Eu nem tinha pensado nisso.', 'Haha, isso é bem a sua cara!', 'Vamos combinar então?', 'Foi um dia bom, né?', 'Precisamos marcar um café qualquer dia.'];
const NEUTRAL = ['Pois é...', 'Hum, entendi.', 'Cada um com a sua vida, né?', 'Vou indo, tenho umas coisas pra resolver.'];
const TRADE = {
  arguing: ['Você não assusta ninguém, viu?', 'Está querendo arrumar problema comigo?', 'Repete isso que eu quero ver!', 'Não tenho culpa se você não sabe dirigir.', 'Não precisa falar assim comigo.'],
  sarcastic: ['Nossa, que educação, hein.', 'Claro, ninguém me avisou disso antes.'],
};

// linhas de conversa para um par, conforme relação e personalidade
export function buildScript(ctx, a, b) {
  const w = ctx.w; const ra = rel(a, b.id); const kind = relType(ra);
  const ta = toneOf(a); const tb = toneOf(b);
  const hostile = (a.agent.traits.volatility + b.agent.traits.volatility) / 2;
  const grudge = ra.aff < -15 || kind === 'rival' || kind === 'inimigo' || (ra.aff < -5 && (ta.agressivo || tb.agressivo));
  const memo = memoryLine(a, b);
  const topics = topicOf(w, ctx.at.getTime());
  const topic = topics[0] || null;
  const lines = []; const push = (who, text, emo = 'neutro') => lines.push({ who, id: who === 'a' ? a.id : b.id, name: who === 'a' ? first(a) : first(b), text: genderize(who === 'a' ? a : b, text), emo });
  const S = ['a', 'b'];
  let escalate = null; let delta = 0; let trust = 0;
  push('a', pick(OPENERS[kind] || OPENERS.conhecido), grudge ? 'irritado' : 'feliz');
  if (memo && Math.random() < 0.7) push('b', memo.reply, memo.emo);
  if (topic) push('b', topic.text, 'surpresa'); else push('b', pick(['Oi! Tudo bem?', 'Tudo ótimo por aqui, e você?']), 'feliz');
  if (grudge && hostile > 0.45 && Math.random() < 0.6) {
    // desentendimento: a ofensa pode ou não escalar, conforme a personalidade de quem reage
    push('a', pick(TRADE.arguing), ta.agressivo ? 'irritado' : 'triste');
    push('b', ta.agressivo || tb.agressivo ? pick(['Vai você, seu(sua) abusado(a)!', 'Olha como fala comigo!']) : pick(TRADE.sarcastic), 'irritado');
    delta = -6; trust = -4;
    if (hostile > 0.7 && Math.random() < 0.45) { escalate = 'briga'; push('a', 'Então vem descobrir!', 'irritado'); delta = -12; trust = -8; }
    else if (hostile > 0.5 && Math.random() < 0.5) { escalate = 'discussao'; delta = -9; }
  } else {
    push('a', pick(FRIENDLY), 'feliz');
    if (tb.timido || Math.random() < 0.4) push('b', pick(NEUTRAL), 'neutro');
    else push('b', pick(FRIENDLY), 'feliz');
    delta = kind === 'desconhecido' ? 2 : kind === 'amigo' || kind === 'melhor-amigo' ? 4 : 3; trust = 2;
  }
  return { lines, delta, trust, escalate, kind, topic: topic?.k || null };
}

// memória: se já houve atrito entre os dois, a fala lembra disso; se não, conversa normal
function memoryLine(a, b) {
  const past = (a.lifeLog || []).filter((e) => e.text && e.text.includes(b.name.split(' ')[0]) && /discuss|brig|ofend|insult|desculp|ajud/i.test(e.text)).slice(-1)[0];
  if (!past) return null;
  if (/ajud|desculp/i.test(past.text)) return { reply: 'Ei! Nunca esqueci que você me ajudou.', emo: 'feliz' };
  return { reply: 'Olha só quem apareceu. Ainda lembra do que aconteceu entre a gente?', emo: 'irritado' };
}

// gera (e registra) uma conversa entre dois moradores, se o par estiver fora do tempo de espera
export function generateTalk(ctx, aId, bId) {
  const w = ctx.w; const s = D(w);
  if (aId === bId) throw new BankError('Não dá para conversar consigo mesmo');
  const a = personById(w, aId); const b = personById(w, bId);
  if (!a?.agent?.resident || !b?.agent?.resident) return null;
  if (a.agent.status !== 'ativo' || b.agent.status !== 'ativo') return null;
  const key = [aId, bId].sort().join('|');
  const now = gameNow(ctx.at.getTime());
  if (s.cool[key] != null && now - s.cool[key] < COOL_MIN * MIN) return null;
  s.cool[key] = now;
  const sc = buildScript(ctx, a, b);
  const id = `dlg${++s.seq}`;
  if (sc.delta) { bump(ctx, a, b, sc.delta, { trust: sc.trust, reason: sc.escalate ? 'discussão' : 'conversa' }); }
  if (sc.escalate) { a.agent.hostileUntil = new Date(ctx.at.getTime() + HOSTILE_MIN * MIN).toISOString(); b.agent.hostileUntil = a.agent.hostileUntil; }
  const summary = sc.escalate ? (sc.escalate === 'briga' ? `Briguei com ${b.name}` : `Discuti com ${b.name}`) : `Conversei com ${b.name}`;
  remember(a, genderize(a, `${summary}${sc.topic ? ` sobre ${sc.topic}` : ''}.`), ctx.at.toISOString());
  remember(b, genderize(b, `${summary.replace(b.name, a.name)}${sc.topic ? ` sobre ${sc.topic}` : ''}.`), ctx.at.toISOString());
  const talk = { id, at: ctx.at.toISOString(), a: { id: a.id, name: a.name }, b: { id: b.id, name: b.name }, kind: sc.kind, escalate: sc.escalate, topic: sc.topic, lines: sc.lines.map((l) => ({ who: l.who, id: l.id, name: l.name, text: l.text, emo: l.emo })) };
  s.list.push(talk); cap(s.list, 80);
  if (sc.escalate) {
    record(ctx, { type: 'discussao', cat: 'pessoal', title: sc.escalate === 'briga' ? `${a.name} e ${b.name} brigaram` : `${a.name} e ${b.name} discutiram`, text: sc.lines.slice(-2).map((l) => `${l.name}: ${l.text}`).join(' '), actors: [a.id, b.id], importance: sc.escalate === 'briga' ? 3 : 2 });
    services.live?.(w, { kind: 'ocorrencia', personaId: a.id, name: a.name, text: sc.escalate === 'briga' ? `${a.name} e ${b.name} se envolveram numa briga` : `${a.name} e ${b.name} discutiram na rua` });
  }
  return talk;
}

// ---------------------------------------------------------------- conversa com o jogador
const OPTIONS = [
  { tone: 'educada', label: 'Responder com educação' },
  { tone: 'neutra', label: 'Responder de forma neutra' },
  { tone: 'agressiva', label: 'Responder com agressividade' },
];
// opções contextuais (fase 3): cada uma aparece só quando a situação permite. `tone` é o efeito base (já testado);
// os extras (desculpar, acalmar, intimidar…) são aplicados depois em replyTalk.
export const OPCOES = [
  { id: 'cumprimentar', tone: 'educada', label: 'Cumprimentar', quando: (c) => !c.hostil },
  { id: 'educada', tone: 'educada', label: 'Responder com educação', quando: (c) => !c.evitaVoce },
  { id: 'neutra', tone: 'neutra', label: 'Responder de forma neutra', quando: (c) => !c.evitaVoce },
  { id: 'agressiva', tone: 'agressiva', label: 'Responder com agressividade', quando: (c) => !c.medo && !c.evitaVoce },
  { id: 'desculpa', tone: 'educada', label: 'Pedir desculpas', quando: (c) => c.hostil || c.ofendeu },
  { id: 'acontecimento', tone: 'neutra', label: 'Perguntar sobre o que aconteceu', quando: (c) => c.testemunhou && !c.evitaVoce },
  { id: 'ajuda', tone: 'educada', label: 'Pedir ajuda', quando: (c) => !c.hostil && !c.evitaVoce && c.confianca >= 35 },
  { id: 'acalmar', tone: 'educada', label: 'Acalmar a pessoa', quando: (c) => c.medo && !c.evitaVoce },
  { id: 'intimidar', tone: 'agressiva', label: 'Intimidar', quando: (c) => c.reputacaoRuim && !c.medo },
  { id: 'encerrar', tone: 'neutra', label: 'Encerrar a conversa', quando: () => true, encerra: true },
];
const MEDO = ['assustada', 'assustado', 'medo', 'triste'];
const CRIME_RE = /crime|acao-|mapa-|ferimento|atropel|roubo|furto|vandal|invas|prisao|queda|batida|discuss|tiro|assassin/;
// situação da pessoa com você agora: o que o contexto permite dizer
export function contextoDe(ctx, p) {
  const w = ctx.w; const a = p.agent; const u = a.user || {};
  const hostil = Boolean(a.hostileUntil && new Date(a.hostileUntil) > ctx.at);
  const ofendeu = (u.notes || []).slice(-3).some((n) => /insult|ofend|xing|agred|mentir|discut/i.test(n.text));
  const limite = ctx.at.getTime() - 6 * 3600000; // últimas 6 h de jogo (em tempo real, o que o relógio do mundo registra)
  const testemunhou = (w.events || []).some((e) => e.at && new Date(e.at).getTime() > limite && (e.actors || []).includes(p.id) && CRIME_RE.test(e.type || ''));
  const rep = account(w).reputation ?? 50;
  return {
    hostil, ofendeu, testemunhou,
    medo: MEDO.includes(p.mood?.emotion),
    confianca: Math.round(u.trust || 0), afeicao: Math.round(u.aff || 0),
    reputacao: rep, reputacaoRuim: rep < 30,
    evitaVoce: rep < 25 && (u.aff || 0) < -10, // reputação muito ruim e antipatia: quase não conversa
  };
}
export function opcoesDe(ctx, p) {
  const c = contextoDe(ctx, p);
  const out = OPCOES.filter((o) => o.quando(c)).map(({ id, tone, label, encerra }) => ({ id, tone, label, ...(encerra ? { encerra: true } : {}) }));
  if (!out.some((o) => o.encerra)) out.push({ id: 'encerrar', tone: 'neutra', label: 'Encerrar a conversa', encerra: true });
  return out;
}
const GREET = (_p, kind) => pick(OPENERS[kind] || OPENERS.conhecido);

// abre a conversa com o jogador: fala contextual, humor, relação e as três opções
export function openTalk(ctx, pid) {
  const w = ctx.w; const p = personById(w, pid);
  if (!p?.agent?.resident) throw new BankError('Essa pessoa não está disponível para conversar agora');
  const a = p.agent; const kind = relType({ aff: a.user.aff, bond: a.user.bond, met: Boolean(a.user.metAt) });
  const hostile = a.hostileUntil && new Date(a.hostileUntil) > ctx.at;
  const sheetHit = (a.user.notes || []).slice(-3).some((n) => /insult|ofend|xing|agred|mentir|discut/i.test(n.text));
  let greeting = hostile ? pick(['Ainda não esfriei a cabeça com você...', 'Você de novo? Melhor não começar.']) : sheetHit ? pick(['Olha só quem apareceu. Ainda lembra do que falou comigo?', 'Você de novo... bom, vamos ver.']) : GREET(p, kind);
  return {
    persona: { id: p.id, name: p.name, avatar: p.avatar, job: p.job, color: p.color, mood: p.mood?.emotion || 'neutro', relation: REL_LABEL[kind] || 'Conhecido', aff: Math.round(a.user.aff), trust: Math.round(a.user.trust), hostile: Boolean(hostile), tone: toneOf(p) },
    greeting: { text: greeting, emo: hostile ? 'irritado' : (p.mood?.emotion === 'triste' ? 'triste' : 'feliz') },
    options: opcoesDe(ctx, p),
    history: D(w).list.filter((t) => t.a.id === pid || t.b.id === pid).slice(-3).reverse().map((t) => ({ at: t.at, lines: t.lines.slice(0, 2) })),
  };
}

// resposta do jogador: a personalidade do morador decide a reação; o relacionamento muda com ela
export function replyTalk(ctx, pid, tone, opcaoId = null) {
  const w = ctx.w; const p = personById(w, pid);
  if (!p?.agent?.resident) throw new BankError('Essa pessoa não está disponível');
  const opc = opcaoId ? OPCOES.find((o) => o.id === opcaoId) : null;
  if (opc && !opcoesDe(ctx, p).some((o) => o.id === opc.id)) throw new BankError('Essa resposta não faz sentido agora');
  const opt = opc ? { tone: opc.tone, label: opc.label } : OPTIONS.find((o) => o.tone === tone); if (!opt) throw new BankError('Escolha uma das respostas');
  tone = opt.tone; // o tom base decide o efeito padrão; os extras vêm depois
  const t = toneOf(p); const a = p.agent;
  let text; let emo = 'neutro'; let delta = 0; let trust = 0; let ends = false; let escalate = null;
  if (tone === 'educada') {
    if (t.agressivo) { text = pick(['Ok... obrigado.', 'Tá, tudo bem.']); emo = 'neutro'; delta = 1; }
    else if (t.timido) { text = pick(['Ah... prazer. Eu sou tímido(a), desculpa.', 'Oi... prazer.']); emo = 'feliz'; delta = 4; trust = 2; }
    else if (t.arrogante) { text = pick(['Hum. Tanto faz, mas obrigado.', 'Até que você é educado(a).']); emo = 'neutro'; delta = 2; }
    else if (t.calmo) { text = pick([`Prazer! Eu sou ${first(p)}. Bem-vindo(a) ao bairro!`, 'Que bom te conhecer! Vamos conversar mais.']); emo = 'feliz'; delta = 6; trust = 4; }
    else { text = pick(['Que legal! Qualquer coisa, pode contar comigo.', 'Haha, prazer! Vamos nos ver por aí.']); emo = 'feliz'; delta = 5; trust = 3; }
  } else if (tone === 'neutra') {
    if (t.timido) { text = pick(['Ah... certo. Preciso ir.', 'Tchau...']); ends = true; delta = 0; }
    else if (t.extrovertido) { text = pick(['Hum, entendi. Você é de pouca conversa, né?', 'Certo, então. Bom dia!']); delta = 1; }
    else { text = pick(['Hum, entendi.', 'Pois é.', 'Tá bom.']); delta = 0; }
  } else { // agressiva
    if (t.agressivo) { text = pick(['Repete isso olhando na minha cara!', 'Quer ver quem é que manda aqui?']); emo = 'irritado'; delta = -10; trust = -6; if (Math.random() < 0.5) escalate = 'discussao'; }
    else if (t.calmo) { text = pick(['Não precisa falar assim comigo.', 'Calma aí, não é assim que se fala.']); emo = 'triste'; delta = -4; trust = -2; }
    else if (t.timido) { text = pick(['Tchau...', 'Desculpa, eu vou indo.']); emo = 'triste'; ends = true; delta = -6; trust = -3; }
    else if (t.arrogante) { text = pick(['E você acha que é quem?', 'Engraçado, vindo de quem vindo.']); emo = 'irritado'; delta = -6; trust = -4; }
    else if (t.sarcastico) { text = pick(['Nossa, que educação, hein.', 'Olha, que simpático(a) você é.']); emo = 'irritado'; delta = -5; trust = -3; }
    else { text = pick(['Hã? Que jeito é esse?', 'Ei, não me trata assim!']); emo = 'irritado'; delta = -5; trust = -3; }
  }
  // efeitos próprios das opções contextuais (fase 3)
  if (opc) {
    const c = contextoDe(ctx, p);
    if (opc.id === 'desculpa') {
      const calmo = t.calmo || t.timido; // quem é calmo ou tímido perdoa mais fácil
      const perdoa = Math.random() < (calmo ? 0.85 : 0.45);
      if (perdoa && c.hostil) { a.hostileUntil = null; text = pick(['Tá bom, esquece.', 'Tudo bem. Acontece.']); emo = 'neutro'; delta = Math.max(delta, 4); trust = Math.max(trust, 3); }
      else { text = pick(['Desculpa não resolve tudo.', 'Hum. Pensa melhor da próxima vez.']); emo = 'irritado'; delta = Math.min(delta, 0); }
    } else if (opc.id === 'acalmar') {
      p.mood = { emotion: 'neutro', intensity: 0.2, reason: 'foi acalmado(a) numa conversa' }; text = pick(['Obrigado... estou melhor.', 'Respirar ajuda. Valeu.']); emo = 'feliz'; delta = Math.max(delta, 3);
    } else if (opc.id === 'intimidar') {
      p.mood = { emotion: 'assustada', intensity: 0.8, reason: 'foi intimidado(a) por você' };
      text = pick(['Por favor, não me faz mal...', 'Eu não fiz nada! Me deixa em paz!']); emo = 'triste'; delta = -8; trust = -8;
      if (p.agent.traits.volatility > 0.7 && Math.random() < 0.5) escalate = 'discussao';
    } else if (opc.id === 'ajuda') {
      text = pick(['Claro! Me diz o que precisa.', 'Pode contar comigo, vizinho(a).']); emo = 'feliz'; delta = Math.max(delta, 3); trust = Math.max(trust, 5);
    } else if (opc.id === 'acontecimento') {
      const lim = ctx.at.getTime() - 6 * 3600000;
      const ev = (w.events || []).filter((e) => e.at && new Date(e.at).getTime() > lim && (e.actors || []).includes(p.id)).slice(-1)[0];
      text = ev ? `Eu vi: ${ev.title}. ${pick(['Foi horrível.', 'Ainda estou assustado(a).', 'Não sei o que deu nele(a).'])}` : 'Não sei de nada que tenha acontecido por aqui.';
      emo = 'surpresa';
    } else if (opc.id === 'encerrar') { ends = true; }
  }
  text = genderize(p, text);
  bumpUser(ctx, p, delta, { trust, note: `${opt.label.toLowerCase()}: ${text}` });
  if (tone === 'agressiva' && (delta <= -6 || escalate)) a.hostileUntil = new Date(ctx.at.getTime() + HOSTILE_MIN * MIN).toISOString();
  if (escalate) { record(ctx, { type: 'discussao', cat: 'pessoal', title: `Você e ${p.name} discutiram`, text: text, actors: ['me', p.id], importance: 2 }); }
  const talk = { id: `dlg${++D(w).seq}`, at: ctx.at.toISOString(), a: { id: 'me', name: 'Você' }, b: { id: p.id, name: p.name }, kind: 'usuario', escalate, topic: null, lines: [{ who: 'me', id: 'me', name: 'Você', text: opt.label, emo: tone === 'agressiva' ? 'irritado' : tone === 'educada' ? 'feliz' : 'neutro' }, { who: 'b', id: p.id, name: p.name, text, emo }] };
  D(w).list.push(talk); cap(D(w).list, 80);
  return { reply: { text, emo }, delta, ends, escalate, relation: REL_LABEL[relType({ aff: a.user.aff, bond: a.user.bond, met: true })] || 'Conhecido', aff: Math.round(a.user.aff), trust: Math.round(a.user.trust) };
}

export function recentTalks(w, limit = 20) { return D(w).list.slice(-limit).reverse(); }
