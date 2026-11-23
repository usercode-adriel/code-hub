// STRUCTURE STUDIO: armazenamento e validação das estruturas (sem rotas: o roteador fica em estudio.js).
// Projetos de estruturas (edifícios, vias, estacionamentos) montados com componentes da biblioteca.
// Cada projeto é um arquivo por usuário em DATA_DIR/estudio/<uid>/estruturas/<id>.json (escrita atômica).
// A aparência (componentes) fica separada da lógica de interação (bloco "logica": entradas, pegada, vagas...).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA_DIR } from './db.js';
import { PRESETS, GRADE, REQUER, compativelComPreset } from '../public/js/estudio/presets.js';
import { normalizarInstancia } from '../public/js/estudio/montagem.js';
import { componentePorId } from './estudio-biblioteca.js';

const PASTA = path.join(DATA_DIR, 'estudio');
const MAX_COMPONENTES = 1500;
const LADO_MIN = 4;
const LADO_MAX = 80; // células

export const pastaDe = (uid) => path.join(PASTA, uid, 'estruturas');
export const arquivoDe = (uid, id) => path.join(pastaDe(uid), `${id}.json`);
export const idValido = (id) => /^[a-f0-9-]{36}$/.test(String(id));

export function gravar(uid, e) {
  fs.mkdirSync(pastaDe(uid), { recursive: true });
  const tmp = `${arquivoDe(uid, e.id)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(e));
  fs.renameSync(tmp, arquivoDe(uid, e.id));
}
export function lerEstrutura(uid, id) {
  if (!idValido(id)) return null;
  try { return JSON.parse(fs.readFileSync(arquivoDe(uid, id), 'utf8')); } catch { return null; }
}
export function listarEstruturas(uid) {
  const dir = pastaDe(uid);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => lerEstrutura(uid, f.slice(0, -5))).filter(Boolean);
}


// cada instância precisa apontar para um componente que existe, ser da perspectiva do preset e, se for peça de encaixe,
// ter um anfitrião compatível na própria estrutura (nada flutuando); ids são únicos
export function validarInstancias(lista, presetId, uid) {
  const vistos = new Set(); const porId = new Map(); const saida = [];
  for (const bruta of lista) {
    if (!bruta || typeof bruta !== 'object' || !bruta.comp) throw new Error('componente inválido na estrutura');
    const i = normalizarInstancia(bruta);
    if (vistos.has(i.id)) throw new Error(`id repetido: ${i.id}`);
    vistos.add(i.id); porId.set(i.id, i); saida.push(i);
  }
  if (!uid) return saida;
  const cache = new Map();
  const comp = (id) => { if (!cache.has(id)) cache.set(id, componentePorId(uid, id)); return cache.get(id); };
  for (const i of saida) {
    const c = comp(i.comp);
    if (!c) throw new Error(`componente fora da biblioteca: ${i.comp}`);
    if (!compativelComPreset(c, presetId)) throw new Error(`"${c.nome}" é de outra perspectiva e não entra neste preset`);
    if (REQUER[c.sub]) {
      const h = i.anfitriao ? porId.get(i.anfitriao) : null; const hc = h && comp(h.comp);
      if (!h || !hc || !REQUER[c.sub].includes(hc.sub)) throw new Error(`"${c.nome}" precisa estar encaixado em: ${REQUER[c.sub].join(', ')}`);
    }
    if (i.anfitriao && !porId.has(i.anfitriao)) throw new Error('anfitrião inexistente');
  }
  return saida;
}

// valida o que vem do cliente; lança erro com a mensagem para o usuário
export function validarEstrutura(corpo, base = null, uid = null) {
  const presetId = String(corpo.preset ?? base?.preset ?? '');
  const preset = PRESETS[presetId];
  if (!preset) throw new Error('preset de câmera desconhecido');
  if (base && base.preset !== presetId) throw new Error('o preset de câmera não pode mudar depois de criado (as perspectivas não se misturam)');
  const tipo = String(corpo.tipo ?? base?.tipo ?? 'outro');
  if (!preset.tipos.includes(tipo)) throw new Error(`tipo inválido para este preset: ${tipo}`);
  const w = Math.trunc(Number(corpo.area?.w ?? base?.area?.w ?? preset.area.w));
  const h = Math.trunc(Number(corpo.area?.h ?? base?.area?.h ?? preset.area.h));
  if (!(w >= LADO_MIN && w <= LADO_MAX && h >= LADO_MIN && h <= LADO_MAX)) throw new Error(`a área tem de ter de ${LADO_MIN} a ${LADO_MAX} células de lado`);
  const componentes = corpo.componentes ?? base?.componentes ?? [];
  if (!Array.isArray(componentes)) throw new Error('componentes inválidos');
  if (componentes.length > MAX_COMPONENTES) throw new Error(`no máximo ${MAX_COMPONENTES} componentes`);
  const instancias = validarInstancias(componentes, presetId, uid);
  return { preset: presetId, tipo, grade: GRADE, area: { w, h }, componentes: instancias, grupos: Array.isArray(corpo.grupos) ? corpo.grupos : (base?.grupos ?? []), logica: corpo.logica && typeof corpo.logica === 'object' ? corpo.logica : (base?.logica ?? { entradas: [], pegada: null }) };
}


export const gravarEstrutura = gravar;
export const resumoEstrutura = (e) => ({ id: e.id, nome: e.nome, preset: e.preset, tipo: e.tipo, area: e.area, componentes: e.componentes.length, atualizado: e.atualizado, prefab: e.prefab || null, variacaoDe: e.variacaoDe || null });
export { MAX_COMPONENTES };
