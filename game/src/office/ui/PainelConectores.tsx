import { useEffect, useState } from 'react';
import { api } from './api';
import { Botao, Campo, Cartao, Entrada, Etiqueta, Seletor, Texto, erroTexto, quando } from './kit';

interface Cap { dado: string; nome: string; api: string; importacao: string; frescor: string }
interface Conector { id: string; nome: string; classe: string; pais: string; nota: string; documentacao: string[]; modo: string; status: string; ultimaSincronizacao: string | null; credenciais: { campo: string; configurado: boolean }[]; capacidades: Cap[]; checklist: { id: string; nome: string; referencia: string; status: string; nota: string }[]; operacional: { api: string; importacaoCsv: string; lancamentoManual: string }; logs: { id: string; em: string; nivel: string; mensagem: string }[] }
const STATUS_ROT: Record<string, string> = { importacao: 'Modo importação', aguardando_autorizacao: 'Aguardando autorização', conectado: 'Conectado', erro: 'Com erro', revogado: 'Acesso revogado', nao_configurado: 'Não configurado' };
const DISP: Record<string, [string, 'verde' | 'amarelo' | 'cinza' | 'vermelho']> = { nao_verificado: ['não verificado', 'amarelo'], possivel: ['possível por relatório', 'verde'], manual: ['só manual', 'cinza'], indisponivel: ['indisponível', 'vermelho'] };

export function PainelConectores({ aoMudar, aviso }: { aoMudar: () => void; aviso: (t: string) => void }) {
  const [lista, setLista] = useState<Conector[]>([]); const [aberto, setAberto] = useState<string | null>('tiktokshop'); const [cred, setCred] = useState<Record<string, string>>({});
  const carregar = (): void => { api.get<Conector[]>('/conectores').then(setLista).catch((e) => aviso(erroTexto(e))); };
  useEffect(carregar, []);
  const agir = async (fn: () => Promise<unknown>, ok?: string): Promise<void> => { try { await fn(); if (ok) aviso(ok); } catch (e) { aviso(erroTexto(e)); } carregar(); aoMudar(); };
  return (
    <div className="o-pilha">
      <p className="o-mut">Cada plataforma tem o seu conector. Nada é simulado: o que depende de API oficial aparece como pendente, e a importação de relatórios e o lançamento manual funcionam sempre.</p>
      {lista.map((c) => (
        <Cartao key={c.id} titulo={c.nome} acao={<Etiqueta cor={c.status === 'conectado' ? 'verde' : c.status === 'erro' ? 'vermelho' : 'amarelo'}>{STATUS_ROT[c.status] ?? c.status}</Etiqueta>}>
          <p className="o-mut">{c.classe} · {c.nota}</p>
          <div className="o-linha"><Etiqueta cor="verde">CSV: {c.operacional.importacaoCsv}</Etiqueta><Etiqueta cor="verde">Manual: {c.operacional.lancamentoManual}</Etiqueta><Etiqueta cor="amarelo" titulo={c.operacional.api}>API: pendente</Etiqueta></div>
          <Botao pequeno onClick={() => setAberto(aberto === c.id ? null : c.id)}>{aberto === c.id ? 'Recolher' : 'Detalhes'}</Botao>
          {aberto === c.id && (
            <div className="o-pilha">
              <h5>Verificação de elegibilidade</h5>
              {c.checklist.map((i) => (
                <div key={i.id} className="o-check-item"><b>{i.nome}</b><small className="o-mut">{i.referencia}</small>
                  <div className="o-linha"><Seletor value={i.status} onChange={(e) => agir(() => api.put(`/conectores/${c.id}/checklist/${i.id}`, { status: e.target.value, nota: i.nota }))}><option value="nao_verificado">Não verificado</option><option value="confirmado">Confirmado</option><option value="indisponivel">Indisponível</option></Seletor>
                    <Entrada defaultValue={i.nota} placeholder="Anotação (onde você confirmou)" onBlur={(e) => e.target.value !== i.nota && agir(() => api.put(`/conectores/${c.id}/checklist/${i.id}`, { status: i.status, nota: e.target.value }))} /></div></div>))}
              {c.documentacao.length > 0 && <p className="o-mut">Documentação consultada: {c.documentacao.map((d) => <a key={d} href={d} target="_blank" rel="noopener noreferrer">{new URL(d).pathname.split('/').pop()}</a>).reduce<React.ReactNode[]>((a, x, i) => (i ? [...a, ' · ', x] : [x]), [])}</p>}
              <h5>Dados e disponibilidade (origem e frescor)</h5>
              <div className="o-rolagem"><table className="o-tab"><thead><tr><th>Dado</th><th>API oficial</th><th>Relatório</th></tr></thead><tbody>{c.capacidades.map((x) => <tr key={x.dado}><td>{x.nome}</td><td><Etiqueta cor={DISP[x.api][1]}>{DISP[x.api][0]}</Etiqueta></td><td><Etiqueta cor={DISP[x.importacao][1]}>{DISP[x.importacao][0]}</Etiqueta></td></tr>)}</tbody></table></div>
              <p className="o-mut">Importação = dado com defasagem (do arquivo). Nenhum dado é em tempo real até a API oficial ser confirmada.</p>
              <h5>Credenciais (guardadas só no servidor)</h5>
              {c.credenciais.map((k) => <Campo key={k.campo} rotulo={`${k.campo} ${k.configurado ? '✓ configurado' : ''}`}><Entrada type="password" autoComplete="off" value={cred[`${c.id}.${k.campo}`] ?? ''} onChange={(e) => setCred({ ...cred, [`${c.id}.${k.campo}`]: e.target.value })} placeholder={k.configurado ? '•••••• (deixe vazio para manter)' : 'não configurado'} /></Campo>)}
              <div className="o-linha">
                <Botao pequeno primario onClick={() => agir(() => api.put(`/conectores/${c.id}/credenciais`, Object.fromEntries(c.credenciais.map((k) => [k.campo, cred[`${c.id}.${k.campo}`] ?? '']))).then(() => setCred({})), 'Credenciais salvas no servidor')}>Salvar credenciais</Botao>
                <Botao pequeno onClick={() => agir(() => api.post(`/conectores/${c.id}/sincronizar`))}>Sincronizar por API</Botao>
                <Botao pequeno perigo onClick={() => window.confirm('Remover as credenciais deste conector?') && agir(() => api.post(`/conectores/${c.id}/revogar`), 'Acesso revogado')}>Revogar acesso</Botao>
              </div>
              <h5>Registro (logs)</h5>
              {c.logs.length ? <ul className="o-lista">{c.logs.slice(0, 8).map((l) => <li key={l.id}><small>{quando(l.em)}</small> <Etiqueta cor={l.nivel === 'erro' ? 'vermelho' : l.nivel === 'aviso' ? 'amarelo' : 'cinza'}>{l.nivel}</Etiqueta> {l.mensagem}</li>)}</ul> : <p className="o-mut">Sem registros.</p>}
              {c.ultimaSincronizacao && <p className="o-mut">Última sincronização: {quando(c.ultimaSincronizacao)}</p>}
            </div>)}
        </Cartao>))}
    </div>
  );
}
export { Texto };
