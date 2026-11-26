import { describe, expect, it } from 'vitest';
import { layoutPadrao, FUNCIONARIOS } from '../../src/office/layoutPadrao';
import { Grade } from '../../src/office/grade';
import { acharCaminho } from '../../src/office/caminho';
import { dimensoes, objetoPorTipo, OBJETOS } from '../../src/office/catalogo';
import { podeColocar } from '../../src/office/construtor';
import { indice } from '../../src/office/modelo';
import { desenharObjeto } from '../../src/office/arte/moveis';

declare const process: { env: Record<string, string | undefined> };
process.env.DATA_DIR ??= '.tmp-testes/vitest-layout';
// o validador do servidor é JavaScript: o teste garante que o cliente e o servidor concordam sobre o formato
// @ts-expect-error módulo JS sem declaração de tipos
const { validarLayout } = (await import('../../../server/commerce/layouts.js')) as { validarLayout: (l: unknown) => unknown };

describe('layout padrão 2.1: duas salas', () => {
  const ids = { eleonor: 'ag-e', lady: 'ag-l', sophia: 'ag-s', laurinda: 'ag-u', lucya: 'ag-c' };
  const L = layoutPadrao(ids);
  const tipos = (t: string) => L.objetos.filter((o) => o.tipo === t);
  const dentroDe = (o: { x: number; y: number }, chave: string) => { const d = L.departamentos.find((q) => q.chave === chave)!; return o.x >= d.x && o.x < d.x + d.w && o.y >= d.y && o.y < d.y + d.h; };

  it('é aceito pelo servidor, marcado como 2.1 e tem EXATAMENTE duas salas: Estoque e Logística e Escritório Central', () => {
    expect(() => validarLayout(L)).not.toThrow();
    expect(L.meta?.padrao).toBe('2.1');
    expect(L.departamentos.map((d) => d.chave)).toEqual(['estoque', 'escritorio']);
  });

  it('todo tipo usado existe no catálogo, fica sobre piso e os ids são únicos', () => {
    for (const o of L.objetos) {
      const t = objetoPorTipo(o.tipo); expect(t, o.tipo).toBeDefined();
      const { w, d } = dimensoes(t!, o.rot ?? 0);
      for (let dy = 0; dy < d; dy++) for (let dx = 0; dx < w; dx++) expect(L.piso[indice(L, o.x + dx, o.y + dy)], `${o.id} em ${o.x + dx},${o.y + dy}`).not.toBe('');
    }
    expect(new Set(L.objetos.map((o) => o.id)).size).toBe(L.objetos.length);
  });

  it('as regras do Office Builder aceitam cada objeto do layout (nada sobreposto nem solto no ar)', () => {
    for (const o of L.objetos) {
      const sem = { ...L, objetos: L.objetos.filter((x) => x.id !== o.id) };
      const r = podeColocar(sem, objetoPorTipo(o.tipo)!, o.x, o.y, o.rot ?? 0);
      expect(r.ok, `${o.id} (${o.tipo}) em ${o.x},${o.y}: ${r.motivo}`).toBe(true);
    }
  });

  it('a Sala de Estoque é rica: caixas, pilhas, prateleiras, bancada, computador, impressora de etiquetas, embalagem, carrinho e organização', () => {
    const est = L.objetos.filter((o) => dentroDe(o, 'estoque'));
    for (const t of ['caixa-p', 'caixa-m', 'caixa-g', 'pilha-caixas', 'palete-caixas', 'prateleira-estoque', 'mesa-bancada', 'monitor', 'impressora-etiquetas', 'materiais-embalagem', 'carrinho', 'organizador', 'quadro-avisos', 'balanca']) expect(est.some((o) => o.tipo === t), t).toBe(true);
    expect(est.length).toBeGreaterThanOrEqual(40);
  });

  it('o Escritório Central tem quatro estações completas (mesa, computador, monitor, teclado, mouse, cadeira, documentos, objetos pessoais) e a decoração pedida', () => {
    for (const c of ['eleonor', 'lady', 'sophia', 'laurinda']) {
      for (const p of ['mesa', 'mon', 'tec', 'mou', 'doc', 'pes', 'lum', 'torre', 'cad']) expect(L.objetos.some((o) => o.id === `${p}-${c}`), `${p}-${c}`).toBe(true);
    }
    const esc = L.objetos.filter((o) => dentroDe(o, 'escritorio'));
    for (const t of ['quadro-branco', 'estante-livros', 'prateleira-parede', 'armario', 'impressora', 'papeis-pastas', 'planta', 'vaso-grande', 'tapete', 'relogio-parede', 'luminaria-chao', 'cafeteira-mesa', 'sofa', 'poltrona', 'quadro-decorativo', 'servidor-rack', 'bebedouro', 'mesa-reuniao']) expect(esc.some((o) => o.tipo === t), t).toBe(true);
    expect(tipos('mesa-reuniao')).toHaveLength(1);
  });

  it('estações ligadas a ids reais; cadeira de trabalho e assento de reunião livres e alcançáveis', () => {
    const idsObj = new Set(L.objetos.map((o) => o.id)); for (const e of L.estacoes) { if (e.objetoId) expect(idsObj.has(e.objetoId), e.id).toBe(true); expect(e.ferramenta).toBeTruthy(); }
    const g = new Grade(L); const portaEstoque = { x: 11, y: 7 };
    for (const f of FUNCIONARIOS) {
      const trabalho = L.estacoes.find((e) => e.agenteChave === f.chave && e.ferramenta !== 'assento')!; expect(trabalho.agenteId).toBe((ids as Record<string, string>)[f.chave]);
      expect(trabalho.departamento).toBe(f.departamento); expect(g.livre(trabalho.pontoTrabalho!.x, trabalho.pontoTrabalho!.y)).toBe(true);
      const assento = L.estacoes.find((e) => e.agenteChave === f.chave && e.ferramenta === 'assento')!; expect(g.livre(assento.pontoTrabalho!.x, assento.pontoTrabalho!.y)).toBe(true);
      expect(acharCaminho(g, portaEstoque, trabalho.pontoTrabalho!), `${f.chave} posto`).not.toBeNull(); expect(acharCaminho(g, trabalho.pontoTrabalho!, assento.pontoTrabalho!), `${f.chave} reunião`).not.toBeNull();
      const p = L.personagens.find((x) => x.id === `pers-${f.chave}`)!; expect(p.agenteId).toBe((ids as Record<string, string>)[f.chave]); expect(g.livre(p.x, p.y)).toBe(true);
    }
    expect(L.estacoes.find((e) => e.agenteChave === 'lucya' && e.ferramenta !== 'assento')!.ferramenta).toBe('estoque');
  });

  it('as duas salas são conectadas por porta, e tudo (equipamentos, painéis, café, sofás) é alcançável', () => {
    const g = new Grade(L); expect(L.paredes.some((w) => w.x === 12 && w.y === 7 && w.lado === 'W' && w.abertura === 'porta')).toBe(true);
    expect(acharCaminho(g, { x: 3, y: 7 }, { x: 31, y: 13 }), 'do fundo do estoque ao café').not.toBeNull();
    for (const e of L.estacoes) { const o = L.objetos.find((q) => q.id === e.objetoId); const alvo = e.pontoTrabalho ?? { x: o!.x, y: o!.y }; expect(acharCaminho(g, { x: 3, y: 7 }, alvo, { aproximar: true }), e.id).not.toBeNull(); }
  });

  it('o catálogo não tem tipos repetidos, todas as ações têm destino e todo tipo tem arte própria', () => {
    expect(new Set(OBJETOS.map((o) => o.tipo)).size).toBe(OBJETOS.length);
    for (const o of OBJETOS) if (o.acao) { expect(o.acao.alvo).toBeTruthy(); expect(o.acao.rotulo).toBeTruthy(); }
    for (const t of OBJETOS) { const a = desenharObjeto(t.tipo, 0); let opacos = 0; for (let i = 3; i < a.img.data.length; i += 4) if (a.img.data[i] > 0) opacos++; expect(opacos, `arte de ${t.tipo}`).toBeGreaterThan(20); }
  });
});
