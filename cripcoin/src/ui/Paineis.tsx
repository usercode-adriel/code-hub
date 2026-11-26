import { useMemo, useState } from 'react';
import { CATEGORIAS, item, ITENS, precoVenda } from '../dados/catalogo';
import { DEFEITOS, TRACOS } from '../dados/pessoas';
import type { Jogo } from '../nucleo/jogo';
import { diaDe, horaTexto, minutoDoDia } from '../nucleo/tempo';
import { urlAvatar, urlObjeto } from '../render/arte';
import { spriteDe } from '../render/mundo';
import { venderDoInventario } from '../sistemas/economia';
import { afastar, atribuirEstacao, contratar, demitir, desempenhoDe, estacoesLivres, readmitir, retornar } from '../sistemas/funcionarios';
import type { Candidato, Funcionario } from '../tipos';
import { cc, Janela, useJogo } from './comum';

const hora = (m: number): string => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const paraMin = (t: string): number => { const [h, m] = t.split(':').map(Number); return (h || 0) * 60 + (m || 0); };
export const ESTADOS: Record<string, string> = { ausente: 'Sem estação (precisa de mesa + cadeira + computador)', trabalhando: 'Trabalhando na mesa', parado: 'Na mesa (fora do expediente)' };
export function IconeItem({ id }: { id: string }) { const d = item(id); return <img src={d ? urlObjeto(spriteDe(d, 0).nome) : ''} alt="" onError={(e) => ((e.target as HTMLImageElement).style.visibility = 'hidden')} />; }

