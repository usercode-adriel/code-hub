import { describe, expect, it } from 'vitest';
import { item } from '../src/dados/catalogo';
import { alvoDe } from '../src/nucleo/alvo';
import { Grade } from '../src/nucleo/grade';
import { novoProjeto } from '../src/nucleo/jogo';
import { ajustarAltura, celulasDe, colocar, mover, podeColocar, posicionarNaSuperficie, redimensionar, restaurarTamanho, type ConfigNovo } from '../src/nucleo/mapa';
import { exportar, importar } from '../src/nucleo/persistencia';
import { ancora, escalaVisual, paredeSob, retSprite } from '../src/nucleo/superficie';
import { duplicarObjeto } from '../src/sistemas/economia';
import type { Projeto } from '../src/tipos';

const cfg: ConfigNovo = { nome: 'T', empresa: 'C', largura: 16, altura: 12, tile: 32, piso: 'madeira', corParede: 'creme', alturaParede: 1.4, portas: [{ lado: 'S', pos: 7 }] };
const novo = (): Projeto => novoProjeto(cfg);
const mesaDe = (p: Projeto) => p.objetos.find((o) => o.def === 'mesa-simples')!;
const dentroDe = (a: { x: number; y: number }, r: { left: number; top: number; w: number; h: number }): boolean => a.x >= r.left && a.x <= r.left + r.w && a.y >= r.top && a.y <= r.top + r.h;

describe('1. paredes como superfície de fixação', () => {
  it('relógio, quadro e prateleira fixam na face inteira, em qualquer segmento e altura', () => {
    const p = novo(); for (const [id, x] of [['relogio-parede', 3], ['quadro-paisagem', 6], ['prateleira-livros', 9]] as const) expect(podeColocar(p, item(id)!, x, 0, 0, null, { alt: 0.8 }).ok).toBe(true);
    const r = colocar(p, item('relogio-parede')!, 3, 0, 0, { alt: 0.9 }); expect(r.alt).toBe(0.9); const rt = retSprite(p, r, item('relogio-parede')!); expect(rt.top).toBeLessThan(0.5);      // topo da face (acima do rodapé)
  });
  it('o ponteiro sobre a parte ALTA da face (acima da célula) encontra a parede; fora da face, não', () => {
    const p = novo(); expect(paredeSob(p, 5.5, -0.2)?.y).toBe(0); expect(paredeSob(p, 5.5, 0.9)?.y).toBe(0); expect(paredeSob(p, 5.5, 3)).toBeNull(); expect(paredeSob(p, 5.5, -0.9)).toBeNull();
    const al = alvoDe(p, item('relogio-parede')!, 5.5, -0.2, 0, {}, null); expect(al.v.ok).toBe(true); expect(al.y).toBe(0); expect(al.extra.alt).toBeGreaterThan(0.5);
  });
  it('colisão física da parede continua valendo para o chão, e a fixação não vira colisão', () => {
    const p = novo(); expect(podeColocar(p, item('mesa-simples')!, 4, 0, 0).ok).toBe(false); expect(podeColocar(p, item('relogio-parede')!, 4, 5, 0).ok).toBe(false);
    const g = new Grade(p); colocar(p, item('relogio-parede')!, 4, 0, 0); expect(new Grade(p).livre(4, 1)).toBe(g.livre(4, 1));
  });
  it('dois objetos na mesma altura se recusam; em alturas diferentes convivem; cantos/portas não têm face', () => {
    const p = novo(); colocar(p, item('relogio-parede')!, 4, 0, 0, { alt: 0.8 }); expect(podeColocar(p, item('quadro-paisagem')!, 4, 0, 0, null, { alt: 0.8 }).ok).toBe(false); expect(podeColocar(p, item('quadro-paisagem')!, 4, 0, 0, null, { alt: 0.1 }).ok).toBe(true);
    expect(podeColocar(p, item('relogio-parede')!, 0, 0, 0).ok).toBe(false); expect(podeColocar(p, item('relogio-parede')!, 7, 11, 0).ok).toBe(false);
  });
  it('ajusta a altura na parede e mantém o objeto dentro da face', () => { const p = novo(); const o = colocar(p, item('quadro-paisagem')!, 6, 0, 0); expect(ajustarAltura(p, o.id, 0.2).ok).toBe(true); expect(o.alt).toBe(0.2); expect(ajustarAltura(p, o.id, 5).ok).toBe(true); expect(o.alt).toBe(1); });
});

