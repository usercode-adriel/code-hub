// STRUCTURE STUDIO: lógica de montagem (módulo puro, sem DOM; roda no navegador e no Node).
// Uma estrutura é uma lista de INSTÂNCIAS de componentes da biblioteca. Cada instância:
//   id, comp (id do componente), x, y (pé da peça: centro da base, no chão), z (altura em px acima do chão), rot (graus),
//   escala (uniforme: nunca deforma o asset), n (módulos repetidos na horizontal, só para peças modulares), espelho,
//   camada, zfino (ordem dentro da camada), grupo, anfitriao (id da peça onde está encaixada), cor (tinta), nome, colisao (liga/desliga).
// Coordenadas em unidades do jogo (a grade é de 32). O ENCAIXE é determinístico: grade fina + conectores por subcategoria.
import { CAMADAS, REQUER, GRADE, MATERIAIS } from './presets.js';

export const PASSO = GRADE / 4;     // encaixe fino da grade (8 unidades)
export const ESCALA_MIN = 0.25;
export const ESCALA_MAX = 4;
export const MODULOS_MAX = 24;

// peças que crescem repetindo o módulo (em vez de esticar a imagem)
export const MODULAR = new Set(['parede', 'laje', 'viga', 'fachada-envidracada', 'calcada', 'cerca', 'muro', 'vaga', 'vaga-acessivel', 'pintura-solo', 'faixa-pedestres', 'faixa-circulacao', 'reta', 'meio-fio', 'piso', 'ciclovia']);
// como a peça se encaixa no anfitrião: na face (portas, janelas...) ou em cima (telhado, equipamentos)
const NA_FACE = new Set(['porta', 'janela', 'vitrine', 'letreiro', 'marquise', 'sacada']);
const EM_CIMA = new Set(['telhado-plano', 'telhado-inclinado', 'cobertura-metalica', 'terraco', 'caixa-dagua', 'ar-condicionado', 'antena', 'exaustor', 'laje', 'viga']);
// de onde sobe a peça que fica em cima: fração da altura do anfitrião (estrutura sobe tudo; coberturas, pouco)
const TOPO_ESTRUTURAL = new Set(['parede', 'pilar', 'coluna', 'viga', 'laje', 'divisoria', 'fachada-envidracada']);

let contador = 0;
export const novoId = () => `c${Date.now().toString(36)}${(contador++).toString(36)}`;

export const eModular = (comp) => MODULAR.has(comp.sub);
export const modoDeEncaixe = (comp) => (!REQUER[comp.sub] ? 'solo' : NA_FACE.has(comp.sub) ? 'face' : EM_CIMA.has(comp.sub) ? 'topo' : 'solo');
export const limitar = (v, a, b) => Math.min(b, Math.max(a, v));

export function novaInstancia(comp, x, y, extra = {}) {
  return {
    id: novoId(), comp: comp.id, x, y, z: 0, rot: 0, escala: 1, n: 1, espelho: false, camada: comp.camada, zfino: 0,
    grupo: null, anfitriao: null, cor: null, material: null, textura: null, nome: '', colisao: comp.colisao?.tipo === 'caixa', ...extra,
  };
}

// ---------- geometria ----------
export const larguraVisual = (i, c) => c.w * i.escala * (eModular(c) ? Math.max(1, i.n || 1) : 1);
export const alturaVisual = (i, c) => c.h * i.escala;
// pegada no chão (retângulo): largura visual × profundidade (área em células × 32 × escala)
export function pegada(i, c) {
  const w = larguraVisual(i, c); const d = Math.max(GRADE / 2, c.area.h * GRADE * i.escala);
  return { x0: i.x - w / 2, x1: i.x + w / 2, y0: i.y - d, y1: i.y, w, d };
}
// altura estrutural onde algo pode ser colocado em cima
export function alturaDoTopo(i, c) {
  const h = alturaVisual(i, c);
  return i.z + (TOPO_ESTRUTURAL.has(c.sub) ? h : h * 0.35);
}

// ---------- encaixe ----------
const snap = (v, passo) => Math.round(v / passo) * passo;

