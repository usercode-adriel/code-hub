// EQUIPE: caixa de comandos do chefe, ordens e seu andamento, controle dos funcionários, orçamento e limites.
// O chefe NÃO conversa com cada funcionário: dá a ordem e acompanha a equipe (nuvens de diálogo + histórico de conversas).
import { useEffect, useState } from 'react';
import { api, type Agente, type Documento, type Mensagem, type Ordem, type PainelEquipeDados, type Tarefa, ROTULO_CLASS, COR_CLASS, type ItemEstoque, type MovEstoque } from './api';
import { Botao, Campo, Cartao, Entrada, Etiqueta, ESTADO_ROTULO, Seletor, Texto, Vazio, corEstado, erroTexto, quando } from './kit';
import { LinhaTarefa } from './PainelAgente';

export const ETAPAS: [string, string][] = [['recebida', 'Ordem recebida'], ['planejada', 'Tarefa planejada'], ['em_execucao', 'Em execução'], ['aguardando_aprovacao', 'Aguardando aprovação'], ['concluida', 'Concluída']];
const corOrdem = (s: string): 'verde' | 'azul' | 'amarelo' | 'vermelho' | 'cinza' => ({ recebida: 'cinza', planejada: 'azul', em_execucao: 'azul', aguardando_aprovacao: 'amarelo', concluida: 'verde', falha: 'vermelho', bloqueada: 'vermelho', cancelada: 'cinza' } as Record<string, 'verde' | 'azul' | 'amarelo' | 'vermelho' | 'cinza'>)[s] ?? 'cinza';

/** Barra de comando sobre o escritório. */
export function CaixaChefe({ painel, aoEnviar, aoCancelar, aviso }: { painel: PainelEquipeDados | null; aoEnviar: (t: string) => Promise<unknown>; aoCancelar: (id: string) => Promise<void>; aviso: (t: string) => void }) {
  const [texto, setTexto] = useState(''); const [enviando, setEnviando] = useState(false); const ativa = painel?.ordemAtiva ?? null;
  const enviar = async (): Promise<void> => { if (!texto.trim() || enviando) return; setEnviando(true); try { await aoEnviar(texto.trim()); setTexto(''); } catch (e) { aviso(erroTexto(e)); } setEnviando(false); };
  const idx = ativa ? Math.max(0, ETAPAS.findIndex(([k]) => k === ativa.status)) : -1;
  return (
    <div className="o-chefe" data-testid="caixa-chefe">
      {ativa && <div className="o-chefe-etapas" aria-label="Andamento da ordem">{ETAPAS.slice(0, 4).map(([k, r], i) => <span key={k} className={i < idx ? 'feito' : i === idx ? 'atual' : ''}>{r}</span>)}<button type="button" className="o-chefe-x" onClick={() => aoCancelar(ativa.id).catch((e) => aviso(erroTexto(e)))}>cancelar</button></div>}
      {painel?.modoIA === 'local' && <small className="o-chefe-aviso">Nenhuma IA configurada: os funcionários só trabalham depois que você conectar uma em Configurações → Assistente.</small>}
      <div className="o-chefe-linha">
        <span className="o-chefe-rotulo">Chefe</span>
        <input value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && enviar()} maxLength={1200} disabled={Boolean(ativa) || enviando} aria-label="Ordem para a equipe"
          placeholder={ativa ? `Ordem em andamento: ${ativa.texto.slice(0, 70)}…` : 'Dê uma ordem à equipe. Ex.: "Equipe, encontrem um produto para o TikTok Shop e planejem a campanha."'} />
        <Botao primario disabled={!texto.trim() || Boolean(ativa) || enviando} onClick={enviar}>{enviando ? 'Enviando…' : 'Dar ordem'}</Botao>
      </div>
    </div>
  );
}

