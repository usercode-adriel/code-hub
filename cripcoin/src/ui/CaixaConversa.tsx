// CAIXA DE CONVERSA (canto da tela): o jogador escreve e as personagens respondem com balão sobre a cabeça, uma de cada vez.
import { useEffect, useState } from 'react';
import type { Jogo } from '../nucleo/jogo';
import { useJogo } from './comum';

export function CaixaConversa({ jogo }: { jogo: Jogo }) {
  useJogo(jogo); const [txt, setTxt] = useState(''); const [aberta, setAberta] = useState(() => typeof window === 'undefined' || window.innerWidth > 760); const p = jogo.p; const c = jogo.conversa; const pres = c.presentes();
  const linhas = Object.entries(p.conversas ?? {}).flatMap(([fid, l]) => l.map((m) => ({ ...m, quem: m.de === 'eu' ? 'Você' : m.quem ?? p.funcionarios.find((f) => f.id === fid)?.nome ?? '?', fid }))).sort((a, b) => a.em - b.em).slice(-6);
  const [fonte, setFonte] = useState('');
  useEffect(() => { const t = localStorage.getItem('codeniac.token'); if (!t) { setFonte('sem login no Hub'); return; } fetch('/api/cripcoin/ia', { headers: { Authorization: `Bearer ${t}` } }).then((r) => r.json()).then((j: { fonte?: string }) => setFonte({ nuvem: 'IA da nuvem', ollama: 'Ollama (local)', gratis: 'IA gratuita', nenhuma: 'sem IA' }[j.fonte ?? ''] ?? '')).catch(() => setFonte('')); }, []);
  const dorm = c.dormindo().length;
  const enviar = (): void => { const r = c.enviar(txt); if (r.ok) setTxt(''); else jogo.aviso(r.motivo, 'erro'); };
  return (
    <div className="chat" data-testid="chat">
      <div className="chat-topo"><span>💬 Conversar {pres.length ? `(${pres.length} na mesa)` : ''}{dorm ? ` · ${dorm} dormindo` : ''}{fonte && <small className="dim" data-testid="chat-ia"> · {fonte}</small>}</span><button onClick={() => setAberta(!aberta)} aria-label="Minimizar">{aberta ? '▾' : '▴'}</button></div>
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
