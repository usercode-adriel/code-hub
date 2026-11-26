// NÚCLEO DO JOGO: guarda o projeto aberto, aplica as ações do jogador, avança a simulação e salva. A interface só LÊ daqui e chama ações.
import { item } from '../dados/catalogo';
import { gerarCandidatos } from '../dados/pessoas';
import { Grade } from './grade';
import { aleatorio } from './rng';
import { colocar, criarProjeto, type ConfigNovo } from './mapa';
import { diaDe, horaTexto } from './tempo';
import { salvar as salvarProjeto } from './persistencia';
import { reporEstoque, registrar } from '../sistemas/economia';
import { fsInicial } from '../sistemas/arquivos';
import { atualizarFuncionarios, pagarSalarios } from '../sistemas/funcionarios';
import { passarDiaPlantas } from '../sistemas/objetos';
import type { Projeto } from '../tipos';
import { Barramento, type Dados, type NomeEvento } from '../automacao/eventos';
import { instalar as instalarAutomacoes } from '../automacao/regras';
import { Conversa } from '../sistemas/conversa';

/** Monta o escritório inicial: só uma mesa simples, um laptop e uma cadeira básica (sem decoração, sem funcionários). */
export function montarInicial(p: Projeto): void {
  const mesa = item('mesa-simples')!; const cad = item('cadeira-escritorio')!; const lap = item('laptop')!;
  const x = Math.max(1, Math.floor((p.largura - mesa.w) / 2)); const y = Math.min(p.altura - 3, 2);
  const m = colocar(p, mesa, x, y, 0); const c = colocar(p, cad, x, y + mesa.h, 2); void c;                              // de costas para quem olha: o assento fica virado para a mesa
  const l = colocar(p, lap, x, y, 0); l.sobre = m.id; p.computadores[l.id] = fsInicial();
  registrar(p, 'inicial', p.cc, 'Capital inicial da empresa'); reporEstoque(p); p.candidatos = gerarCandidatos(p.criadoEm);
}
export function novoProjeto(c: ConfigNovo): Projeto { const p = criarProjeto(c); montarInicial(p); return p; }

export type Aviso = { id: number; texto: string; tipo: 'ok' | 'erro' | 'info' };
export class Jogo {
  p: Projeto; private ouvintes = new Set<() => void>(); avisos: Aviso[] = []; private n = 0; private grade: Grade; private rnd: () => number; sujo = false; salvoEm = 0;
  private acc = 0; private timer: ReturnType<typeof setInterval> | null = null; ultimoSalvar = Date.now(); pausado = false; modoConstrucao = false;
  /** Barramento de eventos (ponto de ligação das automações) e a conversa com as personagens. */
  readonly eventos = new Barramento(); readonly conversa: Conversa; private offAuto: () => void = () => {};
  desligarAutomacoes(): void { this.offAuto(); }
  constructor(p: Projeto, esperar?: (ms: number) => Promise<void>) { this.p = p; this.grade = new Grade(p); this.rnd = aleatorio((p.criadoEm ^ p.minuto) >>> 0 || 1); this.conversa = new Conversa(this, esperar); this.offAuto = instalarAutomacoes(this); atualizarFuncionarios(p, { g: this.grade, rnd: this.rnd }, 0, 0); }
  notificar(evento: NomeEvento, dados: Dados = {}): void { this.eventos.emitir(evento, dados); }
  registrarTransacao(tipo: 'recompensa' | 'gasto', valor: number, descricao: string): void { registrar(this.p, tipo, valor, descricao); this.emitir(); }
  assinar(f: () => void): () => void { this.ouvintes.add(f); return () => { this.ouvintes.delete(f); }; }
  emitir(): void { this.sujo = true; for (const f of this.ouvintes) f(); }
  /** Chame depois de qualquer alteração do mapa (reconstrói a grade de colisão). */
  mudou(): void { this.grade = new Grade(this.p); atualizarFuncionarios(this.p, { g: this.grade, rnd: this.rnd }, 0, 0); this.emitir(); }
  aviso(texto: string, tipo: Aviso['tipo'] = 'info'): void { this.avisos = [...this.avisos.slice(-3), { id: ++this.n, texto, tipo }]; this.emitir(); setTimeout(() => { this.avisos = this.avisos.filter((a) => a.texto !== texto); this.emitir(); }, 4200); }
  resultado(r: { ok: boolean; motivo: string }): boolean { this.aviso(r.motivo, r.ok ? 'ok' : 'erro'); if (r.ok) this.mudou(); return r.ok; }
  iniciar(): void {
    if (this.timer) return; this.timer = setInterval(() => this.passo(0.1), 100);
  }
  parar(): void { if (this.timer) clearInterval(this.timer); this.timer = null; this.desligarAutomacoes(); this.salvar(); }
  /** Avança `dt` segundos reais: 1 s = 1 minuto de jogo × velocidade. */
  passo(dt: number): void {
    if (this.pausado) return; const p = this.p;
    this.acc += dt * p.velocidade; const ant = diaDe(p.minuto);
    let m = 0; while (this.acc >= 1) { this.acc -= 1; p.minuto += 1; m++; }
    atualizarFuncionarios(p, { g: this.grade, rnd: this.rnd }, m, dt);
    if (diaDe(p.minuto) !== ant) this.novoDia();
    if (m > 0) for (const f of this.ouvintes) f();
    if (Date.now() - this.ultimoSalvar > 8000 && this.sujo) this.salvar();
  }
  private novoDia(): void {
    const p = this.p; const r = pagarSalarios(p, (t, v, d) => { registrar(p, t, v, d); }, this.rnd);
    reporEstoque(p); passarDiaPlantas(p);
    this.aviso(`Dia ${diaDe(p.minuto)} — ${horaTexto(p.minuto)}. ${r.rendeu ? `Equipe rendeu ${r.rendeu} CC. ` : ''}${r.pago ? `Salários pagos: ${r.pago} CC.` : 'Nenhum salário a pagar.'}${r.saidas.length ? ` ${r.saidas.join(', ')} pediu(ram) demissão por falta de pagamento.` : ''}`, 'info'); this.grade = new Grade(p); this.notificar('dia_novo', { dia: diaDe(p.minuto), pago: r.pago });
  }
  salvar(): boolean { const ok = salvarProjeto(this.p, diaDe(this.p.minuto)); this.ultimoSalvar = Date.now(); if (ok) { this.sujo = false; this.salvoEm = Date.now(); this.notificar('projeto_salvo', { projeto: this.p.nome }); } else this.aviso('Não foi possível salvar (armazenamento cheio?).', 'erro'); this.emitir(); return ok; }
  get g(): Grade { return this.grade; }
}
