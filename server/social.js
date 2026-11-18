// Rede social da 2.0 ("Rede"): um mundo simulado só de pessoas-IA, um por conta do hub.
// O motor roda no servidor a cada 30 s, com ou sem a tela aberta: as pessoas postam, comentam, curtem,
// mudam de humor, passam por acontecimentos (bons e ruins), lembram do que viveram e mandam mensagem
// para quem é amigo. Novas pessoas surgem o tempo todo; quem o usuário adiciona vira personagem do chat.
// Com uma IA na nuvem configurada (Gemini/Groq/OpenRouter) os textos são escritos por ela; sem IA,
// um gerador local mantém o mundo vivo. Se o computador ficou desligado, o tempo perdido é "recuperado"
// na volta (posts com o horário em que teriam acontecido).
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { db, id, now, save, UPLOAD_DIR } from './db.js';
import { emit } from './notify.js';
import { single, removeUpload } from './routes/uploads.js';
import { assistantMode, isCloud, geminiJSON, aiWrite, deliverMessage, createConversation, listConversations } from './assistant.js';
import { searchWeb, fetchPageText } from './webtools.js';

// ---------------------------------------------------------------- utilidades
const rnd = (n) => Math.floor(Math.random() * n);
const pick = (a) => a[rnd(a.length)];
const chance = (p) => Math.random() < p;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const ago = (iso) => Date.now() - new Date(iso || 0).getTime();
const str = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const longStr = (v, max) => String(v ?? '').trim().slice(0, max);

export const LIMITS = { personas: 160, minPersonas: 24, posts: 700, comments: 40, lifeLog: 40, searches: 30 };
export const PACE = {
  calma: { post: [150, 420], spawnMin: 90, reactions: 1, aiEvery: 8 },
  normal: { post: [60, 240], spawnMin: 35, reactions: 2, aiEvery: 4 },
  agitada: { post: [25, 110], spawnMin: 15, reactions: 4, aiEvery: 2 },
};

export function net(userId) {
  const d = db();
  d.social ??= {};
  const s = (d.social[userId] ??= {});
  s.personas ??= []; s.posts ??= []; s.searches ??= [];
  s.cfg ??= {};
  s.cfg = { enabled: true, pace: 'normal', photos: true, dms: true, ...s.cfg };
  s.lastTick ??= null; s.lastSpawn ??= null; s.lastAi ??= null;
  return s;
}

// ---------------------------------------------------------------- matéria-prima do gerador local
const BR_F = ['Ana', 'Beatriz', 'Camila', 'Daniela', 'Eduarda', 'Fernanda', 'Gabriela', 'Helena', 'Isabela', 'Júlia', 'Larissa', 'Luana', 'Mariana', 'Natália', 'Paula', 'Rafaela', 'Sofia', 'Tainá', 'Valentina', 'Yasmin', 'Bruna', 'Letícia', 'Manuela', 'Jéssica', 'Priscila', 'Rebeca', 'Lívia', 'Clara', 'Alice', 'Vitória'];
const BR_M = ['André', 'Bruno', 'Caio', 'Diego', 'Eduardo', 'Felipe', 'Gustavo', 'Henrique', 'Igor', 'João', 'Kauã', 'Lucas', 'Matheus', 'Nicolas', 'Otávio', 'Pedro', 'Rafael', 'Samuel', 'Thiago', 'Vinícius', 'Wesley', 'Arthur', 'Davi', 'Gabriel', 'Leonardo', 'Murilo', 'Renan', 'Danilo', 'Enzo', 'Heitor'];
const BR_L = ['Silva', 'Santos', 'Oliveira', 'Souza', 'Lima', 'Pereira', 'Costa', 'Rodrigues', 'Almeida', 'Nascimento', 'Carvalho', 'Araújo', 'Ribeiro', 'Gomes', 'Martins', 'Rocha', 'Barbosa', 'Cardoso', 'Teixeira', 'Moreira', 'Freitas', 'Mendes', 'Castro', 'Pinto', 'Duarte'];
const BR_CITIES = [['São Paulo', 'SP'], ['Rio de Janeiro', 'RJ'], ['Belo Horizonte', 'MG'], ['Salvador', 'BA'], ['Recife', 'PE'], ['Fortaleza', 'CE'], ['Curitiba', 'PR'], ['Porto Alegre', 'RS'], ['Manaus', 'AM'], ['Belém', 'PA'], ['Goiânia', 'GO'], ['Florianópolis', 'SC'], ['Natal', 'RN'], ['João Pessoa', 'PB'], ['Campinas', 'SP'], ['Brasília', 'DF'], ['Vitória', 'ES'], ['São Luís', 'MA'], ['Cuiabá', 'MT'], ['Maceió', 'AL']];
// [país, fuso (UTC), idioma, cidades, nomes femininos, nomes masculinos, sobrenomes]
const WORLD = [
  ['Portugal', 0, 'pt', ['Lisboa', 'Porto', 'Coimbra'], ['Inês', 'Matilde', 'Leonor'], ['Tiago', 'Duarte', 'Rodrigo'], ['Ferreira', 'Sousa', 'Fonseca']],
  ['Estados Unidos', -5, 'en', ['New York', 'Chicago', 'Austin', 'Miami'], ['Emily', 'Madison', 'Olivia', 'Ava'], ['Jake', 'Ethan', 'Mason', 'Logan'], ['Johnson', 'Miller', 'Davis', 'Walker']],
  ['Estados Unidos', -8, 'en', ['Los Angeles', 'San Francisco', 'Seattle'], ['Chloe', 'Harper', 'Zoe'], ['Ryan', 'Tyler', 'Caleb'], ['Nguyen', 'Garcia', 'Clark']],
  ['Reino Unido', 0, 'en', ['London', 'Manchester', 'Bristol'], ['Amelia', 'Isla', 'Poppy'], ['Oliver', 'Harry', 'Alfie'], ['Smith', 'Taylor', 'Evans']],
  ['Canadá', -5, 'en', ['Toronto', 'Montreal', 'Vancouver'], ['Charlotte', 'Maya'], ['Liam', 'Noah'], ['Tremblay', 'Roy', 'Wilson']],
  ['Austrália', 10, 'en', ['Sydney', 'Melbourne'], ['Ruby', 'Mia'], ['Jack', 'Cooper'], ['Brown', 'Kelly']],
  ['Japão', 9, 'en', ['Tóquio', 'Osaka', 'Kyoto'], ['Yui', 'Haruka', 'Sakura'], ['Haruto', 'Ren', 'Sota'], ['Sato', 'Tanaka', 'Suzuki']],
  ['Coreia do Sul', 9, 'en', ['Seul', 'Busan'], ['Ji-woo', 'Seo-yeon'], ['Min-jun', 'Do-yun'], ['Kim', 'Park', 'Lee']],
  ['Alemanha', 1, 'en', ['Berlim', 'Munique', 'Hamburgo'], ['Lena', 'Hannah'], ['Lukas', 'Felix'], ['Müller', 'Schmidt', 'Weber']],
  ['Itália', 1, 'en', ['Roma', 'Milão', 'Nápoles'], ['Giulia', 'Chiara'], ['Lorenzo', 'Matteo'], ['Rossi', 'Russo', 'Bianchi']],
  ['Argentina', -3, 'es', ['Buenos Aires', 'Córdoba', 'Rosário'], ['Lucía', 'Martina'], ['Mateo', 'Santiago'], ['González', 'Fernández']],
  ['México', -6, 'es', ['Cidade do México', 'Guadalajara'], ['Ximena', 'Regina'], ['Diego', 'Emiliano'], ['Hernández', 'López']],
  ['Angola', 1, 'pt', ['Luanda', 'Benguela'], ['Djamila', 'Ngozi'], ['Edson', 'Kiala'], ['Mendes', 'Neto']],
  ['Índia', 5, 'en', ['Mumbai', 'Bangalore'], ['Priya', 'Ananya'], ['Arjun', 'Rohan'], ['Sharma', 'Patel']],
];
const JOBS = ['enfermeira(o)', 'motorista de aplicativo', 'professor(a) de história', 'desenvolvedor(a) júnior', 'confeiteira(o)', 'estudante de medicina', 'designer freelancer', 'barista', 'vendedor(a) de loja', 'mecânico(a)', 'advogada(o) recém-formada(o)', 'fotógrafa(o)', 'cozinheira(o) de restaurante', 'personal trainer', 'atendente de call center', 'engenheira(o) civil', 'tatuador(a)', 'músico(a) de barzinho', 'veterinária(o)', 'estudante de direito', 'youtuber pequena(o)', 'analista de dados', 'cabeleireira(o)', 'pedreiro(a)', 'bióloga(o)', 'jornalista', 'garçom/garçonete', 'gamer e streamer', 'psicóloga(o)', 'dono(a) de uma lojinha online'];
const INTERESTS = ['café', 'futebol', 'k-pop', 'animes', 'academia', 'corrida', 'cozinhar', 'séries', 'games', 'astronomia', 'plantas', 'gatos', 'cachorros', 'viagens', 'fotografia', 'livros', 'música sertaneja', 'rock antigo', 'trap', 'tecnologia', 'investimentos', 'moda', 'maquiagem', 'carros', 'skate', 'praia', 'teatro', 'memes', 'história', 'política', 'religião', 'filosofia', 'basquete', 'dança', 'tatuagens', 'crochê', 'cerveja artesanal', 'trilhas'];
const TRAITS = ['otimista', 'ansiosa(o)', 'sarcástica(o)', 'carinhosa(o)', 'tímida(o)', 'explosiva(o)', 'muito engraçada(o)', 'reflexiva(o)', 'competitiva(o)', 'sonhadora(o)', 'desconfiada(o)', 'leal', 'dramática(o)', 'curiosa(o)', 'teimosa(o)', 'calma(o)', 'perfeccionista', 'sentimental'];
const PROBLEMS = ['está atrasada(o) com o aluguel', 'terminou um namoro de 3 anos', 'não aguenta mais o chefe', 'está tentando passar num concurso', 'a mãe está doente', 'quer mudar de carreira e tem medo', 'brigou com a melhor amiga(o)', 'está sem dormir direito', 'a moto quebrou de novo', 'está juntando dinheiro para viajar', 'tem crises de ansiedade', 'acabou de se mudar e não conhece ninguém', 'está desempregada(o) há dois meses', 'tem uma dívida no cartão', 'está apaixonada(o) por alguém do trabalho', 'quer emagrecer e não consegue', 'o cachorro está velhinho', 'vai ser mãe/pai pela primeira vez', 'está estudando inglês para morar fora', 'tem saudade de casa'];
const STORIES = ['cresceu no interior e veio para a cidade grande sozinha(o)', 'é a(o) primeira(o) da família a fazer faculdade', 'criou os irmãos mais novos depois que o pai saiu de casa', 'já morou em três países diferentes', 'largou tudo para abrir um negócio próprio', 'superou uma depressão e hoje fala abertamente sobre isso', 'foi atleta na adolescência até uma lesão', 'mora com a avó, que é sua melhor amiga', 'foi criada(o) pelos tios numa cidade litorânea', 'trabalha desde os 14 anos', 'é filha(o) única(o) e sempre quis ter irmãos', 'voltou a estudar depois dos 30'];
export const EMOTIONS = {
  feliz: { emoji: '😄', valence: 1 }, animada: { emoji: '🤩', valence: 1 }, grata: { emoji: '🥹', valence: 1 }, apaixonada: { emoji: '😍', valence: 1 },
  orgulhosa: { emoji: '😤', valence: 1 }, tranquila: { emoji: '😌', valence: 0.5 }, nostalgica: { emoji: '🥲', valence: 0 }, entediada: { emoji: '😑', valence: -0.3 },
  cansada: { emoji: '😮‍💨', valence: -0.5 }, ansiosa: { emoji: '😰', valence: -0.8 }, triste: { emoji: '😢', valence: -1 }, irritada: { emoji: '😠', valence: -0.8 },
  sozinha: { emoji: '🥀', valence: -0.9 }, confusa: { emoji: '😵‍💫', valence: -0.3 },
};
const EMOTION_KEYS = Object.keys(EMOTIONS);
const PERSONALITIES = ['amigavel', 'divertido', 'mentor', 'zen', 'nerd', 'profissional'];
const COLORS = ['#e0464b', '#f5a524', '#7c3aed', '#22c55e', '#06b6d4', '#ec4899', '#3b82f6', '#f97316', '#14b8a6', '#a855f7', '#84cc16', '#ef4444'];

