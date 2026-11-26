// CAIXA DE CONVERSA (canto da tela): o jogador escreve e as personagens respondem com balão sobre a cabeça, uma de cada vez.
import { useState } from 'react';
import type { Jogo } from '../nucleo/jogo';
import { useJogo } from './comum';

export function CaixaConversa({ jogo }: { jogo: Jogo }) {
  useJogo(jogo); const [txt, setTxt] = useState(''); const [aberta, setAberta] = useState(true); const p = jogo.p; const c = jogo.conversa; const pres = c.presentes();
  const linhas = Object.entries(p.conversas ?? {}).flatMap(([fid, l]) => l.map((m) => ({ ...m, quem: m.de === 'eu' ? 'Você' : p.funcionarios.find((f) => f.id === fid)?.nome ?? '?', fid }))).sort((a, b) => a.em - b.em).slice(-4);
  const enviar = (): void => { const r = c.enviar(txt); if (r.ok) setTxt(''); else jogo.aviso(r.motivo, 'erro'); };
  return (
    <div className="chat" data-testid="chat">
      <div className="chat-topo"><span>💬 Conversar {pres.length ? `(${pres.length} na mesa)` : ''}</span><button onClick={() => setAberta(!aberta)} aria-label="Minimizar">{aberta ? '▾' : '▴'}</button></div>
      {aberta && (<>
        <div className="chat-log" data-testid="chat-log">
          {linhas.length === 0 && <div className="dim">{pres.length ? 'Diga algo. Cite o nome para falar só com uma pessoa.' : 'Contrate alguém e monte uma estação (mesa + cadeira + computador) para conversar.'}</div>}
          {linhas.map((m, i) => <div key={i} className={m.de === 'eu' ? 'chat-eu' : 'chat-ela'}><b>{m.quem}:</b> {m.texto}</div>)}
          {c.status && <div className="dim" data-testid="chat-status">{c.status}</div>}
        </div>
        <div className="linha" style={{ flexWrap: 'nowrap', margin: 0 }}>
          <input value={txt} maxLength={300} onChange={(e) => setTxt(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') enviar(); }} placeholder="Escreva para a equipe..." data-testid="chat-input" />
          <button className="primario" onClick={enviar} disabled={!txt.trim()} data-testid="chat-enviar">Enviar</button>
        </div>
      </>)}
    </div>
  );
}
