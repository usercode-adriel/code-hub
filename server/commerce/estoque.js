// CONTROLE DE ESTOQUE (Sala de Estoque e Logística). Saldo = soma dos movimentos: nada é "ajustado" sem registro.
// Quem registra (agente ou chefe) fica no movimento. Saída maior que o saldo é recusada; divergência registra esperado × contado.
import { area, auditar, erro, txt, numero, oneOf, id, now, save } from './store.js';

export const TIPOS_MOV = ['entrada', 'saida', 'ajuste', 'divergencia'];

export function listarItens(userId) { return area(userId).estoque.itens.map((i) => ({ ...i, abaixoDoMinimo: i.minimo > 0 && i.quantidade < i.minimo })); }
export function listarMovimentos(userId, { itemId = null, limite = 100 } = {}) {
  return area(userId).estoque.movimentos.filter((m) => !itemId || m.itemId === itemId).slice(-limite).reverse();
}
export function acharItem(userId, ref) {
  const r = String(ref ?? '').trim().toLowerCase();
  const it = area(userId).estoque.itens.find((i) => i.id === ref || i.sku.toLowerCase() === r || i.nome.toLowerCase() === r);
  if (!it) throw erro(`Item "${txt(ref, 60)}" não encontrado no estoque.`, 404);
  return it;
}

export function cadastrarItem(userId, b, por = 'chefe') {
  const e = area(userId).estoque; const nome = txt(b.nome, 120); if (!nome) throw erro('Dê um nome ao item.');
  const sku = txt(b.sku, 40) || `SKU-${String(e.itens.length + 1).padStart(4, '0')}`;
  if (e.itens.some((i) => i.sku.toLowerCase() === sku.toLowerCase())) throw erro('Já existe um item com este SKU.', 409);
  const qtd = Math.max(0, Math.floor(numero(b.quantidade, 0)));
  const it = { id: id(), sku, nome, quantidade: 0, minimo: Math.max(0, Math.floor(numero(b.minimo, 0))), local: txt(b.local, 60), unidade: txt(b.unidade, 12) || 'un', produtoId: txt(b.produtoId, 60) || null, criadoEm: now(), criadoPor: por };
  e.itens.push(it);
  if (qtd > 0) movimentar(userId, { itemId: it.id, tipo: 'entrada', quantidade: qtd, motivo: 'saldo inicial' }, por); else save();
  auditar(userId, 'estoque.item', { item: it.id });
  return it;
}

export function movimentar(userId, b, por = 'chefe') {
  const e = area(userId).estoque; const it = acharItem(userId, b.itemId ?? b.item);
  const tipo = oneOf(b.tipo, TIPOS_MOV, null); if (!tipo) throw erro(`Tipo de movimento inválido (${TIPOS_MOV.join(', ')}).`);
  const q = Math.floor(numero(b.quantidade, NaN)); if (!Number.isFinite(q)) throw erro('Informe a quantidade (número inteiro).');
  let delta; let extra = {};
  if (tipo === 'entrada') { if (q <= 0) throw erro('A entrada precisa de quantidade positiva.'); delta = q; }
  else if (tipo === 'saida') { if (q <= 0) throw erro('A saída precisa de quantidade positiva.'); if (q > it.quantidade) throw erro(`Saída de ${q} maior que o saldo de ${it.nome} (${it.quantidade}).`, 409); delta = -q; }
  else if (tipo === 'ajuste') { if (q < 0) throw erro('O ajuste informa o saldo correto (zero ou mais).'); if (!txt(b.motivo, 200)) throw erro('Todo ajuste precisa de um motivo.'); delta = q - it.quantidade; }
  else { // divergencia: contado × esperado (esperado = saldo atual); o saldo passa a ser o contado
    if (q < 0) throw erro('A contagem não pode ser negativa.'); if (!txt(b.motivo, 200)) throw erro('Descreva a divergência encontrada.');
    delta = q - it.quantidade; extra = { esperado: it.quantidade, contado: q };
  }
  it.quantidade += delta;
  const m = { id: id(), itemId: it.id, itemNome: it.nome, tipo, quantidade: tipo === 'saida' ? q : tipo === 'entrada' ? q : Math.abs(delta), delta, saldoApos: it.quantidade, motivo: txt(b.motivo, 200), por, em: now(), ...extra };
  e.movimentos.push(m); if (e.movimentos.length > 5000) e.movimentos.splice(0, e.movimentos.length - 5000);
  save(); auditar(userId, `estoque.${tipo}`, { item: it.id, movimento: m.id });
  return m;
}

export function resumoEstoque(userId) {
  const itens = listarItens(userId); const movs = area(userId).estoque.movimentos;
  return { itens: itens.length, unidades: itens.reduce((s, i) => s + i.quantidade, 0), abaixoDoMinimo: itens.filter((i) => i.abaixoDoMinimo).length, divergencias: movs.filter((m) => m.tipo === 'divergencia').length, ultimoMovimento: movs.at(-1)?.em || null };
}
