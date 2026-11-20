// PATRIMÔNIO E PORTAS (fase 2) — estado persistente de objetos destrutíveis e de portas de propriedades.
// Objetos: cada um tem integridade (0–max), categoria, valor de reposição e a regra de reparo. Portas: estado de acesso
// (aberta, fechada, trancada, bloqueada, restrita) e o dono. Tudo fica em w.patrimonio / w.portas, então persiste.
// Categorias que NUNCA são destrutíveis (estrutura do mapa) não entram aqui: a validação recusa.
import { account, credit } from './bank.js';
import { nowIso } from './util.js';

// categoria → integridade máxima, valor de reposição (NXC) e se pode ser reparada pela prefeitura
export const CATEGORIAS = {
  lixeira: { max: 40, valor: 120, reparo: true },
  placa: { max: 60, valor: 250, reparo: true },
  banco: { max: 50, valor: 400, reparo: true },
  vidraca: { max: 80, valor: 900, reparo: true },
  objeto_loja: { max: 70, valor: 600, reparo: false },
  decorativo: { max: 30, valor: 150, reparo: true },
  patrimonio_publico: { max: 140, valor: 2500, reparo: true },
};
const ESTRUTURAL = /^(predio|parede|muro|ponte|poste-estrutural|pista|calcada|rua)/;
export const PORTA_ESTADOS = ['aberta', 'fechada', 'trancada', 'bloqueada', 'restrita'];

const obj = (w) => (w.patrimonio ??= {});
const portas = (w) => (w.portas ??= {});

// cadastra um objeto destrutível (idempotente); recusa elementos estruturais
export function registrarObjeto(w, id, categoria, extra = {}) {
  if (ESTRUTURAL.test(String(id))) throw new Error(`Elemento estrutural não é destrutível: ${id}`);
  const C = CATEGORIAS[categoria]; if (!C) throw new Error(`Categoria desconhecida: ${categoria}`);
  const o = obj(w);
  o[id] ??= { id, categoria, integ: C.max, max: C.max, estado: 'intacto', dano: 0, ...extra };
  return o[id];
}
export const getObj = (w, id) => obj(w)[id] || null;
export const estadoDe = (o) => (o.integ <= 0 ? 'destruido' : o.integ < o.max * 0.5 ? 'danificado' : 'intacto');
// causa dano: devolve o estado novo e o prejuízo (valor proporcional ao dano causado)
export function danificar(w, id, dano) {
  const o = obj(w)[id]; if (!o) throw new Error(`Objeto não cadastrado: ${id}`);
  if (o.integ <= 0) return { estado: 'destruido', prejuizo: 0, ja: true };
  const antes = o.integ; o.integ = Math.max(0, o.integ - Math.max(0, dano)); o.estado = estadoDe(o);
  const perdido = antes - o.integ; const valor = CATEGORIAS[o.categoria].valor;
  o.dano += perdido;
  return { estado: o.estado, prejuizo: Math.round((perdido / o.max) * valor), integ: o.integ };
}
// colisão do objeto acompanha o estado: destruído não bloqueia (vira entulho), danificado continua sólido
export const bloqueia = (o) => o.estado !== 'destruido';
// reparo pela prefeitura (quando a categoria permite): volta à integridade máxima; devolve o custo estimado
export function reparar(ctx, id, custo = null) {
  const o = obj(ctx.w)[id]; if (!o) throw new Error('Objeto não cadastrado');
  if (!CATEGORIAS[o.categoria].reparo) throw new Error('Este objeto não pode ser reparado');
  const preco = custo ?? Math.round(CATEGORIAS[o.categoria].valor * 0.5);
  o.integ = o.max; o.estado = 'intacto'; o.dano = 0;
  return { ok: true, custo: preco };
}

// portas: cadastro e estado de acesso
export function registrarPorta(w, id, { estado = 'fechada', dono = null, interior = null, alarme = false } = {}) {
  if (!PORTA_ESTADOS.includes(estado)) throw new Error(`Estado de porta inválido: ${estado}`);
  const p = portas(w); p[id] ??= { id, estado, dono, interior, alarme, acesso: [] }; return p[id];
}
// entrada: quem pode entrar. aberta/fechada (sem chave) → entra; trancada → precisa de chave ou do dono;
// bloqueada → ninguém; restrita → só quem está na lista de acesso
export function podeEntrar(w, id, quem = {}) {
  const p = portas(w)[id]; if (!p) return { ok: false, motivo: 'porta-inexistente' };
  if (p.estado === 'bloqueada') return { ok: false, motivo: 'bloqueada' };
  if (p.estado === 'restrita' && !p.acesso.includes(quem.id) && quem.id !== p.dono) return { ok: false, motivo: 'restrita' };
  if (p.estado === 'trancada' && quem.id !== p.dono && !quem.chave) return { ok: false, motivo: 'trancada' };
  return { ok: true, motivo: p.estado === 'trancada' ? 'chave' : 'livre', alarme: p.alarme };
}
export const portaDe = (w, id) => portas(w)[id] || null;
export function mudarEstadoPorta(w, id, estado) {
  if (!PORTA_ESTADOS.includes(estado)) throw new Error('Estado inválido'); const p = portas(w)[id]; if (!p) throw new Error('Porta inexistente');
  p.estado = estado; p.atualizada = nowIso(); return p;
}
// furto de dinheiro de um NPC: o valor é limitado ao que ele tem; o jogador recebe na conta
export function furtarDinheiro(ctx, npc, quer) {
  const cash = Math.max(0, Math.floor(npc.agent?.cash || 0)); const valor = Math.min(cash, Math.max(0, quer));
  if (valor <= 0) return { ok: false, valor: 0 };
  npc.agent.cash = cash - valor; credit(ctx.w, valor, `Furto de ${npc.name}`, ctx.at, 'furto');
  return { ok: true, valor };
}
export const contaCarteira = (w) => account(w).balance;
