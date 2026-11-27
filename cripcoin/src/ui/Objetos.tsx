// JANELAS DOS OBJETOS INTERATIVOS: armário, quadro branco, cafeteira, impressora, TV, planta, lixeira, relógio e bebedouro.
// Cada objeto guarda o próprio estado em `objeto.estado` (ou em `projeto.armarios/quadros`), então tudo persiste no save.
import { useEffect, useRef, useState } from 'react';
import { item } from '../dados/catalogo';
import type { Jogo } from '../nucleo/jogo';
import { diaDe, diaSemana, horaTexto } from '../nucleo/tempo';
import { listarArquivos } from '../sistemas/arquivos';
import { adicionarIdeia, adicionarNota, agua, alternarTv, cafes, capacidade, comprarPapel, conteudoArmario, definir, enviarParaImpressora, estado, fila, graos, guardarNoArmario, imprimirProximo, limparFila, ligada, ocupacaoArmario, papel, prepararCafe, quadro, recarregarGraos, regar, retirarDoArmario, seca, tomarCafe } from '../sistemas/objetos';
import type { ObjetoColocado } from '../tipos';
import { Janela, useJogo } from './comum';
import { BEBIDAS } from '../dados/catalogo';
import { urlItem, urlObjeto } from '../render/arte';
import { Celular } from './Celular';
import manifesto from '../../public/arte/manifesto.json';
import { IconeItem } from './Paineis';

export function JanelaObjeto({ jogo, id, fechar }: { jogo: Jogo; id: string; fechar: () => void }) {
  useJogo(jogo); const o = jogo.p.objetos.find((q) => q.id === id); const d = o && item(o.def); if (!o || !d) return null;
  const T = d.nome;
  switch (d.interacao) {
    case 'armario': return <Janela titulo={`🗄 ${T}`} onFechar={fechar} largura={520}><Armario jogo={jogo} o={o} /></Janela>;
    case 'quadro': return <Janela titulo={`📋 ${T}`} onFechar={fechar} largura={680}><Quadro jogo={jogo} o={o} /></Janela>;
    case 'cafeteira': return <Janela titulo={`☕ ${T}`} onFechar={fechar} largura={420}><Cafeteira jogo={jogo} o={o} /></Janela>;
    case 'impressora': return <Janela titulo={`🖨 ${T}`} onFechar={fechar} largura={520}><Impressora jogo={jogo} o={o} /></Janela>;
    case 'tv': return <Janela titulo={`📺 ${T}`} onFechar={fechar} largura={380}><Tv jogo={jogo} o={o} /></Janela>;
    case 'planta': return <Janela titulo={`🌱 ${T}`} onFechar={fechar} largura={380}><Planta jogo={jogo} o={o} /></Janela>;
    case 'relogio': return <Janela titulo="🕒 Relógio" onFechar={fechar} largura={340}><div style={{ fontSize: 22, textAlign: 'center' }} className="ouro">{horaTexto(jogo.p.minuto)}</div><div style={{ textAlign: 'center' }}>Dia {diaDe(jogo.p.minuto)} · {diaSemana(jogo.p.minuto)}</div><div className="dim">Mostra o horário real do jogo (1 s = 1 min × velocidade).</div></Janela>;
    case 'frigobar': return <Janela titulo={`🧊 ${T}`} onFechar={fechar} largura={620}><Frigobar jogo={jogo} o={o} /></Janela>;
    case 'bolsa': return <Bolsa jogo={jogo} o={o} fechar={fechar} />;
    case 'lixeira': return <Janela titulo={`🗑 ${T}`} onFechar={fechar} largura={360}><Lixeira jogo={jogo} o={o} /></Janela>;
    default: return <Janela titulo={T} onFechar={fechar} largura={380}><p>{d.descricao}</p><div className="dim">Este objeto não tem função além de existir no escritório (ainda não implementada).</div></Janela>;
  }
}

