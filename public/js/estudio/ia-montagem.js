// STRUCTURE STUDIO: montagem por IA (módulo puro, sem DOM nem rede; roda no servidor e nos testes).
// A IA NÃO escolhe pixels: ela devolve um PLANO de alto nível (tipo, módulos, andares, quais componentes da biblioteca usar) e
// um expansor determinístico o transforma em peças posicionadas, respeitando o encaixe (janela na parede, telhado no topo...).
// Cada peça sai com id, componente, papel e andar: continua individualmente editável. As edições pedidas à IA viram OPERAÇÕES
// (trocar, colorir, escalar, andares, estacionamento, adicionar, remover) aplicadas só ao que o pedido afeta.
import { PASSO, novaInstancia, normalizarInstancia, novoId, larguraVisual, alturaVisual, eModular, MODULOS_MAX, descendentes, reencaixarFilhos, removerComFilhos, limitar } from './montagem.js';
import { GRADE, REQUER, compativelComPreset } from './presets.js';

const snap = (v, p = PASSO) => Math.round(v / p) * p;
export const LIMITES = { modulos: [1, 12], andares: [1, 8], janelas: [0, 12], vagas: [0, 120], equipamentos: 8, externo: 20 };
const SUBS_TELHADO = ['telhado-plano', 'telhado-inclinado', 'cobertura-metalica', 'terraco'];
const SUBS_ENTRADA = ['porta', 'portao', 'entrada-saida'];

// ---------------------------------------------------------------------------------------------------------------------
// CATÁLOGO que a IA enxerga: curto, só o necessário (id, nome, subcategoria, material, tamanho, etiquetas)
// ---------------------------------------------------------------------------------------------------------------------
export function catalogoParaIA(componentes, presetId, porSub = 6) {
  const cont = {};
  return componentes.filter((c) => compativelComPreset(c, presetId)).filter((c) => { cont[c.sub] = (cont[c.sub] || 0) + 1; return cont[c.sub] <= porSub; })
    .map((c) => ({ id: c.id, nome: c.nome, sub: c.sub, material: c.material, w: c.w, h: c.h, tags: (c.tags || []).slice(0, 5) }));
}

