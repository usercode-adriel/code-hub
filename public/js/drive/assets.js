// carrega os sprites do mapa jogável (public/assets/rpg) uma vez e reaproveita
let cache = null;
export function loadAssets() {
  if (cache) return cache;
  cache = (async () => {
    const meta = await (await fetch('/assets/rpg/meta.json')).json();
    const roles = await (await fetch('/assets/rpg/npc/roles.json')).json();
    const img = {};
    await Promise.all(Object.keys(meta).map((k) => new Promise((ok) => { const i = new Image(); i.decoding = 'async'; i.onload = () => { img[k] = i; ok(); }; i.onerror = () => ok(); i.src = `/assets/rpg/${k}.png`; })));
    return { meta, roles, img };
  })();
  return cache;
}
