import { describe, expect, it } from 'vitest';
import { arestaMaisProxima, podeColocar } from '../../src/office/construtor';
import { layoutVazio, type Layout } from '../../src/office/modelo';
import { objetoPorTipo } from '../../src/office/catalogo';

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
