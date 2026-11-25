import type { Agente, Tarefa } from './api';
import { Botao, Cartao, DEPARTAMENTOS, ESTADO_ROTULO, Etiqueta, Vazio, corEstado } from './kit';
import type { Layout } from '../modelo';
import { objetoPorTipo } from '../catalogo';

/** Painel de gestão de um departamento: quem trabalha, o que está em andamento e quais estações existem. */
export function PainelDepartamento({ chave, nome, layout, agentes, tarefas, abrirAgente, abrirTarefas }: { chave: string; nome: string; layout: Layout; agentes: Agente[]; tarefas: Tarefa[]; abrirAgente: (id: string) => void; abrirTarefas: (dep: string) => void }) {
  const dep = layout.departamentos.find((d) => d.chave === chave);
  const meus = agentes.filter((a) => a.departamento === chave); const ts = tarefas.filter((t) => t.departamento === chave);
  const estacoes = layout.estacoes.filter((e) => e.departamento === chave);
  const objetos = dep ? layout.objetos.filter((o) => o.x >= dep.x && o.x < dep.x + dep.w && o.y >= dep.y && o.y < dep.y + dep.h) : [];
  const conta = (s: string): number => ts.filter((t) => t.status === s).length;
  return (
    <div className="o-pilha">
      <Cartao titulo={nome || DEPARTAMENTOS[chave] || chave}>
        <div className="o-grade-kpi"><div><b>{meus.length}</b><small>funcionários</small></div><div><b>{ts.filter((t) => !['concluida', 'cancelada'].includes(t.status)).length}</b><small>tarefas abertas</small></div><div><b>{ts.filter((t) => t.atrasada).length}</b><small>atrasadas</small></div><div><b>{objetos.length}</b><small>objetos</small></div></div>
        <div className="o-linha"><Etiqueta cor="azul">{conta('em_execucao')} em execução</Etiqueta><Etiqueta cor="amarelo">{conta('aguardando_aprovacao')} p/ aprovar</Etiqueta><Etiqueta cor="vermelho">{conta('erro')} com erro</Etiqueta></div>
        <Botao pequeno primario onClick={() => abrirTarefas(chave)}>Ver tarefas do departamento</Botao>
      </Cartao>
      <Cartao titulo="Funcionários">{meus.length ? meus.map((a) => <button key={a.id} type="button" className="o-item o-btn-linha" onClick={() => abrirAgente(a.id)}><b>{a.nome}</b><small>{a.cargo}</small><Etiqueta cor={corEstado(a.estado)}>{ESTADO_ROTULO[a.estado] ?? a.estado}</Etiqueta></button>) : <Vazio>Nenhum funcionário neste departamento.</Vazio>}</Cartao>
      <Cartao titulo="Estações">{estacoes.length ? <ul className="o-lista">{estacoes.map((e) => { const o = layout.objetos.find((x) => x.id === e.objetoId); return <li key={e.id}><b>{e.rotulo ?? objetoPorTipo(o?.tipo ?? '')?.nome ?? e.id}</b> <small>→ {e.ferramenta}{e.agenteId ? ` · ${agentes.find((a) => a.id === e.agenteId)?.nome ?? 'agente'}` : ''}</small></li>; })}</ul> : <Vazio>Sem estações configuradas.</Vazio>}</Cartao>
    </div>
  );
}
