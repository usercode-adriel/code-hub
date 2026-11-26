// OFFICE BUILDER: edição do escritório. Ferramentas: selecionar/mover, piso, parede, porta, janela, objeto (arrastar da biblioteca),
// borracha, colisão, personagem, departamento e estação. Tudo respeita a grade isométrica, tem desfazer/refazer e só salva quando você manda.
import { Sprite } from 'pixi.js';
import { celulasDe, dimensoes, objetoPorTipo, type TipoObjeto } from './catalogo';
import { dentro, indice, copiar, novoId, redimensionar, type EstacaoLayout, type Layout, type ObjetoLayout, type ParedeLayout } from './modelo';
import { gridParaTela, telaParaGrid, type Direcao } from './iso';
import { Historico } from './historico';
import type { OfficeEngine } from './engine';
import { ESCALA_ARTE } from './pacote';
import { Grade } from './grade';

export type Ferramenta = 'selecionar' | 'piso' | 'parede' | 'porta' | 'janela' | 'objeto' | 'borracha' | 'colisao' | 'personagem' | 'departamento';
export type ResolveTipo = (o: { tipo: string }) => TipoObjeto | undefined;

const resolvePadrao: ResolveTipo = (o) => objetoPorTipo(o.tipo);
const ehMesa = (t: TipoObjeto | undefined): boolean => t?.categoria === 'moveis' && /^mesa/.test(t.tipo);

/** Pode colocar este tipo, nesta posição (pode ser fracionária), rotação e escala? (função pura, usada pelo editor e pelos testes) */
export function podeColocar(l: Layout, tipo: TipoObjeto, x: number, y: number, rot: number, resolve: ResolveTipo = resolvePadrao, ignorarId: string | null = null, escala = 1): { ok: boolean; motivo: string } {
  const { w, d } = dimensoes(tipo, rot, escala); const c = celulasDe(x, y, w, d);
  for (let cy = c.y0; cy < c.y1; cy++) for (let cx = c.x0; cx < c.x1; cx++) {
    if (!dentro(l, cx, cy)) return { ok: false, motivo: 'Fora do mapa.' };
    if (!l.piso[indice(l, cx, cy)]) return { ok: false, motivo: 'Sem piso nesta área.' };
  }
  const resto = l.objetos.filter((o) => o.id !== ignorarId); const E = 1e-6;
  if (tipo.suporte) {
    const sobreMesa = resto.some((o) => { const t = resolve(o); if (!ehMesa(t)) return false; const m = dimensoes(t!, o.rot ?? 0, o.escala); return x + 0.5 >= o.x && x + 0.5 < o.x + m.w && y + 0.5 >= o.y && y + 0.5 < o.y + m.d; });
    if (!sobreMesa) return { ok: false, motivo: 'Precisa ficar sobre uma mesa.' };
    if (resto.some((o) => o.tipo === tipo.tipo && Math.abs(o.x - x) < 0.3 && Math.abs(o.y - y) < 0.3)) return { ok: false, motivo: 'Já há um igual aqui.' };
    return { ok: true, motivo: '' };
  }
  for (const o of resto) {
    const t = resolve(o); if (!t) continue; const m = dimensoes(t, o.rot ?? 0, o.escala);
    const sobrepoe = x < o.x + m.w - E && x + w > o.x + E && y < o.y + m.d - E && y + d > o.y + E; if (!sobrepoe) continue;
    if (t.suporte && !tipo.solido) continue;                                     // computador sobre mesa não atrapalha cadeira ao lado
    if (t.tipo === 'tapete' || tipo.tipo === 'tapete') continue;                  // tapete fica por baixo de tudo
    if (t.suporte) { if (tipo.solido && !ehMesa(tipo)) return { ok: false, motivo: `Ocupado por ${t.nome}.` }; continue; }
    if (t.solido || tipo.solido) return { ok: false, motivo: `Ocupado por ${t.nome}.` };
    return { ok: false, motivo: `Ocupado por ${t.nome}.` };
  }
  return { ok: true, motivo: '' };
}

