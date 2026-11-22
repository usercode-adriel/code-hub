// mapa de teste para o conversor: uma cruz de ruas (asfalto), um hospital e uma calçada
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mundoDoMapa } from '../../public/js/mapas/mundo-do-mapa.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export function inventarioDeTeste() {
  const m = JSON.parse(fs.readFileSync(path.join(RAIZ, 'public/assets/mapas/inventario/manifesto.json'), 'utf8'));
  return new Map(m.itens.map((i) => [i.chave, i]));
}
export function mapaDeTeste() {
  const celulas = {};
  // ruas longas (20 células): cruzamento no centro (x=10, y=7)
  for (let x = 0; x < 20; x++) celulas[`${x},7`] = 'terreno/asfalto';
  for (let y = 0; y < 14; y++) celulas[`10,${y}`] = 'terreno/asfalto';
  for (let x = 0; x < 20; x++) if (x !== 10) celulas[`${x},6`] = 'terreno/calcada';
  return { nome: 'Teste', largura: 20, altura: 14, celulas, itens: [{ id: 'h1', chave: 'construcoes/hospital', x: 96, y: 120, rot: 0, dados: { nome: 'Hospital', rota: '#/hospital' } }] };
}
export const cidadeDeTeste = () => mundoDoMapa(mapaDeTeste(), inventarioDeTeste());
