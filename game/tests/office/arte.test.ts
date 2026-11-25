import { describe, expect, it } from 'vitest';
import { desenharObjeto, TIPOS_COM_ARTE } from '../../src/office/arte/moveis';
import { texturaPiso, desenharParede, ALTURA_PAREDE } from '../../src/office/arte/chao';
import { criarSheetProcedural, QUADRO_A, QUADRO_L, PALETAS, DIRS_PROC } from '../../src/office/arte/personagem';
import { OBJETOS, PISOS, dimensoes } from '../../src/office/catalogo';
import { ESTADOS_ANIM, escolherAnimacao, quadroEm, retanguloDoQuadro } from '../../src/office/animacoes';
import type { PixelImage } from '../../../game/src/assets/pixel';

const opacos = (img: PixelImage): number => { let n = 0; for (let i = 3; i < img.data.length; i += 4) if (img.data[i] > 0) n++; return n; };
const recorte = (img: PixelImage, x: number, y: number, w: number, h: number): string => { const out: number[] = []; for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) out.push(img.get(x + i, y + j) ?? -1); return out.join(','); };

describe('arte dos objetos', () => {
  it('todo tipo do catálogo tem desenho próprio, visível, com o tamanho da pegada e a âncora dentro da imagem', () => {
    for (const t of OBJETOS) {
      expect(TIPOS_COM_ARTE, `sem desenho: ${t.tipo}`).toContain(t.tipo);
      const a = desenharObjeto(t.tipo, 0); const { w, d } = dimensoes(t, 0);
      expect(a.img.width).toBeGreaterThanOrEqual((w + d) * 32); expect(opacos(a.img), t.tipo).toBeGreaterThan(80);
      expect(a.ox).toBeGreaterThan(0); expect(a.ox).toBeLessThan(a.img.width); expect(a.oy).toBeGreaterThan(0); expect(a.oy).toBeLessThan(a.img.height);
    }
  });
  it('é determinístico e a rotação muda a pegada (largura e profundidade trocam)', () => {
    expect(desenharObjeto('mesa', 0).img.hash()).toBe(desenharObjeto('mesa', 0).img.hash());
    const a = desenharObjeto('mesa', 0); const b = desenharObjeto('mesa', 1);
    expect(a.ox).not.toBe(b.ox); expect(a.img.hash()).not.toBe(b.img.hash());
  });
  it('objetos diferentes não saem iguais (cada um tem a sua aparência)', () => {
    const hashes = new Set(OBJETOS.map((t) => desenharObjeto(t.tipo).img.hash()));
    expect(hashes.size).toBe(OBJETOS.length);
  });
  it('o desenho respeita a pegada: nenhum pixel fora do losango do chão + altura (não vaza para os lados)', () => {
    const t = OBJETOS.find((o) => o.tipo === 'mesa-reuniao')!; const a = desenharObjeto(t.tipo); const { w, d } = dimensoes(t);
    for (let y = 0; y < a.img.height; y++) for (let x = 0; x < a.img.width; x++) if (a.img.get(x, y) !== null) {
      expect(x, 'esquerda').toBeGreaterThanOrEqual(a.ox - d * 32 - 2); expect(x, 'direita').toBeLessThanOrEqual(a.ox + w * 32 + 2);
    }
  });
});

describe('arte do chão e das paredes', () => {
  it('cada piso é um losango 64×32 com cantos transparentes e miolo opaco', () => {
    for (const p of PISOS) { const t = texturaPiso(p.tipo); expect([t.width, t.height]).toEqual([64, 32]); expect(t.get(0, 0)).toBeNull(); expect(t.get(63, 31)).toBeNull(); expect(t.get(32, 16)).not.toBeNull(); expect(opacos(t)).toBeGreaterThan(900); }
    expect(texturaPiso('madeira').hash()).not.toBe(texturaPiso('porcelanato').hash());
  });
  it('paredes N e W são espelhadas; janela e porta mudam o desenho; porta deixa um vão transparente', () => {
    const n = desenharParede('N', 'parede', null); const w = desenharParede('W', 'parede', null);
    expect(n.img.hash()).not.toBe(w.img.hash()); expect(n.img.height).toBeGreaterThan(ALTURA_PAREDE);
    const j = desenharParede('N', 'parede', 'janela'); const porta = desenharParede('N', 'parede', 'porta');
    expect(j.img.hash()).not.toBe(n.img.hash()); expect(opacos(porta.img)).toBeLessThan(opacos(n.img));
    expect(porta.img.get(n.ox + 16, n.oy + 8 - 20)).toBeNull();           // meio da porta, acima do chão: vazio
  });
});

describe('personagens provisórios (spritesheet no formato de importação)', () => {
  const { img, def } = criarSheetProcedural('helena', PALETAS.helena);
  it('tem as 9 animações nas 4 direções, dentro das dimensões da imagem', () => {
    expect(def.quadroL).toBe(QUADRO_L); expect(def.quadroA).toBe(QUADRO_A); expect(img.width).toBe(def.colunas * def.quadroL); expect(img.height).toBe(def.linhas * def.quadroA);
    for (const e of ESTADOS_ANIM) for (const d of DIRS_PROC) expect(def.animacoes.some((a) => a.estado === e && a.direcao === d), `${e}-${d}`).toBe(true);
    for (const a of def.animacoes) { expect(a.linha).toBeLessThan(def.linhas); expect(Math.max(...a.quadros)).toBeLessThan(def.colunas); }
  });
  it('todo quadro declarado tem desenho, e quadros de animação diferentes são diferentes', () => {
    for (const a of def.animacoes) for (const q of a.quadros) { const r = retanguloDoQuadro(def, a.linha, q); expect(opacos({ ...img, data: img.data.slice(0) } as PixelImage) > 0).toBe(true); expect(recorte(img, r.x, r.y, r.w, r.h).split(',').some((v) => v !== '-1'), `${a.nome} q${q}`).toBe(true); }
    const andar = escolherAnimacao(def, 'walking', 'SE')!; const quadros = new Set(andar.quadros.map((q) => { const r = retanguloDoQuadro(def, andar.linha, q); return recorte(img, r.x, r.y, r.w, r.h); }));
    expect(quadros.size).toBeGreaterThanOrEqual(3);
  });
  it('as direções e os estados parecem diferentes; cada funcionário tem as suas cores', () => {
    const frame = (estado: Parameters<typeof escolherAnimacao>[1], dir: Parameters<typeof escolherAnimacao>[2]) => { const a = escolherAnimacao(def, estado, dir)!; const r = retanguloDoQuadro(def, a.linha, quadroEm(a, 0)); return recorte(img, r.x, r.y, r.w, r.h); };
    expect(frame('idle', 'SE')).not.toBe(frame('idle', 'SW')); expect(frame('idle', 'SE')).not.toBe(frame('idle', 'NE'));
    expect(frame('typing', 'SE')).not.toBe(frame('idle', 'SE')); expect(frame('error', 'SE')).not.toBe(frame('celebrating', 'SE'));
    expect(criarSheetProcedural('arthur', PALETAS.arthur).img.hash()).not.toBe(img.hash());
    expect(criarSheetProcedural('helena', PALETAS.helena).img.hash()).toBe(img.hash());
  });
});
