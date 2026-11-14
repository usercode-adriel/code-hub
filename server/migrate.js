// Migrações de dados entre versões. Roda no início do servidor e é idempotente.
import { db, id, now, save } from './db.js';
import { removeUpload } from './routes/uploads.js';
import { ensureRootPage, ensureInDrive, DEFAULT_SETTINGS, systemConfig, seedStudy, THEMES, THEME_REPLACED } from './seed.js';

const SCHEMA = 4;

// Converte o conteúdo de uma nota (markdown simples) em blocos.
function noteToBlocks(note) {
  const blocks = [{ id: id(), type: 'h2', text: note.title || 'Nota' }];
  let buffer = [];
  const flush = () => {
    if (buffer.length) blocks.push({ id: id(), type: 'text', text: buffer.join('\n').trim() });
    buffer = [];
  };
  for (let line of String(note.content || '').split('\n')) {
    const img = line.match(/^\s*!\[([^\]]*)\]\((\/uploads\/[\w.-]+|https?:\/\/\S+)\)\s*$/);
    const bullet = line.match(/^\s*[-•]\s+(.*)$/);
    const link = line.match(/^\s*\[([^\]]+)\]\((https?:\/\/\S+)\)\s*$/);
    line = line.replace(/\*\*(.+?)\*\*/g, '$1');
    if (link) { flush(); blocks.push({ id: id(), type: 'link', url: link[2], text: link[1] }); }
    else if (img) { flush(); blocks.push({ id: id(), type: 'image', url: img[2], caption: img[1] === 'imagem' ? '' : img[1] }); }
    else if (bullet) { flush(); blocks.push({ id: id(), type: 'bullet', text: bullet[1].replace(/\*\*(.+?)\*\*/g, '$1') }); }
    else buffer.push(line);
  }
  flush();
  return blocks;
}

function toV2(d) {
  for (const project of d.projects) {
    const root = ensureRootPage(project);
    const notes = d.notes.filter((n) => n.projectId === project.id);
    const links = d.links.filter((l) => l.projectId === project.id);
    for (const n of notes) root.blocks.push(...noteToBlocks(n));
    if (links.length) {
      root.blocks.push({ id: id(), type: 'h2', text: 'Links' });
      for (const l of links) root.blocks.push({ id: id(), type: 'link', url: l.url, text: l.title });
    }
    if (project.slug === 'trabalhos') ensureInDrive(project);
  }
  for (const [uid, s] of Object.entries(d.settings)) {
    const merged = { ...DEFAULT_SETTINGS, ...s };
    if (s.accent && s.accent.toLowerCase() !== '#1f8fff') merged.themeVars = { ...(merged.themeVars || {}), accent: s.accent };
    delete merged.accent;
    d.settings[uid] = merged;
  }
  for (const [uid, t] of Object.entries(d.threads)) {
    if (t && !t.conversations) {
      d.threads[uid] = {
        conversations: (t.display?.length ? [{
          id: id(), title: 'Conversa principal', api: t.api || [], display: t.display || [],
          createdAt: t.display[0]?.at || now(), updatedAt: t.display.at(-1)?.at || now(),
        }] : []),
      };
    }
  }
}

function toV3(d) {
  for (const t of d.tasks) {
    t.postponed ??= 0;
    t.statusAt ??= t.updatedAt || t.createdAt;
  }
  for (const u of d.users) seedStudy(u.id);
  for (const [uid, s] of Object.entries(d.settings)) d.settings[uid] = { ...DEFAULT_SETTINGS, ...s };
}

// 1.5: temas novos, tela inicial = dashboard, cantos mais arredondados.
function toV4(d) {
  for (const s of Object.values(d.settings)) {
    if (!THEMES.includes(s.theme)) { s.theme = THEME_REPLACED[s.theme] || 'padrao'; s.themeVars = {}; }
    if (s.homePage === 'hoje') s.homePage = 'dashboard';
    if (s.radius === 14 || s.radius == null) s.radius = 20;
    if (s.fontFamily === 'retro') s.fontFamily = 'poppins';
  }
  const sys = systemConfig();
  if (!THEMES.includes(sys.defaultTheme)) sys.defaultTheme = THEME_REPLACED[sys.defaultTheme] || 'padrao';
}

export function migrate() {
  const d = db();
  d.system = systemConfig();
  // 1.8: a logo "code hub" passa a valer em todo o sistema (troca logos enviadas antes só uma vez)
  if ((d.system.logoVersion || 0) < 2) {
    for (const k of ['logo', 'logoIcon']) { removeUpload(d.system.images?.[k]); delete d.system.images?.[k]; }
    d.system.logoVersion = 2; save();
  }
  const from = d.meta.schema || 1;
  if (from >= SCHEMA) return;
  if (from < 2) toV2(d);
  if (from < 3) toV3(d);
  if (from < 4) toV4(d);
  d.meta.schema = SCHEMA;
  save();
  console.log(`» Dados migrados do formato ${from} para ${SCHEMA}`);
}
