import { describe, expect, it } from 'vitest';
import { celulaEm, centroCelula, direcaoDe, gridParaTela, limitesDoMapa, telaParaGrid, DIRECOES } from '../../src/office/iso';
import { chaveProfundidade, ordenarPorChave, ordenarIso, corpoIso, CAMADA } from '../../src/office/profundidade';
import { Historico } from '../../src/office/historico';
import { CameraIso, ZOOMS } from '../../src/office/camera';
import { Grade } from '../../src/office/grade';
import { acharCaminho, livreMaisProxima } from '../../src/office/caminho';
import { layoutVazio, redimensionar, type Layout } from '../../src/office/modelo';
import { escolherAnimacao, estadoParaAnimacao, quadroEm, retanguloDoQuadro, type SheetDef } from '../../src/office/animacoes';

describe('projeção isométrica 2:1', () => {
  it('converte grade ↔ tela e volta, para qualquer ponto e altura', () => {
    for (const [gx, gy, z] of [[0, 0, 0], [3, 5, 0], [10.5, 2.25, 0], [4, 4, 26]] as const) {
      const t = gridParaTela(gx, gy, z); const g = telaParaGrid(t.x, t.y, z);
      expect(g.x).toBeCloseTo(gx, 9); expect(g.y).toBeCloseTo(gy, 9);
    }
    expect(gridParaTela(1, 0)).toEqual({ x: 32, y: 16 }); expect(gridParaTela(0, 1)).toEqual({ x: -32, y: 16 }); expect(gridParaTela(1, 1)).toEqual({ x: 0, y: 32 });
  });
  it('a célula sob o centro de uma célula é ela mesma, e as bordas pertencem a quem de direito', () => {
    for (const [x, y] of [[0, 0], [7, 3], [12, 12], [3, 20]]) { const c = centroCelula(x, y); expect(celulaEm(c.x, c.y)).toEqual({ x, y }); }
    expect(celulaEm(0, 8)).toEqual({ x: 0, y: 0 }); expect(celulaEm(0, 40)).toEqual({ x: 1, y: 1 });
  });
  it('os limites do mapa contêm todos os cantos', () => {
    const l = limitesDoMapa(34, 26);
    for (const [x, y] of [[0, 0], [34, 0], [0, 26], [34, 26]]) { const p = gridParaTela(x, y); expect(p.x).toBeGreaterThan(l.x0); expect(p.x).toBeLessThan(l.x1); expect(p.y).toBeGreaterThan(l.y0); expect(p.y).toBeLessThan(l.y1); }
  });
  it('direções de movimento na tela: +x = SE, +y = SW, -x = NW, -y = NE; parado mantém', () => {
    expect(direcaoDe(1, 0)).toBe('SE'); expect(direcaoDe(0, 1)).toBe('SW'); expect(direcaoDe(-1, 0)).toBe('NW'); expect(direcaoDe(0, -1)).toBe('NE');
    expect(direcaoDe(1, 1)).toBe('S'); expect(direcaoDe(-1, -1)).toBe('N'); expect(direcaoDe(1, -1)).toBe('E'); expect(direcaoDe(-1, 1)).toBe('W');
    expect(direcaoDe(0, 0, 'NE')).toBe('NE'); expect(DIRECOES.length).toBe(8);
  });
});

