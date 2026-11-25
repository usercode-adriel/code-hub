import { useEffect, useRef, useState } from 'react';
import { api, urlAsset, type Agente, type AssetM, type PersonagemDef } from './api';
import { Botao, Campo, Cartao, Entrada, Etiqueta, Seletor, Vazio, erroTexto } from './kit';
import { ESTADOS_ANIM } from '../animacoes';
import { DIRECOES } from '../iso';

interface AnimForm { nome: string; estado: string; direcao: string; linha: number; quadros: string; fps: number; loop: boolean }
const novaAnim = (): AnimForm => ({ nome: 'idle', estado: 'idle', direcao: '', linha: 0, quadros: '0', fps: 8, loop: true });
const lerQuadros = (s: string): number[] => s.split(/[,\s]+/).map((x) => Number(x)).filter((n) => Number.isInteger(n) && n >= 0);

/** Avatar Manager + editor de spritesheet: define quadros, animações por estado e direção, e vê a animação em loop. */
export function PainelPersonagens({ assets, personagens, agentes, aoMudar, aviso }: { assets: AssetM[]; personagens: PersonagemDef[]; agentes: Agente[]; aoMudar: () => void; aviso: (t: string) => void }) {
  const folhas = assets.filter((a) => ['spritesheets', 'avatares', 'animacoes'].includes(a.categoria));
  const [assetId, setAssetId] = useState(''); const [editId, setEditId] = useState<string | null>(null); const [nome, setNome] = useState('Novo personagem');
  const [ql, setQl] = useState(32); const [qa, setQa] = useState(32); const [escala, setEscala] = useState(1); const [vel, setVel] = useState(1); const [anims, setAnims] = useState<AnimForm[]>([novaAnim()]); const [sel, setSel] = useState(0);
  const asset = assets.find((a) => a.id === assetId) ?? null;
  useEffect(() => { if (asset?.frames) { setQl(asset.frames.quadroL); setQa(asset.frames.quadroA); } else if (asset) { setQl(asset.largura); setQa(asset.altura); } }, [assetId]); // eslint-disable-line react-hooks/exhaustive-deps
  const salvar = async (): Promise<void> => {
    try {
      const corpo = { nome, assetId, quadroL: ql, quadroA: qa, escala, velocidade: vel, animacoes: anims.map((a) => ({ nome: a.nome, estado: a.estado || null, direcao: a.direcao || null, linha: a.linha, quadros: lerQuadros(a.quadros), fps: a.fps, loop: a.loop })) };
      if (editId) await api.put(`/personagens/${editId}`, corpo); else await api.post('/personagens', corpo);
      aviso('Personagem salvo'); setEditId(null);
    } catch (e) { aviso(erroTexto(e)); } aoMudar();
  };
  const carregar = (p: PersonagemDef): void => { setEditId(p.id); setAssetId(p.assetId); setNome(p.nome); setQl(p.quadroL); setQa(p.quadroA); setEscala(p.escala); setVel(p.velocidade); setAnims(p.animacoes.map((a) => ({ nome: a.nome, estado: a.estado ?? '', direcao: a.direcao ?? '', linha: a.linha, quadros: a.quadros.join(','), fps: a.fps, loop: a.loop }))); setSel(0); };
  return (
    <div className="o-pilha">
      <p className="o-mut">Funciona com qualquer spritesheet PNG (quadros de tamanho fixo em linhas e colunas). As animações são associadas aos estados reais dos agentes: nada é encenado.</p>
      <Cartao titulo={editId ? 'Editar personagem' : 'Novo personagem'}>
        <Campo rotulo="Spritesheet (da biblioteca)"><Seletor value={assetId} onChange={(e) => setAssetId(e.target.value)}><option value="">— escolha —</option>{folhas.map((a) => <option key={a.id} value={a.id}>{a.nome} ({a.largura}×{a.altura})</option>)}</Seletor></Campo>
        {!folhas.length && <p className="o-mut">Importe um PNG na categoria “spritesheets” ou “avatares” no Asset Studio primeiro.</p>}
        {asset && <>
          <Campo rotulo="Nome do personagem"><Entrada value={nome} onChange={(e) => setNome(e.target.value)} /></Campo>
          <div className="o-linha"><Campo rotulo="Largura do quadro"><Entrada type="number" min="1" value={ql} onChange={(e) => setQl(Number(e.target.value))} /></Campo><Campo rotulo="Altura do quadro"><Entrada type="number" min="1" value={qa} onChange={(e) => setQa(Number(e.target.value))} /></Campo></div>
          <p className="o-mut">{Math.floor(asset.largura / Math.max(1, ql))} coluna(s) × {Math.floor(asset.altura / Math.max(1, qa))} linha(s)</p>
          <FolhaComGrade assetId={asset.id} largura={asset.largura} altura={asset.altura} ql={ql} qa={qa} anim={anims[sel]} aoClicar={(linha, coluna) => setAnims(anims.map((a, i) => (i === sel ? { ...a, linha, quadros: a.quadros.split(/[,\s]+/).filter(Boolean).concat(String(coluna)).join(',') } : a)))} />
          <p className="o-mut">Clique em um quadro para adicioná-lo à animação selecionada.</p>
          <div className="o-linha"><Campo rotulo="Escala"><Entrada type="number" min="0.1" max="8" step="0.1" value={escala} onChange={(e) => setEscala(Number(e.target.value))} /></Campo><Campo rotulo="Velocidade de andar"><Entrada type="number" min="0.1" max="4" step="0.1" value={vel} onChange={(e) => setVel(Number(e.target.value))} /></Campo></div>
          <h5>Animações</h5>
          {anims.map((a, i) => (
            <div key={i} className={`o-anim ${i === sel ? 'on' : ''}`} onClick={() => setSel(i)}>
              <div className="o-linha"><Entrada value={a.nome} onChange={(e) => setAnims(anims.map((x, k) => (k === i ? { ...x, nome: e.target.value } : x)))} placeholder="nome" />
                <Seletor value={a.estado} onChange={(e) => setAnims(anims.map((x, k) => (k === i ? { ...x, estado: e.target.value } : x)))}><option value="">sem estado</option>{ESTADOS_ANIM.map((s) => <option key={s}>{s}</option>)}</Seletor>
                <Seletor value={a.direcao} onChange={(e) => setAnims(anims.map((x, k) => (k === i ? { ...x, direcao: e.target.value } : x)))}><option value="">qualquer direção</option>{DIRECOES.map((d) => <option key={d}>{d}</option>)}</Seletor></div>
              <div className="o-linha"><Campo rotulo="Linha"><Entrada type="number" min="0" value={a.linha} onChange={(e) => setAnims(anims.map((x, k) => (k === i ? { ...x, linha: Number(e.target.value) } : x)))} /></Campo><Campo rotulo="Quadros (ordem)"><Entrada value={a.quadros} onChange={(e) => setAnims(anims.map((x, k) => (k === i ? { ...x, quadros: e.target.value } : x)))} placeholder="0,1,2,3" /></Campo><Campo rotulo="FPS"><Entrada type="number" min="1" max="60" value={a.fps} onChange={(e) => setAnims(anims.map((x, k) => (k === i ? { ...x, fps: Number(e.target.value) } : x)))} /></Campo></div>
              <div className="o-linha"><label className="o-check"><input type="checkbox" checked={a.loop} onChange={(e) => setAnims(anims.map((x, k) => (k === i ? { ...x, loop: e.target.checked } : x)))} /> repetir</label>{i === sel && <Previa assetId={asset.id} ql={ql} qa={qa} anim={a} escala={Math.max(2, Math.round(96 / qa))} />}<Botao pequeno perigo onClick={() => { setAnims(anims.filter((_, k) => k !== i)); setSel(0); }}>Remover</Botao></div>
            </div>))}
          <div className="o-linha"><Botao pequeno onClick={() => { setAnims([...anims, { ...novaAnim(), nome: `anim ${anims.length + 1}`, estado: '' }]); setSel(anims.length); }}>+ Animação</Botao><Botao primario disabled={!nome.trim() || !anims.length} onClick={salvar}>{editId ? 'Salvar alterações' : 'Criar personagem'}</Botao>{editId && <Botao pequeno onClick={() => { setEditId(null); setNome('Novo personagem'); }}>Cancelar edição</Botao>}</div>
        </>}
      </Cartao>
      <Cartao titulo="Personagens cadastrados">
        {personagens.length ? personagens.map((p) => (
          <div key={p.id} className="o-linha o-item">
            <b>{p.nome}</b><Etiqueta cor="cinza">{p.animacoes.length} anim.</Etiqueta>
            <Botao pequeno onClick={() => carregar(p)}>Editar</Botao>
            <Botao pequeno perigo onClick={async () => { try { await api.del(`/personagens/${p.id}`); } catch (e) { aviso(erroTexto(e)); } aoMudar(); }}>Remover</Botao>
          </div>)) : <Vazio>Nenhum personagem importado. Os funcionários usam o visual provisório gerado por código até você importar um.</Vazio>}
      </Cartao>
      <Cartao titulo="Aparência dos funcionários">
        <p className="o-mut">Trocar a aparência não altera os dados do funcionário.</p>
        {agentes.map((a) => <div key={a.id} className="o-linha o-item"><b>{a.nome}</b><Seletor value={a.avatarId ?? ''} onChange={async (e) => { try { await api.post(`/agentes/${a.id}/aparencia`, { personagemId: e.target.value || null }); aviso(`Aparência de ${a.nome} atualizada`); } catch (er) { aviso(erroTexto(er)); } aoMudar(); }}><option value="">Provisório (gerado)</option>{personagens.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</Seletor></div>)}
      </Cartao>
    </div>
  );
}

function useImagem(assetId: string): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => { const i = new Image(); i.onload = () => setImg(i); i.src = urlAsset(assetId); }, [assetId]);
  return img;
}

