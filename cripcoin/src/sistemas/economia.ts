// ECONOMIA: Cripcoin (CC), loja, inventário, compra e venda. Toda a lógica vive aqui; a interface só chama estas funções.
import { item, precoVenda } from '../dados/catalogo';
import { colocar, remover, podeColocar, type Extra } from '../nucleo/mapa';
import { acharLugar, apoioDe } from '../nucleo/superficie';
import { novoId } from '../nucleo/rng';
import { diaDe, horaTexto } from '../nucleo/tempo';
import type { ItemDef, ObjetoColocado, Projeto, Transacao } from '../tipos';

export function registrar(p: Projeto, tipo: Transacao['tipo'], valor: number, descricao: string): Transacao {
  const t: Transacao = { id: novoId('tx'), dia: diaDe(p.minuto), hora: horaTexto(p.minuto), tipo, valor, descricao }; p.transacoes.push(t); if (p.transacoes.length > 500) p.transacoes.splice(0, p.transacoes.length - 500); return t;
}
export const estoqueDe = (p: Projeto, d: ItemDef): number => p.estoqueLoja[d.id] ?? d.estoque;
/** Reposição diária do estoque da loja. */
export function reporEstoque(p: Projeto): void { p.estoqueLoja = {}; p.diaEstoque = diaDe(p.minuto); }

export function comprar(p: Projeto, itemId: string, qtd = 1): { ok: boolean; motivo: string } {
  const d = item(itemId); if (!d) return { ok: false, motivo: 'Item inexistente.' };
  if (!Number.isInteger(qtd) || qtd < 1) return { ok: false, motivo: 'Quantidade inválida.' };
  if (estoqueDe(p, d) < qtd) return { ok: false, motivo: `A loja só tem ${estoqueDe(p, d)} em estoque hoje.` };
  const custo = d.preco * qtd; if (p.cc < custo) return { ok: false, motivo: `Saldo insuficiente: faltam ${custo - p.cc} CC.` };
  p.cc -= custo; p.estoqueLoja[d.id] = estoqueDe(p, d) - qtd; p.inventario[d.id] = (p.inventario[d.id] ?? 0) + qtd; registrar(p, 'compra', -custo, `${qtd}× ${d.nome}`);
  return { ok: true, motivo: `${qtd}× ${d.nome} comprado(s) e enviado(s) ao inventário.` };
}
export function venderDoInventario(p: Projeto, itemId: string, qtd = 1): { ok: boolean; motivo: string } {
  const d = item(itemId); if (!d) return { ok: false, motivo: 'Item inexistente.' }; if ((p.inventario[itemId] ?? 0) < qtd || qtd < 1) return { ok: false, motivo: 'Você não tem essa quantidade no inventário.' };
  const v = precoVenda(d) * qtd; p.inventario[itemId] -= qtd; if (p.inventario[itemId] <= 0) delete p.inventario[itemId]; p.cc += v; registrar(p, 'venda', v, `${qtd}× ${d.nome}`);
  return { ok: true, motivo: `Vendido por ${v} CC.` };
}
export function descartar(p: Projeto, itemId: string, qtd = 1): boolean { if ((p.inventario[itemId] ?? 0) < qtd) return false; p.inventario[itemId] -= qtd; if (p.inventario[itemId] <= 0) delete p.inventario[itemId]; return true; }

/** Retira do mapa e guarda no inventário (os itens em cima da mesa vão juntos; o conteúdo do armário volta ao inventário; arquivos do computador são apagados com ele). */
export function guardarObjeto(p: Projeto, id: string): ObjetoColocado[] {
  const saida = remover(p, id);
  for (const o of saida) {
    if (item(o.def)?.interacao === 'bolsa') continue;                                  // bolsa da funcionária volta sozinha para a mesa dela
    p.inventario[o.def] = (p.inventario[o.def] ?? 0) + 1;
    const dentro = p.armarios[o.id]; if (dentro) { for (const [k, n] of Object.entries(dentro)) p.inventario[k] = (p.inventario[k] ?? 0) + n; delete p.armarios[o.id]; }
  }
  return saida;
}
/** Vende um objeto que está no mapa (60% do preço). */
export function venderObjeto(p: Projeto, id: string): { ok: boolean; motivo: string } {
  const alvo = p.objetos.find((o) => o.id === id); const d = alvo && item(alvo.def); if (!alvo || !d) return { ok: false, motivo: 'Objeto não encontrado.' };
  const itens = guardarObjeto(p, id); let total = 0;
  for (const o of itens) { const dd = item(o.def)!; if (dd.interacao === 'bolsa') continue; venderDoInventario(p, o.def, 1); total += precoVenda(dd); }
  return { ok: true, motivo: `${d.nome} vendido por ${total} CC.` };
}
/** Coloca no mapa um item do inventário (consome 1). */
export function colocarDoInventario(p: Projeto, itemId: string, x: number, y: number, rot: 0 | 1 | 2 | 3, extra: Extra = {}): { ok: boolean; motivo: string; obj?: ObjetoColocado } {
  const d = item(itemId); if (!d) return { ok: false, motivo: 'Item inexistente.' }; if ((p.inventario[itemId] ?? 0) < 1) return { ok: false, motivo: 'Este item não está no inventário.' };
  try { const o = colocar(p, d, x, y, rot, extra); descartar(p, itemId, 1); return { ok: true, motivo: `${d.nome} colocado.`, obj: o }; } catch (e) { return { ok: false, motivo: e instanceof Error ? e.message : String(e) }; }
}

/** Duplica um objeto do mapa: usa uma unidade do inventário ou COMPRA outra pelo preço da loja. Mantém escala e altura; escolhe o lugar livre mais próximo. */
export function duplicarObjeto(p: Projeto, id: string): { ok: boolean; motivo: string; obj?: ObjetoColocado } {
  const o = p.objetos.find((q) => q.id === id); const d = o && item(o.def); if (!o || !d) return { ok: false, motivo: 'Objeto não encontrado.' };
  const extra: Extra = { ex: o.ex, ey: o.ey, travar: o.travar, alt: o.alt };
  let alvo: { x: number; y: number; extra: Extra } | null = null;
  if (d.camada === 'sobre') { const s = apoioDe(p, o); const l = s && acharLugar(p, { ...o, id: '__dup', u: Math.min(1, (o.u ?? 0.5) + 0.2) }, d, s); if (l) alvo = { x: o.x, y: o.y, extra: { ...extra, ...l } }; }
  else for (let r = 1; r <= 4 && !alvo; r++) for (let dy = -r; dy <= r && !alvo; dy++) for (let dx = -r; dx <= r && !alvo; dx++) { if (d.camada === 'parede' && dy !== 0) continue; const x = o.x + dx * (d.camada === 'parede' ? Math.max(1, d.w) : 1); const y = o.y + dy; if (podeColocar(p, d, x, y, o.rot, null, extra).ok) alvo = { x, y, extra }; }
  if (!alvo) return { ok: false, motivo: 'Não há espaço livre perto para duplicar.' };
  let nota = ''; if ((p.inventario[d.id] ?? 0) < 1) { const c = comprar(p, d.id, 1); if (!c.ok) return { ok: false, motivo: `Sem unidade no inventário e ${c.motivo}` }; nota = ` (comprado por ${d.preco} CC)`; }
  const r = colocarDoInventario(p, d.id, alvo.x, alvo.y, o.rot, alvo.extra); return r.ok ? { ...r, motivo: `${d.nome} duplicado${nota}.` } : r;
}