export function Inventario({ jogo, fechar, colocar }: { jogo: Jogo; fechar: () => void; colocar: (id: string) => void }) {
  useJogo(jogo); const p = jogo.p; const [q, setQ] = useState(''); const [cat, setCat] = useState('todas');
  const lista = Object.entries(p.inventario).map(([id, n]) => ({ d: item(id)!, n })).filter((x) => x.d && (cat === 'todas' || x.d.categoria === cat) && x.d.nome.toLowerCase().includes(q.toLowerCase()));
  return (
    <Janela titulo="🎒 INVENTÁRIO" onFechar={fechar} largura={560}>
      <div className="linha"><input placeholder="Buscar..." value={q} onChange={(e) => setQ(e.target.value)} data-testid="inv-busca" /><select value={cat} onChange={(e) => setCat(e.target.value)} style={{ width: 170 }}><option value="todas">Todas as categorias</option>{CATEGORIAS.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></div>
      <div className="dim">Saldo: <span className="ouro">{cc(Math.floor(p.cc * 10) / 10)}</span> · itens guardados: {Object.values(p.inventario).reduce((a, b) => a + b, 0)}</div>
      {lista.length === 0 && <div className="cartao dim">Nada aqui. Compre itens na Loja (ícone LOJA no laptop) ou guarde móveis do escritório.</div>}
      {lista.map(({ d, n }) => (
        <div className="item" key={d.id} data-testid="inv-item"><IconeItem id={d.id} /><div className="info"><b>{d.nome}</b> <span className="ouro">x{n}</span><div className="dim">{CATEGORIAS.find((c) => c.id === d.categoria)?.nome} · revenda {cc(precoVenda(d))}</div></div>
          <button className="primario" onClick={() => colocar(d.id)}>Colocar</button>
          <button onClick={() => jogo.resultado(venderDoInventario(p, d.id, 1))}>Vender 1</button></div>))}
    </Janela>
  );
}

export function Historico({ jogo, fechar }: { jogo: Jogo; fechar: () => void }) {
  useJogo(jogo); const t = [...jogo.p.transacoes].reverse().slice(0, 150);
  return (<Janela titulo="📜 EXTRATO CRIPCOIN" onFechar={fechar} largura={520}><div className="ouro">Saldo: {cc(Math.floor(jogo.p.cc * 10) / 10)}</div>
    {t.length === 0 && <div className="dim">Sem movimentações.</div>}
    {t.map((x) => <div key={x.id} className="linha cartao"><span className="dim" style={{ width: 90 }}>D{x.dia} {x.hora}</span><span className="grow">{x.descricao}</span><span className={x.valor >= 0 ? 'ok' : 'erro'}>{x.valor >= 0 ? '+' : ''}{Math.round(x.valor * 100) / 100} CC</span></div>)}</Janela>);
}

export function Config({ jogo, fechar, sair }: { jogo: Jogo; fechar: () => void; sair: () => void }) {
  const p = jogo.p; const [nome, setNome] = useState(p.nome); const [emp, setEmp] = useState(p.empresa);
  return (<Janela titulo="⚙ CONFIGURAÇÕES" onFechar={fechar} largura={460}>
    <label>Nome do escritório</label><input value={nome} onChange={(e) => setNome(e.target.value)} /><label>Empresa</label><input value={emp} onChange={(e) => setEmp(e.target.value)} />
    <div className="linha"><button className="primario" onClick={() => { p.nome = nome.trim() || p.nome; p.empresa = emp.trim() || p.empresa; jogo.salvar(); jogo.aviso('Configurações salvas.', 'ok'); fechar(); }}>Salvar</button></div>
    <div className="dim">Sala {p.largura}×{p.altura} tiles · tile {p.tile}px · salvamento automático a cada alteração (≈8 s) e ao sair.</div>
    <h3>Controles</h3><div className="dim">Clique: usar objetos · Arrastar: mover a câmera · Roda: zoom · B: construir · R: girar · Esc: cancelar</div>
    <div className="linha dir"><button onClick={() => { jogo.salvar(); sair(); }} data-testid="sair">Salvar e voltar ao menu</button></div></Janela>);
}

function Habilidades({ h }: { h: Candidato['habilidades'] }) {
  return <div className="grade" style={{ gridTemplateColumns: '1fr 1fr' }}>{(Object.entries(h) as [string, number][]).map(([k, v]) => <div key={k}><span className="dim">{k}</span> {v}/10<div className="barra"><i style={{ width: `${v * 10}%` }} /></div></div>)}</div>;
}
function Defeitos({ ids, onTog }: { ids: string[]; onTog?: (id: string) => void }) {
  return <div>{(onTog ? DEFEITOS : DEFEITOS.filter((d) => ids.includes(d))).map((d) => <span key={d} data-testid={`defeito-${d}`} className={`tag ${ids.includes(d) ? 'on' : ''}`} style={onTog ? { cursor: 'pointer', background: ids.includes(d) ? '#7a3d3d' : undefined } : { background: '#7a3d3d' }} onClick={() => onTog?.(d)}>{d}</span>)}</div>;
}
const ROTULO_HAB: Record<string, string> = { criatividade: 'Criatividade', logica: 'Lógica', comunicacao: 'Comunicação', organizacao: 'Organização' };
function EditorHabilidades({ h, onChange }: { h: Candidato['habilidades']; onChange: (h: Candidato['habilidades']) => void }) {
  return <div className="grade" style={{ gridTemplateColumns: '1fr 1fr' }}>{(Object.keys(h) as (keyof Candidato['habilidades'])[]).map((k) => <div key={k}><span className="dim">{ROTULO_HAB[k]}</span> <b>{h[k]}</b>/10<input type="range" min="0" max="10" value={h[k]} onChange={(e) => onChange({ ...h, [k]: Number(e.target.value) })} data-testid={`hab-${k}`} /></div>)}</div>;
}
function Tracos({ ids, onTog }: { ids: string[]; onTog?: (id: string) => void }) {
  return <div>{(onTog ? TRACOS : TRACOS.filter((t) => ids.includes(t.id))).map((t) => <span key={t.id} title={t.dica} className={`tag ${ids.includes(t.id) ? 'on' : ''}`} style={onTog ? { cursor: 'pointer' } : undefined} onClick={() => onTog?.(t.id)}>{t.nome}</span>)}</div>;
}

export function Contratar({ jogo, fechar }: { jogo: Jogo; fechar: () => void }) {
  useJogo(jogo); const p = jogo.p; const [sel, setSel] = useState<Candidato | null>(null); const [aba, setAba] = useState<'candidatos' | 'ex'>('candidatos');
  return (
    <Janela titulo="CONTRATAR" onFechar={fechar} largura={680}>
      <div className="abas"><button className={aba === 'candidatos' ? 'ativo' : ''} onClick={() => setAba('candidatos')}>Candidatos ({p.candidatos.length})</button><button className={aba === 'ex' ? 'ativo' : ''} onClick={() => setAba('ex')}>Ex-funcionários ({p.recontratar.length})</button></div>
      <div className="dim">Salários são pagos todo dia à meia-noite. Cada personagem fica sentada, para sempre, numa estação: mesa + cadeira encostada + computador em cima. Estações livres: {estacoesLivres(p).length}.</div>
      {aba === 'candidatos' && p.candidatos.length === 0 && <div className="cartao dim">Nenhum candidato disponível agora. Novos candidatos aparecem a cada dia.</div>}
      {aba === 'candidatos' && p.candidatos.map((c) => (
        <div className="item" key={c.id} data-testid="candidato"><img className="avatar" src={urlAvatar(c.avatar)} alt="" /><div className="info"><b className="ouro">{c.nome}</b> · {c.idade} anos<div>{c.cargo} — {c.especialidade}</div><div className="dim">{c.descricao}</div><Tracos ids={c.tracos} /><div className="dim">Salário {cc(c.salario)}/dia · {c.disponibilidade}</div></div><button onClick={() => setSel(c)} className="primario" data-testid="ver-candidato">Ver perfil</button></div>))}
      {aba === 'ex' && p.recontratar.map((c) => <div className="item" key={c.id}><img className="avatar" src={urlAvatar(c.avatar)} alt="" /><div className="info"><b>{c.nome}</b><div className="dim">Demitido(a). Pode voltar à lista de candidatos.</div></div><button onClick={() => { readmitir(p, c.id); jogo.emitir(); setAba('candidatos'); }}>Chamar de volta</button></div>)}
      {aba === 'ex' && p.recontratar.length === 0 && <div className="cartao dim">Ninguém foi demitido.</div>}
      {sel && <FichaCandidato jogo={jogo} c={sel} fechar={() => setSel(null)} />}
    </Janela>
  );
}
function FichaCandidato({ jogo, c, fechar }: { jogo: Jogo; c: Candidato; fechar: () => void }) {
  const [partes] = useState(() => { const [n, ...r] = c.nome.split(' '); return { n, r: r.join(' ') }; });
  const [nome, setNome] = useState(partes.n); const [sob, setSob] = useState(partes.r); const [ap, setAp] = useState(''); const [cargo, setCargo] = useState(c.cargo); const [tr, setTr] = useState<string[]>(c.tracos); const [comp, setComp] = useState(c.comportamento); const [sal, setSal] = useState(c.salario);
  const [ent, setEnt] = useState('09:00'); const [sai, setSai] = useState('18:00'); const [def, setDef] = useState<string[]>(c.fracos.length ? [] : []); const [hab, setHab] = useState(c.habilidades); const [extras, setExtras] = useState('');
  const togDef = (id: string): void => setDef((t) => (t.includes(id) ? t.filter((x) => x !== id) : t.length >= 6 ? t : [...t, id]));
  const tog = (id: string): void => setTr((t) => (t.includes(id) ? t.filter((x) => x !== id) : t.length >= 5 ? t : [...t, id]));
  return (
    <Janela titulo={`Perfil — ${c.nome}`} onFechar={fechar} largura={600}>
      <div className="linha" style={{ alignItems: 'flex-start' }}><img className="avatar" style={{ width: 100, height: 150 }} src={urlAvatar(c.avatar)} alt="" />
        <div className="grow"><div className="ouro">{c.cargo} — {c.especialidade}</div><div className="dim">{c.idade} anos · {c.disponibilidade}</div><p>{c.descricao}</p><Habilidades h={c.habilidades} />
          <div className="ok">Pontos fortes: {c.fortes.join(', ') || '—'}</div><div className="erro">Pontos fracos: {c.fracos.join(', ') || '—'}</div></div></div>
      <h3>Personalizar e contratar</h3>
      <div className="linha"><div className="grow"><label>Nome</label><input value={nome} maxLength={30} onChange={(e) => setNome(e.target.value)} data-testid="ct-nome" /></div><div className="grow"><label>Sobrenome</label><input value={sob} maxLength={30} onChange={(e) => setSob(e.target.value)} /></div><div className="grow"><label>Apelido</label><input value={ap} maxLength={20} onChange={(e) => setAp(e.target.value)} /></div></div>
      <div className="linha"><div className="grow"><label>Cargo</label><input value={cargo} maxLength={40} onChange={(e) => setCargo(e.target.value)} /></div><div><label>Salário (CC/dia)</label><input type="number" min={1} max={500} value={sal} onChange={(e) => setSal(Number(e.target.value))} style={{ width: 90 }} /></div>
        <div><label>Entrada</label><input type="time" value={ent} onChange={(e) => setEnt(e.target.value)} /></div><div><label>Saída</label><input type="time" value={sai} onChange={(e) => setSai(e.target.value)} /></div></div>
      <label>Traços de personalidade (até 5) — clique para marcar</label><Tracos ids={tr} onTog={tog} />
      <label>Defeitos (até 6) — clique para marcar</label><Defeitos ids={def} onTog={togDef} />
      <label>Habilidades (você define)</label><EditorHabilidades h={hab} onChange={setHab} />
      <label>Outras habilidades / funções (texto livre)</label><input value={extras} maxLength={300} onChange={(e) => setExtras(e.target.value)} placeholder="ex.: fala inglês, programa em Python, cuida do financeiro" data-testid="ct-extras" />
      <label>Comportamento</label><textarea value={comp} onChange={(e) => setComp(e.target.value)} />
      <div className="dim">Depois de contratada, ela fica permanentemente sentada na estação de trabalho (mesa + cadeira + computador) e responde às suas mensagens no chat.</div>
      <div className="linha dir"><button onClick={fechar}>Voltar</button><button className="primario" data-testid="confirmar-contratar" onClick={() => {
        const r = contratar(jogo.p, c.id, { nome, sobrenome: sob, apelido: ap, cargo, profissao: c.especialidade, tracos: tr, comportamento: comp, salario: sal, entrada: paraMin(ent), saida: paraMin(sai), defeitos: def, habilidades: hab, extras });
        jogo.resultado(r); if (r.ok) { jogo.notificar('funcionario_contratado', { nome: nome.trim(), cargo: cargo.trim() }); fechar(); }
      }}>Contratar por {cc(sal)}/dia</button></div>
    </Janela>
  );
}

export function Equipe({ jogo, fechar, perfil }: { jogo: Jogo; fechar: () => void; perfil: (id: string) => void }) {
  useJogo(jogo); const p = jogo.p;
  return (<Janela titulo="👥 EQUIPE" onFechar={fechar} largura={600}>
    {p.funcionarios.filter((f) => f.status !== 'demitido').length === 0 && <div className="cartao dim">Ninguém contratado ainda. Use o botão CONTRATAR.</div>}
    {p.funcionarios.filter((f) => f.status !== 'demitido').map((f) => (
      <div className="item" key={f.id} data-testid="func-item"><img className="avatar" src={urlAvatar(f.avatar)} alt="" /><div className="info"><b className="ouro">{f.nome} {f.sobrenome}</b> {f.apelido && <span className="dim">“{f.apelido}”</span>}<div>{f.cargo} · {f.status === 'ativo' ? ESTADOS[f.estado] : 'Em licença'}</div>
        <div className="dim">Energia {Math.round(f.energia)}% · Humor {Math.round(f.humor)}% · {f.estacao ? 'Estação definida' : 'SEM estação'} · {cc(f.salario)}/dia · {hora(f.entrada)}–{hora(f.saida)}</div></div>
        <button onClick={() => perfil(f.id)}>Perfil</button></div>))}
  </Janela>);
}

export function Perfil({ jogo, id, fechar }: { jogo: Jogo; id: string; fechar: () => void }) {
  useJogo(jogo); const p = jogo.p; const f = p.funcionarios.find((q) => q.id === id); const [ed, setEd] = useState(false);
  const livres = useMemo(() => estacoesLivres(p), [p, p.funcionarios.length, p.objetos.length]);
  if (!f) return null;
  const nomeMesa = (mid: string): string => { const o = p.objetos.find((q) => q.id === mid); return o ? `${item(o.def)?.nome ?? 'Mesa'} (${o.x},${o.y})` : '—'; };
  return (
    <Janela titulo={`${f.nome} ${f.sobrenome}`} onFechar={fechar} largura={560}>
      <div className="linha" style={{ alignItems: 'flex-start' }}><img className="avatar" style={{ width: 90, height: 140 }} src={urlAvatar(f.avatar)} alt="" />
        <div className="grow"><div className="ouro">{f.cargo}</div><div className="dim">{f.idade} anos · {f.status === 'ativo' ? ESTADOS[f.estado] : f.status === 'afastado' ? 'Em licença' : 'Demitido'} · contratado no dia {diaDe(f.contratadoEm)}</div>
          <div>Energia {Math.round(f.energia)}%<div className="barra"><i style={{ width: `${f.energia}%` }} /></div></div><div>Humor {Math.round(f.humor)}%<div className="barra"><i style={{ width: `${f.humor}%`, background: '#ffd75e' }} /></div></div>
          <div className="dim">Rende hoje {f.metaDia ?? '—'} CC ({desempenhoDe(f) === 'alto' ? 'desempenho ALTO ▲' : desempenhoDe(f) === 'baixo' ? 'desempenho BAIXO ▼' : 'desempenho médio'}) · último dia {cc(Math.round(f.produzido))} · salário {cc(f.salario)}/dia · expediente {hora(f.entrada)}–{hora(f.saida)}</div></div></div>
      <Habilidades h={f.habilidades} /><Tracos ids={f.tracos} />{(f.defeitos ?? []).length > 0 && <Defeitos ids={f.defeitos ?? []} />}{f.extras && <div className="dim">Outras habilidades: {f.extras}</div>}<p className="dim">{f.comportamento}</p>
      <label>Estação de trabalho</label>
      <div className="linha"><select value={f.estacao ?? ''} onChange={(e) => jogo.resultado(atribuirEstacao(p, f.id, e.target.value || null))} data-testid="sel-estacao" disabled={f.status !== 'ativo'}>
        <option value="">— sem estação —</option>{f.estacao && <option value={f.estacao}>{nomeMesa(f.estacao)} (atual)</option>}{livres.filter((l) => l !== f.estacao).map((l) => <option key={l} value={l}>{nomeMesa(l)}</option>)}</select></div>
      <div className="dim">Uma estação = mesa + cadeira encostada + computador em cima; cada mesa atende uma pessoa.</div>
      <div className="linha dir"><button onClick={() => setEd(!ed)}>Editar dados</button>
        {f.status === 'ativo' && <button onClick={() => { jogo.resultado(afastar(p, f.id)); }}>Licença</button>}{f.status === 'afastado' && <button onClick={() => jogo.resultado(retornar(p, f.id))}>Voltar da licença</button>}
        <button className="perigo" onClick={() => { jogo.resultado(demitir(p, f.id)); jogo.notificar('funcionario_demitido', { nome: f.nome }); fechar(); }} data-testid="demitir">Demitir</button></div>
      {ed && <Edicao jogo={jogo} f={f} />}
    </Janela>
  );
}
function Edicao({ jogo, f }: { jogo: Jogo; f: Funcionario }) {
  const [nome, setNome] = useState(f.nome); const [sob, setSob] = useState(f.sobrenome); const [ap, setAp] = useState(f.apelido); const [cargo, setCargo] = useState(f.cargo); const [sal, setSal] = useState(f.salario); const [tr, setTr] = useState(f.tracos); const [comp, setComp] = useState(f.comportamento); const [def, setDef] = useState(f.defeitos ?? []); const [hab, setHab] = useState(f.habilidades); const [extras, setExtras] = useState(f.extras ?? '');
  const togDef = (id: string): void => setDef((t) => (t.includes(id) ? t.filter((x) => x !== id) : t.length >= 6 ? t : [...t, id]));
  const tog = (id: string): void => setTr((t) => (t.includes(id) ? t.filter((x) => x !== id) : t.length >= 5 ? t : [...t, id]));
  return (<div className="cartao"><div className="linha"><input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome" /><input value={sob} onChange={(e) => setSob(e.target.value)} placeholder="Sobrenome" /><input value={ap} onChange={(e) => setAp(e.target.value)} placeholder="Apelido" /></div>
    <div className="linha"><input value={cargo} onChange={(e) => setCargo(e.target.value)} /><input type="number" value={sal} min={1} max={500} onChange={(e) => setSal(Number(e.target.value))} style={{ width: 90 }} /></div><Tracos ids={tr} onTog={tog} /><Defeitos ids={def} onTog={togDef} /><EditorHabilidades h={hab} onChange={setHab} /><input value={extras} maxLength={300} onChange={(e) => setExtras(e.target.value)} placeholder="Outras habilidades" /><textarea value={comp} onChange={(e) => setComp(e.target.value)} />
    <button className="primario" onClick={() => { if (!nome.trim() || !(sal >= 1 && sal <= 500)) { jogo.aviso('Nome vazio ou salário inválido.', 'erro'); return; } Object.assign(f, { nome: nome.trim(), sobrenome: sob.trim(), apelido: ap.trim(), cargo: cargo.trim() || f.cargo, salario: Math.round(sal), tracos: tr, comportamento: comp, defeitos: def, habilidades: hab, extras }); jogo.aviso('Dados atualizados.', 'ok'); jogo.emitir(); }}>Salvar alterações</button></div>);
}
void hora; void horaTexto; void minutoDoDia; void ITENS;