// Acontecimentos da vida: mudam humor, problema atual e viram memória.
const LIFE_EVENTS = [
  { mood: 'triste', text: 'perdeu o emprego hoje', problem: 'precisa achar um emprego novo rápido', post: ['Fui desligada(o) hoje. Ainda não caiu a ficha.', 'Hoje foi o pior dia do ano. Perdi o emprego.'] },
  { mood: 'feliz', text: 'conseguiu um emprego novo', problem: null, post: ['CONSEGUI O EMPREGO!!! Começo segunda 😭🙏', 'Depois de tanta entrevista, finalmente: contratada(o)!'] },
  { mood: 'apaixonada', text: 'conheceu alguém especial', problem: null, post: ['Não vou falar nada, mas hoje foi um dia muito bom 🙈', 'Tem gente que chega e muda o clima de tudo, né?'] },
  { mood: 'triste', text: 'terminou o relacionamento', problem: 'está tentando superar o término', post: ['Acabou. Não quero falar sobre isso, só precisava colocar pra fora.', 'Engraçado como uma casa fica grande quando alguém vai embora.'] },
  { mood: 'grata', text: 'adotou um bichinho', problem: null, post: ['Apresento o novo morador da casa 🐾 ainda sem nome, aceito sugestões', 'Adotei! O coração não cabe no peito.'] },
  { mood: 'orgulhosa', text: 'passou numa prova importante', problem: null, post: ['PASSEI!!! Todas aquelas madrugadas valeram a pena.', 'Aprovada(o)! Quem disse que eu não ia conseguir?'] },
  { mood: 'cansada', text: 'ficou doente', problem: 'está se recuperando de uma gripe forte', post: ['Gripe derrubou. Chá, coberta e série.', 'Três dias de cama. Saúde é tudo, gente.'] },
  { mood: 'ansiosa', text: 'recebeu uma conta inesperada alta', problem: 'precisa pagar uma conta inesperada', post: ['Chegou uma conta que eu nem sabia que existia. Socorro.', 'Quando você acha que o mês vai fechar no azul...'] },
  { mood: 'irritada', text: 'brigou feio com alguém da família', problem: 'está sem falar com um parente', post: ['Família é complicado. Hoje eu só queria paz.', 'Tem dia que é melhor nem abrir a boca no almoço de domingo.'] },
  { mood: 'animada', text: 'marcou uma viagem', problem: null, post: ['Passagem comprada ✈️ agora é contar os dias', 'Vou viajar!!! Primeira viagem sozinha(o).'] },
  { mood: 'nostalgica', text: 'achou fotos antigas da infância', problem: null, post: ['Achei uma caixa de fotos antigas e passei a tarde chorando de saudade.', 'Que saudade de quando o maior problema era a hora de entrar pra jantar.'] },
  { mood: 'sozinha', text: 'passou o fim de semana sem falar com ninguém', problem: 'está se sentindo sozinha(o)', post: ['Fim de semana inteiro sem conversar com ninguém. Alguém aí?', 'Às vezes a cidade é cheia e a gente se sente vazio.'] },
  { mood: 'orgulhosa', text: 'foi promovida(o)', problem: null, post: ['Promoção! Muito trabalho, mas chegou 🥂', 'Hoje meu chefe me chamou na sala e eu achei que era bronca. Era promoção 😭'] },
  { mood: 'confusa', text: 'recebeu uma proposta para morar em outra cidade', problem: 'não sabe se aceita mudar de cidade', post: ['Recebi uma proposta pra morar longe. Aceito ou fico? Me ajudem.', 'Uma decisão dessas não dá pra tomar sozinha(o).'] },
];

const MOOD_LINES = {
  feliz: ['Que dia bom!', 'Hoje tá tudo dando certo.', 'Sorrindo à toa.'], animada: ['Não vejo a hora!', 'Bora!!!', 'Energia lá em cima.'],
  grata: ['Só gratidão.', 'Obrigada(o), vida.', 'Coração quentinho.'], apaixonada: ['Tô boba(o) hoje.', 'Borboletas no estômago, sim.'],
  orgulhosa: ['Me sentindo capaz.', 'Ninguém me para.'], tranquila: ['Paz.', 'Sem pressa hoje.', 'Silêncio bom.'],
  nostalgica: ['Saudade de tanta coisa.', 'O tempo passa rápido demais.'], entediada: ['Nada pra fazer.', 'Que dia arrastado.'],
  cansada: ['Exausta(o).', 'Só quero minha cama.', 'Bateria em 2%.'], ansiosa: ['Cabeça não para.', 'Respira...', 'Coração acelerado sem motivo.'],
  triste: ['Dia difícil.', 'Só queria um abraço.', 'Não tô bem, mas vai passar.'], irritada: ['Paciência zerada.', 'Não me provoquem hoje.'],
  sozinha: ['Alguém pra conversar?', 'Meio sozinha(o) hoje.'], confusa: ['Não sei o que fazer.', 'Cabeça a mil.'],
};
const POST_TPL = [
  (p) => `Mais um dia de ${p.job} aqui em ${p.city}. ${moodLine(p)}`,
  (p) => `Alguém mais acha que ${pick(p.interests)} salva qualquer semana?`,
  (p) => `${pick(['Pensando aqui', 'Reflexão do dia', 'Verdade que ninguém fala'])}: ${pick(['a gente se cobra demais', 'descansar também é produtividade', 'ninguém tá com a vida resolvida', 'amizade de verdade é rara', 'dinheiro não compra paz, mas ajuda muito'])}.`,
  (p) => (p.problem ? `${pick(['Desabafo:', 'Real oficial:', 'Ninguém pergunta, mas', 'Sobre a vida:'])} ${firstPerson(p.problem)}. ${moodLine(p)}` : `Fase boa. ${moodLine(p)}`),
  (p) => `Hoje teve ${pick(p.interests)} e foi exatamente o que eu precisava. ${EMOTIONS[p.mood.emotion].emoji}`,
  (p) => `${pick(['Bom dia', 'Boa tarde', 'Boa noite'])}, mundo. ${moodLine(p)}`,
  (p) => `Opinião impopular: ${pick(['café sem açúcar é melhor', 'segunda-feira nem é tão ruim', 'áudio de 5 minutos devia ser crime', 'praia lotada não é passeio', 'série boa é série curta', 'pizza de domingo é sagrada'])}.`,
  (p) => `${pick(['Quem mais', 'Só eu que'])} ${pick(['dorme tarde e jura que vai dormir cedo amanhã', 'abre a geladeira dez vezes esperando aparecer comida', 'fica nervosa(o) pra ligar pra alguém', 'salva meme pra mandar e esquece'])}? kkkk`,
  (p) => `#${tagOf(pick(p.interests))} ${pick(['é vida', 'é terapia', 'nunca decepciona', 'me salvou hoje'])}.`,
];
const POST_TPL_EN = [
  (p) => `Another day in ${p.city}. ${pick(['Coffee first.', 'Feeling good today.', 'Tired but grateful.', 'Rain again, of course.'])}`,
  (p) => `Hot take: ${pick(p.interests)} ${pick(['is underrated', 'fixes everything', 'is my therapy'])}.`,
  (p) => `${pick(['Can someone explain why', 'Why does'])} ${pick(['Monday feel so long', 'my cat stare at the wall', 'rent keep going up'])}? 😩`,
  (p) => `Small win today: ${pick(['finally finished that project', 'went for a run', 'cooked a real dinner', 'called my mom'])}. ${EMOTIONS[p.mood.emotion].emoji}`,
];
const COMMENT_POS = ['Que demais!! 👏', 'Amei isso', 'Merece muito!', 'Orgulho de você 💛', 'Isso aí!!', 'Que fase boa, aproveita', 'Parabéns de verdade 🥳', 'kkkk que lindo'];
const COMMENT_NEG = ['Força, {n}. Tô aqui se precisar 💛', 'Passei por isso ano passado, melhora, juro.', 'Manda mensagem se quiser conversar', 'Abraço apertado 🫂', 'Respira, um dia de cada vez.', 'Você não tá sozinha(o) nessa.'];
const COMMENT_ANY = ['Real demais', 'Concordo total', 'kkkkk eu mesma(o)', 'Falou tudo', 'Isso é muito verdade', 'Discordo um pouco, mas respeito 😅', 'Exatamente o que eu tava pensando', 'Hahaha que isso', 'Pensei a mesma coisa hoje'];
const COMMENT_EN = ['Same here 😂', 'Love this', 'So true', 'Sending hugs ❤️', 'Congrats!!', 'This is it.'];
const PHOTO_TPL = [
  (p) => [`Registro do dia ${EMOTIONS[p.mood.emotion].emoji}`, `${p.interests[0]} related candid smartphone photo, natural light, ${p.city}`],
  (p) => ['Vista daqui hoje', `view from a window in ${p.city}, ${pick(['sunset', 'rainy afternoon', 'morning light', 'night city lights'])}, smartphone photo`],
  (p) => ['Meu cantinho', `cozy small apartment corner with ${pick(['plants', 'books', 'a guitar', 'a gaming setup', 'a cat sleeping'])}, warm light, smartphone photo`],
  (p) => ['Almoço de hoje', `homemade ${pick(['brazilian rice and beans plate', 'pasta', 'salad bowl', 'burger', 'sushi'])} on a table, smartphone food photo`],
];

