// PAINEL DE PROPRIEDADES do objeto selecionado: dimensões, escala (com trava de proporção), posição, superfície/parede, rotação e ações.
import { useState } from 'react';
import { precoVenda } from '../dados/catalogo';
import { item } from '../dados/catalogo';
import { ART_POR_TILE, dimSprite } from '../dados/propriedades';
import type { Jogo } from '../nucleo/jogo';
import { ajustarAltura, mover, posicionarNaSuperficie, redimensionar, restaurarTamanho } from '../nucleo/mapa';
import { apoioDe, escalaIndividual, escalaVisual, retSprite, spriteDe } from '../nucleo/superficie';
import { duplicarObjeto } from '../sistemas/economia';
import { cc } from './comum';

const r2 = (n: number): number => Math.round(n * 100) / 100;
export function Propriedades({ jogo, id, guardar, vender, fechar }: { jogo: Jogo; id: string; guardar: () => void; vender: () => void; fechar: () => void }) {
  const p = jogo.p; const o = p.objetos.find((q) => q.id === id); const d = o && item(o.def); const [, forcar] = useState(0);
  if (!o || !d) return null;
  const travar = o.travar ?? true; const e = escalaIndividual(o, d); const sv = escalaVisual(o, d); const r = retSprite(p, o, d); const sup = apoioDe(p, o);
  const nat = dimSprite(spriteDe(d, o.rot).nome); const ok = (v: { ok: boolean; motivo: string }, msg: string): void => { jogo.aviso(v.ok ? msg : v.motivo, v.ok ? 'ok' : 'erro'); if (v.ok) jogo.mudou(); else forcar((n) => n + 1); };
  const aplicar = (ex: number, ey: number): void => ok(redimensionar(p, o.id, r2(ex), r2(ey), travar), 'Tamanho atualizado.');
  const passo = (f: number): void => aplicar(e.ex * f, travar ? e.ey * f : e.ey);
  const setEx = (v: number): void => { if (!(v > 0)) return; aplicar(v, travar ? v * (e.ey / e.ex) : e.ey); };
  const setEy = (v: number): void => { if (!(v > 0)) return; aplicar(travar ? v * (e.ex / e.ey) : e.ex, v); };
  const setLargura = (t: number): void => { if (!(t > 0)) return; setEx(t / ((nat.w / ART_POR_TILE) * d.escala.padrao)); };
  const setAltura = (t: number): void => { if (!(t > 0)) return; setEy(t / ((nat.h / ART_POR_TILE) * d.escala.padrao)); };
  const pos = (nivel: number, u: number, v: number): void => ok(posicionarNaSuperficie(p, o.id, nivel, u, v), 'Posição ajustada.');
  const niveis = sup ? item(sup.def)?.superficie?.niveis.length ?? 1 : 1;
  return (
    <div className="cartao" data-testid="sel-info">
      <div className="linha"><b className="ouro grow">{d.nome}</b><button onClick={fechar} title="Fechar">✕</button></div>
      <div className="dim">{d.descricao}</div>
      <div className="dim">Camada: {d.camada}{sup ? ` · sobre ${item(sup.def)?.nome}` : ''} · {d.solido ? 'sólido' : 'passável'} · venda {cc(precoVenda(d))}</div>
      <h3>Dimensões</h3>
      <div className="linha"><label style={{ margin: 0, width: 60 }}>Largura</label><input type="number" step="0.05" min="0.05" value={r2(r.w)} onChange={(ev) => setLargura(Number(ev.target.value))} data-testid="prop-largura" style={{ width: 70 }} /><span className="dim">tiles</span></div>
      <div className="linha"><label style={{ margin: 0, width: 60 }}>Altura</label><input type="number" step="0.05" min="0.05" value={r2(r.h)} onChange={(ev) => setAltura(Number(ev.target.value))} data-testid="prop-altura" style={{ width: 70 }} /><span className="dim">tiles</span></div>
      <div className="linha" style={{ flexWrap: "nowrap" }}><label style={{ margin: 0, width: 60 }}>Escala H</label><input type="number" step="0.05" value={r2(e.ex)} onChange={(ev) => setEx(Number(ev.target.value))} data-testid="prop-escala-x" style={{ width: 70 }} />
        <label style={{ margin: 0 }}>V</label><input type="number" step="0.05" value={r2(e.ey)} onChange={(ev) => setEy(Number(ev.target.value))} data-testid="prop-escala-y" style={{ width: 70 }} /></div>
      <div className="dim">Escala final {sv.sx.toFixed(2)}×{sv.sy.toFixed(2)} (padrão do asset {d.escala.padrao}×; limites {d.escala.min}–{d.escala.max}×)</div>
      <div className="linha"><button onClick={() => passo(0.9)} data-testid="prop-menos">− Menor</button><button onClick={() => passo(1.1)} data-testid="prop-mais">+ Maior</button><button onClick={() => ok(restaurarTamanho(p, o.id), 'Tamanho original restaurado.')} data-testid="prop-restaurar">Restaurar</button></div>
      <label style={{ margin: 0 }}><input type="checkbox" style={{ width: 'auto' }} checked={travar} onChange={(ev) => { o.travar = ev.target.checked; jogo.emitir(); forcar((n) => n + 1); }} /> Travar proporção</label>
      <h3>Posição</h3>
      {d.camada === 'sobre' && sup && (<>
        {niveis > 1 && <div className="linha"><label style={{ margin: 0, width: 60 }}>Nível</label><select value={o.nivel ?? 0} onChange={(ev) => pos(Number(ev.target.value), o.u ?? 0.5, o.v ?? 0.5)}>{Array.from({ length: niveis }, (_, i) => <option key={i} value={i}>{i === 0 ? 'Topo' : `Prateleira ${i}`}</option>)}</select></div>}
        <div className="linha"><label style={{ margin: 0, width: 60 }}>Lateral</label><input type="range" min="0" max="100" value={Math.round((o.u ?? 0.5) * 100)} onChange={(ev) => pos(o.nivel ?? 0, Number(ev.target.value) / 100, o.v ?? 0.5)} data-testid="prop-u" /></div>
        <div className="linha"><label style={{ margin: 0, width: 60 }}>Fundo</label><input type="range" min="0" max="100" value={Math.round((o.v ?? 0.5) * 100)} onChange={(ev) => pos(o.nivel ?? 0, o.u ?? 0.5, Number(ev.target.value) / 100)} data-testid="prop-v" /></div></>)}
      {d.camada === 'parede' && <div className="linha"><label style={{ margin: 0, width: 60 }}>Altura</label><input type="range" min="0" max="100" value={Math.round((o.alt ?? 0.6) * 100)} onChange={(ev) => ok(ajustarAltura(p, o.id, Number(ev.target.value) / 100), 'Altura na parede ajustada.')} data-testid="prop-alt" /></div>}
      {d.camada !== 'sobre' && <div className="linha"><label style={{ margin: 0, width: 60 }}>X, Y</label><input type="number" value={o.x} style={{ width: 60 }} onChange={(ev) => ok(mover(p, o.id, Number(ev.target.value), o.y), 'Movido.')} data-testid="prop-x" /><input type="number" value={o.y} style={{ width: 60 }} onChange={(ev) => ok(mover(p, o.id, o.x, Number(ev.target.value)), 'Movido.')} data-testid="prop-y" /><span className="dim">célula</span></div>}
      <div className="dim">Rotação: {o.rot * 90}°{d.girar ? '' : ' (este asset não gira)'}</div>
      <div className="linha"><button disabled={!d.girar} onClick={() => ok(mover(p, o.id, o.x, o.y, (o.rot + 1) % 4), 'Objeto girado.')}>↻ Girar (R)</button><button onClick={() => { const v = duplicarObjeto(p, o.id); jogo.aviso(v.motivo, v.ok ? 'ok' : 'erro'); if (v.ok) jogo.mudou(); }} data-testid="prop-duplicar">Duplicar</button></div>
      <div className="linha"><button onClick={guardar}>Guardar</button><button className="perigo" onClick={vender}>Vender</button><button className="primario" onClick={() => { jogo.salvar(); jogo.aviso('Alterações salvas.', 'ok'); }} data-testid="prop-salvar">Salvar</button></div>
      <div className="dim">Arraste o objeto para mover; arraste as alças amarelas nos cantos para redimensionar. A cruz rosa é o ponto de ancoragem.</div>
    </div>
  );
}
