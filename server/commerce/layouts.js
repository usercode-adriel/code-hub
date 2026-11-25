// LAYOUTS DO ESCRITÓRIO (Office Builder): mapas isométricos salvos, com versão para detectar edições simultâneas.
// Formato "codeniac-office" v1 (grade lógica 64×32, projeção isométrica 2:1). O servidor valida limites e tipos;
// quem desenha e interpreta o mapa é o cliente. Animações quadro a quadro nunca são salvas.
import { area, auditar, erro, txt, numero, id, now, save } from './store.js';

export const FORMATO = 'codeniac-office';
export const VERSAO_FORMATO = 1;
export const LIMITES = { lado: [8, 96], objetos: 4000, paredes: 4000, estacoes: 400, personagens: 120, departamentos: 40, colisoes: 6000 };
const int = (v, a, b) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= a && n <= b ? n : null; };

export function validarLayout(d) {
  if (!d || typeof d !== 'object') throw erro('Layout inválido.');
  if (d.formato !== FORMATO) throw erro(`Formato desconhecido: ${String(d.formato)}.`);
  if (d.versaoFormato !== VERSAO_FORMATO) throw erro(`Versão ${String(d.versaoFormato)} do formato não suportada (esperada ${VERSAO_FORMATO}).`);
  const L = int(d.largura, ...LIMITES.lado); const A = int(d.altura, ...LIMITES.lado);
  if (L === null || A === null) throw erro(`Largura e altura devem ficar entre ${LIMITES.lado[0]} e ${LIMITES.lado[1]} tiles.`);
  const dentro = (x, y) => int(x, 0, L - 1) !== null && int(y, 0, A - 1) !== null;
  if (!Array.isArray(d.piso) || d.piso.length !== L * A || d.piso.some((p) => typeof p !== 'string' || p.length > 40)) throw erro('Piso inconsistente com o tamanho do mapa.');
  const lista = (nome, max) => { const v = d[nome] ?? []; if (!Array.isArray(v) || v.length > max) throw erro(`Lista "${nome}" inválida ou grande demais (máximo ${max}).`); return v; };
  const ids = new Set();
  const unico = (o, nome) => { if (typeof o.id !== 'string' || !o.id || ids.has(o.id)) throw erro(`${nome} com identificador ausente ou repetido.`); ids.add(o.id); };
  for (const o of lista('objetos', LIMITES.objetos)) { unico(o, 'Objeto'); if (!dentro(o.x, o.y)) throw erro(`Objeto "${o.id}" fora do mapa.`); if (typeof o.tipo !== 'string' || o.tipo.length > 60) throw erro(`Objeto "${o.id}" sem tipo.`); if (int(o.rot ?? 0, 0, 3) === null) throw erro(`Objeto "${o.id}" com rotação inválida.`); }
  for (const w of lista('paredes', LIMITES.paredes)) { if (!dentro(w.x, w.y) || !['N', 'W'].includes(w.lado)) throw erro('Parede inválida ou fora do mapa.'); }
  for (const c of lista('colisoes', LIMITES.colisoes)) if (!dentro(c.x, c.y)) throw erro('Colisão fora do mapa.');
  for (const p of lista('personagens', LIMITES.personagens)) { unico(p, 'Personagem'); if (!dentro(p.x, p.y)) throw erro(`Personagem "${p.id}" fora do mapa.`); }
  for (const dp of lista('departamentos', LIMITES.departamentos)) { unico(dp, 'Departamento'); if (!dentro(dp.x, dp.y) || int(dp.w, 1, L) === null || int(dp.h, 1, A) === null) throw erro(`Departamento "${dp.id}" inválido.`); }
  const objIds = new Set(d.objetos.map((o) => o.id));
  for (const e of lista('estacoes', LIMITES.estacoes)) { unico(e, 'Estação'); if (e.objetoId && !objIds.has(e.objetoId)) throw erro(`Estação "${e.id}" aponta para um objeto que não existe.`); if (e.pontoTrabalho && !dentro(e.pontoTrabalho.x, e.pontoTrabalho.y)) throw erro(`Ponto de trabalho da estação "${e.id}" fora do mapa.`); }
  return d;
}

const resumo = (l) => ({ id: l.id, nome: l.nome, versao: l.versao, atualizadoEm: l.atualizadoEm, largura: l.dados.largura, altura: l.dados.altura, objetos: l.dados.objetos.length, ativo: false });
export function listar(userId) { const a = area(userId); return a.layouts.map((l) => ({ ...resumo(l), ativo: a.layoutAtivo === l.id })); }
export function obter(userId, lid) { const l = area(userId).layouts.find((x) => x.id === lid); if (!l) throw erro('Layout não encontrado.', 404); return l; }
export function ativo(userId) { const a = area(userId); return a.layoutAtivo ? a.layouts.find((x) => x.id === a.layoutAtivo) || null : null; }

export function criar(userId, { nome, dados, ativar = true }) {
  const a = area(userId);
  const l = { id: id(), nome: txt(nome, 80) || 'Escritório', versao: 1, criadoEm: now(), atualizadoEm: now(), dados: validarLayout(dados) };
  a.layouts.push(l); if (ativar || !a.layoutAtivo) a.layoutAtivo = l.id; save(); auditar(userId, 'layout.criar', { layout: l.id });
  return l;
}
/** Salva com controle de versão: se outra edição foi salva antes, recusa (409) em vez de sobrescrever. */
export function salvar(userId, lid, { nome, dados, versaoBase }) {
  const l = obter(userId, lid);
  if (numero(versaoBase) !== l.versao) throw erro(`Este layout foi alterado em outro lugar (versão ${l.versao}). Recarregue antes de salvar para não perder trabalho.`, 409);
  l.dados = validarLayout(dados); if (nome) l.nome = txt(nome, 80) || l.nome;
  l.versao += 1; l.atualizadoEm = now(); save();
  return l;
}
export function duplicar(userId, lid) {
  const o = obter(userId, lid); const a = area(userId);
  const l = { id: id(), nome: `${o.nome} (cópia)`.slice(0, 80), versao: 1, criadoEm: now(), atualizadoEm: now(), dados: JSON.parse(JSON.stringify(o.dados)) };
  a.layouts.push(l); save(); auditar(userId, 'layout.duplicar', { de: lid, layout: l.id });
  return l;
}
export function ativar(userId, lid) { obter(userId, lid); area(userId).layoutAtivo = lid; save(); }
export function remover(userId, lid) {
  const a = area(userId); const l = obter(userId, lid);
  if (a.layouts.length === 1) throw erro('Mantenha ao menos um layout.', 409);
  a.layouts.splice(a.layouts.indexOf(l), 1); if (a.layoutAtivo === lid) a.layoutAtivo = a.layouts[0].id; save(); auditar(userId, 'layout.remover', { layout: lid });
}
