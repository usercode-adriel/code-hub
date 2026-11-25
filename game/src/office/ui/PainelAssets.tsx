import { useEffect, useRef, useState } from 'react';
import { api, token, urlAsset, type AssetM } from './api';
import { Abas, Botao, Campo, Cartao, Entrada, Etiqueta, Seletor, Vazio, erroTexto } from './kit';

const CATEGORIAS = ['tilesets', 'pisos', 'paredes', 'portas', 'janelas', 'moveis', 'equipamentos', 'computadores', 'decoracao', 'plantas', 'avatares', 'spritesheets', 'animacoes', 'efeitos', 'outros'];
const CAMADAS = ['fundo', 'piso', 'estrutura', 'parede', 'mobiliario', 'objeto', 'personagem', 'efeito', 'interativo'];

export function PainelAssets({ assets, aoMudar, aviso, usarNoMapa }: { assets: AssetM[]; aoMudar: () => void; aviso: (t: string) => void; usarNoMapa: (a: AssetM) => void }) {
  return <Abas abas={[
    { id: 'lib', rotulo: 'Biblioteca', conteudo: <Biblioteca assets={assets} aoMudar={aoMudar} aviso={aviso} usarNoMapa={usarNoMapa} /> },
    { id: 'imp', rotulo: 'Importar', conteudo: <Importar aoMudar={aoMudar} aviso={aviso} /> },
    { id: 'aq', rotulo: 'Buscar assets', conteudo: <Aquisicao aoMudar={aoMudar} aviso={aviso} /> },
  ]} />;
}

function Miniatura({ a, aoClicar, ativo }: { a: AssetM; aoClicar: () => void; ativo: boolean }) {
  return <button type="button" className={`o-mini ${ativo ? 'on' : ''}`} onClick={aoClicar} title={`${a.nome} (${a.largura}×${a.altura})`}><img src={urlAsset(a.id)} alt={a.nome} loading="lazy" /><small>{a.nome}</small></button>;
}

function Biblioteca({ assets, aoMudar, aviso, usarNoMapa }: { assets: AssetM[]; aoMudar: () => void; aviso: (t: string) => void; usarNoMapa: (a: AssetM) => void }) {
  const [cat, setCat] = useState(''); const [q, setQ] = useState(''); const [selId, setSelId] = useState<string | null>(null);
  const lista = assets.filter((a) => (!cat || a.categoria === cat) && (!q || `${a.nome} ${a.origem} ${a.autor}`.toLowerCase().includes(q.toLowerCase())));
  const sel = assets.find((a) => a.id === selId) ?? null;
  return (
    <div className="o-pilha">
      <div className="o-linha"><Seletor value={cat} onChange={(e) => setCat(e.target.value)}><option value="">Todas as categorias</option>{CATEGORIAS.map((c) => <option key={c}>{c}</option>)}</Seletor><Entrada placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {lista.length ? <div className="o-grade-mini">{lista.map((a) => <Miniatura key={a.id} a={a} ativo={a.id === selId} aoClicar={() => setSelId(a.id)} />)}</div> : <Vazio>Nenhum asset. Importe PNGs, spritesheets ou um ZIP — ou use “Buscar assets”.</Vazio>}
      {sel && <DetalheAsset key={sel.id} a={sel} aoMudar={aoMudar} aviso={aviso} usarNoMapa={usarNoMapa} aoRemover={() => setSelId(null)} />}
    </div>
  );
}

