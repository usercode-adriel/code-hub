// Construtora Nexus + modo Reforma — tudo o que existe nas folhas de sprites da cidade é vendido aqui
// (prédios, natureza, mobiliário urbano, sinalização, fachadas, obras e pisos). O que você compra vai para o
// estoque de obra (aparece no Inventário) e só pode ser colocado no mapa no modo Reforma, até a quantidade
// comprada. Expansões aumentam o terreno da cidade; o formato do mapa (quadrado, arredondado, circular, ilha)
// é escolhido no editor. A reforma salva fica no servidor e vale toda vez que o mapa abre.
import { record, services } from './core.js';
import { account, debit, bankOf, BankError } from './bank.js';
import { CATALOG, CATS, EXPANSION, LEVELS, SHAPES, BOUNDS, TILE, FLOORS } from '../../public/js/drive/obra.js';
import { nowIso } from './util.js';

const MAX = { add: 4000, floor: 12000, del: 8000, qty: 500 };

export function reformaOf(w) {
  const u = account(w);
  u.reforma ??= { shape: 'quadrado', level: 0, owned: {}, add: [], floor: [], del: [], updatedAt: null };
  const r = u.reforma; r.owned ??= {}; r.add ??= []; r.floor ??= []; r.del ??= [];
  return r;
}
const placedCounts = (r) => { const n = {}; for (const a of r.add) n[a.k] = (n[a.k] || 0) + 1; for (const f of r.floor) n[f.k] = (n[f.k] || 0) + 1; return n; };

// o que o mapa precisa para montar a cidade reformada
export function reformaPublic(w) {
  const r = reformaOf(w);
  return { shape: r.shape, level: r.level, add: r.add, floor: r.floor, del: r.del, owned: r.owned, updatedAt: r.updatedAt };
}

export function construtoraView(w) {
  const r = reformaOf(w); const used = placedCounts(r);
  const items = Object.values(CATALOG).map((c) => ({ ...c, owned: r.owned[c.key] || 0, placed: used[c.key] || 0, available: Math.max(0, (r.owned[c.key] || 0) - (used[c.key] || 0)) }));
  return {
    cats: CATS, items, level: r.level, maxLevel: LEVELS, shape: r.shape, shapes: Object.entries(SHAPES).map(([k, s]) => ({ key: k, label: s.label })),
    next: r.level < LEVELS ? { level: r.level + 1, price: EXPANSION[r.level + 1] } : null, balance: bankOf(w).balance,
    stats: { owned: Object.values(r.owned).reduce((a, b) => a + b, 0), placed: r.add.length + r.floor.length, demolished: r.del.length },
  };
}

// estoque de obra para o Inventário (só o que você tem)
export function obraInventory(w) {
  const r = reformaOf(w); const used = placedCounts(r);
  return Object.entries(r.owned).filter(([k, n]) => n > 0 && CATALOG[k]).map(([k, n]) => { const c = CATALOG[k]; return { key: k, name: c.name, cat: c.cat, img: c.img || null, color: c.color || null, owned: n, placed: used[k] || 0, available: Math.max(0, n - (used[k] || 0)) }; });
}

export function buyObra(ctx, { key, qty }) {
  const w = ctx.w; const c = CATALOG[key]; if (!c) throw new BankError('Item não encontrado na Construtora');
  const n = Math.floor(Number(qty) || 1); if (n < 1 || n > MAX.qty) throw new BankError(`Quantidade entre 1 e ${MAX.qty}`);
  const total = c.price * n;
  debit(w, total, `Construtora Nexus: ${n}× ${c.name}`, ctx.at, 'compra');
  const r = reformaOf(w); r.owned[key] = (r.owned[key] || 0) + n;
  if (total >= 5000) {
    record(ctx, { type: 'compra-obra', cat: 'pessoal', title: `Você comprou ${n}× ${c.name} na Construtora Nexus`, text: `${total.toLocaleString('pt-BR')} NXC. Use o botão Reforma no mapa para colocar na cidade.`, actors: ['me'], importance: 1 });
  }
  return { ok: true, key, owned: r.owned[key], total, balance: bankOf(w).balance };
}

