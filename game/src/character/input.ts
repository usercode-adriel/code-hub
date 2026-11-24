// Entrada: estado das teclas, separado do DOM para ser testável. O vínculo com o teclado fica em bindKeyboard.
export class InputState {
  private down = new Set<string>();
  press(code: string): void { this.down.add(code); }
  release(code: string): void { this.down.delete(code); }
  clear(): void { this.down.clear(); }
  private any(...codes: string[]): boolean { return codes.some((c) => this.down.has(c)); }

  /** vetor de movimento: componentes em -1, 0 ou 1 (a normalização é feita por quem usa) */
  axis(): { x: number; y: number } {
    const x = (this.any('KeyD', 'ArrowRight') ? 1 : 0) - (this.any('KeyA', 'ArrowLeft') ? 1 : 0);
    const y = (this.any('KeyS', 'ArrowDown') ? 1 : 0) - (this.any('KeyW', 'ArrowUp') ? 1 : 0);
    return { x, y };
  }
  get run(): boolean { return this.any('ShiftLeft', 'ShiftRight'); }
}

export function bindKeyboard(input: InputState, target: Window = window, extra?: (code: string) => void): () => void {
  const keys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight']);
  const down = (e: KeyboardEvent) => { if (keys.has(e.code)) { input.press(e.code); e.preventDefault(); } else extra?.(e.code); };
  const up = (e: KeyboardEvent) => input.release(e.code);
  const blur = () => input.clear();
  target.addEventListener('keydown', down);
  target.addEventListener('keyup', up);
  target.addEventListener('blur', blur);
  return () => { target.removeEventListener('keydown', down); target.removeEventListener('keyup', up); target.removeEventListener('blur', blur); };
}