function Armario({ jogo, o }: { jogo: Jogo; o: ObjetoColocado }) {
  const p = jogo.p; const aberto = !!estado(o, 'aberto', false); const c = conteudoArmario(p, o.id); const cap = capacidade(p, o.id); const oc = ocupacaoArmario(p, o.id);
  return (<div data-testid="armario"><div className="linha"><b>Porta: {aberto ? 'ABERTA' : 'FECHADA'}</b><button onClick={() => { definir(o, 'aberto', !aberto); jogo.emitir(); }} data-testid="armario-porta">{aberto ? 'Fechar porta' : 'Abrir porta'}</button><span className="dim">{oc}/{cap} espaços</span></div>
    <div className="barra"><i style={{ width: `${(oc / Math.max(1, cap)) * 100}%` }} /></div>
    {!aberto ? <div className="dim">Abra a porta para guardar ou retirar itens. (O sprite não tem versão “aberta”: o estado fica salvo mesmo assim.)</div> : (<>
      <h3>Dentro do armário</h3>{Object.keys(c).length === 0 && <div className="dim">Vazio.</div>}
      {Object.entries(c).map(([k, n]) => <div className="item" key={k}><IconeItem id={k} /><div className="info">{item(k)?.nome} x{n}</div><button onClick={() => jogo.resultado(retirarDoArmario(p, o.id, k, 1))}>Retirar</button></div>)}
      <h3>Seu inventário</h3>{Object.keys(p.inventario).length === 0 && <div className="dim">Inventário vazio.</div>}
      {Object.entries(p.inventario).map(([k, n]) => <div className="item" key={k}><IconeItem id={k} /><div className="info">{item(k)?.nome} x{n}</div><button className="primario" onClick={() => jogo.resultado(guardarNoArmario(p, o.id, k, 1))} data-testid="guardar-armario">Guardar</button></div>)}</>)}</div>);
}

function Quadro({ jogo, o }: { jogo: Jogo; o: ObjetoColocado }) {
  const q = quadro(jogo.p, o.id); const ref = useRef<HTMLCanvasElement>(null); const [cor, setCor] = useState('#1b1626'); const [tam, setTam] = useState(3); const [apagar, setApagar] = useState(false); const [nota, setNota] = useState(''); const [ideia, setIdeia] = useState('');
  const desenhando = useRef<{ cor: string; tam: number; apagar?: boolean; pts: [number, number][] } | null>(null);
  const redesenhar = (): void => { const c = ref.current; if (!c) return; const g = c.getContext('2d')!; g.fillStyle = '#fbfbf6'; g.fillRect(0, 0, c.width, c.height); g.lineCap = 'round'; g.lineJoin = 'round'; for (const t of q.tracos) { g.strokeStyle = t.apagar ? '#fbfbf6' : t.cor; g.lineWidth = t.tam; g.beginPath(); t.pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); if (t.pts.length === 1) g.lineTo(t.pts[0][0] + 0.1, t.pts[0][1]); g.stroke(); } };
  useEffect(redesenhar);
  const pt = (e: React.PointerEvent): [number, number] => { const r = ref.current!.getBoundingClientRect(); return [Math.round((e.clientX - r.left) * (ref.current!.width / r.width)), Math.round((e.clientY - r.top) * (ref.current!.height / r.height))]; };
  return (<div data-testid="quadro">
    <div className="linha">{['#1b1626', '#c0392b', '#2a6fd6', '#2e9b4a', '#e0a020'].map((k) => <button key={k} style={{ background: k, width: 26, height: 26, outline: !apagar && cor === k ? '3px solid #ffd75e' : 'none' }} onClick={() => { setCor(k); setApagar(false); }} />)}
      <button className={apagar ? 'ativo' : ''} onClick={() => setApagar(!apagar)}>Borracha</button><select value={tam} onChange={(e) => setTam(Number(e.target.value))} style={{ width: 70 }}>{[2, 3, 6, 10].map((n) => <option key={n}>{n}</option>)}</select>
      <button className="perigo" onClick={() => { q.tracos = []; jogo.emitir(); }}>Limpar tudo</button><button onClick={() => { q.tracos.pop(); jogo.emitir(); }}>Desfazer</button></div>
    <canvas ref={ref} width={620} height={300} style={{ width: '100%', background: '#fbfbf6', border: '3px solid #0d0a14', touchAction: 'none', cursor: 'crosshair' }} data-testid="quadro-canvas"
      onPointerDown={(e) => { ref.current!.setPointerCapture(e.pointerId); const t = { cor, tam: apagar ? tam * 3 : tam, apagar, pts: [pt(e)] as [number, number][] }; q.tracos.push(t); desenhando.current = t; redesenhar(); }}
      onPointerMove={(e) => { if (desenhando.current) { desenhando.current.pts.push(pt(e)); redesenhar(); } }} onPointerUp={() => { desenhando.current = null; jogo.emitir(); }} />
    <div className="linha" style={{ alignItems: 'flex-start' }}>
      <div className="grow"><h3>Lista / tarefas</h3><div className="linha"><input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Novo item" onKeyDown={(e) => { if (e.key === 'Enter') { adicionarNota(jogo.p, o.id, nota); setNota(''); jogo.emitir(); } }} data-testid="quadro-nota" /><button onClick={() => { adicionarNota(jogo.p, o.id, nota); setNota(''); jogo.emitir(); }}>+</button></div>
        {q.notas.map((n) => <div key={n.id} className="linha"><input type="checkbox" style={{ width: 'auto' }} checked={n.feito} onChange={() => { n.feito = !n.feito; jogo.emitir(); }} /><span className="grow" style={{ textDecoration: n.feito ? 'line-through' : 'none' }}>{n.texto}</span><button onClick={() => { q.notas = q.notas.filter((x) => x.id !== n.id); jogo.emitir(); }}>✕</button></div>)}</div>
      <div className="grow"><h3>Brainstorm</h3><div className="linha"><input value={ideia} onChange={(e) => setIdeia(e.target.value)} placeholder="Nova ideia" onKeyDown={(e) => { if (e.key === 'Enter') { adicionarIdeia(jogo.p, o.id, ideia); setIdeia(''); jogo.emitir(); } }} /><button onClick={() => { adicionarIdeia(jogo.p, o.id, ideia); setIdeia(''); jogo.emitir(); }}>+</button></div>
        {q.ideias.map((t, i) => <div key={i} className="tag" style={{ background: '#e0c43a', color: '#1b1626', padding: 6, display: 'block' }}>{t} <button style={{ padding: '0 4px' }} onClick={() => { q.ideias.splice(i, 1); jogo.emitir(); }}>✕</button></div>)}</div></div></div>);
}

