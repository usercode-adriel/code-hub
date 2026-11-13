import { db, id, now, save } from './db.js';
import { hashPassword } from './auth.js';

export const APP_VERSION = '1.6.1';

// Histórico de versões publicado como notificação de "atualização do sistema".
export const CHANGELOG = [
  {
    version: '1.0.0',
    title: 'Codeniac 1.0 está no ar 🚀',
    message: 'Hub de projetos com 7 áreas, assistente IA, upload de imagens, notificações em tempo real e configurações personalizáveis.',
  },
  {
    version: '1.1.0',
    title: 'Codeniac 1.1: temas, páginas e InDrive 🎨',
    message: 'Novo logo, temas com editor de cores, projetos em páginas estilo Notion, controle financeiro do InDrive, chat estilo Telegram e painel de administração.',
  },
  {
    version: '1.2.0',
    title: 'Codeniac 1.2: celular e IA local 📱',
    message: 'Acesso pelo celular com QR code e IA local gratuita opcional (Ollama).',
  },
  {
    version: '1.3.0',
    title: 'Codeniac 1.3: sua rotina no automático ☀️',
    message: 'Novas abas Hoje, Garagem, Estudos, Financeiro, Diário, Decisões e Atividade; briefing da manhã, detector de procrastinação, '
      + 'flashcards de inglês, captura rápida, comandos no chat, backup automático diário, 8 temas novos e ferramentas de administrador.',
  },
  {
    version: '1.4.0',
    title: 'Codeniac 1.4: Gemini no assistente ✨',
    message: 'O assistente pode usar o Gemini, a IA gratuita do Google: conversa sobre qualquer assunto, sem pesar o computador. '
      + 'Configure em Configurações → Assistente. Os comandos rápidos continuam funcionando.',
  },
  {
    version: '1.5.0',
    title: 'Codeniac 1.5: visual novo, personagens e biblioteca 📚',
    message: 'Layout novo com menu de ícones e versão para celular com barra inferior; 16 temas (cores básicas e temas prontos); '
      + 'crie chats com personagens (foto, personalidade e características); e a aba Livros virou um painel com biblioteca de PDF e EPUB.',
  },
  {
    version: '1.6.0',
    title: 'Codeniac 1.6: chats vivos 💬',
    message: 'Mande fotos e PDFs no chat e pergunte sobre eles; personagens mandam mensagens sozinhos sobre a função deles, com balãozinho flutuante; '
      + 'crie grupos em que os personagens conversam entre si; respostas mais naturais e celular 100% ajustado.',
  },
];

export const DEFAULT_PROJECTS = [
  { slug: 'trabalhos', name: 'Trabalhos', icon: 'briefcase', color: '#1f8fff', tagline: 'Clientes · Entregas', description: 'Clientes, entregas, reuniões e rotinas profissionais.',
    tasks: [['Revisar proposta do cliente', 'high', 'doing'], ['Enviar relatório semanal', 'medium', 'todo']] },
  { slug: 'programacao', name: 'Programação', icon: 'code', color: '#8b5cf6', tagline: 'Código · Estudos', description: 'Projetos de código, estudos de stack e side projects.',
    tasks: [['Estudar padrões de arquitetura', 'medium', 'doing']] },
  { slug: 'criptomoedas', name: 'Criptomoedas', icon: 'bitcoin', color: '#f7931a', tagline: 'Carteira · Análises', description: 'Carteira, estratégias, análises on-chain e watchlist.', tasks: [] },
  { slug: 'investimentos', name: 'Investimentos', icon: 'trending', color: '#22c55e', tagline: 'Renda fixa · Ações', description: 'Renda fixa, ações, FIIs, metas e rebalanceamento.', tasks: [] },
  { slug: 'livros', name: 'Livros', icon: 'book', color: '#ef4444', tagline: 'Leituras · Resumos', description: 'Lista de leitura, progresso, resumos e citações.', tasks: [] },
  { slug: 'assets', name: 'Assets', icon: 'layers', color: '#06b6d4', tagline: 'Design · Recursos', description: 'Ícones, imagens, fontes, templates e recursos de design.', tasks: [] },
  { slug: 'english', name: 'English', icon: 'globe', color: '#eab308', tagline: 'Speaking · Vocabulary', description: 'Estudo de inglês: vocabulário, listening, speaking e metas.',
    tasks: [['Praticar speaking 20 min', 'high', 'todo']] },
];

export const THEMES = [
  // cores básicas (só mudam as cores)
  'azul', 'azulclaro', 'preto', 'vermelho', 'roxo', 'verde', 'neutro',
  // temas prontos
  'padrao', 'gamers', 'magia', 'batcaverna', 'retro80', 'nerds', 'oceano', 'cafe', 'harvard'];
