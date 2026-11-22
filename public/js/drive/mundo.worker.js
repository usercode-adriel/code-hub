// Worker da geração do mundo: roda o gerador fora da thread da tela, para o mapa não travar enquanto é montado.
// A costa (terreno) volta sem a função de zona (funções não atravessam a fronteira do worker); o resto é dado puro.
import { generateCity } from './mundo.js';

self.onmessage = (e) => {
  const { id, reforma } = e.data;
  try {
    const c = generateCity(undefined, { reforma });
    const { coast, ...resto } = c;
    const costa = { land: coast.land, lakes: coast.lakes, bounds: coast.bounds, mw: coast.mw, mh: coast.mh, level: coast.level };
    self.postMessage({ id, city: { ...resto, coast: costa } });
  } catch (err) {
    self.postMessage({ id, erro: String(err?.message || err) });
  }
};