/** Qual aresta (N ou W) de qual célula está mais perto de um ponto contínuo da grade? */
export function arestaMaisProxima(gx: number, gy: number): { x: number; y: number; lado: 'N' | 'W' } {
  const x = Math.floor(gx); const y = Math.floor(gy); const fx = gx - x; const fy = gy - y;
  // arestas da célula: N (topo, y) e W (esquerda, x); as vizinhas S e E pertencem às células (x,y+1) e (x+1,y)
  const cand = [{ d: fy, x, y, lado: 'N' as const }, { d: 1 - fy, x, y: y + 1, lado: 'N' as const }, { d: fx, x, y, lado: 'W' as const }, { d: 1 - fx, x: x + 1, y, lado: 'W' as const }];
  const m = cand.sort((a, b) => a.d - b.d)[0]; return { x: m.x, y: m.y, lado: m.lado };
}

export interface EstadoConstrutor { ferramenta: Ferramenta; piso: string; paredeTipo: string; tipoObjeto: string; rot: number; agenteId: string | null; selecionadoId: string | null; passo: number; escalaNova: number; podeDesfazer: boolean; podeRefazer: boolean; sujo: boolean; motivoInvalido: string }

interface Arrasto { tipo: 'piso' | 'parede' | 'linha' | 'mover' | 'retangulo' | 'colisao'; objetoId?: string; origem?: { x: number; y: number }; v0?: { x: number; y: number; gx: number; gy: number }; ultima?: string; modificou: boolean; valor?: boolean; pos0?: { gx: number; gy: number; ox: number; oy: number } }

/** Arestas de parede de um traçado "estilo The Sims": do vértice inicial (v0) até o ponto atual, em linha reta pelo eixo dominante, ou o contorno de um retângulo (Shift). */
export function segmentoParede(v0: { gx: number; gy: number }, atual: { gx: number; gy: number }, retangulo = false): { x: number; y: number; lado: 'N' | 'W' }[] {
  const x0 = Math.round(v0.gx); const y0 = Math.round(v0.gy); const x1 = Math.round(atual.gx); const y1 = Math.round(atual.gy); const out: { x: number; y: number; lado: 'N' | 'W' }[] = [];
  const xa = Math.min(x0, x1); const xb = Math.max(x0, x1); const ya = Math.min(y0, y1); const yb = Math.max(y0, y1);
  if (retangulo) { for (let x = xa; x < xb; x++) { out.push({ x, y: ya, lado: 'N' }); out.push({ x, y: yb, lado: 'N' }); } for (let y = ya; y < yb; y++) { out.push({ x: xa, y, lado: 'W' }); out.push({ x: xb, y, lado: 'W' }); } return out; }
  if (Math.abs(atual.gx - v0.gx) >= Math.abs(atual.gy - v0.gy)) { for (let x = xa; x < xb; x++) out.push({ x, y: y0, lado: 'N' }); } else { for (let y = ya; y < yb; y++) out.push({ x: x0, y, lado: 'W' }); }
  return out;
}

export class Construtor {
  ferramenta: Ferramenta = 'selecionar'; piso = 'madeira'; paredeTipo = 'parede'; tipoObjeto = 'mesa'; rot = 0; agenteId: string | null = null;
  /** Encaixe do posicionamento: 1 = grade, 0,5 = meia grade, 0,25 = fino, 0,1 = livre. */
  passo = 0.5; escalaNova = 1;
  private hist!: Historico<Layout>; private base = ''; private fantasmaSprite: Sprite | null = null; private fantasmaChave = '';
  private arrasto: Arrasto | null = null;
  private motivo = ''; selecionadoId: string | null = null;
  aoMudar: (e: EstadoConstrutor) => void = () => {};

  constructor(private readonly motor: OfficeEngine) {}

  ativar(): void {
    this.hist = new Historico(copiar(this.motor.layout), 100); this.base = JSON.stringify(this.motor.layout);
    this.motor.gancho = { aoPonteiro: (t, x, y, ev) => this.ponteiro(t, x, y, ev), aoTecla: (ev) => this.tecla(ev) };
    this.motor.redesenharGrade(); this.emitir();
  }
  desativar(): void { this.motor.gancho = {}; this.limparFantasma(); this.motor.fantasma.clear(); this.arrasto = null; }
  estado(): EstadoConstrutor { return { ferramenta: this.ferramenta, piso: this.piso, paredeTipo: this.paredeTipo, tipoObjeto: this.tipoObjeto, rot: this.rot, agenteId: this.agenteId, selecionadoId: this.selecionadoId, passo: this.passo, escalaNova: this.escalaNova, podeDesfazer: this.hist?.podeDesfazer ?? false, podeRefazer: this.hist?.podeRefazer ?? false, sujo: this.sujo(), motivoInvalido: this.motivo }; }
  sujo(): boolean { return JSON.stringify(this.motor.layout) !== this.base; }
  /** Depois de salvar no servidor: o estado atual passa a ser o "limpo". */
  marcarSalvo(): void { this.base = JSON.stringify(this.motor.layout); this.emitir(); }
  private emitir(): void { const e = this.estado(); this.aoMudar(e); this.motor.bus.emit('layoutMudou', { layout: this.motor.layout, podeDesfazer: e.podeDesfazer, podeRefazer: e.podeRefazer, sujo: e.sujo }); }

