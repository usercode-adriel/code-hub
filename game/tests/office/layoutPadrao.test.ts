import { describe, expect, it } from 'vitest';
import { layoutPadrao, FUNCIONARIOS, VERSAO_PADRAO } from '../../src/office/layoutPadrao';
import { Grade } from '../../src/office/grade';
import { acharCaminho } from '../../src/office/caminho';
import { dimensoes, objetoPorTipo, OBJETOS, PISO_PACOTE, pisoPorTipo } from '../../src/office/catalogo';
import { podeColocar } from '../../src/office/construtor';
import { indice } from '../../src/office/modelo';

declare const process: { env: Record<string, string | undefined> };
process.env.DATA_DIR ??= '.tmp-testes/vitest-layout';
// o validador do servidor é JavaScript: o teste garante que o cliente e o servidor concordam sobre o formato
// @ts-expect-error módulo JS sem declaração de tipos
const { validarLayout } = (await import('../../../server/commerce/layouts.js')) as { validarLayout: (l: unknown) => unknown };
// @ts-expect-error módulo do Node sem tipos neste projeto
const { readFileSync } = (await import('node:fs')) as { readFileSync: (u: URL, e: string) => string };
const man = JSON.parse(readFileSync(new URL('../../office/public/arte/manifesto.json', import.meta.url), 'utf8')) as { objetos: Record<string, unknown>; paredes: Record<string, unknown>; pisos: Record<string, unknown> };

