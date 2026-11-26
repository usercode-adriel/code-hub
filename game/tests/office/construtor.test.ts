import { describe, expect, it } from 'vitest';
import { arestaMaisProxima, podeColocar, segmentoParede } from '../../src/office/construtor';
import { layoutVazio, type Layout } from '../../src/office/modelo';
import { celulasDe, dimensoes, objetoPorTipo } from '../../src/office/catalogo';
import { Grade } from '../../src/office/grade';

const T = (tipo: string) => objetoPorTipo(tipo)!;
const base = (extra: Partial<Layout> = {}): Layout => ({ ...layoutVazio(12, 10, 'madeira'), ...extra });

describe('regras de posicionamento (podeColocar)', () => {
  it('recusa fora do mapa e sobre célula sem piso', () => {
    const l = base(); l.piso[0] = '';
    expect(podeColocar(l, T('planta'), -1, 2, 0).ok).toBe(false); expect(podeColocar(l, T('planta'), 11, 9, 0).ok).toBe(true); expect(podeColocar(l, T('mesa'), 11, 9, 0)).toMatchObject({ ok: false, motivo: 'Fora do mapa.' });
    expect(podeColocar(l, T('planta'), 0, 0, 0)).toMatchObject({ ok: false, motivo: 'Sem piso nesta área.' });
  });
  it('a pegada considera a rotação: mesa 2×1 cabe na borda deitada, mas não em pé', () => {
    const l = base();
    expect(podeColocar(l, T('mesa'), 10, 3, 0).ok).toBe(true); expect(podeColocar(l, T('mesa'), 11, 3, 0).ok).toBe(false);
    expect(podeColocar(l, T('mesa'), 4, 9, 1).ok).toBe(false); expect(podeColocar(l, T('mesa'), 4, 8, 1).ok).toBe(true);
  });
  it('móvel sólido não sobrepõe outro sólido; tapete fica por baixo; computador só sobre mesa e sem repetir', () => {
    const l = base({ objetos: [{ id: 'm', tipo: 'mesa', x: 4, y: 4 }, { id: 'p', tipo: 'planta', x: 8, y: 8 }] });
    expect(podeColocar(l, T('mesa'), 5, 4, 0).ok).toBe(false); expect(podeColocar(l, T('planta'), 8, 8, 0).ok).toBe(false); expect(podeColocar(l, T('estante'), 6, 4, 0).ok).toBe(true);
    expect(podeColocar(l, T('tapete'), 3, 3, 0).ok).toBe(true);
    expect(podeColocar(l, T('computador'), 4, 4, 0).ok).toBe(true); expect(podeColocar(l, T('computador'), 5, 4, 0).ok).toBe(true);
    expect(podeColocar(l, T('computador'), 2, 2, 0)).toMatchObject({ ok: false, motivo: 'Precisa ficar sobre uma mesa.' });
    const com = { ...l, objetos: [...l.objetos, { id: 'c', tipo: 'computador', x: 4, y: 4 }] };
    expect(podeColocar(com, T('computador'), 4, 4, 0)).toMatchObject({ ok: false, motivo: 'Já há um igual aqui.' });
    expect(podeColocar(com, T('cadeira'), 4, 5, 0).ok).toBe(true);
  });
  it('ao mover, o próprio objeto é ignorado na checagem', () => {
    const l = base({ objetos: [{ id: 'm', tipo: 'mesa', x: 4, y: 4 }] });
    expect(podeColocar(l, T('mesa'), 4, 4, 0).ok).toBe(false); expect(podeColocar(l, T('mesa'), 5, 4, 0, undefined, 'm').ok).toBe(true);
  });
  it('cadeiras (não sólidas) não podem ficar uma sobre a outra', () => {
    const l = base({ objetos: [{ id: 'c1', tipo: 'cadeira', x: 3, y: 3 }] });
    expect(podeColocar(l, T('cadeira'), 3, 3, 0).ok).toBe(false); expect(podeColocar(l, T('cadeira'), 4, 3, 0).ok).toBe(true);
  });
});