describe('profundidade', () => {
  const ids = (l: { id: string }[]) => l.map((e) => e.id);
  it('pessoa atrás da mesa fica por baixo; na frente, por cima — mesmo com mesa larga (a soma x+y erraria)', () => {
    const mesa = corpoIso('mesa', 5, 5, 2, 1, 26, CAMADA.mobiliario);
    const atras = corpoIso('atras', 5.2, 3.9, 0.6, 0.6, 40, CAMADA.personagem); const frente = corpoIso('frente', 5.2, 6.3, 0.6, 0.6, 40, CAMADA.personagem);
    expect(ids(ordenarIso([frente, mesa, atras]))).toEqual(['atras', 'mesa', 'frente']);
  });
  it('chão e tapetes ficam sempre por baixo; objetos sem sobreposição na tela não geram dependência', () => {
    const tapete = corpoIso('tapete', 3, 3, 3, 2, 2, CAMADA.piso); const pessoa = corpoIso('p', 3.5, 3.5, 0.6, 0.6, 40, CAMADA.personagem); const longe = corpoIso('longe', 20, 1, 1, 1, 30, CAMADA.mobiliario);
    const o = ids(ordenarIso([pessoa, longe, tapete])); expect(o.indexOf('tapete')).toBeLessThan(o.indexOf('p'));
    expect(o.length).toBe(3);
  });
  it('uma fileira de móveis lado a lado e uma pessoa entre eles respeita as duas frentes', () => {
    const a = corpoIso('a', 4, 4, 1, 1, 40, CAMADA.mobiliario); const b = corpoIso('b', 6, 4, 1, 1, 40, CAMADA.mobiliario); const p = corpoIso('p', 5.2, 4.2, 0.6, 0.6, 40, CAMADA.personagem);
    const o = ids(ordenarIso([p, b, a])); expect(o.length).toBe(3);
    const atras = corpoIso('pa', 5.2, 2.5, 0.6, 0.6, 40, CAMADA.personagem); const o2 = ids(ordenarIso([a, b, atras])); expect(o2.indexOf('pa')).toBeLessThan(o2.indexOf('a'));
  });
  it('plano B pela chave: maior x+y por cima; camada desempata; ordem original é estável', () => {
    expect(chaveProfundidade({ x: 2, y: 2, camada: CAMADA.personagem })).toBeGreaterThan(chaveProfundidade({ x: 2, y: 2, camada: CAMADA.mobiliario }));
    const a = { id: 'a', x: 1, y: 1 }; const b = { id: 'b', x: 1, y: 1 };
    expect(ids(ordenarPorChave([a, b]))).toEqual(['a', 'b']);
  });
  it('objeto empilhado (computador sobre a mesa) fica depois da mesa, mesmo com a mesa mais larga', () => {
    const mesa = corpoIso('mesa', 4, 4, 2, 1, 26, CAMADA.mobiliario); const pc = corpoIso('pc', 4, 4, 1, 1, 48, CAMADA.objeto); pc.vies = 500;
    expect(ids(ordenarIso([pc, mesa]))).toEqual(['mesa', 'pc']);
  });
  it('muitos corpos ordenam rápido (300 em menos de 50 ms) e sem perder nenhum', () => {
    const l = Array.from({ length: 300 }, (_, i) => corpoIso(`c${i}`, (i * 7) % 30, Math.floor(i / 10), 1 + (i % 3 === 0 ? 1 : 0), 1, 30, i % 5 === 0 ? CAMADA.personagem : CAMADA.mobiliario));
    const t0 = performance.now(); const o = ordenarIso(l); const ms = performance.now() - t0;
    expect(o.length).toBe(300); expect(new Set(ids(o)).size).toBe(300); expect(ms).toBeLessThan(50);
  });
});

describe('histórico (desfazer/refazer)', () => {
  it('desfaz e refaz, descarta o futuro ao editar, ignora estado repetido e respeita o limite', () => {
    const h = new Historico({ n: 0 }, 3);
    expect(h.registrar({ n: 0 })).toBe(false);
    h.registrar({ n: 1 }); h.registrar({ n: 2 });
    expect(h.desfazer()).toEqual({ n: 1 }); expect(h.desfazer()).toEqual({ n: 0 }); expect(h.desfazer()).toBeNull();
    expect(h.refazer()).toEqual({ n: 1 });
    h.registrar({ n: 9 }); expect(h.podeRefazer).toBe(false);
    h.registrar({ n: 10 }); h.registrar({ n: 11 }); expect(h.tamanho).toBe(3);
  });
});

describe('câmera', () => {
  it('zoom em passos mantém o ponto sob o cursor; arrastar e limites funcionam', () => {
    const c = new CameraIso(); c.setViewport(1000, 600); c.setLimites({ x0: -2000, y0: -2000, x1: 2000, y1: 2000 }); c.centrarEm(100, 50);
    const antes = c.telaParaMundo(700, 200); c.zoomPasso(1, 700, 200); const depois = c.telaParaMundo(700, 200);
    expect(depois.x).toBeCloseTo(antes.x, 6); expect(depois.y).toBeCloseTo(antes.y, 6); expect(c.zoom).toBe(1.5);
    for (let i = 0; i < 20; i++) c.zoomPasso(1); expect(c.zoom).toBe(ZOOMS[ZOOMS.length - 1]);
    for (let i = 0; i < 20; i++) c.zoomPasso(-1); expect(c.zoom).toBe(ZOOMS[0]);
    c.setZoomIndice(2); c.centrarEm(0, 0); c.arrastar(100, 0); expect(c.x).toBeCloseTo(-100, 6);
    c.arrastar(-1e7, -1e7); expect(c.x).toBeLessThanOrEqual(2000); expect(c.y).toBeLessThanOrEqual(2000);
    const m = c.mundoParaTela(30, 40); const w = c.telaParaMundo(m.x, m.y); expect(w.x).toBeCloseTo(30, 6);
  });
  it('mapa menor que a janela fica centralizado; "ajustar" escolhe o maior zoom que cabe', () => {
    const c = new CameraIso(); c.setViewport(2000, 1200); c.setLimites({ x0: 0, y0: 0, x1: 400, y1: 300 }); c.arrastar(500, 500);
    expect(c.x).toBe(200); expect(c.y).toBe(150);
    c.ajustar(); expect(c.zoom).toBe(3);
  });
});

