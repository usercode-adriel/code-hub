// BARRAMENTO DE EVENTOS: o jogo avisa o que aconteceu (mensagem, resposta, contratação, compra...) e quem quiser reage — automações, estatísticas, integrações.
// Os eventos são o ponto de ligação para futuras automações: nada aqui conhece interface ou regras específicas.
export type NomeEvento = 'mensagem_usuario' | 'resposta_funcionaria' | 'funcionario_contratado' | 'funcionario_demitido' | 'compra' | 'venda' | 'objeto_colocado' | 'dia_novo' | 'projeto_salvo';
export const EVENTOS: NomeEvento[] = ['mensagem_usuario', 'resposta_funcionaria', 'funcionario_contratado', 'funcionario_demitido', 'compra', 'venda', 'objeto_colocado', 'dia_novo', 'projeto_salvo'];
export type Dados = Record<string, string | number | boolean>;
export type Ouvinte = (evento: NomeEvento, dados: Dados) => void;
export class Barramento {
  private ouvintes = new Map<NomeEvento | '*', Set<Ouvinte>>();
  /** Escuta um evento (ou '*' para todos). Devolve a função que cancela. */
  on(evento: NomeEvento | '*', fn: Ouvinte): () => void { const s = this.ouvintes.get(evento) ?? new Set(); s.add(fn); this.ouvintes.set(evento, s); return () => { s.delete(fn); }; }
  emitir(evento: NomeEvento, dados: Dados = {}): void {
    for (const k of [evento, '*'] as const) for (const fn of [...(this.ouvintes.get(k) ?? [])]) { try { fn(evento, dados); } catch (e) { console.error('[evento]', evento, e); } }   // um ouvinte com erro não derruba os outros
  }
}