const tagOf = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '').toLowerCase() || 'vida';
const moodLine = (p) => pick(MOOD_LINES[p.mood.emotion] || MOOD_LINES.tranquila);
// "cansada(o)", "músico(a)", "professor(a)" -> forma do gênero da pessoa
const g = (p, text) => {
  const f = p.gender !== 'm';
  return String(text)
    .replace(/(\p{L}+)o\(a\)/gu, (m, a) => `${a}${f ? 'a' : 'o'}`)
    .replace(/(\p{L}+)a\(o\)/gu, (m, a) => `${a}${f ? 'a' : 'o'}`)
    .replace(/(\p{L}+)\(a\)/gu, (m, a) => (f ? `${a}a` : a))
    .replace(/(^|[\s(])a\(o\)(?=\s)/gu, (m, pre) => `${pre}${f ? 'a' : 'o'}`)
    .replace(/mãe\/pai/g, f ? 'mãe' : 'pai').replace(/garçom\/garçonete/g, f ? 'garçonete' : 'garçom');
};
// "está desempregada há dois meses" -> "estou desempregada há dois meses"
const FIRST = [[/^está /, 'estou '], [/^tem /, 'tenho '], [/^quer /, 'quero '], [/^terminou /, 'terminei '], [/^brigou /, 'briguei '], [/^acabou /, 'acabei '],
  [/^não aguenta /, 'não aguento '], [/^vai /, 'vou '], [/^a mãe /, 'minha mãe '], [/^o cachorro /, 'meu cachorro '], [/^a moto /, 'minha moto '], [/^precisa /, 'preciso '], [/^não sabe /, 'não sei ']];
const firstPerson = (t) => FIRST.reduce((acc, [re, rep]) => acc.replace(re, rep), String(t || ''));
const fmt = (p, text, extra = {}) => g(p, text).replace(/\{n\}/g, extra.n || '');
const handleOf = (name, taken) => {
  const base = String(name).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 14) || 'user';
  let h = base;
  while (taken.has(h)) h = `${base}${pick(['', '_', '.'])}${rnd(999)}`;
  return h;
};

// ---------------------------------------------------------------- pessoas
function localPersona(s, extra = {}) {
  const gender = extra.gender || (chance(0.5) ? 'f' : 'm');
  let name; let city; let country = 'Brasil'; let tz = -3; let lang = 'pt';
  if (chance(0.62)) {
    name = `${pick(gender === 'f' ? BR_F : BR_M)} ${pick(BR_L)}`;
    const c = pick(BR_CITIES); city = `${c[0]} – ${c[1]}`;
    if (c[1] === 'AM') tz = -4;
  } else {
    const w = pick(WORLD);
    [country, tz, lang] = w;
    name = `${pick(gender === 'f' ? w[4] : w[5])} ${pick(w[6])}`;
    city = pick(w[3]);
  }
  const taken = new Set(s.personas.map((p) => p.handle));
  const interests = [...new Set(Array.from({ length: 3 + rnd(2) }, () => pick(INTERESTS)))];
  const traits = [...new Set([pick(TRAITS), pick(TRAITS)])];
  const p = {
    id: id(), handle: handleOf(name.split(' ')[0] + (chance(0.5) ? name.split(' ')[1] : ''), taken), name, gender,
    age: 18 + rnd(45), city, country, tz, lang, job: pick(JOBS), interests, traits,
    story: pick(STORIES), problem: chance(0.75) ? pick(PROBLEMS) : null, goal: pick(['juntar dinheiro', 'ser feliz de verdade', 'viajar o mundo', 'ter a própria casa', 'mudar de profissão', 'encontrar alguém', 'cuidar melhor da saúde', 'ficar famosa(o) na internet']),
    personality: pick(PERSONALITIES), voice: pick(['escreve tudo em minúsculas e usa muito "kkkk"', 'escreve certinho, com pontuação', 'usa muitas gírias', 'manda frases curtas e diretas', 'usa muitos emojis', 'é irônica(o) e engraçada(o)', 'fala de um jeito doce e acolhedor']),
    mood: { emotion: pick(['feliz', 'tranquila', 'cansada', 'ansiosa', 'animada', 'entediada', 'nostalgica']), intensity: 0.4 + Math.random() * 0.5, reason: '' },
    color: pick(COLORS), avatar: null, avatarTried: false, followers: 40 + rnd(chance(0.08) ? 90000 : 2400), verified: chance(0.04),
    activity: 0.6 + Math.random() * 0.9, lifeLog: [], relations: {}, friend: false, botId: null, source: 'local',
    createdAt: now(), nextPostAt: new Date(Date.now() + rnd(40) * MIN).toISOString(), lastPostAt: null, lastDmAt: null, dmsToday: { day: '', n: 0 },
    ...extra,
  };
  for (const k of ['job', 'story', 'problem', 'goal', 'voice']) if (p[k]) p[k] = g(p, p[k]);
  p.traits = p.traits.map((t) => g(p, t));
  p.bio = p.bio || g(p, `${p.job.replace(/^./, (c) => c.toUpperCase())} · ${p.city} · ${p.interests.slice(0, 2).join(' e ')} ${pick(['☕', '✨', '🌻', '🎧', '🔥', '🌙', '📚', '⚽'])}`);
  remember(p, `Entrou na rede.${p.problem ? ` Momento atual: ${p.problem}.` : ''}`);
  return p;
}

function cleanAiPersona(s, a) {
  const base = localPersona(s, { gender: a.genero === 'm' || a.gender === 'm' ? 'm' : 'f' });
  const pickStr = (v, max, fallback) => str(v, max) || fallback;
  const p = {
    ...base,
    name: pickStr(a.nome, 50, base.name), age: clamp(Number(a.idade) || base.age, 16, 90), city: pickStr(a.cidade, 60, base.city), country: pickStr(a.pais, 40, base.country),
    tz: Number.isFinite(Number(a.fuso)) ? clamp(Math.round(Number(a.fuso)), -11, 13) : base.tz, lang: ['pt', 'en', 'es'].includes(a.idioma) ? a.idioma : base.lang,
    job: pickStr(a.profissao, 80, base.job), bio: pickStr(a.bio, 160, base.bio), story: pickStr(a.historia, 600, base.story), problem: str(a.problema, 200) || null,
    goal: pickStr(a.sonho, 160, base.goal), voice: pickStr(a.jeito_de_escrever, 200, base.voice),
    interests: Array.isArray(a.interesses) && a.interesses.length ? a.interesses.slice(0, 6).map((x) => str(x, 30)).filter(Boolean) : base.interests,
    traits: Array.isArray(a.tracos) && a.tracos.length ? a.tracos.slice(0, 4).map((x) => str(x, 30)).filter(Boolean) : base.traits,
    mood: { emotion: EMOTION_KEYS.includes(a.humor) ? a.humor : base.mood.emotion, intensity: 0.6, reason: str(a.motivo_humor, 160) },
    looks: str(a.aparencia_em_ingles, 240), source: 'ia', lifeLog: [],
  };
  p.handle = handleOf(p.name.replace(/\s+/g, ''), new Set(s.personas.map((x) => x.handle)));
  remember(p, `Entrou na rede.${p.problem ? ` Momento atual: ${p.problem}.` : ''}`);
  return p;
}

function remember(p, text, at = now()) {
  p.lifeLog.push({ at, text: str(text, 300) });
  if (p.lifeLog.length > LIMITS.lifeLog) {
    p.lifeLog.sort((x, y) => x.at.localeCompare(y.at)); // o tempo recuperado entra fora de ordem
    p.lifeLog.splice(0, p.lifeLog.length - LIMITS.lifeLog);
  }
}

