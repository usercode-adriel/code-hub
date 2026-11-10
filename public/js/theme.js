// Motor de temas: presets + cores personalizadas + layout (raio, fonte, escala, densidade, efeitos).
export const THEMES = {
  padrao: { name: 'Padrão', desc: 'Grafite e azul elétrico', vars: { surface: '#2b2e34', bg: '#17181c', sidebar: '#1a1b1f', card: '#212328', card2: '#26292f', input: '#2a2d33', border: '#2d3037', text: '#f4f5f7', text2: '#b4b8c0', muted: '#7d828c', accent: '#1f8fff' } },
  batcaverna: { name: 'Batcaverna', desc: 'Escuridão e sinal amarelo', radius: 10, vars: { surface: '#050506', bg: '#0b0b0d', sidebar: '#0e0e10', card: '#141417', card2: '#19191d', input: '#1d1d22', border: '#2a2a30', text: '#ececec', text2: '#a9a9b0', muted: '#6f6f78', accent: '#f5c518' } },
  nerds: { name: 'Nerds', desc: 'Terminal verde', radius: 6, font: 'mono', vars: { surface: '#060a07', bg: '#0d1117', sidebar: '#0b0f14', card: '#111821', card2: '#16202b', input: '#1a2532', border: '#243244', text: '#d7f5dd', text2: '#9fd3aa', muted: '#5f8a6a', accent: '#39d353' } },
  minimalista: { name: 'Minimalista', desc: 'Claro e limpo', radius: 10, effects: false, vars: { surface: '#e9e9ec', bg: '#fafafa', sidebar: '#f4f4f5', card: '#ffffff', card2: '#f4f4f6', input: '#efeff2', border: '#e2e2e6', text: '#18181b', text2: '#52525b', muted: '#8b8b95', accent: '#18181b' } },
  gamers: { name: 'Gamers', desc: 'Neon RGB', radius: 12, vars: { surface: '#07020f', bg: '#0c0618', sidebar: '#0e0720', card: '#150b2a', card2: '#1b0f36', input: '#20123f', border: '#3a1f6e', text: '#f5f0ff', text2: '#c6b6ff', muted: '#8a76c2', accent: '#ff2e88' } },
  oceano: { name: 'Oceano', desc: 'Azul profundo', vars: { surface: '#041821', bg: '#071a24', sidebar: '#08202c', card: '#0c2a38', card2: '#103343', input: '#133b4d', border: '#1d4e63', text: '#e6f7ff', text2: '#a6d4e6', muted: '#6c9fb3', accent: '#22d3ee' } },
  cafe: { name: 'Café', desc: 'Tons quentes', radius: 16, head: 'serif', vars: { surface: '#2a211c', bg: '#1c1612', sidebar: '#201914', card: '#2a211b', card2: '#31271f', input: '#382c23', border: '#4a3a2e', text: '#f6ece3', text2: '#d1bba8', muted: '#9a8371', accent: '#d4a373' } },
  natal: { name: 'Natal', desc: 'Neve, verde e vermelho', radius: 16, vars: { surface: '#0a1f15', bg: '#0f2a1d', sidebar: '#0c2418', card: '#153a28', card2: '#1a4530', input: '#1f4f37', border: '#2c6247', text: '#fdf6e3', text2: '#d9e8d5', muted: '#94b39f', accent: '#e23b3b' } },
  chuva: { name: 'Chuva', desc: 'Dia cinza e aconchegante', radius: 14, vars: { surface: '#1b2330', bg: '#202a38', sidebar: '#1c2532', card: '#263243', card2: '#2c394c', input: '#324156', border: '#3a4a61', text: '#e8eef7', text2: '#b4c2d6', muted: '#7d8ea8', accent: '#6aa9ff' } },
  pixel: { name: 'Pixel', desc: '8 bits, sem curvas', radius: 0, font: 'retro', head: 'pixel', vars: { surface: '#10101c', bg: '#1b1b2f', sidebar: '#16162a', card: '#24243e', card2: '#2c2c4a', input: '#33335a', border: '#000000', text: '#f8f8f2', text2: '#c9c9e0', muted: '#8a8ab0', accent: '#ffcc00' } },
  console: { name: 'Console retrô', desc: 'Portátil vermelho e branco', radius: 18, vars: { surface: '#d9d9de', bg: '#f2f2f4', sidebar: '#e60012', card: '#ffffff', card2: '#f6f6f8', input: '#ececf0', border: '#dddde3', text: '#1c1c22', text2: '#4b4b55', muted: '#8a8a95', accent: '#e60012' } },
  fazenda: { name: 'Fazenda', desc: 'Madeira, papel e plantação', radius: 8, vars: { surface: '#a8d06a', bg: '#f3e2b3', sidebar: '#6b4423', card: '#fbf0d0', card2: '#f5e3b5', input: '#efdcab', border: '#c9a46a', text: '#4a2f17', text2: '#6e4a2a', muted: '#9a7a52', accent: '#4c9a2a' } },
  magia: { name: 'Escola de magia', desc: 'Vinho, ouro e pergaminho', radius: 10, head: 'magic', vars: { surface: '#16070a', bg: '#22090e', sidebar: '#1c070b', card: '#2f0f16', card2: '#38141c', input: '#421822', border: '#5c2a2f', text: '#f3e6c4', text2: '#d9c79c', muted: '#a68e68', accent: '#d4af37' } },
  blocos: { name: 'Blocos', desc: 'Grama, terra e pedra', radius: 0, head: 'retro', vars: { surface: '#1f1f1f', bg: '#2b2b2b', sidebar: '#6b4a2b', card: '#3c3c3c', card2: '#454545', input: '#4f4f4f', border: '#1b1b1b', text: '#f2f2f2', text2: '#cfcfcf', muted: '#9a9a9a', accent: '#5fa83a' } },
  retro80: { name: 'Retrô 80s', desc: 'Neon e pôr do sol', radius: 6, head: 'retro', vars: { surface: '#0b0018', bg: '#12002b', sidebar: '#0f0024', card: '#1e0546', card2: '#250856', input: '#2c0b66', border: '#4a1a8c', text: '#fbeaff', text2: '#d8b8ff', muted: '#9a7cc9', accent: '#ff2fd1' } },
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
  const radius = Number.isFinite(settings.radius) ? settings.radius : 14;
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
  return { radius: p.radius ?? 14, fontFamily: p.font ?? 'poppins', effects: p.effects ?? true };
}
