// AVATAR MANAGER: personagens em spritesheet. Cada personagem guarda a imagem de referência (um asset do Asset Studio), o formato
// dos quadros e as animações associadas aos estados. Trocar a aparência não altera os dados do funcionário (só o vínculo avatarId).
import { area, auditar, erro, txt, numero, id, now, save } from './store.js';
import { obter as obterAsset } from './assets.js';

export const ESTADOS_ANIM = ['idle', 'walking', 'sitting', 'typing', 'thinking', 'talking', 'working', 'celebrating', 'error', 'resting', 'worried', 'meeting', 'meeting-talking'];
export const DIRECOES = ['S', 'SW', 'W', 'NW', 'N', 'NE', 'E', 'SE'];

function limpar(b, asset) {
  const quadroL = Math.round(numero(b.quadroL, asset.frames?.quadroL || asset.largura)); const quadroA = Math.round(numero(b.quadroA, asset.frames?.quadroA || asset.altura));
  if (quadroL < 1 || quadroA < 1 || quadroL > asset.largura || quadroA > asset.altura) throw erro('Tamanho de quadro inválido para esta spritesheet.');
  const colunas = Math.floor(asset.largura / quadroL); const linhas = Math.floor(asset.altura / quadroA);
  const anims = (Array.isArray(b.animacoes) ? b.animacoes : []).slice(0, 60).map((x) => ({
    estado: ESTADOS_ANIM.includes(x.estado) ? x.estado : null, nome: txt(x.nome, 40) || txt(x.estado, 40), direcao: DIRECOES.includes(x.direcao) ? x.direcao : null,
    linha: Math.min(linhas - 1, Math.max(0, Math.round(numero(x.linha, 0)))), quadros: (Array.isArray(x.quadros) ? x.quadros : []).slice(0, 64).map((q) => Math.min(colunas - 1, Math.max(0, Math.round(numero(q, 0))))),
    fps: Math.min(60, Math.max(1, numero(x.fps, 8))), loop: x.loop !== false,
  })).filter((x) => x.nome && x.quadros.length);
  return { quadroL, quadroA, colunas, linhas, animacoes: anims, escala: Math.min(8, Math.max(0.1, numero(b.escala, 1))), ancora: { x: Math.min(1, Math.max(0, numero(b.ancora?.x, 0.5))), y: Math.min(1, Math.max(0, numero(b.ancora?.y, 1))) }, velocidade: Math.min(4, Math.max(0.1, numero(b.velocidade, 1))), direcoes: (Array.isArray(b.direcoes) ? b.direcoes : ['S', 'W', 'N', 'E']).filter((d) => DIRECOES.includes(d)) };
}

export function criar(userId, b) {
  const asset = obterAsset(userId, txt(b.assetId, 60));
  const p = { id: id(), nome: txt(b.nome, 60) || 'Personagem', assetId: asset.id, referenciaAssetId: txt(b.referenciaAssetId, 60) || null, ...limpar(b, asset), origem: txt(b.origem, 200) || 'importado', criadoEm: now() };
  area(userId).personagens.push(p); save(); auditar(userId, 'personagem.criar', { personagem: p.id });
  return p;
}
export function atualizar(userId, pid, b) {
  const a = area(userId); const p = a.personagens.find((x) => x.id === pid); if (!p) throw erro('Personagem não encontrado.', 404);
  const assetId = b.assetId ? txt(b.assetId, 60) : p.assetId; const asset = obterAsset(userId, assetId);
  Object.assign(p, { nome: txt(b.nome, 60) || p.nome, assetId, ...limpar({ ...p, ...b }, asset) }); save();
  return p;
}
export const listar = (userId) => area(userId).personagens;
export function remover(userId, pid) {
  const a = area(userId); const p = a.personagens.find((x) => x.id === pid); if (!p) throw erro('Personagem não encontrado.', 404);
  if (a.agentes.some((x) => x.avatarId === pid)) throw erro('Este personagem está vinculado a um funcionário. Troque a aparência dele antes.', 409);
  a.personagens.splice(a.personagens.indexOf(p), 1); save();
}
/** Troca a aparência de um funcionário sem tocar nos demais dados dele. */
export function vincular(userId, agenteId, personagemId) {
  const a = area(userId); const ag = a.agentes.find((x) => x.id === agenteId); if (!ag) throw erro('Agente não encontrado.', 404);
  if (personagemId && !a.personagens.some((x) => x.id === personagemId)) throw erro('Personagem não encontrado.', 404);
  ag.avatarId = personagemId || null; save(); return ag;
}
