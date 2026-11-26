import { useEffect, useRef, useState } from 'react';
import { item } from '../dados/catalogo';
import type { Jogo } from '../nucleo/jogo';
import { alvoDe, objetoDoAlvo } from '../nucleo/alvo';
import { alternarPorta, mover, pintarParedeCor, pintarPiso, pintarTodasParedes, portaEm, preencherPiso, redimensionar, tracarParede } from '../nucleo/mapa';
import { escalaIndividual } from '../nucleo/superficie';
import type { ObjetoColocado } from '../tipos';
import { diaDe, diaSemana, horaTexto } from '../nucleo/tempo';
import { colocarDoInventario, guardarObjeto, venderObjeto } from '../sistemas/economia';
import { CORES_PAREDE, PISOS, urlObjeto, urlPiso } from '../render/arte';
import { Mundo, spriteDe, type VistaUI } from '../render/mundo';
import { cc, Confirmar, useJogo } from './comum';
import { JanelaObjeto } from './Objetos';
import { Propriedades } from './Propriedades';
import { CaixaConversa } from './CaixaConversa';
import { Contratar, Equipe, Historico, Inventario, Perfil, Config } from './Paineis';
import { SO } from './Computador';

type Ferramenta = 'selecionar' | 'colocar' | 'piso' | 'parede' | 'apagarParede' | 'porta' | 'corParede';
type Painel = null | 'inventario' | 'contratar' | 'equipe' | 'config' | 'historico';
export interface EstadoEdicao { ferr: Ferramenta; itemId: string | null; rot: 0 | 1 | 2 | 3; piso: string; retangulo: boolean; sel: string | null; cor: string }