// ---------------------------------------------------------------------------------------------------------------------
// VALIDAÇÃO DO PLANO: tudo que a IA citou precisa existir na biblioteca, ser da subcategoria certa e da perspectiva do preset
// ---------------------------------------------------------------------------------------------------------------------
export function validarPlano(bruto, compDe, presetId) {
  const avisos = []; const p = bruto && typeof bruto === 'object' ? bruto : {};
  const pega = (id, subs, rotulo) => {
    if (!id) return null; const c = compDe(String(id));
    if (!c) { avisos.push(`${rotulo}: o componente "${id}" não existe na biblioteca e foi ignorado`); return null; }
    if (!compativelComPreset(c, presetId)) { avisos.push(`${rotulo}: "${c.nome}" é de outra perspectiva e foi ignorado`); return null; }
    if (subs && !subs.includes(c.sub)) { avisos.push(`${rotulo}: "${c.nome}" não é ${subs.join(' / ')} e foi ignorado`); return null; }
    return c.id;
  };
  const num = (v, [a, b], pad) => limitar(Math.round(Number(v)) || pad, a, b);
  const cor = (v) => (/^#[0-9a-f]{6}$/i.test(v || '') ? v : null);
  const plano = {
    modo: p.modo === 'pronta' ? 'pronta' : 'modular', nome: String(p.nome || '').slice(0, 60), tipo: String(p.tipo || '').slice(0, 30),
    pronta: pega(p.pronta, ['referencia'], 'construção pronta'),
    modulos: num(p.modulos, LIMITES.modulos, 4), andares: num(p.andares, LIMITES.andares, 1), janelas_por_andar: limitar(Math.round(Number(p.janelas_por_andar)) >= 0 ? Math.round(Number(p.janelas_por_andar)) : 3, ...LIMITES.janelas),
    porta_posicao: ['esq', 'centro', 'dir'].includes(p.porta_posicao) ? p.porta_posicao : 'centro',
    parede: pega(p.parede, ['parede', 'fachada-envidracada'], 'parede'), janela: pega(p.janela, ['janela', 'vitrine'], 'janela'), porta: pega(p.porta, ['porta'], 'porta'),
    telhado: pega(p.telhado, SUBS_TELHADO, 'telhado'),
    equipamentos: (Array.isArray(p.equipamentos) ? p.equipamentos : []).slice(0, LIMITES.equipamentos).map((id) => pega(id, ['ar-condicionado', 'antena', 'exaustor', 'caixa-dagua'], 'equipamento')).filter(Boolean),
    cor_parede: cor(p.cor_parede), cor_janela: cor(p.cor_janela), material_janela: p.material_janela ? String(p.material_janela).slice(0, 20) : null,
    externo: (Array.isArray(p.externo) ? p.externo : []).slice(0, LIMITES.externo).map((e) => ({ comp: pega(e?.comp, null, 'área externa'), onde: ['esq', 'dir', 'frente', 'fundo'].includes(e?.onde) ? e.onde : 'frente', quantidade: num(e?.quantidade, [1, 12], 1) })).filter((e) => e.comp),
    estacionamento: null,
  };
  if (p.estacionamento && typeof p.estacionamento === 'object') {
    const vaga = pega(p.estacionamento.vaga, ['vaga', 'vaga-acessivel', 'pintura-solo'], 'vaga');
    if (vaga) plano.estacionamento = { vaga, vagas: num(p.estacionamento.vagas, LIMITES.vagas, 10), onde: ['frente', 'esq', 'dir'].includes(p.estacionamento.onde) ? p.estacionamento.onde : 'frente' };
  }
  if (plano.modo === 'pronta' && !plano.pronta) { avisos.push('nenhuma construção pronta válida: usando a montagem modular'); plano.modo = 'modular'; }
  if (plano.modo === 'modular' && !plano.parede) avisos.push('faltam paredes na biblioteca: sem elas não dá para montar o edifício por módulos');
  return { plano, avisos };
}

// ---------------------------------------------------------------------------------------------------------------------
// EXPANSOR: plano → peças posicionadas. Determinístico (a mesma entrada dá a mesma montagem).
// ---------------------------------------------------------------------------------------------------------------------
function semente(texto) { let h = 2166136261; for (const ch of String(texto)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
const aleatorio = (seed) => { let s = seed || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 10000) / 10000; }; };

function expandirNaArea(plano, compDe, area, sem) {
  const rnd = aleatorio(semente(`${plano.nome}|${plano.tipo}|${sem}`));
  const saida = []; const avisos = []; const faltando = new Set();
  const novo = (comp, x, y, extra) => { const i = novaInstancia(comp, snap(x), snap(y), extra); saida.push(i); return i; };
  const W = area.w * GRADE; const H = area.h * GRADE;
  const cx = snap(W / 2);

  // a base do edifício deixa espaço em cima para a pilha de andares e o telhado (não depende do tamanho da área)
  const paredeRef = plano.parede && compDe(plano.parede); const telhadoRef = plano.telhado && compDe(plano.telhado); const prontaRef = plano.modo === 'pronta' && plano.pronta && compDe(plano.pronta);
  const pilha = prontaRef ? prontaRef.h : (paredeRef ? plano.andares * paredeRef.h + (telhadoRef ? telhadoRef.h * 0.4 : 0) : 0);
  let esquerda = cx; let direita = cx; const yBase = snap(Math.max(pilha + 48, 96)); let topo = yBase;
  if (plano.modo === 'pronta' && plano.pronta) {
    const c = compDe(plano.pronta); const w = larguraVisual({ escala: 1, n: 1 }, c);
    novo(c, cx, yBase, { papel: 'construcao-pronta' }); esquerda = cx - w / 2; direita = cx + w / 2; topo = yBase - c.h;
  } else if (plano.parede) {
    const parede = compDe(plano.parede); const wallH = alturaVisual({ escala: 1 }, parede);
    const n = eModular(parede) ? plano.modulos : 1; const larg = larguraVisual({ escala: 1, n }, parede);
    esquerda = cx - larg / 2; direita = cx + larg / 2;
    const janela = plano.janela && compDe(plano.janela); const porta = plano.porta && compDe(plano.porta); const telhado = plano.telhado && compDe(plano.telhado);
    if (!janela && plano.janelas_por_andar > 0) faltando.add('janela'); if (!porta) faltando.add('porta'); if (!telhado) faltando.add('telhado');
    let paredeBaixo = null; let paredeTopo = null;
    for (let k = 0; k < plano.andares; k++) {
      const w = novo(parede, cx, yBase, { z: k * wallH, n, papel: 'parede', andar: k, cor: plano.cor_parede });
      if (k === 0) paredeBaixo = w; paredeTopo = w;
      // porta no térreo
      let portaX = null;
      if (k === 0 && porta) {
        const pw = larguraVisual({ escala: 1, n: 1 }, porta);
        portaX = plano.porta_posicao === 'esq' ? esquerda + larg * 0.2 : plano.porta_posicao === 'dir' ? direita - larg * 0.2 : cx;
        portaX = limitar(snap(portaX), esquerda + pw / 2, direita - pw / 2);
        novo(porta, portaX, yBase, { z: 0, anfitriao: w.id, papel: 'porta-principal', andar: 0, nome: 'Entrada principal' });
      }
      if (janela && plano.janelas_por_andar > 0) {
        const jw = larguraVisual({ escala: 1, n: 1 }, janela); const jh = alturaVisual({ escala: 1 }, janela);
        const z = k * wallH + snap(Math.max(0, (wallH - jh) / 2));
        for (let j = 0; j < plano.janelas_por_andar; j++) {
          const x = limitar(snap(esquerda + (j + 0.5) * larg / plano.janelas_por_andar), esquerda + jw / 2, direita - jw / 2);
          if (portaX !== null && Math.abs(x - portaX) < (larguraVisual({ escala: 1, n: 1 }, porta) + jw) / 2) continue; // não sobrepõe a porta
          novo(janela, x, yBase, { z, anfitriao: w.id, papel: 'janela', andar: k, cor: plano.cor_janela, material: plano.material_janela && ['vidro', 'metal', 'madeira', 'concreto'].includes(plano.material_janela) ? plano.material_janela : null });
        }
      }
    }
    topo = yBase - plano.andares * wallH;
    if (telhado && paredeTopo) {
      const tw = larguraVisual({ escala: 1, n: 1 }, telhado); const qtd = Math.max(1, Math.ceil(larg / tw));
      const roofs = [];
      for (let k = 0; k < qtd; k++) {
        const x = qtd === 1 ? cx : limitar(snap(esquerda + tw / 2 + k * ((larg - tw) / (qtd - 1))), esquerda + tw / 2, direita - tw / 2);
        roofs.push(novo(telhado, x, yBase, { z: plano.andares * wallH, anfitriao: paredeTopo.id, papel: 'telhado', andar: plano.andares }));
      }
      // equipamentos no telhado, espalhados com a semente
      plano.equipamentos.forEach((id, k) => {
        const c = compDe(id); const r = roofs[k % roofs.length]; const rc = compDe(r.comp);
        const folga = larguraVisual({ escala: 1, n: 1 }, rc) / 2 - 16; const dx = Math.round((rnd() * 2 - 1) * Math.max(0, folga));
        novo(c, r.x + dx, yBase - Math.round(rnd() * 24), { z: r.z + alturaVisual(r, rc) * 0.35, anfitriao: r.id, papel: 'equipamento-telhado' });
      });
      topo -= telhado.h * 0.4;
    }
  } else {
    avisos.push('sem paredes nem construção pronta: só a parte externa foi montada');
    faltando.add('parede'); if (!plano.porta) faltando.add('porta'); if (!plano.telhado) faltando.add('telhado'); if (!plano.janela && plano.janelas_por_andar > 0) faltando.add('janela');
  }

  // áreas externas
  const lado = { esq: esquerda - 40, dir: direita + 40 };
  for (const e of plano.externo) {
    const c = compDe(e.comp); if (!c) continue;
    for (let k = 0; k < e.quantidade; k++) {
      let x; let y;
      if (e.onde === 'esq') { x = lado.esq - (k % 2) * 36; y = yBase + 24 + Math.floor(k / 2) * 44; }
      else if (e.onde === 'dir') { x = lado.dir + (k % 2) * 36; y = yBase + 24 + Math.floor(k / 2) * 44; }
      else if (e.onde === 'fundo') { x = esquerda + ((k + 0.5) * (direita - esquerda)) / e.quantidade; y = yBase - 56; }
      else { x = esquerda + ((k + 0.5) * (direita - esquerda)) / e.quantidade; y = yBase + 64 + (k % 2) * 16; }
      novo(c, x, y, { papel: 'externo' });
    }
  }
  // estacionamento: fileiras de vagas (cada vaga modular repete o módulo); fica na frente, ao lado da entrada
  let alturaNecessaria = yBase;
  if (plano.estacionamento) {
    const v = compDe(plano.estacionamento.vaga);
    const largVaga = larguraVisual({ escala: 1, n: 1 }, v); const prof = Math.max(GRADE, v.area.h * GRADE);
    const porFileira = Math.max(1, Math.min(MODULOS_MAX, Math.floor(Math.max(larguraVisual({ escala: 1, n: 1 }, v) * 4, direita - esquerda) / largVaga)));
    const fileiras = Math.ceil(plano.estacionamento.vagas / porFileira);
    let restante = plano.estacionamento.vagas;
    for (let f = 0; f < fileiras; f++) {
      const n = Math.min(porFileira, restante); restante -= n;
      const largF = n * largVaga; const xf = plano.estacionamento.onde === 'esq' ? esquerda - largF / 2 - 16 : plano.estacionamento.onde === 'dir' ? direita + largF / 2 + 16 : cx;
      const yf = yBase + 96 + f * (prof + 32);
      novo(v, xf, yf, { n: eModular(v) ? n : 1, papel: 'vaga', andar: f });
      alturaNecessaria = Math.max(alturaNecessaria, yf);
    }
  }
  // área necessária (em células) para caber tudo, com folga: largura pelo lado mais distante do centro, altura pela peça mais ao fundo
  const xs = saida.flatMap((i) => { const c = compDe(i.comp); const w = larguraVisual(i, c); return [i.x - w / 2, i.x + w / 2]; });
  const meia = saida.length ? Math.max(cx - Math.min(...xs), Math.max(...xs) - cx) : 0;
  const precisa = { w: Math.ceil((2 * meia + 96) / GRADE), h: Math.ceil(((saida.length ? Math.max(...saida.map((i) => i.y)) : 0) + 64) / GRADE) };
  void topo; void alturaNecessaria;
  return { componentes: saida, avisos, faltando: [...faltando], area: { w: Math.max(area.w, precisa.w), h: Math.max(area.h, precisa.h) } };
}

// expande e, se a área não comportar, amplia e expande de novo (o edifício fica centrado na área final)
export function expandirPlano(plano, compDe, { area, semente: sem = 1 } = {}) {
  let r = expandirNaArea(plano, compDe, area, sem);
  for (let k = 0; k < 2 && (r.area.w !== area.w || r.area.h !== area.h); k++) { area = r.area; r = expandirNaArea(plano, compDe, area, sem); }
  return r;
}

// ---------------------------------------------------------------------------------------------------------------------
// INTERPRETADOR LOCAL (sem IA configurada): frases simples → plano. Escolhe componentes da biblioteca pelo nome e etiquetas.
// ---------------------------------------------------------------------------------------------------------------------
const TIPOS = [
  { re: /shopping|centro comercial/, tipo: 'shopping', modulos: 6, andares: 2, janelas: 4 }, { re: /delegacia|pol[ií]cia/, tipo: 'delegacia', modulos: 4, andares: 1, janelas: 3 },
  { re: /hospital|cl[ií]nica/, tipo: 'hospital', modulos: 5, andares: 3, janelas: 4 }, { re: /supermercado|mercado/, tipo: 'supermercado', modulos: 6, andares: 1, janelas: 2 },
  { re: /posto/, tipo: 'posto', modulos: 4, andares: 1, janelas: 2 }, { re: /garagem/, tipo: 'garagem', modulos: 4, andares: 1, janelas: 0 },
  { re: /casa|resid[eê]ncia|sobrado/, tipo: 'casa', modulos: 3, andares: 1, janelas: 2 }, { re: /pr[eé]dio|edif[ií]cio|torre/, tipo: 'predio', modulos: 3, andares: 6, janelas: 3 },
  { re: /loja|boutique|padaria/, tipo: 'loja', modulos: 3, andares: 1, janelas: 2 },
];
const CORES = [[/azul/, '#3b82f6'], [/verde/, '#22c55e'], [/vermelh|vermelho/, '#ef4444'], [/amarel/, '#eab308'], [/branc/, '#f1f5f9'], [/preto|escuro/, '#1f2937'], [/cinza/, '#94a3b8'], [/laranja/, '#f97316']];
const sem = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const numeros = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8 };
function inteiroAntes(texto, palavra) { const m = sem(texto).match(new RegExp(`(\\d+|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito)\\s*(?:mais\\s*)?(?:${palavra})`)); return m ? (numeros[m[1]] || Number(m[1])) : null; }
export const corDoTexto = (texto) => { const t = sem(texto); for (const [re, cor] of CORES) if (re.test(t)) return cor; return null; };

