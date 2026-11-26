// OFFICE ENGINE: o escritório isométrico no PixiJS. Camadas independentes (fundo, pisos, estruturas e móveis/objetos/personagens
// ordenados por profundidade, efeitos, interativos), câmera com zoom e pan, colisões, A*, seleção por clique e personagens animados
// cujo estado vem dos agentes REAIS. Não conhece React; fala com o resto por eventos tipados.
import { Application, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { EventBus } from '../core/eventBus';
import { FixedLoop } from '../core/loop';
import { CameraIso } from './camera';
import { acharCaminho, type Celula } from './caminho';
import { objetoPorTipo, dimensoes, type TipoObjeto } from './catalogo';
import { Grade } from './grade';
import { celulaEm, centroCelula, direcaoDe, gridParaTela, limitesDoMapa, type Direcao } from './iso';
import { dentro, indice, type Layout, type ObjetoLayout, type PersonagemLayout } from './modelo';
import { CAMADA, corpoIso, ordenarIso, type CorpoIso } from './profundidade';
import { ESTADOS_DE_TRABALHO, ESTADOS_SENTADOS, escolherAnimacao, estadoParaAnimacao, quadroEm, type AtividadeSocial, type EstadoAnim, type SheetDef } from './animacoes';
import { Texturas } from './texturas';
import type { AlvoSelecao, Modo, OfficeEventos } from './eventos';
import { ALTURA_PAREDE } from './arte/chao';
import type { PixelImage } from '../assets/pixel';

export interface AgenteInfo { id: string; chave: string; nome: string; cargo: string; departamento: string; estado: string; avatarId?: string | null; tarefaAtual?: string | null; estadoSocial?: AtividadeSocial; desde?: string | null }
export interface AssetInfo { id: string; nome: string; largura: number; altura: number; escala: number; ancora: { x: number; y: number }; colisao: { solida: boolean; larguraTiles: number; profundidadeTiles: number }; camada: string }

export const COR_ESTADO: Record<string, number> = { disponivel: 0x2fd27a, aguardando: 0x94a3b8, planejando: 0xa78bfa, executando: 0x38bdf8, analisando: 0x22d3ee, aguardando_aprovacao: 0xf7c948, concluido: 0x4ade80, com_erro: 0xff4d5e, pausado: 0x64748b };
const VELOCIDADE = 2.6;                                 // tiles por segundo

interface EntObjeto { id: string; o: ObjetoLayout; t: TipoObjeto; sprite: Sprite; corpo: CorpoIso; arte: PixelImage | null; z: number }
interface EntParede { sprite: Sprite; corpo: CorpoIso }
interface EntPessoa {
  id: string; p: PersonagemLayout; agenteId: string | null; x: number; y: number; dir: Direcao; caminho: Celula[]; sprite: Sprite; rotulo: Text; ponto: Graphics;
  sheet: { base: unknown; def: SheetDef } | null; sheetKey: string; noPosto: boolean; corpo: CorpoIso; sentado: boolean; nome: string; indo: 'posto' | 'usuario' | 'assento' | null; reuniao: boolean;
}

export class OfficeEngine {
  readonly bus = new EventBus<OfficeEventos>();
  readonly camera = new CameraIso();
  readonly texturas: Texturas;
  readonly app = new Application();
  layout!: Layout; grade!: Grade;
  modo: Modo = 'execucao';
  agentes = new Map<string, AgenteInfo>();
  assets = new Map<string, AssetInfo>();
  sheetsImportadas = new Map<string, SheetDef>();
  selecionado: AlvoSelecao = { tipo: 'nenhum' };
  /** Ganchos do Office Builder (modos construção e edição). */
  gancho: { aoPonteiro?: (t: 'down' | 'move' | 'up', sx: number, sy: number, ev: PointerEvent) => boolean; aoTecla?: (ev: KeyboardEvent) => boolean } = {};

  private readonly mundo = new Container(); private readonly fundo = new Graphics(); private readonly pisos = new Container(); private readonly sombras = new Container(); private readonly entidades = new Container();
  private readonly efeitos = new Container(); readonly interativo = new Container();
  /** Posição na tela (relativa ao canvas) logo acima da cabeça de cada agente: usada pelas nuvens de diálogo. Atualizada a cada quadro. */
  readonly ancoras = new Map<string, { x: number; y: number }>();
  private readonly hoverG = new Graphics(); private readonly selG = new Graphics(); readonly fantasma = new Graphics(); readonly grade_ = new Graphics();
  private objetos: EntObjeto[] = []; private paredes: EntParede[] = []; private pessoas: EntPessoa[] = [];
  private camadasVisiveis: Record<string, boolean> = {};
  private sujoProfundidade = true; private tempo = 0; private raf = 0; private ultimo = 0; private loop!: FixedLoop; private obs?: ResizeObserver;
  private arrasto: { x: number; y: number; moveu: boolean; botao: number } | null = null; private hoverRotulo: string | null = null; private destruido = false;

  constructor(private readonly host: HTMLElement, token: () => string = () => '') {
    this.texturas = new Texturas(() => { this.reconstruirPessoas(); this.reconstruirObjetos(); }, token);
  }

  async init(): Promise<void> {
    await this.app.init({ resizeTo: this.host, background: '#10142b', antialias: false, roundPixels: true, autoStart: false, preference: 'webgl' });
    this.host.appendChild(this.app.canvas);
    this.app.canvas.style.touchAction = 'none';
    this.entidades.sortableChildren = true;
    this.mundo.addChild(this.fundo, this.pisos, this.sombras, this.entidades, this.efeitos, this.interativo);
    this.interativo.addChild(this.grade_, this.hoverG, this.selG, this.fantasma);
    this.app.stage.addChild(this.mundo);
    this.camera.setViewport(this.app.screen.width, this.app.screen.height);
    this.ligarEntrada();
    this.obs = new ResizeObserver(() => { this.camera.setViewport(this.app.screen.width, this.app.screen.height); this.bus.emit('camera', { zoom: this.camera.zoom }); });
    this.obs.observe(this.host);
    this.loop = new FixedLoop((dt) => this.atualizar(dt), () => this.desenhar());
    this.ultimo = performance.now();
    this.raf = requestAnimationFrame(this.quadro);
  }

  // ---------- carregar e reconstruir ----------
  carregarLayout(l: Layout, { recentrar = true } = {}): void {
    this.layout = l;
    this.grade = new Grade(l, (o) => this.tipoDe(o));
    this.camera.setLimites(limitesDoMapa(l.largura, l.altura));
    this.reconstruirTudo();
    if (recentrar) this.camera.ajustar();
    this.bus.emit('camera', { zoom: this.camera.zoom });
  }
  /** Tipo de um objeto do layout: do catálogo, ou de um asset importado (asset:<id>). */
  tipoDe(o: ObjetoLayout): TipoObjeto | undefined {
    if (!o.tipo.startsWith('asset:')) return objetoPorTipo(o.tipo);
    const a = this.assets.get(o.tipo.slice(6)); if (!a) return undefined;
    return { tipo: o.tipo, nome: a.nome, categoria: 'decoracao', largura: a.colisao.larguraTiles, profundidade: a.colisao.profundidadeTiles, altura: Math.round(a.altura * a.escala), solido: a.colisao.solida };
  }
  recalcularGrade(): void { this.grade = new Grade(this.layout, (o) => this.tipoDe(o)); this.reorientarCaminhos(); }
  private reorientarCaminhos(): void { for (const p of this.pessoas) if (p.caminho.length && p.caminho.some((c) => !this.grade.livre(c.x, c.y))) p.caminho = []; }

  reconstruirTudo(): void { this.reconstruirChao(); this.reconstruirEstruturas(); this.reconstruirObjetos(); this.reconstruirPessoas(); this.desenharEfeitos(); this.desenharFundo(); }

  private desenharFundo(): void {
    const l = limitesDoMapa(this.layout.largura, this.layout.altura, 600);
    this.fundo.clear().rect(l.x0, l.y0, l.x1 - l.x0, l.y1 - l.y0).fill(0x10142b);
  }

  // PISO: é um mapa de tiles estático, então é assado numa textura OPACA (sem blending: o custo de preenchimento cai muito).
  // Móveis, paredes e personagens continuam entidades independentes. Mapas gigantes (textura > 4096 px) usam pedaços de 8×8.
  private static readonly PEDACO = 8;
  private static readonly FUNDO = '#10142b';
  private pedacos = new Map<string, Sprite>();
  private pisoUnico: { canvas: HTMLCanvasElement; g: CanvasRenderingContext2D; sprite: Sprite; x0: number; y0: number; sujo: boolean } | null = null;

  reconstruirChao(): void {
    for (const s of this.pedacos.values()) s.destroy({ texture: true, textureSource: true }); this.pedacos.clear();
    if (this.pisoUnico) { this.pisoUnico.sprite.destroy({ texture: true, textureSource: true }); this.pisoUnico = null; }
    this.pisos.removeChildren();
    const L = this.layout; const larg = (L.largura + L.altura) * 32; const alt = (L.largura + L.altura) * 16;
    if (larg <= 4096 && alt <= 4096) {
      const canvas = document.createElement('canvas'); canvas.width = larg; canvas.height = alt; const g = canvas.getContext('2d')!;
      const x0 = -L.altura * 32; const y0 = 0;
      g.fillStyle = OfficeEngine.FUNDO; g.fillRect(0, 0, larg, alt);
      const tex = Texture.from(canvas); tex.source.scaleMode = 'nearest';
      const sprite = new Sprite(tex); sprite.position.set(x0, y0); sprite.blendMode = 'none'; this.pisos.addChild(sprite);
      this.pisoUnico = { canvas, g, sprite, x0, y0, sujo: true };
      for (let y = 0; y < L.altura; y++) for (let x = 0; x < L.largura; x++) this.pintarTilePiso(x, y);
    } else {
      const P = OfficeEngine.PEDACO;
      for (let cy = 0; cy * P < L.altura; cy++) for (let cx = 0; cx * P < L.largura; cx++) this.montarPedaco(cx, cy);
    }
    this.pisos.visible = this.camadasVisiveis.piso !== false;
  }
  private pintarTilePiso(x: number, y: number): void {
    const u = this.pisoUnico; if (!u) return; const p = gridParaTela(x, y); const px = p.x - u.x0; const py = p.y - u.y0;
    u.g.fillStyle = OfficeEngine.FUNDO; u.g.beginPath(); u.g.moveTo(px, py); u.g.lineTo(px + 32, py + 16); u.g.lineTo(px, py + 32); u.g.lineTo(px - 32, py + 16); u.g.closePath(); u.g.fill();
    const tipo = this.layout.piso[indice(this.layout, x, y)]; if (tipo) u.g.drawImage(this.texturas.canvasPiso(tipo), px - 32, py);
    u.sujo = true;
  }
  private montarPedaco(cx: number, cy: number): void {
    const L = this.layout; const P = OfficeEngine.PEDACO; const chave = `${cx},${cy}`;
    const antigo = this.pedacos.get(chave); if (antigo) { antigo.destroy({ texture: true, textureSource: true }); this.pedacos.delete(chave); }
    const tiles: { x: number; y: number; tipo: string }[] = [];
    for (let y = cy * P; y < Math.min(L.altura, (cy + 1) * P); y++) for (let x = cx * P; x < Math.min(L.largura, (cx + 1) * P); x++) { const tipo = L.piso[indice(L, x, y)]; if (tipo) tiles.push({ x, y, tipo }); }
    if (!tiles.length) return;
    let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
    for (const t of tiles) { const p = gridParaTela(t.x, t.y); x0 = Math.min(x0, p.x - 32); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x + 32); y1 = Math.max(y1, p.y + 32); }
    const canvas = document.createElement('canvas'); canvas.width = x1 - x0; canvas.height = y1 - y0; const g = canvas.getContext('2d')!;
    for (const t of tiles) { const p = gridParaTela(t.x, t.y); g.drawImage(this.texturas.canvasPiso(t.tipo), p.x - 32 - x0, p.y - y0); }
    const tex = Texture.from(canvas); tex.source.scaleMode = 'nearest';
    const s = new Sprite(tex); s.position.set(x0, y0); this.pisos.addChild(s); this.pedacos.set(chave, s);
  }
  /** Troca só um tile de piso (pintura em arrasto): redesenha o tile na textura (ou reconstrói o pedaço, em mapas gigantes). */
  atualizarPiso(x: number, y: number): void { if (this.pisoUnico) this.pintarTilePiso(x, y); else { const P = OfficeEngine.PEDACO; this.montarPedaco(Math.floor(x / P), Math.floor(y / P)); } }

  reconstruirEstruturas(): void {
    for (const w of this.paredes) w.sprite.destroy(); this.paredes = [];
    for (const w of this.layout.paredes) {
      const t = this.texturas.parede(w.lado, w.tipo ?? 'parede', w.abertura ?? null); const s = new Sprite(t.tex); const p = gridParaTela(w.x, w.y);
      s.position.set(p.x - t.ox, p.y - t.oy);
      // a parede é uma caixa fina sobre a aresta: N em y (de x a x+1), W em x (de y a y+1)
      const corpo = w.lado === 'N' ? corpoIso(`w:${w.x},${w.y},N`, w.x, w.y - 0.04, 1, 0.08, ALTURA_PAREDE, CAMADA.parede) : corpoIso(`w:${w.x},${w.y},W`, w.x - 0.04, w.y, 0.08, 1, ALTURA_PAREDE, CAMADA.parede);
      this.entidades.addChild(s); this.paredes.push({ sprite: s, corpo });
    }
    this.sujoProfundidade = true; this.aplicarVisibilidade();
  }

  reconstruirObjetos(): void {
    for (const o of this.objetos) o.sprite.destroy(); this.objetos = [];
    for (const o of this.layout.objetos) {
      const t = this.tipoDe(o); if (!t) continue;
      const { w, d } = dimensoes(t, o.rot ?? 0);
      const z = t.suporte ? (this.layout.objetos.some((m) => m.tipo === t.suporte || (objetoPorTipo(m.tipo)?.categoria === 'moveis' && o.x >= m.x && o.x < m.x + dimensoes(objetoPorTipo(m.tipo)!, m.rot ?? 0).w && o.y >= m.y && o.y < m.y + dimensoes(objetoPorTipo(m.tipo)!, m.rot ?? 0).d && m.tipo.startsWith('mesa'))) ? (t.alturaSuporte ?? 0) : 0) : 0;
      let sprite: Sprite; let arte: PixelImage | null = null;
      if (o.tipo.startsWith('asset:')) {
        const tex = this.texturas.externa(o.tipo.slice(6)); const a = this.assets.get(o.tipo.slice(6));
        sprite = new Sprite(tex ?? undefined); if (!tex) sprite.alpha = 0.35;
        sprite.anchor.set(a?.ancora.x ?? 0.5, a?.ancora.y ?? 1); sprite.scale.set(a?.escala ?? 1);
        const base = gridParaTela(o.x + w, o.y + d); sprite.position.set(base.x, base.y - z);
      } else {
        const tex = this.texturas.objeto(o.tipo, o.rot ?? 0); sprite = new Sprite(tex.tex); arte = tex.arte.img;
        const top = gridParaTela(o.x, o.y); sprite.position.set(top.x - tex.ox, top.y - tex.oy - z);
      }
      const camada = t.categoria === 'computadores' || t.categoria === 'equipamentos' ? CAMADA.objeto : CAMADA.mobiliario;
      const corpo = corpoIso(`o:${o.id}`, o.x, o.y, w, d, t.altura + z, t.tipo === 'tapete' ? CAMADA.piso : camada);
      if (z > 0) corpo.vies = 500;                                   // objeto sobre uma mesa: sempre depois dela (desenho e clique)
      this.entidades.addChild(sprite); this.objetos.push({ id: o.id, o, t, sprite, corpo, arte, z });
    }
    this.sujoProfundidade = true; this.aplicarVisibilidade();
  }

  private reconstruirPessoas(): void {
    for (const p of this.pessoas) { p.sprite.destroy(); p.rotulo.destroy(); p.ponto.destroy(); }
    const anteriores = new Map(this.pessoas.map((p) => [p.id, p])); this.pessoas = [];
    for (const p of this.layout.personagens) {
      const ant = anteriores.get(p.id);
      const sprite = new Sprite(); sprite.anchor.set(0.5, 1);
      const rotulo = new Text({ text: '', style: { fontFamily: 'sans-serif', fontSize: 11, fontWeight: '700', fill: 0xffffff, stroke: { color: 0x10142b, width: 3 } } }); rotulo.anchor.set(0.5, 1); rotulo.resolution = 2;
      const ponto = new Graphics();
      this.entidades.addChild(sprite); this.efeitos.addChild(rotulo); this.efeitos.addChild(ponto);
      const ag = p.agenteId ? this.agentes.get(p.agenteId) : null;
      this.pessoas.push({ id: p.id, p, agenteId: p.agenteId ?? null, x: ant?.x ?? p.x + 0.5, y: ant?.y ?? p.y + 0.5, dir: ant?.dir ?? p.dir ?? 'SE', caminho: ant?.caminho ?? [], sprite, rotulo, ponto, sheet: null, sheetKey: '', noPosto: ant?.noPosto ?? false, corpo: corpoIso(`p:${p.id}`, 0, 0, 0.2, 0.2, 44, CAMADA.personagem), sentado: false, nome: ag?.nome ?? p.id, indo: ant?.indo ?? null, reuniao: ant?.reuniao ?? false });
    }
    this.sujoProfundidade = true; this.aplicarVisibilidade();
  }

  /** Sombras suaves dos móveis: ficam entre o piso e os objetos (nunca por cima de paredes ou móveis). */
  private desenharEfeitos(): void {
    for (const c of [...this.sombras.children]) c.destroy();
    const g = new Graphics();
    for (const o of this.layout.objetos) {
      const t = this.tipoDe(o); if (!t || !t.solido || t.altura < 20) continue;
      const { w, d } = dimensoes(t, o.rot ?? 0); const a = gridParaTela(o.x + 0.1, o.y + 0.1); const b = gridParaTela(o.x + w + 0.35, o.y + 0.1); const c = gridParaTela(o.x + w + 0.35, o.y + d + 0.35); const e = gridParaTela(o.x + 0.1, o.y + d + 0.35);
      g.poly([a.x, a.y, b.x, b.y, c.x, c.y, e.x, e.y]).fill({ color: 0x000000, alpha: 0.13 });
    }
    this.sombras.addChild(g); this.sombras.visible = this.camadasVisiveis.efeito !== false;
  }

  // ---------- agentes e personagens ----------
  setAgentes(lista: AgenteInfo[], sheets: SheetDef[] = []): void {
    this.agentes = new Map(lista.map((a) => [a.id, a])); this.sheetsImportadas = new Map(sheets.map((s) => [s.id, s]));
    // reunião REAL: só quando a ordem do chefe tem uma discussão coletiva em andamento (o servidor marca os participantes)
    const emReuniao = lista.filter((a) => a.estadoSocial === 'reunido').length >= 2;
    for (const p of this.pessoas) {
      const ag = p.agenteId ? this.agentes.get(p.agenteId) : null; if (!ag) continue;
      p.nome = ag.nome;
      const participa = emReuniao && (ag.estadoSocial === 'reunido' || ag.estadoSocial === 'conversando');
      if (participa) { if (!p.reuniao) { p.reuniao = true; this.irAoAssento(p); } }
      else if (p.reuniao) { p.reuniao = false; if (p.indo === 'assento') p.indo = null; p.caminho = []; this.irAoPosto(p, true); }       // a reunião acabou: volta ao posto
      else if (ESTADOS_DE_TRABALHO.includes(ag.estado) && !p.noPosto && p.indo !== 'posto') this.irAoPosto(p);
    }
  }
  private estacaoDe(agenteId: string | null) { return agenteId ? this.layout.estacoes.find((e) => e.agenteId === agenteId && e.pontoTrabalho && e.ferramenta !== 'assento') ?? null : null; }
  private assentoDe(agenteId: string | null) { return agenteId ? this.layout.estacoes.find((e) => e.agenteId === agenteId && e.pontoTrabalho && e.ferramenta === 'assento') ?? null : null; }
  private irAoAssento(p: EntPessoa): void {
    const e = this.assentoDe(p.agenteId); if (!e?.pontoTrabalho) return; const alvo = e.pontoTrabalho; const origem = { x: Math.floor(p.x), y: Math.floor(p.y) };
    p.noPosto = false;
    if (origem.x === alvo.x && origem.y === alvo.y) { this.chegouAoAssento(p); return; }
    const rota = acharCaminho(this.grade, origem, alvo, { aproximar: true }); if (rota && rota.length) { p.caminho = rota; p.indo = 'assento'; } else this.chegouAoAssento(p);
  }
  private chegouAoAssento(p: EntPessoa): void {
    p.indo = null; p.x = Math.floor(p.x) + 0.5; p.y = Math.floor(p.y) + 0.5;
    const mesa = this.layout.objetos.find((o) => o.tipo === 'mesa-reuniao'); if (mesa) { const t = objetoPorTipo('mesa-reuniao')!; const cx = mesa.x + t.largura / 2; const cy = mesa.y + t.profundidade / 2; p.dir = direcaoDe(Math.sign(cx - p.x) * (Math.abs(cx - p.x) > 0.6 ? 1 : 0), Math.sign(cy - p.y) * (Math.abs(cy - p.y) > 0.6 ? 1 : 0), p.dir); }
  }
  private irAoPosto(p: EntPessoa, forcar = false): void {
    const e = this.estacaoDe(p.agenteId); if (!e?.pontoTrabalho) return; void forcar;
    const origem = { x: Math.floor(p.x), y: Math.floor(p.y) }; const alvo = e.pontoTrabalho;
    if (origem.x === alvo.x && origem.y === alvo.y) { this.chegouAoPosto(p); return; }
    const rota = acharCaminho(this.grade, origem, alvo, { aproximar: true });
    if (rota && rota.length) { p.caminho = rota; p.indo = 'posto'; p.noPosto = false; } else if (rota) this.chegouAoPosto(p);
  }
  private chegouAoPosto(p: EntPessoa): void {
    p.noPosto = true; p.indo = null; p.x = Math.floor(p.x) + 0.5; p.y = Math.floor(p.y) + 0.5;
    const e = this.estacaoDe(p.agenteId); const obj = e ? this.layout.objetos.find((o) => o.id === e.objetoId) : null;
    if (obj) p.dir = direcaoDe(Math.sign(obj.x - Math.floor(p.x)), Math.sign(obj.y - Math.floor(p.y)), p.dir);   // de frente para a mesa
  }
  /** Manda um personagem andar até uma célula (clique do usuário). Devolve false se não houver caminho. */
  irPara(personagemId: string, destino: Celula): boolean {
    const p = this.pessoas.find((x) => x.id === personagemId); if (!p) return false;
    const rota = acharCaminho(this.grade, { x: Math.floor(p.x), y: Math.floor(p.y) }, destino, { aproximar: true });
    if (!rota) { this.bus.emit('aviso', { texto: 'Não há caminho até lá (paredes ou móveis bloqueiam).' }); return false; }
    p.caminho = rota; p.indo = 'usuario'; p.noPosto = false; return true;
  }
  posicaoDe(personagemId: string): Celula | null { const p = this.pessoas.find((x) => x.id === personagemId); return p ? { x: Math.floor(p.x), y: Math.floor(p.y) } : null; }
  listaPessoas(): { id: string; x: number; y: number; dir: Direcao; agenteId: string | null }[] { return this.pessoas.map((p) => ({ id: p.id, x: Math.floor(p.x), y: Math.floor(p.y), dir: p.dir, agenteId: p.agenteId })); }
  /** Posições atuais para salvar no layout. */
  exportarPersonagens(): PersonagemLayout[] { return this.pessoas.map((p) => ({ ...p.p, x: Math.min(this.layout.largura - 1, Math.floor(p.x)), y: Math.min(this.layout.altura - 1, Math.floor(p.y)), dir: p.dir })); }

  // ---------- modos, camadas, seleção ----------
  setModo(m: Modo): void { this.modo = m; this.selecionar({ tipo: 'nenhum' }); this.grade_.visible = m === 'construcao' || m === 'edicao'; this.bus.emit('modo', m); this.redesenharGrade(); }
  setCamadaVisivel(nome: string, v: boolean): void { this.camadasVisiveis[nome] = v; this.aplicarVisibilidade(); }
  camadas(): Record<string, boolean> { return { ...this.camadasVisiveis }; }
  private aplicarVisibilidade(): void {
    const v = (n: string): boolean => this.camadasVisiveis[n] !== false;
    this.pisos.visible = v('piso');
    for (const w of this.paredes) w.sprite.visible = v('parede');
    for (const o of this.objetos) o.sprite.visible = o.t.tipo === 'tapete' ? v('piso') : (o.t.categoria === 'computadores' || o.t.categoria === 'equipamentos') ? v('objeto') : v('mobiliario');
    for (const p of this.pessoas) { p.sprite.visible = v('personagem'); p.rotulo.visible = v('personagem'); p.ponto.visible = v('personagem'); }
    this.efeitos.visible = v('efeito'); this.sombras.visible = v('efeito');
  }
  selecionar(a: AlvoSelecao): void { this.selecionado = a; this.bus.emit('selecionar', a); this.sujoSelecao = true; }
  private sujoSelecao = true;
  marcarProfundidadeSuja(): void { this.sujoProfundidade = true; }

  redesenharGrade(): void {
    this.grade_.clear(); if (!(this.modo === 'construcao' || this.modo === 'edicao')) return;
    const L = this.layout;
    for (let y = 0; y < L.altura; y++) for (let x = 0; x < L.largura; x++) {
      const a = gridParaTela(x, y); const b = gridParaTela(x + 1, y); const c = gridParaTela(x + 1, y + 1); const d = gridParaTela(x, y + 1);
      this.grade_.poly([a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y]).stroke({ width: 1, color: 0xffffff, alpha: L.piso[indice(L, x, y)] ? 0.14 : 0.05 });
      if (!this.grade.livre(x, y) && L.piso[indice(L, x, y)]) this.grade_.poly([a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y]).fill({ color: 0xff4d5e, alpha: 0.12 });
    }
  }

  // ---------- escolha por clique ----------
  /** O que está sob o ponto da tela? Personagens primeiro, depois objetos (com teste de transparência), depois a célula do chão. */
  escolher(sx: number, sy: number): AlvoSelecao & { departamentoId?: string } {
    const m = this.camera.telaParaMundo(sx, sy);
    for (const p of [...this.pessoas].reverse()) {
      const t = gridParaTela(p.x, p.y);
      if (m.x >= t.x - 12 && m.x <= t.x + 12 && m.y >= t.y - 46 && m.y <= t.y + 2) return { tipo: 'personagem', id: p.id, agenteId: p.agenteId };
    }
    const ordem = [...this.objetos].sort((a, b) => b.sprite.zIndex - a.sprite.zIndex);
    for (const o of ordem) {
      if (!o.sprite.visible || o.t.tipo === 'tapete') continue;
      const lx = Math.floor((m.x - o.sprite.x) / (o.sprite.scale.x || 1)); const ly = Math.floor((m.y - o.sprite.y) / (o.sprite.scale.y || 1));
      if (o.arte) { if (o.arte.get(lx, ly) !== null) return { tipo: 'objeto', id: o.id, tipoObjeto: o.o.tipo }; }
      else { const w = o.sprite.width; const h = o.sprite.height; if (m.x >= o.sprite.x - w * o.sprite.anchor.x && m.x <= o.sprite.x + w * (1 - o.sprite.anchor.x) && m.y >= o.sprite.y - h * o.sprite.anchor.y && m.y <= o.sprite.y + h * (1 - o.sprite.anchor.y)) return { tipo: 'objeto', id: o.id, tipoObjeto: o.o.tipo }; }
    }
    const c = celulaEm(m.x, m.y);
    const dep = dentro(this.layout, c.x, c.y) ? this.layout.departamentos.find((d) => c.x >= d.x && c.x < d.x + d.w && c.y >= d.y && c.y < d.y + d.h) : null;
    if (dep) return { tipo: 'departamento', id: dep.id, chave: dep.chave, departamentoId: dep.id };
    return { tipo: 'celula', x: c.x, y: c.y };
  }
  celulaSob(sx: number, sy: number): Celula { const m = this.camera.telaParaMundo(sx, sy); return celulaEm(m.x, m.y); }

  private clique(sx: number, sy: number): void {
    if (this.modo === 'visualizacao') return;
    const a = this.escolher(sx, sy);
    if (a.tipo === 'celula' || a.tipo === 'departamento') {
      // com um personagem selecionado, o clique no chão manda ele andar até lá
      if (this.selecionado.tipo === 'personagem') { const c = a.tipo === 'celula' ? { x: a.x, y: a.y } : this.celulaSob(sx, sy); if (dentro(this.layout, c.x, c.y)) { this.irPara(this.selecionado.id, c); return; } }
      this.selecionar(a); return;
    }
    if (a.tipo === 'objeto') {
      const ob = this.objetos.find((o) => o.id === a.id)!; const est = this.layout.estacoes.find((e) => e.objetoId === ob.id);
      const acaoPadrao = ob.t.acao;
      if (est || acaoPadrao) {
        const alvo = est?.ferramenta ?? acaoPadrao!.alvo; const ag = est?.agenteId ?? null;
        this.selecionar(a);
        this.bus.emit('acao', { alvo, objetoId: ob.id, estacaoId: est?.id ?? null, agenteId: ag, rotulo: est?.rotulo ?? acaoPadrao?.rotulo ?? ob.t.nome });
        return;
      }
    }
    this.selecionar(a);
  }

  // ---------- entrada ----------
  private ligarEntrada(): void {
    const c = this.app.canvas;
    const pos = (e: PointerEvent): { x: number; y: number } => { const r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    c.addEventListener('pointerdown', (e) => {
      const p = pos(e); c.setPointerCapture(e.pointerId);
      if (this.gancho.aoPonteiro?.('down', p.x, p.y, e) && e.button === 0) { this.arrasto = { x: p.x, y: p.y, moveu: true, botao: -1 }; return; }
      this.arrasto = { x: p.x, y: p.y, moveu: false, botao: e.button };
    });
    c.addEventListener('pointermove', (e) => {
      const p = pos(e);
      if (this.arrasto && this.arrasto.botao === -1) { this.gancho.aoPonteiro?.('move', p.x, p.y, e); return; }
      if (this.arrasto) {
        const dx = p.x - this.arrasto.x; const dy = p.y - this.arrasto.y;
        if (!this.arrasto.moveu && Math.hypot(dx, dy) > 4) this.arrasto.moveu = true;
        if (this.arrasto.moveu) { this.camera.arrastar(dx, dy); this.arrasto.x = p.x; this.arrasto.y = p.y; }
      } else { this.gancho.aoPonteiro?.('move', p.x, p.y, e); this.atualizarHover(p.x, p.y); }
    });
    const soltar = (e: PointerEvent): void => {
      const p = pos(e); const a = this.arrasto; this.arrasto = null;
      if (!a) return;
      if (a.botao === -1) { this.gancho.aoPonteiro?.('up', p.x, p.y, e); return; }
      if (!a.moveu && a.botao === 0) { if ((this.modo === 'construcao' || this.modo === 'edicao') && this.gancho.aoPonteiro?.('up', p.x, p.y, e)) return; this.clique(p.x, p.y); }
    };
    c.addEventListener('pointerup', soltar); c.addEventListener('pointercancel', () => { this.arrasto = null; });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('wheel', (e) => { e.preventDefault(); const r = c.getBoundingClientRect(); this.camera.zoomPasso(e.deltaY < 0 ? 1 : -1, e.clientX - r.left, e.clientY - r.top); this.bus.emit('camera', { zoom: this.camera.zoom }); }, { passive: false });
    window.addEventListener('keydown', this.tecla);
  }
  private tecla = (e: KeyboardEvent): void => {
    if (/input|textarea|select/i.test((e.target as HTMLElement)?.tagName ?? '')) return;
    if (this.gancho.aoTecla?.(e)) return;
    if (e.key === '+' || e.key === '=') { this.camera.zoomPasso(1); this.bus.emit('camera', { zoom: this.camera.zoom }); }
    else if (e.key === '-') { this.camera.zoomPasso(-1); this.bus.emit('camera', { zoom: this.camera.zoom }); }
    else if (e.key === 'Escape') this.selecionar({ tipo: 'nenhum' });
    else if (e.key === 'ArrowLeft') this.camera.arrastar(60, 0); else if (e.key === 'ArrowRight') this.camera.arrastar(-60, 0);
    else if (e.key === 'ArrowUp') this.camera.arrastar(0, 60); else if (e.key === 'ArrowDown') this.camera.arrastar(0, -60);
  };
  private atualizarHover(sx: number, sy: number): void {
    if (this.modo === 'visualizacao') { this.hoverG.clear(); return; }
    const a = this.escolher(sx, sy); let rotulo: string | null = null;
    this.hoverG.clear();
    if (a.tipo === 'objeto') { const ob = this.objetos.find((o) => o.id === a.id)!; const est = this.layout.estacoes.find((e) => e.objetoId === ob.id); rotulo = est?.rotulo ?? ob.t.acao?.rotulo ?? ob.t.nome; this.contorno(ob); }
    else if (a.tipo === 'personagem') rotulo = this.agentes.get(a.agenteId ?? '')?.nome ?? 'Funcionário';
    else if (a.tipo === 'celula' || a.tipo === 'departamento') { const c = this.celulaSob(sx, sy); if (dentro(this.layout, c.x, c.y) && this.layout.piso[indice(this.layout, c.x, c.y)]) { const p = [gridParaTela(c.x, c.y), gridParaTela(c.x + 1, c.y), gridParaTela(c.x + 1, c.y + 1), gridParaTela(c.x, c.y + 1)]; this.hoverG.poly(p.flatMap((q) => [q.x, q.y])).fill({ color: 0xffffff, alpha: 0.12 }).stroke({ width: 1, color: 0xffffff, alpha: 0.5 }); } }
    this.app.canvas.style.cursor = a.tipo === 'objeto' || a.tipo === 'personagem' ? 'pointer' : 'default';
    if (rotulo !== this.hoverRotulo) { this.hoverRotulo = rotulo; this.bus.emit('hover', { rotulo }); }
  }
  private contorno(o: EntObjeto): void {
    const { w, d } = dimensoes(o.t, o.o.rot ?? 0); const pts = [gridParaTela(o.o.x, o.o.y), gridParaTela(o.o.x + w, o.o.y), gridParaTela(o.o.x + w, o.o.y + d), gridParaTela(o.o.x, o.o.y + d)];
    this.hoverG.poly(pts.flatMap((q) => [q.x, q.y])).stroke({ width: 2, color: 0x7dd3fc, alpha: 0.95 });
  }

  // ---------- loop ----------
  private quadro = (agora: number): void => {
    if (this.destruido) return;
    const dt = agora - this.ultimo; this.ultimo = agora; this.loop.advance(dt);
    this.raf = requestAnimationFrame(this.quadro);
  };

  private atualizar(dt: number): void {
    this.tempo += dt;
    for (const p of this.pessoas) {
      if (!p.caminho.length) continue;
      const alvo = p.caminho[0]; const tx = alvo.x + 0.5; const ty = alvo.y + 0.5; const dx = tx - p.x; const dy = ty - p.y; const dist = Math.hypot(dx, dy);
      const vel = VELOCIDADE * (this.sheetDe(p)?.def.velocidade ?? 1) * dt;
      p.dir = direcaoDe(Math.round(Math.sign(dx) * (Math.abs(dx) > 0.01 ? 1 : 0)), Math.round(Math.sign(dy) * (Math.abs(dy) > 0.01 ? 1 : 0)), p.dir);
      if (dist <= vel) { p.x = tx; p.y = ty; p.caminho.shift(); if (!p.caminho.length) { if (p.indo === 'posto') this.chegouAoPosto(p); else if (p.indo === 'assento') this.chegouAoAssento(p); else p.indo = null; } }
      else { p.x += (dx / dist) * vel; p.y += (dy / dist) * vel; }
      this.sujoProfundidade = true;
    }
  }

  private sheetDe(p: EntPessoa): { base: unknown; def: SheetDef } | null {
    const ag = p.agenteId ? this.agentes.get(p.agenteId) : null;
    const personagemId = p.p.personagemId ?? ag?.avatarId ?? null; const def = personagemId ? this.sheetsImportadas.get(personagemId) : null;
    const chave = def ? `imp:${def.id}:${def.assetId}` : `proc:${ag?.chave ?? p.id}`;
    if (p.sheetKey === chave && p.sheet) return p.sheet;
    const s = def ? this.texturas.sheetImportada(def) : this.texturas.sheetProcedural(ag?.chave ?? p.id.replace('pers-', ''));
    if (s) { p.sheet = s; p.sheetKey = chave; }
    return p.sheet ?? (this.texturas.sheetProcedural(ag?.chave ?? 'padrao'));
  }

  private estadoAnimacao(p: EntPessoa): EstadoAnim {
    const ag = p.agenteId ? this.agentes.get(p.agenteId) : null; const movendo = p.caminho.length > 0; const social = ag?.estadoSocial ?? null;
    const sentadoAgora = !movendo && this.naCadeira(p);
    const ocioso = ag?.desde ? Math.max(0, Date.now() - Date.parse(ag.desde)) : 0;
    const base = estadoParaAnimacao(ag?.estado ?? 'disponivel', { noPosto: p.noPosto, movendo, social, naReuniao: sentadoAgora && (social === 'conversando' || social === 'reunido'), ociosoMs: sentadoAgora ? ocioso : 0 });
    if (base === 'idle' && sentadoAgora) return 'sitting';
    return base;
  }
  private naCadeira(p: EntPessoa): boolean { const cx = Math.floor(p.x); const cy = Math.floor(p.y); return this.objetos.some((o) => o.t.sentavel && o.o.x === cx && o.o.y === cy); }

  private desenhar(): void {
    if (this.pisoUnico?.sujo) { this.pisoUnico.sujo = false; this.pisoUnico.sprite.texture.source.update(); }
    const off = this.camera.zoom;
    this.mundo.scale.set(off); this.mundo.position.set(Math.round(this.camera.viewW / 2 - this.camera.x * off), Math.round(this.camera.viewH / 2 - this.camera.y * off));
    for (const p of this.pessoas) {
      const ag = p.agenteId ? this.agentes.get(p.agenteId) : null; const estado = this.estadoAnimacao(p); const s = this.sheetDe(p);
      if (s) {
        const anim = escolherAnimacao(s.def, estado, p.dir);
        if (anim) { p.sprite.texture = this.texturas.quadro(s as never, anim.linha, quadroEm(anim, this.tempo)); p.sprite.scale.set(s.def.escala); p.sprite.anchor.set(s.def.ancora.x, s.def.ancora.y); }
      }
      p.sentado = ESTADOS_SENTADOS.includes(estado);
      const t = gridParaTela(p.x, p.y, p.sentado ? 8 : 0); p.sprite.position.set(Math.round(t.x), Math.round(t.y));
      p.rotulo.text = p.nome; p.rotulo.position.set(Math.round(t.x), Math.round(t.y) - 52 * (p.sprite.scale.y || 1));
      if (p.agenteId) this.ancoras.set(p.agenteId, { x: Math.round(t.x) * off + this.mundo.position.x, y: (Math.round(t.y) - 52 * (p.sprite.scale.y || 1) - 22) * off + this.mundo.position.y });
      const cor = COR_ESTADO[ag?.estado ?? 'disponivel'] ?? 0x2fd27a; p.ponto.clear().circle(Math.round(t.x), Math.round(t.y) - 52 * (p.sprite.scale.y || 1) - 18, 4).fill(cor).stroke({ width: 1.5, color: 0x10142b });
      const grade = { x: p.x, y: p.y };
      p.corpo = corpoIso(`p:${p.id}`, grade.x - 0.12, grade.y - 0.12, 0.24, 0.24, 44, CAMADA.personagem);
      if (p.sentado) p.corpo.vies = 400;
    }
    if (this.sujoProfundidade) this.reordenar();
    if (this.sujoSelecao) this.desenharSelecao();
    this.app.render();
  }

  private reordenar(): void {
    const todos: { c: CorpoIso; s: Sprite }[] = [];
    for (const w of this.paredes) todos.push({ c: w.corpo, s: w.sprite }); for (const o of this.objetos) todos.push({ c: o.corpo, s: o.sprite }); for (const p of this.pessoas) todos.push({ c: p.corpo, s: p.sprite });
    const mapa = new Map(todos.map((t) => [t.c.id, t])); const ordem = ordenarIso(todos.map((t) => t.c));
    ordem.forEach((c, i) => { mapa.get(c.id)!.s.zIndex = i; });
    this.sujoProfundidade = false;
  }

  private desenharSelecao(): void {
    this.selG.clear(); this.sujoSelecao = false; const a = this.selecionado;
    if (a.tipo === 'objeto') { const o = this.objetos.find((x) => x.id === a.id); if (o) { const { w, d } = dimensoes(o.t, o.o.rot ?? 0); const pts = [gridParaTela(o.o.x, o.o.y), gridParaTela(o.o.x + w, o.o.y), gridParaTela(o.o.x + w, o.o.y + d), gridParaTela(o.o.x, o.o.y + d)]; this.selG.poly(pts.flatMap((q) => [q.x, q.y])).fill({ color: 0xf7c948, alpha: 0.18 }).stroke({ width: 2, color: 0xf7c948 }); } }
    else if (a.tipo === 'departamento') { const dp = this.layout.departamentos.find((x) => x.id === a.id); if (dp) { const pts = [gridParaTela(dp.x, dp.y), gridParaTela(dp.x + dp.w, dp.y), gridParaTela(dp.x + dp.w, dp.y + dp.h), gridParaTela(dp.x, dp.y + dp.h)]; this.selG.poly(pts.flatMap((q) => [q.x, q.y])).fill({ color: 0xffffff, alpha: 0.05 }).stroke({ width: 2, color: Number.parseInt((dp.cor ?? '#ffffff').slice(1), 16), alpha: 0.9 }); } }
    else if (a.tipo === 'celula') { const c = centroCelula(a.x, a.y); this.selG.circle(c.x, c.y, 10).stroke({ width: 2, color: 0xf7c948 }); }
  }
  /** Redesenha a seleção (ex.: depois de mover o objeto selecionado). */
  atualizarSelecao(): void { this.sujoSelecao = true; }
  /** Anel sob o personagem selecionado (desenhado a cada quadro, pois ele se move). */
  anelDoSelecionado(): void { /* o anel é desenhado junto do rótulo em desenhar() */ }

  // ---------- consulta ----------
  objetoPorId(id: string): EntObjeto | undefined { return this.objetos.find((o) => o.id === id); }
  get totalSprites(): number { return this.pedacos.size + (this.pisoUnico ? 1 : 0) + this.paredes.length + this.objetos.length + this.pessoas.length; }

  destroy(): void {
    this.destruido = true; cancelAnimationFrame(this.raf); this.obs?.disconnect(); window.removeEventListener('keydown', this.tecla);
    this.app.destroy(true, { children: true, texture: true });
  }
}