  setFerramenta(f: Ferramenta): void { this.ferramenta = f; this.limparFantasma(); this.motor.fantasma.clear(); this.motivo = ''; this.emitir(); }
  setTipoObjeto(t: string): void { this.tipoObjeto = t; this.ferramenta = 'objeto'; this.rot = 0; this.emitir(); }
  girar(): void {
    if (this.selecionadoId && this.ferramenta === 'selecionar') { this.girarSelecionado(); return; }
    this.rot = (this.rot + 1) % 4; this.fantasmaChave = ''; this.emitir();
  }

  // ---------- histórico ----------
  private confirmar(reconstruir: ('chao' | 'paredes' | 'objetos' | 'pessoas')[] = []): void {
    const L = this.motor.layout;
    if (reconstruir.includes('chao')) this.motor.reconstruirChao();
    if (reconstruir.includes('paredes')) this.motor.reconstruirEstruturas();
    if (reconstruir.includes('objetos')) this.motor.reconstruirObjetos();
    this.motor.recalcularGrade(); this.motor.redesenharGrade();
    this.hist.registrar(copiar(L)); this.emitir();
  }
  private restaurar(l: Layout): void { this.motor.carregarLayout(l, { recentrar: false }); this.motor.redesenharGrade(); this.emitir(); }
  desfazer(): void { const l = this.hist.desfazer(); if (l) this.restaurar(l); }
  refazer(): void { const l = this.hist.refazer(); if (l) this.restaurar(l); }
  /** Troca o layout inteiro (ex.: abrir outro, duplicar) e zera o histórico. */
  novoLayout(l: Layout): void { this.motor.carregarLayout(l); this.hist = new Historico(copiar(l), 100); this.base = JSON.stringify(l); this.selecionadoId = null; this.motor.redesenharGrade(); this.emitir(); }
  redimensionarMapa(largura: number, altura: number): void { this.motor.carregarLayout(redimensionar(this.motor.layout, largura, altura), { recentrar: false }); this.motor.redesenharGrade(); this.hist.registrar(copiar(this.motor.layout)); this.emitir(); }

  // ---------- operações sobre o layout ----------
  private tipoDe = (o: { tipo: string }): TipoObjeto | undefined => this.motor.tipoDe(o as ObjetoLayout);

