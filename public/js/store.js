// Estado global simples com eventos.
import { api } from './api.js';
import { applyTheme } from './theme.js';

const listeners = new Map();

export const store = {
  user: null, settings: {}, projects: [], unread: 0, version: '', aiMode: 'local', appName: 'Codeniac', images: {}, menu: { hidden: [], labels: {} },
};

export function on(evt, fn) {
  if (!listeners.has(evt)) listeners.set(evt, new Set());
  listeners.get(evt).add(fn);
  return () => listeners.get(evt).delete(fn);
}
export function emit(evt, data) { for (const fn of listeners.get(evt) || []) fn(data); }

export async function refreshProjects() {
  store.projects = await api.get('/projects');
  emit('projects', store.projects);
  return store.projects;
}
export async function refreshUnread() {
  const { unread } = await api.get('/notifications');
  store.unread = unread;
  emit('unread', unread);
}
export function setUser(user) { store.user = user; emit('user', user); }

export function applySettings(settings) {
  store.settings = settings;
  applyTheme(settings);
  document.body.classList.toggle('no-assistant', settings.showAssistantPanel === false);
  try {
    const { theme, themeVars, radius, fontFamily, fontScale, density, effects } = settings;
    localStorage.setItem('codeniac.look', JSON.stringify({ theme, themeVars, radius, fontFamily, fontScale, density, effects }));
  } catch { /* armazenamento indisponível */ }
  emit('settings', settings);
}

export const projectBySlug = (slug) => store.projects.find((p) => p.slug === slug);
export const projectById = (id) => store.projects.find((p) => p.id === id);