describe('layout padrão 3.0: uma única sala com a arte nova', () => {
  const ids = { eleonor: 'ag-e', lady: 'ag-l', sophia: 'ag-s', laurinda: 'ag-u', lucya: 'ag-c' };
  const L = layoutPadrao(ids);
  const tipos = (t: string) => L.objetos.filter((o) => o.tipo === t);

  it('é aceito pelo servidor, marcado como 3.0 e tem UMA ÚNICA sala (nada de salas pequenas)', () => {
    expect(() => validarLayout(L)).not.toThrow();
    expect(L.meta?.padrao).toBe(VERSAO_PADRAO); expect(VERSAO_PADRAO).toBe('3.0');
    expect(L.departamentos).toHaveLength(1); expect(L.departamentos[0].chave).toBe('escritorio');
    expect(L.paredes.filter((w) => w.x > 1 && w.lado === 'W' && w.abertura !== null)).toHaveLength(0);          // sem divisórias internas
    expect(L.paredes.filter((w) => w.lado === 'W').every((w) => w.x === 1)).toBe(true);
  });

  it('todo sprite usado existe no pacote de arte; todo piso e toda parede também', () => {
    for (const o of L.objetos) { const t = objetoPorTipo(o.tipo); expect(t, o.tipo).toBeDefined(); expect(t!.sprite, `${o.tipo} sem arte do pacote`).toBeTruthy(); expect(man.objetos[t!.sprite!], `${o.tipo} → ${t!.sprite}`).toBeDefined(); }
    for (const t of new Set(L.piso.filter(Boolean))) { expect(PISO_PACOTE[t], `piso ${t}`).toBeTruthy(); expect(man.pisos[PISO_PACOTE[t]], `arquivo do piso ${t}`).toBeDefined(); expect(pisoPorTipo(t)).toBeDefined(); }
    for (const n of ['parede-W', 'parede-N', 'janela-W', 'janela-N', 'porta-W', 'porta-N']) expect(man.paredes[n], n).toBeDefined();
    for (const t of OBJETOS.filter((o) => o.sprite)) expect(man.objetos[t.sprite!], `${t.tipo} → ${t.sprite}`).toBeDefined();
  });

  it('todo objeto fica sobre piso, ids são únicos e as regras do Office Builder aceitam cada um (sem sobreposição nem objeto solto no ar)', () => {
    for (const o of L.objetos) {
      const t = objetoPorTipo(o.tipo)!; const { w, d } = dimensoes(t, o.rot ?? 0);
      for (let dy = 0; dy < d; dy++) for (let dx = 0; dx < w; dx++) expect(L.piso[indice(L, o.x + dx, o.y + dy)], `${o.id} em ${o.x + dx},${o.y + dy}`).not.toBe('');
      const sem = { ...L, objetos: L.objetos.filter((x) => x.id !== o.id) }; const r = podeColocar(sem, t, o.x, o.y, o.rot ?? 0); expect(r.ok, `${o.id} (${o.tipo}) em ${o.x},${o.y}: ${r.motivo}`).toBe(true);
    }
    expect(new Set(L.objetos.map((o) => o.id)).size).toBe(L.objetos.length);
  });

  it('é um escritório vivo: estações completas, estantes e armários, convivência, café, plantas, janelas, logística e reunião', () => {
    for (const c of ['eleonor', 'lady', 'sophia', 'laurinda', 'lucya']) for (const p of ['mesa', 'mon', 'torre', 'lum']) expect(L.objetos.some((o) => o.id === `${p}-${c}`), `${p}-${c}`).toBe(true);
    for (const t of ['estante-livros', 'armario', 'sofa', 'poltrona', 'mesa-centro', 'cafeteira-mesa', 'bebedouro', 'copiadora', 'caixa-g', 'mesa-reuniao', 'quadro-branco', 'relogio-parede', 'quadro-decorativo', 'servidor-rack']) expect(tipos(t).length, t).toBeGreaterThan(0);
    expect(L.objetos.filter((o) => /planta|arvore|vaso/.test(o.tipo)).length).toBeGreaterThanOrEqual(8);
    expect(L.paredes.filter((w) => w.abertura === 'janela').length).toBeGreaterThanOrEqual(8); expect(L.paredes.some((w) => w.abertura === 'porta')).toBe(true);
    expect(L.objetos.length).toBeGreaterThanOrEqual(90);
  });

  it('estações ligadas a ids reais; cadeira (posto) e assento de reunião livres, e tudo alcançável a partir da entrada', () => {
    const idsObj = new Set(L.objetos.map((o) => o.id)); for (const e of L.estacoes) { if (e.objetoId) expect(idsObj.has(e.objetoId), e.id).toBe(true); expect(e.ferramenta).toBeTruthy(); }
    const g = new Grade(L); const entrada = { x: 2, y: 9 };
    for (const f of FUNCIONARIOS) {
      const trabalho = L.estacoes.find((e) => e.agenteChave === f.chave && e.ferramenta !== 'assento')!; expect(trabalho.agenteId).toBe((ids as Record<string, string>)[f.chave]); expect(g.livre(trabalho.pontoTrabalho!.x, trabalho.pontoTrabalho!.y)).toBe(true);
      const assento = L.estacoes.find((e) => e.agenteChave === f.chave && e.ferramenta === 'assento')!; expect(g.livre(assento.pontoTrabalho!.x, assento.pontoTrabalho!.y)).toBe(true);
      expect(acharCaminho(g, entrada, trabalho.pontoTrabalho!), `${f.chave} posto`).not.toBeNull(); expect(acharCaminho(g, trabalho.pontoTrabalho!, assento.pontoTrabalho!), `${f.chave} reunião`).not.toBeNull();
      const p = L.personagens.find((x) => x.id === `pers-${f.chave}`)!; expect(p.agenteId).toBe((ids as Record<string, string>)[f.chave]); expect(g.livre(p.x, p.y)).toBe(true); expect(p.dir).toBe(f.dir);
    }
    for (const e of L.estacoes) { const o = L.objetos.find((q) => q.id === e.objetoId); const alvo = e.pontoTrabalho ?? { x: o!.x, y: o!.y }; expect(acharCaminho(g, entrada, alvo, { aproximar: true }), e.id).not.toBeNull(); }
  });

  it('há espaço de circulação: corredor central livre de ponta a ponta', () => {
    const g = new Grade(L); for (let x = 2; x <= 27; x++) expect(g.livre(x, 7), `corredor em ${x},7`).toBe(true);
    expect(acharCaminho(g, { x: 2, y: 8 }, { x: 27, y: 16 })).not.toBeNull();
  });

  it('o catálogo não tem tipos repetidos e todas as ações têm destino', () => {
    expect(new Set(OBJETOS.map((o) => o.tipo)).size).toBe(OBJETOS.length);
    for (const o of OBJETOS) if (o.acao) { expect(o.acao.alvo).toBeTruthy(); expect(o.acao.rotulo).toBeTruthy(); }
  });
});
