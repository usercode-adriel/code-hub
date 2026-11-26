import { useRef, useState } from 'react';
import { novoProjeto } from '../nucleo/jogo';
import { LIMITES, type ConfigNovo } from '../nucleo/mapa';
import { excluir, exportar, importar, listar, salvar, carregar } from '../nucleo/persistencia';
import { CORES_PAREDE, PISOS, urlPiso } from '../render/arte';
import type { Projeto } from '../tipos';
import { Confirmar } from './comum';

export function Menu({ abrir }: { abrir: (p: Projeto) => void }) {
  const [lista, setLista] = useState(listar()); const [novo, setNovo] = useState(lista.length === 0); const [apagar, setApagar] = useState<string | null>(null); const [msg, setMsg] = useState(''); const arq = useRef<HTMLInputElement>(null);
  const refresh = (): void => setLista(listar());
  return (
    <div className="menu">
      <div className="logo">CRIPCOIN<br />OFFICE SIMULATOR</div>
      <div className="sub">Construa seu escritório, contrate funcionários e ganhe CRIPCOIN (CC).</div>
      <div className="linha"><button className="primario" onClick={() => setNovo(true)} data-testid="novo-projeto">NOVO PROJETO</button><button onClick={() => arq.current?.click()}>Importar arquivo</button>
        <input ref={arq} type="file" accept=".json,application/json" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; const p = importar(await f.text()); if (!p) { setMsg('Arquivo inválido: não é um projeto Cripcoin.'); return; } p.id = `${p.id}-i${Date.now().toString(36)}`; salvar(p, 1); refresh(); setMsg(`Projeto "${p.nome}" importado.`); e.target.value = ''; }} /></div>
      {msg && <div className="dim">{msg}</div>}
      <div className="projetos">
        {lista.length === 0 && <div className="cartao dim">Nenhum projeto salvo ainda. Crie o primeiro!</div>}
        {lista.map((r) => (
          <div className="cartao linha" key={r.id}>
            <div className="grow"><div className="ouro">{r.nome}</div><div className="dim">{r.empresa} · dia {r.dia} · {r.cc} CC · {new Date(r.atualizadoEm).toLocaleString('pt-BR')}</div></div>
            <button className="primario" data-testid="continuar" onClick={() => { const p = carregar(r.id); if (p) abrir(p); else setMsg('Não foi possível carregar este projeto.'); }}>Continuar</button>
            <button onClick={() => { const p = carregar(r.id); if (!p) return; const b = new Blob([exportar(p)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `${r.nome}.cripcoin.json`; a.click(); }}>Exportar</button>
            <button className="perigo" onClick={() => setApagar(r.id)}>Excluir</button>
          </div>))}
      </div>
      {novo && <Criador onFechar={() => setNovo(false)} onCriar={(c) => { const p = novoProjeto(c); salvar(p, 1); abrir(p); }} />}
      {apagar && <Confirmar texto="Excluir este projeto para sempre? Não dá para desfazer." sim="Excluir" onNao={() => setApagar(null)} onSim={() => { excluir(apagar); setApagar(null); refresh(); }} />}
    </div>
  );
}