// temas antigos (1.3) que saíram: viram o mais parecido
export const THEME_REPLACED = { minimalista: 'neutro', console: 'vermelho', fazenda: 'verde', natal: 'vermelho', chuva: 'azul', pixel: 'padrao', blocos: 'verde' };
export const THEME_VAR_KEYS = ['bg', 'surface', 'sidebar', 'card', 'card2', 'input', 'border', 'text', 'text2', 'muted', 'accent'];
export const PERSONALITIES = ['amigavel', 'profissional', 'divertido', 'mentor', 'zen', 'nerd'];

export const DEFAULT_SETTINGS = {
  // Aparência
  theme: 'padrao',
  themeVars: {},
  radius: 20,
  fontScale: 100,
  fontFamily: 'poppins',       // poppins | system | mono | serif
  density: 'comfortable',
  effects: true,
  showHero: true,
  heroAutoplay: true,
  language: 'pt-BR',
  homePage: 'dashboard',       // hoje | dashboard
  // Rotina
  briefingTime: '07:00',
  briefingEnabled: true,
  dayCloseTime: '21:30',
  pomodoroMinutes: 25,
  weeklyReview: true,          // revisão semanal no domingo à noite
  englishDailyGoal: 20,        // cartões por dia
  readingYearGoal: 12,         // livros por ano
  // Notificações
  notifyTasks: true,
  notifySystem: true,
  notifySound: false,
  remindDaysBefore: 3,
  // Assistente
  assistantEnabled: true,
  showAssistantPanel: true,
  assistantName: 'Niac',
  assistantAvatar: '🤖',
  assistantPersonality: 'amigavel',
  assistantEmoji: true,
  assistantLength: 'media',
  assistantNickname: '',
  assistantInstructions: '',
};

export const DEFAULT_SYSTEM = {
  appName: 'Codeniac',
  allowRegistration: true,
  defaultTheme: 'padrao',
  loginMessage: '',
  images: {},                  // loginBg, loginArt, logo, heroDefault, cardFocus, cardForYou, cardSoon, cardNews
  customCss: '',
  menu: { hidden: [], labels: {} },
  backup: { enabled: true, dir: '', keep: 14, lastAt: null, lastFile: null, lastError: null },
};

// Completa os valores que faltam SEM trocar os objetos: quem guardou uma referência (ex.: o backup
// gravando lastAt) continua alterando o objeto que vai para o banco.
export function systemConfig() {
  const d = db();
  const sys = (d.system ??= {});
  for (const [k, v] of Object.entries(DEFAULT_SYSTEM)) if (sys[k] === undefined) sys[k] = structuredClone(v);
  for (const k of ['backup', 'menu']) {
    if (!sys[k] || typeof sys[k] !== 'object') sys[k] = {};
    for (const [kk, vv] of Object.entries(DEFAULT_SYSTEM[k])) if (sys[k][kk] === undefined) sys[k][kk] = structuredClone(vv);
  }
  sys.images ??= {};
  return sys;
}

// ---------- Páginas (estilo Notion) ----------
const block = (type, extra = {}) => ({ id: id(), type, ...extra });

export function createPage({ userId, projectId, parentId = null, title, icon = null, blocks = [] }) {
  const page = { id: id(), userId, projectId, parentId, title, icon, cover: null, blocks, createdAt: now(), updatedAt: now() };
  db().pages.push(page);
  if (parentId) {
    const parent = db().pages.find((p) => p.id === parentId);
    parent?.blocks.push(block('page', { pageId: page.id }));
  }
  return page;
}

export function ensureRootPage(project) {
  let root = db().pages.find((p) => p.projectId === project.id && !p.parentId);
  if (!root) {
    root = createPage({
      userId: project.userId, projectId: project.id, title: project.name,
      blocks: [
        block('callout', { emoji: '💡', text: project.description || 'Use o botão "Adicionar elemento" para montar esta página.' }),
        block('text', { text: '' }),
      ],
    });
  }
  return root;
}

export function ensureInDrive(project) {
  const root = ensureRootPage(project);
  if (db().pages.some((p) => p.projectId === project.id && /indrive/i.test(p.title))) return;
  createPage({
    userId: project.userId, projectId: project.id, parentId: root.id, title: 'InDrive', icon: '🚗',
    blocks: [
      block('callout', { emoji: '💰', text: 'Controle financeiro das corridas: registre entradas (corridas, gorjetas, bônus) e saídas (combustível, manutenção, taxas).' }),
      block('finance'),
      block('h2', { text: 'Anotações' }),
      block('text', { text: '' }),
    ],
  });
}

