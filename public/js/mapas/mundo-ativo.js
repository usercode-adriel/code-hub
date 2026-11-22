// MUNDO ATIVO: o mapa marcado como "Vida" vira o mundo do jogo. Sem mapa marcado, o jogo abre um mapa vazio de grama.
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
  if (vida) {
    try { return mundoDoMapa(await api.get(`/mapas/${vida}`), inv); } catch { /* mapa sumiu: cai no vazio */ }
  }
  return mundoDoMapa({ nome: 'Mapa vazio', largura: 40, altura: 30, celulas: {}, itens: [] }, inv);
}
