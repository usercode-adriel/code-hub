import { useState } from 'react';
import { OBJETOS, PISOS, PISO_PACOTE, TIPOS_PAREDE } from '../catalogo';
import type { Construtor, EstadoConstrutor, Ferramenta } from '../construtor';
import type { OfficeEngine } from '../engine';
import type { EstacaoLayout, Layout } from '../modelo';
import { DEPARTAMENTOS as DEPS, Botao, Campo, Cartao, Entrada, Etiqueta, Seletor, Vazio } from './kit';
import { urlAsset, type Agente, type AssetM, type LayoutResumo } from './api';

const FERRAMENTAS: [Ferramenta, string, string][] = [['selecionar', '🖱 Selecionar / mover', 'Clique em um objeto para selecionar; arraste para mover.'], ['piso', '🟫 Piso', 'Pinte arrastando.'], ['parede', '🧱 Parede', 'Clique perto de uma borda de tile.'], ['porta', '🚪 Porta', 'Clique em uma parede (ou borda) para alternar.'], ['janela', '🪟 Janela', 'Clique em uma parede para alternar.'], ['objeto', '🪑 Objeto', 'Escolha na biblioteca e clique para colocar. R gira.'], ['borracha', '🧽 Borracha', 'Remove objeto, personagem ou parede.'], ['colisao', '⛔ Colisão', 'Marca/desmarca células bloqueadas.'], ['personagem', '🧍 Personagem', 'Posiciona o funcionário escolhido.'], ['departamento', '🏢 Departamento', 'Arraste um retângulo.']];
const FERRAMENTAS_ESTACAO: [string, string][] = [['estacao', 'Estação de trabalho do agente'], ['financeiro', 'Módulo financeiro'], ['produtos', 'Produtos'], ['campanhas', 'Campanhas'], ['conectores', 'Integrações (marketplaces)'], ['importador', 'Importar relatórios'], ['reunioes', 'Sala de reuniões'], ['assets', 'Biblioteca de recursos'], ['indicadores', 'Indicadores'], ['estudio-video', 'Estúdio audiovisual'], ['video-editor', 'Editor de Vídeo (pendente)']];

export interface CfgEscritorio { nome: string; l: number; a: number; piso: string; paredes: boolean }