  colocarObjeto(tipo: string, x: number, y: number, rot = this.rot, assetId: string | null = null, escala = this.escalaNova): ObjetoLayout | null {
    const t = this.tipoDe({ tipo }); if (!t) return null;
    const v = podeColocar(this.motor.layout, t, x, y, rot, this.tipoDe, null, escala); this.motivo = v.motivo;
    if (!v.ok) { this.motor.bus.emit('aviso', { texto: v.motivo }); this.emitir(); return null; }
    const o: ObjetoLayout = { id: novoId('obj'), tipo, x, y, rot, ...(escala !== 1 ? { escala } : {}), ...(assetId ? { assetId } : {}) };
    this.motor.layout.objetos.push(o); this.confirmar(['objetos']); return o;
  }
  removerObjeto(id: string): void {
    const L = this.motor.layout; const i = L.objetos.findIndex((o) => o.id === id); if (i < 0) return;
    L.objetos.splice(i, 1); L.estacoes = L.estacoes.filter((e) => e.objetoId !== id);
    if (this.selecionadoId === id) { this.selecionadoId = null; this.motor.selecionar({ tipo: 'nenhum' }); }
    this.confirmar(['objetos']);
  }
  removerSelecionado(): void { if (this.selecionadoId) this.removerObjeto(this.selecionadoId); }
  moverObjeto(id: string, x: number, y: number): boolean {
    const o = this.motor.layout.objetos.find((q) => q.id === id); const t = o && this.tipoDe(o); if (!o || !t) return false;
    const v = podeColocar(this.motor.layout, t, x, y, o.rot ?? 0, this.tipoDe, id, o.escala ?? 1); this.motivo = v.motivo; if (!v.ok) return false;
    o.x = x; o.y = y; return true;
  }
  girarSelecionado(): void {
    const o = this.motor.layout.objetos.find((q) => q.id === this.selecionadoId); const t = o && this.tipoDe(o); if (!o || !t) return;
    const nova = ((o.rot ?? 0) + 1) % 4; const v = podeColocar(this.motor.layout, t, o.x, o.y, nova, this.tipoDe, o.id, o.escala ?? 1);
    if (!v.ok) { this.motor.bus.emit('aviso', { texto: `Não dá para girar: ${v.motivo}` }); return; }
    o.rot = nova; this.confirmar(['objetos']);
  }
  /** Troca o tipo de um objeto mantendo posição (se couber) e a estação ligada a ele. */
  substituirObjeto(id: string, novoTipo: string, assetId: string | null = null): boolean {
    const o = this.motor.layout.objetos.find((q) => q.id === id); const t = this.tipoDe({ tipo: novoTipo }); if (!o || !t) return false;
    const v = podeColocar(this.motor.layout, t, o.x, o.y, o.rot ?? 0, this.tipoDe, id, o.escala ?? 1); if (!v.ok) { this.motor.bus.emit('aviso', { texto: `Não dá para substituir: ${v.motivo}` }); return false; }
    o.tipo = novoTipo; if (assetId) o.assetId = assetId; else delete o.assetId; this.confirmar(['objetos']); return true;
  }
  /** Atalho: duplica o objeto selecionado ao lado (primeira posição que couber) e seleciona a cópia. */
  duplicarSelecionado(): ObjetoLayout | null {
    const L = this.motor.layout; const o = L.objetos.find((q) => q.id === this.selecionadoId); const t = o && this.tipoDe(o); if (!o || !t) return null;
    const { w, d } = dimensoes(t, o.rot ?? 0, o.escala); const passos = [[w, 0], [0, d], [-w, 0], [0, -d], [w, d], [-w, -d], [1, 1], [0.5, 0.5]];
    for (const [dx, dy] of passos) {
      if (podeColocar(L, t, o.x + dx, o.y + dy, o.rot ?? 0, this.tipoDe, null, o.escala ?? 1).ok) {
        const c: ObjetoLayout = { ...copiar(o), id: novoId('obj'), x: o.x + dx, y: o.y + dy }; L.objetos.push(c); this.selecionadoId = c.id; this.motor.selecionar({ tipo: 'objeto', id: c.id, tipoObjeto: c.tipo }); this.confirmar(['objetos']); return c;
      }
    }
    this.motor.bus.emit('aviso', { texto: 'Não há espaço livre ao lado para duplicar.' }); return null;
  }
  /** Atalho: define o tamanho (escala 0,4–3) do objeto selecionado. */
  definirEscala(id: string, escala: number): boolean {
    const o = this.motor.layout.objetos.find((q) => q.id === id); const t = o && this.tipoDe(o); if (!o || !t) return false;
    const e = Math.round(Math.min(3, Math.max(0.4, escala)) * 10) / 10; if (e === (o.escala ?? 1)) return false;
    const v = podeColocar(this.motor.layout, t, o.x, o.y, o.rot ?? 0, this.tipoDe, id, e); if (!v.ok) { this.motor.bus.emit('aviso', { texto: `Não dá para mudar o tamanho: ${v.motivo}` }); return false; }
    if (e === 1) delete o.escala; else o.escala = e; this.confirmar(['objetos']); this.motor.atualizarSelecao(); return true;
  }
  escalarSelecionado(delta: number): void { const o = this.motor.layout.objetos.find((q) => q.id === this.selecionadoId); if (o) this.definirEscala(o.id, (o.escala ?? 1) + delta); }
  /** Atalho de camadas: sobe (+1) ou desce (-1) o objeto em relação aos que se sobrepõem a ele. */
  camadaSelecionado(delta: number): void {
    const o = this.motor.layout.objetos.find((q) => q.id === this.selecionadoId); if (!o) return; const nova = Math.max(-10, Math.min(10, (o.camada ?? 0) + delta)); if (nova === (o.camada ?? 0)) return;
    if (nova === 0) delete o.camada; else o.camada = nova; this.confirmar(['objetos']);
  }
  /** Pinta o mapa inteiro com um piso (ou limpa). */
  preencherPiso(tipo: string): void { const L = this.motor.layout; L.piso = L.piso.map(() => tipo); this.confirmar(['chao']); }
  pintarPiso(x: number, y: number, tipo: string): boolean {
    const L = this.motor.layout; if (!dentro(L, x, y)) return false; const i = indice(L, x, y); if (L.piso[i] === tipo) return false;
    L.piso[i] = tipo; this.motor.atualizarPiso(x, y); return true;
  }
  alternarParede(x: number, y: number, lado: 'N' | 'W', modo: 'colocar' | 'remover' | 'porta' | 'janela'): boolean {
    const L = this.motor.layout; if (!dentro(L, x, y)) return false;
    const i = L.paredes.findIndex((w) => w.x === x && w.y === y && w.lado === lado); const w = i >= 0 ? L.paredes[i] : null;
    if (modo === 'remover') { if (!w) return false; L.paredes.splice(i, 1); return true; }
    if (modo === 'colocar') { if (w) { if (w.tipo === this.paredeTipo && !w.abertura) return false; w.tipo = this.paredeTipo; w.abertura = null; return true; } L.paredes.push({ x, y, lado, tipo: this.paredeTipo, abertura: null } as ParedeLayout); return true; }
    const alvo = modo === 'porta' ? 'porta' : 'janela';
    if (w) { w.abertura = w.abertura === alvo ? null : alvo; return true; }
    L.paredes.push({ x, y, lado, tipo: this.paredeTipo, abertura: alvo } as ParedeLayout); return true;
  }
  alternarColisao(x: number, y: number, forcar?: boolean): boolean {
    const L = this.motor.layout; if (!dentro(L, x, y)) return false; const i = L.colisoes.findIndex((c) => c.x === x && c.y === y);
    const quer = forcar ?? i < 0; if (quer && i < 0) { L.colisoes.push({ x, y }); return true; } if (!quer && i >= 0) { L.colisoes.splice(i, 1); return true; } return false;
  }
  posicionarPersonagem(agenteId: string | null, x: number, y: number, dir: Direcao = 'SE'): void {
    const L = this.motor.layout; if (!dentro(L, x, y) || !L.piso[indice(L, x, y)]) { this.motor.bus.emit('aviso', { texto: 'Sem piso aqui.' }); return; }
    if (!new Grade(L, this.tipoDe).livre(x, y)) { this.motor.bus.emit('aviso', { texto: 'Esta célula está bloqueada.' }); return; }
    const ja = agenteId ? L.personagens.find((p) => p.agenteId === agenteId) : null;
    if (ja) { ja.x = x; ja.y = y; ja.dir = dir; } else L.personagens.push({ id: novoId('pers'), agenteId, personagemId: null, x, y, dir });
    this.motor.reconstruirTudo(); this.confirmar();
  }
  removerPersonagem(id: string): void { const L = this.motor.layout; L.personagens = L.personagens.filter((p) => p.id !== id); this.motor.reconstruirTudo(); this.confirmar(); }
  criarDepartamento(x0: number, y0: number, x1: number, y1: number, nome = 'Novo departamento'): void {
    const L = this.motor.layout; const x = Math.min(x0, x1); const y = Math.min(y0, y1); const w = Math.abs(x1 - x0) + 1; const h = Math.abs(y1 - y0) + 1;
    if (!dentro(L, x, y) || !dentro(L, x + w - 1, y + h - 1)) return;
    L.departamentos.push({ id: novoId('dep'), chave: novoId('custom'), nome, x, y, w, h, cor: '#8b7bff' }); this.confirmar();
  }
  renomearDepartamento(id: string, nome: string): void { const d = this.motor.layout.departamentos.find((q) => q.id === id); if (d && nome.trim()) { d.nome = nome.trim().slice(0, 80); this.confirmar(); } }
  removerDepartamento(id: string): void { const L = this.motor.layout; L.departamentos = L.departamentos.filter((d) => d.id !== id); this.confirmar(); }
  /** Liga (ou atualiza) uma estação a um objeto: agente, departamento, ferramenta e ponto de trabalho. Usa ids, não posições. */
  configurarEstacao(objetoId: string, cfg: Partial<Pick<EstacaoLayout, 'agenteId' | 'departamento' | 'ferramenta' | 'rotulo' | 'pontoTrabalho'>>): EstacaoLayout | null {
    const L = this.motor.layout; if (!L.objetos.some((o) => o.id === objetoId)) return null;
    let e = L.estacoes.find((q) => q.objetoId === objetoId);
    if (!e) { e = { id: novoId('est'), objetoId, ferramenta: cfg.ferramenta ?? 'estacao' }; L.estacoes.push(e); }
    Object.assign(e, cfg);
    if (cfg.pontoTrabalho && !dentro(L, cfg.pontoTrabalho.x, cfg.pontoTrabalho.y)) delete e.pontoTrabalho;
    // um agente só tem uma estação de trabalho
    if (cfg.agenteId) for (const outra of L.estacoes) if (outra !== e && outra.agenteId === cfg.agenteId) outra.agenteId = null;
    this.confirmar(); return e;
  }
  removerEstacao(objetoId: string): void { this.motor.layout.estacoes = this.motor.layout.estacoes.filter((e) => e.objetoId !== objetoId); this.confirmar(); }

