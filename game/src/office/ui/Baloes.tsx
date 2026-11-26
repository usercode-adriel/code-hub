// NUVENS DE DIÁLOGO sobre os personagens. Cada fala vem da comunicação interna REAL (mensagens persistidas pelo servidor).
// Regras: aparecem acima do avatar certo, seguem a câmera, não saem da tela, não se sobrepõem, entram/saem suavemente,
// têm duração ajustável e estilos por tipo (conversa, ideia, pergunta, alerta, discordância, conclusão).
import { useEffect, useRef, useState } from 'react';
import type { OfficeEngine } from '../engine';
import type { Mensagem, TipoMensagem } from './api';

const ICONE: Partial<Record<TipoMensagem, string>> = { ideia: '💡', pergunta: '❓', alerta: '⚠️', discordancia: '✋', conclusao: '✅' };
const TOPO = 62;                                             // abaixo da barra superior do escritório
interface Ativo { chave: string; m: Mensagem; inicio: number; fim: number; saindo: boolean }

/** Quais mensagens viram nuvem: falas de agentes (não a ordem do chefe nem avisos do sistema). */
export const viraBalao = (m: Mensagem): boolean => m.de !== 'chefe' && m.de !== 'sistema' && m.tipo !== 'ordem' && m.tipo !== 'sistema';
export const duracaoBalao = (texto: string, base: number): number => (base + Math.min(8, texto.length * 0.04)) * 1000;

export function Baloes({ motor, novas, segundos, mostrarNome = true }: { motor: OfficeEngine | null; novas: Mensagem[]; segundos: number; mostrarNome?: boolean }) {
  const [ativos, setAtivos] = useState<Ativo[]>([]); const fila = useRef<Mensagem[]>([]); const ultimoInicio = useRef(0); const refs = useRef(new Map<string, HTMLDivElement>()); const vistas = useRef(new Set<string>());
  const seg = useRef(segundos); seg.current = segundos;

  // entrada: cada agente mostra uma fala por vez (as seguintes esperam na fila dele), com no máximo 3 na fila
  useEffect(() => {
    const novasValidas = novas.filter((m) => viraBalao(m) && !vistas.current.has(m.id)); if (!novasValidas.length) return;
    for (const m of novasValidas) { vistas.current.add(m.id); fila.current.push(m); }
    if (fila.current.length > 12) fila.current.splice(0, fila.current.length - 12);
    promover();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [novas]);

  // saída FIFO global: uma fala nova no máximo a cada 0,9 s, e cada agente mostra uma nuvem por vez (a seguinte espera a vez dele)
  const promover = (): void => {
    setAtivos((atual) => {
      const agora = performance.now(); const prox = atual.filter((a) => a.fim + 350 > agora); let mudou = prox.length !== atual.length;
      if (agora - ultimoInicio.current >= 900) {
        const i = fila.current.findIndex((m) => !prox.some((a) => a.m.de === m.de && !a.saindo));
        if (i >= 0) { const [m] = fila.current.splice(i, 1); prox.push({ chave: m.id, m, inicio: agora, fim: agora + duracaoBalao(m.texto, seg.current), saindo: false }); ultimoInicio.current = agora; mudou = true; }
      }
      return mudou ? prox : atual;
    });
  };
  // relógio: marca saída (animação) e libera a vez do próximo da fila
  useEffect(() => {
    const t = setInterval(() => {
      const agora = performance.now();
      setAtivos((a) => { let mudou = false; const r = a.map((x) => { if (!x.saindo && agora > x.fim) { mudou = true; return { ...x, saindo: true }; } return x; }); return mudou ? r : a; });
      promover();
    }, 250);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // posicionamento a cada quadro, direto no DOM (sem re-render): âncora do personagem, limites da tela e anti-sobreposição
  useEffect(() => {
    let raf = 0;
    const laco = (): void => {
      raf = requestAnimationFrame(laco); if (!motor) return;
      const W = motor.camera.viewW; const H = motor.camera.viewH; const colocados: { x: number; y: number; w: number; h: number }[] = [];
      const lista = [...refs.current.entries()].map(([k, el]) => ({ k, el, an: motor.ancoras.get(el.dataset.agente ?? '') })).filter((x) => x.an).sort((a, b) => a.an!.y - b.an!.y);
      for (const { el, an } of lista) {
        const w = el.offsetWidth; const h = el.offsetHeight; let x = Math.min(Math.max(8, an!.x - w / 2), Math.max(8, W - w - 8)); let y = Math.min(Math.max(TOPO, an!.y - h - 12), Math.max(TOPO, H - h - 8));
        for (let i = 0; i < 8; i++) { const c = colocados.find((r) => x < r.x + r.w + 6 && x + w + 6 > r.x && y < r.y + r.h + 6 && y + h + 6 > r.y); if (!c) break; y = c.y - h - 6; if (y < TOPO) { y = TOPO; x = c.x + c.w + 8 > W - w - 8 ? Math.max(8, c.x - w - 8) : c.x + c.w + 8; } }
        colocados.push({ x, y, w, h }); el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`; el.style.setProperty('--cauda', `${Math.round(Math.min(Math.max(14, an!.x - x), w - 14))}px`);
        el.style.visibility = an!.x < -40 || an!.x > W + 40 || an!.y < -40 || an!.y > H + 80 ? 'hidden' : 'visible';
      }
    };
    raf = requestAnimationFrame(laco); return () => cancelAnimationFrame(raf);
  }, [motor]);

  return (
    <div className="o-baloes" aria-live="polite">
      {ativos.map((a) => (
        <div key={a.chave} ref={(el) => { if (el) refs.current.set(a.chave, el); else refs.current.delete(a.chave); }} data-agente={a.m.de} data-testid="balao" data-tipo={a.m.tipo} className={`o-balao t-${a.m.tipo} ${a.saindo ? 'saindo' : 'entra'}`}>
          {mostrarNome && <b className="o-balao-nome">{ICONE[a.m.tipo] ? `${ICONE[a.m.tipo]} ` : ''}{a.m.deNome}{a.m.paraNome ? ` → ${a.m.paraNome}` : ''}</b>}
          <span>{a.m.texto}</span>
        </div>
      ))}
    </div>
  );
}