function DetalheAsset({ a, aoMudar, aviso, usarNoMapa, aoRemover }: { a: AssetM; aoMudar: () => void; aviso: (t: string) => void; usarNoMapa: (a: AssetM) => void; aoRemover: () => void }) {
  const [f, setF] = useState({ nome: a.nome, categoria: a.categoria, camada: a.camada, perspectiva: a.perspectiva, escala: a.escala, ax: a.ancora.x, ay: a.ancora.y, solida: a.colisao.solida, lw: a.colisao.larguraTiles, ld: a.colisao.profundidadeTiles, autor: a.autor, origem: a.origem, licTipo: a.licenca.tipo, licCom: String(a.licenca.usoComercial), licUrl: a.licencaUrl });
  const salvar = async (): Promise<void> => {
    try { await api.put(`/assets/${a.id}`, { nome: f.nome, categoria: f.categoria, camada: f.camada, perspectiva: f.perspectiva, escala: Number(f.escala), ancora: { x: Number(f.ax), y: Number(f.ay) }, colisao: { solida: f.solida, larguraTiles: Number(f.lw), profundidadeTiles: Number(f.ld) }, autor: f.autor, origem: f.origem, licencaUrl: f.licUrl, licenca: { tipo: f.licTipo, usoComercial: f.licCom === 'true' ? true : f.licCom === 'false' ? false : 'desconhecido', atribuicao: a.licenca.atribuicao, evidencia: a.licenca.evidencia } }); aviso('Metadados salvos (o arquivo original não é alterado)'); }
    catch (e) { aviso(erroTexto(e)); } aoMudar();
  };
  return (
    <Cartao titulo={a.nome} acao={<Etiqueta cor={a.licenca.usoComercial === true ? 'verde' : a.licenca.usoComercial === false ? 'vermelho' : 'amarelo'}>{a.licenca.tipo}</Etiqueta>}>
      <div className="o-preview"><img src={urlAsset(a.id)} alt={a.nome} /></div>
      <p className="o-mut">{a.largura}×{a.altura}px · {a.transparencia ? 'com transparência' : 'sem transparência'} · proporção {(a.largura / a.altura).toFixed(2)}{a.frames ? ` · ${a.frames.colunas}×${a.frames.linhas} quadros de ${a.frames.quadroL}×${a.frames.quadroA}` : ''}</p>
      <p className="o-mut">Origem: {a.origem}{a.pacote ? ` (${a.pacote})` : ''}{a.licenca.evidencia ? ` · licença: “${a.licenca.evidencia}”` : ''}</p>
      <Campo rotulo="Nome"><Entrada value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></Campo>
      <div className="o-linha"><Campo rotulo="Categoria"><Seletor value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })}>{CATEGORIAS.map((c) => <option key={c}>{c}</option>)}</Seletor></Campo><Campo rotulo="Camada"><Seletor value={f.camada} onChange={(e) => setF({ ...f, camada: e.target.value })}>{CAMADAS.map((c) => <option key={c}>{c}</option>)}</Seletor></Campo></div>
      <div className="o-linha"><Campo rotulo="Perspectiva"><Seletor value={f.perspectiva} onChange={(e) => setF({ ...f, perspectiva: e.target.value })}>{['isometrica', 'frontal', 'topo', 'outra'].map((c) => <option key={c}>{c}</option>)}</Seletor></Campo><Campo rotulo="Escala"><Entrada type="number" min="0.1" max="8" step="0.1" value={f.escala} onChange={(e) => setF({ ...f, escala: Number(e.target.value) })} /></Campo></div>
      <div className="o-linha"><Campo rotulo="Âncora X (0–1)"><Entrada type="number" min="0" max="1" step="0.05" value={f.ax} onChange={(e) => setF({ ...f, ax: Number(e.target.value) })} /></Campo><Campo rotulo="Âncora Y (0–1)"><Entrada type="number" min="0" max="1" step="0.05" value={f.ay} onChange={(e) => setF({ ...f, ay: Number(e.target.value) })} /></Campo></div>
      <label className="o-check"><input type="checkbox" checked={f.solida} onChange={(e) => setF({ ...f, solida: e.target.checked })} /> Colisão (bloqueia a passagem)</label>
      <div className="o-linha"><Campo rotulo="Largura (tiles)"><Entrada type="number" min="1" max="12" value={f.lw} onChange={(e) => setF({ ...f, lw: Number(e.target.value) })} /></Campo><Campo rotulo="Profundidade (tiles)"><Entrada type="number" min="1" max="12" value={f.ld} onChange={(e) => setF({ ...f, ld: Number(e.target.value) })} /></Campo></div>
      <div className="o-linha"><Campo rotulo="Autor"><Entrada value={f.autor} onChange={(e) => setF({ ...f, autor: e.target.value })} /></Campo><Campo rotulo="Licença"><Entrada value={f.licTipo} onChange={(e) => setF({ ...f, licTipo: e.target.value })} /></Campo></div>
      <div className="o-linha"><Campo rotulo="Uso comercial"><Seletor value={f.licCom} onChange={(e) => setF({ ...f, licCom: e.target.value })}><option value="true">Permitido</option><option value="false">Não permitido</option><option value="desconhecido">Desconhecido</option></Seletor></Campo><Campo rotulo="Link da licença"><Entrada value={f.licUrl} onChange={(e) => setF({ ...f, licUrl: e.target.value })} /></Campo></div>
      <div className="o-linha"><Botao primario pequeno onClick={salvar}>Salvar metadados</Botao><Botao pequeno onClick={() => usarNoMapa(a)}>Usar no mapa</Botao>
        <Botao pequeno perigo onClick={async () => { if (!window.confirm('Remover este asset da biblioteca?')) return; try { await api.del(`/assets/${a.id}`); aoRemover(); } catch (e) { aviso(erroTexto(e)); } aoMudar(); }}>Remover</Botao></div>
    </Cartao>
  );
}

