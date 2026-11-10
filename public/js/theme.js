// Motor de temas: presets + cores personalizadas + layout (raio, fonte, escala, densidade, efeitos).
export const THEMES = {
  // ---- Cores básicas: mudam só as cores ----
  azul: { group: 'basic', name: 'Azul escuro', desc: 'Marinho profundo', vars: { surface: '#070f22', bg: '#0b1630', sidebar: '#0e1b3a', card: '#13244a', card2: '#172b57', input: '#1b3263', border: '#24407a', text: '#eaf1ff', text2: '#b3c4e6', muted: '#7286b0', accent: '#3b82f6' } },
  azulclaro: { group: 'basic', name: 'Azul claro', desc: 'Céu sobre fundo escuro', vars: { surface: '#08131c', bg: '#0c1a26', sidebar: '#0f2130', card: '#13293b', card2: '#183247', input: '#1c3a52', border: '#26506e', text: '#e8f6ff', text2: '#aed4ea', muted: '#7aa3bb', accent: '#38bdf8' } },
  preto: { group: 'basic', name: 'Preto', desc: 'Preto puro, ótimo em tela OLED', vars: { surface: '#000000', bg: '#050505', sidebar: '#0b0b0b', card: '#121212', card2: '#181818', input: '#1e1e1e', border: '#2a2a2a', text: '#f2f2f2', text2: '#b0b0b0', muted: '#767676', accent: '#f2f2f2' } },
  vermelho: { group: 'basic', name: 'Vermelho escuro', desc: 'Vinho e coral', vars: { surface: '#2a0c0f', bg: '#4a1d22', sidebar: '#3a1418', card: '#3d161a', card2: '#45191e', input: '#3a1418', border: '#5c262c', text: '#fdeff0', text2: '#e2bcc0', muted: '#b88a8f', accent: '#e5484d' } },
  roxo: { group: 'basic', name: 'Roxo', desc: 'Violeta noturno', vars: { surface: '#110a22', bg: '#1a1030', sidebar: '#170d2b', card: '#21143d', card2: '#281849', input: '#2e1c55', border: '#3d2870', text: '#f3edff', text2: '#c9b8f2', muted: '#8f7cbd', accent: '#a855f7' } },
  verde: { group: 'basic', name: 'Verde', desc: 'Floresta escura', vars: { surface: '#06140f', bg: '#0b1f17', sidebar: '#0d2419', card: '#112d21', card2: '#153628', input: '#193f2f', border: '#22533f', text: '#e9fff4', text2: '#a9dcc2', muted: '#6fa58a', accent: '#22c55e' } },
  neutro: { group: 'basic', name: 'Neutro', desc: 'Cinzas equilibrados', vars: { surface: '#131315', bg: '#1c1c1e', sidebar: '#19191b', card: '#232326', card2: '#29292d', input: '#2e2e33', border: '#38383e', text: '#f1f1f3', text2: '#b9b9c0', muted: '#85858d', accent: '#9ca3af' } },
  // ---- Temas prontos: cores + efeitos e personalidade ----
  padrao: { group: 'preset', name: 'Grafite e azul elétrico', desc: 'O visual original do Codeniac', vars: { surface: '#2b2e34', bg: '#17181c', sidebar: '#1a1b1f', card: '#212328', card2: '#26292f', input: '#2a2d33', border: '#2d3037', text: '#f4f5f7', text2: '#b4b8c0', muted: '#7d828c', accent: '#1f8fff' } },
  gamers: { group: 'preset', name: 'Gamer', desc: 'Neon RGB', vars: { surface: '#07020f', bg: '#0c0618', sidebar: '#0e0720', card: '#150b2a', card2: '#1b0f36', input: '#20123f', border: '#3a1f6e', text: '#f5f0ff', text2: '#c6b6ff', muted: '#8a76c2', accent: '#ff2e88' } },
  magia: { group: 'preset', name: 'Escola de magia', desc: 'Vinho, ouro e pergaminho', head: 'magic', vars: { surface: '#16070a', bg: '#22090e', sidebar: '#1c070b', card: '#2f0f16', card2: '#38141c', input: '#421822', border: '#5c2a2f', text: '#f3e6c4', text2: '#d9c79c', muted: '#a68e68', accent: '#d4af37' } },
  batcaverna: { group: 'preset', name: 'Batcaverna', desc: 'Escuridão e sinal amarelo', vars: { surface: '#050506', bg: '#0b0b0d', sidebar: '#0e0e10', card: '#141417', card2: '#19191d', input: '#1d1d22', border: '#2a2a30', text: '#ececec', text2: '#a9a9b0', muted: '#6f6f78', accent: '#f5c518' } },
  retro80: { group: 'preset', name: 'Retrô 80s', desc: 'Neon e pôr do sol', head: 'retro', vars: { surface: '#0b0018', bg: '#12002b', sidebar: '#0f0024', card: '#1e0546', card2: '#250856', input: '#2c0b66', border: '#4a1a8c', text: '#fbeaff', text2: '#d8b8ff', muted: '#9a7cc9', accent: '#ff2fd1' } },
  nerds: { group: 'preset', name: 'Nerd (Matrix)', desc: 'Chuva de código verde', font: 'mono', vars: { surface: '#000300', bg: '#020a04', sidebar: '#030d06', card: '#06140a', card2: '#091b0e', input: '#0c2312', border: '#11361b', text: '#c8ffd9', text2: '#7fe0a0', muted: '#3f9a5e', accent: '#00ff66' } },
  oceano: { group: 'preset', name: 'Oceano', desc: 'Azul profundo e turquesa', vars: { surface: '#041821', bg: '#071a24', sidebar: '#08202c', card: '#0c2a38', card2: '#103343', input: '#133b4d', border: '#1d4e63', text: '#e6f7ff', text2: '#a6d4e6', muted: '#6c9fb3', accent: '#22d3ee' } },
  cafe: { group: 'preset', name: 'Café', desc: 'Tons quentes de torra', head: 'serif', vars: { surface: '#2a211c', bg: '#1c1612', sidebar: '#201914', card: '#2a211b', card2: '#31271f', input: '#382c23', border: '#4a3a2e', text: '#f6ece3', text2: '#d1bba8', muted: '#9a8371', accent: '#d4a373' } },
  harvard: { group: 'preset', name: 'Harvard', desc: 'Carmesim acadêmico e serifas', head: 'serif', vars: { surface: '#0e0607', bg: '#170b0d', sidebar: '#1d0d10', card: '#241114', card2: '#2c1519', input: '#33191e', border: '#4a2228', text: '#f6ece6', text2: '#d8bfb6', muted: '#a3867e', accent: '#c4122f' } },
};