export function TelaJogo({ jogo, sair }: { jogo: Jogo; sair: () => void }) {
  useJogo(jogo); const p = jogo.p;
  const [construcao, setConstrucao] = useState(false); const [painel, setPainel] = useState<Painel>(null); const [aberto, setAberto] = useState<string | null>(null); const [perfil, setPerfil] = useState<string | null>(null);
  const [loja, setLoja] = useState(false); const [ed, setEd] = useState<EstadoEdicao>({ ferr: 'selecionar', itemId: null, rot: 0, piso: 'madeira', retangulo: true, sel: null, cor: 'azul' });
  const [grade, setGrade] = useState(true); const [colisao, setColisao] = useState(false); const [superf, setSuperf] = useState(false); const [confirma, setConfirma] = useState<null | { texto: string; ok: () => void }>(null);
  const mundoRef = useRef<Mundo | null>(null);
  const upEd = (q: Partial<EstadoEdicao>): void => setEd((e) => ({ ...e, ...q }));
  const primeiroPc = p.objetos.find((o) => item(o.def)?.interacao === 'computador');
  const abrirLoja = (): void => { if (!primeiroPc) { jogo.aviso('Você precisa de um computador para abrir a Loja.', 'erro'); return; } setAberto(primeiroPc.id); setLoja(true); };

  useEffect(() => {
    const tecla = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement; if (t && /INPUT|TEXTAREA|SELECT/.test(t.tagName)) return;
      if (e.key === 'r' || e.key === 'R') setEd((q) => ({ ...q, rot: ((q.rot + 1) % 4) as 0 | 1 | 2 | 3 }));
      if (e.key === 'Escape') { setEd((q) => ({ ...q, ferr: 'selecionar', itemId: null, sel: null })); }
      if (e.key === 'b' || e.key === 'B') setConstrucao((c) => !c);
    };
    window.addEventListener('keydown', tecla); return () => window.removeEventListener('keydown', tecla);
  }, []);
  useEffect(() => { const sai = (): void => { jogo.salvar(); }; window.addEventListener('beforeunload', sai); return () => window.removeEventListener('beforeunload', sai); }, [jogo]);

  const ultimoPc = (id: string): boolean => item(p.objetos.find((o) => o.id === id)?.def ?? '')?.interacao === 'computador' && p.objetos.filter((o) => item(o.def)?.interacao === 'computador').length <= 1;
  const guardarSel = (): void => { if (!ed.sel) return; if (ultimoPc(ed.sel)) { jogo.aviso('Mantenha ao menos um computador: é por ele que você acessa a Loja.', 'erro'); return; } const o = p.objetos.find((q) => q.id === ed.sel); guardarObjeto(p, ed.sel); jogo.aviso(`${item(o?.def ?? '')?.nome ?? 'Objeto'} guardado no inventário.`, 'ok'); jogo.mudou(); upEd({ sel: null }); };
  const venderSel = (): void => { if (!ed.sel) return; if (ultimoPc(ed.sel)) { jogo.aviso('Mantenha ao menos um computador: é por ele que você acessa a Loja.', 'erro'); return; } const id = ed.sel; const o = p.objetos.find((q) => q.id === id); const d = o && item(o.def); if (!d) return; setConfirma({ texto: `Vender ${d.nome} (e o que estiver em cima) por 60% do preço?`, ok: () => { jogo.resultado(venderObjeto(p, id)); upEd({ sel: null }); setConfirma(null); } }); };
  const selObj = ed.sel ? p.objetos.find((o) => o.id === ed.sel) ?? null : null;

  return (
    <div className="palco" data-testid="jogo">
      <Canvas jogo={jogo} construcao={construcao} ed={ed} upEd={upEd} grade={grade} colisao={colisao} superf={superf} mundoRef={mundoRef}
        usar={(o) => { const d = item(o.def); if (d?.interacao && d.interacao !== 'assento') { setLoja(false); setAberto(o.id); } }} perfil={(id) => setPerfil(id)} />
      <div className="topo" data-testid="topo">
        <span className="nome" title={p.empresa}>{p.nome}</span>
        <span className="saldo" data-testid="saldo">◈ {cc(Math.floor(p.cc * 10) / 10)}</span>
        <span className="relogio" data-testid="relogio">Dia {diaDe(p.minuto)} · {diaSemana(p.minuto)} · {horaTexto(p.minuto)}</span>
        <button onClick={() => { jogo.p.velocidade = jogo.p.velocidade >= 3 ? 1 : jogo.p.velocidade + 1; jogo.emitir(); }} title="Velocidade do tempo">⏩ x{p.velocidade}</button>
        <button onClick={() => { jogo.pausado = !jogo.pausado; jogo.emitir(); }} className={jogo.pausado ? 'ativo' : ''}>{jogo.pausado ? '▶ Retomar' : '⏸ Pausa'}</button>
        <button className={construcao ? 'ativo' : ''} onClick={() => { setConstrucao(!construcao); upEd({ ferr: 'selecionar', itemId: null, sel: null }); }} data-testid="btn-construir">{construcao ? '🔨 Construir: ligado' : '🔨 Construir'}</button>
        <button onClick={abrirLoja} data-testid="btn-loja">🛒 Loja</button>
        <button onClick={() => setPainel(painel === 'inventario' ? null : 'inventario')} data-testid="btn-inventario">🎒 Inventário</button>
        <button className="primario" onClick={() => setPainel(painel === 'contratar' ? null : 'contratar')} data-testid="btn-contratar">CONTRATAR</button>
        <button onClick={() => setPainel(painel === 'equipe' ? null : 'equipe')} data-testid="btn-equipe">👥 Equipe ({p.funcionarios.filter((f) => f.status === 'ativo').length})</button>
        <button onClick={() => setPainel(painel === 'historico' ? null : 'historico')}>📜 Extrato</button>
        <button onClick={() => jogo.salvar() && jogo.aviso('Projeto salvo.', 'ok')} data-testid="btn-salvar">💾 Salvar</button>
        <button onClick={() => setPainel(painel === 'config' ? null : 'config')}>⚙</button>
        <button onClick={() => mundoRef.current?.zoom(1.25)}>＋</button><button onClick={() => mundoRef.current?.zoom(0.8)}>－</button><button onClick={() => mundoRef.current?.enquadrar(p)}>⌂</button>
      </div>
      {construcao && (
        <div className="lateral" data-testid="painel-construcao">
          <h2>CONSTRUIR</h2>
          <div className="abas">
            {([['selecionar', '🖐 Selecionar'], ['colocar', '📦 Colocar'], ['piso', '🟫 Piso'], ['parede', '🧱 Parede'], ['apagarParede', '⛏ Demolir'], ['porta', '🚪 Porta'], ['corParede', '🎨 Cor da parede']] as [Ferramenta, string][]).map(([k, n]) => (
              <button key={k} className={ed.ferr === k ? 'ativo' : ''} data-testid={`ferr-${k}`} onClick={() => upEd({ ferr: k, itemId: k === 'colocar' ? ed.itemId : null })}>{n}</button>))}
          </div>
          <div className="linha"><label style={{ margin: 0 }}><input type="checkbox" style={{ width: 'auto' }} checked={grade} onChange={(e) => setGrade(e.target.checked)} /> Grade</label><label style={{ margin: 0 }}><input type="checkbox" style={{ width: 'auto' }} checked={colisao} onChange={(e) => setColisao(e.target.checked)} /> Colisões</label><label style={{ margin: 0 }}><input type="checkbox" style={{ width: 'auto' }} checked={superf} onChange={(e) => setSuperf(e.target.checked)} data-testid="chk-superficies" /> Superfícies</label></div>
          {ed.ferr === 'piso' && (<><div className="dim">Arraste um retângulo para trocar o piso.</div><button data-testid="piso-tudo" onClick={() => { const n = preencherPiso(p, ed.piso); jogo.aviso(n ? `Piso trocado em toda a sala (${n} tiles).` : 'Nada mudou.', n ? 'ok' : 'info'); if (n) jogo.mudou(); }}>Aplicar na sala inteira</button><div className="pisos">{PISOS.map((q) => <button key={q} className={ed.piso === q ? 'ativo' : ''} title={q} onClick={() => upEd({ piso: q })}><img src={urlPiso(q)} alt={q} /></button>)}</div></>)}
          {(ed.ferr === 'parede' || ed.ferr === 'apagarParede') && (<><div className="dim">Arraste para traçar. Retângulo = contorno de uma sala (divisórias).</div><label style={{ margin: 0 }}><input type="checkbox" style={{ width: 'auto' }} checked={ed.retangulo} onChange={(e) => upEd({ retangulo: e.target.checked })} /> Modo retângulo</label></>)}
          {ed.ferr === 'corParede' && (<><div className="dim">Escolha a cor e arraste sobre as paredes. Cada trecho guarda a própria cor.</div><div className="cores">{Object.entries(CORES_PAREDE).map(([k, v]) => <button key={k} title={v.nome} data-testid={`cor-${k}`} className={ed.cor === k ? 'ativo' : ''} style={{ background: v.cor ?? '#e8dfc8' }} onClick={() => upEd({ cor: k })} />)}</div><div className="dim">Cor: {CORES_PAREDE[ed.cor]?.nome}</div><button data-testid="cor-tudo" onClick={() => { pintarTodasParedes(p, ed.cor); jogo.aviso('Todas as paredes pintadas.', 'ok'); jogo.mudou(); }}>Pintar todas as paredes</button></>)}
          {ed.ferr === 'porta' && <div className="dim">Clique numa parede para criar uma porta; clique numa porta para remover.</div>}
          {ed.ferr === 'colocar' && (
            <>{ed.itemId ? <div className="dim">Colocando: <b className="ouro">{item(ed.itemId)?.nome}</b>. Clique no mapa. R gira. Esc cancela.</div> : <div className="dim">Escolha um item do inventário:</div>}
              {Object.entries(p.inventario).map(([id, n]) => { const d = item(id); if (!d) return null; return <div key={id} className="item"><img src={urlObjeto(spriteDe(d, 0).nome)} alt="" onError={(e) => ((e.target as HTMLImageElement).style.visibility = 'hidden')} /><div className="info">{d.nome}<br /><span className="dim">x{n}</span></div><button className={ed.itemId === id ? 'ativo' : ''} onClick={() => upEd({ ferr: 'colocar', itemId: id, rot: 0 })}>Usar</button></div>; })}
              {Object.keys(p.inventario).length === 0 && <div className="dim">Inventário vazio. Compre itens na Loja (ícone LOJA do laptop).</div>}</>)}
          {ed.ferr === 'selecionar' && (selObj ? <Propriedades jogo={jogo} id={selObj.id} guardar={guardarSel} vender={venderSel} fechar={() => upEd({ sel: null })} /> : <div className="dim">Clique num objeto para selecionar; arraste para mover; alças nos cantos redimensionam.</div>)}
        </div>
      )}
      <CaixaConversa jogo={jogo} />
      <div className="avisos">{jogo.avisos.map((a) => <div key={a.id} className={`aviso ${a.tipo}`}>{a.texto}</div>)}</div>
      {painel === 'inventario' && <Inventario jogo={jogo} fechar={() => setPainel(null)} colocar={(id) => { setPainel(null); setConstrucao(true); upEd({ ferr: 'colocar', itemId: id, rot: 0 }); }} />}
      {painel === 'contratar' && <Contratar jogo={jogo} fechar={() => setPainel(null)} />}
      {painel === 'equipe' && <Equipe jogo={jogo} fechar={() => setPainel(null)} perfil={(id) => setPerfil(id)} />}
      {painel === 'historico' && <Historico jogo={jogo} fechar={() => setPainel(null)} />}
      {painel === 'config' && <Config jogo={jogo} fechar={() => setPainel(null)} sair={sair} />}
      {perfil && <Perfil jogo={jogo} id={perfil} fechar={() => setPerfil(null)} />}
      {aberto && (item(p.objetos.find((o) => o.id === aberto)?.def ?? '')?.interacao === 'computador'
        ? <SO jogo={jogo} id={aberto} abrirLoja={loja} fechar={() => { setAberto(null); setLoja(false); }} />
        : <JanelaObjeto jogo={jogo} id={aberto} fechar={() => setAberto(null)} />)}
      {confirma && <Confirmar texto={confirma.texto} onSim={confirma.ok} onNao={() => setConfirma(null)} />}
    </div>
  );
}