const mk = (extra: Partial<Layout> = {}): Layout => ({ ...layoutVazio(10, 8, 'madeira'), ...extra });

describe('grade: colisão e paredes', () => {
  it('móveis sólidos bloqueiam todas as células que ocupam (inclusive rotacionados); cadeira não bloqueia', () => {
    const g = new Grade(mk({ objetos: [{ id: 'm', tipo: 'mesa', x: 2, y: 2, rot: 0 }, { id: 'm2', tipo: 'mesa', x: 6, y: 2, rot: 1 }, { id: 'c', tipo: 'cadeira', x: 4, y: 4 }] }));
    expect(g.livre(2, 2) || g.livre(3, 2)).toBe(false); expect(g.livre(4, 2)).toBe(true);
    expect(g.livre(6, 2)).toBe(false); expect(g.livre(6, 3)).toBe(false); expect(g.livre(7, 2)).toBe(true);
    expect(g.livre(4, 4)).toBe(true);
  });
  it('célula sem piso e colisão manual bloqueiam; fora do mapa também', () => {
    const l = mk({ colisoes: [{ x: 5, y: 5 }] }); l.piso[0] = '';
    const g = new Grade(l); expect(g.livre(0, 0)).toBe(false); expect(g.livre(5, 5)).toBe(false); expect(g.livre(-1, 3)).toBe(false); expect(g.livre(10, 3)).toBe(false);
  });
  it('parede bloqueia a aresta; porta deixa passar; janela não; diagonal não corta quina', () => {
    const g = new Grade(mk({ paredes: [{ x: 3, y: 3, lado: 'N' }, { x: 5, y: 3, lado: 'N', abertura: 'porta' }, { x: 7, y: 3, lado: 'N', abertura: 'janela' }, { x: 3, y: 6, lado: 'W' }] }));
    expect(g.passo(3, 2, 3, 3)).toBe(false); expect(g.passo(3, 3, 3, 2)).toBe(false);
    expect(g.passo(5, 2, 5, 3)).toBe(true); expect(g.passo(7, 2, 7, 3)).toBe(false);
    expect(g.passo(2, 6, 3, 6)).toBe(false); expect(g.passo(3, 6, 2, 6)).toBe(false);
    expect(g.passo(2, 2, 3, 3)).toBe(false);        // diagonal cruzaria a parede N de (3,3) pelo lado
    expect(g.passo(0, 0, 1, 1)).toBe(true);
  });
});

describe('pathfinding A*', () => {
  const sala = mk({ largura: 12, altura: 8, piso: Array(96).fill('madeira'), paredes: Array.from({ length: 8 }, (_, y) => ({ x: 6, y, lado: 'W' as const, abertura: y === 5 ? ('porta' as const) : null })) });
  it('atravessa a parede só pela porta e o caminho é válido passo a passo', () => {
    const g = new Grade(sala); const p = acharCaminho(g, { x: 1, y: 1 }, { x: 10, y: 1 })!;
    expect(p).not.toBeNull(); expect(p.some((c) => c.y === 5 && c.x >= 5 && c.x <= 6)).toBe(true);
    let a = { x: 1, y: 1 }; for (const c of p) { expect(g.passo(a.x, a.y, c.x, c.y)).toBe(true); a = c; }
    expect(a).toEqual({ x: 10, y: 1 });
  });
  it('sem porta não há caminho; contorna obstáculos; destino bloqueado: recusa ou aproxima', () => {
    const fechada = new Grade({ ...sala, paredes: sala.paredes.map((w) => ({ ...w, abertura: null })) });
    expect(acharCaminho(fechada, { x: 1, y: 1 }, { x: 10, y: 1 })).toBeNull();
    const obst = new Grade(mk({ objetos: [{ id: 'm', tipo: 'mesa-executiva', x: 2, y: 3 }] }));
    const p = acharCaminho(obst, { x: 3, y: 1 }, { x: 3, y: 6 })!; expect(p.length).toBeGreaterThan(4); expect(p.every((c) => obst.livre(c.x, c.y))).toBe(true);
    expect(acharCaminho(obst, { x: 1, y: 1 }, { x: 3, y: 3 })).toBeNull();
    const perto = acharCaminho(obst, { x: 1, y: 1 }, { x: 3, y: 3 }, { aproximar: true })!; expect(perto.length).toBeGreaterThan(0);
    expect(livreMaisProxima(obst, { x: 3, y: 3 })).not.toBeNull();
    expect(acharCaminho(obst, { x: 1, y: 1 }, { x: 1, y: 1 })).toEqual([]);
  });
});