export const COLOR_LABELS = {
  accent: 'Destaque', bg: 'Fundo do app', surface: 'Fundo externo', sidebar: 'Barra lateral', card: 'Cards',
  card2: 'Cards secundários', input: 'Campos', border: 'Bordas', text: 'Texto', text2: 'Texto secundário', muted: 'Texto apagado',
};

const FONTS = {
  poppins: "'Poppins', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  system: "system-ui, -apple-system, 'Segoe UI', Roboto, Ubuntu, sans-serif",
  mono: "'JetBrains Mono', 'Cascadia Code', Consolas, 'Courier New', monospace",
  serif: "Georgia, 'Times New Roman', serif",
  retro: "'VT323', 'Courier New', monospace",
  pixel: "'Press Start 2P', 'Courier New', monospace",
  magic: "'Cinzel', Georgia, serif",
};

function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrastText = (hex) => (luminance(hex) > 0.45 ? '#111111' : '#ffffff');

export function resolveTheme(settings) {
  const preset = THEMES[settings.theme] || THEMES.padrao;
  const vars = { ...preset.vars, ...(settings.themeVars || {}) };
  return { preset, vars, mode: luminance(vars.bg) > 0.5 ? 'light' : 'dark' };
}

export function applyTheme(settings) {
  const { preset, vars, mode } = resolveTheme(settings);
  const set = (k, v) => document.documentElement.style.setProperty(k, v);
  set('--bg-outer', vars.surface); set('--bg-app', vars.bg); set('--bg-sidebar', vars.sidebar);
  set('--bg-card', vars.card); set('--bg-card-2', vars.card2); set('--bg-input', vars.input);
  set('--bg-hover', `color-mix(in srgb, ${vars.card2} 88%, ${vars.text} 12%)`);
  set('--border', vars.border); set('--border-soft', `color-mix(in srgb, ${vars.border} 55%, ${vars.card})`);
  set('--text', vars.text); set('--text-2', vars.text2); set('--muted', vars.muted);
  set('--accent', vars.accent); set('--on-accent', contrastText(vars.accent));
  set('--tint', mode === 'light' ? '0, 0, 0' : '255, 255, 255');
  set('--media', mode === 'light' ? `color-mix(in srgb, ${vars.card2} 80%, ${vars.border})` : `color-mix(in srgb, ${vars.bg} 85%, #000)`);
  const radius = Number.isFinite(settings.radius) ? settings.radius : 20;
  set('--radius', `${radius}px`); set('--radius-lg', `${radius + 4}px`); set('--radius-sm', `${Math.max(radius - 4, 0)}px`);
  set('--font', FONTS[settings.fontFamily] || FONTS.poppins);
  set('--font-head', FONTS[preset.head] || 'var(--font)');
  set('--zoom', String((settings.fontScale || 100) / 100));
  document.body.dataset.theme = settings.theme || 'padrao';
  document.body.dataset.scheme = mode;
  document.body.classList.toggle('compact', settings.density === 'compact');
  document.body.classList.toggle('no-fx', settings.effects === false);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', vars.bg);
  return { preset, vars, mode };
}

// Valores de layout que um tema sugere ao ser escolhido.
export function presetLayout(themeId) {
  const p = THEMES[themeId] || THEMES.padrao;
  return { radius: p.radius ?? 20, fontFamily: p.font ?? 'poppins', effects: p.effects ?? true };
}
