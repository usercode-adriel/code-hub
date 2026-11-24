// Event Bus tipado: todo evento do jogo é declarado em GameEvents. Emitir ou ouvir um evento
// que não está no mapa é erro de compilação. Os engines conversam por aqui, sem se importar entre si.
export interface GameEvents {
  'sector:loaded': { sx: number; sy: number };
  'sector:unloaded': { sx: number; sy: number };
  'player:moved': { x: number; y: number; dir: number };
  'frame:stats': FrameStats;
}

export interface FrameStats {
  fps: number;
  frameMs: number;
  sectors: number;
  sprites: number;
  heapMb: number | null;
}

type Handler<T> = (payload: T) => void;

export class EventBus<E extends object = GameEvents> {
  private handlers = new Map<keyof E, Set<Handler<never>>>();

  on<K extends keyof E>(type: K, handler: Handler<E[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) { set = new Set(); this.handlers.set(type, set); }
    set.add(handler as Handler<never>);
    return () => this.off(type, handler);
  }

  off<K extends keyof E>(type: K, handler: Handler<E[K]>): void {
    this.handlers.get(type)?.delete(handler as Handler<never>);
  }

  emit<K extends keyof E>(type: K, payload: E[K]): void {
    const set = this.handlers.get(type);
    if (!set) return;
    // cópia: um handler pode se remover durante a emissão
    for (const h of [...set]) (h as Handler<E[K]>)(payload);
  }

  listenerCount<K extends keyof E>(type: K): number {
    return this.handlers.get(type)?.size ?? 0;
  }
}