function CartaoOrdem({ o, tarefas, agentes, aoMudar, aviso }: { o: Ordem; tarefas: Tarefa[]; agentes: Agente[]; aoMudar: () => void; aviso: (t: string) => void }) {
  const [aberta, setAberta] = useState(o.status !== 'concluida'); const ts = o.tarefas.map((x) => tarefas.find((t) => t.id === x.id)).filter(Boolean) as Tarefa[];
  return (
    <Cartao titulo={<span>{o.texto.length > 90 ? `${o.texto.slice(0, 90)}…` : o.texto}</span>} acao={<Etiqueta cor={corOrdem(o.status)}>{o.rotulo}</Etiqueta>}>
      <p className="o-mut">{quando(o.criadaEm)}{o.teste ? ' · execução de TESTE (IA simulada)' : ''}{o.planoOrigem === 'regra' ? ' · plano por regra (a IA não respondeu o plano)' : ''}</p>
      {o.motivo && <p className="o-erro-txt">{o.motivo}</p>}
      <Botao pequeno onClick={() => setAberta(!aberta)}>{aberta ? 'Recolher' : 'Detalhes'}</Botao>
      {aberta && <>
        {o.interpretacao && <p><b>Interpretação:</b> {o.interpretacao}</p>}
        {o.responsaveis.length > 0 && <ul className="o-lista">{o.responsaveis.map((r) => <li key={r.agenteId}><b>{r.nome}</b>: {r.atividade}</li>)}</ul>}
        {o.conclusao && <p><b>Conclusão da discussão ({o.turnos} falas):</b> {o.conclusao}</p>}
        {ts.map((t) => <LinhaTarefa key={t.id} t={t} aoMudar={aoMudar} aviso={aviso} agentes={agentes} />)}
        {o.documentos.length > 0 && <p className="o-mut">Documentos gerados: {o.documentos.map((d) => <Etiqueta key={d.id} cor={COR_CLASS[d.classificacao]} titulo={ROTULO_CLASS[d.classificacao]}>{d.titulo}</Etiqueta>)}</p>}
      </>}
    </Cartao>
  );
}

export function PainelEquipe({ painel, ordens, tarefas, agentes, aoMudar, aviso, abrirAgente }: { painel: PainelEquipeDados | null; ordens: Ordem[]; tarefas: Tarefa[]; agentes: Agente[]; aoMudar: () => void; aviso: (t: string) => void; abrirAgente: (id: string) => void }) {
  const [cfg, setCfg] = useState<{ maxTurnos: number; balaoSegundos: number; limiteChamadasDia: number } | null>(null); const c = cfg ?? painel?.config ?? null;
  const salvar = async (): Promise<void> => { if (!c) return; try { await api.put('/equipe/config', c); aviso('Limites salvos'); setCfg(null); aoMudar(); } catch (e) { aviso(erroTexto(e)); } };
  const usoPct = painel ? Math.min(100, Math.round((painel.uso.chamadas / Math.max(1, painel.uso.limite)) * 100)) : 0;
  return (
    <div className="o-pilha">
      <Cartao titulo="Funcionários" acao={painel?.modoIA === 'local' ? <Etiqueta cor="vermelho">sem IA</Etiqueta> : <Etiqueta cor="verde">IA: {painel?.modoIA ?? '…'}</Etiqueta>}>
        {(painel?.agentes ?? agentes).map((a) => (
          <div key={a.id} className="o-agente-linha"><button type="button" className="o-agente-nome" onClick={() => abrirAgente(a.id)}><b>{a.nome}</b><small>{a.cargo}</small></button>
            <span className="o-linha"><Etiqueta cor={corEstado(a.estado)}>{ESTADO_ROTULO[a.estado] ?? a.estado}</Etiqueta>{a.estadoSocial && <Etiqueta cor="roxo">{a.estadoSocial}</Etiqueta>}
              <Botao pequeno onClick={async () => { try { await api.post(`/agentes/${a.id}/pausar`, { pausado: a.estado !== 'pausado' }); aoMudar(); } catch (e) { aviso(erroTexto(e)); } }}>{a.estado === 'pausado' ? 'Ativar' : 'Pausar'}</Botao></span></div>))}
        <p className="o-mut">Pausado não recebe ordens. Perfil, personalidade e modelo de IA de cada um: clique no nome.</p>
      </Cartao>
      <Cartao titulo="Orçamento de utilização e limites">
        {painel && <><div className="o-barra"><i style={{ width: `${usoPct}%` }} /></div><p className="o-mut">{painel.uso.chamadas} de {painel.uso.limite} chamadas de IA usadas hoje ({painel.uso.restantes} restantes). Cada fala, plano e tarefa conta.</p></>}
        {c && <div className="o-linha">
          <Campo rotulo="Chamadas por dia"><Entrada type="number" min={5} max={500} value={c.limiteChamadasDia} onChange={(e) => setCfg({ ...c, limiteChamadasDia: Number(e.target.value) })} /></Campo>
          <Campo rotulo="Máx. de falas por ordem"><Entrada type="number" min={2} max={12} value={c.maxTurnos} onChange={(e) => setCfg({ ...c, maxTurnos: Number(e.target.value) })} /></Campo>
          <Campo rotulo="Duração do balão (s)"><Entrada type="number" min={3} max={20} value={c.balaoSegundos} onChange={(e) => setCfg({ ...c, balaoSegundos: Number(e.target.value) })} /></Campo></div>}
        {cfg && <Botao primario onClick={salvar}>Salvar limites</Botao>}
        <p className="o-mut">Os funcionários só conversam por causa de uma ordem sua: sem ordem, nenhuma chamada é feita. O número de falas é limitado e nunca há conversa infinita.</p>
      </Cartao>
      <Cartao titulo="Ordens">
        {ordens.length ? ordens.slice(0, 15).map((o) => <CartaoOrdem key={o.id} o={o} tarefas={tarefas} agentes={agentes} aoMudar={aoMudar} aviso={aviso} />) : <Vazio>Nenhuma ordem ainda. Use a caixa “Chefe” na parte de baixo do escritório.</Vazio>}
      </Cartao>
    </div>
  );
}

