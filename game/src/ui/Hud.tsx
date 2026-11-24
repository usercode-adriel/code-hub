// HUD em React: só mostra dados. Recebe tudo pelo Event Bus; não toca no estado do jogo.
import { useEffect, useState } from 'react';
import type { EventBus, FrameStats } from '../core/eventBus';
import { DIR_NAMES } from '../character/direction';

export function Hud({ bus }: { bus: EventBus }) {
  const [stats, setStats] = useState<FrameStats | null>(null);
  const [pos, setPos] = useState({ x: 0, y: 0, dir: 0 });
  useEffect(() => {
    const a = bus.on('frame:stats', setStats);
    const b = bus.on('player:moved', setPos);
    return () => { a(); b(); };
  }, [bus]);
  return (
    <div className="hud" data-testid="hud">
      <div>{stats ? `${stats.fps} FPS · ${stats.frameMs} ms` : '…'}</div>
      <div>{stats ? `${stats.sectors} setores · ${stats.sprites} sprites${stats.heapMb !== null ? ` · ${stats.heapMb} MB` : ''}` : ''}</div>
      <div>{`x ${Math.round(pos.x)} · y ${Math.round(pos.y)} · ${DIR_NAMES[pos.dir]}`}</div>
      <div className="hud-help">WASD / setas · Shift corre · +/− zoom</div>
    </div>
  );
}