export function PainelConstrutor({ c, e, motor, layout, layouts, assets, agentes, aoSalvar, aoCriar, aoDuplicar, aoAbrir, aoRemoverLayout, camadas, setCamada, modo, salvando }: {
  c: Construtor; e: EstadoConstrutor; motor: OfficeEngine; layout: Layout; layouts: LayoutResumo[]; assets: AssetM[]; agentes: Agente[];
  aoSalvar: () => void; aoCriar: (cfg: CfgEscritorio) => void; aoDuplicar: () => void; aoAbrir: (id: string) => void; aoRemoverLayout: (id: string) => void; camadas: Record<string, boolean>; setCamada: (n: string, v: boolean) => void; modo: string; salvando: boolean;
}) {
  const [cat, setCat] = useState(''); const [larg, setLarg] = useState(layout.largura); const [alt, setAlt] = useState(layout.altura);
  const biblioteca = OBJETOS.filter((o) => !o.legado); const cats = [...new Set(biblioteca.map((o) => o.categoria))];
  const selObj = layout.objetos.find((o) => o.id === e.selecionadoId) ?? null;
  const est = selObj ? layout.estacoes.find((x) => x.objetoId === selObj.id) ?? null : null;
  return (
    <div className="o-pilha">
      <Cartao titulo={modo === 'construcao' ? 'Modo construção' : 'Modo edição'} acao={<Etiqueta cor={e.sujo ? 'amarelo' : 'verde'}>{e.sujo ? 'não salvo' : 'salvo'}</Etiqueta>}>
        <div className="o-linha"><Botao pequeno disabled={!e.podeDesfazer} onClick={() => c.desfazer()}>↶ Desfazer</Botao><Botao pequeno disabled={!e.podeRefazer} onClick={() => c.refazer()}>↷ Refazer</Botao><Botao pequeno primario disabled={!e.sujo || salvando} onClick={aoSalvar}>{salvando ? 'Salvando…' : 'Salvar layout'}</Botao></div>
        <p className="o-mut">Ctrl+Z desfaz · Ctrl+Shift+Z refaz · R gira · Delete remove · clique num objeto para ver os atalhos (duplicar, tamanho, camadas). Clique direito ou arraste o fundo para mover a câmera.</p>
      </Cartao>
      <Cartao titulo="Ferramentas">
        <div className="o-ferramentas">{FERRAMENTAS.map(([f, rot, dica]) => <button key={f} type="button" className={e.ferramenta === f ? 'on' : ''} title={dica} onClick={() => c.setFerramenta(f)}>{rot}</button>)}</div>
        <p className="o-mut">{FERRAMENTAS.find(([f]) => f === e.ferramenta)?.[2]}</p>
        {e.ferramenta === 'piso' && <>
          <div className="o-tiles">{[...PISOS.map((p) => p.tipo), ''].map((t) => { const def = PISOS.find((p) => p.tipo === t); const img = t ? PISO_PACOTE[t] : null; return (
            <button key={t || 'vazio'} type="button" className={`o-tile ${e.piso === t ? 'on' : ''}`} title={def?.nome ?? 'Apagar piso'} onClick={() => { c.piso = t; c.setFerramenta('piso'); }}>
              {img ? <img src={`/escritorio/arte/pisos/${img}.png`} alt="" /> : <i style={{ background: def ? `#${def.cor.toString(16).padStart(6, '0')}` : 'transparent' }} />}<span>{def?.nome ?? 'Apagar'}</span></button>); })}</div>
          <Botao pequeno onClick={() => { if (window.confirm('Pintar o mapa inteiro com este piso?')) c.preencherPiso(e.piso); }}>Preencher o mapa todo</Botao></>}
        {e.ferramenta === 'parede' && <p className="o-mut">Clique e arraste para esticar a parede em linha reta (solte para criar). Segure Shift para desenhar o contorno de uma sala.</p>}
        {['parede', 'porta', 'janela'].includes(e.ferramenta) && <div className="o-chips">{TIPOS_PAREDE.map((t) => <button key={t.tipo} type="button" className={`o-chip ${e.paredeTipo === t.tipo ? 'on' : ''}`} onClick={() => { c.paredeTipo = t.tipo; c.setFerramenta(e.ferramenta); }}>{t.nome}</button>)}</div>}
        {e.ferramenta === 'personagem' && <Campo rotulo="Funcionário a posicionar"><Seletor value={e.agenteId ?? ''} onChange={(ev) => { c.agenteId = ev.target.value || null; c.setFerramenta('personagem'); }}><option value="">— escolha —</option>{agentes.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}</Seletor></Campo>}
        <div className="o-linha"><Campo rotulo="Encaixe"><Seletor value={String(e.passo)} onChange={(ev) => { c.passo = Number(ev.target.value); c.setFerramenta(e.ferramenta); }}><option value="1">Grade (1)</option><option value="0.5">Meia grade (0,5)</option><option value="0.25">Fino (0,25)</option><option value="0.1">Livre (0,1)</option></Seletor></Campo>
          <Campo rotulo={`Tamanho do próximo: ${Math.round(e.escalaNova * 100)}%`}><input type="range" min="0.4" max="3" step="0.1" value={e.escalaNova} onChange={(ev) => { c.escalaNova = Number(ev.target.value); c.setFerramenta(e.ferramenta); }} /></Campo></div>
        {e.motivoInvalido && e.ferramenta === 'objeto' && <p className="o-aviso">{e.motivoInvalido}</p>}
      </Cartao>
      <Cartao titulo="Biblioteca de objetos">
        <Seletor value={cat} onChange={(ev) => setCat(ev.target.value)}><option value="">Todas as categorias</option>{cats.map((k) => <option key={k}>{k}</option>)}</Seletor>
        <div className="o-grade-lib">{biblioteca.filter((o) => !cat || o.categoria === cat).map((o) => <button key={o.tipo} type="button" className={e.ferramenta === 'objeto' && e.tipoObjeto === o.tipo ? 'on' : ''} onClick={() => c.setTipoObjeto(o.tipo)} title={`${o.nome} (${o.largura}×${o.profundidade})`}><span>{o.nome}</span><small>{o.largura}×{o.profundidade}</small></button>)}</div>
        {assets.filter((a) => !['spritesheets', 'avatares', 'animacoes', 'pisos', 'tilesets'].includes(a.categoria)).length > 0 && <><h5>Seus assets</h5><div className="o-grade-mini">{assets.filter((a) => !['spritesheets', 'avatares', 'animacoes', 'pisos', 'tilesets'].includes(a.categoria)).map((a) => <button key={a.id} type="button" className="o-mini" onClick={() => { motor.assets.set(a.id, a); c.setTipoObjeto(`asset:${a.id}`); }} title={a.nome}><img src={urlAsset(a.id)} alt={a.nome} /><small>{a.nome}</small></button>)}</div></>}
      </Cartao>
      {selObj && (
        <Cartao titulo={`Objeto: ${selObj.tipo}`}>
          <div className="o-linha"><Botao pequeno onClick={() => c.duplicarSelecionado()}>⧉ Duplicar</Botao><Botao pequeno onClick={() => c.girarSelecionado()}>↻ Girar</Botao><Botao pequeno perigo onClick={() => c.removerSelecionado()}>Remover</Botao></div>
          <div className="o-linha"><Campo rotulo={`Tamanho: ${Math.round((selObj.escala ?? 1) * 100)}%`}><input type="range" min="0.4" max="3" step="0.1" value={selObj.escala ?? 1} onChange={(ev) => c.definirEscala(selObj.id, Number(ev.target.value))} /></Campo><Botao pequeno onClick={() => c.camadaSelecionado(1)}>▲ Frente</Botao><Botao pequeno onClick={() => c.camadaSelecionado(-1)}>▼ Trás</Botao></div>
          <div className="o-linha"><small>posição {selObj.x}, {selObj.y} · camada {selObj.camada ?? 0}</small>
            <Seletor value="" onChange={(ev) => ev.target.value && c.substituirObjeto(selObj.id, ev.target.value)}><option value="">Substituir por…</option>{biblioteca.map((o) => <option key={o.tipo} value={o.tipo}>{o.nome}</option>)}</Seletor></div>
          <EstacaoForm key={selObj.id} obj={selObj.id} est={est} agentes={agentes} c={c} />
        </Cartao>)}
      <CriarEscritorio aoCriar={aoCriar} />
      <Cartao titulo="Mapa">
        <div className="o-linha"><Campo rotulo="Largura"><Entrada type="number" min="8" max="96" value={larg} onChange={(ev) => setLarg(Number(ev.target.value))} /></Campo><Campo rotulo="Altura"><Entrada type="number" min="8" max="96" value={alt} onChange={(ev) => setAlt(Number(ev.target.value))} /></Campo></div>
        <Botao pequeno onClick={() => { if (larg < layout.largura || alt < layout.altura) { if (!window.confirm('Reduzir o mapa remove o que ficar fora da nova área. Continuar? (dá para desfazer)')) return; } c.redimensionarMapa(larg, alt); }}>Redimensionar mapa</Botao>
        <h5>Camadas</h5>
        <div className="o-chips">{[['piso', 'Pisos'], ['parede', 'Paredes'], ['mobiliario', 'Mobiliário'], ['objeto', 'Objetos'], ['personagem', 'Personagens'], ['efeito', 'Efeitos']].map(([k, r]) => <label key={k} className={`o-chip ${camadas[k] !== false ? 'on' : ''}`}><input type="checkbox" checked={camadas[k] !== false} onChange={(ev) => setCamada(k, ev.target.checked)} />{r}</label>)}</div>
      </Cartao>
      <Cartao titulo="Departamentos">
        {layout.departamentos.map((d) => <div key={d.id} className="o-linha o-item"><Entrada defaultValue={d.nome} onBlur={(ev) => ev.target.value !== d.nome && c.renomearDepartamento(d.id, ev.target.value)} /><Botao pequeno perigo onClick={() => c.removerDepartamento(d.id)}>×</Botao></div>)}
      </Cartao>
      <Cartao titulo="Layouts salvos">
        {layouts.length ? layouts.map((l) => <div key={l.id} className="o-linha o-item"><b>{l.nome}</b>{l.ativo && <Etiqueta cor="verde">ativo</Etiqueta>}<small>{l.largura}×{l.altura} · v{l.versao}</small><Botao pequeno onClick={() => aoAbrir(l.id)}>Abrir</Botao>{layouts.length > 1 && <Botao pequeno perigo onClick={() => aoRemoverLayout(l.id)}>×</Botao>}</div>) : <Vazio>Nenhum layout salvo.</Vazio>}
        <div className="o-linha"><Botao pequeno onClick={aoDuplicar}>Duplicar o atual</Botao></div>
      </Cartao>
    </div>
  );
}

