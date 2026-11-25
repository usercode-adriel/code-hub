import { useEffect, useState } from 'react';
import { api, type Lancamento } from './api';
import { Botao, Campo, Cartao, Entrada, Etiqueta, Seletor, Vazio, brl, erroTexto } from './kit';

interface Ind { nome: string; definicao: string; origem: string }
interface Parte { lancamentos: number; indicadores: Record<string, number>; porPlataforma: ({ nome: string } & Record<string, number>)[]; porProduto: ({ nome: string } & Record<string, number>)[]; porCampanha: ({ nome: string } & Record<string, number>)[] }
interface Resumo { real: Parte; teste: Parte; definicoes: Record<string, Ind> }
const ORDEM = ['vendasBrutas', 'vendasConfirmadas', 'pedidos', 'produtosVendidos', 'comissoesEstimadas', 'comissoesAprovadas', 'comissoesRecebidas', 'reembolsos', 'cancelamentos', 'receitaLiquida'];
const DINHEIRO = (k: string): boolean => !['pedidos', 'produtosVendidos'].includes(k);
const STATUS: Record<string, string[]> = { venda: ['pendente', 'confirmada', 'cancelada'], comissao: ['estimada', 'aprovada', 'recebida', 'cancelada'], reembolso: ['confirmado'], cancelamento: ['confirmado'] };
const hoje = (): string => new Date().toISOString().slice(0, 10);

export function PainelFinanceiro({ versao, aoMudar, aviso }: { versao: number; aoMudar: () => void; aviso: (t: string) => void }) {
  const [r, setR] = useState<Resumo | null>(null); const [lancs, setLancs] = useState<Lancamento[]>([]); const [dados, setDados] = useState<'real' | 'teste'>('real'); const [ajuda, setAjuda] = useState<string | null>(null);
  const [f, setF] = useState({ tipo: 'comissao', status: 'estimada', valor: '', data: hoje(), plataforma: 'tiktokshop', produto: '', pedido: '', real: true });
  useEffect(() => { api.get<Resumo>('/financeiro/resumo').then(setR).catch((e) => aviso(erroTexto(e))); api.get<Lancamento[]>(`/financeiro/lancamentos?real=${dados === 'real'}`).then(setLancs).catch(() => {}); }, [versao, dados, aviso]);
  const lancar = async (): Promise<void> => { try { await api.post('/financeiro/lancamentos', { ...f, origem: 'manual' }); aviso('Lançamento registrado'); setF({ ...f, valor: '', pedido: '', produto: '' }); } catch (e) { aviso(erroTexto(e)); } aoMudar(); };
  const parte = r?.[dados];
  return (
    <div className="o-pilha">
      <div className="o-linha"><Botao pequeno primario={dados === 'real'} onClick={() => setDados('real')}>Dados reais</Botao><Botao pequeno primario={dados === 'teste'} onClick={() => setDados('teste')}>Dados de teste</Botao></div>
      <p className="o-mut">Reais e de teste nunca são somados. Faturamento, comissão e receita são coisas diferentes — toque em um indicador para ver a definição e a origem.</p>
      {parte && <div className="o-grade-ind">{ORDEM.map((k) => (
        <button key={k} type="button" className={`o-ind ${k.startsWith('comissoesEst') ? 'est' : ''}`} onClick={() => setAjuda(ajuda === k ? null : k)}>
          <small>{r!.definicoes[k].nome}</small><b>{DINHEIRO(k) ? brl(parte.indicadores[k]) : parte.indicadores[k]}</b>
        </button>))}</div>}
      {ajuda && r && <Cartao titulo={r.definicoes[ajuda].nome}><p>{r.definicoes[ajuda].definicao}</p><p className="o-mut">Origem dos dados: {r.definicoes[ajuda].origem}</p></Cartao>}
      {parte && <Cartao titulo="Por plataforma">{parte.porPlataforma.length ? <table className="o-tab"><thead><tr><th>Plataforma</th><th>Vendas</th><th>Comissão recebida</th><th>Aprovada</th><th>Estimada</th></tr></thead><tbody>{parte.porPlataforma.map((x) => <tr key={x.nome}><td>{x.nome}</td><td>{brl(x.vendasBrutas)}</td><td>{brl(x.comissoesRecebidas)}</td><td>{brl(x.comissoesAprovadas)}</td><td>{brl(x.comissoesEstimadas)}</td></tr>)}</tbody></table> : <Vazio>Sem lançamentos ainda. Importe um relatório ou lance manualmente.</Vazio>}</Cartao>}
      {parte && parte.porProduto.length > 0 && <Cartao titulo="Por produto"><table className="o-tab"><thead><tr><th>Produto</th><th>Vendas</th><th>Recebida</th></tr></thead><tbody>{parte.porProduto.slice(0, 15).map((x) => <tr key={x.nome}><td>{x.nome}</td><td>{brl(x.vendasBrutas)}</td><td>{brl(x.comissoesRecebidas)}</td></tr>)}</tbody></table></Cartao>}
      <Cartao titulo="Novo lançamento manual">
        <div className="o-linha"><Campo rotulo="Tipo"><Seletor value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value, status: STATUS[e.target.value][0] })}>{Object.keys(STATUS).map((t) => <option key={t}>{t}</option>)}</Seletor></Campo><Campo rotulo="Status"><Seletor value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>{STATUS[f.tipo].map((s) => <option key={s}>{s}</option>)}</Seletor></Campo></div>
        <div className="o-linha"><Campo rotulo="Valor (R$)"><Entrada type="number" min="0" step="0.01" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} /></Campo><Campo rotulo="Data"><Entrada type="date" value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} /></Campo></div>
        <div className="o-linha"><Campo rotulo="Plataforma"><Seletor value={f.plataforma} onChange={(e) => setF({ ...f, plataforma: e.target.value })}>{['tiktokshop', 'shopee', 'temu', 'outra'].map((p) => <option key={p}>{p}</option>)}</Seletor></Campo><Campo rotulo="Pedido"><Entrada value={f.pedido} onChange={(e) => setF({ ...f, pedido: e.target.value })} /></Campo></div>
        <Campo rotulo="Produto"><Entrada value={f.produto} onChange={(e) => setF({ ...f, produto: e.target.value })} /></Campo>
        <label className="o-check"><input type="checkbox" checked={f.real} onChange={(e) => setF({ ...f, real: e.target.checked })} /> Lançamento real (desmarque para teste)</label>
        <Botao primario disabled={!f.valor} onClick={lancar}>Registrar</Botao>
      </Cartao>
      <Cartao titulo={`Lançamentos (${dados === 'real' ? 'reais' : 'de teste'})`}>
        {lancs.length ? <table className="o-tab"><thead><tr><th>Data</th><th>Tipo</th><th>Valor</th><th>Status</th><th>Origem</th></tr></thead><tbody>{lancs.slice(0, 60).map((l) => (
          <tr key={l.id}><td>{l.data}</td><td>{l.tipo}<br /><small>{l.produto || l.pedido}</small></td><td>{brl(l.valor)}</td>
            <td><Seletor value={l.status} onChange={async (e) => { try { await api.put(`/financeiro/lancamentos/${l.id}/status`, { status: e.target.value }); } catch (er) { aviso(erroTexto(er)); } aoMudar(); }}>{STATUS[l.tipo].map((s) => <option key={s}>{s}</option>)}</Seletor></td>
            <td><Etiqueta cor="cinza">{l.origem.replace('importacao:', '📄 ')}</Etiqueta></td></tr>))}</tbody></table> : <Vazio>Nenhum lançamento.</Vazio>}
      </Cartao>
    </div>
  );
}