describe('2. superfícies de apoio e âncoras', () => {
  it('computador fica DENTRO da área útil da mesa (sem flutuar) e acompanha a mesa ao mover', () => {
    const p = novo(); const m = mesaDe(p); const lap = p.objetos.find((o) => o.def === 'laptop')!; const dm = item('mesa-simples')!;
    const a = ancora(p, lap)!; const rm = retSprite(p, m, dm); const s = dm.superficie!.niveis[0];
    expect(a.x).toBeGreaterThanOrEqual(rm.left + s.x0 * rm.w - 1e-9); expect(a.x).toBeLessThanOrEqual(rm.left + s.x1 * rm.w + 1e-9); expect(a.y).toBeGreaterThanOrEqual(rm.top + s.y0 * rm.h - 1e-9); expect(a.y).toBeLessThanOrEqual(rm.top + s.y1 * rm.h + 1e-9);
    expect(dentroDe(a, rm)).toBe(true); const x0 = a.x; expect(mover(p, m.id, m.x + 3, m.y + 1).ok).toBe(true); const b = ancora(p, lap)!; expect(b.x - x0).toBeCloseTo(3, 5); expect(lap.sobre).toBe(m.id);
  });
  it('vários objetos na mesma mesa se distribuem sem sobrepor; quando falta espaço, recusa', () => {
    const p = novo(); const m = mesaDe(p); const ids = ['monitor', 'teclado', 'caneca', 'telefone']; for (const id of ids) colocar(p, item(id)!, m.x, m.y, 0);
    const on = p.objetos.filter((o) => o.sobre === m.id); expect(on.length).toBe(5); const pts = on.map((o) => ancora(p, o)!); for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) expect(Math.hypot(pts[i].x - pts[j].x, (pts[i].y - pts[j].y) * 3)).toBeGreaterThan(0.05);
    let cheio = false; for (let i = 0; i < 40 && !cheio; i++) { const v = podeColocar(p, item('papeis')!, m.x, m.y, 0); if (!v.ok) cheio = true; else colocar(p, item('papeis')!, m.x, m.y, 0); } expect(cheio).toBe(true);
  });
  it('posição livre dentro da área útil: o administrador escolhe; fora dela é travado', () => {
    const p = novo(); const m = mesaDe(p); const lap = p.objetos.find((o) => o.def === 'laptop')!; expect(posicionarNaSuperficie(p, lap.id, 0, 0.1, 0.2).ok).toBe(true); const a1 = ancora(p, lap)!;
    expect(posicionarNaSuperficie(p, lap.id, 0, 0.9, 0.9).ok).toBe(true); const a2 = ancora(p, lap)!; expect(a2.x).toBeGreaterThan(a1.x); expect(a2.y).toBeGreaterThan(a1.y);
    const rm = retSprite(p, m, item(m.def)!); expect(dentroDe(a1, rm) && dentroDe(a2, rm)).toBe(true); posicionarNaSuperficie(p, lap.id, 0, 5, -3); expect(ancora(p, lap)!.x).toBeLessThanOrEqual(rm.left + rm.w);
  });
  it('tipos compatíveis: notebook/livro em mesa e estante; teclado só em mesa; estante tem níveis', () => {
    const p = novo(); colocar(p, item('estante')!, 9, 3, 0); expect(podeColocar(p, item('caderno')!, 9, 3, 0).ok).toBe(true); expect(podeColocar(p, item('teclado')!, 9, 3, 0).ok).toBe(false);
    const alvoTopo = alvoDe(p, item('caderno')!, 9.9, 3.0, 0, {}, null); const alvoMeio = alvoDe(p, item('caderno')!, 9.9, 3.9, 0, {}, null); expect(alvoTopo.v.pos?.nivel).not.toBe(alvoMeio.v.pos?.nivel);
  });
  it('mesa com itens não gira (sprite de uma vista) e mover para posição inválida preserva tudo', () => {
    const p = novo(); const m = mesaDe(p); expect(item('mesa-simples')!.girar).toBe(false); const antes = JSON.stringify(p.objetos); expect(mover(p, m.id, 0, 0).ok).toBe(false); expect(JSON.stringify(p.objetos)).toBe(antes);
  });
});

