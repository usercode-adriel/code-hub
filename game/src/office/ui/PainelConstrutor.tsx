import { useState } from 'react';
import { OBJETOS, PISOS, TIPOS_PAREDE } from '../catalogo';
import type { Construtor, EstadoConstrutor, Ferramenta } from '../construtor';
import type { OfficeEngine } from '../engine';
import type { EstacaoLayout, Layout } from '../modelo';
import { DEPARTAMENTOS as DEPS, Botao, Campo, Cartao, Entrada, Etiqueta, Seletor, Vazio } from './kit';
import { urlAsset, type Agente, type AssetM, type LayoutResumo } from './api';

const FERRAMENTAS: [Ferramenta, string, string][] = [['selecionar', '🖱 Selecionar / mover', 'Clique em um objeto para selecionar; arraste para mover.'], ['piso', '🟫 Piso', 'Pinte arrastando.'], ['parede', '🧱 Parede', 'Clique perto de uma borda de tile.'], ['porta', '🚪 Porta', 'Clique em uma parede (ou borda) para alternar.'], ['janela', '🪟 Janela', 'Clique em uma parede para alternar.'], ['objeto', '🪑 Objeto', 'Escolha na biblioteca e clique para colocar. R gira.'], ['borracha', '🧽 Borracha', 'Remove objeto, personagem ou parede.'], ['colisao', '⛔ Colisão', 'Marca/desmarca células bloqueadas.'], ['personagem', '🧍 Personagem', 'Posiciona o funcionário escolhido.'], ['departamento', '🏢 Departamento', 'Arraste um retângulo.']];
const FERRAMENTAS_ESTACAO: [string, string][] = [['estacao', 'Estação de trabalho do agente'], ['financeiro', 'Módulo financeiro'], ['produtos', 'Produtos'], ['campanhas', 'Campanhas'], ['conectores', 'Integrações (marketplaces)'], ['importador', 'Importar relatórios'], ['reunioes', 'Sala de reuniões'], ['assets', 'Biblioteca de recursos'], ['indicadores', 'Indicadores'], ['estudio-video', 'Estúdio audiovisual'], ['video-editor', 'Editor de Vídeo (pendente)']];