describe('aresta mais próxima do cursor (paredes)', () => {
  it('escolhe N/W da célula ou as arestas das vizinhas S/E', () => {
    expect(arestaMaisProxima(3.5, 2.05)).toEqual({ x: 3, y: 2, lado: 'N' });
    expect(arestaMaisProxima(3.5, 2.95)).toEqual({ x: 3, y: 3, lado: 'N' });
    expect(arestaMaisProxima(3.05, 2.5)).toEqual({ x: 3, y: 2, lado: 'W' });
    expect(arestaMaisProxima(3.95, 2.5)).toEqual({ x: 4, y: 2, lado: 'W' });
  });
});

describe('posicionamento livre, tamanho e camadas', () => {
  it('posições fracionárias ocupam as células que tocam e respeitam sobreposição', () => {
    const l = base({ objetos: [{ id: 'p', tipo: 'planta', x: 4, y: 4 }] });
    expect(celulasDe(2.5, 3.5, 1, 1)).toEqual({ x0: 2, x1: 4, y0: 3, y1: 5 });
    expect(podeColocar(l, T('planta'), 4.5, 4, 0).ok).toBe(false); expect(podeColocar(l, T('planta'), 5, 4, 0).ok).toBe(true); expect(podeColocar(l, T('planta'), 3.1, 4, 0).ok).toBe(false); expect(podeColocar(l, T('planta'), 3, 4, 0).ok).toBe(true);
    expect(podeColocar(l, T('planta'), 11.5, 5, 0).ok).toBe(false);                                   // metade para fora do mapa
    const g = new Grade({ ...l, objetos: [{ id: 'q', tipo: 'planta', x: 6.5, y: 2.5 }] }); expect(g.livre(6, 2)).toBe(false); expect(g.livre(7, 3)).toBe(false); expect(g.livre(8, 3)).toBe(true);
  });
  it('a escala muda a pegada (mínimo de 1 tile) e a checagem de colisão', () => {
    expect(dimensoes(T('mesa'), 0, 1)).toEqual({ w: 2, d: 1 }); expect(dimensoes(T('mesa'), 0, 2)).toEqual({ w: 4, d: 2 }); expect(dimensoes(T('planta'), 0, 0.5)).toEqual({ w: 1, d: 1 });
    const l = base({ objetos: [{ id: 'p', tipo: 'planta', x: 6, y: 4 }] });
    expect(podeColocar(l, T('mesa'), 3, 4, 0, undefined, null, 1).ok).toBe(true); expect(podeColocar(l, T('mesa'), 3, 4, 0, undefined, null, 2).ok).toBe(false);
    const g = new Grade({ ...l, objetos: [{ id: 'm', tipo: 'mesa', x: 1, y: 1, escala: 2 }] }); expect(g.livre(4, 2)).toBe(false); expect(g.livre(5, 1)).toBe(true);
  });
});

describe('parede esticável (estilo The Sims)', () => {
  it('arrastar na horizontal cria uma linha de arestas N; na vertical, arestas W; Shift desenha o contorno', () => {
    const h = segmentoParede({ gx: 2.1, gy: 3.2 }, { gx: 6.4, gy: 3.6 }); expect(h).toHaveLength(4); expect(h.every((e) => e.lado === 'N' && e.y === 3)).toBe(true); expect(h.map((e) => e.x)).toEqual([2, 3, 4, 5]);
    const v = segmentoParede({ gx: 2.1, gy: 3.2 }, { gx: 2.4, gy: 7.4 }); expect(v).toHaveLength(4); expect(v.every((e) => e.lado === 'W' && e.x === 2)).toBe(true);
    const inv = segmentoParede({ gx: 6, gy: 3 }, { gx: 2, gy: 3 }); expect(inv.map((e) => e.x)).toEqual([2, 3, 4, 5]);
    const r = segmentoParede({ gx: 2, gy: 2 }, { gx: 5, gy: 4 }, true); expect(r).toHaveLength(3 * 2 + 2 * 2); expect(new Set(r.map((e) => `${e.x},${e.y},${e.lado}`)).size).toBe(r.length);
    expect(segmentoParede({ gx: 2, gy: 2 }, { gx: 2.2, gy: 2.1 })).toHaveLength(0);                // clique sem arrastar: vale a aresta mais próxima
  });
});