function Importar({ aoMudar, aviso }: { aoMudar: () => void; aviso: (t: string) => void }) {
  const [cat, setCat] = useState(''); const [autor, setAutor] = useState(''); const [lic, setLic] = useState(''); const [com, setCom] = useState('desconhecido'); const png = useRef<HTMLInputElement>(null); const zip = useRef<HTMLInputElement>(null);
  const enviar = async (rota: string, arquivo: File | undefined): Promise<void> => {
    if (!arquivo) return; const fd = new FormData(); fd.append('arquivo', arquivo); if (cat) fd.append('categoria', cat); if (autor) fd.append('autor', autor); if (lic) { fd.append('licenca', lic); fd.append('usoComercial', com); }
    try { const r = await api.post<Record<string, unknown>>(rota, fd); aviso(rota.endsWith('zip') ? `ZIP importado: ${r.criados} novo(s), ${r.duplicados} repetido(s), ${(r.ignorados as unknown[]).length} ignorado(s)` : r.duplicado ? 'Esta imagem já existe na biblioteca.' : 'Imagem importada'); }
    catch (e) { aviso(erroTexto(e)); } aoMudar();
  };
  return (
    <Cartao titulo="Importar recursos">
      <p className="o-mut">PNG (inclusive transparente), spritesheets e pacotes ZIP. Nada é executado: do ZIP só entram PNGs e textos de licença; executáveis são ignorados. Arquivos originais nunca são alterados nem sobrescritos.</p>
      <div className="o-linha"><Campo rotulo="Categoria (opcional)"><Seletor value={cat} onChange={(e) => setCat(e.target.value)}><option value="">Detectar pelo nome</option>{CATEGORIAS.map((c) => <option key={c}>{c}</option>)}</Seletor></Campo><Campo rotulo="Autor"><Entrada value={autor} onChange={(e) => setAutor(e.target.value)} /></Campo></div>
      <div className="o-linha"><Campo rotulo="Licença (se souber)"><Entrada value={lic} onChange={(e) => setLic(e.target.value)} placeholder="CC0, CC-BY, própria…" /></Campo><Campo rotulo="Uso comercial"><Seletor value={com} onChange={(e) => setCom(e.target.value)}><option value="desconhecido">Desconhecido</option><option value="true">Permitido</option><option value="false">Não permitido</option></Seletor></Campo></div>
      <div className="o-linha"><input ref={png} type="file" accept="image/png" hidden onChange={(e) => { enviar('/assets', e.target.files?.[0]); e.target.value = ''; }} /><Botao primario onClick={() => png.current?.click()}>Importar PNG / spritesheet</Botao>
        <input ref={zip} type="file" accept=".zip,application/zip" hidden onChange={(e) => { enviar('/assets/zip', e.target.files?.[0]); e.target.value = ''; }} /><Botao onClick={() => zip.current?.click()}>Importar ZIP de assets</Botao></div>
    </Cartao>
  );
}

interface Proposta { id: string; url: string; estado: string; licenca: { tipo: string; usoComercial: boolean | string; atribuicao: boolean | string; evidencia: string; nota?: string }; totalPng: number; tamanho: number; ignorados: { nome: string; motivo: string }[] }
interface Analise { tipo: 'pagina' | 'pacote'; url: string; licenca: Proposta['licenca']; pacotes?: string[]; aviso?: string | null; id?: string; arquivos?: { nome: string; largura: number; altura: number }[]; previa?: { nome: string; base64: string }[]; totalPng?: number; tamanho?: number; ignorados?: { nome: string; motivo: string }[] }