// Calcula onde a peça fica ao ser solta em (x, y): grade fina, ou encaixe no anfitrião compatível mais próximo.
// ctx: { instancias, compDe(id), passo, raio }. Devolve { x, y, z, anfitriao, modo, ok, motivo }.
export function encaixar(inst, comp, x, y, ctx) {
  const passo = ctx.passo ?? PASSO; const raio = ctx.raio ?? 48;
  const modo = modoDeEncaixe(comp);
  if (modo === 'solo') return { x: snap(x, passo), y: snap(y, passo), z: inst.z || 0, anfitriao: null, modo, ok: true };
  const hospedes = REQUER[comp.sub];
  const gw = larguraVisual(inst, comp); const gh = alturaVisual(inst, comp);
  let melhor = null;
  for (const h of ctx.instancias) {
    if (h.id === inst.id || h.anfitriao === inst.id) continue;
    const hc = ctx.compDe(h.comp); if (!hc || !hospedes.includes(hc.sub)) continue;
    const p = pegada(h, hc);
    const noX = x >= p.x0 - raio && x <= p.x1 + raio;
    const dy = modo === 'face' ? Math.abs(y - h.y) : (y < p.y0 - raio ? p.y0 - raio - y : y > p.y1 + raio ? y - p.y1 - raio : 0);
    if (!noX || dy > raio) continue;
    const dist = Math.abs(x - h.x) * 0.25 + dy;
    if (!melhor || dist < melhor.dist) melhor = { h, hc, p, dist };
  }
  if (!melhor) return { x, y, z: inst.z || 0, anfitriao: null, modo, ok: false, motivo: `precisa encaixar em: ${hospedes.join(', ')}` };
  const { h, hc, p } = melhor;
  const folga = Math.min(gw / 2, p.w / 2);
  const nx = limitar(p.x0 + snap(x - p.x0, passo), p.x0 + folga, p.x1 - folga);
  if (modo === 'face') {
    const hh = alturaVisual(h, hc);
    const zMax = Math.max(0, hh - gh);
    // porta: no chão do anfitrião; as outras: na altura escolhida, em degraus, dentro da parede
    const z = comp.sub === 'porta' ? h.z : h.z + limitar(snap(inst.z && inst.z > h.z ? inst.z - h.z : zMax / 2, passo), 0, zMax);
    return { x: nx, y: h.y, z, anfitriao: h.id, modo, ok: true };
  }
  const ny = limitar(snap(y, passo), p.y0, p.y1);
  return { x: nx, y: ny, z: alturaDoTopo(h, hc), anfitriao: h.id, modo, ok: true };
}

// move uma peça e leva junto tudo que está encaixado nela (e o que está encaixado nessas, em cadeia)
export function moverComFilhos(instancias, id, dx, dy, dz = 0) {
  const vistos = new Set([id]); const fila = [id];
  while (fila.length) {
    const atual = fila.shift();
    for (const i of instancias) if (i.anfitriao === atual && !vistos.has(i.id)) { vistos.add(i.id); fila.push(i.id); }
  }
  for (const i of instancias) if (vistos.has(i.id)) { i.x += dx; i.y += dy; i.z = (i.z || 0) + dz; }
  return vistos;
}

// quem está encaixado em `id`, em cadeia (filhos, netos...)
export function descendentes(instancias, id) {
  const vistos = new Set(); const fila = [id];
  while (fila.length) { const a = fila.shift(); for (const i of instancias) if (i.anfitriao === a && !vistos.has(i.id) && i.id !== id) { vistos.add(i.id); fila.push(i.id); } }
  return vistos;
}
// depois de mudar o tamanho de um anfitrião, os encaixados são recolocados na face/topo novos (o que não couber fica para o diagnóstico acusar)
export function reencaixarFilhos(instancias, id, compDe, passo = PASSO) {
  const ctx = { instancias, compDe, passo, raio: 4000 };
  let n = 0;
  const filhos = instancias.filter((i) => i.anfitriao === id);
  for (const f of filhos) {
    const fc = compDe(f.comp); if (!fc) continue;
    const r = encaixar({ ...f, anfitriao: null }, fc, f.x, f.y, { ...ctx, instancias: instancias.filter((x) => x.id === id || x.id === f.anfitriao) });
    if (r.ok && r.anfitriao === id) { f.x = r.x; f.y = r.y; f.z = r.z; n++; reencaixarFilhos(instancias, f.id, compDe, passo); }
  }
  return n;
}
// copia as peças (e tudo que está encaixado nelas), com ids novos e as referências refeitas
export function clonarCom(instancias, ids, dx = GRADE, dy = GRADE) {
  const alvo = new Set(ids);
  for (const id of ids) for (const d of descendentes(instancias, id)) alvo.add(d);
  const mapa = new Map(); const copias = [];
  for (const i of instancias) if (alvo.has(i.id)) { const c = { ...i, id: novoId(), x: i.x + dx, y: i.y + dy }; mapa.set(i.id, c.id); copias.push(c); }
  const grupos = new Map();
  for (const c of copias) {
    if (c.anfitriao && mapa.has(c.anfitriao)) c.anfitriao = mapa.get(c.anfitriao); else if (c.anfitriao) c.anfitriao = null;
    if (c.grupo) { if (!grupos.has(c.grupo)) grupos.set(c.grupo, `g${novoId()}`); c.grupo = grupos.get(c.grupo); }
  }
  return copias;
}
// apagar uma peça leva junto o que estava encaixado nela (senão ficaria flutuando)
export function removerComFilhos(instancias, ids) {
  const fora = new Set(ids);
  for (const id of ids) for (const d of descendentes(instancias, id)) fora.add(d);
  return { restantes: instancias.filter((i) => !fora.has(i.id)), removidos: fora.size };
}