describe('redimensionar', () => {
  it('preserva o que cabe e remove o que sai do mapa (inclusive estações de objetos removidos)', () => {
    const l = mk({ objetos: [{ id: 'a', tipo: 'mesa', x: 1, y: 1 }, { id: 'b', tipo: 'mesa', x: 8, y: 6 }], estacoes: [{ id: 'e1', objetoId: 'a', ferramenta: 'x' }, { id: 'e2', objetoId: 'b', ferramenta: 'x' }] });
    const n = redimensionar(l, 6, 4);
    expect(n.piso.length).toBe(24); expect(n.objetos.map((o) => o.id)).toEqual(['a']); expect(n.estacoes.map((e) => e.id)).toEqual(['e1']);
  });
});

describe('animações', () => {
  const sheet: SheetDef = { id: 's', nome: 's', quadroL: 24, quadroA: 40, colunas: 4, linhas: 4, escala: 1, ancora: { x: 0.5, y: 1 }, velocidade: 1, animacoes: [
    { estado: 'idle', nome: 'idle-SE', direcao: 'SE', linha: 0, quadros: [0], fps: 1, loop: true },
    { estado: 'walking', nome: 'walk-SE', direcao: 'SE', linha: 1, quadros: [0, 1, 2, 3], fps: 8, loop: true },
    { estado: 'walking', nome: 'walk-NW', direcao: 'NW', linha: 2, quadros: [0, 1, 2, 3], fps: 8, loop: true },
    { estado: 'celebrating', nome: 'fest', direcao: null, linha: 3, quadros: [0, 1], fps: 4, loop: false }] };
  it('escolhe a direção exata ou a mais próxima; cai em idle se o estado não existe; sheet sem animação devolve null', () => {
    expect(escolherAnimacao(sheet, 'walking', 'NW')!.nome).toBe('walk-NW'); expect(escolherAnimacao(sheet, 'walking', 'E')!.nome).toBe('walk-SE');
    expect(escolherAnimacao(sheet, 'typing', 'S')!.nome).toBe('idle-SE'); expect(escolherAnimacao({ ...sheet, animacoes: [] }, 'idle', 'S')).toBeNull();
  });
  it('quadro por tempo: em loop repete; sem loop trava no último', () => {
    const w = escolherAnimacao(sheet, 'walking', 'SE')!; expect([0, 0.13, 0.26, 0.38, 0.5].map((t) => quadroEm(w, t))).toEqual([0, 1, 2, 3, 0]);
    const f = escolherAnimacao(sheet, 'celebrating', 'S')!; expect(quadroEm(f, 0)).toBe(0); expect(quadroEm(f, 99)).toBe(1);
    expect(retanguloDoQuadro(sheet, 2, 3)).toEqual({ x: 72, y: 80, w: 24, h: 40 });
  });
  it('o estado do agente decide a animação (nada encenado); andar só quando se move', () => {
    expect(estadoParaAnimacao('disponivel')).toBe('idle'); expect(estadoParaAnimacao('planejando')).toBe('thinking');
    expect(estadoParaAnimacao('executando', { noPosto: true })).toBe('typing'); expect(estadoParaAnimacao('executando')).toBe('working');
    expect(estadoParaAnimacao('concluido')).toBe('celebrating'); expect(estadoParaAnimacao('com_erro')).toBe('error'); expect(estadoParaAnimacao('pausado')).toBe('sitting');
    expect(estadoParaAnimacao('executando', { movendo: true })).toBe('walking');
  });
});