  // ---------- entrada ----------
  private gridSob(sx: number, sy: number): { gx: number; gy: number; x: number; y: number } {
    const m = this.motor.camera.telaParaMundo(sx, sy); const g = telaParaGrid(m.x, m.y); return { gx: g.x, gy: g.y, x: Math.floor(g.x), y: Math.floor(g.y) };
  }

  /** Aproxima um valor do encaixe atual (grade, meia grade, fino ou livre). */
  private encaixar(v: number): number { return Math.round(v / this.passo) * this.passo; }
  /** Posição (canto de cima) de um objeto cujo centro está sob o cursor, respeitando o encaixe. Na grade cheia, vale a célula sob o cursor. */
  private posicaoSob(g: { gx: number; gy: number; x: number; y: number }, w: number, d: number): { x: number; y: number } {
    if (this.passo >= 1) return { x: g.x, y: g.y };
    const r = (n: number): number => Math.round(n * 1000) / 1000; return { x: r(this.encaixar(g.gx - w / 2)), y: r(this.encaixar(g.gy - d / 2)) };
  }

  private ponteiro(t: 'down' | 'move' | 'up', sx: number, sy: number, ev: PointerEvent): boolean {
    const g = this.gridSob(sx, sy);
    if (t === 'move') { this.mostrarFantasma(g); if (this.arrasto) this.arrastarOp(g, ev); return Boolean(this.arrasto); }
    if (t === 'down') { if (ev.button !== 0) return false; return this.iniciar(g, sx, sy); }
    // 'up'
    const a = this.arrasto; this.arrasto = null;
    if (a) { this.finalizar(a, g, ev); return true; }
    if (this.ferramenta === 'selecionar') { this.selecionarEm(sx, sy); return true; }
    return false;
  }

