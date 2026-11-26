import { useState } from 'react';
import { api, type Agente, type Tarefa } from './api';
import { Botao, Campo, Cartao, DEPARTAMENTOS, ESTADO_ROTULO, Entrada, Etiqueta, Seletor, Texto, Vazio, corEstado, erroTexto, quando } from './kit';

/** Perfil do funcionário de IA: estado real, tarefa atual, histórico, conversa e atribuição de tarefas. */
export function PainelAgente({ agente, tarefas, aoMudar, aviso, abrirConversas }: { agente: Agente; tarefas: Tarefa[]; aoMudar: () => void; aviso: (t: string) => void; abrirConversas?: (agenteId: string) => void }) {
  const minhas = tarefas.filter((t) => t.agenteId === agente.id);
  const atual = minhas.find((t) => t.id === agente.tarefaAtual) ?? minhas.find((t) => t.status === 'em_execucao');
  const [editando, setEditando] = useState(false);
  const agir = async (fn: () => Promise<unknown>, ok?: string): Promise<void> => { try { await fn(); if (ok) aviso(ok); aoMudar(); } catch (e) { aviso(erroTexto(e)); } };
  return (
    <div className="o-pilha">
      <Cartao titulo={<>{agente.nome} <small>{agente.cargo}</small></>} acao={<Etiqueta cor={corEstado(agente.estado)}>{ESTADO_ROTULO[agente.estado] ?? agente.estado}</Etiqueta>}>
        <p className="o-mut">{DEPARTAMENTOS[agente.departamento] ?? agente.departamento}</p>
        <div className="o-grade-kpi">
          <div><b>{agente.indicadores.concluidas}</b><small>executadas</small></div><div><b>{agente.indicadores.aprovadas}</b><small>aprovadas</small></div>
          <div><b>{agente.indicadores.erros}</b><small>com erro</small></div><div><b>{agente.tempoMedioMs ? `${Math.round(agente.tempoMedioMs / 1000)} s` : '—'}</b><small>tempo médio</small></div>
        </div>
        {atual ? <p><b>Tarefa atual:</b> {atual.nome}</p> : <p className="o-mut">Nenhuma tarefa em execução.</p>}
        <div className="o-linha">
          {['concluido', 'com_erro'].includes(agente.estado) && <Botao pequeno onClick={() => agir(() => api.post(`/agentes/${agente.id}/reconhecer`))}>Marcar como visto</Botao>}
          {agente.estado === 'pausado' ? <Botao pequeno onClick={() => agir(() => api.post(`/agentes/${agente.id}/pausar`, { pausado: false }), 'Agente retomado')}>Retomar</Botao> : <Botao pequeno onClick={() => agir(() => api.post(`/agentes/${agente.id}/pausar`, { pausado: true }), 'Agente pausado')}>Pausar</Botao>}
          <Botao pequeno onClick={() => setEditando(!editando)}>{editando ? 'Fechar edição' : 'Editar'}</Botao>
        </div>
      </Cartao>
      {editando && <EditarAgente agente={agente} aoSalvar={() => { setEditando(false); aoMudar(); }} aviso={aviso} />}
      <AtribuirTarefa agente={agente} aoCriar={aoMudar} aviso={aviso} />
      <Cartao titulo="Tarefas deste agente">
        {minhas.length ? minhas.slice(0, 12).map((t) => <LinhaTarefa key={t.id} t={t} aoMudar={aoMudar} aviso={aviso} />) : <Vazio>Sem tarefas ainda.</Vazio>}
      </Cartao>
      <Cartao titulo="Personalidade e perfil">
        {agente.perfil?.temperamento ? <p><b>Temperamento:</b> {agente.perfil.temperamento}</p> : null}
        {agente.perfil?.tom ? <p><b>Tom de comunicação:</b> {agente.perfil.tom}</p> : null}
        {agente.perfil?.especialidade ? <p><b>Especialidade:</b> {agente.perfil.especialidade}</p> : null}
        {agente.perfil?.objetivos?.length ? <ul className="o-lista">{agente.perfil.objetivos.map((o) => <li key={o}>{o}</li>)}</ul> : null}
        {agente.memoria?.length ? <details><summary>Memória de trabalho ({agente.memoria.length})</summary><ul className="o-lista">{agente.memoria.slice(-8).map((m, i) => <li key={i}>{m}</li>)}</ul></details> : null}
      </Cartao>
      <Cartao titulo="Relacionamentos profissionais">
        {agente.relacionamentos?.length ? <ul className="o-lista">{agente.relacionamentos.map((r) => <li key={r.agenteId}><b>{r.nome}</b>: {r.descricao} <small>· {r.colaboracoes} colaborações, {r.discordancias} discordâncias</small></li>)}</ul> : <Vazio>Ainda sem histórico com os colegas. As relações nascem do trabalho em conjunto.</Vazio>}
      </Cartao>
      <Cartao titulo="Conversas">
        <p className="o-mut">Você não conversa individualmente com os funcionários: dê uma ordem pela caixa “Chefe” e acompanhe a equipe. Aqui ficam as conversas internas de {agente.nome}.</p>
        {abrirConversas && <Botao pequeno onClick={() => abrirConversas(agente.id)}>Ver conversas de {agente.nome}</Botao>}
      </Cartao>
      <Cartao titulo="Histórico de estados">
        {agente.historico.length ? <ul className="o-lista">{agente.historico.slice(-12).reverse().map((h, i) => <li key={i}><small>{quando(h.em)}</small> {ESTADO_ROTULO[h.de ?? ''] ?? h.de} → <b>{ESTADO_ROTULO[h.para ?? ''] ?? h.para}</b>{h.nota ? <small> · {h.nota}</small> : null}</li>)}</ul> : <Vazio>O histórico aparece quando o agente trabalha.</Vazio>}
      </Cartao>
    </div>
  );
}

