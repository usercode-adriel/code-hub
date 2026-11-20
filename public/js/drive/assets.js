// carrega os sprites do mapa jogável (public/assets/rpg) uma vez e reaproveita
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
    for (const [k, v] of Object.entries(chr)) meta[`chr/${k}`] = [v.w * 4, v.h * 4];
    const img = {};
    await Promise.all(Object.keys(meta).map((k) => new Promise((ok) => { const i = new Image(); i.decoding = 'async'; i.onload = () => { img[k] = i; ok(); }; i.onerror = () => ok(); i.src = `/assets/rpg/${k}.png`; })));
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