function Aquisicao({ aoMudar, aviso }: { aoMudar: () => void; aviso: (t: string) => void }) {
  const [termo, setTermo] = useState('isometric office'); const [links, setLinks] = useState<{ fonte: string; url: string; nota: string }[]>([]); const [url, setUrl] = useState(''); const [analise, setAnalise] = useState<Analise | null>(null); const [ocupado, setOcupado] = useState(false); const [propostas, setPropostas] = useState<Proposta[]>([]);
  const carregar = (): void => { api.get<Proposta[]>('/aquisicao/propostas').then(setPropostas).catch(() => {}); };
  useEffect(() => { api.get<typeof links>(`/aquisicao/busca?q=${encodeURIComponent(termo)}`).then(setLinks).catch(() => {}); carregar(); }, [termo]);
  const analisar = async (u: string): Promise<void> => { setOcupado(true); try { const r = await api.post<Analise>('/aquisicao/analisar', { url: u, licencaPagina: analise?.tipo === 'pagina' ? analise.licenca : null }); setAnalise(r); carregar(); } catch (e) { aviso(erroTexto(e)); } setOcupado(false); };
  const aprovar = async (p: { id?: string; licenca: Proposta['licenca'] }): Promise<void> => {
    if (!p.id) return; let confirmar = false;
    if (p.licenca.usoComercial === false) { aviso('Licença não comercial: este pacote não pode ser importado.'); return; }
    if (p.licenca.usoComercial !== true) { confirmar = window.confirm('A licença não foi identificada com segurança. Confira a licença no site de origem. Confirma que o USO COMERCIAL é permitido?'); if (!confirmar) return; }
    try { const r = await api.post<{ criados: number; duplicados: number }>(`/aquisicao/${p.id}/aprovar`, { confirmarLicenca: confirmar }); aviso(`Importado: ${r.criados} novo(s), ${r.duplicados} repetido(s)`); setAnalise(null); setUrl(''); } catch (e) { aviso(erroTexto(e)); } carregar(); aoMudar();
  };
  return (
    <div className="o-pilha">
      <Cartao titulo="Fontes de assets gratuitos">
        <p className="o-mut">Fluxo assistido e seguro: abra a fonte, escolha um pacote e cole aqui o link. O Codeniac confere o host, baixa com limite de tamanho, mostra a licença e a prévia, e só importa depois da sua aprovação.</p>
        <Campo rotulo="O que procurar"><Entrada value={termo} onChange={(e) => setTermo(e.target.value)} /></Campo>
        {links.map((l) => <p key={l.fonte}><a href={l.url} target="_blank" rel="noopener noreferrer">{l.fonte} ↗</a><br /><small className="o-mut">{l.nota}</small></p>)}
        <div className="o-linha"><Entrada value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://kenney.nl/…  (página ou link .zip)" /><Botao primario disabled={!url.trim() || ocupado} onClick={() => analisar(url.trim())}>{ocupado ? 'Analisando…' : 'Analisar'}</Botao></div>
      </Cartao>
      {analise?.tipo === 'pagina' && <Cartao titulo="Página analisada" acao={<LicencaEtq l={analise.licenca} />}>{analise.licenca.evidencia && <p className="o-mut">Trecho da licença: “{analise.licenca.evidencia}”</p>}{analise.aviso && <p className="o-aviso">{analise.aviso}</p>}{analise.pacotes?.map((p) => <div key={p} className="o-linha"><small className="o-quebra">{p}</small><Botao pequeno onClick={() => { setUrl(p); analisar(p); }}>Analisar este pacote</Botao></div>)}</Cartao>}
      {analise?.tipo === 'pacote' && (
        <Cartao titulo={`Pacote: ${analise.totalPng} PNG`} acao={<LicencaEtq l={analise.licenca} />}>
          <p className="o-mut">{analise.url} · {(((analise.tamanho ?? 0)) / 1048576).toFixed(1)} MB{analise.licenca.nota ? ` · ${analise.licenca.nota}` : ''}</p>
          <div className="o-grade-mini">{analise.previa?.map((p) => <figure key={p.nome} className="o-mini"><img src={`data:image/png;base64,${p.base64}`} alt={p.nome} /><small>{p.nome.split('/').pop()}</small></figure>)}</div>
          {analise.ignorados && analise.ignorados.length > 0 && <details><summary>{analise.ignorados.length} arquivo(s) ignorado(s) por segurança</summary><ul className="o-lista">{analise.ignorados.slice(0, 20).map((i, k) => <li key={k}>{i.nome}: {i.motivo}</li>)}</ul></details>}
          <div className="o-linha"><Botao primario disabled={analise.licenca.usoComercial === false} onClick={() => aprovar(analise)}>Aprovar e importar</Botao><Botao onClick={async () => { if (analise.id) await api.post(`/aquisicao/${analise.id}/rejeitar`).catch(() => {}); setAnalise(null); carregar(); }}>Rejeitar</Botao></div>
          {analise.licenca.usoComercial === false && <p className="o-aviso">Esta licença não permite uso comercial. O Commerce Office é comercial: o pacote não pode ser importado.</p>}
        </Cartao>)}
      {propostas.filter((p) => p.estado === 'aguardando_aprovacao' && p.id !== analise?.id).length > 0 && <Cartao titulo="Propostas aguardando aprovação">{propostas.filter((p) => p.estado === 'aguardando_aprovacao' && p.id !== analise?.id).map((p) => <div key={p.id} className="o-linha"><small className="o-quebra">{p.url}</small><LicencaEtq l={p.licenca} /><Botao pequeno onClick={() => aprovar(p)}>Importar</Botao></div>)}</Cartao>}
    </div>
  );
}
const LicencaEtq = ({ l }: { l: Proposta['licenca'] }) => <Etiqueta cor={l.usoComercial === true ? 'verde' : l.usoComercial === false ? 'vermelho' : 'amarelo'} titulo={l.evidencia}>{l.tipo}{l.usoComercial === true ? ' · comercial ok' : l.usoComercial === false ? ' · não comercial' : ' · confira'}</Etiqueta>;
export { token };