function Cafeteira({ jogo, o }: { jogo: Jogo; o: ObjetoColocado }) {
  const p = jogo.p;
  return (<div data-testid="cafeteira"><div>☕ Xícaras prontas: <b className="ouro">{cafes(o)}</b>/6 · Grãos: <b>{graos(o)}</b></div>
    <div className="linha"><button className="primario" onClick={() => jogo.resultado(prepararCafe(p, o.id))}>Preparar café</button><button onClick={() => { if (tomarCafe(o)) { jogo.aviso('Você tomou um café. Mmm!', 'ok'); jogo.emitir(); } else jogo.aviso('Não há café pronto.', 'erro'); }}>Tomar uma xícara</button><button onClick={() => jogo.resultado(recarregarGraos(p, o.id))}>Comprar grãos (5 CC)</button></div>
    <div className="dim">Funcionários cansados (energia baixa) vão buscar café aqui sozinhos e recuperam energia.</div></div>);
}

function Impressora({ jogo, o }: { jogo: Jogo; o: ObjetoColocado }) {
  const p = jogo.p; const arqs = Object.entries(p.computadores).flatMap(([cid, c]) => listarArquivos(c.fs).filter((a) => a.no.nome !== 'Bem-vindo').map((a) => ({ cid, ...a }))); const [sel, setSel] = useState('');
  return (<div data-testid="impressora"><div>Papel: <b>{papel(o)}</b> folhas</div>
    <div className="linha"><select value={sel} onChange={(e) => setSel(e.target.value)}><option value="">Enviar arquivo de um computador...</option>{arqs.map((a) => <option key={a.no.id} value={`${a.cid}|${a.no.id}`}>{a.caminho}</option>)}</select>
      <button disabled={!sel} onClick={() => { const [c, f] = sel.split('|'); jogo.resultado(enviarParaImpressora(p, o.id, c, f)); }}>Enviar</button></div>
    <div className="linha"><button className="primario" onClick={() => jogo.resultado(imprimirProximo(p, o.id))}>Imprimir próximo</button><button onClick={() => jogo.resultado(comprarPapel(p, o.id))}>Comprar papel (8 CC)</button><button onClick={() => { limparFila(o); jogo.emitir(); }}>Limpar impressos</button></div>
    <h3>Fila</h3>{fila(o).length === 0 && <div className="dim">Sem trabalhos.</div>}{fila(o).map((t) => <div key={t.id} className="cartao">{t.nome} — <span className={t.estado === 'impresso' ? 'ok' : 'ouro'}>{t.estado === 'impresso' ? 'impresso' : 'na fila'}</span><div className="dim">{t.conteudo.slice(0, 80)}</div></div>)}</div>);
}
function Tv({ jogo, o }: { jogo: Jogo; o: ObjetoColocado }) {
  return (<div data-testid="tv"><div className="cartao" style={{ background: ligada(o) ? '#16384f' : '#000', height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8fd0ff' }}>{ligada(o) ? `▶ Painel da empresa — ${horaTexto(jogo.p.minuto)} · ${Math.floor(jogo.p.cc)} CC` : '(desligada)'}</div>
    <div className="linha"><button className="primario" onClick={() => { alternarTv(o); jogo.emitir(); }} data-testid="tv-toggle">{ligada(o) ? 'Desligar' : 'Ligar'}</button></div><div className="dim">A TV ligada brilha no escritório e mostra o resumo da empresa. Não reproduz vídeos.</div></div>);
}
function Planta({ jogo, o }: { jogo: Jogo; o: ObjetoColocado }) {
  return (<div data-testid="planta"><div>Água: <b className={seca(o) ? 'erro' : 'ok'}>{Math.round(agua(o))}%</b> {seca(o) && '— SECA!'}</div><div className="barra"><i style={{ width: `${agua(o)}%`, background: '#4a9fe0' }} /></div>
    <div className="linha"><button className="primario" onClick={() => { regar(o); jogo.aviso('Planta regada.', 'ok'); jogo.emitir(); }}>Regar</button></div><div className="dim">A água cai todo dia; sem rega a planta fica seca (e o sprite muda para “seca” quando o item tem versão seca).</div></div>);
}
function Lixeira({ jogo, o }: { jogo: Jogo; o: ObjetoColocado }) {
  const n = estado(o, 'lixo', 0);
  return (<div data-testid="lixeira"><div>Lixo: <b>{n}</b>/10</div><div className="linha"><button className="primario" onClick={() => { definir(o, 'lixo', 0); jogo.aviso('Lixeira esvaziada.', 'ok'); jogo.emitir(); }}>Esvaziar</button></div><div className="dim">Funcionários jogam o resto do café aqui.</div></div>);
}

/** Frigobar: ao abrir, o sprite troca para "aberto" e aparece o estoque de bebidas — infinito; cada clique leva uma para o inventário. */
function Frigobar({ jogo, o }: { jogo: Jogo; o: ObjetoColocado }) {
  useEffect(() => { definir(o, 'aberto', true); jogo.emitir(); return () => { definir(o, 'aberto', false); jogo.emitir(); }; }, [jogo, o]);
  const pegar = (id: string, nome: string): void => { jogo.p.inventario[id] = (jogo.p.inventario[id] ?? 0) + 1; jogo.aviso(`${nome} foi para o inventário (pode colocar numa mesa).`, 'ok'); jogo.emitir(); };
  return (<div className="frig" data-testid="frigobar"><img src={urlObjeto('frigobar-aberto')} alt="Frigobar aberto" />
    <div style={{ flex: 1 }}><div className="dim">Estoque infinito: clique para pegar.</div>
      <div className="frig-lista">{BEBIDAS.map((d) => <div key={d.id} className="slot" title={d.descricao} onClick={() => pegar(d.id, d.nome)} data-testid={`pegar-${d.id}`}><img src={urlObjeto(d.sprite)} alt="" />{d.nome}<br /><span className="ouro">∞</span></div>)}</div></div></div>);
}
const NOMES_ITENS: Record<string, string> = { 'colchonete-enrolado-rosa': 'Colchonete enrolado', 'colchonete-enrolado-vermelho': 'Colchonete enrolado', celular: 'Celular', escova: 'Escova', xuxinha: 'Xuxinha', moletom: 'Moletom', cropped: 'Cropped', shorts: 'Shorts', saia: 'Saia', batom: 'Batom', 'po-compacto': 'Pó compacto', 'paleta-sombras': 'Paleta de sombras', chapinha: 'Chapinha', perfume: 'Perfume', 'garrafa-termica': 'Garrafa térmica', hidratante: 'Hidratante', espelho: 'Espelho', 'oculos-sol': 'Óculos de sol', 'fones-bluetooth': 'Fones', headphone: 'Headphone', 'mascara-dormir': 'Máscara de dormir', 'garrafa-agua': 'Garrafa de água', necessaire: 'Necessaire', 'piranha-cabelo': 'Piranha', colar: 'Colar', brincos: 'Brincos', ecobag: 'Ecobag', 'bolsa-rosa': 'Bolsa rosa' };
/** Bolsa da funcionária: objetos pessoais (a TV não está aqui: é vendida na loja). O celular abre. */
function Bolsa({ jogo, o, fechar }: { jogo: Jogo; o: ObjetoColocado; fechar: () => void }) {
  const dona = jogo.p.funcionarios.find((f) => f.id === o.estado?.dona); const [cel, setCel] = useState(false);
  const itens = Object.keys((manifesto as { itens?: Record<string, unknown> }).itens ?? {}).filter((n) => n !== 'tv-netflix' && n !== o.def);
  if (cel && dona) return <Celular jogo={jogo} fid={dona.id} fechar={() => setCel(false)} />;
  return (<Janela titulo={`👜 ${item(o.def)?.nome ?? 'Bolsa'}${dona ? ` de ${dona.nome}` : ''}`} onFechar={fechar} largura={560}>
    <div data-testid="bolsa">{!dona && <div className="dim">Bolsa sem dona.</div>}
      <div className="frig-lista">{itens.map((n) => <div key={n} className={`slot ${n === 'celular' ? 'ativo' : ''}`} data-testid={`bolsa-${n}`} style={n === 'celular' ? { borderColor: '#ffd75e' } : undefined} onClick={() => { if (n === 'celular' && dona) setCel(true); }}><img src={urlItem(n)} alt="" />{NOMES_ITENS[n] ?? n}{n === 'celular' && <><br /><span className="ouro">abrir</span></>}</div>)}</div></div>
  </Janela>);
}
