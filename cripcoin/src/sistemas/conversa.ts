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
export const duracaoBalao = (texto: string): number => Math.min(9000, Math.max(3500, 1800 + texto.length * 55));
const MAX_HISTORICO = 30;

export class Conversa {
  balao: Balao | null = null; ocupada = false; private fila: { f: Funcionario; msg: string }[] = []; status = '';
  constructor(private jogo: Jogo, private esperar: (ms: number) => Promise<void> = esperarReal) {}
  /** Quem está na mesa e pode ouvir. */
  presentes(): Funcionario[] { return this.jogo.p.funcionarios.filter((f) => f.status === 'ativo' && f.estacao && f.estado !== 'ausente'); }
  destinatarios(texto: string): Funcionario[] {
    const pres = this.presentes(); const t = ` ${norm(texto).replace(/[^a-z0-9]+/g, ' ')} `;
    const citadas = pres.filter((f) => [f.nome, f.apelido].some((n) => { const k = norm(n).trim(); return k.length >= 2 && t.includes(` ${k} `); }));
    return citadas.length ? citadas : pres;
  }
  /** Envia a mensagem do jogador. Devolve quantas personagens vão responder. */
  enviar(texto: string): { ok: boolean; motivo: string; n: number } {
    const msg = texto.trim().slice(0, 300); if (!msg) return { ok: false, motivo: 'Escreva uma mensagem.', n: 0 };
    const dest = this.destinatarios(msg); if (!dest.length) return { ok: false, motivo: 'Ninguém está na mesa para responder. Contrate alguém e monte uma estação (mesa + cadeira + computador).', n: 0 };
    if (this.fila.length >= 12) return { ok: false, motivo: 'Aguarde: as personagens ainda estão respondendo.', n: 0 };
    const conv = (this.jogo.p.conversas ??= {});
    for (const f of dest) { (conv[f.id] ??= []).push({ de: 'eu', texto: msg, em: this.jogo.p.minuto }); this.limitar(f.id); this.fila.push({ f, msg }); }
    this.jogo.eventos.emitir('mensagem_usuario', { texto: msg, destinatarias: dest.map((f) => f.nome).join(', ') });
    this.jogo.emitir(); void this.rodar(); return { ok: true, motivo: '', n: dest.length };
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
        const { f, msg } = this.fila.shift()!; if (f.status !== 'ativo' || f.estado === 'ausente') continue;
        let texto: string;
        if (msg.startsWith('\u0000')) texto = msg.slice(1);
        else {
          this.balao = { fid: f.id, texto: '…', ate: Infinity, pensando: true }; this.status = `${f.nome} está pensando…`; this.jogo.emitir();
          try {
            const p = this.jogo.p;
            texto = await provedorAtual().responder({ funcionario: f, mensagem: msg, historico: (p.conversas?.[f.id] ?? []).slice(0, -1).map(({ de, texto: t }) => ({ de, texto: t })),
              contexto: { escritorio: p.nome, empresa: p.empresa, hora: horaTexto(p.minuto), dia: diaDe(p.minuto), equipe: p.funcionarios.filter((q) => q.status === 'ativo').map((q) => q.nome) } });
          } catch (e) {
            this.balao = null; this.status = ''; const m = e instanceof Error ? e.message : String(e); this.jogo.aviso(`${f.nome} não pôde responder: ${m}`, 'erro');
            if (e instanceof ErroProvedor && e.semIA) this.fila.length = 0;                      // sem IA configurada: não repete o mesmo erro para cada personagem
            this.jogo.emitir(); continue;
          }
          (this.jogo.p.conversas ??= {})[f.id] ??= []; this.jogo.p.conversas[f.id].push({ de: 'ela', texto, em: this.jogo.p.minuto }); this.limitar(f.id);
          this.jogo.eventos.emitir('resposta_funcionaria', { funcionario: f.nome, texto });
        }
        const dur = duracaoBalao(texto); this.balao = { fid: f.id, texto, ate: Date.now() + dur, pensando: false }; this.status = ''; f.giroAte = Date.now() / 1000 + dur / 1000; f.dir = 'S'; this.jogo.emitir();
        await this.esperar(dur);
        if (this.balao?.fid === f.id) this.balao = null; this.jogo.emitir();
      }
    } finally { this.ocupada = false; this.status = ''; }
  }
}
