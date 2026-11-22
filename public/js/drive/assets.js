// carrega os sprites do mapa jogável (public/assets/rpg) uma vez e reaproveita
// atlas: as chaves do manifesto são 'rpg/<caminho>' e 'mundo/<caminho>'; o jogo usa as chaves sem o prefixo de origem,
// e a frota e o avião ganham os nomes que o código já usa (cars/<nome>, air/<nome>)
const ALIAS_ATLAS = (k) => {
  if (k.startsWith('rpg/')) return [k.slice(4)];
  if (k.startsWith('mundo/veiculos/')) return [k.slice(7), 'cars/' + k.slice('mundo/veiculos/'.length)];
  if (k === 'mundo/aeronaves/aviao') return ['air/av-airliner', 'air/av-executivo', k];
  return [k];
};
async function carregarAtlas(img) {
  let man;
  try { const r = await fetch('/assets/atlas/manifesto.json'); if (!r.ok) return false; man = await r.json(); } catch { return false; }
  const paginas = await Promise.all(man.paginas.map(async (nome) => {
    const r = await fetch(`/assets/atlas/${nome}`); if (!r.ok) throw new Error(`atlas ${nome}: ${r.status}`);
    return createImageBitmap(await r.blob());
  }));
  await Promise.all(Object.entries(man.sprites).map(async ([k, [p, x, y, w, h]]) => {
    const bmp = await createImageBitmap(paginas[p], x, y, w, h);
    for (const nome of ALIAS_ATLAS(k)) img[nome] = bmp;
  }));
  paginas.forEach((b) => b.close());
  return true;
}
let cache = null;
export function loadAssets() {
  if (cache) return cache;
  cache = (async () => {
    const meta = await (await fetch('/assets/rpg/meta.json')).json();
    const roles = await (await fetch('/assets/rpg/npc/roles.json')).json();
    const bld = await (await fetch('/assets/rpg/bld/meta.json')).json();
    for (const k of Object.keys(bld)) { meta[`bld/${k}`] = bld[k]; meta[`bld/${k}-lit`] = bld[k]; }
    for (const k of ['tiles/sidewalk', 'tiles/asphalt', 'tiles/front']) meta[k] = [16, 16];
    const deco = await (await fetch('/assets/rpg/deco/meta.json')).json();
    for (const k of Object.keys(deco)) meta[`deco/${k}`] = deco[k];
    // personagens animados: folha 4×4 por personagem (frente, direita, costas, esquerda × 4 passos)
    const chr = await (await fetch('/assets/rpg/chr/meta.json')).json();
    for (const [k, v] of Object.entries(chr)) { meta[`chr/${k}`] = [v.w * 4, v.h * (v.rows || 4)]; meta[`chr/${k}-rx`] = [64 * 7, 56 * 10]; } // folha de reações
    // mundo novo (public/assets/mundo): frota e aeronaves com as mesmas chaves que o jogo já usa (cars/<nome>, air/<nome>)
    const SRC = {};
    const frota = await (await fetch('/assets/mundo/veiculos/meta.json')).json();
    for (const [k, v] of Object.entries(frota)) { const n = k.split('/')[1]; meta[`cars/${n}`] = v; SRC[`cars/${n}`] = `/assets/mundo/veiculos/${n}.png`; }
    const aero = await (await fetch('/assets/mundo/aeronaves/meta.json')).json();
    for (const alvo of ['air/av-airliner', 'air/av-executivo']) { meta[alvo] = aero['aeronaves/aviao']; SRC[alvo] = '/assets/mundo/aeronaves/aviao.png'; }
    const cen = await (await fetch('/assets/mundo/cenario.json')).json();
    for (const [k, v] of Object.entries(cen)) { meta[`mundo/${k}`] = v; SRC[`mundo/${k}`] = `/assets/mundo/${k}.png`; }
    const img = {};
    // atlas (tools/assets/atlas.py): poucas páginas WebP em vez de centenas de PNGs; cada sprite vira um ImageBitmap fatiado
    const doAtlas = await carregarAtlas(img);
    await Promise.all(Object.keys(meta).filter((k) => !img[k]).map((k) => new Promise((ok) => { const i = new Image(); i.decoding = 'async'; i.onload = () => { img[k] = i; ok(); }; i.onerror = () => ok(); i.src = SRC[k] || `/assets/rpg/${k}.png`; })));
    void doAtlas;
    // sprites extras da Construtora: carregados só quando usados (no mapa ou na prévia do editor)
    const pend = new Map();
    const loadExtra = (k) => {
      if (img[`extra/${k}`]) return Promise.resolve(true);
      if (pend.has(k)) return pend.get(k);
      const p = new Promise((ok) => { const i = new Image(); i.decoding = 'async'; i.onload = () => { img[`extra/${k}`] = i; img[`bld/x:${k}`] = i; ok(true); }; i.onerror = () => ok(false); i.src = `/assets/rpg/extra/${k}.png`; });
      pend.set(k, p); return p;
    };
    // carrega o que falta; devolve true se algo novo chegou (aí os blocos do mapa precisam ser redesenhados)
    const ensure = async (keys) => { const miss = [...new Set(keys)].filter((k) => !img[`extra/${k}`]); if (!miss.length) return false; await Promise.all(miss.map(loadExtra)); return true; };
    return { meta, roles, img, ensure };
  })();
  return cache;
}
// chaves das folhas extras usadas por uma cidade gerada (construções, objetos, peças no chão e pisos)
export function extrasOf(city) {
  const out = [];
  const take = (s) => { if (s && s.startsWith('x:')) out.push(s.slice(2)); };
  for (const b of city.blds) take(b.spr);
  for (const p of city.props) take(p.spr);
  for (const d of city.decals || []) take(d.spr);
  for (const g of city.ground) if (g.u) take(g.tex);
  return out;
}
