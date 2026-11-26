import { useEffect, useReducer, type ReactNode } from 'react';
import type { Jogo } from '../nucleo/jogo';

/** Faz o componente redesenhar quando o jogo muda (tempo, saldo, objetos...). */
export function useJogo(j: Jogo | null): void { const [, f] = useReducer((x: number) => x + 1, 0); useEffect(() => (j ? j.assinar(f) : undefined), [j]); }
export const cc = (v: number): string => `${Number.isInteger(v) ? v : v.toFixed(1)} CC`;
export function Janela({ titulo, onFechar, children, largura = 520, classe = '' }: { titulo: string; onFechar: () => void; children: ReactNode; largura?: number; classe?: string }) {
  return (
    <div className="veu" onMouseDown={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className={`janela ${classe}`} style={{ width: largura }} role="dialog" aria-label={titulo}>
        <div className="jan-barra"><span>{titulo}</span><button className="x" onClick={onFechar} aria-label="Fechar">✕</button></div>
        <div className="jan-corpo">{children}</div>
      </div>
    </div>
  );
}
export function Confirmar({ texto, onSim, onNao, sim = 'Confirmar' }: { texto: string; onSim: () => void; onNao: () => void; sim?: string }) {
  return (<Janela titulo="Confirmação" onFechar={onNao} largura={380}><p>{texto}</p><div className="linha dir"><button onClick={onNao}>Cancelar</button><button className="primario" onClick={onSim}>{sim}</button></div></Janela>);
}
