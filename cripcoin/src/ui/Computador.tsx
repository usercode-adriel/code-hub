// SISTEMA OPERACIONAL DO COMPUTADOR (pixel art): área de trabalho, barra de tarefas, menu iniciar, janelas e aplicativos reais.
// Arquivos ficam em `projeto.computadores[idDoObjeto].fs` e são salvos junto com o projeto.
import { useRef, useState, type ReactNode } from 'react';
import { CATEGORIAS, ITENS, precoVenda } from '../dados/catalogo';
import type { Jogo } from '../nucleo/jogo';
import { diaDe, horaTexto } from '../nucleo/tempo';
import { achar, copiar, criar, esvaziarLixeira, excluir, EXT, fsInicial, listarArquivos, mover, renomear, salvar } from '../sistemas/arquivos';
import { comprar, estoqueDe } from '../sistemas/economia';
import { lerPagina, pesquisar, type Pagina, type RespostaPesquisa } from '../sistemas/pesquisa';
import type { NoArquivo } from '../tipos';
import { cc, useJogo } from './comum';
import { IconeItem } from './Paineis';

type App = 'arquivos' | 'navegador' | 'notas' | 'calculadora' | 'loja' | 'config' | 'editor';
interface Jan { id: number; app: App; x: number; y: number; w: number; arquivo?: string }
const APPS: { id: App; nome: string; icone: string }[] = [{ id: 'arquivos', nome: 'Arquivos', icone: '📁' }, { id: 'navegador', nome: 'Navegador', icone: '🌐' }, { id: 'notas', nome: 'Notas', icone: '📝' }, { id: 'calculadora', nome: 'Calculadora', icone: '🧮' }, { id: 'loja', nome: 'LOJA', icone: '🛒' }, { id: 'config', nome: 'Configurações', icone: '⚙' }];
const PAPEIS: Record<string, string> = { azul: 'linear-gradient(135deg,#3a86b4,#2a5c85)', verde: 'linear-gradient(135deg,#4aa56a,#2a6a45)', roxo: 'linear-gradient(135deg,#7a5ab4,#3a2a6a)', escuro: 'linear-gradient(135deg,#2a2a35,#14141c)', laranja: 'linear-gradient(135deg,#e0883a,#8a3a1a)' };

