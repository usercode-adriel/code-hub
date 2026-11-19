// Rostos em pixel art (16-bit) para todos os personagens de IA.
// Os retratos ficam em public/assets/px (cortados das folhas de referência) e cada pessoa recebe um
// rosto fixo, escolhido de forma determinística pelo gênero e pela profissão, evitando repetir rostos
// enquanto houver retratos livres. O mesmo rosto é reaproveitado no chat, no ao vivo, nas notícias e no perfil.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets', 'px');
let TILES = [];
try { TILES = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8')).map(([id, g, role]) => ({ id, g, role, url: `/assets/px/${id}.png` })); } catch { TILES = []; }

export const PX_PREFIX = '/assets/px/';
export const isPixel = (url) => typeof url === 'string' && url.startsWith(PX_PREFIX);
export const pixelTiles = () => TILES;

// papel visual a partir da profissão (uniforme de polícia, jaleco, avental de chef, capacete de obra, terno)
export function roleOf(job = '') {
  const j = String(job).toLowerCase();
  if (/polic|delegad|guarda|segurança|investigador/.test(j)) return 'policia';
  if (/m[ée]dic|enfermeir|dentist|farmac|fisioter|veterin/.test(j)) return 'saude';
  if (/cozinh|chef|confeit|padeir|garç/.test(j)) return 'cozinha';
  if (/pedreir|obra|eletricist|encanador|mec[âa]nic|constru/.test(j)) return 'obra';
  if (/advogad|juiz|juíz|promotor|executiv|diretor|gerente|banc|empres|ceo|pol[íi]tic|vereador|prefeit|deputad|economist|contador|corretor/.test(j)) return 'formal';
  return '';
}

function hash(s) {
  let h = 2166136261;
  for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// escolhe um retrato: mesmo gênero, papel compatível, de preferência ainda não usado
export function pickPixel(p, used = new Set()) {
  if (!TILES.length) return null;
  const g = p.gender === 'm' ? 'm' : 'f';
  const role = roleOf(p.job || p.agent?.role || '');
  const sameG = TILES.filter((t) => t.g === g);
  const pools = [
    sameG.filter((t) => role && t.role === role),
    sameG.filter((t) => !role ? !['policia', 'saude', 'cozinha', 'obra'].includes(t.role) : t.role === '' || t.role === 'formal'),
    sameG,
  ];
  const h = hash(p.id || p.name);
  for (const pool of pools) {
    const free = pool.filter((t) => !used.has(t.url));
    if (free.length) return { url: free[h % free.length].url, shared: false };
  }
  const pool = pools.find((x) => x.length) || TILES;
  return { url: pool[h % pool.length].url, shared: true };
}

// dá rosto em pixel a quem ainda não tem (ou tem o rosto antigo em 3D). Rostos escolhidos pelo usuário
// para os próprios personagens do chat são preservados. Devolve quantos mudaram.
export function assignPixelFaces(personas, { bots = [], onOld } = {}) {
  const used = new Set(personas.filter((p) => isPixel(p.avatar)).map((p) => p.avatar));
  let n = 0;
  for (const p of personas) {
    if (isPixel(p.avatar) || p.avatarStyle === 'pixel-ai') continue;
    const bot = p.botId && bots.find((b) => b.id === p.botId);
    if (bot?.avatar && !isPixel(bot.avatar)) { p.avatar = bot.avatar; continue; } // rosto escolhido pelo usuário
    const pick = pickPixel(p, used);
    if (!pick) break;
    const old = p.avatar;
    p.avatar = pick.url; p.avatarStyle = 'pixel'; p.pxShared = pick.shared; p.restyle = false; p.avatarTried = true;
    used.add(pick.url);
    if (bot && !bot.avatar) bot.avatar = pick.url;
    if (old && old !== pick.url) onOld?.(old);
    n++;
  }
  return n;
}

// prompt para gerar um rosto novo no mesmo estilo quando os retratos prontos acabam
export function pixelPrompt(p) {
  const look = p.looks || `${p.age || 30} year old ${p.gender === 'f' ? 'woman' : 'man'}`;
  return `16-bit pixel art portrait, head and shoulders, front view, of a ${look}, ${p.job || 'citizen'}, friendly face, clean thick dark outlines, limited color palette, flat shading, solid deep navy blue background (#141a4a), retro RPG character face, crisp pixels, no text, no logos`;
}
