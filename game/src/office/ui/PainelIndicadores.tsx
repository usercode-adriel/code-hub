import { Cartao, Etiqueta, ESTADO_ROTULO, Vazio, brl, corEstado } from './kit';
import type { Agente, Tarefa } from './api';

interface Estado { agentes: { id: string; nome: string; estado: string }[]; contagens: Record<string, number>; conectores: { id: string; nome: string; modo: string; status: string; financeiro: { vendasBrutas: number; comissoesRecebidas: number } | null }[]; status: { modulo: string; situacao: string }[] }

/** Indicadores de operação: o que está acontecendo AGORA no escritório, com dados reais do servidor. */
export function PainelIndicadores({ estado, agentes, tarefas, resumoReal }: { estado: Estado | null; agentes: Agente[]; tarefas: Tarefa[]; resumoReal: Record<string, number> | null }) {
  const abertas = tarefas.filter((t) => !['concluida', 'cancelada'].includes(t.status));
  return (
    <div className="o-pilha">
      <Cartao titulo="Operação agora">
        <div className="o-grade-kpi"><div><b>{agentes.filter((a) => ['planejando', 'executando', 'analisando'].includes(a.estado)).length}</b><small>agentes trabalhando</small></div><div><b>{abertas.length}</b><small>tarefas abertas</small></div><div><b>{tarefas.filter((t) => t.status === 'aguardando_aprovacao').length}</b><small>aguardando você</small></div><div><b>{tarefas.filter((t) => t.atrasada).length}</b><small>atrasadas</small></div></div>
        {agentes.map((a) => <p key={a.id} className="o-linha"><b>{a.nome}</b><Etiqueta cor={corEstado(a.estado)}>{ESTADO_ROTULO[a.estado] ?? a.estado}</Etiqueta></p>)}
      </Cartao>
      {resumoReal && <Cartao titulo="Financeiro (dados reais)"><div className="o-grade-kpi"><div><b>{brl(resumoReal.vendasBrutas)}</b><small>vendas brutas</small></div><div><b>{brl(resumoReal.comissoesAprovadas)}</b><small>comissão aprovada</small></div><div><b>{brl(resumoReal.comissoesRecebidas)}</b><small>comissão recebida</small></div><div><b>{brl(resumoReal.receitaLiquida)}</b><small>receita líquida</small></div></div><p className="o-mut">Estimadas e aprovadas não são dinheiro recebido.</p></Cartao>}
      <Cartao titulo="O que está operacional">
        {estado ? estado.status.map((s) => <p key={s.modulo}><b>{s.modulo}</b><br /><small className={s.situacao.startsWith('pendente') ? 'o-aviso-txt' : 'o-mut'}>{s.situacao}</small></p>) : <Vazio>Carregando…</Vazio>}
      </Cartao>
    </div>
  );
}
export type { Estado };