export function PainelConstrutor({ c, e, motor, layout, layouts, assets, agentes, aoSalvar, aoNovo, aoDuplicar, aoAbrir, aoRemoverLayout, camadas, setCamada, modo, salvando }: {
  c: Construtor; e: EstadoConstrutor; motor: OfficeEngine; layout: Layout; layouts: LayoutResumo[]; assets: AssetM[]; agentes: Agente[];
  aoSalvar: () => void; aoNovo: () => void; aoDuplicar: () => void; aoAbrir: (id: string) => void; aoRemoverLayout: (id: string) => void; camadas: Record<string, boolean>; setCamada: (n: string, v: boolean) => void; modo: string; salvando: boolean;
}) {
  const [cat, setCat] = useState(''); const [larg, setLarg] = useState(layout.largura); const [alt, setAlt] = useState(layout.altura);
  const cats = [...new Set(OBJETOS.map((o) => o.categoria))];
  const selObj = layout.objetos.find((o) => o.id === e.selecionadoId) ?? null;
  const est = selObj ? layout.estacoes.find((x) => x.objetoId === selObj.id) ?? null : null;
  return (
    <div className="o-pilha">
      <Cartao titulo={modo === 'construcao' ? 'Modo construção' : 'Modo edição'} acao={<Etiqueta cor={e.sujo ? 'amarelo' : 'verde'}>{e.sujo ? 'não salvo' : 'salvo'}</Etiqueta>}>
        <div className="o-linha"><Botao pequeno disabled={!e.podeDesfazer} onClick={() => c.desfazer()}>↶ Desfazer</Botao><Botao pequeno disabled={!e.podeRefazer} onClick={() => c.refazer()}>↷ Refazer</Botao><Botao pequeno primario disabled={!e.sujo || salvando} onClick={aoSalvar}>{salvando ? 'Salvando…' : 'Salvar layout'}</Botao></div>
        <p className="o-mut">Ctrl+Z desfaz · Ctrl+Shift+Z refaz · R gira · Delete remove. Clique direito ou arraste o fundo para mover a câmera.</p>
      </Cartao>
      <Cartao titulo="Ferramentas">
        <div className="o-ferramentas">{FERRAMENTAS.map(([f, rot, dica]) => <button key={f} type="button" className={e.ferramenta === f ? 'on' : ''} title={dica} onClick={() => c.setFerramenta(f)}>{rot}</button>)}</div>
        <p className="o-mut">{FERRAMENTAS.find(([f]) => f === e.ferramenta)?.[2]}</p>
        {e.ferramenta === 'piso' && <div className="o-chips">{[...PISOS.map((p) => p.tipo), ''].map((t) => <button key={t || 'vazio'} type="button" className={`o-chip ${e.piso === t ? 'on' : ''}`} onClick={() => { c.piso = t; c.setFerramenta('piso'); }}>{t ? PISOS.find((p) => p.tipo === t)!.nome : 'Apagar piso'}</button>)}</div>}
        {['parede', 'porta', 'janela'].includes(e.ferramenta) && <div className="o-chips">{TIPOS_PAREDE.map((t) => <button key={t.tipo} type="button" className={`o-chip ${e.paredeTipo === t.tipo ? 'on' : ''}`} onClick={() => { c.paredeTipo = t.tipo; c.setFerramenta(e.ferramenta); }}>{t.nome}</button>)}</div>}
        {e.ferramenta === 'personagem' && <Campo rotulo="Funcionário a posicionar"><Seletor value={e.agenteId ?? ''} onChange={(ev) => { c.agenteId = ev.target.value || null; c.setFerramenta('personagem'); }}><option value="">— escolha —</option>{agentes.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}</Seletor></Campo>}
        {e.motivoInvalido && e.ferramenta === 'objeto' && <p className="o-aviso">{e.motivoInvalido}</p>}
      </Cartao>
      <Cartao titulo="Biblioteca de objetos">
        <Seletor value={cat} onChange={(ev) => setCat(ev.target.value)}><option value="">Todas as categorias</option>{cats.map((k) => <option key={k}>{k}</option>)}</Seletor>
        <div className="o-grade-lib">{OBJETOS.filter((o) => !cat || o.categoria === cat).map((o) => <button key={o.tipo} type="button" className={e.ferramenta === 'objeto' && e.tipoObjeto === o.tipo ? 'on' : ''} onClick={() => c.setTipoObjeto(o.tipo)} title={`${o.nome} (${o.largura}×${o.profundidade})`}><span>{o.nome}</span><small>{o.largura}×{o.profundidade}</small></button>)}</div>
        {assets.filter((a) => !['spritesheets', 'avatares', 'animacoes', 'pisos', 'tilesets'].includes(a.categoria)).length > 0 && <><h5>Seus assets</h5><div className="o-grade-mini">{assets.filter((a) => !['spritesheets', 'avatares', 'animacoes', 'pisos', 'tilesets'].includes(a.categoria)).map((a) => <button key={a.id} type="button" className="o-mini" onClick={() => { motor.assets.set(a.id, a); c.setTipoObjeto(`asset:${a.id}`); }} title={a.nome}><img src={urlAsset(a.id)} alt={a.nome} /><small>{a.nome}</small></button>)}</div></>}
      </Cartao>
      {selObj && (
        <Cartao titulo={`Objeto: ${selObj.tipo}`}>
          <div className="o-linha"><Botao pequeno onClick={() => c.girarSelecionado()}>↻ Girar</Botao><Botao pequeno perigo onClick={() => c.removerSelecionado()}>Remover</Botao>
            <Seletor value="" onChange={(ev) => ev.target.value && c.substituirObjeto(selObj.id, ev.target.value)}><option value="">Substituir por…</option>{OBJETOS.map((o) => <option key={o.tipo} value={o.tipo}>{o.nome}</option>)}</Seletor></div>
          <EstacaoForm key={selObj.id} obj={selObj.id} est={est} agentes={agentes} c={c} />
        </Cartao>)}
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
        <div className="o-linha"><Botao pequeno onClick={aoDuplicar}>Duplicar o atual</Botao><Botao pequeno onClick={aoNovo}>Novo (vazio)</Botao></div>
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