export function PainelConversas({ mensagens, ordens, agentes, filtroAgente, limparFiltro }: { mensagens: Mensagem[]; ordens: Ordem[]; agentes: Agente[]; filtroAgente: string | null; limparFiltro: () => void }) {
  const [ordemId, setOrdemId] = useState(''); const [tipo, setTipo] = useState('');
  const lista = mensagens.filter((m) => (!ordemId || m.ordemId === ordemId) && (!tipo || m.tipo === tipo) && (!filtroAgente || m.de === filtroAgente || m.para === filtroAgente)).slice().reverse();
  const ag = filtroAgente ? agentes.find((a) => a.id === filtroAgente) : null;
  return (
    <div className="o-pilha">
      <Cartao titulo="Histórico de conversas" acao={ag ? <Botao pequeno onClick={limparFiltro}>{ag.nome} ✕</Botao> : undefined}>
        <div className="o-linha"><Seletor value={ordemId} onChange={(e) => setOrdemId(e.target.value)}><option value="">Todas as ordens</option>{ordens.map((o) => <option key={o.id} value={o.id}>{o.texto.slice(0, 50)}</option>)}</Seletor>
          <Seletor value={tipo} onChange={(e) => setTipo(e.target.value)}><option value="">Todos os tipos</option>{['ordem', 'conversa', 'ideia', 'pergunta', 'alerta', 'discordancia', 'conclusao', 'sistema'].map((t) => <option key={t}>{t}</option>)}</Seletor></div>
        <p className="o-mut">É a comunicação interna da equipe, não um chat com você. Falas dos funcionários são sugestões da IA; eventos do sistema são reais; testes aparecem como simulados.</p>
        {lista.length ? lista.map((m) => (
          <div key={m.id} className={`o-conv t-${m.tipo}`}><div className="o-conv-cab"><b>{m.deNome}{m.paraNome ? ` → ${m.paraNome}` : ''}</b><Etiqueta cor={m.tipo === 'discordancia' ? 'amarelo' : m.tipo === 'alerta' ? 'vermelho' : m.tipo === 'conclusao' ? 'verde' : 'azul'}>{m.tipo}</Etiqueta><Etiqueta cor={COR_CLASS[m.classificacao]}>{ROTULO_CLASS[m.classificacao]}</Etiqueta><small>{quando(m.em)}</small></div><p>{m.texto}</p></div>
        )) : <Vazio>Sem conversas neste filtro.</Vazio>}
      </Cartao>
    </div>
  );
}

