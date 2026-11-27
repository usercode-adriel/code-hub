// CELULAR DA PERSONAGEM: layout de smartphone (barra de status, tela inicial com apps, barra de navegação).
// Apps: Instagram (perfis e posts fictícios em pixel art), Banco (salários que ela recebeu), Galeria (fotos dela) e Chrome (pesquisa real).
import { useMemo, useState } from 'react';
import type { Jogo } from '../nucleo/jogo';
import { horaTexto } from '../nucleo/tempo';
import { fotoPerfil, fotoURL } from '../render/fotos';
import { urlIcone } from '../render/arte';
import { autorDe, CONTAS, feedDe, galeriaDe, perfilConta, perfilDe, type Autor, type Foto, type Perfil, type Post } from '../sistemas/social';
import { Navegador } from './Computador';
import { useJogo } from './comum';

type App = 'home' | 'instagram' | 'banco' | 'galeria' | 'chrome';
const APPS: { id: Exclude<App, 'home'>; nome: string; icone: string }[] = [{ id: 'instagram', nome: 'Instagram', icone: 'instagram' }, { id: 'banco', nome: 'Bank', icone: 'banco' }, { id: 'galeria', nome: 'Galeria', icone: 'galeria' }, { id: 'chrome', nome: 'Chrome', icone: 'chrome' }];
const fmt = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace('.', ',')} mil` : String(n));

export function Celular({ jogo, fid, fechar }: { jogo: Jogo; fid: string; fechar: () => void }) {
  useJogo(jogo); const f = jogo.p.funcionarios.find((q) => q.id === fid); const [app, setApp] = useState<App>('home');
  if (!f) return null;
  return (
    <div className="veu" onMouseDown={(e) => { if (e.target === e.currentTarget) fechar(); }}>
      <div className="celular" data-testid="celular" role="dialog" aria-label={`Celular de ${f.nome}`}>
        <div className="cel-status"><span>{horaTexto(jogo.p.minuto)}</span><span className="cel-notch" /><span>▂▄▆ 5G ▮▮▮</span></div>
        <div className="cel-tela">
          {app === 'home' && (<div className="cel-home">
            <div className="cel-relogio">{horaTexto(jogo.p.minuto)}</div><div className="cel-dono">Celular de {f.nome}</div>
            <div className="cel-apps">{APPS.map((a) => <button key={a.id} className="cel-app" onClick={() => setApp(a.id)} data-testid={`cel-${a.id}`}><img src={urlIcone(a.icone)} alt="" /><span>{a.nome}</span></button>)}</div>
          </div>)}
          {app === 'instagram' && <Instagram jogo={jogo} fid={fid} />}
          {app === 'banco' && <Banco jogo={jogo} fid={fid} />}
          {app === 'galeria' && <Galeria jogo={jogo} fid={fid} />}
          {app === 'chrome' && <div className="cel-app-tela" style={{ background: '#fff', color: '#1b1626', padding: 8 }}><Navegador jogo={jogo} /></div>}
        </div>
        <div className="cel-nav"><button onClick={() => setApp('home')} aria-label="Início" data-testid="cel-home">◯</button><button onClick={fechar} aria-label="Fechar" data-testid="cel-fechar">✕</button></div>
      </div>
    </div>
  );
}

function Foto({ foto, onClick }: { foto: Foto; onClick?: () => void }) { return <img className="foto" src={fotoURL(foto)} alt="" onClick={onClick} />; }
function Cabeca({ autor }: { autor: Autor }) { return <span className="ig-cabeca"><img src={fotoPerfil(autor.avatar, autor.cor)} alt="" /><b>{autor.handle}</b></span>; }
function PostV({ post, abrirPerfil }: { post: Post; abrirPerfil: (a: Autor) => void }) {
  const [curti, setCurti] = useState(false);
  return (<div className="ig-post" data-testid="ig-post">
    <div className="ig-topo" onClick={() => abrirPerfil(post.autor)}><Cabeca autor={post.autor} /><span className="dim">{post.dias === 0 ? 'hoje' : `${post.dias} d`}</span></div>
    <Foto foto={post.foto} />
    <div className="ig-acoes"><button onClick={() => setCurti(!curti)} style={{ color: curti ? '#ed4956' : undefined }}>{curti ? '♥' : '♡'}</button><span><b>{fmt(post.curtidas + (curti ? 1 : 0))}</b> curtidas</span></div>
    <div className="ig-leg"><b>{post.autor.handle}</b> {post.legenda}</div>
    {post.comentarios.map((c, i) => <div key={i} className="ig-com"><b>{c.autor}</b> {c.texto}</div>)}
  </div>);
}
function Instagram({ jogo, fid }: { jogo: Jogo; fid: string }) {
  const p = jogo.p; const f = p.funcionarios.find((q) => q.id === fid)!; const [aba, setAba] = useState<'feed' | 'perfil' | 'busca'>('feed'); const [visto, setVisto] = useState<Perfil | null>(null); const [post, setPost] = useState<Post | null>(null);
  const feed = useMemo(() => feedDe(p, f), [p, f]); const meu = useMemo(() => perfilDe(p, f), [p, f]);
  const abrirPerfil = (a: Autor): void => { const q = p.funcionarios.find((x) => autorDe(x).handle === a.handle); setVisto(q ? perfilDe(p, q) : perfilConta(p, a)); setPost(null); setAba('perfil'); };
  const perfil = aba === 'perfil' ? visto ?? meu : null;
  return (<div className="cel-app-tela ig" data-testid="instagram">
    <div className="ig-barra"><b className="ig-logo">Instagram</b>{(visto || post) && <button onClick={() => { setVisto(null); setPost(null); }}>←</button>}</div>
    <div className="ig-corpo">
      {post ? <PostV post={post} abrirPerfil={abrirPerfil} /> : aba === 'feed' ? feed.slice(0, 24).map((x) => <PostV key={x.id} post={x} abrirPerfil={abrirPerfil} />)
        : aba === 'busca' ? (<div>{[...p.funcionarios.filter((q) => q.status !== 'demitido').map(autorDe), ...CONTAS].map((a) => <div key={a.handle} className="ig-linha" onClick={() => abrirPerfil(a)} data-testid="ig-conta"><Cabeca autor={a} /><span className="dim">{a.nome}</span></div>)}</div>)
        : perfil && (<div data-testid="ig-perfil">
          <div className="ig-perfil"><img src={fotoPerfil(perfil.autor.avatar, perfil.autor.cor)} alt="" /><div><b>{perfil.posts.length}</b><br />posts</div><div><b>{fmt(perfil.seguidores)}</b><br />seguidores</div><div><b>{perfil.seguindo}</b><br />seguindo</div></div>
          <div className="ig-bio"><b>{perfil.autor.nome}</b><br />{perfil.bio}</div>
          <div className="ig-grade">{perfil.posts.map((x) => <Foto key={x.id} foto={x.foto} onClick={() => setPost(x)} />)}</div>
        </div>)}
    </div>
    <div className="ig-abas"><button className={aba === 'feed' ? 'on' : ''} onClick={() => { setAba('feed'); setPost(null); setVisto(null); }}>⌂</button><button className={aba === 'busca' ? 'on' : ''} onClick={() => { setAba('busca'); setPost(null); }} data-testid="ig-busca">⌕</button><button className={aba === 'perfil' && !visto ? 'on' : ''} onClick={() => { setAba('perfil'); setVisto(null); setPost(null); }} data-testid="ig-meu-perfil">☺</button></div>
  </div>);
}
function Banco({ jogo, fid }: { jogo: Jogo; fid: string }) {
  const f = jogo.p.funcionarios.find((q) => q.id === fid)!; const ext = [...(f.extrato ?? [])].reverse();
  return (<div className="cel-app-tela banco" data-testid="banco">
    <div className="banco-topo"><div>Olá, {f.nome}</div><div className="dim">Saldo em conta</div><div className="banco-saldo" data-testid="banco-saldo">◈ {(f.saldo ?? 0).toLocaleString("pt-BR")} CC</div><div className="dim">Salário: {f.salario} CC/dia · creditado à meia-noite</div></div>
    <div className="banco-cartao"><span>CRIPCOIN BANK</span><span>•••• {String(Math.abs(f.id.length * 1373) % 10000).padStart(4, '0')}</span><span>{f.nome.toUpperCase()}</span></div>
    <h3>Extrato</h3>{ext.length === 0 && <div className="dim">Nenhum salário recebido ainda (o primeiro cai à meia-noite).</div>}
    {ext.map((e, i) => <div key={i} className="banco-linha"><span>Dia {e.dia}<br /><small className="dim">{e.desc}</small></span><b className="ok">+ {e.valor}</b></div>)}
  </div>);
}
function Galeria({ jogo, fid }: { jogo: Jogo; fid: string }) {
  const p = jogo.p; const f = p.funcionarios.find((q) => q.id === fid)!; const fotos = useMemo(() => galeriaDe(p, f), [p, f]); const [aberta, setAberta] = useState<number | null>(null);
  return (<div className="cel-app-tela" data-testid="galeria" style={{ background: '#000' }}>
    <div className="ig-barra" style={{ background: '#111', color: '#fff' }}><b>Galeria</b>{aberta !== null && <button onClick={() => setAberta(null)}>←</button>}</div>
    {aberta === null ? <div className="ig-grade">{fotos.map((x, i) => <Foto key={i} foto={x} onClick={() => setAberta(i)} />)}</div>
      : <div style={{ padding: 6 }}><Foto foto={fotos[aberta]} /><div className="linha"><button disabled={aberta === 0} onClick={() => setAberta(aberta - 1)}>◀</button><span className="grow" style={{ textAlign: 'center' }}>{aberta + 1}/{fotos.length}</span><button disabled={aberta === fotos.length - 1} onClick={() => setAberta(aberta + 1)}>▶</button></div></div>}
  </div>);
}
