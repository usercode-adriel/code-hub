import { describe, expect, it } from 'vitest';
import { layoutPadrao, FUNCIONARIOS } from '../../src/office/layoutPadrao';
import { Grade } from '../../src/office/grade';
import { acharCaminho } from '../../src/office/caminho';
import { dimensoes, objetoPorTipo, OBJETOS } from '../../src/office/catalogo';
import { indice } from '../../src/office/modelo';

declare const process: { env: Record<string, string | undefined> };
process.env.DATA_DIR ??= '.tmp-testes/vitest-layout';
// o validador do servidor é JavaScript: o teste garante que o cliente e o servidor concordam sobre o formato
// @ts-expect-error módulo JS sem declaração de tipos
const { validarLayout } = (await import('../../../server/commerce/layouts.js')) as { validarLayout: (l: unknown) => unknown };

describe('layout padrão da sede', () => {
  const L = layoutPadrao({ helena: 'ag-h', arthur: 'ag-a', sofia: 'ag-s', isabela: 'ag-i', marina: 'ag-m' });

  it('é aceito pelo validador do servidor e tem os oito departamentos', () => {
    expect(() => validarLayout(L)).not.toThrow();
    expect(L.departamentos.map((d) => d.chave)).toEqual(['diretoria', 'pesquisa', 'produtos', 'marketing', 'reunioes', 'financeiro', 'audiovisual', 'convivencia']);
  });

  it('todo tipo de objeto usado existe no catálogo e fica sobre piso', () => {
    for (const o of L.objetos) {
      const t = objetoPorTipo(o.tipo); expect(t, o.tipo).toBeDefined();
      const { w, d } = dimensoes(t!, o.rot ?? 0);
      for (let dy = 0; dy < d; dy++) for (let dx = 0; dx < w; dx++) expect(L.piso[indice(L, o.x + dx, o.y + dy)], `${o.id} em ${o.x + dx},${o.y + dy}`).not.toBe('');
    }
    expect(new Set(L.objetos.map((o) => o.id)).size).toBe(L.objetos.length);
  });

  it('objetos sólidos não se sobrepõem, e o computador está sempre sobre uma mesa', () => {
    const ocupado = new Map<string, string>();
    for (const o of L.objetos) {
      const t = objetoPorTipo(o.tipo)!; if (!t.solido) continue;
      const { w, d } = dimensoes(t, o.rot ?? 0);
      for (let dy = 0; dy < d; dy++) for (let dx = 0; dx < w; dx++) { const c = `${o.x + dx},${o.y + dy}`; expect(ocupado.get(c), `${o.id} sobrepõe ${ocupado.get(c)} em ${c}`).toBeUndefined(); ocupado.set(c, o.id); }
    }
    for (const pc of L.objetos.filter((o) => o.tipo === 'computador')) {
      const mesa = L.objetos.find((o) => (o.tipo === 'mesa' || o.tipo === 'mesa-executiva') && pc.x >= o.x && pc.x < o.x + objetoPorTipo(o.tipo)!.largura && pc.y === o.y);
      expect(mesa, `${pc.id} precisa estar sobre uma mesa`).toBeDefined();
    }
  });

  it('estações apontam para objetos que existem; cada funcionário tem estação, cadeira livre e id real do agente', () => {
    const ids = new Set(L.objetos.map((o) => o.id));
    for (const e of L.estacoes) { if (e.objetoId) expect(ids.has(e.objetoId), e.id).toBe(true); expect(e.ferramenta).toBeTruthy(); }
    const g = new Grade(L);
    for (const f of FUNCIONARIOS) {
      const est = L.estacoes.find((e) => e.agenteChave === f.chave)!; expect(est, f.chave).toBeDefined();
      expect(est.agenteId).toBe(`ag-${f.chave[0]}`); expect(est.departamento).toBe(f.departamento);
      expect(g.livre(est.pontoTrabalho!.x, est.pontoTrabalho!.y)).toBe(true);
      const p = L.personagens.find((x) => x.id === `pers-${f.chave}`)!; expect(g.livre(p.x, p.y)).toBe(true); expect(p.agenteId).toBe(`ag-${f.chave[0]}`);
    }
  });

  it('todos os postos, salas e equipamentos são alcançáveis a partir do corredor (portas funcionam, nada fica preso)', () => {
    const g = new Grade(L); const inicio = { x: 1, y: 9 };
    for (const e of L.estacoes) { const alvo = e.pontoTrabalho ?? { x: L.objetos.find((o) => o.id === e.objetoId)!.x, y: L.objetos.find((o) => o.id === e.objetoId)!.y }; expect(acharCaminho(g, inicio, alvo, { aproximar: true }), `estação ${e.id}`).not.toBeNull(); }
    for (const p of L.personagens) expect(acharCaminho(g, inicio, p), p.id).not.toBeNull();
    for (const d of L.departamentos) expect(acharCaminho(g, inicio, { x: d.x + Math.floor(d.w / 2), y: d.y + d.h - 1 }, { aproximar: true }), d.chave).not.toBeNull();
  });

  it('o catálogo não tem tipos repetidos e todas as ações têm destino', () => {
    expect(new Set(OBJETOS.map((o) => o.tipo)).size).toBe(OBJETOS.length);
    for (const o of OBJETOS) if (o.acao) { expect(o.acao.alvo).toBeTruthy(); expect(o.acao.rotulo).toBeTruthy(); }
  });
});
