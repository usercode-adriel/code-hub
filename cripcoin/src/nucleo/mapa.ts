// MAPA: criação da sala, consulta de piso/parede/porta e regras de colocação de objetos. Sem dependência de tela: tudo testável.
import { item } from '../dados/catalogo';
import type { ItemDef, ObjetoColocado, Projeto } from '../tipos';
import { novoId } from './rng';

export const dentro = (p: { largura: number; altura: number }, x: number, y: number): boolean => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < p.largura && y < p.altura;
export const idx = (p: { largura: number }, x: number, y: number): number => y * p.largura + x;
export const ehParede = (p: Projeto, x: number, y: number): boolean => dentro(p, x, y) && p.paredes[idx(p, x, y)] === 1;
export const portaEm = (p: Projeto, x: number, y: number) => p.portas.find((q) => q.x === x && q.y === y) ?? null;
export const temPiso = (p: Projeto, x: number, y: number): boolean => dentro(p, x, y) && p.piso[idx(p, x, y)] !== '';

export const LIMITES = { min: 6, max: 60, alturaParede: [1, 1.4, 2], tiles: [16, 24, 32, 48] };
export interface ConfigNovo { nome: string; empresa: string; largura: number; altura: number; tile: number; piso: string; corParede: string; alturaParede: number; portas: { lado: 'N' | 'S' | 'E' | 'O'; pos: number }[] }

/** Dimensão de um objeto considerando a rotação (rot ímpar troca largura e profundidade). */
export const pegada = (d: ItemDef, rot: number): { w: number; h: number } => (rot % 2 === 1 ? { w: d.h, h: d.w } : { w: d.w, h: d.h });

/** Cria o projeto: sala do tamanho EXATO pedido, com paredes ao redor (a parede fica DENTRO do retângulo: o grid é o próprio tamanho da sala). */
export function criarProjeto(c: ConfigNovo, agora = Date.now()): Projeto {
  const largura = Math.round(c.largura); const altura = Math.round(c.altura);
  if (largura < LIMITES.min || largura > LIMITES.max || altura < LIMITES.min || altura > LIMITES.max) throw new Error(`A sala precisa ter de ${LIMITES.min} a ${LIMITES.max} tiles por lado.`);
  const p: Projeto = {
    versao: 1, id: novoId('proj'), nome: c.nome.trim() || 'Meu escritório', empresa: c.empresa.trim() || 'Minha empresa', criadoEm: agora, atualizadoEm: agora, largura, altura, tile: LIMITES.tiles.includes(c.tile) ? c.tile : 32,
    piso: Array(largura * altura).fill(c.piso || 'madeira'), paredes: Array(largura * altura).fill(0), corParede: c.corParede || 'creme', alturaParede: LIMITES.alturaParede.includes(c.alturaParede) ? c.alturaParede : 1.4,
    portas: [], objetos: [], cc: 1500, transacoes: [], inventario: {}, estoqueLoja: {}, diaEstoque: 0, funcionarios: [], candidatos: [], recontratar: [], computadores: {}, quadros: {}, armarios: {},
    minuto: 8 * 60, velocidade: 1, prox: 1, config: { som: true, papelDeParede: 'azul' },
  };
  for (let x = 0; x < largura; x++) { p.paredes[idx(p, x, 0)] = 1; p.paredes[idx(p, x, altura - 1)] = 1; }
  for (let y = 0; y < altura; y++) { p.paredes[idx(p, 0, y)] = 1; p.paredes[idx(p, largura - 1, y)] = 1; }
  for (const q of c.portas) {
    const lado = q.lado; const pos = Math.max(1, Math.min(lado === 'N' || lado === 'S' ? largura - 2 : altura - 2, Math.round(q.pos)));
    const x = lado === 'O' ? 0 : lado === 'E' ? largura - 1 : pos; const y = lado === 'N' ? 0 : lado === 'S' ? altura - 1 : pos;
    if (!portaEm(p, x, y)) p.portas.push({ x, y, aberta: false });
  }
  for (const q of p.portas) p.paredes[idx(p, q.x, q.y)] = 0;                           // a porta ocupa o lugar da parede
  return p;
}

/** Quais células a parede-objeto ocupa, na linha da parede. */
export function celulasDe(o: { x: number; y: number; rot: number }, d: ItemDef): { x: number; y: number }[] {
  const { w, h } = d.camada === 'parede' ? { w: d.w, h: 1 } : pegada(d, o.rot); const out: { x: number; y: number }[] = [];
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) out.push({ x: o.x + dx, y: o.y + dy });
  return out;
}