describe('3/4. redimensionamento e escala de referência', () => {
  it('cafeteira nasce proporcional (escala padrão < 1) e pode ser reduzida até o mínimo; abaixo disso é recusado', () => {
    const p = novo(); const m = mesaDe(p); const c = colocar(p, item('cafeteira')!, m.x, m.y, 0); const d = item('cafeteira')!; expect(d.escala.padrao).toBeLessThan(0.7);
    const w0 = retSprite(p, c, d).w; expect(redimensionar(p, c.id, 0.5, 0.5).ok).toBe(true); expect(retSprite(p, c, d).w).toBeCloseTo(w0 * 0.5, 5);
    expect(redimensionar(p, c.id, 0.1, 0.1).ok).toBe(false); expect(redimensionar(p, c.id, -1, -1).ok).toBe(false); expect(redimensionar(p, c.id, NaN, 1).ok).toBe(false); expect(c.ex).toBe(0.5);
    expect(restaurarTamanho(p, c.id).ok).toBe(true); expect(c.ex).toBeUndefined(); expect(retSprite(p, c, d).w).toBeCloseTo(w0, 5);
  });
  it('escala é proporcional por categoria: computador < mesa; notebook < monitor; caneca < cafeteira; vaso pequeno < cadeira', () => {
    const p = novo(); const m = mesaDe(p); const larg = (id: string) => { const o = colocar(p, item(id)!, m.x, m.y, 0); const w = retSprite(p, o, item(id)!).w; p.objetos = p.objetos.filter((q) => q.id !== o.id); return w; };
    const wm = retSprite(p, m, item('mesa-simples')!).w; expect(larg('monitor')).toBeLessThan(wm * 0.45); expect(larg('laptop')).toBeLessThanOrEqual(larg('monitor')); expect(larg('caneca')).toBeLessThan(larg('cafeteira')); expect(larg('suculenta')).toBeLessThan(1);
  });
  it('proporção travada ou livre; ex/ey independentes', () => {
    const p = novo(); const m = mesaDe(p); const c = colocar(p, item('caneca')!, m.x, m.y, 0); expect(redimensionar(p, c.id, 1.5, 1, false).ok).toBe(true); const s = escalaVisual(c, item('caneca')!); expect(s.sx / s.sy).toBeCloseTo(1.5, 3);
  });
  it('colisão acompanha o tamanho: móvel maior ocupa mais células e não pode invadir vizinhos', () => {
    const p = novo(); const d = item('mesa-metal')!; const a = colocar(p, d, 3, 6, 0); expect(celulasDe(a, d)).toHaveLength(2); expect(redimensionar(p, a.id, 1.5, 1).ok).toBe(true); expect(celulasDe(a, d)).toHaveLength(3); expect(new Grade(p).livre(5, 6)).toBe(false);
    const b = colocar(p, d, 6, 6, 0); expect(redimensionar(p, b.id, 1, 1).ok).toBe(true); expect(redimensionar(p, a.id, 2, 1).ok).toBe(false); expect(a.ex).toBe(1.5);                // 4 células invadiriam a vizinha
  });
  it('encolher/crescer o móvel revalida os itens em cima', () => {
    const p = novo(); const m = mesaDe(p); colocar(p, item('monitor')!, m.x, m.y, 0); colocar(p, item('teclado')!, m.x, m.y, 0); expect(redimensionar(p, m.id, 0.5, 1).ok).toBe(false); expect(m.ex).toBeUndefined();
  });
  it('duplicar mantém a escala e cobra o preço quando não há unidade no inventário', () => {
    const p = novo(); p.cc = 5000; const m = mesaDe(p); const c = colocar(p, item('caneca')!, m.x, m.y, 0); redimensionar(p, c.id, 1.4, 1.4); const cc0 = p.cc; const r = duplicarObjeto(p, c.id); expect(r.ok).toBe(true); expect(r.obj!.ex).toBe(1.4); expect(p.cc).toBe(cc0 - item('caneca')!.preco);
  });
});

describe('6. persistência e compatibilidade', () => {
  it('escala, posição, rotação, altura e suporte sobrevivem ao salvar/recarregar', () => {
    const p = novo(); const m = mesaDe(p); const c = colocar(p, item('cafeteira')!, m.x, m.y, 0); redimensionar(p, c.id, 0.7, 0.7); posicionarNaSuperficie(p, c.id, 0, 0.8, 0.3); const q = colocar(p, item('quadro-paisagem')!, 6, 0, 0, { alt: 0.35, ex: 1.3, ey: 1.3 });
    const r = importar(exportar(p))!; const c2 = r.objetos.find((o) => o.id === c.id)!; expect(c2.ex).toBe(0.7); expect(c2.u).toBe(0.8); expect(c2.v).toBe(0.3); expect(c2.sobre).toBe(m.id); const q2 = r.objetos.find((o) => o.id === q.id)!; expect(q2.alt).toBe(0.35); expect(q2.ex).toBe(1.3);
    expect(ancora(r, c2)).toEqual(ancora(p, c));
  });
  it('projetos antigos (sem as propriedades novas) são migrados sem apagar nada', () => {
    const p = novo(); const m = mesaDe(p); colocar(p, item('relogio-parede')!, 4, 0, 0); colocar(p, item('caneca')!, m.x, m.y, 0); const n = p.objetos.length;
    const velho = JSON.parse(exportar(p)); for (const o of velho.objetos) { delete o.u; delete o.v; delete o.nivel; delete o.alt; delete o.ex; delete o.ey; }
    const r = importar(JSON.stringify(velho))!; expect(r.objetos).toHaveLength(n); for (const o of r.objetos.filter((q) => q.sobre)) { expect(o.u).toBeTypeOf('number'); expect(o.v).toBeTypeOf('number'); expect(o.nivel).toBe(0); } expect(r.objetos.find((o) => o.def === 'relogio-parede')!.alt).toBeTypeOf('number');
    expect(r.cc).toBe(p.cc); expect(Object.keys(r.computadores)).toEqual(Object.keys(p.computadores));
  });
});
