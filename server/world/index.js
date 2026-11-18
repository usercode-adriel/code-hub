// LIVING WORLD ENGINE — ponto de entrada.
// A ordem de importação importa: cada módulo se inscreve no núcleo e a gênese roda nessa ordem
// (agentes → cidade → economia → política → mídia).
import { db } from '../db.js';
import { worldTick, world } from './core.js';
import './agents.js';
import './city.js';
import './economy.js';
import './politics.js';
import './media.js';
import './map.js';
import './finance.js';
import './commerce.js';
import './inventory.js';
import './justice.js';
import './society.js';
import './orgs.js';
import './living.js';
import { personById, userChatted, relType, REL_LABEL, requests } from './agents.js';
import { companyById } from './economy.js';
import { socialStep, worldFactHooks } from '../social.js';
import { flushWorld, loadWorld } from './store.js';

const busy = new Set();
async function step(user) {
  if (busy.has(user.id)) return;
  busy.add(user.id);
  try {
    await socialStep(user);
    await worldTick(user);
  } catch (err) { console.error('[mundo]', err); } finally { busy.delete(user.id); }
}
export async function engineTick() { for (const u of db().users) await step(u); }

let started = false;
export function startWorld() {
  if (started) return;
  started = true;
  loadWorld();
  setTimeout(() => engineTick().catch(() => {}), 6000);
  setInterval(() => engineTick().catch((e) => console.error('[mundo]', e.message)), Number(process.env.SOCIAL_TICK_MS) || 30 * 1000).unref();
}
export { flushWorld };

// O usuário conversou com um personagem no chat.
export function onUserChat(user, bot) {
  if (!bot?.personaId) return;
  try {
    const w = world(user.id);
    userChatted({ user, uid: user.id, w, live: true, at: new Date() }, bot.personaId);
  } catch (err) { console.error('[mundo] chat:', err.message); }
}

// O personagem sabe da própria vida na cidade e do que o usuário fez por ele (ou não fez).
worldFactHooks.push((userId, p) => {
  const w = world(userId);
  const a = p.agent;
  if (!a) return '';
  const c = companyById(w, a.companyId);
  const lines = [];
  if (a.resident) lines.push(`- Você mora em Codeniac Society${a.districtId ? `, bairro ${w.city?.districts?.find((d) => d.id === a.districtId)?.name}` : ''}.`);
  if (c) lines.push(`- Trabalho: ${a.role} na ${c.name}${c.status !== 'ativa' ? ` (a empresa está em ${c.status})` : ''}.`);
  else if (a.resident) lines.push('- Você está sem emprego no momento.');
  lines.push(`- Dinheiro: cerca de ${Math.round(a.cash).toLocaleString('pt-BR')} NXC (moeda Nexus).`);
  if (a.status !== 'ativo') lines.push(`- Situação atual: ${a.status}.`);
  const close = Object.entries(a.rel).filter(([, r]) => r.bond || Math.abs(r.aff) >= 35).slice(0, 5).map(([id, r]) => `${personById(w, id)?.name || 'alguém'} (${REL_LABEL[relType(r)]})`);
  if (close.length) lines.push(`- Pessoas importantes na sua vida: ${close.join(', ')}.`);
  const t = relType({ aff: a.user.aff, bond: a.user.bond, met: true });
  lines.push(`- O que você sente pelo usuário: ${REL_LABEL[t]} (afeto ${Math.round(a.user.aff)}/100, confiança ${Math.round(a.user.trust)}/100). Seja coerente com isso: se a confiança está baixa, demonstre.`);
  if (a.user.notes.length) lines.push(`- O que você lembra do usuário:\n${a.user.notes.slice(-6).map((n) => `  · ${n.text}`).join('\n')}`);
  const pend = requests(w).filter((r) => r.personaId === p.id && ['aberto', 'prometido'].includes(r.status));
  if (pend.length) lines.push(`- Você pediu ajuda ao usuário e está esperando: ${pend.map((r) => `${r.kind}${r.status === 'prometido' ? ' (ele prometeu)' : ''}`).join(', ')}.`);
  return `- SUA VIDA NA CIDADE:\n${lines.join('\n')}\n`;
});
