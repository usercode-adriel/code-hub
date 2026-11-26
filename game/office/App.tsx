// CODENIAC COMMERCE OFFICE — aplicação. Liga a engine isométrica (PixiJS) aos painéis (React) e à API real do Hub.
// O escritório é o ambiente principal; os painéis são complementares e abrem as ferramentas reais ao clicar em objetos.
import { useCallback, useEffect, useRef, useState } from 'react';
import { OfficeEngine, type AgenteInfo } from '../src/office/engine';
import { Construtor, type EstadoConstrutor } from '../src/office/construtor';
import { layoutPadrao, VERSAO_PADRAO } from '../src/office/layoutPadrao';
import { layoutVazio, type Layout } from '../src/office/modelo';
import type { AlvoSelecao, Modo } from '../src/office/eventos';
import { api, token, type Agente, type AssetM, type Campanha, type LayoutResumo, type Mensagem, type PainelEquipeDados, type PersonagemDef, type Produto, type Tarefa } from '../src/office/ui/api';
import { Botao, Etiqueta, DEPARTAMENTOS, ESTADO_ROTULO, corEstado } from '../src/office/ui/kit';
import { PainelAgente } from '../src/office/ui/PainelAgente';
import { PainelTarefas } from '../src/office/ui/PainelTarefas';
import { PainelProdutos } from '../src/office/ui/PainelProdutos';
import { PainelFinanceiro } from '../src/office/ui/PainelFinanceiro';
import { PainelImportador } from '../src/office/ui/PainelImportador';
import { PainelConectores } from '../src/office/ui/PainelConectores';
import { PainelCampanhas } from '../src/office/ui/PainelCampanhas';
import { PainelAssets } from '../src/office/ui/PainelAssets';
import { PainelPersonagens } from '../src/office/ui/PainelPersonagens';
import { PainelReunioes, type Reuniao } from '../src/office/ui/PainelReunioes';
import { PainelConstrutor } from '../src/office/ui/PainelConstrutor';
import { PainelDepartamento } from '../src/office/ui/PainelDepartamento';
import { PainelIndicadores, type Estado } from '../src/office/ui/PainelIndicadores';
import { Baloes } from '../src/office/ui/Baloes';
import { CaixaChefe, PainelConversas, PainelDocumentos, PainelEquipe, PainelEstoque } from '../src/office/ui/PainelEquipe';
import { useEquipe } from '../src/office/ui/useEquipe';

type Aba = 'escritorio' | 'agentes' | 'tarefas' | 'produtos' | 'financeiro' | 'importar' | 'integracoes' | 'campanhas' | 'assets' | 'personagens' | 'reunioes' | 'equipe' | 'conversas' | 'documentos' | 'estoque' | 'construtor';
const ABAS: [Aba, string][] = [['escritorio', 'Escritório'], ['equipe', 'Equipe'], ['conversas', 'Conversas'], ['agentes', 'Agentes'], ['estoque', 'Estoque'], ['documentos', 'Documentos'], ['tarefas', 'Tarefas'], ['produtos', 'Produtos'], ['financeiro', 'Financeiro'], ['importar', 'Importar'], ['integracoes', 'Integrações'], ['campanhas', 'Campanhas'], ['reunioes', 'Reuniões'], ['assets', 'Assets'], ['personagens', 'Personagens']];
const MODOS: [Modo, string][] = [['execucao', 'Execução'], ['visualizacao', 'Visualização'], ['construcao', 'Construção'], ['edicao', 'Edição']];
interface LayoutServidor { id: string; nome: string; versao: number; dados: Layout }
type ResumoFin = { real: { indicadores: Record<string, number> } };

const iniciais = (n: string): string => { const p = n.trim().split(/\s+/); return (p.length > 1 ? `${p[0][0]}${p[1][0]}` : n.slice(0, 2)).toUpperCase(); };