export interface Veredito { ok: boolean; motivo: string }
/** Pode colocar este item aqui? Regras reais de espaço: piso, parede, sobreposição, mesas para itens "sobre", parede para enfeites de parede. */
export function podeColocar(p: Projeto, d: ItemDef, x: number, y: number, rot: number, ignorar: string | null = null): Veredito {
  const cel = celulasDe({ x, y, rot }, d);
  if (d.camada === 'parede') {
    for (const c of cel) {
      if (!dentro(p, c.x, c.y)) return { ok: false, motivo: 'Fora da sala.' };
      if (!ehParede(p, c.x, c.y)) return { ok: false, motivo: 'Este item fica preso a uma parede.' };
      if (!temPiso(p, c.x, c.y + 1) || ehParede(p, c.x, c.y + 1)) return { ok: false, motivo: 'Só vai em parede com chão na frente (parede do fundo).' };
    }
    const ocupado = p.objetos.some((o) => o.id !== ignorar && item(o.def)?.camada === 'parede' && celulasDe(o, item(o.def)!).some((q) => cel.some((c) => c.x === q.x && c.y === q.y)));
    return ocupado ? { ok: false, motivo: 'Já há algo nesta parede.' } : { ok: true, motivo: '' };
  }
  for (const c of cel) {
    if (!dentro(p, c.x, c.y)) return { ok: false, motivo: 'Fora da sala.' };
    if (!temPiso(p, c.x, c.y)) return { ok: false, motivo: 'Sem piso aqui.' };
    if (ehParede(p, c.x, c.y) || portaEm(p, c.x, c.y)) return { ok: false, motivo: 'Há uma parede ou porta aqui.' };
  }
  const outros = p.objetos.filter((o) => o.id !== ignorar);
  if (d.camada === 'sobre') {
    const mesa = outros.find((o) => { const dd = item(o.def); return dd?.mesa && celulasDe(o, dd).some((q) => q.x === x && q.y === y); });
    if (!mesa) return { ok: false, motivo: 'Este item precisa ficar sobre uma mesa.' };
    const ja = outros.filter((o) => o.sobre === mesa.id && o.x === x && o.y === y);
    if (ja.length >= 2) return { ok: false, motivo: 'A mesa não tem mais espaço neste lugar.' };
    if (ja.some((o) => o.def === d.id)) return { ok: false, motivo: 'Já há um igual aqui.' };
    return { ok: true, motivo: '' };
  }
  for (const o of outros) {
    const dd = item(o.def); if (!dd || dd.camada === 'parede' || dd.camada === 'sobre') continue;
    if (d.camada === 'chao' || dd.camada === 'chao') continue;                                  // tapete fica por baixo de tudo
    if (celulasDe(o, dd).some((q) => cel.some((c) => c.x === q.x && c.y === q.y))) return { ok: false, motivo: `Ocupado por ${dd.nome}.` };
  }
  return { ok: true, motivo: '' };
}

export function colocar(p: Projeto, d: ItemDef, x: number, y: number, rot: 0 | 1 | 2 | 3): ObjetoColocado {
  const v = podeColocar(p, d, x, y, rot); if (!v.ok) throw new Error(v.motivo);
  const o: ObjetoColocado = { id: novoId('obj'), def: d.id, x, y, rot };
  if (d.camada === 'sobre') { const mesa = p.objetos.find((m) => { const dd = item(m.def); return dd?.mesa && celulasDe(m, dd).some((q) => q.x === x && q.y === y); }); o.sobre = mesa!.id; }
  if (d.camada === 'parede') o.rot = 0;
  p.objetos.push(o); return o;
}
/** Remove o objeto e tudo que estava em cima dele; devolve a lista de itens retirados. */
export function remover(p: Projeto, id: string): ObjetoColocado[] {
  const alvo = p.objetos.find((o) => o.id === id); if (!alvo) return [];
  const saida = [alvo, ...p.objetos.filter((o) => o.sobre === id)]; const ids = new Set(saida.map((o) => o.id));
  p.objetos = p.objetos.filter((o) => !ids.has(o.id)); for (const f of p.funcionarios) if (f.estacao && ids.has(f.estacao)) f.estacao = null;
  return saida;
}
/** Move (ou gira) um objeto; itens em cima de uma mesa acompanham a mesa. */
export function mover(p: Projeto, id: string, x: number, y: number, rot?: number): Veredito {
  const o = p.objetos.find((q) => q.id === id); const d = o && item(o.def); if (!o || !d) return { ok: false, motivo: 'Objeto não encontrado.' };
  const novaRot = (rot ?? o.rot) as 0 | 1 | 2 | 3; const v = podeColocar(p, d, x, y, novaRot, id); if (!v.ok) return v;
  const dx = x - o.x; const dy = y - o.y;
  if (d.mesa) {
    const filhos = p.objetos.filter((q) => q.sobre === id);
    const velho = { x: o.x, y: o.y, rot: o.rot }; o.x = x; o.y = y; o.rot = novaRot;
    for (const f of filhos) { f.x += dx; f.y += dy; }
    // com a rotação, itens que caírem fora da mesa voltam ao inventário (devolvidos pelo chamador)
    const fora = filhos.filter((f) => !celulasDe(o, d).some((q) => q.x === f.x && q.y === f.y));
    if (fora.length) { for (const f of filhos) { f.x -= dx; f.y -= dy; } o.x = velho.x; o.y = velho.y; o.rot = velho.rot as 0 | 1 | 2 | 3; return { ok: false, motivo: 'Há itens em cima da mesa que não caberiam. Guarde-os antes.' }; }
    return { ok: true, motivo: '' };
  }
  o.x = x; o.y = y; o.rot = novaRot; if (d.camada === 'sobre') { const mesa = p.objetos.find((m) => { const dd = item(m.def); return dd?.mesa && celulasDe(m, dd).some((q) => q.x === x && q.y === y); }); if (mesa) o.sobre = mesa.id; }
  return { ok: true, motivo: '' };
}