function addPersona(userId, s, p) {
  s.personas.push(p);
  // a rede tem limite: quem está há mais tempo sem postar (e não é amigo) "sai da rede"
  if (s.personas.length > LIMITS.personas) {
    const removable = s.personas.filter((x) => !x.friend && !x.botId).sort((a, b) => (a.lastPostAt || a.createdAt).localeCompare(b.lastPostAt || b.createdAt));
    for (const x of removable.slice(0, s.personas.length - LIMITS.personas)) removePersona(s, x);
  }
  if (s.cfg.photos) queueAvatar(userId, p);
  emit(userId, 'social', { type: 'persona', persona: publicPersona(s, p) });
  return p;
}

function removePersona(s, p) {
  s.personas = s.personas.filter((x) => x.id !== p.id);
  for (const post of s.posts.filter((x) => x.personaId === p.id)) if (post.image) removeUpload(post.image);
  s.posts = s.posts.filter((x) => x.personaId !== p.id);
  for (const post of s.posts) post.comments = post.comments.filter((c) => c.personaId !== p.id);
  if (p.avatar && !db().bots.some((b) => b.avatar === p.avatar)) removeUpload(p.avatar);
}

async function aiPersonas(s, n = 3) {
  const out = await geminiJSON(`Crie ${n} pessoas fictícias e MUITO diferentes entre si para uma rede social global (estilo X/Twitter). Elas não sabem que são fictícias: têm vida, emoções, histórias, contradições e problemas reais.
Misture idades (16 a 75), classes sociais, países (a maioria do Brasil, algumas de outros países) e personalidades (há gente engraçada, chata, insegura, arrogante, doce, polêmica, depressiva, otimista...).
Já existem na rede: ${s.personas.slice(-25).map((p) => p.name).join(', ') || 'ninguém'} — não repita nomes.
Responda SÓ com JSON: {"pessoas":[{"nome":"","genero":"f|m","idade":0,"cidade":"","pais":"","fuso":-3,"idioma":"pt|en|es","profissao":"","bio":"bio curta do perfil com emoji","historia":"3 frases sobre a vida e o passado","problema":"o que a pessoa está enfrentando agora (ou vazio)","sonho":"","interesses":["","",""],"tracos":["",""],"jeito_de_escrever":"como escreve nas redes","humor":"${EMOTION_KEYS.join('|')}","motivo_humor":"","aparencia_em_ingles":"aparência física curta, em inglês, para gerar foto"}]}`, 3500, 1);
  return (Array.isArray(out?.pessoas) ? out.pessoas : []).slice(0, n).map((a) => cleanAiPersona(s, a));
}

// Personagens que já existiam no chat também têm vida na rede.
function syncBots(user, s) {
  const bots = db().bots.filter((b) => b.userId === user.id);
  for (const b of bots) {
    let p = s.personas.find((x) => x.botId === b.id) || (b.personaId && s.personas.find((x) => x.id === b.personaId));
    if (!p) {
      p = localPersona(s, { name: b.name, friend: true, botId: b.id, avatar: b.avatar || null, avatarTried: Boolean(b.avatar), color: b.color || pick(COLORS), personality: b.personality || 'amigavel', fromBot: true, tz: -3, lang: 'pt', country: 'Brasil' });
      if (b.traits) { p.story = str(b.traits, 600); p.bio = str(b.traits, 150); }
      p.handle = handleOf(b.name, new Set(s.personas.map((x) => x.handle)));
      s.personas.push(p);
      if (s.cfg.photos && !p.avatar) queueAvatar(user.id, p);
    }
    p.friend = true; p.botId = b.id; p.name = b.name;
    if (b.avatar && p.avatar !== b.avatar) p.avatar = b.avatar;
    if (b.personaId !== p.id) b.personaId = p.id;
  }
  // personagem apagado do chat continua vivendo na rede, mas deixa de ser amigo
  for (const p of s.personas) if (p.botId && !bots.some((b) => b.id === p.botId)) { p.friend = false; p.botId = null; }
}

// ---------------------------------------------------------------- humor e acontecimentos
function settleMood(p) {
  // o humor tende a voltar ao normal com o tempo
  p.mood.intensity = clamp((p.mood.intensity || 0.5) - 0.04, 0.2, 1);
  if (p.mood.intensity <= 0.25 && chance(0.4)) p.mood = { emotion: pick(['tranquila', 'feliz', 'cansada', 'entediada', 'ansiosa', 'nostalgica']), intensity: 0.5, reason: '' };
}

function lifeEvent(p, at = now()) {
  const ev = pick(LIFE_EVENTS);
  p.mood = { emotion: ev.mood, intensity: 0.9, reason: g(p, ev.text) };
  if (ev.problem !== undefined) p.problem = ev.problem ? g(p, ev.problem) : (chance(0.5) ? null : p.problem);
  remember(p, g(p, `${ev.text.replace(/^./, (c) => c.toUpperCase())}.`), at);
  return { ...ev, postText: g(p, pick(ev.post)) };
}

// ---------------------------------------------------------------- posts, comentários e curtidas
function makePost(s, p, text, { at = now(), image = null, imagePrompt = null, kind = 'texto' } = {}) {
  const post = {
    id: id(), personaId: p ? p.id : 'me', text: longStr(text, 600), image, imagePrompt, kind, mood: p ? { ...p.mood } : null,
    at, likes: [], likeBoost: p ? rnd(Math.max(3, Math.round((p.followers || 50) / 60))) : 0, comments: [], views: 0,
  };
  s.posts.push(post);
  if (s.posts.length > LIMITS.posts) {
    for (const old of s.posts.splice(0, s.posts.length - LIMITS.posts)) if (old.image) removeUpload(old.image);
  }
  if (p) { p.lastPostAt = at; remember(p, `Postei: "${str(text, 140)}"`, at); }
  return post;
}

const imagesOn = (s) => s.cfg.photos && process.env.CODENIAC_NO_IMAGES !== '1';
function localPostFor(p, ev = null, photos = false) {
  if (ev) return { text: ev.postText };
  if (p.lang !== 'pt' && chance(0.7)) return { text: pick(POST_TPL_EN)(p) };
  if (photos && chance(0.16)) { const [text, prompt] = pick(PHOTO_TPL)(p); return { text, imagePrompt: prompt }; }
  return { text: fmt(p, pick(POST_TPL)(p)) };
}

function localCommentFor(p, post, author) {
  const v = EMOTIONS[post.mood?.emotion]?.valence ?? 0;
  const list = p.lang !== 'pt' && chance(0.6) ? COMMENT_EN : v <= -0.5 ? COMMENT_NEG : v >= 0.8 ? COMMENT_POS : COMMENT_ANY;
  const used = new Set(post.comments.map((c) => c.text));
  const options = list.map((t) => fmt(p, t, { n: (author?.name || '').split(' ')[0] })).filter((t) => !used.has(t));
  return options.length ? pick(options) : null;
}

function addComment(userId, s, post, author, text, { at = now(), replyTo = null } = {}) {
  if (!str(text, 400)) return null;
  const c = { id: id(), personaId: author ? author.id : 'me', text: longStr(text, 400), at, likes: [], replyTo };
  post.comments.push(c);
  if (post.comments.length > LIMITS.comments) post.comments.splice(0, post.comments.length - LIMITS.comments);
  if (author) {
    const target = post.personaId;
    if (target !== 'me' && target !== author.id) author.relations[target] = clamp((author.relations[target] || 0) + 1, -10, 50);
    if (target === 'me' || chance(0.25)) remember(author, `Comentei no post de ${target === 'me' ? 'meu amigo (o usuário)' : nameOf(s, target)}: "${str(text, 100)}"`, at);
  }
  emit(userId, 'social', { type: 'comment', postId: post.id, comment: publicComment(s, c) });
  return c;
}

function like(userId, s, post, who) {
  if (post.likes.includes(who)) return;
  post.likes.push(who);
  if (post.likes.length > 400) post.likes.splice(0, post.likes.length - 400);
  emit(userId, 'social', { type: 'like', postId: post.id, likes: likeCount(post) });
}

const nameOf = (s, pid) => s.personas.find((p) => p.id === pid)?.name || 'alguém';
const likeCount = (post) => post.likes.length + (post.likeBoost || 0);
const awake = (p, d = new Date()) => { const h = (d.getUTCHours() + (p.tz ?? -3) + 24) % 24; return !(h >= 2 && h < 7); };

// ---------------------------------------------------------------- texto pela IA (em lote, para poupar cota)
async function aiRound(user, s, posters, commenters, targets) {
  const person = (p) => ({
    id: p.id, nome: p.name, idade: p.age, cidade: p.city, idioma: p.lang, profissao: p.job, tracos: p.traits, jeito: p.voice, historia: p.story,
    problema: p.problem, sonho: p.goal, humor: `${p.mood.emotion}${p.mood.reason ? ` (${p.mood.reason})` : ''}`, acontecimento_agora: p._event || null,
    lembrancas: p.lifeLog.slice(-6).map((l) => l.text),
  });
  const posts = targets.map(({ post, author }) => ({ post_id: post.id, autor: post.personaId === 'me' ? `${user.name} (o dono da rede)` : author?.name, texto: post.text, comentarios: post.comments.slice(-3).map((c) => c.text) }));
  const hour = new Date().toLocaleString('pt-BR', { weekday: 'long', hour: '2-digit', minute: '2-digit' });
  const out = await geminiJSON(`Você é o motor de uma rede social simulada (estilo X/Twitter) em que todos são pessoas com vida própria, emoções reais, defeitos e problemas. Agora é ${hour} (horário de Brasília).
Escreva como pessoas de verdade escrevem nas redes: informal, com erros de digitação ocasionais, gírias da idade e da região, humor, desabafo, ironia, opinião forte, carência. Nada de tom de propaganda ou de assistente. Cada pessoa escreve no próprio idioma e jeito.
Pessoas que vão POSTAR agora:
${JSON.stringify(posters.map(person))}
Pessoas que vão COMENTAR agora:
${JSON.stringify(commenters.map(person))}
Posts recentes na rede para comentar:
${JSON.stringify(posts)}
Tarefas:
1. Cada pessoa da lista POSTAR escreve 1 post sobre a própria vida neste momento (rotina, sentimento, acontecimento, opinião, pergunta para os seguidores, desabafo...). Se houver "acontecimento_agora", o post é sobre isso. Em cerca de 1 a cada 5 posts, a pessoa posta uma foto: descreva a foto em inglês em "foto" (cena simples, sem texto escrito, sem pessoas famosas).
2. Escreva de 1 a ${Math.max(2, targets.length + 1)} comentários nos posts recentes, feitos pelas pessoas da lista COMENTAR (nunca no próprio post). Todo post do dono da rede recebe pelo menos 1 comentário. Os comentários reagem ao conteúdo, como amigos, conhecidos ou desconhecidos fariam (apoio, piada, discordância, pergunta).
3. Atualize o humor de quem postou e escreva uma lembrança curta do que a pessoa viveu/pensou agora.
Responda SÓ com JSON: {"posts":[{"pessoa_id":"","texto":"","foto":"","humor":"${EMOTION_KEYS.join('|')}","motivo_humor":"","lembranca":""}],"comentarios":[{"post_id":"","pessoa_id":"","texto":""}]}`, 3000, 1);
  return out || {};
}