function EditarAgente({ agente, aoSalvar, aviso }: { agente: Agente; aoSalvar: () => void; aviso: (t: string) => void }) {
  const [f, setF] = useState({ nome: agente.nome, cargo: agente.cargo, departamento: agente.departamento, instrucoes: agente.instrucoes, personalidade: agente.personalidade, modelo: agente.modelo });
  const [pf, setPf] = useState({ tom: agente.perfil?.tom ?? '', especialidade: agente.perfil?.especialidade ?? '', temperamento: agente.perfil?.temperamento ?? '', objetivos: (agente.perfil?.objetivos ?? []).join('\n') });
  return (
    <Cartao titulo="Editar funcionário">
      <Campo rotulo="Nome"><Entrada value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} maxLength={40} /></Campo>
      <Campo rotulo="Cargo"><Entrada value={f.cargo} onChange={(e) => setF({ ...f, cargo: e.target.value })} maxLength={80} /></Campo>
      <Campo rotulo="Departamento"><Seletor value={f.departamento} onChange={(e) => setF({ ...f, departamento: e.target.value })}>{Object.entries(DEPARTAMENTOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Seletor></Campo>
      <Campo rotulo="Instruções do agente" dica="Define como ele trabalha. Ferramentas e permissões continuam as do sistema."><Texto rows={5} value={f.instrucoes} onChange={(e) => setF({ ...f, instrucoes: e.target.value })} maxLength={2000} /></Campo>
      <Campo rotulo="Personalidade"><Seletor value={f.personalidade} onChange={(e) => setF({ ...f, personalidade: e.target.value })}>{['profissional', 'amigavel', 'divertido', 'mentor', 'zen', 'nerd'].map((p) => <option key={p}>{p}</option>)}</Seletor></Campo>
      <Campo rotulo="Modelo de IA" dica="'padrao' usa a IA configurada em Configurações → Assistente."><Seletor value={f.modelo} onChange={(e) => setF({ ...f, modelo: e.target.value })}>{['padrao', 'gemini', 'groq', 'claude'].map((p) => <option key={p}>{p}</option>)}</Seletor></Campo>
      <Campo rotulo="Temperamento"><Entrada value={pf.temperamento} onChange={(e) => setPf({ ...pf, temperamento: e.target.value })} maxLength={300} /></Campo>
      <Campo rotulo="Tom de comunicação"><Entrada value={pf.tom} onChange={(e) => setPf({ ...pf, tom: e.target.value })} maxLength={300} /></Campo>
      <Campo rotulo="Especialidade"><Texto rows={2} value={pf.especialidade} onChange={(e) => setPf({ ...pf, especialidade: e.target.value })} maxLength={400} /></Campo>
      <Campo rotulo="Objetivos profissionais" dica="Um por linha."><Texto rows={3} value={pf.objetivos} onChange={(e) => setPf({ ...pf, objetivos: e.target.value })} /></Campo>
      <Botao primario onClick={async () => { try { await api.put(`/agentes/${agente.id}`, { ...f, perfil: { tom: pf.tom, especialidade: pf.especialidade, temperamento: pf.temperamento, objetivos: pf.objetivos.split('\n').map((x) => x.trim()).filter(Boolean) } }); aviso('Funcionário atualizado'); aoSalvar(); } catch (e) { aviso(erroTexto(e)); } }}>Salvar</Botao>
    </Cartao>
  );
}

function AtribuirTarefa({ agente, aoCriar, aviso }: { agente: Agente; aoCriar: () => void; aviso: (t: string) => void }) {
  const [nome, setNome] = useState(''); const [desc, setDesc] = useState(''); const [prioridade, setPrioridade] = useState('media'); const [prazo, setPrazo] = useState('');
  const criar = async (despachar: boolean): Promise<void> => {
    try {
      const t = await api.post<Tarefa>('/tarefas', { nome, descricao: desc, agenteId: agente.id, departamento: agente.departamento, prioridade, prazo: prazo || null });
      setNome(''); setDesc(''); setPrazo('');
      if (despachar) { await api.post(`/tarefas/${t.id}/despachar`); aviso(`${agente.nome} começou a tarefa`); } else aviso('Tarefa criada');
      aoCriar();
    } catch (e) { aviso(erroTexto(e)); aoCriar(); }
  };
  return (
    <Cartao titulo="Atribuir tarefa">
      <Campo rotulo="O que fazer"><Entrada value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Pesquisar 5 fones bluetooth com boa comissão" maxLength={160} /></Campo>
      <Campo rotulo="Detalhes (opcional)"><Texto rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} /></Campo>
      <div className="o-linha"><Campo rotulo="Prioridade"><Seletor value={prioridade} onChange={(e) => setPrioridade(e.target.value)}>{['baixa', 'media', 'alta', 'urgente'].map((p) => <option key={p}>{p}</option>)}</Seletor></Campo><Campo rotulo="Prazo"><Entrada type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} /></Campo></div>
      <div className="o-linha"><Botao disabled={!nome.trim()} onClick={() => criar(false)}>Só criar</Botao><Botao primario disabled={!nome.trim()} onClick={() => criar(true)}>Criar e executar agora</Botao></div>
      <p className="o-mut">Executar usa a IA configurada. O agente consulta e registra dados reais pelas ferramentas; o resultado fica aguardando a sua aprovação.</p>
    </Cartao>
  );
}