function FolhaComGrade({ assetId, largura, altura, ql, qa, anim, aoClicar }: { assetId: string; largura: number; altura: number; ql: number; qa: number; anim?: AnimForm; aoClicar: (linha: number, coluna: number) => void }) {
  const ref = useRef<HTMLCanvasElement>(null); const img = useImagem(assetId); const esc = Math.max(1, Math.min(6, Math.floor(340 / Math.max(1, largura))));
  useEffect(() => {
    const c = ref.current; if (!c || !img) return; c.width = largura * esc; c.height = altura * esc; const g = c.getContext('2d')!; g.imageSmoothingEnabled = false; g.fillStyle = '#1b2046'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
    g.strokeStyle = 'rgba(255,255,255,.28)'; g.lineWidth = 1;
    for (let x = 0; x <= largura; x += Math.max(1, ql)) { g.beginPath(); g.moveTo(x * esc + 0.5, 0); g.lineTo(x * esc + 0.5, c.height); g.stroke(); }
    for (let y = 0; y <= altura; y += Math.max(1, qa)) { g.beginPath(); g.moveTo(0, y * esc + 0.5); g.lineTo(c.width, y * esc + 0.5); g.stroke(); }
    if (anim) { g.fillStyle = 'rgba(247,201,72,.35)'; for (const q of lerQuadros(anim.quadros)) g.fillRect(q * ql * esc, anim.linha * qa * esc, ql * esc, qa * esc); }
  }, [img, largura, altura, ql, qa, anim, esc]);
  return <div className="o-rolagem"><canvas ref={ref} className="o-folha" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); const sx = e.currentTarget.width / r.width; aoClicar(Math.floor(((e.clientY - r.top) * sx) / (qa * esc)), Math.floor(((e.clientX - r.left) * sx) / (ql * esc))); }} /></div>;
}

function Previa({ assetId, ql, qa, anim, escala }: { assetId: string; ql: number; qa: number; anim: AnimForm; escala: number }) {
  const ref = useRef<HTMLCanvasElement>(null); const img = useImagem(assetId);
  useEffect(() => {
    const c = ref.current; if (!c || !img) return; const q = lerQuadros(anim.quadros); if (!q.length) return; c.width = ql * escala; c.height = qa * escala; const g = c.getContext('2d')!; g.imageSmoothingEnabled = false;
    let i = 0; const desenhar = (): void => { g.clearRect(0, 0, c.width, c.height); g.drawImage(img, q[i % q.length] * ql, anim.linha * qa, ql, qa, 0, 0, c.width, c.height); i = anim.loop ? i + 1 : Math.min(i + 1, q.length - 1); };
    desenhar(); const t = setInterval(desenhar, 1000 / Math.max(1, anim.fps)); return () => clearInterval(t);
  }, [img, ql, qa, anim, escala]);
  return <canvas ref={ref} className="o-previa" title="Pré-visualização em loop" />;
}