function EstacaoForm({ obj, est, agentes, c }: { obj: string; est: EstacaoLayout | null; agentes: Agente[]; c: Construtor }) {
  const [f, setF] = useState({ agenteId: est?.agenteId ?? '', departamento: est?.departamento ?? '', ferramenta: est?.ferramenta ?? 'estacao', rotulo: est?.rotulo ?? '', px: est?.pontoTrabalho?.x ?? '', py: est?.pontoTrabalho?.y ?? '' });
  return (
    <div className="o-pilha">
      <h5>Estação (liga o objeto a uma função real)</h5>
      <p className="o-mut">A ligação usa o identificador do objeto, não a posição ou o nome dele.</p>
      <Campo rotulo="Ferramenta ao clicar"><Seletor value={f.ferramenta} onChange={(ev) => setF({ ...f, ferramenta: ev.target.value })}>{FERRAMENTAS_ESTACAO.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Seletor></Campo>
      <div className="o-linha"><Campo rotulo="Agente"><Seletor value={f.agenteId} onChange={(ev) => setF({ ...f, agenteId: ev.target.value })}><option value="">— nenhum —</option>{agentes.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}</Seletor></Campo>
        <Campo rotulo="Departamento"><Seletor value={f.departamento} onChange={(ev) => setF({ ...f, departamento: ev.target.value })}><option value="">—</option>{Object.entries(DEPS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Seletor></Campo></div>
      <Campo rotulo="Rótulo"><Entrada value={f.rotulo} onChange={(ev) => setF({ ...f, rotulo: ev.target.value })} /></Campo>
      <div className="o-linha"><Campo rotulo="Ponto de trabalho X"><Entrada type="number" value={f.px} onChange={(ev) => setF({ ...f, px: ev.target.value })} /></Campo><Campo rotulo="Y"><Entrada type="number" value={f.py} onChange={(ev) => setF({ ...f, py: ev.target.value })} /></Campo></div>
      <div className="o-linha"><Botao pequeno primario onClick={() => c.configurarEstacao(obj, { ferramenta: f.ferramenta, agenteId: f.agenteId || null, departamento: f.departamento || null, rotulo: f.rotulo || undefined, pontoTrabalho: f.px !== '' && f.py !== '' ? { x: Number(f.px), y: Number(f.py) } : undefined })}>Salvar estação</Botao>{est && <Botao pequeno perigo onClick={() => c.removerEstacao(obj)}>Remover estação</Botao>}</div>
    </div>
  );
}

function CriarEscritorio({ aoCriar }: { aoCriar: (c: CfgEscritorio) => void }) {
  const [f, setF] = useState<CfgEscritorio>({ nome: 'Meu escritório', l: 12, a: 12, piso: 'madeira', paredes: true });
  const ok = f.l >= 8 && f.l <= 60 && f.a >= 8 && f.a <= 60 && f.nome.trim().length > 0;
  return (
    <Cartao titulo="Criar escritório" acao={<Etiqueta cor="azul">novo</Etiqueta>}>
      <Campo rotulo="Nome"><Entrada value={f.nome} maxLength={80} onChange={(ev) => setF({ ...f, nome: ev.target.value })} /></Campo>
      <div className="o-linha"><Campo rotulo="Largura (tiles)"><Entrada type="number" min="8" max="60" value={f.l} onChange={(ev) => setF({ ...f, l: Number(ev.target.value) })} /></Campo><Campo rotulo="Profundidade (tiles)"><Entrada type="number" min="8" max="60" value={f.a} onChange={(ev) => setF({ ...f, a: Number(ev.target.value) })} /></Campo></div>
      <Campo rotulo="Piso inicial"><Seletor value={f.piso} onChange={(ev) => setF({ ...f, piso: ev.target.value })}>{PISOS.map((p) => <option key={p.tipo} value={p.tipo}>{p.nome}</option>)}</Seletor></Campo>
      <label className="o-chip on"><input type="checkbox" checked={f.paredes} onChange={(ev) => setF({ ...f, paredes: ev.target.checked })} />Paredes ao redor (fundo e lateral)</label>
      <p className="o-mut">De 8 a 60 tiles por lado. O escritório novo começa vazio, só com os funcionários; monte tudo no modo Construção. O atual continua salvo na lista.</p>
      <Botao primario disabled={!ok} onClick={() => aoCriar({ ...f, nome: f.nome.trim() })}>Criar e abrir</Botao>
    </Cartao>
  );
}