// ---------- grupos ----------
// ids que entram juntos: a peça, o grupo dela e quem está encaixado nelas
export function expandirSelecao(instancias, ids) {
  const sel = new Set(ids);
  for (const i of instancias) if (sel.has(i.id) && i.grupo) for (const j of instancias) if (j.grupo === i.grupo) sel.add(j.id);
  return sel;
}
export function agrupar(instancias, ids) {
  const alvo = instancias.filter((i) => ids.has ? ids.has(i.id) : ids.includes(i.id));
  if (alvo.length < 2) return null;
  const g = `g${novoId()}`;
  for (const i of alvo) i.grupo = g;
  return g;
}
export function desagrupar(instancias, ids) {
  for (const i of instancias) if (ids.has ? ids.has(i.id) : ids.includes(i.id)) i.grupo = null;
}

// ---------- alinhar ----------
// modos: esq, centro-h, dir, topo, centro-v, base, distribuir-h, distribuir-v. Usa a pegada de cada peça.
export function alinhar(instancias, ids, modo, compDe) {
  const lista = instancias.filter((i) => ids.has(i.id) && !i.anfitriao);
  if (lista.length < 2) return 0;
  const caixas = lista.map((i) => ({ i, p: pegada(i, compDe(i.comp)) }));
  const move = (i, dx, dy) => moverComFilhos(instancias, i.id, dx, dy);
  const minX = Math.min(...caixas.map((c) => c.p.x0)); const maxX = Math.max(...caixas.map((c) => c.p.x1));
  const minY = Math.min(...caixas.map((c) => c.p.y0)); const maxY = Math.max(...caixas.map((c) => c.p.y1));
  if (modo === 'esq') caixas.forEach(({ i, p }) => move(i, minX - p.x0, 0));
  else if (modo === 'dir') caixas.forEach(({ i, p }) => move(i, maxX - p.x1, 0));
  else if (modo === 'centro-h') caixas.forEach(({ i, p }) => move(i, (minX + maxX) / 2 - (p.x0 + p.x1) / 2, 0));
  else if (modo === 'topo') caixas.forEach(({ i, p }) => move(i, 0, minY - p.y0));
  else if (modo === 'base') caixas.forEach(({ i, p }) => move(i, 0, maxY - p.y1));
  else if (modo === 'centro-v') caixas.forEach(({ i, p }) => move(i, 0, (minY + maxY) / 2 - (p.y0 + p.y1) / 2));
  else if (modo === 'distribuir-h' || modo === 'distribuir-v') {
    if (lista.length < 3) return 0;
    const h = modo === 'distribuir-h';
    const ord = [...caixas].sort((a, b) => (h ? a.p.x0 - b.p.x0 : a.p.y0 - b.p.y0));
    const total = h ? maxX - minX : maxY - minY;
    const soma = ord.reduce((n, c) => n + (h ? c.p.w : c.p.d), 0);
    const vao = (total - soma) / (ord.length - 1);
    let cursor = h ? minX : minY;
    for (const c of ord) { const ini = h ? c.p.x0 : c.p.y0; move(c.i, h ? cursor - ini : 0, h ? 0 : cursor - ini); cursor += (h ? c.p.w : c.p.d) + vao; }
  } else return 0;
  return lista.length;
}

// ---------- ordem de desenho ----------
// camada (de baixo para cima), depois a profundidade (quem está mais perto da câmera, y maior, fica por cima), depois o z fino
export function ordemDeDesenho(instancias) {
  return instancias.map((i, k) => ({ i, k })).sort((a, b) => {
    const ca = CAMADAS.indexOf(a.i.camada); const cb = CAMADAS.indexOf(b.i.camada);
    return ca - cb || a.i.y - b.i.y || (a.i.zfino || 0) - (b.i.zfino || 0) || a.k - b.k;
  }).map((x) => x.i);
}