export function LinhaTarefa({ t, aoMudar, aviso, agentes }: { t: Tarefa; aoMudar: () => void; aviso: (x: string) => void; agentes?: Agente[] }) {
  const [aberta, setAberta] = useState(false);
  const agir = async (fn: () => Promise<unknown>, ok?: string): Promise<void> => { try { await fn(); if (ok) aviso(ok); } catch (e) { aviso(erroTexto(e)); } aoMudar(); };
  const cor = { pendente: 'cinza', em_execucao: 'azul', aguardando_aprovacao: 'amarelo', concluida: 'verde', erro: 'vermelho', cancelada: 'cinza' }[t.status] as 'cinza';
  return (
    <div className={`o-tarefa ${t.atrasada ? 'atrasada' : ''}`}>
      <button type="button" className="o-tarefa-cab" onClick={() => setAberta(!aberta)}><span>{t.nome}</span><span><Etiqueta cor={cor}>{t.status.replace('_', ' ')}</Etiqueta>{t.atrasada && <Etiqueta cor="vermelho">atrasada</Etiqueta>}</span></button>
      {aberta && (
        <div className="o-tarefa-corpo">
          {t.descricao && <p>{t.descricao}</p>}
          <p className="o-mut">Prioridade {t.prioridade}{t.prazo ? ` · prazo ${t.prazo}` : ''} · criada {quando(t.criadaEm)}</p>
          {t.resultado && <div className="o-resultado"><b>Resultado</b><pre>{t.resultado}</pre></div>}
          <div className="o-linha">
            {['pendente', 'erro'].includes(t.status) && t.agenteId && <Botao pequeno primario onClick={() => agir(() => api.post(`/tarefas/${t.id}/despachar`), 'Tarefa despachada')}>Executar</Botao>}
            {t.status === 'aguardando_aprovacao' && <><Botao pequeno primario onClick={() => agir(() => api.post(`/tarefas/${t.id}/revisar`, { aprovar: true }), 'Resultado aprovado')}>Aprovar resultado</Botao><Botao pequeno onClick={() => { const m = window.prompt('Por que recusar? (opcional)') ?? ''; return agir(() => api.post(`/tarefas/${t.id}/revisar`, { aprovar: false, motivo: m }), 'Resultado recusado'); }}>Recusar</Botao></>}
            {!['concluida', 'cancelada', 'em_execucao'].includes(t.status) && <Botao pequeno perigo onClick={() => agir(() => api.post(`/tarefas/${t.id}/status`, { status: 'cancelada' }), 'Tarefa cancelada')}>Cancelar</Botao>}
            {agentes && !['concluida', 'cancelada', 'em_execucao'].includes(t.status) && <Seletor value={t.agenteId ?? ''} onChange={(e) => agir(() => api.post(`/tarefas/${t.id}/encaminhar`, { agenteId: e.target.value }), 'Tarefa encaminhada')}><option value="">Reatribuir…</option>{agentes.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}</Seletor>}
          </div>
          <ul className="o-lista">{t.historico.slice(-8).reverse().map((h, i) => <li key={i}><small>{quando(h.em)}</small> {h.acao}{h.para ? ` → ${h.para}` : ''}{h.motivo ? <small> · {h.motivo}</small> : null}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