  private selecionarEm(sx: number, sy: number): void {
    const alvo = this.motor.escolher(sx, sy);
    if (alvo.tipo === 'objeto') { this.selecionadoId = alvo.id; this.motor.selecionar(alvo); } else { this.selecionadoId = null; this.motor.selecionar(alvo.tipo === 'personagem' ? alvo : { tipo: 'nenhum' }); }
    this.emitir();
  }

  private iniciar(g: { gx: number; gy: number; x: number; y: number }, sx: number, sy: number): boolean {
    const L = this.motor.layout;
    switch (this.ferramenta) {
      case 'piso': { this.arrasto = { tipo: 'piso', modificou: false }; if (this.pintarPiso(g.x, g.y, this.piso)) this.arrasto.modificou = true; return true; }
      case 'parede': { this.arrasto = { tipo: 'linha', modificou: false, v0: { x: Math.round(g.gx), y: Math.round(g.gy), gx: g.gx, gy: g.gy } }; return true; }       // traçado esticável (como no The Sims)
      case 'porta': case 'janela': case 'borracha': {
        if (this.ferramenta === 'borracha') {
          const alvo = this.motor.escolher(sx, sy);
          if (alvo.tipo === 'objeto') { this.removerObjeto(alvo.id); return true; }
          if (alvo.tipo === 'personagem') { this.removerPersonagem(alvo.id); return true; }
        }
        this.arrasto = { tipo: 'parede', modificou: false, ultima: '' }; this.aplicarParede(g); return true;
      }
      case 'colisao': { const quer = !L.colisoes.some((c) => c.x === g.x && c.y === g.y); this.arrasto = { tipo: 'colisao', modificou: false, valor: quer }; if (this.alternarColisao(g.x, g.y, quer)) this.arrasto.modificou = true; return true; }
      case 'departamento': this.arrasto = { tipo: 'retangulo', origem: { x: g.x, y: g.y }, modificou: false }; return true;
      case 'objeto': { const t = this.tipoDe({ tipo: this.tipoObjeto }); const { w, d } = t ? dimensoes(t, this.rot, this.escalaNova) : { w: 1, d: 1 }; const p = this.posicaoSob(g, w, d); this.colocarObjeto(this.tipoObjeto, p.x, p.y, this.rot); return true; }
      case 'personagem': { this.posicionarPersonagem(this.agenteId, g.x, g.y); return true; }
      case 'selecionar': {
        const alvo = this.motor.escolher(sx, sy);
        if (alvo.tipo === 'objeto') { const ob = L.objetos.find((q) => q.id === alvo.id)!; this.selecionadoId = alvo.id; this.motor.selecionar(alvo); this.arrasto = { tipo: 'mover', objetoId: alvo.id, origem: { x: g.x, y: g.y }, pos0: { gx: g.gx, gy: g.gy, ox: ob.x, oy: ob.y }, modificou: false }; this.emitir(); return true; }
        return false;
      }
    }
    return false;
  }