function Criador({ onFechar, onCriar }: { onFechar: () => void; onCriar: (c: ConfigNovo) => void }) {
  const [c, setC] = useState<ConfigNovo>({ nome: 'Meu escritório', empresa: 'Minha Empresa', largura: 14, altura: 10, tile: 32, piso: 'madeira', corParede: 'creme', alturaParede: 1.4, portas: [{ lado: 'S', pos: 7 }] });
  const up = <K extends keyof ConfigNovo>(k: K, v: ConfigNovo[K]): void => setC((q) => ({ ...q, [k]: v }));
  const erro = c.largura < LIMITES.min || c.largura > LIMITES.max || c.altura < LIMITES.min || c.altura > LIMITES.max ? `Largura e altura: de ${LIMITES.min} a ${LIMITES.max} tiles.` : '';
  const setPorta = (i: number, q: Partial<ConfigNovo['portas'][number]>): void => up('portas', c.portas.map((x, j) => (j === i ? { ...x, ...q } : x)));
  return (
    <div className="veu"><div className="janela" style={{ width: 560 }}>
      <div className="jan-barra"><span>NOVO PROJETO</span><button className="x" onClick={onFechar}>✕</button></div>
      <div className="jan-corpo">
        <label>Nome do escritório</label><input value={c.nome} maxLength={40} onChange={(e) => up('nome', e.target.value)} data-testid="cr-nome" />
        <label>Nome da empresa</label><input value={c.empresa} maxLength={40} onChange={(e) => up('empresa', e.target.value)} />
        <div className="linha"><div className="grow"><label>Largura (tiles reais)</label><input type="number" min={LIMITES.min} max={LIMITES.max} value={c.largura} onChange={(e) => up('largura', Number(e.target.value))} data-testid="cr-w" /></div>
          <div className="grow"><label>Altura (tiles reais)</label><input type="number" min={LIMITES.min} max={LIMITES.max} value={c.altura} onChange={(e) => up('altura', Number(e.target.value))} data-testid="cr-h" /></div>
          <div className="grow"><label>Tamanho do tile (px)</label><select value={c.tile} onChange={(e) => up('tile', Number(e.target.value))}>{LIMITES.tiles.map((t) => <option key={t}>{t}</option>)}</select></div></div>
        <div className="dim">Sala de {c.largura}×{c.altura} = {c.largura * c.altura} tiles (as paredes ficam dentro deste retângulo). Dá para ampliar a construção depois, pintando piso e levantando paredes.</div>
        <label>Piso inicial</label><div className="pisos">{PISOS.map((p) => <button key={p} className={c.piso === p ? 'ativo' : ''} title={p} onClick={() => up('piso', p)}><img src={urlPiso(p)} alt={p} /></button>)}</div>
        <div className="linha"><div className="grow"><label>Cor da parede</label><select value={c.corParede} onChange={(e) => up('corParede', e.target.value)}>{Object.entries(CORES_PAREDE).map(([k, v]) => <option key={k} value={k}>{v.nome}</option>)}</select></div>
          <div className="grow"><label>Altura visual da parede</label><select value={c.alturaParede} onChange={(e) => up('alturaParede', Number(e.target.value))}>{LIMITES.alturaParede.map((a) => <option key={a} value={a}>{a === 1 ? 'Baixa' : a === 1.4 ? 'Média' : 'Alta'} ({a})</option>)}</select></div></div>
        <label>Portas ({c.portas.length})</label>
        {c.portas.map((q, i) => (<div className="linha" key={i}>
          <select value={q.lado} onChange={(e) => setPorta(i, { lado: e.target.value as 'N' })}><option value="N">Norte</option><option value="S">Sul</option><option value="O">Oeste</option><option value="E">Leste</option></select>
          <span className="dim">posição</span><input type="number" style={{ width: 70 }} min={1} max={Math.max(c.largura, c.altura) - 2} value={q.pos} onChange={(e) => setPorta(i, { pos: Number(e.target.value) })} />
          <button disabled={c.portas.length <= 1} onClick={() => up('portas', c.portas.filter((_, j) => j !== i))}>Remover</button></div>))}
        <button disabled={c.portas.length >= 4} onClick={() => up('portas', [...c.portas, { lado: 'N', pos: 3 }])}>+ Porta</button>
        {erro && <div className="erro">{erro}</div>}
        <div className="dim">Você começa com 5000 CC e só uma mesa simples, um laptop e uma cadeira básica.</div>
        <div className="linha dir"><button onClick={onFechar}>Cancelar</button><button className="primario" disabled={!!erro || !c.nome.trim()} onClick={() => onCriar(c)} data-testid="cr-criar">Criar escritório</button></div>
      </div></div></div>
  );
}
