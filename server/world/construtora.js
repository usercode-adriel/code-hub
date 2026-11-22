// Construtora Nexus + modo Reforma — catálogo de tudo o que existe nas folhas de sprites da cidade (prédios,
// natureza, relevo, mobiliário, sinalização, veículos, fachadas, obras e pisos), de uso livre: nada é comprado.
// O formato do mapa (continente com ilhas, quadrado, arredondado, circular, ilha) é escolhido no editor.
// A reforma salva fica no servidor e vale toda vez que o mapa abre.
import { CATALOG, CATS, SHAPES, TILE } from '../../public/js/drive/obra.js';
import { MAX_BOUNDS } from '../../public/js/mapas/limites.js';
import { nowIso } from './util.js';
import { account } from './bank.js';

const MAX = { add: 20000, floor: 60000, del: 20000 };

export function reformaOf(w) {
  const u = account(w);
  u.reforma ??= { shape: 'continente', add: [], floor: [], del: [], updatedAt: null };
  const r = u.reforma; r.add ??= []; r.floor ??= []; r.del ??= [];
  // mapa novo: o continente com ilhas passa a ser o formato de todos (uma vez)
  if (!r.v2) { r.shape = 'continente'; r.v2 = 1; delete r.owned; delete r.level; }
  return r;
}

// o que o mapa precisa para montar a cidade reformada
export function reformaPublic(w) {
  const r = reformaOf(w);
  return { shape: r.shape, add: r.add, floor: r.floor, del: r.del, updatedAt: r.updatedAt };
}

export function construtoraView(w) {
  const r = reformaOf(w); const used = {};
  for (const a of r.add) used[a.k] = (used[a.k] || 0) + 1; for (const f of r.floor) used[f.k] = (used[f.k] || 0) + 1;
  const items = Object.values(CATALOG).map(({ price, ...c }) => ({ ...c, placed: used[c.key] || 0 }));
  return { cats: CATS, items, shape: r.shape, shapes: Object.entries(SHAPES).map(([k, s]) => ({ key: k, label: s.label })), stats: { items: items.length, placed: r.add.length + r.floor.length, demolished: r.del.length } };
}

// salva a reforma feita no editor; confere limites do mapa e o formato de cada item
export function saveReforma(w, body = {}) {
  const r = reformaOf(w);
  const num = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v) * 100) / 100 : NaN);
  const B = MAX_BOUNDS; const inB = (x, y) => x >= B.x0 && y >= B.y0 && x <= B.x1 && y <= B.y1;
  const shape = SHAPES[body.shape] ? body.shape : r.shape;
  const add = Array.isArray(body.add) ? body.add : r.add; const floor = Array.isArray(body.floor) ? body.floor : r.floor; const del = Array.isArray(body.del) ? body.del : r.del;
  if (add.length > MAX.add || floor.length > MAX.floor || del.length > MAX.del) throw new Error('Reforma grande demais para salvar de uma vez');
  const ids = new Set();
  const outAdd = add.map((a) => {
    const c = CATALOG[a?.k]; if (!c || c.kind === 'floor') throw new Error('Item desconhecido na reforma');
    const x = num(a.x); const y = num(a.y); if (!inB(x, y)) throw new Error('Item fora do mapa');
    const id = String(a.id || '').slice(0, 24); if (!id || ids.has(id)) throw new Error('Item repetido na reforma'); ids.add(id);
    const o = { id, k: c.key, x, y };
    const rot = num(a.r); if (rot && Math.abs(rot) <= 7) o.r = rot;
    const s = num(a.s); if (s && s !== 1) o.s = Math.max(0.3, Math.min(4, s));
    return o;
  });
  const seen = new Set();
  const outFloor = floor.map((f) => {
    const c = CATALOG[f?.k]; if (!c || c.kind !== 'floor') throw new Error('Piso desconhecido');
    const x = Math.round(Number(f.x)); const y = Math.round(Number(f.y));
    if (x % TILE || y % TILE || !inB(x, y)) throw new Error('Piso fora da grade do mapa');
    const k = `${x},${y}`; if (seen.has(k)) throw new Error('Piso repetido'); seen.add(k);
    const o = { k: c.key, x, y }; const rot = num(f.r); if (rot && Math.abs(rot) <= 7) o.r = rot;
    return o;
  });
  const outDel = [...new Set(del.map((d) => String(d).slice(0, 60)).filter((d) => /^[\w:./-]+@-?\d+,-?\d+$/.test(d)))];
  Object.assign(r, { shape, add: outAdd, floor: outFloor, del: outDel, updatedAt: nowIso() });
  return { ok: true, saved: { add: outAdd.length, floor: outFloor.length, del: outDel.length }, shape };
}