export function App() {
  const host = useRef<HTMLDivElement>(null); const motor = useRef<OfficeEngine | null>(null); const construtor = useRef<Construtor | null>(null);
  const [erro, setErro] = useState<string | null>(null); const [pronto, setPronto] = useState(false);
  const [modo, setModo] = useState<Modo>('execucao'); const [aba, setAba] = useState<Aba>('escritorio'); const [ferramenta, setFerramenta] = useState<string | null>(null);
  const [agentes, setAgentes] = useState<Agente[]>([]); const [tarefas, setTarefas] = useState<Tarefa[]>([]); const [produtos, setProdutos] = useState<Produto[]>([]); const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [assets, setAssets] = useState<AssetM[]>([]); const [personagens, setPersonagens] = useState<PersonagemDef[]>([]); const [reunioes, setReunioes] = useState<Reuniao[]>([]); const [importacoes, setImportacoes] = useState<never[]>([]);
  const [estado, setEstado] = useState<Estado | null>(null); const [resumo, setResumo] = useState<Record<string, number> | null>(null); const [layouts, setLayouts] = useState<LayoutResumo[]>([]);
  const [layout, setLayout] = useState<Layout | null>(null); const [layoutAtual, setLayoutAtual] = useState<{ id: string; nome: string; versao: number } | null>(null);
  const [agenteSel, setAgenteSel] = useState<string | null>(null); const [depSel, setDepSel] = useState<string | null>(null); const [hover, setHover] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<{ id: number; texto: string }[]>([]); const [zoom, setZoom] = useState(1); const [ec, setEc] = useState<EstadoConstrutor | null>(null);
  const [camadas, setCamadas] = useState<Record<string, boolean>>({}); const [salvando, setSalvando] = useState(false); const [versaoFin, setVersaoFin] = useState(0);
  const [novasMsgs, setNovasMsgs] = useState<Mensagem[]>([]); const [filtroConversa, setFiltroConversa] = useState<string | null>(null);
  const layoutRef = useRef<{ id: string; versao: number } | null>(null); const agentesRef = useRef<Agente[]>([]); const personagensRef = useRef<PersonagemDef[]>([]);

  const aviso = useCallback((texto: string): void => { const id = Date.now() + Math.random(); setAvisos((a) => [...a.slice(-3), { id, texto }]); setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), 5000); }, []);

  const equipe = useEquipe(pronto, (ms, inicial) => { if (!inicial) setNovasMsgs(ms); });
  // ---------- dados ----------
  const aplicarAgentes = useCallback((l: Agente[]): void => {
    setAgentes(l); agentesRef.current = l;
    const info: AgenteInfo[] = l.map((a) => ({ id: a.id, chave: a.chave ?? a.id, nome: a.nome, cargo: a.cargo, departamento: a.departamento, estado: a.estado, avatarId: a.avatarId, tarefaAtual: a.tarefaAtual, estadoSocial: a.estadoSocial ?? null, desde: a.estadoDesde ?? null }));
    motor.current?.setAgentes(info, personagensRef.current.map((p) => ({ id: p.id, nome: p.nome, assetId: p.assetId, quadroL: p.quadroL, quadroA: p.quadroA, colunas: p.colunas, linhas: p.linhas, animacoes: p.animacoes.map((a) => ({ ...a, estado: a.estado as never, direcao: a.direcao as never })), escala: p.escala, ancora: p.ancora, velocidade: p.velocidade })));
  }, []);
  const carregarAgentes = useCallback(async (): Promise<void> => { const p = await api.get<PainelEquipeDados>('/equipe'); aplicarAgentes(p.agentes); }, [aplicarAgentes]);
  const carregarResto = useCallback(async (): Promise<void> => {
    const [t, p, c, a, per, r, im, e, fin, ls] = await Promise.all([api.get<Tarefa[]>('/tarefas'), api.get<Produto[]>('/produtos'), api.get<Campanha[]>('/campanhas'), api.get<AssetM[]>('/assets'), api.get<PersonagemDef[]>('/personagens'), api.get<Reuniao[]>('/reunioes'), api.get<never[]>('/importacoes'), api.get<Estado>('/estado'), api.get<ResumoFin>('/financeiro/resumo'), api.get<LayoutResumo[]>('/layouts')]);
    setTarefas(t); setProdutos(p); setCampanhas(c); setAssets(a); setPersonagens(per); personagensRef.current = per; setReunioes(r); setImportacoes(im); setEstado(e); setResumo(fin.real.indicadores); setLayouts(ls); setVersaoFin((v) => v + 1);
    if (motor.current) for (const x of a) motor.current.assets.set(x.id, x);
  }, []);
  const atualizarTudo = useCallback(async (): Promise<void> => { try { await Promise.all([carregarAgentes(), carregarResto()]); } catch (e) { aviso(e instanceof Error ? e.message : String(e)); } }, [carregarAgentes, carregarResto, aviso]);

  // ---------- layout ----------
  const vincularIds = (l: Layout, ags: Agente[]): boolean => {
    let mudou = false; const porChave = new Map(ags.filter((a) => a.chave).map((a) => [a.chave as string, a.id]));
    for (const e of l.estacoes) if (e.agenteChave && !e.agenteId && porChave.has(e.agenteChave)) { e.agenteId = porChave.get(e.agenteChave)!; mudou = true; }
    for (const p of l.personagens) { const chave = p.id.replace('pers-', ''); if (!p.agenteId && porChave.has(chave)) { p.agenteId = porChave.get(chave)!; mudou = true; } }
    return mudou;
  };
  const carregarLayoutServidor = useCallback(async (ls: LayoutServidor): Promise<void> => {
    const dados = ls.dados; const m = motor.current; if (!m) return;
    layoutRef.current = { id: ls.id, versao: ls.versao }; setLayoutAtual({ id: ls.id, nome: ls.nome, versao: ls.versao }); setLayout(dados);
    m.carregarLayout(dados); await carregarAgentes(); construtor.current?.novoLayout(m.layout);
  }, [carregarAgentes]);

  const salvarLayout = useCallback(async (): Promise<void> => {
    const m = motor.current; const ref = layoutRef.current; if (!m || !ref) return; setSalvando(true);
    try {
      m.layout.personagens = m.exportarPersonagens();
      const r = await api.put<LayoutServidor>(`/layouts/${ref.id}`, { dados: m.layout, versaoBase: ref.versao });
      layoutRef.current = { id: r.id, versao: r.versao }; setLayoutAtual({ id: r.id, nome: r.nome, versao: r.versao }); construtor.current?.marcarSalvo(); aviso('Layout salvo'); setLayouts(await api.get<LayoutResumo[]>('/layouts'));
    } catch (e) { aviso(e instanceof Error ? e.message : String(e)); }
    setSalvando(false);
  }, [aviso]);

  // ---------- iniciar a engine ----------
  useEffect(() => {
    if (!token()) { setErro('Faça login no Codeniac para abrir o escritório.'); return; }
    let vivo = true; let timer: ReturnType<typeof setInterval> | undefined;
    (async () => {
      try {
        await api.get('/estado');                                              // garante os agentes iniciais
        const ags = await api.get<Agente[]>('/agentes'); agentesRef.current = ags;
        let ativo = await api.get<LayoutServidor | null>('/layouts/ativo');
        const mapa = Object.fromEntries(ags.filter((a) => a.chave).map((a) => [a.chave as string, a.id]));
        // 3.0: o escritório é uma única sala ampla com a arte nova. Layouts anteriores (8 departamentos, 2 salas) continuam salvos na lista, mas deixam de ser o ativo.
        const padrao = ativo?.dados.meta?.padrao; const antigo = ativo && padrao !== VERSAO_PADRAO && (padrao === '2.1' || (padrao == null && ativo.dados.departamentos.some((d) => ['diretoria', 'pesquisa', 'produtos'].includes(d.chave))));
        if (!ativo || antigo) {
          const lista = await api.get<LayoutResumo[]>('/layouts'); const ja = lista.find((l) => l.nome === 'Escritório 3.0');
          if (ja) { await api.post(`/layouts/${ja.id}/ativar`); ativo = await api.get<LayoutServidor>(`/layouts/${ja.id}`); }
          else ativo = await api.post<LayoutServidor>('/layouts', { nome: 'Escritório 3.0', dados: layoutPadrao(mapa), ativar: true });
        }
        if (!ativo) throw new Error('Não foi possível abrir o layout do escritório.');
        if (vincularIds(ativo.dados, ags)) ativo = await api.put<LayoutServidor>(`/layouts/${ativo.id}`, { dados: ativo.dados, versaoBase: ativo.versao });
        if (!vivo || !host.current) return;
        const m = new OfficeEngine(host.current, token); await m.init(); if (!vivo) { m.destroy(); return; }
        motor.current = m; (window as unknown as { __office?: OfficeEngine }).__office = m;   // gancho de depuração e dos testes de navegador
        const c = new Construtor(m); c.aoMudar = setEc; construtor.current = c;
        m.bus.on('camera', (e) => setZoom(e.zoom)); m.bus.on('hover', (e) => setHover(e.rotulo)); m.bus.on('aviso', (e) => aviso(e.texto)); m.bus.on('modo', (e) => setModo(e));
        m.bus.on('selecionar', (a: AlvoSelecao) => { if (a.tipo === 'personagem' && a.agenteId) { setAgenteSel(a.agenteId); setAba('agentes'); setFerramenta(null); } else if (a.tipo === 'departamento') { setDepSel(a.chave); setAba('escritorio'); setFerramenta('departamento'); } });
        m.bus.on('acao', (a) => abrirFerramenta(a.alvo, a.agenteId));
        await carregarResto(); await carregarLayoutServidor(ativo); setPronto(true);
        setInterval(() => { if (!document.hidden) api.get<Tarefa[]>('/tarefas').then(setTarefas).catch(() => {}); }, 6000);
      } catch (e) { setErro(e instanceof Error ? e.message : String(e)); }
    })();
    return () => { vivo = false; if (timer) clearInterval(timer); motor.current?.destroy(); motor.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (equipe.painel) aplicarAgentes(equipe.painel.agentes); }, [equipe.painel, aplicarAgentes]);
  const abrirFerramenta = (alvo: string, agenteId: string | null): void => {
    const rota: Record<string, Aba> = { financeiro: 'financeiro', produtos: 'produtos', campanhas: 'campanhas', conectores: 'integracoes', importador: 'importar', reunioes: 'conversas', assets: 'assets', indicadores: 'escritorio', estoque: 'estoque' };
    if (alvo === 'estacao') { if (agenteId) { setAgenteSel(agenteId); setAba('agentes'); setFerramenta(null); } else { setAba('tarefas'); setFerramenta(null); aviso('Esta estação ainda não tem um agente. Use o modo Edição para ligar um.'); } return; }
    if (alvo === 'estudio-video' || alvo === 'video-editor' || alvo === 'video-cut') { setFerramenta('estudio-video'); setAba('escritorio'); return; }
    if (rota[alvo]) { setAba(rota[alvo]); setFerramenta(alvo === 'indicadores' ? 'indicadores' : null); }
  };

  const mudarModo = (m: Modo): void => {
    const mo = motor.current; if (!mo) return;
    if ((modo === 'construcao' || modo === 'edicao') && !(m === 'construcao' || m === 'edicao') && construtor.current?.sujo() && !window.confirm('Há alterações não salvas no layout. Sair do modo de edição mesmo assim? (elas continuam na tela até recarregar)')) return;
    mo.setModo(m); setModo(m);
    if (m === 'construcao' || m === 'edicao') { construtor.current?.ativar(); construtor.current?.setFerramenta(m === 'edicao' ? 'selecionar' : 'objeto'); setAba('construtor' as Aba); } else { construtor.current?.desativar(); if (aba === ('construtor' as Aba)) setAba('escritorio'); }
  };

  const usarNoMapa = (a: AssetM): void => { motor.current?.assets.set(a.id, a); mudarModo('construcao'); construtor.current?.setTipoObjeto(`asset:${a.id}`); aviso(`“${a.nome}”: clique no mapa para colocar.`); };
  const setCamada = (n: string, v: boolean): void => { motor.current?.setCamadaVisivel(n, v); setCamadas(motor.current?.camadas() ?? {}); };
  const zoomar = (p: number): void => { const m = motor.current; if (!m) return; m.camera.zoomPasso(p); setZoom(m.camera.zoom); };
  const agenteAtual = agentes.find((a) => a.id === agenteSel) ?? null;
  const emConstrucao = modo === 'construcao' || modo === 'edicao';

  const novoLayoutVazio = async (): Promise<void> => { try { const r = await api.post<LayoutServidor>('/layouts', { nome: 'Novo escritório', dados: layoutVazio(24, 18, 'madeira'), ativar: true }); await carregarLayoutServidor(r); await carregarResto(); } catch (e) { aviso(e instanceof Error ? e.message : String(e)); } };
  const duplicar = async (): Promise<void> => { const ref = layoutRef.current; if (!ref) return; try { const r = await api.post<LayoutServidor>(`/layouts/${ref.id}/duplicar`); await api.post(`/layouts/${r.id}/ativar`); await carregarLayoutServidor(r); await carregarResto(); aviso('Layout duplicado — você está editando a cópia'); } catch (e) { aviso(e instanceof Error ? e.message : String(e)); } };
  const abrirLayout = async (id: string): Promise<void> => { try { const r = await api.get<LayoutServidor>(`/layouts/${id}`); await api.post(`/layouts/${id}/ativar`); await carregarLayoutServidor(r); await carregarResto(); } catch (e) { aviso(e instanceof Error ? e.message : String(e)); } };
  const removerLayout = async (id: string): Promise<void> => { if (!window.confirm('Remover este layout?')) return; try { await api.del(`/layouts/${id}`); await carregarResto(); const ativo = await api.get<LayoutServidor | null>('/layouts/ativo'); if (ativo && ativo.id !== layoutRef.current?.id) await carregarLayoutServidor(ativo); } catch (e) { aviso(e instanceof Error ? e.message : String(e)); } };

  if (erro) return <div className="o-erro"><h2>Commerce Office</h2><p>{erro}</p><a href="/login" target="_top">Entrar</a></div>;
  const nomeDep = depSel ? layout?.departamentos.find((d) => d.chave === depSel)?.nome ?? DEPARTAMENTOS[depSel] ?? depSel : '';

  return (
    <div className={`o-app ${modo === 'visualizacao' ? 'vis' : ''}`}>
      <div className="o-palco" data-testid="palco"><div ref={host} className="o-canvas" />
        <header className="o-topo">
          <b className="o-marca">CODENIAC <span>Commerce Office</span></b>
          <nav className="o-modos" aria-label="Modo">{MODOS.map(([k, r]) => <button key={k} type="button" className={modo === k ? 'on' : ''} onClick={() => mudarModo(k)}>{r}</button>)}</nav>
          <div className="o-zoom"><Botao pequeno onClick={() => zoomar(-1)} aria-label="Menos zoom">−</Botao><span>{Math.round(zoom * 100)}%</span><Botao pequeno onClick={() => zoomar(1)} aria-label="Mais zoom">+</Botao><Botao pequeno onClick={() => { motor.current?.camera.ajustar(); setZoom(motor.current?.camera.zoom ?? 1); }}>Ajustar</Botao></div>
          <div className="o-agentes-mini">{agentes.map((a) => <button key={a.id} type="button" className="o-av" title={`${a.nome}: ${ESTADO_ROTULO[a.estado] ?? a.estado}`} onClick={() => { setAgenteSel(a.id); setAba('agentes'); setFerramenta(null); }}><i className={`d ${corEstado(a.estado)}`} />{iniciais(a.nome)}</button>)}</div>
          {layoutAtual && <small className="o-nome-layout">{layoutAtual.nome} · v{layoutAtual.versao}</small>}
        </header>
        {hover && <div className="o-dica">{hover}</div>}
        {!pronto && <div className="o-carregando">Abrindo o escritório…</div>}
        <Baloes motor={motor.current} novas={novasMsgs} segundos={equipe.painel?.config.balaoSegundos ?? 7} />
        {modo !== 'visualizacao' && !emConstrucao && pronto && <CaixaChefe painel={equipe.painel} aoEnviar={equipe.enviarOrdem} aoCancelar={equipe.cancelar} aviso={aviso} />}
        <div className="o-avisos" role="status">{avisos.map((a) => <div key={a.id}>{a.texto}</div>)}</div>
        {modo === 'visualizacao' && <button type="button" className="o-sair-vis" onClick={() => mudarModo('execucao')}>Sair da visualização</button>}
        {emConstrucao && ec && <div className="o-barra-constr"><Etiqueta cor={ec.sujo ? 'amarelo' : 'verde'}>{ec.sujo ? 'alterações não salvas' : 'layout salvo'}</Etiqueta></div>}
      </div>
      {modo !== 'visualizacao' && (
        <aside className="o-lateral" aria-label="Painéis">
          <nav className="o-abas-nav">{emConstrucao && <button type="button" className={aba === ('construtor' as Aba) ? 'on' : ''} onClick={() => setAba('construtor' as Aba)}>Construtor</button>}{ABAS.map(([k, r]) => <button key={k} type="button" className={aba === k ? 'on' : ''} onClick={() => { setAba(k); setFerramenta(null); }}>{r}</button>)}</nav>
          <div className="o-lateral-corpo">
            {aba === ('construtor' as Aba) && emConstrucao && construtor.current && ec && layout && motor.current && <PainelConstrutor c={construtor.current} e={ec} motor={motor.current} layout={motor.current.layout} layouts={layouts} assets={assets} agentes={agentes} aoSalvar={salvarLayout} aoNovo={novoLayoutVazio} aoDuplicar={duplicar} aoAbrir={abrirLayout} aoRemoverLayout={removerLayout} camadas={camadas} setCamada={setCamada} modo={modo} salvando={salvando} />}
            {aba === 'escritorio' && (ferramenta === 'departamento' && depSel && layout ? <PainelDepartamento chave={depSel} nome={nomeDep} layout={layout} agentes={agentes} tarefas={tarefas} abrirAgente={(id) => { setAgenteSel(id); setAba('agentes'); }} abrirTarefas={() => setAba('tarefas')} />
              : ferramenta === 'estudio-video' ? <EstudioVideo agentes={agentes} aoMudar={atualizarTudo} aviso={aviso} /> : <PainelIndicadores estado={estado} agentes={agentes} tarefas={tarefas} resumoReal={resumo} />)}
            {aba === 'agentes' && (agenteAtual ? <div className="o-pilha"><Botao pequeno onClick={() => setAgenteSel(null)}>← Todos os agentes</Botao><PainelAgente agente={agenteAtual} tarefas={tarefas} aoMudar={atualizarTudo} aviso={aviso} abrirConversas={(id) => { setFiltroConversa(id); setAba('conversas'); }} /></div> : <ListaAgentes agentes={agentes} abrir={(id) => { setAgenteSel(id); const p = motor.current?.listaPessoas().find((x) => x.agenteId === id); if (p) motor.current?.selecionar({ tipo: 'personagem', id: p.id, agenteId: id }); }} />)}
            {aba === 'equipe' && <PainelEquipe painel={equipe.painel} ordens={equipe.ordens} tarefas={tarefas} agentes={agentes} aoMudar={() => { equipe.atualizar(); atualizarTudo(); }} aviso={aviso} abrirAgente={(id) => { setAgenteSel(id); setAba('agentes'); }} />}
            {aba === 'conversas' && <PainelConversas mensagens={equipe.mensagens} ordens={equipe.ordens} agentes={agentes} filtroAgente={filtroConversa} limparFiltro={() => setFiltroConversa(null)} />}
            {aba === 'documentos' && <PainelDocumentos versao={equipe.ordens.length + equipe.mensagens.length} />}
            {aba === 'estoque' && <PainelEstoque versao={equipe.mensagens.length} aviso={aviso} />}
            {aba === 'tarefas' && <PainelTarefas tarefas={tarefas} agentes={agentes} aoMudar={atualizarTudo} aviso={aviso} departamento={depSel ?? undefined} />}
            {aba === 'produtos' && <PainelProdutos produtos={produtos} aoMudar={atualizarTudo} aviso={aviso} />}
            {aba === 'financeiro' && <PainelFinanceiro versao={versaoFin} aoMudar={atualizarTudo} aviso={aviso} />}
            {aba === 'importar' && <PainelImportador historico={importacoes} aoMudar={atualizarTudo} aviso={aviso} />}
            {aba === 'integracoes' && <PainelConectores aoMudar={atualizarTudo} aviso={aviso} />}
            {aba === 'campanhas' && <PainelCampanhas campanhas={campanhas} produtos={produtos} agentes={agentes} aoMudar={atualizarTudo} aviso={aviso} />}
            {aba === 'reunioes' && <PainelReunioes reunioes={reunioes} agentes={agentes} aoMudar={atualizarTudo} aviso={aviso} />}
            {aba === 'assets' && <PainelAssets assets={assets} aoMudar={atualizarTudo} aviso={aviso} usarNoMapa={usarNoMapa} />}
            {aba === 'personagens' && <PainelPersonagens assets={assets} personagens={personagens} agentes={agentes} aoMudar={atualizarTudo} aviso={aviso} />}
          </div>
        </aside>)}
    </div>
  );
}