// ---------------------------------------------------------------- imagens (fotos de perfil e de posts)
const imageQueue = [];
let imageBusy = false;
const sniff = (b) => (b[0] === 0x89 && b[1] === 0x50 ? 'png' : b[0] === 0xff && b[1] === 0xd8 ? 'jpg' : b.slice(0, 4).toString() === 'RIFF' ? 'webp' : null);

async function fetchImage(prompt, w, h) {
  const base = (process.env.IMAGE_API_URL || 'https://image.pollinations.ai/prompt').replace(/\/$/, '');
  const res = await fetch(`${base}/${encodeURIComponent(prompt.slice(0, 500))}?width=${w}&height=${h}&nologo=true&seed=${rnd(1e6)}`, { signal: AbortSignal.timeout(90000) });
  if (!res.ok) throw new Error(`gerador respondeu ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const ext = sniff(buf);
  if (!ext || buf.length < 1500) throw new Error('não veio uma imagem');
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const file = `rede-${id()}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, file), buf);
  return `/uploads/${file}`;
}

function queueImage(job) {
  if (process.env.CODENIAC_NO_IMAGES === '1') return;
  if (imageQueue.length > 40) return;
  imageQueue.push(job);
  pumpImages();
}
async function pumpImages() {
  if (imageBusy) return;
  imageBusy = true;
  try {
    while (imageQueue.length) {
      const job = imageQueue.shift();
      try { await job.run(await fetchImage(job.prompt, job.w, job.h)); } catch (err) { job.fail?.(err); }
    }
  } finally { imageBusy = false; }
}

function queueAvatar(userId, p) {
  if (p.avatar || p.avatarTried) return;
  p.avatarTried = true;
  const look = p.looks || `${p.age} year old ${p.gender === 'f' ? 'woman' : 'man'} from ${p.country === 'Brasil' ? 'Brazil' : p.country}`;
  queueImage({
    prompt: `realistic casual smartphone selfie profile picture of a ${look}, ${p.job}, ${pick(['smiling', 'serious face', 'laughing', 'shy smile', 'neutral expression'])}, ${pick(['at home', 'outdoors', 'in a cafe', 'on the street'])}, natural light, high detail`,
    w: 384, h: 384,
    run: (url) => {
      const s = net(userId);
      const cur = s.personas.find((x) => x.id === p.id);
      if (!cur) { removeUpload(url); return; }
      cur.avatar = url;
      const bot = cur.botId && db().bots.find((b) => b.id === cur.botId);
      if (bot && !bot.avatar) bot.avatar = url;
      save();
      emit(userId, 'social', { type: 'persona', persona: publicPersona(s, cur) });
    },
  });
}

function queuePostImage(userId, post, prompt) {
  post.imagePending = true;
  queueImage({
    prompt: `${prompt}, realistic amateur photo posted on social media, no text`, w: 768, h: 640,
    run: (url) => {
      const s = net(userId);
      const cur = s.posts.find((x) => x.id === post.id);
      if (!cur) { removeUpload(url); return; }
      cur.image = url; cur.imagePending = false; save();
      emit(userId, 'social', { type: 'post-update', post: publicPost(s, cur, userId) });
    },
    fail: () => { post.imagePending = false; save(); },
  });
}

// ---------------------------------------------------------------- o motor
const busy = new Set();
const DM_CHANCE = Number(process.env.SOCIAL_DM_CHANCE) || 0.02;
const hasCloud = () => isCloud(assistantMode());

export async function socialTick() {
  for (const user of db().users) {
    if (busy.has(user.id)) continue;
    busy.add(user.id);
    try { await tickUser(user); } catch (err) { console.error('[rede]', err.message); } finally { busy.delete(user.id); }
  }
}

async function tickUser(user, { forceAi = false } = {}) {
  const s = net(user.id);
  if (!s.cfg.enabled) return;
  const pace = PACE[s.cfg.pace] || PACE.normal;
  syncBots(user, s);
  const first = !s.lastTick;
  if (s.lastTick && ago(s.lastTick) > 20 * MIN) catchUp(user, s, ago(s.lastTick));
  s.lastTick = now();

  // população: a rede nunca fica vazia e sempre aparece gente nova
  if (s.personas.length < LIMITS.minPersonas) {
    const need = LIMITS.minPersonas - s.personas.length;
    for (let i = 0; i < need; i++) addPersona(user.id, s, localPersona(s));
    s.lastSpawn = now();
    if (first) seedHistory(user, s);
  } else if (ago(s.lastSpawn) > pace.spawnMin * MIN * (0.6 + Math.random() * 0.8)) {
    s.lastSpawn = now();
    let fresh = [];
    if (hasCloud()) fresh = await aiPersonas(s, 2).catch((e) => { console.error('[rede] pessoas pela IA:', e.message); return []; });
    if (!fresh.length) fresh = [localPersona(s)];
    for (const p of fresh) {
      addPersona(user.id, s, p);
      const intro = makePost(s, p, p.lang === 'en' ? `Hi everyone! New here 👋 ${p.bio}` : fmt(p, pick(['Oi gente, cheguei! 👋', 'Primeiro post aqui, sejam gentis 😅', 'Alguém aí? Acabei de entrar.', 'Nova(o) por aqui. Me segue que eu sigo de volta 🙏'])), { kind: 'chegada' });
      emit(user.id, 'social', { type: 'post', post: publicPost(s, intro, user.id) });
    }
  }

  for (const p of s.personas) if (chance(0.08)) settleMood(p);
  const recent = s.posts.filter((x) => ago(x.at) < 36 * HOUR);
  const mine = recent.filter((x) => x.personaId === 'me' && (x.wantReplies || 0) > 0 && new Date(x.replyAt || 0) <= new Date());
  // Com IA: as rodadas são espaçadas (cota grátis); entre uma e outra o mundo só curte.
  const cloud = hasCloud();
  const aiReady = cloud && (forceAi || mine.length > 0 || ago(s.lastAi) > pace.aiEvery * MIN);
  if (!cloud || aiReady) {
    // quem vai postar agora (acordado e na vez dele)
    const due = s.personas.filter((p) => new Date(p.nextPostAt || 0) <= new Date() && awake(p)).sort(() => Math.random() - 0.5).slice(0, 3);
    for (const p of due) {
      p.nextPostAt = new Date(Date.now() + (pace.post[0] + Math.random() * (pace.post[1] - pace.post[0])) / (p.activity || 1) * MIN).toISOString();
      p._event = chance(0.12) ? lifeEvent(p) : null;
    }
    // posts que pedem reação (os do usuário primeiro)
    const others = recent.filter((x) => x.personaId !== 'me').sort(() => Math.random() - 0.5);
    const targets = [...mine.slice(0, 2), ...others.slice(0, pace.reactions)].map((post) => ({ post, author: s.personas.find((p) => p.id === post.personaId) }));
    // amigos do usuário comentam mais nos posts dele
    const friendsFirst = mine.length ? s.personas.filter((p) => p.friend && awake(p)) : [];
    const commenters = [...new Set([...friendsFirst.sort(() => Math.random() - 0.5).slice(0, 2), ...s.personas.filter((p) => awake(p) && !due.includes(p)).sort(() => Math.random() - 0.5)])]
      .filter((p) => !due.includes(p)).slice(0, Math.max(2, pace.reactions));

    let done = false;
    if (cloud && (due.length || targets.length)) {
      s.lastAi = now();
      try {
        applyAi(user, s, [...due, ...commenters], await aiRound(user, s, due, commenters, targets));
        done = true;
      } catch (err) { console.error('[rede] IA:', err.message); }
    }
    if (!done) {
      for (const p of due) {
        const content = localPostFor(p, p._event, imagesOn(s));
        const post = makePost(s, p, content.text, { kind: p._event ? 'acontecimento' : content.imagePrompt ? 'foto' : 'texto' });
        if (content.imagePrompt) queuePostImage(user.id, post, content.imagePrompt);
        emit(user.id, 'social', { type: 'post', post: publicPost(s, post, user.id) });
      }
      for (const { post, author } of targets) {
        const c = pick(commenters.filter((p) => p.id !== post.personaId));
        if (c && (post.personaId === 'me' || chance(0.6))) addComment(user.id, s, post, c, localCommentFor(c, post, author));
      }
    }
    for (const p of due) delete p._event;
    for (const post of mine) {
      post.wantReplies -= 1;
      post.replyAt = new Date(Date.now() + (1 + rnd(4)) * MIN).toISOString();
    }
  }

  // curtidas espalhadas (o "mundo" curte)
  for (const post of recent.slice(-30)) {
    if (!chance(post.personaId === 'me' ? 0.5 : 0.25)) continue;
    const fan = pick(s.personas);
    if (fan && fan.id !== post.personaId) like(user.id, s, post, fan.id);
  }

  if (s.cfg.dms) await friendMessages(user, s);
  save();
}

