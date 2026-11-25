import { useState } from 'react';
import { api } from './api';
import { Botao, Campo, Cartao, Entrada, Etiqueta, Seletor, Vazio, erroTexto, quando } from './kit';

interface Previa { delimitador: string; cabecalho: string[]; totalLinhas: number; amostra: string[][]; mapeamentoSugerido: Record<string, number>; mapeamento: Record<string, number>; campos: Record<string, { nome: string; obrigatorio: boolean }>; validos: number; erros: { linha: number; motivo: string }[]; totalErros: number; faltaObrigatorio: string[] }
interface Reg { id: string; em: string; plataforma: string; arquivo: string; linhas: number; criados: number; duplicados: number; erros: number; real: boolean }
interface Resultado extends Reg { detalheErros: { linha: number; motivo: string }[] }

/** Importador de relatórios CSV: funciona mesmo sem API da plataforma. Mostra o que será importado ANTES de gravar. */
export function PainelImportador({ historico, aoMudar, aviso }: { historico: Reg[]; aoMudar: () => void; aviso: (t: string) => void }) {
  const [texto, setTexto] = useState(''); const [arquivo, setArquivo] = useState(''); const [plataforma, setPlataforma] = useState('tiktokshop'); const [real, setReal] = useState(true);
  const [previa, setPrevia] = useState<Previa | null>(null); const [mapa, setMapa] = useState<Record<string, number | ''>>({}); const [res, setRes] = useState<Resultado | null>(null);
  const analisar = async (t: string, m?: Record<string, number | ''>): Promise<void> => {
    try { const corpo = m ? Object.fromEntries(Object.entries(m).filter(([, v]) => v !== '')) : null; const p = await api.post<Previa>('/importacao/previa', { texto: t, mapeamento: corpo }); setPrevia(p); if (!m) setMapa(p.mapeamentoSugerido); setRes(null); }
    catch (e) { setPrevia(null); aviso(erroTexto(e)); }
  };
  const lerArquivo = async (f: File | undefined): Promise<void> => { if (!f) return; if (f.size > 5 * 1024 * 1024) { aviso('Arquivo acima de 5 MB'); return; } const t = await f.text(); setTexto(t); setArquivo(f.name); await analisar(t); };
  const importar = async (): Promise<void> => {
    try { const corpo = Object.fromEntries(Object.entries(mapa).filter(([, v]) => v !== '')); const r = await api.post<Resultado>('/importacao', { plataforma, texto, mapeamento: corpo, arquivo: arquivo || 'colado.csv', real }); setRes(r); setPrevia(null); aviso(`${r.criados} lançamento(s) novos, ${r.duplicados} duplicado(s)`); }
    catch (e) { aviso(erroTexto(e)); } aoMudar();
  };
  return (
    <div className="o-pilha">
      <Cartao titulo="Importar relatório (CSV)">
        <p className="o-mut">Use o relatório oficial da plataforma (vendas, pedidos ou comissões). Nada é gravado antes de você conferir a prévia. Importações repetidas não duplicam lançamentos.</p>
        <div className="o-linha"><Campo rotulo="Plataforma"><Seletor value={plataforma} onChange={(e) => setPlataforma(e.target.value)}>{[['tiktokshop', 'TikTok Shop'], ['shopee', 'Shopee'], ['temu', 'Temu'], ['outra', 'Outra']].map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Seletor></Campo>
          <Campo rotulo="Arquivo CSV"><input type="file" accept=".csv,text/csv,text/plain" onChange={(e) => lerArquivo(e.target.files?.[0])} /></Campo></div>
        <Campo rotulo="…ou cole o conteúdo"><textarea className="o-in" rows={4} value={texto} onChange={(e) => setTexto(e.target.value)} onBlur={() => texto.trim() && analisar(texto)} placeholder="Order ID;Order Time;Product Name;…" /></Campo>
        <label className="o-check"><input type="checkbox" checked={real} onChange={(e) => setReal(e.target.checked)} /> Dados reais (desmarque para teste)</label>
      </Cartao>
      {previa && (
        <Cartao titulo="Prévia e mapeamento de colunas">
          <p className="o-mut">{previa.totalLinhas} linha(s) · delimitador “{previa.delimitador === '\t' ? 'tab' : previa.delimitador}” · <b>{previa.validos}</b> lançamento(s) válidos · <b>{previa.totalErros}</b> erro(s)</p>
          {Object.entries(previa.campos).map(([campo, def]) => (
            <Campo key={campo} rotulo={`${def.nome}${def.obrigatorio ? ' *' : ''}`}>
              <Seletor value={mapa[campo] ?? ''} onChange={(e) => { const m = { ...mapa, [campo]: e.target.value === '' ? '' : Number(e.target.value) } as Record<string, number | ''>; setMapa(m); analisar(texto, m); }}>
                <option value="">— não usar —</option>{previa.cabecalho.map((h, i) => <option key={i} value={i}>{h || `coluna ${i + 1}`}</option>)}
              </Seletor></Campo>))}
          {previa.faltaObrigatorio.length > 0 && <p className="o-aviso">Falta mapear: {previa.faltaObrigatorio.join(', ')}</p>}
          <div className="o-rolagem"><table className="o-tab"><thead><tr>{previa.cabecalho.map((h, i) => <th key={i}>{h}</th>)}</tr></thead><tbody>{previa.amostra.map((l, i) => <tr key={i}>{l.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody></table></div>
          {previa.erros.length > 0 && <details open><summary>Erros ({previa.totalErros})</summary><ul className="o-lista">{previa.erros.map((e, i) => <li key={i}>linha {e.linha}: {e.motivo}</li>)}</ul></details>}
          <Botao primario disabled={previa.faltaObrigatorio.length > 0 || previa.validos === 0} onClick={importar}>Importar {previa.validos} lançamento(s)</Botao>
        </Cartao>)}
      {res && <Cartao titulo="Resultado da importação"><p><Etiqueta cor="verde">{res.criados} novos</Etiqueta> <Etiqueta cor="cinza">{res.duplicados} duplicados ignorados</Etiqueta> <Etiqueta cor={res.erros ? 'vermelho' : 'cinza'}>{res.erros} erros</Etiqueta></p>{res.detalheErros.length > 0 && <ul className="o-lista">{res.detalheErros.map((e, i) => <li key={i}>linha {e.linha}: {e.motivo}</li>)}</ul>}</Cartao>}
      <Cartao titulo="Histórico de importações">
        {historico.length ? <ul className="o-lista">{historico.slice(0, 15).map((h) => <li key={h.id}><b>{h.arquivo}</b> <small>{quando(h.em)} · {h.plataforma}{h.real ? '' : ' · teste'}</small><br /><small>{h.criados} novos · {h.duplicados} duplicados · {h.erros} erros</small></li>)}</ul> : <Vazio>Nenhuma importação ainda.</Vazio>}
      </Cartao>
    </div>
  );
}
export { Entrada };
