import { useState } from 'react';
import { api, type Produto } from './api';
import { Botao, Campo, Cartao, Entrada, Etiqueta, Seletor, Texto, Vazio, brl, erroTexto } from './kit';

const PLATAFORMAS: [string, string][] = [['tiktokshop', 'TikTok Shop'], ['shopee', 'Shopee'], ['temu', 'Temu'], ['outra', 'Outra']];
const STATUS: [string, string][] = [['em_pesquisa', 'Em pesquisa'], ['candidato', 'Candidato'], ['em_promocao', 'Em promoção'], ['descartado', 'Descartado']];
const vazio = { nome: '', preco: '', comissaoPct: '', plataforma: 'tiktokshop', link: '', categoria: '', publicoAlvo: '', origem: 'manual', notaTexto: '', notaValor: '', notaFonte: '', real: true };

export function PainelProdutos({ produtos, aoMudar, aviso }: { produtos: Produto[]; aoMudar: () => void; aviso: (t: string) => void }) {
  const [f, setF] = useState(vazio); const [sel, setSel] = useState<Produto | null>(null); const [filtro, setFiltro] = useState('');
  const salvar = async (): Promise<void> => {
    try {
      const corpo = { nome: f.nome, preco: f.preco, comissaoPct: f.comissaoPct, plataforma: f.plataforma, link: f.link, categoria: f.categoria, publicoAlvo: f.publicoAlvo, origem: f.origem, real: f.real, avaliacao: f.notaTexto || f.notaValor ? { texto: f.notaTexto, nota: f.notaValor, fonte: f.notaFonte } : null };
      await api.post('/produtos', corpo); setF(vazio); aviso('Produto cadastrado');
    } catch (e) { aviso(erroTexto(e)); } aoMudar();
  };
  const lista = produtos.filter((p) => !filtro || `${p.nome} ${p.categoria}`.toLowerCase().includes(filtro.toLowerCase()));
  return (
    <div className="o-pilha">
      <Cartao titulo="Novo produto">
        <Campo rotulo="Nome"><Entrada value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></Campo>
        <div className="o-linha"><Campo rotulo="Plataforma"><Seletor value={f.plataforma} onChange={(e) => setF({ ...f, plataforma: e.target.value })}>{PLATAFORMAS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Seletor></Campo><Campo rotulo="Categoria"><Entrada value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })} /></Campo></div>
        <div className="o-linha"><Campo rotulo="Preço (R$)"><Entrada type="number" min="0" step="0.01" value={f.preco} onChange={(e) => setF({ ...f, preco: e.target.value })} /></Campo><Campo rotulo="Comissão (%)"><Entrada type="number" min="0" max="100" step="0.1" value={f.comissaoPct} onChange={(e) => setF({ ...f, comissaoPct: e.target.value })} /></Campo></div>
        <Campo rotulo="Link do produto"><Entrada value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} placeholder="https://…" /></Campo>
        <Campo rotulo="Origem das informações" dica="De onde vieram preço e comissão (página, relatório, conversa).">< Entrada value={f.origem} onChange={(e) => setF({ ...f, origem: e.target.value })} /></Campo>
        <Campo rotulo="Público-alvo"><Entrada value={f.publicoAlvo} onChange={(e) => setF({ ...f, publicoAlvo: e.target.value })} /></Campo>
        <details><summary>Avaliação comercial (opcional)</summary>
          <Campo rotulo="Observação"><Texto rows={2} value={f.notaTexto} onChange={(e) => setF({ ...f, notaTexto: e.target.value })} /></Campo>
          <div className="o-linha"><Campo rotulo="Nota"><Entrada type="number" min="0" max="10" step="0.1" value={f.notaValor} onChange={(e) => setF({ ...f, notaValor: e.target.value })} /></Campo><Campo rotulo="Fonte da nota" dica="Obrigatória se houver nota."><Entrada value={f.notaFonte} onChange={(e) => setF({ ...f, notaFonte: e.target.value })} /></Campo></div>
        </details>
        <label className="o-check"><input type="checkbox" checked={f.real} onChange={(e) => setF({ ...f, real: e.target.checked })} /> Produto real (desmarque para dados de teste)</label>
        <Botao primario disabled={!f.nome.trim()} onClick={salvar}>Cadastrar produto</Botao>
      </Cartao>
      <Entrada placeholder="Buscar produto…" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
      {lista.length ? lista.map((p) => (
        <Cartao key={p.id} titulo={<>{p.nome} {!p.real && <Etiqueta cor="amarelo">teste</Etiqueta>}</>} acao={<Etiqueta cor="roxo">{PLATAFORMAS.find(([k]) => k === p.plataforma)?.[1]}</Etiqueta>}>
          <p className="o-mut">{p.categoria || 'sem categoria'} · origem: {p.origem}</p>
          <div className="o-grade-kpi"><div><b>{brl(p.preco)}</b><small>preço</small></div><div><b>{p.comissaoPct != null ? `${p.comissaoPct}%` : '—'}</b><small>comissão</small></div><div><b>{brl(p.comissaoPotencial)}</b><small>potencial/venda*</small></div></div>
          <p className="o-mut">* estimativa (preço × %), não é valor recebido.</p>
          {p.avaliacao && <p><b>Avaliação:</b> {p.avaliacao.nota != null ? `${p.avaliacao.nota} — ` : ''}{p.avaliacao.texto} <small className="o-mut">(fonte: {p.avaliacao.fonte || 'sem nota'})</small></p>}
          <div className="o-linha"><Seletor value={p.status} onChange={async (e) => { try { await api.put(`/produtos/${p.id}`, { status: e.target.value }); } catch (er) { aviso(erroTexto(er)); } aoMudar(); }}>{STATUS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Seletor>
            {p.link && <a className="o-btn peq" href={p.link} target="_blank" rel="noopener noreferrer">Abrir link</a>}
            <Botao pequeno onClick={() => setSel(sel?.id === p.id ? null : p)}>Histórico</Botao>
            <Botao pequeno perigo onClick={async () => { if (!window.confirm('Apagar este produto?')) return; try { await api.del(`/produtos/${p.id}`); } catch (e) { aviso(erroTexto(e)); } aoMudar(); }}>Apagar</Botao></div>
          {sel?.id === p.id && <ul className="o-lista">{p.historico.map((h, i) => <li key={i}><small>{new Date(h.em).toLocaleString('pt-BR')}</small> {h.acao}{h.campos ? ` (${h.campos.join(', ')})` : ''}</li>)}</ul>}
        </Cartao>)) : <Vazio>Nenhum produto cadastrado. Os agentes também podem cadastrar, sempre com a origem das informações.</Vazio>}
    </div>
  );
}