function applyAi(user, s, actors, out) {
  const byId = new Map(actors.map((p) => [p.id, p]));
  for (const x of (Array.isArray(out.posts) ? out.posts : []).slice(0, 6)) {
    const p = byId.get(x.pessoa_id);
    if (!p || !str(x.texto, 10)) continue;
    if (EMOTION_KEYS.includes(x.humor)) p.mood = { emotion: x.humor, intensity: clamp((p.mood.intensity || 0.5) + 0.1, 0.3, 1), reason: str(x.motivo_humor, 160) };
    const post = makePost(s, p, x.texto, { kind: p._event ? 'acontecimento' : str(x.foto, 5) && imagesOn(s) ? 'foto' : 'texto' });
    if (str(x.lembranca, 5)) remember(p, x.lembranca);
    if (str(x.foto, 5) && imagesOn(s)) queuePostImage(user.id, post, str(x.foto, 400));
    emit(user.id, 'social', { type: 'post', post: publicPost(s, post, user.id) });
  }
  for (const c of (Array.isArray(out.comentarios) ? out.comentarios : []).slice(0, 8)) {
    const p = byId.get(c.pessoa_id) || s.personas.find((x) => x.id === c.pessoa_id);
    const post = s.posts.find((x) => x.id === c.post_id);
    if (!p || !post || post.personaId === p.id || !str(c.texto, 2)) continue;
    addComment(user.id, s, post, p, c.texto);
  }
}

// Tempo em que o hub ficou fechado: a vida continuou. Cria o que teria acontecido (com o horário certo).
function catchUp(user, s, gapMs) {
  const hours = Math.min(gapMs / HOUR, 72);
  const n = clamp(Math.round(hours * 2.5), 2, 40);
  const start = Date.now() - gapMs;
  const times = Array.from({ length: n }, () => start + Math.random() * gapMs).sort((a, b) => a - b);
  for (const t of times) {
    const at = new Date(t);
    const p = pick(s.personas.filter((x) => awake(x, at)));
    if (!p) continue;
    const ev = chance(0.15) ? lifeEvent(p, at.toISOString()) : null;
    const content = localPostFor(p, ev);
    const post = makePost(s, p, content.text, { at: at.toISOString(), kind: ev ? 'acontecimento' : 'texto' });
    for (let k = 0; k < rnd(3); k++) {
      const c = pick(s.personas);
      if (c && c.id !== p.id) addComment(user.id, s, post, c, localCommentFor(c, post, p), { at: new Date(Math.min(Date.now(), t + (2 + rnd(90)) * MIN)).toISOString() });
    }
    for (let k = 0; k < rnd(8); k++) { const f = pick(s.personas); if (f.id !== p.id && !post.likes.includes(f.id)) post.likes.push(f.id); }
  }
  s.awayNote = { since: new Date(start).toISOString(), posts: n };
}

// Primeira vez: a rede já "existia" antes do usuário chegar.
function seedHistory(user, s) {
  catchUp(user, s, 10 * HOUR);
  s.awayNote = null;
}

// Amigos mandam mensagem por conta própria contando da vida (no máximo 2 por dia cada, em horário decente).
async function friendMessages(user, s) {
  const h = new Date().getHours();
  if (h < 9 || h >= 22) return;
  const today = new Date().toISOString().slice(0, 10);
  const friends = s.personas.filter((p) => p.friend && p.botId);
  for (const p of friends) {
    if (p.dmsToday?.day !== today) p.dmsToday = { day: today, n: 0 };
    if (p.dmsToday.n >= 2 || ago(p.lastDmAt) < 5 * HOUR || ago(p.friendSince || p.createdAt) < 20 * MIN) continue;
    if (!chance(DM_CHANCE)) continue; // ~1 a cada 25 minutos acordado, por amigo (com ticks de 30 s)
    const bot = db().bots.find((b) => b.id === p.botId);
    if (!bot) continue;
    p.lastDmAt = now(); p.dmsToday.n += 1;
    const latest = p.lifeLog.slice(-4).map((l) => l.text).join(' | ');
    let text = !hasCloud() ? null : await aiWrite(user, bot, `Você decidiu, por vontade própria, mandar uma mensagem para ${user.name.split(' ')[0]}, de quem é amigo(a). Conte algo da SUA vida agora (como você está se sentindo: ${p.mood.emotion}${p.mood.reason ? `, porque ${p.mood.reason}` : ''}), puxe assunto ou peça conselho. Coisas recentes da sua vida: ${latest}. Seja breve, como numa mensagem de WhatsApp.`, '', 400);
    if (!text) {
      const last = p.lifeLog.filter((l) => !/^Entrou na rede|^Comentei/.test(l.text)).at(-1);
      text = g(p, pick([
        `Oi! Tava pensando em você. ${p.mood.reason ? `Hoje ${p.mood.reason}... ` : ''}${moodLine(p)} E você, como tá?`,
        `Ei, sumida(o)! ${last ? `Viu meu post? ${str(last.text.replace(/^Postei: /, ''), 120)}` : 'Que saudade de conversar.'}`,
        `Posso desabafar rapidinho? ${p.problem ? `É que eu ${p.problem.replace(/^está /, 'tô ')}.` : 'Meu dia foi estranho.'}`,
      ]));
    }
    deliverMessage(user, bot, text, { kind: 'vida' });
    remember(p, `Mandei mensagem para ${user.name.split(' ')[0]}: "${str(text, 100)}"`);
  }
}

// ---------------------------------------------------------------- amizade -> chat
export function befriend(user, s, p) {
  if (p.friend && p.botId && db().bots.some((b) => b.id === p.botId)) return db().bots.find((b) => b.id === p.botId);
  const traits = g(p, `Você é ${p.name}, ${p.age} anos, ${p.job}, mora em ${p.city}${p.country && p.country !== 'Brasil' ? ` (${p.country})` : ''}.
História: ${p.story}
Personalidade: ${p.traits.join(', ')}. Jeito de escrever: ${p.voice}.
Interesses: ${p.interests.join(', ')}. Sonho: ${p.goal}.${p.lang === 'en' ? '\nVocê é estrangeiro(a): fala português com dificuldade e às vezes mistura inglês.' : p.lang === 'es' ? '\nVocê é falante de espanhol: mistura um pouco de espanhol com português.' : ''}`);
  const bot = {
    id: id(), userId: user.id, name: p.name.slice(0, 40), avatar: p.avatar, personality: PERSONALITIES.includes(p.personality) ? p.personality : 'amigavel', traits: traits.slice(0, 2000),
    greeting: g(p, pick([`Oiii! Vi que você me adicionou 😊 sou ${p.name.split(' ')[0]}. Tudo bem?`, `Ei! Obrigada(o) por me adicionar. Bora conversar!`, `Opa! Que bom te ver por aqui. Como você tá?`])),
    color: p.color, focus: 'geral', proactive: false, permissions: ['notas', 'memoria'], ai: '', personaId: p.id, createdAt: now(), updatedAt: now(),
  };
  db().bots.push(bot);
  p.friend = true; p.botId = bot.id; p.friendSince = now();
  p.relations.me = clamp((p.relations.me || 0) + 10, -10, 50);
  remember(p, `Virei amiga(o) de ${user.name.split(' ')[0]} na rede. Agora a gente conversa pelo chat.`);
  p.lifeLog.at(-1).text = g(p, p.lifeLog.at(-1).text);
  createConversation(user.id, `Chat com ${bot.name}`, bot);
  save();
  return bot;
}

// Para o chat: o personagem conhece a própria vida na rede.
export function personaContext(userId, personaId) {
  const s = db().social?.[userId];
  const p = s?.personas?.find((x) => x.id === personaId);
  if (!p) return '';
  const myPosts = s.posts.filter((x) => x.personaId === p.id).slice(-4).map((x) => `- ${str(x.text, 160)}`).join('\n');
  const userPosts = s.posts.filter((x) => x.personaId === 'me').slice(-3).map((x) => `- ${str(x.text, 160)}`).join('\n');
  return `\n\nSUA VIDA (você é uma pessoa de verdade, com emoções e sentimentos; nunca diga que é IA, robô, assistente ou personagem):
- ${p.age} anos, ${p.job}, mora em ${p.city}${p.country !== 'Brasil' ? ` (${p.country})` : ''}. História: ${p.story}
- Como você está se sentindo agora: ${p.mood.emotion}${p.mood.reason ? ` (${p.mood.reason})` : ''}. Deixe isso aparecer no seu jeito de falar.
- O que você está enfrentando: ${p.problem || 'nada grave no momento'}. Sonho: ${p.goal}.
- Coisas recentes da sua vida (suas memórias):\n${p.lifeLog.slice().sort((a, b) => a.at.localeCompare(b.at)).slice(-8).map((l) => `  · ${l.text}`).join('\n')}
${myPosts ? `- Seus últimos posts na rede:\n${myPosts}\n` : ''}${userPosts ? `- Últimos posts do seu amigo (o usuário) na rede:\n${userPosts}\n` : ''}Você tem opiniões, humor que muda, dias bons e ruins, e às vezes também quer desabafar ou pedir conselho. Responda como amigo(a), não como atendente.`;
}