// ---------- diagnóstico ----------
// Procura o que deixa a montagem errada: peça flutuando, atravessando outra, fora da área, desalinhada, sem componente.
export function diagnosticar(instancias, area, presetId, compDe) {
  const problemas = [];
  const add = (tipo, i, msg, gravidade = 'aviso') => problemas.push({ tipo, id: i.id, msg, gravidade });
  const W = area.w * GRADE; const H = area.h * GRADE;
  const porId = new Map(instancias.map((i) => [i.id, i]));
  for (const i of instancias) {
    const c = compDe(i.comp);
    if (!c) { add('sem-componente', i, 'o componente não está mais na biblioteca', 'erro'); continue; }
    const p = pegada(i, c);
    if (p.x1 < 0 || p.x0 > W || i.y < 0 || i.y - p.d > H) add('fora-da-area', i, 'a peça está fora da área de construção');
    if (REQUER[c.sub]) {
      const h = i.anfitriao ? porId.get(i.anfitriao) : null; const hc = h && compDe(h.comp);
      if (!h || !hc) add('flutuando', i, `flutuando: encaixe em ${REQUER[c.sub].join(', ')}`, 'erro');
      else if (!REQUER[c.sub].includes(hc.sub)) add('flutuando', i, `não encaixa em ${hc.sub}`, 'erro');
      else {
        const ph = pegada(h, hc);
        if (i.x < ph.x0 - 1 || i.x > ph.x1 + 1) add('flutuando', i, 'saiu do alcance do anfitrião', 'erro');
      }
    } else if (((i.x - 0) % PASSO !== 0 || (i.y % PASSO) !== 0) && !i.anfitriao) add('desalinhada', i, 'fora da grade de encaixe', 'info');
    if (presetId === 'arq25d' && c.perspectiva === 'arq25d' && ((i.rot || 0) % 360) !== 0) add('rotacao', i, 'girar uma peça arquitetônica quebra a perspectiva (use o espelho)', 'aviso');
  }
  // peças estruturais (camada base) atravessando umas às outras
  const base = instancias.filter((i) => i.camada === 'base' && compDe(i.comp) && !i.anfitriao);
  for (let a = 0; a < base.length; a++) for (let b = a + 1; b < base.length; b++) {
    if (base[a].grupo && base[a].grupo === base[b].grupo) continue;
    const ca = compDe(base[a].comp); const cb = compDe(base[b].comp);
    const pa = pegada(base[a], ca); const pb = pegada(base[b], cb);
    const ox = Math.min(pa.x1, pb.x1) - Math.max(pa.x0, pb.x0); const oy = Math.min(pa.y1, pb.y1) - Math.max(pa.y0, pb.y0);
    // andares empilhados não se atravessam: só conta se as alturas também se sobrepõem
    const za0 = base[a].z || 0; const zb0 = base[b].z || 0;
    const oz = Math.min(za0 + alturaVisual(base[a], ca), zb0 + alturaVisual(base[b], cb)) - Math.max(za0, zb0);
    if (ox > 6 && oy > 6 && oz > 2) add('atravessando', base[b], 'atravessa outra peça estrutural');
  }
  return problemas;
}

// ---------- validação rápida de instância (também usada pelo servidor) ----------
export function normalizarInstancia(i) {
  return {
    id: String(i.id || novoId()).slice(0, 40), comp: String(i.comp), x: Math.round(Number(i.x) || 0), y: Math.round(Number(i.y) || 0), z: Math.round(Number(i.z) || 0),
    rot: Math.round((((Number(i.rot) || 0) % 360) + 360) % 360 * 10) / 10, escala: Math.round(limitar(Number(i.escala) || 1, ESCALA_MIN, ESCALA_MAX) * 100) / 100,
    n: Math.round(limitar(Number(i.n) || 1, 1, MODULOS_MAX)), espelho: i.espelho === true, camada: CAMADAS.includes(i.camada) ? i.camada : 'externo',
    zfino: Math.round(limitar(Number(i.zfino) || 0, -999, 999)), grupo: i.grupo ? String(i.grupo).slice(0, 40) : null, anfitriao: i.anfitriao ? String(i.anfitriao).slice(0, 40) : null,
    cor: /^#[0-9a-f]{6}$/i.test(i.cor || '') ? i.cor : null, material: MATERIAIS.includes(i.material) ? i.material : null, textura: i.textura ? String(i.textura).slice(0, 60) : null, papel: i.papel ? String(i.papel).slice(0, 30) : null, andar: Number.isFinite(Number(i.andar)) && i.andar !== null ? Math.round(limitar(Number(i.andar), 0, 40)) : null, nome: String(i.nome || '').slice(0, 60), colisao: i.colisao === true,
  };
}