export function PainelDocumentos({ versao }: { versao: number }) {
  const [docs, setDocs] = useState<Documento[] | null>(null); const [aberto, setAberto] = useState<string | null>(null);
  useEffect(() => { api.get<Documento[]>('/documentos').then(setDocs).catch(() => setDocs([])); }, [versao]);
  return (
    <div className="o-pilha"><Cartao titulo="Documentos dos funcionários">
      <p className="o-mut">Roteiros, propostas e relatórios gerados pelos agentes. Cada um diz de onde vem a informação.</p>
      {docs === null ? <Vazio>Carregando…</Vazio> : docs.length ? docs.map((d) => (
        <div key={d.id} className="o-tarefa"><button type="button" className="o-tarefa-cab" onClick={() => setAberto(aberto === d.id ? null : d.id)}><span>{d.titulo}</span><span><Etiqueta>{d.tipo}</Etiqueta><Etiqueta cor={COR_CLASS[d.classificacao]}>{ROTULO_CLASS[d.classificacao]}</Etiqueta></span></button>
          {aberto === d.id && <div className="o-tarefa-corpo"><p className="o-mut">{d.autor} · {quando(d.criadoEm)}</p>
            {d.estrutura && <ul className="o-lista">{Object.entries(d.estrutura).filter(([, x]) => x).map(([k, x]) => <li key={k}><b>{k}:</b> {x}</li>)}</ul>}
            <div className="o-resultado"><pre>{d.texto}</pre></div>{d.fontes.length > 0 && <p className="o-mut">Fontes: {d.fontes.join(' · ')}</p>}</div>}</div>)) : <Vazio>Nenhum documento ainda.</Vazio>}
    </Cartao></div>
  );
}

