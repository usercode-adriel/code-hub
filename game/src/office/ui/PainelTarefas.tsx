import { useState } from 'react';
import { api, type Agente, type Tarefa } from './api';
import { Botao, Campo, Cartao, DEPARTAMENTOS, Entrada, Seletor, Texto, Vazio, erroTexto } from './kit';
import { LinhaTarefa } from './PainelAgente';

const COLUNAS: [string, string][] = [['pendente', 'Pendentes'], ['em_execucao', 'Em execução'], ['aguardando_aprovacao', 'Aguardando aprovação'], ['erro', 'Com erro'], ['concluida', 'Concluídas']];

export function PainelTarefas({ tarefas, agentes, aoMudar, aviso, departamento }: { tarefas: Tarefa[]; agentes: Agente[]; aoMudar: () => void; aviso: (t: string) => void; departamento?: string }) {
  const [filtroDep, setFiltroDep] = useState(departamento ?? ''); const [filtroAg, setFiltroAg] = useState('');
  const [nome, setNome] = useState(''); const [desc, setDesc] = useState(''); const [dep, setDep] = useState(departamento ?? 'diretoria'); const [ag, setAg] = useState(''); const [prioridade, setPrioridade] = useState('media'); const [prazo, setPrazo] = useState('');
  const lista = tarefas.filter((t) => (!filtroDep || t.departamento === filtroDep) && (!filtroAg || t.agenteId === filtroAg));
  const atrasadas = lista.filter((t) => t.atrasada).length;
  const criar = async (): Promise<void> => { try { await api.post('/tarefas', { nome, descricao: desc, departamento: dep, agenteId: ag || null, prioridade, prazo: prazo || null }); setNome(''); setDesc(''); setPrazo(''); aviso('Tarefa criada'); } catch (e) { aviso(erroTexto(e)); } aoMudar(); };
  return (
    <div className="o-pilha">
      <Cartao titulo="Nova tarefa">
        <Campo rotulo="Nome"><Entrada value={nome} onChange={(e) => setNome(e.target.value)} maxLength={160} /></Campo>
        <Campo rotulo="Descrição"><Texto rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} /></Campo>
        <div className="o-linha"><Campo rotulo="Departamento"><Seletor value={dep} onChange={(e) => setDep(e.target.value)}>{Object.entries(DEPARTAMENTOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Seletor></Campo>
          <Campo rotulo="Agente" dica="Vazio = o sistema sugere o agente do departamento."><Seletor value={ag} onChange={(e) => setAg(e.target.value)}><option value="">Sugerir</option>{agentes.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}</Seletor></Campo></div>
        <div className="o-linha"><Campo rotulo="Prioridade"><Seletor value={prioridade} onChange={(e) => setPrioridade(e.target.value)}>{['baixa', 'media', 'alta', 'urgente'].map((p) => <option key={p}>{p}</option>)}</Seletor></Campo><Campo rotulo="Prazo"><Entrada type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} /></Campo></div>
        <Botao primario disabled={!nome.trim()} onClick={criar}>Criar tarefa</Botao>
      </Cartao>
      <div className="o-linha">
        <Seletor value={filtroDep} onChange={(e) => setFiltroDep(e.target.value)}><option value="">Todos os departamentos</option>{Object.entries(DEPARTAMENTOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Seletor>
        <Seletor value={filtroAg} onChange={(e) => setFiltroAg(e.target.value)}><option value="">Todos os agentes</option>{agentes.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}</Seletor>
      </div>
      {atrasadas > 0 && <p className="o-aviso">⚠ {atrasadas} tarefa(s) atrasada(s)</p>}
      {COLUNAS.map(([st, rot]) => { const col = lista.filter((t) => t.status === st); return (
        <Cartao key={st} titulo={<>{rot} <small>{col.length}</small></>}>
          {col.length ? col.map((t) => <div key={t.id}><small className="o-mut">{agentes.find((a) => a.id === t.agenteId)?.nome ?? 'sem agente'} · {DEPARTAMENTOS[t.departamento] ?? t.departamento}</small><LinhaTarefa t={t} aoMudar={aoMudar} aviso={aviso} agentes={agentes} /></div>) : <Vazio>Nada aqui.</Vazio>}
        </Cartao>); })}
    </div>
  );
}
