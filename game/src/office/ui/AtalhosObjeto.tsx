// ATALHOS DO ELEMENTO (estilo The Sims): ao clicar em um objeto no modo de construção/edição, uma barrinha flutua sobre ele com
// duplicar, apagar, tamanho (− / +), girar e camadas (frente/trás). Segue o objeto quando a câmera se move.
import { useEffect, useRef } from 'react';
import type { Construtor, EstadoConstrutor } from '../construtor';
import type { OfficeEngine } from '../engine';
import type { Layout } from '../modelo';

export function AtalhosObjeto({ motor, c, e, layout }: { motor: OfficeEngine; c: Construtor; e: EstadoConstrutor; layout: Layout }) {
  const ref = useRef<HTMLDivElement>(null); const id = e.selecionadoId; const obj = layout.objetos.find((o) => o.id === id) ?? null;
  useEffect(() => {
    if (!id) return; let raf = 0;
    const laco = (): void => {
      raf = requestAnimationFrame(laco); const el = ref.current; const a = motor.ancoraObjeto(id); if (!el || !a) return;
      const W = motor.camera.viewW; const H = motor.camera.viewH; const w = el.offsetWidth; const h = el.offsetHeight;
      const x = Math.min(Math.max(6, a.x - w / 2), Math.max(6, W - w - 6)); const y = Math.min(Math.max(58, a.y - h - 10), Math.max(58, H - h - 70));
      el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`; el.style.visibility = a.x < -20 || a.x > W + 20 ? 'hidden' : 'visible';
    };
    raf = requestAnimationFrame(laco); return () => cancelAnimationFrame(raf);
  }, [motor, id]);
  if (!id || !obj) return null;
  const esc = obj.escala ?? 1; const bt = (rot: string, titulo: string, fn: () => void, extra = '') => <button type="button" className={`o-atalho ${extra}`} title={titulo} aria-label={titulo} onPointerDown={(ev) => ev.stopPropagation()} onClick={fn}>{rot}</button>;
  return (
    <div ref={ref} className="o-atalhos" data-testid="atalhos-objeto" role="toolbar" aria-label="Atalhos do elemento">
      {bt('⧉', 'Duplicar', () => c.duplicarSelecionado())}
      {bt('−', 'Diminuir', () => c.escalarSelecionado(-0.1))}<span className="o-atalho-esc" title="Tamanho">{Math.round(esc * 100)}%</span>{bt('+', 'Aumentar', () => c.escalarSelecionado(0.1))}
      {bt('↻', 'Girar / espelhar', () => c.girarSelecionado())}
      {bt('▲', 'Trazer para frente', () => c.camadaSelecionado(1))}{bt('▼', 'Enviar para trás', () => c.camadaSelecionado(-1))}
      {bt('🗑', 'Apagar', () => c.removerSelecionado(), 'per')}
    </div>
  );
}
