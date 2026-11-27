// CONVERSA COM AS PERSONAGENS: o jogador escreve; as personagens respondem com balão sobre a cabeça, UMA DE CADA VEZ.
// Quem responde: as citadas pelo nome/apelido; se ninguém for citado, todas as que estão na mesa (em fila). A fala vem do provedor (IA real); se falhar, aparece
// um aviso (nunca uma resposta inventada). Histórico por personagem fica salvo no projeto.
import { horaTexto, diaDe } from '../nucleo/tempo';
import { provedorAtual, ErroProvedor } from '../automacao/provedor';
import type { Jogo } from '../nucleo/jogo';
import type { Funcionario } from '../tipos';

export interface Balao { fid: string; texto: string; ate: number; pensando: boolean }
const norm = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const esperarReal = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
/** Tempo que o balão fica na tela (ms): proporcional ao texto, entre 3,5 e 9 s. */
export const duracaoBalao = (texto: string): number => Math.min(7000, Math.max(2500, 1200 + texto.length * 42));
const MAX_HISTORICO = 30;

type Tarefa = { f: Funcionario; msg: string; resposta?: Promise<string>; olhar?: Funcionario };
export class Conversa {
  balao: Balao | null = null; ocupada = false; private fila: Tarefa[] = []; status = ''; private recentes: string[] = []; semIAEquipe = false;
  constructor(private jogo: Jogo, private esperar: (ms: number) => Promise<void> = esperarReal) {}
  /** Quem está na mesa e pode ouvir. */
  presentes(): Funcionario[] { return this.jogo.p.funcionarios.filter((f) => f.status === 'ativo' && f.estacao && f.estado !== 'ausente' && f.estado !== 'dormindo'); }
  dormindo(): Funcionario[] { return this.jogo.p.funcionarios.filter((f) => f.status === 'ativo' && f.estado === 'dormindo'); }
  destinatarios(texto: string): Funcionario[] {
    const pres = this.presentes(); const t = ` ${norm(texto).replace(/[^a-z0-9]+/g, ' ')} `;
    const citadas = pres.filter((f) => [f.nome, f.apelido].some((n) => { const k = norm(n).trim(); return k.length >= 2 && t.includes(` ${k} `); }));
    return citadas.length ? citadas : pres;
  }
  /** Envia a mensagem do jogador. Devolve quantas personagens vão responder. */
  enviar(texto: string): { ok: boolean; motivo: string; n: number } {
    const msg = texto.trim().slice(0, 300); if (!msg) return { ok: false, motivo: 'Escreva uma mensagem.', n: 0 };
    const dest = this.destinatarios(msg); if (!dest.length) return { ok: false, motivo: this.dormindo().length ? 'Todas estão dormindo (fora do expediente). Elas acordam no horário de entrada.' : 'Ninguém está na mesa para responder. Contrate alguém e monte uma estação (mesa + cadeira + computador).', n: 0 };
    if (this.fila.length >= 12) return { ok: false, motivo: 'Aguarde: as personagens ainda estão respondendo.', n: 0 };
    const conv = (this.jogo.p.conversas ??= {});
    for (const f of dest) { (conv[f.id] ??= []).push({ de: 'eu', texto: msg, em: this.jogo.p.minuto }); this.limitar(f.id); const t: Tarefa = { f, msg }; t.resposta = this.pedir(f, msg); t.resposta.catch(() => {}); this.fila.push(t); }      // pede todas ao mesmo tempo; mostra uma por vez
    this.jogo.eventos.emitir('mensagem_usuario', { texto: msg, destinatarias: dest.map((f) => f.nome).join(', ') });
    this.jogo.emitir(); void this.rodar(); return { ok: true, motivo: '', n: dest.length };
  }
  /** Pede a resposta já (em paralelo com as outras). */
  private pedir(f: Funcionario, msg: string): Promise<string> {
    const p = this.jogo.p;
    return provedorAtual().responder({ funcionario: f, mensagem: msg, historico: (p.conversas?.[f.id] ?? []).slice(0, -1).map(({ de, texto: t }) => ({ de, texto: t })),
      contexto: { escritorio: p.nome, empresa: p.empresa, hora: horaTexto(p.minuto), dia: diaDe(p.minuto), equipe: p.funcionarios.filter((q) => q.status === 'ativo').map((q) => q.nome) } });
  }
  /** Conversa espontânea entre duas (ou mais) personagens acordadas — dá vida ao escritório. Não faz nada se estiver ocupada ou sem IA. */
  async conversaEquipe(): Promise<boolean> {
    const pres = this.presentes(); const prov = provedorAtual(); if (pres.length < 2 || this.ocupada || this.fila.length || this.semIAEquipe || !prov.dialogo) return false;
    const pessoas = [...pres].sort(() => Math.random() - 0.5).slice(0, Math.random() < 0.3 && pres.length > 2 ? 3 : 2); const p = this.jogo.p;
    try {
      const falas = await prov.dialogo({ pessoas, recentes: this.recentes, contexto: { escritorio: p.nome, empresa: p.empresa, hora: horaTexto(p.minuto), dia: diaDe(p.minuto), equipe: pres.map((q) => q.nome) } });
      if (this.ocupada || this.fila.length) return false;
      const log = ((p.conversas ??= {})['__equipe'] ??= []);
      for (const [i, l] of falas.entries()) {
        const f = pessoas.find((q) => q.nome === l.quem); if (!f) continue; const outro = pessoas.find((q) => q !== f && (i + 1 < falas.length ? q.nome === falas[i + 1].quem : true)) ?? pessoas.find((q) => q !== f);
        this.fila.push({ f, msg: `\u0000${l.texto}`, olhar: outro }); log.push({ de: 'ela', quem: f.nome, texto: l.texto, em: p.minuto }); this.recentes.push(l.texto);
      }
      if (log.length > 40) log.splice(0, log.length - 40); if (this.recentes.length > 8) this.recentes.splice(0, this.recentes.length - 8);
      this.jogo.eventos.emitir('resposta_funcionaria', { funcionario: 'equipe', texto: falas.map((l) => `${l.quem}: ${l.texto}`).join(' | ') }); void this.rodar(); return true;
    } catch (e) { if (e instanceof ErroProvedor && e.semIA) this.semIAEquipe = true; return false; }
  }
  private limitar(fid: string): void { const c = this.jogo.p.conversas?.[fid]; if (c && c.length > MAX_HISTORICO) c.splice(0, c.length - MAX_HISTORICO); }
  /** Fala fixa (sem IA), usada por automações: entra na mesma fila de balões. */
  falar(nomeOuId: string, texto: string): void {
    const f = this.presentes().find((q) => q.id === nomeOuId || norm(q.nome) === norm(nomeOuId) || norm(q.apelido) === norm(nomeOuId)) ?? (nomeOuId ? null : this.presentes()[0]); if (!f || !texto.trim()) return;
    this.fila.push({ f, msg: `\u0000${texto.trim().slice(0, 200)}` }); void this.rodar();
  }
  private async rodar(): Promise<void> {
    if (this.ocupada) return; this.ocupada = true;
    try {
      while (this.fila.length) {
        const tarefa = this.fila.shift()!; const { f, msg } = tarefa; if (f.status !== 'ativo' || f.estado === 'ausente' || f.estado === 'dormindo') continue;
        let texto: string;
        const t = tarefa;
        if (msg.startsWith('\u0000')) texto = msg.slice(1);
        else {
          this.balao = { fid: f.id, texto: '…', ate: Infinity, pensando: true }; this.status = `${f.nome} está digitando…`; this.jogo.emitir();
          try { texto = await (t.resposta ?? this.pedir(f, msg)); }
          catch (e) {
            this.balao = null; this.status = ''; const m = e instanceof Error ? e.message : String(e); this.jogo.aviso(`${f.nome} não pôde responder: ${m}`, 'erro');
            if (e instanceof ErroProvedor && e.semIA) this.fila.length = 0;                      // sem IA configurada: não repete o mesmo erro para cada personagem
            this.jogo.emitir(); continue;
          }
          (this.jogo.p.conversas ??= {})[f.id] ??= []; this.jogo.p.conversas[f.id].push({ de: 'ela', texto, em: this.jogo.p.minuto }); this.limitar(f.id);
          this.jogo.eventos.emitir('resposta_funcionaria', { funcionario: f.nome, texto });
        }
        const dur = duracaoBalao(texto); this.balao = { fid: f.id, texto, ate: Date.now() + dur, pensando: false }; this.status = ''; f.giroAte = Date.now() / 1000 + dur / 1000; f.dir = tarefa.olhar ? (tarefa.olhar.x >= f.x ? 'E' : 'W') : 'S'; this.jogo.emitir();
        await this.esperar(dur);
        if (this.balao?.fid === f.id) this.balao = null; this.jogo.emitir();
      }
    } finally { this.ocupada = false; this.status = ''; }
  }
}