function ListaAgentes({ agentes, abrir }: { agentes: Agente[]; abrir: (id: string) => void }) {
  return <div className="o-pilha"><p className="o-mut">Os funcionários são agentes de IA reais. O estado abaixo vem da execução, não é encenado.</p>
    {agentes.map((a) => <button key={a.id} type="button" className="o-cartao o-agente-linha" onClick={() => abrir(a.id)}><span><b>{a.nome}</b><small>{a.cargo}</small></span><Etiqueta cor={corEstado(a.estado)}>{ESTADO_ROTULO[a.estado] ?? a.estado}</Etiqueta><small>{DEPARTAMENTOS[a.departamento]} · {a.tarefasAbertas} tarefa(s) aberta(s)</small></button>)}</div>;
}

function EstudioVideo({ agentes, aoMudar, aviso }: { agentes: Agente[]; aoMudar: () => void; aviso: (t: string) => void }) {
  const marina = agentes.find((a) => a.chave === 'eleonor');
  return (
    <div className="o-pilha"><section className="o-cartao"><header><h4>Estúdio Audiovisual</h4><Etiqueta cor="amarelo">ferramentas pendentes</Etiqueta></header>
      <p><b>Editor de Vídeo</b> e <b>Video Cut</b> ainda não existem no Estúdio do Hub (hoje são apenas cartões “em breve”). Por isso não há nada para integrar tecnicamente agora — e o escritório não finge que há.</p>
      <p className="o-mut">O que funciona hoje: a Eleonor cria conceitos, roteiros e imagens (pela ferramenta de imagens do Hub) e registra nas campanhas. Quando as ferramentas de vídeo existirem, estas estações passam a abri-las.</p>
      <div className="o-linha"><a className="o-btn peq" href="/#/estudio" target="_top">Abrir o Estúdio do Hub</a>{marina && <Botao pequeno onClick={async () => { try { const t = await api.post<{ id: string }>('/tarefas', { nome: 'Propor conceito visual e roteiro para o próximo vídeo', agenteId: marina.id, departamento: 'audiovisual', descricao: 'Proponha um conceito visual e um roteiro curto para um vídeo de divulgação de produto afiliado. Baseie-se nos produtos cadastrados (use a ferramenta de produtos) e cite que o editor de vídeo ainda não existe.' }); await api.post(`/tarefas/${t.id}/despachar`); aviso('Marina começou'); } catch (e) { aviso(e instanceof Error ? e.message : String(e)); } aoMudar(); }}>Pedir um roteiro à Marina</Botao>}</div>
    </section></div>
  );
}