export function SO({ jogo, id, fechar, abrirLoja }: { jogo: Jogo; id: string; fechar: () => void; abrirLoja: boolean }) {
  useJogo(jogo); const p = jogo.p; p.computadores[id] ??= fsInicial(); const pc = p.computadores[id];
  const [jans, setJans] = useState<Jan[]>(abrirLoja ? [{ id: 1, app: 'loja', x: 160, y: 14, w: 560 }] : []); const [menu, setMenu] = useState(false); const prox = useRef(2); const [ligado, setLigado] = useState(false);
  const [boot] = useState(() => true); void boot; void ligado; void setLigado;
  const abrir = (app: App, arquivo?: string): void => { setMenu(false); setJans((j) => { const ja = j.find((q) => q.app === app && q.arquivo === arquivo); if (ja) return [...j.filter((q) => q !== ja), ja]; const n = j.length; return [...j, { id: prox.current++, app, x: 160 + n * 22, y: 10 + n * 20, w: app === 'calculadora' ? 260 : app === 'loja' ? 580 : 520, arquivo }]; }); };
  const fecharJan = (jid: number): void => setJans((j) => j.filter((q) => q.id !== jid));
  const mexer = (jid: number, dx: number, dy: number): void => setJans((j) => j.map((q) => (q.id === jid ? { ...q, x: q.x + dx, y: q.y + dy } : q)));
  const frente = (jid: number): void => setJans((j) => { const q = j.find((z) => z.id === jid); return q && j[j.length - 1] !== q ? [...j.filter((z) => z !== q), q] : j; });
  const nomeApp = (j: Jan): string => (j.app === 'editor' ? (achar(pc.fs, j.arquivo ?? '')?.no.nome ?? 'Editor') : APPS.find((a) => a.id === j.app)?.nome ?? '');
  return (
    <div className="veu" onMouseDown={(e) => { if (e.target === e.currentTarget) fechar(); }}>
      <div className="janela" style={{ width: 'min(900px,100%)' }} data-testid="so">
        <div className="jan-barra"><span>💻 {pc.papel === undefined ? 'Computador' : 'Computador'} — CripcoinOS</span><button className="x" onClick={fechar} data-testid="so-fechar">✕</button></div>
        <div className="so"><div className="area" style={{ background: PAPEIS[p.config.papelDeParede] ?? PAPEIS.azul }} onMouseDown={() => setMenu(false)}>
          <div className="icones">{APPS.map((a) => <button key={a.id} className="ico" onClick={() => abrir(a.id)} data-testid={`ico-${a.id}`}><span>{a.icone}</span>{a.nome}</button>)}</div>
          {jans.map((j, i) => (
            <div key={j.id} className="app" style={{ left: j.x, top: j.y, width: j.w, maxWidth: '96%', zIndex: i + 1, maxHeight: '96%' }} onMouseDown={() => frente(j.id)} data-testid={`app-${j.app}`}>
              <div className="barra-app" onPointerDown={(e) => { const el = e.currentTarget; el.setPointerCapture(e.pointerId); let lx = e.clientX; let ly = e.clientY; const mv = (ev: PointerEvent): void => { mexer(j.id, ev.clientX - lx, ev.clientY - ly); lx = ev.clientX; ly = ev.clientY; }; const fim = (): void => { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', fim); }; el.addEventListener('pointermove', mv); el.addEventListener('pointerup', fim); }}>
                <span>{nomeApp(j)}</span><button className="x" onPointerDown={(e) => e.stopPropagation()} onClick={() => fecharJan(j.id)}>✕</button></div>
              <div className="corpo">
                {j.app === 'arquivos' && <Arquivos jogo={jogo} cid={id} abrirArquivo={(a) => abrir('editor', a)} />}
                {j.app === 'editor' && j.arquivo && <Editor jogo={jogo} cid={id} aid={j.arquivo} />}
                {j.app === 'notas' && <Notas jogo={jogo} cid={id} />}
                {j.app === 'calculadora' && <Calculadora />}
                {j.app === 'navegador' && <Navegador jogo={jogo} cid={id} />}
                {j.app === 'loja' && <Loja jogo={jogo} />}
                {j.app === 'config' && <ConfigPC jogo={jogo} />}
              </div></div>))}
          {menu && <div className="menu-start" data-testid="menu-start">{APPS.map((a) => <button key={a.id} onClick={() => abrir(a.id)}>{a.icone} {a.nome}</button>)}<button className="perigo" onClick={fechar}>⏻ Desligar</button></div>}
        </div>
          <div className="taskbar"><button onClick={() => setMenu(!menu)} className="primario" data-testid="btn-iniciar">▣ Iniciar</button>
            {jans.map((j) => <button key={j.id} onClick={() => frente(j.id)}>{nomeApp(j).slice(0, 12)}</button>)}
            <span className="relogio" style={{ marginLeft: 'auto' }}>◈ {cc(Math.floor(p.cc * 10) / 10)} · {horaTexto(p.minuto)}</span></div></div>
      </div>
    </div>
  );
}

// ---------- Arquivos ----------
function Arquivos({ jogo, cid, abrirArquivo }: { jogo: Jogo; cid: string; abrirArquivo: (id: string) => void }) {
  const pc = jogo.p.computadores[cid]; const [atual, setAtual] = useState(pc.fs.id); const [sel, setSel] = useState<string | null>(null); const [msg, setMsg] = useState(''); const [nome, setNome] = useState(''); const [tipo, setTipo] = useState<NoArquivo['tipo']>('txt'); const [ren, setRen] = useState('');
  const pasta = achar(pc.fs, atual)?.no ?? pc.fs; const pai = achar(pc.fs, pasta.id)?.pai; const alvo = sel ? achar(pc.fs, sel)?.no ?? null : null;
  const fazer = (f: () => string | void): void => { try { const r = f(); setMsg(r ?? ''); jogo.emitir(); } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); } };
  const pastas: { id: string; nome: string }[] = []; const rec = (n: NoArquivo, pre: string): void => { if (n.tipo !== 'pasta') return; pastas.push({ id: n.id, nome: pre + n.nome }); for (const f of n.filhos ?? []) rec(f, `${pre}${n.nome}/`); }; rec(pc.fs, '');
  const [dest, setDest] = useState('');
  return (
    <div data-testid="arquivos">
      <div className="linha"><button disabled={!pai} onClick={() => pai && setAtual(pai.id)}>⬆ Subir</button><b>{pasta.nome}</b>{pasta.nome === 'Lixeira' && <button className="perigo" onClick={() => fazer(() => `${esvaziarLixeira(pc.fs)} item(ns) apagado(s) de vez.`)}>Esvaziar</button>}</div>
      <div className="linha"><input placeholder="Nome do novo item" value={nome} onChange={(e) => setNome(e.target.value)} data-testid="arq-nome" /><select value={tipo} onChange={(e) => setTipo(e.target.value as NoArquivo['tipo'])} style={{ width: 120 }}><option value="txt">Texto</option><option value="doc">Documento</option><option value="nota">Nota</option><option value="relatorio">Relatório</option><option value="projeto">Projeto</option><option value="pasta">Pasta</option></select>
        <button className="primario" onClick={() => fazer(() => { const n = criar(pc.fs, pasta.id, nome, tipo); setNome(''); setSel(n.id); return `Criado: ${n.nome}`; })} data-testid="arq-criar">Criar</button></div>
      {(pasta.filhos ?? []).length === 0 && <div className="dim">Pasta vazia.</div>}
      {(pasta.filhos ?? []).map((f) => (
        <div key={f.id} className="item" style={{ background: sel === f.id ? '#cfc6f0' : '#f6f3ff', color: '#1b1626', cursor: 'pointer' }} onClick={() => { setSel(f.id); setRen(f.nome); }} onDoubleClick={() => (f.tipo === 'pasta' ? (setAtual(f.id), setSel(null)) : abrirArquivo(f.id))} data-testid="arq-item">
          <span>{f.tipo === 'pasta' ? '📁' : '📄'}</span><div className="info">{f.nome}{EXT[f.tipo]}</div><span className="dim">{new Date(f.modificado).toLocaleDateString('pt-BR')}</span></div>))}
      {alvo && (<div className="cartao" style={{ background: '#d8d0f0', color: '#1b1626' }}>
        <div className="linha"><button onClick={() => (alvo.tipo === 'pasta' ? setAtual(alvo.id) : abrirArquivo(alvo.id))}>Abrir</button><input value={ren} onChange={(e) => setRen(e.target.value)} style={{ width: 150 }} /><button onClick={() => fazer(() => { renomear(pc.fs, alvo.id, ren); return 'Renomeado.'; })}>Renomear</button><button className="perigo" onClick={() => fazer(() => { const r = excluir(pc.fs, alvo.id); setSel(null); return r === 'lixeira' ? 'Movido para a Lixeira.' : 'Apagado de vez.'; })}>Excluir</button></div>
        <div className="linha"><select value={dest} onChange={(e) => setDest(e.target.value)}><option value="">Escolher pasta...</option>{pastas.map((q) => <option key={q.id} value={q.id}>{q.nome}</option>)}</select>
          <button disabled={!dest} onClick={() => fazer(() => { mover(pc.fs, alvo.id, dest); setSel(null); return 'Movido.'; })}>Mover</button><button disabled={!dest} onClick={() => fazer(() => { copiar(pc.fs, alvo.id, dest); return 'Copiado.'; })}>Copiar</button></div></div>)}
      {msg && <div className="dim" style={{ color: '#4a3d73' }}>{msg}</div>}
    </div>
  );
}
function Editor({ jogo, cid, aid }: { jogo: Jogo; cid: string; aid: string }) {
  const fs = jogo.p.computadores[cid].fs; const no = achar(fs, aid)?.no; const [txt, setTxt] = useState(no?.conteudo ?? ''); const [salvo, setSalvo] = useState(true);
  if (!no) return <div>Arquivo não existe mais.</div>;
  return (<div><textarea style={{ minHeight: 220 }} value={txt} onChange={(e) => { setTxt(e.target.value); setSalvo(false); }} data-testid="editor-texto" />
    <div className="linha"><button className="primario" onClick={() => { salvar(fs, aid, txt); setSalvo(true); jogo.emitir(); }} data-testid="editor-salvar">Salvar</button><span>{salvo ? 'Salvo' : 'Alterações não salvas'}</span></div></div>);
}
function Notas({ jogo, cid }: { jogo: Jogo; cid: string }) {
  const fs = jogo.p.computadores[cid].fs; const pasta = (fs.filhos ?? []).find((f) => f.nome === 'Notas') ?? fs; const [id, setId] = useState<string | null>(null); const [txt, setTxt] = useState('');
  const abrirN = (n: NoArquivo): void => { setId(n.id); setTxt(n.conteudo ?? ''); };
  return (<div><div className="linha"><button className="primario" onClick={() => { const n = criar(fs, pasta.id, 'Nota', 'nota', ''); abrirN(n); jogo.emitir(); }}>+ Nova nota</button></div>
    <div className="linha" style={{ alignItems: 'flex-start' }}><div style={{ width: 130 }}>{(pasta.filhos ?? []).map((n) => <button key={n.id} style={{ display: 'block', width: '100%', marginBottom: 3 }} className={id === n.id ? 'ativo' : ''} onClick={() => abrirN(n)}>{n.nome}</button>)}</div>
      <div className="grow">{id ? <><textarea style={{ minHeight: 150 }} value={txt} onChange={(e) => setTxt(e.target.value)} data-testid="nota-texto" /><div className="linha"><button className="primario" onClick={() => { salvar(fs, id, txt); renomear(fs, id, txt.split('\n')[0].slice(0, 24) || 'Nota'); jogo.emitir(); }} data-testid="nota-salvar">Salvar</button><button className="perigo" onClick={() => { excluir(fs, id); setId(null); jogo.emitir(); }}>Excluir</button></div></> : <div className="dim">Escolha ou crie uma nota.</div>}</div></div></div>);
}
function Calculadora() {
  const [tela, setTela] = useState('0'); const [ac, setAc] = useState<number | null>(null); const [op, setOp] = useState<string | null>(null); const [novo, setNovo] = useState(true);
  const calc = (a: number, b: number, o: string): number => (o === '+' ? a + b : o === '-' ? a - b : o === '×' ? a * b : b === 0 ? NaN : a / b);
  const dig = (d: string): void => { setTela((t) => (novo || t === '0' ? (d === '.' ? '0.' : d) : d === '.' && t.includes('.') ? t : t + d)); setNovo(false); };
  const oper = (o: string): void => { const v = Number(tela); if (ac !== null && op && !novo) { const r = calc(ac, v, op); setAc(r); setTela(Number.isNaN(r) ? 'Erro' : String(Math.round(r * 1e9) / 1e9)); } else setAc(v); setOp(o); setNovo(true); };
  const igual = (): void => { if (ac === null || !op) return; const r = calc(ac, Number(tela), op); setTela(Number.isNaN(r) ? 'Erro' : String(Math.round(r * 1e9) / 1e9)); setAc(null); setOp(null); setNovo(true); };
  return (<div data-testid="calculadora"><div className="cartao" style={{ background: '#120e1c', color: '#6fe39a', textAlign: 'right', fontSize: 16 }} data-testid="calc-tela">{tela}</div>
    <div className="grade" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginTop: 6 }}>{['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '-', '0', '.', '=', '+'].map((k) => <button key={k} onClick={() => (k === '=' ? igual() : '+-×÷'.includes(k) ? oper(k) : dig(k))}>{k}</button>)}<button className="perigo" style={{ gridColumn: 'span 4' }} onClick={() => { setTela('0'); setAc(null); setOp(null); setNovo(true); }}>C</button></div></div>);
}
function ConfigPC({ jogo }: { jogo: Jogo }) {
  return (<div><h3>Papel de parede</h3><div className="linha">{Object.keys(PAPEIS).map((k) => <button key={k} className={jogo.p.config.papelDeParede === k ? 'ativo' : ''} style={{ background: PAPEIS[k], width: 70, height: 40 }} onClick={() => { jogo.p.config.papelDeParede = k; jogo.emitir(); }} />)}</div>
    <div className="dim">CripcoinOS 1.0 — dados salvos no projeto. Dia {diaDe(jogo.p.minuto)}.</div></div>);
}

// ---------- Navegador (pesquisa REAL) ----------
function Navegador({ jogo, cid }: { jogo: Jogo; cid: string }) {
  const [q, setQ] = useState(''); const [res, setRes] = useState<RespostaPesquisa | null>(null); const [pag, setPag] = useState<Pagina | null>(null); const [erro, setErro] = useState(''); const [carregando, setCarregando] = useState(false);
  const buscar = async (): Promise<void> => { if (!q.trim()) return; setCarregando(true); setErro(''); setPag(null); try { setRes(await pesquisar(q)); } catch (e) { setRes(null); setErro(e instanceof Error ? e.message : String(e)); } finally { setCarregando(false); } };
  const ler = async (url: string): Promise<void> => { setCarregando(true); setErro(''); try { setPag(await lerPagina(url)); } catch (e) { setErro(e instanceof Error ? e.message : String(e)); } finally { setCarregando(false); } };
  const guardarPag = (): void => { if (!pag) return; const fs = jogo.p.computadores[cid].fs; const pasta = (fs.filhos ?? []).find((f) => f.nome === 'Documentos') ?? fs; criar(fs, pasta.id, pag.title || 'Página', 'txt', `${pag.url}\n\n${pag.text}`); jogo.aviso('Página salva em Documentos.', 'ok'); jogo.emitir(); };
  return (<div data-testid="navegador"><div className="linha"><input placeholder="Pesquisar na web ou colar um endereço (https://...)" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void (/^https?:\/\//i.test(q) ? ler(q) : buscar()); }} data-testid="nav-busca" /><button className="primario" onClick={() => void (/^https?:\/\//i.test(q) ? ler(q) : buscar())} data-testid="nav-ir">Ir</button></div>
    {carregando && <div className="dim">Carregando...</div>}{erro && <div className="erro" data-testid="nav-erro">{erro}</div>}
    {res && !pag && (<div data-testid="nav-resultados"><div className="dim">Resultados reais ({res.fonte}).</div>{res.resumo && <div className="cartao" style={{ background: '#d8d0f0', color: '#1b1626' }}>{res.resumo}</div>}
      {res.resultados.map((r) => <div key={r.url} className="cartao" style={{ background: '#f6f3ff', color: '#1b1626', marginTop: 4 }}><a href={r.url} target="_blank" rel="noreferrer noopener" style={{ color: '#2a4aa0' }}>{r.titulo}</a><div className="dim" style={{ wordBreak: 'break-all' }}>{r.url}</div>{r.trecho && <div>{r.trecho}</div>}<button onClick={() => void ler(r.url)}>Ler aqui</button></div>)}</div>)}
    {pag && (<div><div className="linha"><button onClick={() => setPag(null)}>← Voltar</button><button onClick={guardarPag}>Salvar em Documentos</button><a href={pag.url} target="_blank" rel="noreferrer noopener">Abrir no site</a></div><b>{pag.title}</b><pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', maxHeight: 260, overflow: 'auto' }}>{pag.text}{pag.truncated ? '\n[…texto cortado]' : ''}</pre></div>)}
    {!res && !pag && !erro && !carregando && <div className="dim">Pesquisas usam a web de verdade (via servidor do Hub). Sem login no Hub não há pesquisa.</div>}</div>);
}

// ---------- Loja ----------
function Loja({ jogo }: { jogo: Jogo }) {
  useJogo(jogo); const p = jogo.p; const [cat, setCat] = useState('mesas'); const [q, setQ] = useState(''); const [conf, setConf] = useState<string | null>(null);
  const lista = ITENS.filter((d) => (q ? d.nome.toLowerCase().includes(q.toLowerCase()) : d.categoria === cat)); const ped = conf ? ITENS.find((d) => d.id === conf) : null;
  return (<div data-testid="loja"><div className="linha"><b>🛒 LOJA CRIPCOIN</b><span className="ouro" style={{ marginLeft: 'auto' }}>Saldo {cc(Math.floor(p.cc * 10) / 10)}</span></div>
    <input placeholder="Buscar item..." value={q} onChange={(e) => setQ(e.target.value)} />
    <div className="abas" style={{ marginTop: 6 }}>{CATEGORIAS.map((c) => <button key={c.id} className={cat === c.id && !q ? 'ativo' : ''} onClick={() => { setCat(c.id); setQ(''); }}>{c.nome}</button>)}</div>
    {lista.length === 0 && <div className="dim">Nada nesta categoria.</div>}
    {lista.map((d) => { const est = estoqueDe(p, d); return (<div className="item" key={d.id} data-testid="loja-item" style={{ background: '#f6f3ff', color: '#1b1626' }}><IconeItem id={d.id} /><div className="info"><b>{d.nome}</b><div className="dim" style={{ color: '#5a4a88' }}>{d.descricao}</div><div>{d.w}×{d.h} · revenda {precoVenda(d)} CC · estoque {est}</div></div><div style={{ textAlign: 'right' }}><div className="ouro" style={{ color: '#8a5a00' }}>{d.preco} CC</div><button className="primario" disabled={est < 1 || p.cc < d.preco} onClick={() => setConf(d.id)} data-testid={`comprar-${d.id}`}>{est < 1 ? 'Esgotado' : p.cc < d.preco ? 'Sem saldo' : 'Comprar'}</button></div></div>); })}
    {ped && (<div className="veu" style={{ position: 'absolute' }}><div className="janela" style={{ width: 340 }}><div className="jan-barra"><span>Confirmar compra</span></div><div className="jan-corpo"><p>Comprar <b>{ped.nome}</b> por <b className="ouro">{ped.preco} CC</b>?<br />Saldo depois: {cc(p.cc - ped.preco)}. O item vai para o inventário.</p><div className="linha dir"><button onClick={() => setConf(null)}>Cancelar</button><button className="primario" data-testid="confirmar-compra" onClick={() => { const rc = comprar(p, ped.id, 1); jogo.resultado(rc); if (rc.ok) jogo.notificar('compra', { item: ped.nome, valor: ped.preco }); setConf(null); }}>Comprar</button></div></div></div></div>)}</div>);
}
void listarArquivos; void (null as unknown as ReactNode);