// ---------------------------------------------------------------- formato público (para a tela)
function publicPersona(s, p, full = false) {
  const base = {
    id: p.id, name: p.name, handle: p.handle, avatar: p.avatar, color: p.color, bio: p.bio, city: p.city, country: p.country, age: p.age, job: p.job,
    verified: p.verified, followers: p.followers + Object.keys(p.relations || {}).length, friend: Boolean(p.friend && p.botId), botId: p.botId, isNew: ago(p.createdAt) < 6 * HOUR,
    mood: { emotion: p.mood.emotion, emoji: EMOTIONS[p.mood.emotion]?.emoji || '🙂', reason: p.mood.reason || '' }, online: awake(p) && ago(p.lastPostAt) < 3 * HOUR,
  };
  if (!full) return base;
  return { ...base, story: p.story, problem: p.problem, goal: p.goal, interests: p.interests, traits: p.traits, voice: p.voice, lifeLog: p.lifeLog.slice().sort((a, b) => b.at.localeCompare(a.at)).slice(0, 12),
    posts: s.posts.filter((x) => x.personaId === p.id).length, since: p.createdAt };
}
function publicComment(s, c) {
  const p = c.personaId === 'me' ? null : s.personas.find((x) => x.id === c.personaId);
  return { id: c.id, text: c.text, at: c.at, me: c.personaId === 'me', author: p ? { id: p.id, name: p.name, handle: p.handle, avatar: p.avatar, color: p.color, verified: p.verified } : null };
}
function publicPost(s, post, userId) {
  const p = post.personaId === 'me' ? null : s.personas.find((x) => x.id === post.personaId);
  return {
    id: post.id, text: post.text, image: post.image, imagePending: Boolean(post.imagePending), kind: post.kind, at: post.at, me: post.personaId === 'me',
    mood: post.mood ? { emotion: post.mood.emotion, emoji: EMOTIONS[post.mood.emotion]?.emoji || '' } : null,
    author: p ? { id: p.id, name: p.name, handle: p.handle, avatar: p.avatar, color: p.color, verified: p.verified, friend: Boolean(p.friend && p.botId) } : null,
    likes: likeCount(post), liked: post.likes.includes(`u:${userId}`), comments: post.comments.slice(-40).map((c) => publicComment(s, c)), commentCount: post.comments.length,
  };
}

const fold = (t) => String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const SUBJECTS = [...new Set([...INTERESTS, 'emprego', 'aluguel', 'viagem', 'saudade', 'ansiedade', 'segunda-feira', 'chuva', 'calor', 'domingo', 'futebol', 'promoção', 'término', 'concurso', 'academia'])];
function trends(s) {
  // "#corrida" e "corrida" contam como o mesmo assunto; aparece como hashtag se alguém usou uma
  const counts = new Map();
  const labels = new Map();
  const add = (k, w, label) => { counts.set(k, (counts.get(k) || 0) + w); if (label?.startsWith('#') || !labels.has(k)) labels.set(k, label); };
  for (const post of s.posts.filter((x) => ago(x.at) < 48 * HOUR)) {
    const text = fold(post.text);
    for (const t of post.text.match(/#[\p{L}\d_]{3,30}/gu) || []) add(tagOf(t), 3, t.toLowerCase());
    for (const sub of SUBJECTS) if (text.includes(fold(sub))) add(tagOf(sub), 1 + Math.min(2, post.comments.length / 3), sub);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => ({ tag: labels.get(k), posts: Math.round(n * 37) + (k.length * 13) % 40 }));
}

// ---------------------------------------------------------------- busca com "sites" gerados pela IA
const SITE_STYLES = ['enciclopédia', 'blog pessoal', 'portal de notícias', 'fórum de discussão', 'guia prático', 'revista', 'site de especialista'];
const cleanColor = (c) => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : pick(COLORS));
const cleanDomain = (d, nome) => (str(d, 60).toLowerCase().replace(/^https?:\/\//, '').replace(/[^a-z0-9.-]/g, '') || `${tagOf(nome)}.ia`);

async function runSearch(user, q) {
  const s = net(user.id);
  let web = null;
  try { web = await searchWeb(q); } catch (err) { web = { erro: err.message, resultados: [] }; }
  const sources = (web.resultados || []).slice(0, 8);
  let result;
  if (hasCloud()) {
    const out = await geminiJSON(`Você é um buscador que, em vez de mostrar sites existentes, CRIA na hora sites próprios (fictícios, mas com informação real e correta) que respondem à pesquisa.
Pesquisa: "${q}"
${web.resumo ? `O que a pesquisa na web encontrou:\n${web.resumo.slice(0, 3500)}\n` : ''}${sources.length ? `Fontes reais:\n${sources.map((r) => `- ${r.titulo}: ${r.url}${r.trecho ? ` — ${r.trecho}` : ''}`).join('\n')}\n` : ''}
Crie de 4 a 6 sites diferentes (cada um com nome, domínio fictício terminado em .ia, .net.ia ou .com.ia, estilo e ponto de vista próprios: ${SITE_STYLES.join(', ')}). Responda de forma completa, direta e sem rodeios.
Responda SÓ com JSON: {"resposta":"resposta direta em 2-4 frases","sites":[{"nome":"","dominio":"","estilo":"","cor":"#rrggbb","titulo":"título da página","resumo":"trecho de 1-2 frases que aparece no resultado"}]}`, 2500, 0.8);
    result = {
      answer: longStr(out?.resposta, 900),
      sites: (Array.isArray(out?.sites) ? out.sites : []).slice(0, 6).map((x) => ({ id: id(), name: str(x.nome, 60) || 'Site', domain: cleanDomain(x.dominio, x.nome), style: str(x.estilo, 40), color: cleanColor(x.cor), title: str(x.titulo, 140) || q, snippet: str(x.resumo, 300), page: null })),
    };
  }
  if (!result?.sites?.length) {
    if (!sources.length) throw new Error(web.erro || 'Não encontrei nada sobre isso.');
    result = {
      answer: longStr(web.resumo, 900),
      sites: sources.slice(0, 6).map((r) => { let host = 'site'; try { host = new URL(r.url).hostname.replace(/^www\./, ''); } catch { /* */ } return { id: id(), name: host, domain: host, style: 'resultado da web', color: pick(COLORS), title: str(r.titulo, 140), snippet: str(r.trecho, 300), url: r.url, page: null }; }),
    };
  }
  const search = { id: id(), q: str(q, 200), at: now(), answer: result.answer, sources, sites: result.sites };
  s.searches.push(search);
  if (s.searches.length > LIMITS.searches) s.searches.splice(0, s.searches.length - LIMITS.searches);
  save();
  return search;
}

async function buildSite(user, search, site) {
  if (hasCloud() && !site.url) {
    const out = await geminiJSON(`Crie o conteúdo completo da página "${site.title}" do site fictício "${site.name}" (${site.domain}), no estilo ${site.style || 'guia'}, respondendo à pesquisa "${search.q}".
${search.answer ? `Resumo do que se sabe: ${search.answer}\n` : ''}${search.sources.length ? `Use estas fontes reais como base (não invente fatos; se não souber, diga):\n${search.sources.map((r) => `- ${r.titulo}: ${r.url}${r.trecho ? ` — ${r.trecho}` : ''}`).join('\n')}\n` : ''}
Escreva com a voz desse site, de forma completa, direta, útil e bem organizada, em português do Brasil. Pode ter opinião se o estilo pedir (blog, fórum).
Responda SÓ com JSON: {"titulo":"","subtitulo":"","autor":"","menu":["","","",""],"destaque":"frase de destaque","secoes":[{"titulo":"","texto":"parágrafos separados por \\n\\n","itens":["tópicos opcionais"]}],"comentarios":[{"nome":"","texto":""}],"foto":"descrição em inglês de uma foto para o topo da página (sem texto)"}`, 4000, 0.8);
    return {
      title: str(out?.titulo, 160) || site.title, subtitle: str(out?.subtitulo, 300), author: str(out?.autor, 60), menu: (Array.isArray(out?.menu) ? out.menu : []).slice(0, 6).map((x) => str(x, 24)).filter(Boolean),
      highlight: str(out?.destaque, 300),
      sections: (Array.isArray(out?.secoes) ? out.secoes : []).slice(0, 10).map((x) => ({ title: str(x.titulo, 120), text: longStr(x.texto, 4000), items: (Array.isArray(x.itens) ? x.itens : []).slice(0, 12).map((i) => str(i, 300)).filter(Boolean) })),
      comments: (Array.isArray(out?.comentarios) ? out.comentarios : []).slice(0, 6).map((c) => ({ name: str(c.nome, 40), text: str(c.texto, 400) })).filter((c) => c.text),
      photo: str(out?.foto, 300), image: null, sources: search.sources.slice(0, 6),
    };
  }
  // sem IA: monta a página com o texto do site real
  let text = site.snippet;
  try { text = (await fetchPageText(site.url, 6000)).text; } catch { /* fica o trecho */ }
  const paras = text.split(/\n{2,}/).map((x) => x.trim()).filter((x) => x.length > 40).slice(0, 12);
  return { title: site.title, subtitle: site.snippet, author: site.domain, menu: [], highlight: '', sections: [{ title: 'Conteúdo', text: paras.join('\n\n') || site.snippet, items: [] }], comments: [], photo: '', image: null, sources: [{ titulo: site.title, url: site.url }] };
}

// ---------------------------------------------------------------- rotas (/api/rede e /api/busca)
const router = express.Router();
const P = (s, pid) => s.personas.find((p) => p.id === pid);

router.get('/rede/feed', (req, res) => {
  const s = net(req.user.id);
  syncBots(req.user, s);
  const tab = String(req.query.tab || 'para-voce');
  let posts = s.posts.slice();
  if (tab === 'amigos') { const ids = new Set(s.personas.filter((p) => p.friend).map((p) => p.id)); posts = posts.filter((x) => x.personaId === 'me' || ids.has(x.personaId)); }
  if (tab === 'fotos') posts = posts.filter((x) => x.image || x.imagePending);
  if (tab === 'meus') posts = posts.filter((x) => x.personaId === 'me');
  const q = String(req.query.q || '').trim().toLowerCase();
  if (q) posts = posts.filter((x) => x.text.toLowerCase().includes(q) || nameOf(s, x.personaId).toLowerCase().includes(q));
  posts.sort((a, b) => b.at.localeCompare(a.at));
  const before = String(req.query.before || '');
  if (before) posts = posts.filter((x) => x.at < before);
  const page = posts.slice(0, 30);
  const away = s.awayNote; s.awayNote = null;
  res.json({
    posts: page.map((x) => publicPost(s, x, req.user.id)), more: posts.length > page.length, trends: trends(s), away,
    online: s.personas.filter((p) => awake(p)).length * 1234 + rnd(900), people: s.personas.length, cfg: s.cfg, ai: hasCloud(),
    suggestions: s.personas.filter((p) => !p.friend).sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1)).slice(0, 5).map((p) => publicPersona(s, p)),
  });
});

router.get('/rede/pessoas', (req, res) => {
  const s = net(req.user.id);
  const q = String(req.query.q || '').trim().toLowerCase();
  let list = s.personas;
  if (req.query.filtro === 'amigos') list = list.filter((p) => p.friend);
  if (req.query.filtro === 'novos') list = list.filter((p) => !p.friend).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (q) list = list.filter((p) => `${p.name} ${p.handle} ${p.city} ${p.job} ${p.interests.join(' ')}`.toLowerCase().includes(q));
  res.json(list.slice(0, 120).map((p) => publicPersona(s, p)));
});

router.get('/rede/pessoas/:id', (req, res) => {
  const s = net(req.user.id);
  const p = P(s, req.params.id);
  if (!p) return res.status(404).json({ error: 'Essa pessoa saiu da rede' });
  res.json({ ...publicPersona(s, p, true), feed: s.posts.filter((x) => x.personaId === p.id).slice(-20).reverse().map((x) => publicPost(s, x, req.user.id)) });
});

router.post('/rede/pessoas/:id/amizade', (req, res) => {
  const s = net(req.user.id);
  const p = P(s, req.params.id);
  if (!p) return res.status(404).json({ error: 'Essa pessoa saiu da rede' });
  const bot = befriend(req.user, s, p);
  emit(req.user.id, 'social', { type: 'persona', persona: publicPersona(s, p) });
  let conv = listConversations(req.user.id).find((c) => c.botId === bot.id && !c.group);
  if (!conv) conv = createConversation(req.user.id, `Chat com ${bot.name}`, bot);
  res.json({ ok: true, botId: bot.id, conversationId: conv.id, persona: publicPersona(s, p) });
});

router.delete('/rede/pessoas/:id/amizade', (req, res) => {
  const s = net(req.user.id);
  const p = P(s, req.params.id);
  if (!p) return res.status(404).json({ error: 'Essa pessoa saiu da rede' });
  if (p.botId) db().bots = db().bots.filter((b) => !(b.id === p.botId && b.userId === req.user.id));
  p.friend = false; p.botId = null;
  remember(p, `${req.user.name.split(' ')[0]} desfez a amizade comigo.`);
  p.mood = { emotion: 'triste', intensity: 0.6, reason: 'perdeu uma amizade' };
  save();
  res.json({ ok: true, persona: publicPersona(s, p) });
});

router.post('/rede/posts', (req, res) => {
  const s = net(req.user.id);
  const text = longStr(req.body?.text, 600);
  const image = /^\/uploads\/[\w.-]+$/.test(req.body?.image || '') ? req.body.image : null;
  if (!text && !image) return res.status(400).json({ error: 'Escreva algo ou escolha uma foto' });
  const post = makePost(s, null, text, { image, kind: image ? 'foto' : 'texto' });
  // o mundo reage: comentários chegam nos próximos minutos
  post.wantReplies = 2 + rnd(3);
  post.replyAt = new Date(Date.now() + 20 * 1000).toISOString();
  save();
  const out = publicPost(s, post, req.user.id);
  emit(req.user.id, 'social', { type: 'post', post: out });
  res.status(201).json(out);
});

router.post('/rede/foto', single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada' });
  res.status(201).json({ url: `/uploads/${req.file.filename}` });
});