  private aplicarParede(g: { gx: number; gy: number }): void {
    const a = this.arrasto; if (!a) return; const e = arestaMaisProxima(g.gx, g.gy); const chave = `${e.x},${e.y},${e.lado}`; if (a.ultima === chave) return; a.ultima = chave;
    const modo = this.ferramenta === 'borracha' ? 'remover' : this.ferramenta === 'porta' ? 'porta' : this.ferramenta === 'janela' ? 'janela' : 'colocar';
    if (this.alternarParede(e.x, e.y, e.lado, modo)) { a.modificou = true; this.motor.reconstruirEstruturas(); }
  }

  private arrastarOp(g: { gx: number; gy: number; x: number; y: number }, _ev: PointerEvent): void {
    const a = this.arrasto!;
    if (a.tipo === 'piso') { if (this.pintarPiso(g.x, g.y, this.piso)) a.modificou = true; }
    else if (a.tipo === 'colisao') { if (this.alternarColisao(g.x, g.y, a.valor)) { a.modificou = true; this.motor.recalcularGrade(); this.motor.redesenharGrade(); } }
    else if (a.tipo === 'parede') this.aplicarParede(g);
    else if (a.tipo === 'linha' && a.v0) this.desenharLinhaParede(a.v0, g, _ev.shiftKey);
    else if (a.tipo === 'mover' && a.objetoId && a.pos0) {
      const o = this.motor.layout.objetos.find((q) => q.id === a.objetoId)!;
      const r = (n: number): number => Math.round(n * 1000) / 1000; const nx = r(this.encaixar(a.pos0.ox + (g.gx - a.pos0.gx))); const ny = r(this.encaixar(a.pos0.oy + (g.gy - a.pos0.gy)));
      if ((nx !== o.x || ny !== o.y) && this.moverObjeto(a.objetoId, nx, ny)) { a.modificou = true; this.motor.reconstruirObjetos(); this.motor.atualizarSelecao(); this.emitir(); }
    } else if (a.tipo === 'retangulo' && a.origem) this.desenharRetangulo(a.origem, g);
  }

  private finalizar(a: Arrasto, g: { gx: number; gy: number; x: number; y: number }, ev?: PointerEvent): void {
    if (a.tipo === 'linha' && a.v0) { this.motor.fantasma.clear(); this.aplicarLinhaParede(a.v0, g, Boolean(ev?.shiftKey)); return; }
    if (a.tipo === 'retangulo' && a.origem) { this.motor.fantasma.clear(); this.criarDepartamento(a.origem.x, a.origem.y, g.x, g.y); return; }
    if (!a.modificou) return;
    if (a.tipo === 'piso') this.confirmar(); else if (a.tipo === 'parede') this.confirmar(['paredes']); else if (a.tipo === 'colisao') this.confirmar(); else if (a.tipo === 'mover') this.confirmar(['objetos']);
  }