function Canvas({ jogo, construcao, ed, upEd, grade, colisao, superf, mundoRef, usar, perfil }: {
  jogo: Jogo; construcao: boolean; ed: EstadoEdicao; upEd: (q: Partial<EstadoEdicao>) => void; grade: boolean; colisao: boolean; superf: boolean; mundoRef: React.MutableRefObject<Mundo | null>;
  usar: (o: ObjetoColocado) => void; perfil: (id: string) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const props = useRef({ construcao, ed, grade, colisao, superf, usar, perfil, upEd }); props.current = { construcao, ed, grade, colisao, superf, usar, perfil, upEd };
  const ui = useRef<VistaUI>({ construcao: false, mostrarGrade: true, mostrarColisao: false, mostrarSuperficies: false, selecionado: null, fantasma: null, hover: null, area: null, funcSel: null });
  type Acao = { tipo: 'pan' | 'area' | 'mover' | 'escala' | null; sx: number; sy: number; cx: number; cy: number; movido: boolean; id?: string; x0?: number; y0?: number; alca?: string; ex0?: number; ey0?: number; centro?: number; base?: number; larg0?: number; alt0?: number; ultimoErro?: string };
  const acao = useRef<Acao>({ tipo: null, sx: 0, sy: 0, cx: 0, cy: 0, movido: false });

  useEffect(() => {
    const cv = ref.current!; const m = new Mundo(cv); mundoRef.current = m; (window as unknown as { __mundo?: Mundo }).__mundo = m; m.ajustar(); m.enquadrar(jogo.p);
    const ro = new ResizeObserver(() => m.ajustar()); ro.observe(cv); let raf = 0; let ant = performance.now();
    const quad = (t: number): void => { const dt = Math.min(0.1, (t - ant) / 1000); ant = t; const pr = props.current; const v = ui.current; v.construcao = pr.construcao; v.mostrarGrade = pr.grade; v.mostrarColisao = pr.colisao; v.mostrarSuperficies = pr.superf; v.selecionado = pr.ed.sel; if (!pr.construcao) { v.fantasma = null; v.area = null; } m.desenhar(jogo, v, dt); raf = requestAnimationFrame(quad); };
    raf = requestAnimationFrame(quad);
    const wheel = (e: WheelEvent): void => { e.preventDefault(); const r = cv.getBoundingClientRect(); m.zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top); };
    cv.addEventListener('wheel', wheel, { passive: false }); return () => { cancelAnimationFrame(raf); ro.disconnect(); cv.removeEventListener('wheel', wheel); };
  }, [jogo, mundoRef]);

  const pos = (e: React.PointerEvent): { sx: number; sy: number } => { const r = ref.current!.getBoundingClientRect(); return { sx: e.clientX - r.left, sy: e.clientY - r.top }; };
  /** Atualiza o fantasma (colocação ou arrasto) a partir do ponto do mundo sob o ponteiro. */
  const atualizarFantasma = (mx: number, my: number): void => {
    const pr = props.current; const p = jogo.p; const v = ui.current; const a = acao.current;
    if (a.tipo === 'mover' && a.id) { const o = p.objetos.find((q) => q.id === a.id)!; const d = item(o.def)!; const al = alvoDe(p, d, mx, my, o.rot, { ex: o.ex, ey: o.ey, alt: o.alt }, o.id); v.fantasma = { obj: objetoDoAlvo(p, d, al, o.rot, o.id), ok: al.v.ok, motivo: al.v.motivo, movendo: o.id }; return; }
    if (pr.ed.ferr === 'colocar' && pr.ed.itemId) { const d = item(pr.ed.itemId); if (d) { const rot = d.girar ? pr.ed.rot : 0; const al = alvoDe(p, d, mx, my, rot, {}, null); v.fantasma = { obj: objetoDoAlvo(p, d, al, rot), ok: al.v.ok && (p.inventario[d.id] ?? 0) > 0, motivo: al.v.motivo }; return; } }
    v.fantasma = null;
  };
  const down = (e: React.PointerEvent): void => {
    const m = mundoRef.current!; const { sx, sy } = pos(e); const c = m.celula(sx, sy); const mp = m.paraMundo(sx, sy); const p = jogo.p; const pr = props.current; const a = acao.current;
    ref.current!.setPointerCapture(e.pointerId); a.sx = sx; a.sy = sy; a.cx = m.cam.x; a.cy = m.cam.y; a.movido = false; a.x0 = c.x; a.y0 = c.y;
    if (e.button === 1 || e.button === 2) { a.tipo = 'pan'; return; }
    if (!pr.construcao) {
      const f = m.funcionarioEm(p, mp.x, mp.y); if (f) { pr.perfil(f); a.tipo = null; return; }
      const o = m.objetoEm(p, mp.x, mp.y); if (o) { pr.usar(o); a.tipo = null; return; }
      const q = portaEm(p, c.x, c.y); if (q) { q.aberta = !q.aberta; jogo.emitir(); a.tipo = null; return; }
      a.tipo = 'pan'; return;
    }
    const fe = pr.ed.ferr;
    if (fe === 'colocar') {
      if (!pr.ed.itemId) return; const d = item(pr.ed.itemId)!; const rot = (d.girar ? pr.ed.rot : 0) as 0 | 1 | 2 | 3; const al = alvoDe(p, d, mp.x, mp.y, rot, {}, null);
      if (!al.v.ok) { jogo.aviso(al.v.motivo, 'erro'); a.tipo = null; return; }
      const r = colocarDoInventario(p, d.id, al.x, al.y, rot, al.extra); jogo.resultado(r); if (r.ok) jogo.notificar('objeto_colocado', { item: d.nome }); if (r.ok && (p.inventario[d.id] ?? 0) < 1) pr.upEd({ ferr: 'selecionar', itemId: null }); a.tipo = null; return;
    }
    if (fe === 'selecionar') {
      const sel = pr.ed.sel ? p.objetos.find((o) => o.id === pr.ed.sel) : null;
      if (sel) { const al = m.alcas(p, sel); const hit = al.find((h) => Math.hypot((h.x - mp.x) * 32 * m.cam.zoom, (h.y - mp.y) * 32 * m.cam.zoom) < 9);
        if (hit) { const d = item(sel.def)!; const r = m.retDe(p, sel)!; const es = escalaIndividual(sel, d); Object.assign(a, { tipo: 'escala', id: sel.id, alca: hit.id, ex0: es.ex, ey0: es.ey, centro: r.left + r.w / 2, base: r.top + r.h, larg0: r.w, alt0: r.h }); return; } }
      const o = m.objetoEm(p, mp.x, mp.y); pr.upEd({ sel: o?.id ?? null }); if (o) { a.tipo = 'mover'; a.id = o.id; } else a.tipo = 'pan'; return;
    }
    if (fe === 'porta') { const v = alternarPorta(p, c.x, c.y); jogo.resultado({ ok: v.ok, motivo: v.motivo || 'Feito.' }); a.tipo = null; return; }
    a.tipo = 'area'; ui.current.area = { x0: c.x, y0: c.y, x1: c.x, y1: c.y, cor: fe === 'apagarParede' ? 'rgba(255,80,80,0.4)' : fe === 'corParede' ? 'rgba(255,225,77,0.35)' : 'rgba(255,255,255,0.3)' };
  };
  const move = (e: React.PointerEvent): void => {
    const m = mundoRef.current!; const { sx, sy } = pos(e); const c = m.celula(sx, sy); const mp = m.paraMundo(sx, sy); const a = acao.current; ui.current.hover = c;
    if (a.tipo === 'pan') { const s = 32 * m.cam.zoom; if (Math.hypot(sx - a.sx, sy - a.sy) > 3) a.movido = true; m.cam.x = a.cx - (sx - a.sx) / s; m.cam.y = a.cy - (sy - a.sy) / s; return; }
    if (a.tipo === 'area' && ui.current.area) { ui.current.area = { ...ui.current.area, x1: c.x, y1: c.y }; return; }
    if (a.tipo === 'escala' && a.id) {
      const p = jogo.p; const o = p.objetos.find((q) => q.id === a.id); const d = o && item(o.def); if (!o || !d) return;
      const razaoL = Math.max(0.05, (2 * Math.abs(mp.x - a.centro!)) / a.larg0!); const topo = a.alca === 'no' || a.alca === 'ne'; const razaoA = topo ? Math.max(0.05, (a.base! - mp.y) / a.alt0!) : razaoL;
      const trava = o.travar ?? true; const passo = (v: number): number => Math.round(v * 20) / 20; const ex = passo(a.ex0! * razaoL); const ey = trava ? passo(a.ey0! * razaoL) : passo(a.ey0! * razaoA);
      const clamp = (v: number): number => Math.min(d.escala.max, Math.max(d.escala.min, v)); const r = redimensionar(p, o.id, clamp(ex), clamp(ey), trava); if (r.ok) { a.movido = true; jogo.mudou(); } else a.ultimoErro = r.motivo; return;
    }
    if (a.tipo === 'mover' && (c.x !== a.x0 || c.y !== a.y0)) a.movido = true;
    atualizarFantasma(mp.x, mp.y);
  };
  const up = (e: React.PointerEvent): void => {
    const m = mundoRef.current!; const { sx, sy } = pos(e); const mp = m.paraMundo(sx, sy); const a = acao.current; const p = jogo.p; const pr = props.current; const v = ui.current;
    if (a.tipo === 'mover' && a.id && a.movido) { const o = p.objetos.find((q) => q.id === a.id); const d = o && item(o.def); if (o && d) { const al = alvoDe(p, d, mp.x, mp.y, o.rot, { ex: o.ex, ey: o.ey, alt: o.alt }, o.id); if (!al.v.ok) jogo.aviso(al.v.motivo, 'erro'); else { const r = mover(p, o.id, al.x, al.y, o.rot, al.extra); jogo.resultado({ ok: r.ok, motivo: r.ok ? 'Objeto movido.' : r.motivo }); } } }
    if (a.tipo === 'escala') { if (a.ultimoErro && !a.movido) jogo.aviso(a.ultimoErro, 'erro'); else if (a.movido) jogo.aviso('Tamanho atualizado.', 'ok'); }
    if (a.tipo === 'area' && v.area) {
      const { x0, y0, x1, y1 } = v.area; const fe = pr.ed.ferr;
      if (fe === 'piso') { const n = pintarPiso(p, x0, y0, x1, y1, pr.ed.piso); jogo.aviso(n ? `Piso aplicado em ${n} tile(s).` : 'Nada mudou.', n ? 'ok' : 'info'); if (n) jogo.mudou(); }
      else if (fe === 'corParede') { const n = pintarParedeCor(p, x0, y0, x1, y1, pr.ed.cor); jogo.aviso(n ? `Cor aplicada em ${n} trecho(s) de parede.` : 'Nada mudou (arraste sobre paredes).', n ? 'ok' : 'info'); if (n) jogo.mudou(); }
      else { const n = tracarParede(p, x0, y0, x1, y1, fe === 'parede' ? 'construir' : 'remover', pr.ed.retangulo); jogo.aviso(n ? `${fe === 'parede' ? 'Parede construída' : 'Parede removida'}: ${n} tile(s).` : 'Nada mudou (há móveis ou enfeites no caminho).', n ? 'ok' : 'info'); if (n) jogo.mudou(); }
      v.area = null;
    }
    a.tipo = null; a.id = undefined; v.fantasma = null; atualizarFantasma(mp.x, mp.y);
    try { ref.current?.releasePointerCapture(e.pointerId); } catch { /* já liberado */ }
  };
  return <canvas ref={ref} data-testid="canvas" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={() => { ui.current.hover = null; ui.current.fantasma = null; }} onContextMenu={(e) => e.preventDefault()} />;
}