export function PainelEstoque({ versao, aviso }: { versao: number; aviso: (t: string) => void }) {
  const [d, setD] = useState<{ itens: ItemEstoque[]; movimentos: MovEstoque[]; resumo: { itens: number; unidades: number; abaixoDoMinimo: number; divergencias: number } } | null>(null); const [n, setN] = useState(0);
  const [novo, setNovo] = useState({ nome: '', sku: '', quantidade: '', minimo: '', local: '' }); const [mov, setMov] = useState({ item: '', tipo: 'entrada', quantidade: '', motivo: '' });
  useEffect(() => { api.get<NonNullable<typeof d>>('/estoque').then(setD).catch((e) => aviso(erroTexto(e))); }, [versao, n]);   // eslint-disable-line react-hooks/exhaustive-deps
  const agir = async (fn: () => Promise<unknown>, ok: string): Promise<void> => { try { await fn(); aviso(ok); setN((x) => x + 1); } catch (e) { aviso(erroTexto(e)); } };
  return (
    <div className="o-pilha">
      <Cartao titulo="Estoque e Logística" acao={<Etiqueta cor="verde">dados reais lançados</Etiqueta>}>
        {d && <div className="o-grade-kpi"><div><b>{d.resumo.itens}</b><small>itens</small></div><div><b>{d.resumo.unidades}</b><small>unidades</small></div><div><b>{d.resumo.abaixoDoMinimo}</b><small>abaixo do mínimo</small></div><div><b>{d.resumo.divergencias}</b><small>divergências</small></div></div>}
        <p className="o-mut">O saldo é a soma dos movimentos: nada muda sem registro. Lucya (ou você) lança entradas, saídas, ajustes e divergências.</p>
        {d?.itens.length ? <table className="o-tabela"><thead><tr><th>SKU</th><th>Item</th><th>Saldo</th><th>Mín.</th><th>Local</th></tr></thead><tbody>{d.itens.map((i) => <tr key={i.id} className={i.abaixoDoMinimo ? 'alerta' : ''}><td>{i.sku}</td><td>{i.nome}</td><td><b>{i.quantidade}</b> {i.unidade}</td><td>{i.minimo}</td><td>{i.local}</td></tr>)}</tbody></table> : <Vazio>Nenhum item cadastrado.</Vazio>}
      </Cartao>
      <Cartao titulo="Cadastrar item">
        <div className="o-linha"><Campo rotulo="Nome"><Entrada value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} /></Campo><Campo rotulo="SKU (opcional)"><Entrada value={novo.sku} onChange={(e) => setNovo({ ...novo, sku: e.target.value })} /></Campo></div>
        <div className="o-linha"><Campo rotulo="Saldo inicial"><Entrada type="number" min={0} value={novo.quantidade} onChange={(e) => setNovo({ ...novo, quantidade: e.target.value })} /></Campo><Campo rotulo="Mínimo"><Entrada type="number" min={0} value={novo.minimo} onChange={(e) => setNovo({ ...novo, minimo: e.target.value })} /></Campo><Campo rotulo="Local"><Entrada value={novo.local} onChange={(e) => setNovo({ ...novo, local: e.target.value })} /></Campo></div>
        <Botao primario disabled={!novo.nome.trim()} onClick={() => agir(async () => { await api.post('/estoque/itens', { ...novo, quantidade: Number(novo.quantidade || 0), minimo: Number(novo.minimo || 0) }); setNovo({ nome: '', sku: '', quantidade: '', minimo: '', local: '' }); }, 'Item cadastrado')}>Cadastrar</Botao>
      </Cartao>
      <Cartao titulo="Registrar movimento">
        <div className="o-linha"><Campo rotulo="Item"><Seletor value={mov.item} onChange={(e) => setMov({ ...mov, item: e.target.value })}><option value="">Escolha…</option>{d?.itens.map((i) => <option key={i.id} value={i.id}>{i.nome} ({i.quantidade})</option>)}</Seletor></Campo>
          <Campo rotulo="Tipo"><Seletor value={mov.tipo} onChange={(e) => setMov({ ...mov, tipo: e.target.value })}>{['entrada', 'saida', 'ajuste', 'divergencia'].map((t) => <option key={t}>{t}</option>)}</Seletor></Campo>
          <Campo rotulo={mov.tipo === 'ajuste' || mov.tipo === 'divergencia' ? 'Saldo contado' : 'Quantidade'}><Entrada type="number" min={0} value={mov.quantidade} onChange={(e) => setMov({ ...mov, quantidade: e.target.value })} /></Campo></div>
        <Campo rotulo="Motivo / nota" dica="Obrigatório em ajuste e divergência."><Texto rows={2} value={mov.motivo} onChange={(e) => setMov({ ...mov, motivo: e.target.value })} /></Campo>
        <Botao primario disabled={!mov.item || mov.quantidade === ''} onClick={() => agir(async () => { await api.post('/estoque/movimentos', { itemId: mov.item, tipo: mov.tipo, quantidade: Number(mov.quantidade), motivo: mov.motivo }); setMov({ ...mov, quantidade: '', motivo: '' }); }, 'Movimento registrado')}>Registrar</Botao>
      </Cartao>
      <Cartao titulo="Últimos movimentos">{d?.movimentos.length ? <ul className="o-lista">{d.movimentos.slice(0, 20).map((m) => <li key={m.id}><small>{quando(m.em)}</small> <b>{m.tipo}</b> {m.itemNome}: {m.delta > 0 ? '+' : ''}{m.delta} → saldo {m.saldoApos} <small>· {m.por}{m.motivo ? ` · ${m.motivo}` : ''}</small></li>)}</ul> : <Vazio>Sem movimentos.</Vazio>}</Cartao>
    </div>
  );
}