  private desenharLinhaParede(v0: { gx: number; gy: number }, g: { gx: number; gy: number }, retangulo: boolean): void {
    const f = this.motor.fantasma.clear(); const seg = segmentoParede(v0, g, retangulo);
    for (const e of seg) { const a = gridParaTela(e.x, e.y); const b = e.lado === 'N' ? gridParaTela(e.x + 1, e.y) : gridParaTela(e.x, e.y + 1); f.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 5, color: 0xf7c948, alpha: 0.9 }); }
  }
  /** Solta o traçado: cria todas as arestas de uma vez (um único passo no histórico). Sem arrasto, vale a aresta mais próxima do clique. */
  private aplicarLinhaParede(v0: { gx: number; gy: number }, g: { gx: number; gy: number }, retangulo: boolean): void {
    let seg = segmentoParede(v0, g, retangulo);
    if (!seg.length) seg = [arestaMaisProxima(v0.gx, v0.gy)];
    let mudou = false; for (const e of seg) if (this.alternarParede(e.x, e.y, e.lado, 'colocar')) mudou = true;
    if (mudou) { this.motor.reconstruirEstruturas(); this.confirmar(['paredes']); }
  }

  private desenharRetangulo(a: { x: number; y: number }, b: { x: number; y: number }): void {
    const x0 = Math.min(a.x, b.x); const y0 = Math.min(a.y, b.y); const x1 = Math.max(a.x, b.x) + 1; const y1 = Math.max(a.y, b.y) + 1;
    const p = [gridParaTela(x0, y0), gridParaTela(x1, y0), gridParaTela(x1, y1), gridParaTela(x0, y1)];
    this.motor.fantasma.clear().poly(p.flatMap((q) => [q.x, q.y])).fill({ color: 0x8b7bff, alpha: 0.22 }).stroke({ width: 2, color: 0x8b7bff });
  }

  private mostrarFantasma(g: { gx: number; gy: number; x: number; y: number }): void {
    const f = this.motor.fantasma; if (this.arrasto?.tipo === 'linha') return; f.clear();
    if (this.ferramenta !== 'objeto') { this.limparFantasma(); return; }
    const t = this.tipoDe({ tipo: this.tipoObjeto }); if (!t) return; const esc = this.escalaNova;
    const { w, d } = dimensoes(t, this.rot, esc); const { x, y } = this.posicaoSob(g, w, d);
    const v = podeColocar(this.motor.layout, t, x, y, this.rot, this.tipoDe, null, esc); this.motivo = v.motivo;
    const pts = [gridParaTela(x, y), gridParaTela(x + w, y), gridParaTela(x + w, y + d), gridParaTela(x, y + d)];
    f.poly(pts.flatMap((q) => [q.x, q.y])).fill({ color: v.ok ? 0x2fd27a : 0xff4d5e, alpha: 0.3 }).stroke({ width: 2, color: v.ok ? 0x2fd27a : 0xff4d5e });
    if (!this.tipoObjeto.startsWith('asset:')) {
      const z = t.suporte ? t.alturaSuporte ?? 0 : 0; const sp = this.motor.pacote.pronto && t.sprite ? this.motor.pacote.objeto(t.sprite, Boolean(t.espelhar) !== (this.rot % 2 === 1)) : null;
      const proc = sp ? null : this.motor.texturas.objeto(this.tipoObjeto, this.rot); const tex = sp ? sp.tex : proc!.tex;
      if (!this.fantasmaSprite) { this.fantasmaSprite = new Sprite(tex); this.motor.interativo.addChild(this.fantasmaSprite); }
      const chave = `${this.tipoObjeto}|${this.rot}|${esc}`; if (chave !== this.fantasmaChave) { this.fantasmaSprite.texture = tex; this.fantasmaChave = chave; }
      if (sp) { const base = gridParaTela(x + w, y + d); this.fantasmaSprite.scale.set(ESCALA_ARTE * esc); this.fantasmaSprite.position.set(base.x - sp.ax * ESCALA_ARTE * esc, base.y - sp.ay * ESCALA_ARTE * esc - z - (t.parede ?? 0) * esc); }
      else { const top = gridParaTela(x, y); this.fantasmaSprite.scale.set(esc); this.fantasmaSprite.position.set(top.x - proc!.ox * esc, top.y - proc!.oy * esc - z); }
      this.fantasmaSprite.alpha = v.ok ? 0.75 : 0.35; this.fantasmaSprite.visible = true;
    }
    this.emitir();
  }
  private limparFantasma(): void { if (this.fantasmaSprite) this.fantasmaSprite.visible = false; this.fantasmaChave = ''; }

  private tecla(ev: KeyboardEvent): boolean {
    const mod = ev.ctrlKey || ev.metaKey;
    if (mod && ev.key.toLowerCase() === 'z') { if (ev.shiftKey) this.refazer(); else this.desfazer(); return true; }
    if (mod && ev.key.toLowerCase() === 'y') { this.refazer(); return true; }
    if (ev.key.toLowerCase() === 'r') { this.girar(); return true; }
    if (ev.key === 'Delete' || ev.key === 'Backspace') { this.removerSelecionado(); return true; }
    return false;
  }
}