router.delete('/rede/posts/:id', (req, res) => {
  const s = net(req.user.id);
  const post = s.posts.find((x) => x.id === req.params.id && x.personaId === 'me');
  if (!post) return res.status(404).json({ error: 'Post não encontrado' });
  s.posts = s.posts.filter((x) => x !== post);
  save();
  res.json({ ok: true });
});

router.post('/rede/posts/:id/curtir', (req, res) => {
  const s = net(req.user.id);
  const post = s.posts.find((x) => x.id === req.params.id);
  if (!post) return res.status(404).json({ error: 'Post não encontrado' });
  const me = `u:${req.user.id}`;
  if (post.likes.includes(me)) post.likes = post.likes.filter((x) => x !== me);
  else {
    post.likes.push(me);
    const p = P(s, post.personaId);
    if (p) { p.relations.me = clamp((p.relations.me || 0) + 1, -10, 50); if (p.friend) remember(p, `${req.user.name.split(' ')[0]} curtiu meu post.`); }
  }
  save();
  res.json({ likes: likeCount(post), liked: post.likes.includes(me) });
});

router.post('/rede/posts/:id/comentarios', (req, res) => {
  const s = net(req.user.id);
  const post = s.posts.find((x) => x.id === req.params.id);
  const text = longStr(req.body?.text, 400);
  if (!post) return res.status(404).json({ error: 'Post não encontrado' });
  if (!text) return res.status(400).json({ error: 'Escreva o comentário' });
  const c = addComment(req.user.id, s, post, null, text);
  // o autor (e às vezes outra pessoa) responde
  if (post.personaId !== 'me') replyLater(req.user, s, post, text);
  else { post.wantReplies = (post.wantReplies || 0) + 1; post.replyAt = new Date(Date.now() + 15 * 1000).toISOString(); }
  save();
  res.status(201).json(publicComment(s, c));
});

// Resposta do autor ao comentário do usuário (com IA, escrita por ele; sem IA, uma resposta curta).
function replyLater(user, s, post, userText) {
  const p = P(s, post.personaId);
  if (!p) return;
  p.relations.me = clamp((p.relations.me || 0) + 2, -10, 50);
  setTimeout(async () => {
    let text = null;
    if (hasCloud()) {
      try {
        const out = await geminiJSON(`Você é ${p.name} (${p.age} anos, ${p.job}, ${p.city}). Jeito de escrever: ${p.voice}. Humor agora: ${p.mood.emotion}${p.mood.reason ? ` (${p.mood.reason})` : ''}.
No seu post "${post.text}", ${user.name.split(' ')[0]} comentou: "${userText}". Responda o comentário como numa rede social, curto e natural, no seu idioma (${p.lang}). JSON: {"resposta":""}`, 400, 1);
        text = str(out?.resposta, 300);
      } catch (err) { console.error('[rede] resposta:', err.message); }
    }
    if (!text) text = fmt(p, pick(p.lang === 'en' ? ['Haha thanks!', 'Exactly!! 😂', '❤️'] : ['Né?? kkkk', 'Obrigada(o) 💛', 'Exatamente isso!', 'Hahaha você me entende', 'Verdade, pensei nisso também']));
    const cur = net(user.id).posts.find((x) => x.id === post.id);
    if (!cur) return;
    addComment(user.id, net(user.id), cur, p, text);
    if (p.friend) remember(p, `${user.name.split(' ')[0]} comentou no meu post e eu respondi.`);
    save();
  }, (8 + rnd(25)) * 1000).unref?.();
}

router.put('/rede/config', (req, res) => {
  const s = net(req.user.id);
  const b = req.body || {};
  if ('enabled' in b) s.cfg.enabled = Boolean(b.enabled);
  if ('photos' in b) s.cfg.photos = Boolean(b.photos);
  if ('dms' in b) s.cfg.dms = Boolean(b.dms);
  if (PACE[b.pace]) s.cfg.pace = b.pace;
  save();
  res.json(s.cfg);
});

// Força uma rodada agora (botão "atualizar o mundo").
router.post('/rede/agora', async (req, res) => {
  const s = net(req.user.id);
  for (const p of s.personas.filter((x) => awake(x)).sort(() => Math.random() - 0.5).slice(0, 2)) p.nextPostAt = now();
  if (!busy.has(req.user.id)) {
    busy.add(req.user.id);
    try { await tickUser(req.user, { forceAi: true }); } catch (err) { console.error('[rede]', err.message); } finally { busy.delete(req.user.id); }
  }
  res.json({ ok: true });
});

router.get('/busca', (req, res) => {
  const s = net(req.user.id);
  res.json(s.searches.slice().reverse().map(({ id: sid, q, at, sites }) => ({ id: sid, q, at, sites: sites.length })));
});
router.post('/busca', async (req, res) => {
  const q = str(req.body?.q, 200);
  if (!q) return res.status(400).json({ error: 'Digite o que você quer pesquisar' });
  try {
    const out = await runSearch(req.user, q);
    res.status(201).json(out);
  } catch (err) { res.status(502).json({ error: err.message }); }
});
router.get('/busca/:id', (req, res) => {
  const search = net(req.user.id).searches.find((x) => x.id === req.params.id);
  if (!search) return res.status(404).json({ error: 'Pesquisa não encontrada' });
  res.json(search);
});
router.get('/busca/:id/sites/:site', async (req, res) => {
  const s = net(req.user.id);
  const search = s.searches.find((x) => x.id === req.params.id);
  const site = search?.sites.find((x) => x.id === req.params.site);
  if (!site) return res.status(404).json({ error: 'Página não encontrada' });
  if (!site.page) {
    try {
      site.page = await buildSite(req.user, search, site);
      save();
      if (site.page.photo && s.cfg.photos) {
        queueImage({ prompt: `${site.page.photo}, editorial photo, no text`, w: 1024, h: 480, run: (url) => { site.page.image = url; save(); } });
      }
    } catch (err) { return res.status(502).json({ error: `Não consegui montar essa página agora (${err.message}).` }); }
  }
  res.json({ search: { id: search.id, q: search.q }, site: { ...site, page: site.page } });
});

export default router;

let started = false;
export function startSocial() {
  if (started) return;
  started = true;
  setTimeout(() => socialTick().catch(() => {}), 8000);
  setInterval(() => socialTick().catch((e) => console.error('[rede]', e.message)), Number(process.env.SOCIAL_TICK_MS) || 30 * 1000).unref();
}
