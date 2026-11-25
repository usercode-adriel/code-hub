import { useState } from 'react';
import { api, type Agente } from './api';
import { Botao, Campo, Cartao, Entrada, Etiqueta, Vazio, erroTexto, quando } from './kit';

interface Reuniao { id: string; pauta: string; participantes: string[]; status: string; criadaEm: string; pareceres: { agenteId: string; status: string; texto: string }[]; decisoes: { id: string; texto: string; aprovadaPeloUsuario: boolean; em: string }[]; relatorio: string }

export function PainelReunioes({ reunioes, agentes, aoMudar, aviso }: { reunioes: Reuniao[]; agentes: Agente[]; aoMudar: () => void; aviso: (t: string) => void }) {
  const [pauta, setPauta] = useState(''); const [sel, setSel] = useState<string[]>([]); const [decisao, setDecisao] = useState(''); const [ocupado, setOcupado] = useState(false);
  const agir = async (fn: () => Promise<unknown>, ok?: string): Promise<void> => { try { await fn(); if (ok) aviso(ok); } catch (e) { aviso(erroTexto(e)); } aoMudar(); };
  return (
    <div className="o-pilha">
      <Cartao titulo="Nova reunião">
        <Campo rotulo="Pauta"><Entrada value={pauta} onChange={(e) => setPauta(e.target.value)} placeholder="Ex.: Lançar campanha dos fones" /></Campo>
        <div className="o-chips">{agentes.map((a) => <label key={a.id} className={`o-chip ${sel.includes(a.id) ? 'on' : ''}`}><input type="checkbox" checked={sel.includes(a.id)} onChange={(e) => setSel(e.target.checked ? [...sel, a.id] : sel.filter((x) => x !== a.id))} />{a.nome}</label>)}</div>
        <Botao primario disabled={!pauta.trim() || !sel.length} onClick={() => agir(async () => { await api.post('/reunioes', { pauta, participantes: sel }); setPauta(''); setSel([]); }, 'Reunião criada')}>Criar reunião</Botao>
      </Cartao>
      {reunioes.length ? reunioes.map((r) => (
        <Cartao key={r.id} titulo={r.pauta} acao={<Etiqueta cor={r.status === 'aberta' ? 'azul' : 'cinza'}>{r.status}</Etiqueta>}>
          <p className="o-mut">{quando(r.criadaEm)} · {r.participantes.map((id) => agentes.find((a) => a.id === id)?.nome ?? '?').join(', ')}</p>
          {r.status === 'aberta' && <Botao pequeno primario disabled={ocupado} onClick={async () => { setOcupado(true); await agir(() => api.post(`/reunioes/${r.id}/pareceres`), 'Pareceres recebidos'); setOcupado(false); }}>{ocupado ? 'Pedindo pareceres…' : 'Pedir parecer de cada participante'}</Botao>}
          {r.relatorio && <div className="o-resultado"><b>Relatório (pareceres dos agentes)</b><pre>{r.relatorio}</pre></div>}
          <h5>Decisões</h5>
          {r.decisoes.map((d) => <p key={d.id}>{d.aprovadaPeloUsuario ? '✅' : '•'} {d.texto} <small className="o-mut">{quando(d.em)}</small></p>)}
          {r.status === 'aberta' && <div className="o-linha"><Entrada value={decisao} onChange={(e) => setDecisao(e.target.value)} placeholder="Registrar decisão…" /><Botao pequeno disabled={!decisao.trim()} onClick={() => agir(async () => { await api.post(`/reunioes/${r.id}/decisoes`, { texto: decisao, aprovadaPeloUsuario: true }); setDecisao(''); })}>Aprovar e registrar</Botao></div>}
          {r.status === 'aberta' && <Botao pequeno onClick={() => agir(() => api.post(`/reunioes/${r.id}/encerrar`))}>Encerrar reunião</Botao>}
        </Cartao>)) : <Vazio>Nenhuma reunião. Reuna os agentes, peça pareceres reais e registre as decisões.</Vazio>}
    </div>
  );
}
export type { Reuniao };