export function expandCity(ctx) {
  const w = ctx.w; const r = reformaOf(w);
  if (r.level >= LEVELS) throw new BankError('A cidade já está no tamanho máximo');
  const price = EXPANSION[r.level + 1];
  debit(w, price, `Construtora Nexus: expansão de terreno nível ${r.level + 1}`, ctx.at, 'compra');
  r.level += 1;
  record(ctx, { type: 'expansao-cidade', cat: 'cidade', title: `Nexus City ganhou mais terreno (expansão ${r.level} de ${LEVELS})`, text: 'Novas áreas livres em volta da cidade podem receber ruas, prédios e praças no modo Reforma.', actors: ['me'], importance: 2 });
  services.live?.(w, { kind: 'cidade', personaId: 'me', name: 'Você', text: `A cidade cresceu: expansão de terreno nível ${r.level}` });
  return { ok: true, level: r.level, price };
}

// salva a reforma feita no editor; confere estoque, limites do mapa e formato de cada item
export function saveReforma(w, body = {}) {
  const r = reformaOf(w);
  const num = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v) * 10) / 10 : NaN);
  const inB = (x, y) => x >= BOUNDS.x0 && y >= BOUNDS.y0 && x <= BOUNDS.x1 && y <= BOUNDS.y1;
  const shape = SHAPES[body.shape] ? body.shape : r.shape;
  const add = Array.isArray(body.add) ? body.add : r.add; const floor = Array.isArray(body.floor) ? body.floor : r.floor; const del = Array.isArray(body.del) ? body.del : r.del;
  if (add.length > MAX.add || floor.length > MAX.floor || del.length > MAX.del) throw new BankError('Reforma grande demais para salvar de uma vez');
  const n = {}; const ids = new Set();
  const outAdd = add.map((a) => {
    const c = CATALOG[a?.k]; if (!c || c.kind === 'floor') throw new BankError('Item desconhecido na reforma');
    const x = num(a.x); const y = num(a.y); if (!inB(x, y)) throw new BankError('Item fora do mapa');
    const id = String(a.id || '').slice(0, 24); if (!id || ids.has(id)) throw new BankError('Item repetido na reforma'); ids.add(id);
    n[c.key] = (n[c.key] || 0) + 1;
    const o = { id, k: c.key, x, y };
    const rot = num(a.r); if (rot && Math.abs(rot) <= 7) o.r = rot;
    const s = num(a.s); if (s && s !== 1) o.s = Math.max(0.5, Math.min(2, s));
    return o;
  });
  const seen = new Set();
  const outFloor = floor.map((f) => {
    const c = CATALOG[f?.k]; if (!c || c.kind !== 'floor') throw new BankError('Piso desconhecido');
    const x = Math.round(Number(f.x)); const y = Math.round(Number(f.y));
    if (x % TILE || y % TILE || !inB(x, y)) throw new BankError('Piso fora da grade do mapa');
    const k = `${x},${y}`; if (seen.has(k)) throw new BankError('Piso repetido'); seen.add(k);
    n[c.key] = (n[c.key] || 0) + 1;
    return { k: c.key, x, y };
  });
  for (const [k, used] of Object.entries(n)) if (used > (r.owned[k] || 0)) throw new BankError(`Você colocou ${used}× ${CATALOG[k].name}, mas só comprou ${r.owned[k] || 0}. Compre mais na Construtora.`);
  const outDel = [...new Set(del.map((d) => String(d).slice(0, 60)).filter((d) => /^[\w:.-]+@-?\d+,-?\d+$/.test(d)))];
  Object.assign(r, { shape, add: outAdd, floor: outFloor, del: outDel, updatedAt: nowIso() });
  return { ok: true, saved: { add: outAdd.length, floor: outFloor.length, del: outDel.length }, shape };
}

export { FLOORS };