/** Pinta o piso de um retângulo (inclusive limpar com ''). */
export function pintarPiso(p: Projeto, x0: number, y0: number, x1: number, y1: number, piso: string): number {
  let n = 0; for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) if (dentro(p, x, y) && !ehParede(p, x, y) && p.piso[idx(p, x, y)] !== piso) { p.piso[idx(p, x, y)] = piso; n++; }
  return n;
}
/** Parede estilo The Sims: constrói/remove uma linha reta de paredes (ou o contorno de um retângulo). Não remove paredes que têm objeto preso; portas viram parede ao construir. */
export function tracarParede(p: Projeto, x0: number, y0: number, x1: number, y1: number, modo: 'construir' | 'remover', retangulo = false): number {
  const cel: { x: number; y: number }[] = [];
  if (retangulo) { for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) { cel.push({ x, y: y0 }, { x, y: y1 }); } for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) { cel.push({ x: x0, y }, { x: x1, y }); } }
  else if (Math.abs(x1 - x0) >= Math.abs(y1 - y0)) { for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) cel.push({ x, y: y0 }); } else { for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) cel.push({ x: x0, y }); }
  let n = 0;
  for (const c of cel) {
    if (!dentro(p, c.x, c.y)) continue; const i = idx(p, c.x, c.y);
    if (modo === 'construir') {
      if (p.paredes[i] === 1) continue;
      if (p.objetos.some((o) => { const d = item(o.def); return d && d.camada !== 'parede' && celulasDe(o, d).some((q) => q.x === c.x && q.y === c.y); })) continue;   // há móvel aqui
      p.portas = p.portas.filter((q) => !(q.x === c.x && q.y === c.y)); p.paredes[i] = 1; if (p.piso[i] === '') p.piso[i] = 'concreto-escuro'; n++;
    } else if (p.paredes[i] === 1) {
      if (p.objetos.some((o) => { const d = item(o.def); return d?.camada === 'parede' && celulasDe(o, d).some((q) => q.x === c.x && q.y === c.y); })) continue;      // enfeite de parede: retire antes
      p.paredes[i] = 0; n++;
    }
  }
  return n;
}
/** Porta: transforma uma parede em porta (ou a porta em parede de novo). Não deixa criar porta onde há enfeite de parede. */
export function alternarPorta(p: Projeto, x: number, y: number): Veredito {
  if (!dentro(p, x, y)) return { ok: false, motivo: 'Fora da sala.' };
  const q = portaEm(p, x, y);
  if (q) { p.portas = p.portas.filter((z) => z !== q); p.paredes[idx(p, x, y)] = 1; return { ok: true, motivo: 'Porta removida.' }; }
  if (!ehParede(p, x, y)) return { ok: false, motivo: 'A porta precisa ficar numa parede.' };
  if (p.objetos.some((o) => { const d = item(o.def); return d?.camada === 'parede' && celulasDe(o, d).some((c) => c.x === x && c.y === y); })) return { ok: false, motivo: 'Há um enfeite nesta parede.' };
  p.paredes[idx(p, x, y)] = 0; p.portas.push({ x, y, aberta: false }); return { ok: true, motivo: 'Porta criada.' };
}
