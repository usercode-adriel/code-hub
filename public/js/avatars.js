// Avatares PNG que "saem" dos cartões (temas premium). Quem escolhe os arquivos é o administrador
// (Configurações → Aparência → Temas premium). Aqui só decidimos qual avatar vai em qual cartão.
import { store } from './store.js';

export const AVATAR_SLOTS = [
  ['login', 'Tela de login'], ['hero', 'Destaque do início'], ['projetos', 'Projeto em destaque'], ['foco', 'Foco agora'],
  ['plano', 'Plano do dia'], ['banner', 'Banner do assistente'], ['estatistica', 'Estatística'],
];
// No modo automático cada avatar aparece uma vez, começando pelos cartões mais importantes.
const AUTO_ORDER = ['hero', 'banner', 'login', 'projetos', 'foco', 'estatistica', 'plano'];

export function avatarUrl(slot, data = store.avatars) {
  if (!data || data.enabled === false || !data.items?.length) return null;
  const pick = data.slots?.[slot] || 'auto';
  if (pick === 'none') return null;
  if (pick !== 'auto') return data.items.find((i) => i.id === pick)?.url || null;
  const k = AUTO_ORDER.indexOf(slot);
  return k >= 0 && k < data.items.length ? data.items[k].url : null;
}

export const popHtml = (slot, data) => {
  const url = avatarUrl(slot, data);
  return url ? `<img class="av-pop av-${slot}" data-av="${slot}" src="${url}" alt="" draggable="false">` : '';
};
