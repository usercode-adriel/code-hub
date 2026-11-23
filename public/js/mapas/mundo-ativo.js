// MUNDO ATIVO: o mapa marcado como "Vida" vira o mundo do jogo. Sem mapa marcado, devolve null: o jogo não abre nada e
// mostra só a tela de configurações (Criar mapa).
import { api } from '../api.js';
import { mundoDoMapa } from './mundo-do-mapa.js';

let inventario = null;
async function inventarioMapa() {
  if (!inventario) { const r = await api.get('/mapas/inventario'); inventario = new Map(r.itens.map((i) => [i.chave, i])); }
  return inventario;
}

export async function mundoAtivo() {
  const inv = await inventarioMapa();
  const { vida } = await api.get('/mapas');
  if (!vida) return null;
  try { return mundoDoMapa(await api.get(`/mapas/${vida}`), inv); } catch { return null; /* mapa sumiu */ }
}