// Cartões iniciais de inglês: frases úteis com passageiros.
export const STARTER_CARDS = [
  ['Where would you like to go?', 'Para onde você gostaria de ir?'],
  ['Please fasten your seatbelt.', 'Por favor, coloque o cinto de segurança.'],
  ['Is the temperature OK for you?', 'A temperatura está boa para você?'],
  ['We will arrive in about ten minutes.', 'Vamos chegar em cerca de dez minutos.'],
  ['Traffic is heavy today.', 'O trânsito está pesado hoje.'],
  ['Would you like me to take a different route?', 'Quer que eu pegue outro caminho?'],
  ['Here we are. Have a nice day!', 'Chegamos. Tenha um bom dia!'],
  ['Do you need help with your luggage?', 'Precisa de ajuda com a bagagem?'],
  ['Can you confirm the address, please?', 'Pode confirmar o endereço, por favor?'],
  ['Sorry, I don\'t speak English very well, but I\'m learning.', 'Desculpe, não falo inglês muito bem, mas estou aprendendo.'],
];

export function seedUserWorkspace(userId) {
  const d = db();
  DEFAULT_PROJECTS.forEach((p, i) => {
    const projectId = id();
    d.projects.push({
      id: projectId, userId, slug: p.slug, name: p.name, icon: p.icon, color: p.color,
      tagline: p.tagline, description: p.description, cover: null, favorite: i < 2,
      order: i, createdAt: now(), updatedAt: now(),
    });
    p.tasks.forEach(([title, priority, status], j) => {
      const due = new Date(Date.now() + (j + 1 + i) * 86400000).toISOString().slice(0, 10);
      d.tasks.push({
        id: id(), userId, projectId, title, description: '', status, priority, dueDate: due,
        postponed: 0, statusAt: now(), createdAt: now(), updatedAt: now(), completedAt: null,
      });
    });
  });
  for (const p of d.projects.filter((x) => x.userId === userId)) {
    ensureRootPage(p);
    if (p.slug === 'trabalhos') ensureInDrive(p);
  }
  seedStudy(userId);
  d.settings[userId] = { ...DEFAULT_SETTINGS, theme: systemConfig().defaultTheme };
  d.notifications.push({
    id: id(), userId, type: 'system', title: 'Bem-vindo ao Codeniac 👋',
    message: 'Comece pela aba Hoje: ela reúne agenda, prioridades, hábitos e o briefing da manhã.',
    read: false, createdAt: now(),
  });
  save();
}

// Hábitos e cartões iniciais (também usados na migração para a 1.3).
export function seedStudy(userId) {
  const d = db();
  if (!d.habits.some((h) => h.userId === userId)) {
    for (const [name, icon] of [['Inglês', '🇺🇸'], ['Leitura', '📖'], ['Exercício', '💪']]) {
      d.habits.push({ id: id(), userId, name, icon, days: [], createdAt: now() });
    }
  }
  if (!d.cards.some((c) => c.userId === userId)) {
    const today = new Date().toISOString().slice(0, 10);
    for (const [front, back] of STARTER_CARDS) {
      d.cards.push({ id: id(), userId, deck: 'Passageiros', front, back, example: '', ease: 2.5, interval: 0, reps: 0, lapses: 0, due: today, createdAt: now() });
    }
  }
}

export function createUser({ name, email, password, role = 'user' }) {
  const d = db();
  const user = {
    id: id(), name, email: email.toLowerCase(), password: hashPassword(password),
    role, avatar: null, bio: '', title: 'Membro', lastSeenVersion: null, createdAt: now(),
  };
  d.users.push(user);
  seedUserWorkspace(user.id);
  return user;
}

// Usuário demo + publicação automática do changelog como notificação.
export function bootstrap() {
  const d = db();
  if (d.users.length === 0) {
    createUser({ name: 'Codeniac Admin', email: 'admin@codeniac.dev', password: 'codeniac123', role: 'admin' });
    console.log('» Usuário demo criado: admin@codeniac.dev / codeniac123');
  }
  for (const user of d.users) publishPendingUpdates(user);
  save();
}

export function publishPendingUpdates(user) {
  const d = db();
  if (user.lastSeenVersion === APP_VERSION) return;
  const seenIdx = CHANGELOG.findIndex((c) => c.version === user.lastSeenVersion);
  for (const entry of CHANGELOG.slice(seenIdx + 1)) {
    d.notifications.push({
      id: id(), userId: user.id, type: 'update', title: entry.title,
      message: entry.message, version: entry.version, read: false, createdAt: now(),
    });
  }
  user.lastSeenVersion = APP_VERSION;
}
