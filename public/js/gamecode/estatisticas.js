// ESTATÍSTICAS DO GAMECODE: tempo jogado e partidas, guardados neste navegador (localStorage). Tudo vem do uso real:
// nada é inventado. As conquistas são calculadas a partir desses números.
const CHAVE = 'codeniac.gamecode.stats';

export function lerStats() {
  try { const s = JSON.parse(localStorage.getItem(CHAVE) || '{}'); return { jogos: s.jogos || {}, recentes: Array.isArray(s.recentes) ? s.recentes : [] }; }
  catch { return { jogos: {}, recentes: [] }; }
}

/** Soma uma partida (em segundos) ao jogo. Partidas de menos de 3 s não contam (abriu e fechou). */
export function registrarSessao(id, segundos, agora = Date.now()) {
  if (segundos < 3) return lerStats();
  const s = lerStats();
  const j = s.jogos[id] || { segundos: 0, vezes: 0, ultimo: 0 };
  j.segundos += Math.round(segundos); j.vezes += 1; j.ultimo = agora;
  s.jogos[id] = j;
  s.recentes = [{ id, segundos: Math.round(segundos), em: agora }, ...s.recentes].slice(0, 8);
  localStorage.setItem(CHAVE, JSON.stringify(s));
  return s;
}

export const totalSegundos = (s) => Object.values(s.jogos).reduce((a, j) => a + j.segundos, 0);
export const totalPartidas = (s) => Object.values(s.jogos).reduce((a, j) => a + j.vezes, 0);

export function formatarTempo(seg) {
  if (seg < 60) return `${seg} s`;
  const m = Math.floor(seg / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}

// conquistas ("troféus"): cada uma tem um nível e uma regra sobre as estatísticas
export const CONQUISTAS = [
  { id: 'primeira', nivel: 'bronze', titulo: 'Primeira partida', texto: 'Jogue pela primeira vez.', ok: (s) => totalPartidas(s) >= 1 },
  { id: 'trio', nivel: 'bronze', titulo: 'De volta ao jogo', texto: 'Jogue 3 partidas.', ok: (s) => totalPartidas(s) >= 3 },
  { id: 'explorador', nivel: 'prata', titulo: 'Explorador', texto: 'Some 5 minutos de jogo.', ok: (s) => totalSegundos(s) >= 300 },
  { id: 'veterano', nivel: 'ouro', titulo: 'Veterano', texto: 'Some 30 minutos de jogo.', ok: (s) => totalSegundos(s) >= 1800 },
  { id: 'lenda', nivel: 'platina', titulo: 'Lenda', texto: 'Some 2 horas de jogo.', ok: (s) => totalSegundos(s) >= 7200 },
];
export function conquistas(s) {
  const lista = CONQUISTAS.map((c) => ({ ...c, feita: c.ok(s) }));
  const por = (n) => lista.filter((c) => c.nivel === n && c.feita).length;
  return { lista, feitas: lista.filter((c) => c.feita).length, total: lista.length, bronze: por('bronze'), prata: por('prata'), ouro: por('ouro'), platina: por('platina') };
}
