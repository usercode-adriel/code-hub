// RELÓGIO DA CIDADE — um dia em Nexus City dura 40 minutos reais (36× mais rápido).
// Ele comanda o que se vê na cidade: rotina dos moradores (acordar, trabalhar, passear, dormir), dia e noite,
// relógios do mapa e dos dispositivos e o "Dia N". Prazos do banco, parcelas e contratos seguem em dias reais.
export const DAY_REAL_MIN = 40;
export const SPEED = 1440 / DAY_REAL_MIN; // 36
// âncora: 01/11/2026 00:00 em Nexus City (UTC-3). Fixa, então o relógio é o mesmo em qualquer lugar.
export const ANCHOR = Date.UTC(2026, 10, 1, 3, 0, 0);
export const gameNow = (real = Date.now()) => ANCHOR + (real - ANCHOR) * SPEED;
export const realOf = (game) => ANCHOR + (game - ANCHOR) / SPEED;
const TZ = -3 * 3600000;
export const cityHour = (g = gameNow()) => { const d = new Date(g + TZ); return d.getUTCHours() + d.getUTCMinutes() / 60; };
export const isNight = (g = gameNow()) => { const h = cityHour(g); return h >= 19 || h < 6; };
export function cityClock(w) {
  const g = gameNow();
  const start = w?.core?.genesisAt ? gameNow(new Date(w.core.genesisAt).getTime()) : g;
  const dayOf = (t) => Math.floor((t + TZ) / 86400000);
  return { speed: SPEED, anchor: ANCHOR, dayRealMin: DAY_REAL_MIN, game: g, day: dayOf(g) - dayOf(start) + 1, hour: cityHour(g), night: isNight(g) };
}