// melhor componente da subcategoria: pontua palavras do pedido no nome, material e etiquetas
export function escolherComp(componentes, subs, texto, presetId) {
  const t = sem(texto); const pal = t.split(/[^a-z0-9]+/).filter((p) => p.length > 2);
  const lista = componentes.filter((c) => subs.includes(c.sub) && compativelComPreset(c, presetId));
  if (!lista.length) return null;
  const pontos = (c) => { const base = sem([c.nome, c.material, ...(c.tags || [])].join(' ')); return pal.reduce((n, p) => n + (base.includes(p) ? 1 : 0), 0) + (c.origem === 'gerado' ? 0.1 : 0); };
  return [...lista].sort((a, b) => pontos(b) - pontos(a) || a.id.localeCompare(b.id))[0];
}

export function planoLocal(texto, componentes, presetId) {
  const t = sem(texto); const tipo = TIPOS.find((x) => x.re.test(t)) || { tipo: 'outro', modulos: 4, andares: 1, janelas: 3 };
  const escolha = (subs) => escolherComp(componentes, subs, texto, presetId)?.id || null;
  const andaresPedidos = inteiroAntes(texto, 'andares?|pavimentos?') || (/terreo|um andar/.test(t) ? 1 : null);
  const veiculos = inteiroAntes(texto, 'vagas?|veiculos?|carros?');
  const grande = /grande|amplo|enorme/.test(t); const pequeno = /pequen|compact/.test(t); const medio = /medio|medio porte/.test(t);
  const modulos = Math.max(1, Math.min(12, tipo.modulos + (grande ? 2 : 0) - (pequeno ? 1 : 0) + (medio ? 0 : 0)));
  const externo = [];
  const palmeira = escolha(['palmeira']); const arvore = escolha(['arvore']); const jardim = escolha(['jardim', 'canteiro', 'vegetacao']); const poste = escolha(['poste', 'luminaria']);
  if (/palmeira/.test(t) && palmeira) externo.push({ comp: palmeira, onde: 'esq', quantidade: 2 }, { comp: palmeira, onde: 'dir', quantidade: 2 });
  else if (/arvore/.test(t) && arvore) externo.push({ comp: arvore, onde: 'esq', quantidade: 2 }, { comp: arvore, onde: 'dir', quantidade: 2 });
  if (/jardim|jardins|canteiro/.test(t) && jardim) externo.push({ comp: jardim, onde: 'esq', quantidade: 2 }, { comp: jardim, onde: 'dir', quantidade: 2 });
  if (/poste|luminaria|ilumina/.test(t) && poste) externo.push({ comp: poste, onde: 'frente', quantidade: 2 });
  const equipamentos = []; const ar = escolha(['ar-condicionado']); const antena = escolha(['antena']); const exaustor = escolha(['exaustor']);
  if (/equipamento|ar.condicionado|telhado/.test(t)) { if (ar) equipamentos.push(ar, ar); if (/antena/.test(t) && antena) equipamentos.push(antena); if (exaustor) equipamentos.push(exaustor); }
  const vaga = escolha(['vaga']);
  const cor = corDoTexto(texto);
  const pronta = escolherComp(componentes.filter((c) => c.sub === 'referencia' && sem(c.nome).includes(tipo.tipo)), ['referencia'], texto, presetId);
  const temKit = escolha(['parede']);
  return {
    modo: temKit ? 'modular' : (pronta ? 'pronta' : 'modular'), pronta: pronta?.id || null, tipo: tipo.tipo, nome: tipo.tipo === 'outro' ? 'Estrutura' : tipo.tipo[0].toUpperCase() + tipo.tipo.slice(1),
    modulos, andares: andaresPedidos || tipo.andares, janelas_por_andar: tipo.janelas, porta_posicao: /entrada.*(esquerd)/.test(t) ? 'esq' : /entrada.*(direit)/.test(t) ? 'dir' : 'centro',
    parede: temKit, janela: escolha(['janela', 'vitrine']), porta: escolha(['porta']), telhado: escolha(SUBS_TELHADO), equipamentos,
    cor_janela: /(vidro|janela).*(azul)|azul.*(vidro|janela)/.test(t) ? '#3b82f6' : null, cor_parede: cor && !/vidro|janela/.test(t) ? cor : null, material_janela: /vidro/.test(t) ? 'vidro' : null,
    externo, estacionamento: vaga && (veiculos || /estacionamento/.test(t)) ? { vaga, vagas: veiculos || 10, onde: /estacionamento.*(lateral|esquerd)/.test(t) ? 'esq' : 'frente' } : null,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// EDIÇÃO: operações sobre a montagem existente. Só mexe no que o pedido afeta; ids e o resto das peças ficam como estão.
// ---------------------------------------------------------------------------------------------------------------------
const subDe = (i, compDe) => compDe(i.comp)?.sub;
const selecionar = (instancias, compDe, alvo = {}) => instancias.filter((i) => {
  if (alvo.ids?.length && !alvo.ids.includes(i.id)) return false;
  if (alvo.sub && !(Array.isArray(alvo.sub) ? alvo.sub : [alvo.sub]).includes(subDe(i, compDe))) return false;
  if (alvo.papel && i.papel !== alvo.papel) return false;
  return true;
});
const grupoSub = { janelas: ['janela', 'vitrine'], janela: ['janela', 'vitrine'], portas: ['porta'], porta: ['porta'], entrada: ['porta', 'portao', 'entrada-saida'], paredes: ['parede', 'fachada-envidracada'], telhado: SUBS_TELHADO, vagas: ['vaga', 'vaga-acessivel'], estacionamento: ['vaga', 'vaga-acessivel'], arvores: ['arvore', 'palmeira'], palmeiras: ['palmeira'] };
export const subsDoNome = (nome) => grupoSub[sem(nome)] || null;

// Executa as operações em uma cópia e devolve { componentes, resumo, avisos, area }. O resumo diz o que mudou, peça por peça.
export function aplicarOperacoes(estrutura, ops, compDe, { buscar } = {}) {
  let lista = estrutura.componentes.map((i) => ({ ...i }));
  const resumo = []; const avisos = []; let area = { ...estrutura.area };
  const achar = (o) => (o.comp && compDe(o.comp)) || (o.buscar && buscar ? buscar(o.buscar, o.subs) : null);
  for (const op of ops.slice(0, 12)) {
    const alvo = { ...(op.alvo || {}) }; if (typeof op.alvo === 'string') { alvo.sub = subsDoNome(op.alvo) || [op.alvo]; delete alvo.ids; }
    if (op.op === 'substituir' || op.op === 'cor') {
      const alvos = selecionar(lista, compDe, alvo); if (!alvos.length) { avisos.push(`nada para ${op.op}: nenhuma peça combina com o pedido`); continue; }
      const novoComp = op.op === 'substituir' ? achar(op.por || op) : null;
      if (op.op === 'substituir' && !novoComp) { avisos.push('o componente novo não existe na biblioteca: nada foi trocado'); continue; }
      for (const i of alvos) {
        const antigo = compDe(i.comp);
        if (novoComp) {
          if (REQUER[novoComp.sub] && !REQUER[novoComp.sub].includes(subDe(lista.find((x) => x.id === i.anfitriao) || {}, compDe)) && i.anfitriao) { avisos.push(`"${novoComp.nome}" não encaixa onde estava "${antigo?.nome}"`); continue; }
          i.comp = novoComp.id; i.camada = novoComp.camada;
        }
        const cor = (op.por || op).cor; if (cor && /^#[0-9a-f]{6}$/i.test(cor)) i.cor = cor;
        const mat = (op.por || op).material; if (mat) i.material = mat;
        resumo.push({ id: i.id, mudou: novoComp ? `${antigo?.nome} → ${novoComp.nome}` : `cor ${cor || ''} ${mat || ''}`.trim() });
      }
    } else if (op.op === 'escala') {
      const alvos = selecionar(lista, compDe, alvo); const f = limitar(Number(op.fator) || 1, 0.25, 4);
      for (const i of alvos) { const antes = i.escala; i.escala = Math.round(limitar(antes * f, 0.25, 4) * 100) / 100; resumo.push({ id: i.id, mudou: `escala ${antes} → ${i.escala}` }); }
      for (const i of alvos) reencaixarFilhos(lista, i.id, compDe);
      if (!alvos.length) avisos.push('nenhuma peça para redimensionar');
    } else if (op.op === 'andares') adicionarAndares(lista, Math.round(Number(op.delta) || 0), compDe, resumo, avisos);
    else if (op.op === 'estacionamento') area = ajustarEstacionamento(lista, Math.round(Number(op.delta_vagas) || 0), compDe, resumo, avisos, area);
    else if (op.op === 'adicionar') {
      const c = achar(op); if (!c) { avisos.push('o componente a adicionar não existe na biblioteca'); continue; }
      const adic = adicionarLateral(lista, c, op.onde || 'dir', Math.max(1, Math.min(8, Math.round(Number(op.quantidade) || 1))), compDe);
      for (const i of adic) { lista.push(i); resumo.push({ id: i.id, mudou: `adicionou ${c.nome}` }); }
    } else if (op.op === 'garagem') {
      const parede = lista.find((i) => subDe(i, compDe) === 'parede' && !i.anfitriao); const roof = lista.find((i) => SUBS_TELHADO.includes(subDe(i, compDe)));
      const entrada = lista.find((i) => SUBS_ENTRADA.includes(subDe(i, compDe)));
      const portao = (buscar && (buscar('portao garagem', ['portao']) || buscar('porta', ['porta']))) || (entrada && compDe(entrada.comp));
      if (!parede) { avisos.push('a garagem lateral precisa de uma parede no edifício'); continue; }
      const novas = montarGaragemLateral(lista, compDe, op.onde === 'esq' ? 'esq' : 'dir', { parede: compDe(parede.comp), portao, telhado: roof && compDe(roof.comp) });
      for (const i of novas) lista.push(i);
      resumo.push({ id: novas[0]?.id || null, mudou: `garagem ${op.onde === 'esq' ? 'à esquerda' : 'à direita'} (${novas.length} peças)` });
      area = { ...area, w: area.w + 3 };
    } else if (op.op === 'remover') {
      const alvos = selecionar(lista, compDe, alvo); if (!alvos.length) { avisos.push('nada para remover'); continue; }
      const r = removerComFilhos(lista, alvos.map((i) => i.id)); lista = r.restantes; resumo.push({ id: null, mudou: `removeu ${r.removidos} peça(s)` });
    } else avisos.push(`operação desconhecida: ${op.op}`);
  }
  return { componentes: lista, resumo, avisos, area };
}

// mais (ou menos) andares: copia o último andar para cima e sobe o telhado e o que está nele
function adicionarAndares(lista, delta, compDe, resumo, avisos) {
  if (!delta) return;
  const paredes = lista.filter((i) => ['parede', 'fachada-envidracada'].includes(subDe(i, compDe)) && !i.anfitriao);
  if (!paredes.length) { avisos.push('sem paredes para empilhar andares'); return; }
  const topoZ = Math.max(...paredes.map((i) => i.z || 0));
  const ultimo = paredes.filter((i) => (i.z || 0) === topoZ); const altura = alturaVisual(ultimo[0], compDe(ultimo[0].comp));
  if (delta > 0) {
    const mais = Math.min(delta, 8);
    const noTopo = new Set(); for (const w of ultimo) { noTopo.add(w.id); for (const d of descendentes(lista, w.id)) noTopo.add(d); }
    const telhadoIds = lista.filter((i) => SUBS_TELHADO.includes(subDe(i, compDe)) && ultimo.some((w) => w.id === i.anfitriao)).map((i) => i.id);
    const sobe = new Set(telhadoIds); for (const t of telhadoIds) for (const d of descendentes(lista, t)) sobe.add(d);
    for (const i of lista) if (sobe.has(i.id)) i.z = (i.z || 0) + altura * mais;
    for (let k = 1; k <= mais; k++) {
      const mapa = new Map(); const copias = [];
      for (const i of lista.filter((x) => noTopo.has(x.id) && !sobe.has(x.id))) {
        if (SUBS_ENTRADA.includes(subDe(i, compDe))) continue; // a porta fica só no térreo
        const c = { ...i, id: novoId(), z: (i.z || 0) + altura * k, andar: (i.andar || 0) + k }; mapa.set(i.id, c.id); copias.push(c);
      }
      for (const c of copias) if (c.anfitriao && mapa.has(c.anfitriao)) c.anfitriao = mapa.get(c.anfitriao);
      lista.push(...copias); resumo.push({ id: null, mudou: `andar ${k} acima adicionado (${copias.length} peças)` });
    }
    // o telhado passa a apoiar-se na parede do novo topo
    const novoTopo = lista.filter((i) => subDe(i, compDe) === 'parede' && (i.z || 0) === topoZ + altura * mais);
    for (const t of lista.filter((i) => telhadoIds.includes(i.id))) { const w = novoTopo[0]; if (w) t.anfitriao = w.id; }
  } else {
    const atuais = Math.round(topoZ / altura) + 1; const menos = Math.min(-delta, atuais - 1);
    if (menos <= 0) { avisos.push('o edifício já está no térreo'); return; }
    const novoTopoZ = topoZ - altura * menos;
    const telhadoIds = lista.filter((i) => SUBS_TELHADO.includes(subDe(i, compDe))).map((i) => i.id);
    const arvoreTelhado = new Set(telhadoIds); for (const t of telhadoIds) for (const d of descendentes(lista, t)) arvoreTelhado.add(d);
    const novoTopo = paredes.find((p) => (p.z || 0) === novoTopoZ);
    const sai = new Set();
    for (const w of paredes.filter((p) => (p.z || 0) > novoTopoZ)) { sai.add(w.id); for (const d of descendentes(lista, w.id)) if (!arvoreTelhado.has(d)) sai.add(d); }
    for (const i of lista) if (arvoreTelhado.has(i.id)) { i.z = (i.z || 0) - altura * menos; if (telhadoIds.includes(i.id) && novoTopo) i.anfitriao = novoTopo.id; }
    lista.splice(0, lista.length, ...lista.filter((i) => !sai.has(i.id)));
    resumo.push({ id: null, mudou: `${menos} andar(es) removido(s)` });
  }
}

// estacionamento: aumenta (ou diminui) os módulos das fileiras existentes; se já está no máximo, abre outra fileira
function ajustarEstacionamento(lista, delta, compDe, resumo, avisos, area) {
  if (!delta) return area;
  const fileiras = lista.filter((i) => ['vaga', 'vaga-acessivel'].includes(subDe(i, compDe))).sort((a, b) => a.y - b.y);
  if (!fileiras.length) { avisos.push('não há estacionamento para ampliar: peça "criar com IA" com vagas'); return area; }
  let resta = delta;
  if (delta > 0) {
    for (const f of fileiras) { const folga = MODULOS_MAX - (f.n || 1); const d = Math.min(folga, resta); if (d > 0) { f.n = (f.n || 1) + d; resta -= d; resumo.push({ id: f.id, mudou: `+${d} vagas` }); } if (resta <= 0) break; }
    if (resta > 0) {
      const base = fileiras.at(-1); const c = compDe(base.comp); const prof = Math.max(GRADE, c.area.h * GRADE);
      const porFileira = Math.min(MODULOS_MAX, base.n || 1);
      while (resta > 0) { const n = Math.min(porFileira, resta); const nova = novaInstancia(c, base.x, fileiras.at(-1).y + prof + 32, { n, papel: 'vaga' }); fileiras.push(nova); lista.push(nova); resta -= n; resumo.push({ id: nova.id, mudou: `nova fileira com ${n} vagas` }); }
      area = { ...area, h: Math.max(area.h, Math.ceil((fileiras.at(-1).y + 64) / GRADE)) };
    }
  } else {
    for (const f of [...fileiras].reverse()) { const d = Math.min((f.n || 1) - 1, -resta); if (d > 0) { f.n -= d; resta += d; resumo.push({ id: f.id, mudou: `−${d} vagas` }); } if (resta >= 0) break; }
  }
  return area;
}

// peça nova ao lado do edifício (garagem lateral, árvores...): usa o espaço livre à direita ou à esquerda
function adicionarLateral(lista, comp, onde, quantidade, compDe) {
  const base = lista.filter((i) => !i.anfitriao); const caixas = base.map((i) => { const c = compDe(i.comp); const w = larguraVisual(i, c); return { x0: i.x - w / 2, x1: i.x + w / 2, y: i.y }; });
  const yBase = base.length ? Math.max(...base.filter((i) => ['parede', 'fachada-envidracada'].includes(subDe(i, compDe))).map((i) => i.y), base[0].y) : 256;
  const esq = caixas.length ? Math.min(...caixas.map((c) => c.x0)) : 128; const dir = caixas.length ? Math.max(...caixas.map((c) => c.x1)) : 384;
  const saida = [];
  const w = larguraVisual({ escala: 1, n: 1 }, comp);
  for (let k = 0; k < quantidade; k++) {
    const lado = onde === 'esq' || onde === 'esquerda';
    const x = lado ? esq - w / 2 - 16 - k * (w + 8) : dir + w / 2 + 16 + k * (w + 8);
    const i = novaInstancia(comp, snap(x), snap(yBase), { papel: 'lateral' }); saida.push(i);
  }
  return saida;
}

// "garagem lateral": um bloco de parede ao lado, com portão (ou porta) e telhado, montados e encaixados
export function montarGaragemLateral(lista, compDe, lado, { parede, portao, telhado }) {
  const paredes = lista.filter((i) => ['parede'].includes(subDe(i, compDe)) && !i.anfitriao); if (!paredes.length || !parede) return [];
  const ref = paredes.find((p) => (p.z || 0) === 0) || paredes[0]; const larg = larguraVisual(ref, compDe(ref.comp));
  const nM = 2; const w = larguraVisual({ escala: ref.escala, n: nM }, parede);
  const x = lado === 'esq' ? ref.x - larg / 2 - w / 2 : ref.x + larg / 2 + w / 2;
  const saida = []; const wall = novaInstancia(parede, snap(x), ref.y, { n: nM, escala: ref.escala, papel: 'garagem', andar: 0 }); saida.push(wall);
  if (portao) saida.push(novaInstancia(portao, wall.x, wall.y, { anfitriao: wall.id, papel: 'garagem-portao', nome: 'Garagem' }));
  if (telhado) saida.push(novaInstancia(telhado, wall.x, wall.y, { anfitriao: wall.id, z: alturaVisual(wall, parede), papel: 'garagem-telhado' }));
  return saida;
}

// ---------------------------------------------------------------------------------------------------------------------
// EDIÇÃO LOCAL (sem IA configurada): frases comuns → operações
// ---------------------------------------------------------------------------------------------------------------------
const ALVOS = [['janela', /janelas?|vitrines?/], ['porta', /portas?/], ['parede', /paredes?|fachada/], ['telhado', /telhado|cobertura/], ['arvores', /arvores?/], ['palmeiras', /palmeiras?/]];
export const pontuar = (c, texto) => { const pal = sem(texto).split(/[^a-z0-9]+/).filter((p) => p.length > 2); const base = sem([c.nome, c.material, ...(c.tags || [])].join(' ')); return pal.reduce((n, p) => n + (base.includes(p) ? 1 : 0), 0); };

export function operacoesLocais(instrucao, componentes, presetId) {
  const t = sem(instrucao); const ops = [];
  // trocar/mudar um grupo de peças: "troque as janelas por vidro azul", "substitua o telhado por uma cobertura metálica"
  const troca = t.match(/(?:troque|trocar|substitua|substituir|mude|mudar|pinte|pintar)\b(.*?)(?:\bpor\b|\bpara\b|\bem\b)(.*)$/);
  if (troca) {
    const alvo = ALVOS.find(([, re]) => re.test(troca[1])); const depois = troca[2];
    if (alvo) {
      const subsAlvo = subsDoNome(alvo[0]) || [alvo[0]];
      const novoSubs = /cobertura metalica|metalica/.test(depois) && alvo[0] === 'telhado' ? ['cobertura-metalica'] : /inclinado/.test(depois) && alvo[0] === 'telhado' ? ['telhado-inclinado'] : subsAlvo;
      const cands = componentes.filter((c) => novoSubs.includes(c.sub) && compativelComPreset(c, presetId));
      const melhor = [...cands].sort((a, b) => pontuar(b, depois) - pontuar(a, depois) || a.id.localeCompare(b.id))[0];
      const trocar = melhor && (pontuar(melhor, depois) >= 1 || novoSubs !== subsAlvo);
      ops.push({ op: trocar ? 'substituir' : 'cor', alvo: { sub: subsAlvo }, por: { comp: trocar ? melhor.id : undefined, cor: corDoTexto(depois), material: /vidro/.test(depois) ? 'vidro' : /metal/.test(depois) ? 'metal' : undefined } });
    }
  }
  if (/(aumente|aumentar|amplie|ampliar|maior).*(entrada|porta)/.test(t)) ops.push({ op: 'escala', alvo: { sub: subsDoNome('entrada') }, fator: 1.3 });
  const andares = t.match(/(?:mais|adicione|adicionar|acrescente|acrescentar)\s*(\d+|um|uma|dois|duas|tres|quatro|cinco)?\s*(?:mais\s*)?(?:andares?|pavimentos?)/);
  if (andares && !/(remova|retire|tire)/.test(t)) ops.push({ op: 'andares', delta: numeros[andares[1]] || Number(andares[1]) || 1 });
  else if (/(remova|retire|tire).*(andar|pavimento)/.test(t)) ops.push({ op: 'andares', delta: -(inteiroAntes(t, 'andares?|pavimentos?') || 1) });
  if (/(amplie|ampliar|aumente|aumentar|mais).*(estacionamento|vagas)/.test(t)) ops.push({ op: 'estacionamento', delta_vagas: inteiroAntes(t, 'vagas?|veiculos?|carros?') || 10 });
  if (/garagem/.test(t) && /(adicione|adicionar|crie|criar|acrescente|acrescentar)/.test(t)) ops.push({ op: 'garagem', onde: /esquerd/.test(t) ? 'esq' : 'dir' });
  return ops;
}

export function normalizarOps(ops) {
  return (Array.isArray(ops) ? ops : []).filter((o) => o && typeof o === 'object' && typeof o.op === 'string').slice(0, 12);
}
export { normalizarInstancia };
