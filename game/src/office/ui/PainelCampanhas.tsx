import { useState } from 'react';
import { api, type Agente, type Campanha, type Produto, type Tarefa } from './api';
import { Botao, Campo, Cartao, Entrada, Etiqueta, Seletor, Texto, Vazio, erroTexto } from './kit';

const ETAPAS: [string, string][] = [['pesquisa', '1. Pesquisa de produto'], ['publico', '2. Público'], ['ideias', '3. Ideias'], ['planejamento', '4. Planejamento'], ['roteiro', '5. Roteiro'], ['criativo', '6. Criativo'], ['edicao', '7. Edição'], ['aprovacao', '8. Aprovação'], ['publicacao', '9. Publicação'], ['analise', '10. Análise']];
const STATUS: [string, string][] = [['ideia', 'Ideia'], ['planejada', 'Planejada'], ['em_producao', 'Em produção'], ['aprovacao', 'Em aprovação'], ['publicada', 'Publicada'], ['encerrada', 'Encerrada']];

export function PainelCampanhas({ campanhas, produtos, agentes, aoMudar, aviso }: { campanhas: Campanha[]; produtos: Produto[]; agentes: Agente[]; aoMudar: () => void; aviso: (t: string) => void }) {
  const [nome, setNome] = useState(''); const [produtoId, setProdutoId] = useState(''); const [objetivo, setObjetivo] = useState(''); const [plataforma, setPlataforma] = useState('tiktokshop'); const [aberta, setAberta] = useState<string | null>(null);
  const agir = async (fn: () => Promise<unknown>, ok?: string): Promise<void> => { try { await fn(); if (ok) aviso(ok); } catch (e) { aviso(erroTexto(e)); } aoMudar(); };
  const criar = (): Promise<void> => agir(async () => { await api.post('/campanhas', { nome, produtoId: produtoId || null, objetivo, plataforma }); setNome(''); setObjetivo(''); }, 'Campanha criada');
  return (
    <div className="o-pilha">
      <Cartao titulo="Nova campanha">
        <Campo rotulo="Nome"><Entrada value={nome} onChange={(e) => setNome(e.target.value)} /></Campo>
        <div className="o-linha"><Campo rotulo="Produto"><Seletor value={produtoId} onChange={(e) => setProdutoId(e.target.value)}><option value="">— sem produto —</option>{produtos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</Seletor></Campo><Campo rotulo="Plataforma"><Seletor value={plataforma} onChange={(e) => setPlataforma(e.target.value)}>{['tiktokshop', 'shopee', 'temu', 'outra'].map((p) => <option key={p}>{p}</option>)}</Seletor></Campo></div>
        <Campo rotulo="Objetivo"><Entrada value={objetivo} onChange={(e) => setObjetivo(e.target.value)} /></Campo>
        <Botao primario disabled={!nome.trim()} onClick={criar}>Criar campanha</Botao>
      </Cartao>
      {campanhas.length ? campanhas.map((c) => <CartaoCampanha key={c.id} c={c} aberta={aberta === c.id} alternar={() => setAberta(aberta === c.id ? null : c.id)} produto={produtos.find((p) => p.id === c.produtoId)} agentes={agentes} agir={agir} />) : <Vazio>Nenhuma campanha. Crie uma e peça ideias e roteiros aos agentes.</Vazio>}
    </div>
  );
}

function CartaoCampanha({ c, aberta, alternar, produto, agentes, agir }: { c: Campanha; aberta: boolean; alternar: () => void; produto?: Produto; agentes: Agente[]; agir: (fn: () => Promise<unknown>, ok?: string) => Promise<void> }) {
  const [roteiro, setRoteiro] = useState(''); const [res, setRes] = useState({ metrica: '', valor: '', fonte: '' });
  const pedir = (chave: string, nomeTarefa: string): Promise<void> => agir(async () => {
    const ag = agentes.find((a) => a.chave === chave); if (!ag) throw new Error('Agente não encontrado.');
    const t = await api.post<Tarefa>('/tarefas', { nome: `${nomeTarefa}: ${c.nome}`.slice(0, 160), descricao: `Campanha "${c.nome}". Objetivo: ${c.objetivo || 'não definido'}. ${produto ? `Produto: ${produto.nome} (${produto.plataforma}).` : ''} Use as ferramentas de campanha para anexar o resultado e cite as fontes.`, agenteId: ag.id, departamento: ag.departamento, campanhaId: c.id, produtoId: c.produtoId });
    await api.post(`/tarefas/${t.id}/despachar`);
  }, 'Tarefa enviada ao agente');
  return (
    <Cartao titulo={c.nome} acao={<Etiqueta cor={c.status === 'publicada' ? 'verde' : 'azul'}>{STATUS.find(([k]) => k === c.status)?.[1]}</Etiqueta>}>
      <p className="o-mut">{c.objetivo || 'Sem objetivo definido'} · {c.plataforma}{produto ? ` · ${produto.nome}` : ''}</p>
      <div className="o-etapas">{ETAPAS.map(([k, r]) => <button key={k} type="button" className={c.etapa === k ? 'on' : ''} title={r} onClick={() => agir(() => api.put(`/campanhas/${c.id}`, { etapa: k }))}>{r.split('.')[0]}</button>)}</div>
      <p className="o-mut">Etapa atual: <b>{ETAPAS.find(([k]) => k === c.etapa)?.[1]}</b></p>
      <Botao pequeno onClick={alternar}>{aberta ? 'Recolher' : 'Abrir campanha'}</Botao>
      {aberta && (
        <div className="o-pilha">
          <div className="o-linha"><Botao pequeno onClick={() => pedir('isabela', 'Ideias e público')}>Pedir ideias à Isabela</Botao><Botao pequeno onClick={() => pedir('marina', 'Roteiro e conceito visual')}>Pedir roteiro à Marina</Botao></div>
          <Seletor value={c.status} onChange={(e) => agir(() => api.put(`/campanhas/${c.id}`, { status: e.target.value, aprovadoPeloUsuario: e.target.value === 'publicada' ? window.confirm('Marcar como publicada? Publicar é uma ação comercial externa: confirme que VOCÊ aprovou e publicou.') : undefined }))}>{STATUS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Seletor>
          <p className="o-mut">A publicação depende das APIs e permissões da plataforma e da sua aprovação. O Codeniac não publica sozinho.</p>
          <h5>Roteiros</h5>
          {c.roteiros.map((r) => <div key={r.id} className="o-resultado"><b>{r.titulo}</b> <small>por {r.autor}</small><pre>{r.texto}</pre></div>)}
          <Texto rows={3} value={roteiro} onChange={(e) => setRoteiro(e.target.value)} placeholder="Escreva ou cole um roteiro…" /><Botao pequeno disabled={!roteiro.trim()} onClick={() => agir(async () => { await api.post(`/campanhas/${c.id}/itens/roteiros`, { texto: roteiro, autor: 'manual' }); setRoteiro(''); })}>Adicionar roteiro</Botao>
          <h5>Criativos</h5>
          {c.criativos.length ? c.criativos.map((k) => <p key={k.id}>{k.titulo} <small>({k.tipo})</small></p>) : <p className="o-mut">Nenhum criativo. Os agentes podem gerar imagens pela ferramenta de imagens do Hub; o Editor de Vídeo e o Video Cut ainda não existem no Estúdio (pendente).</p>}
          <h5>Resultados (com fonte)</h5>
          {c.resultados.map((r) => <p key={r.id}>{r.metrica}: <b>{r.valor}</b> <small className="o-mut">({r.data} · fonte: {r.fonte})</small></p>)}
          <div className="o-linha"><Entrada placeholder="Métrica (ex.: visualizações)" value={res.metrica} onChange={(e) => setRes({ ...res, metrica: e.target.value })} /><Entrada type="number" placeholder="Valor" value={res.valor} onChange={(e) => setRes({ ...res, valor: e.target.value })} /></div>
          <Entrada placeholder="Fonte do número (obrigatória)" value={res.fonte} onChange={(e) => setRes({ ...res, fonte: e.target.value })} />
          <Botao pequeno disabled={!res.metrica || !res.valor} onClick={() => agir(async () => { await api.post(`/campanhas/${c.id}/itens/resultados`, res); setRes({ metrica: '', valor: '', fonte: '' }); }, 'Resultado registrado')}>Registrar resultado</Botao>
        </div>)}
    </Cartao>
  );
}
